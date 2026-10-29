use serde_json::Value;
use std::path::{Path, PathBuf};
use std::sync::{atomic::{AtomicBool, Ordering}, mpsc, Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, WebviewWindow};
use windows::Win32::Foundation::{CloseHandle, HWND, STILL_ACTIVE};
use windows::Win32::System::Threading::{OpenProcess, GetExitCodeProcess, PROCESS_QUERY_LIMITED_INFORMATION};
use windows::Win32::UI::WindowsAndMessaging::{GetWindowDisplayAffinity, WDA_EXCLUDEFROMCAPTURE, WDA_NONE};

pub type Capture = Arc<CaptureState>;
pub struct CaptureState {
    worker_live: AtomicBool,
    protection: Mutex<Protection>,
    lock: Option<PathBuf>,
}
struct Protection { wanted: bool, applied: Option<bool>, requested: Option<Instant> }

impl CaptureState {
    pub fn new(home: Option<PathBuf>) -> Self {
        Self { worker_live: AtomicBool::new(false),
            protection: Mutex::new(Protection { wanted: false, applied: Some(false), requested: None }),
            lock: home.map(|home| home.join(".codex-delegate").join("computer-use.lock")) }
    }

    pub fn request(self: &Arc<Self>, win: &WebviewWindow) -> Result<(), String> {
        self.protection.lock().unwrap().requested = Some(Instant::now());
        self.refresh(win, true)
    }

    // This method is UI-thread-only. No mutex is held while waiting for UI
    // dispatch, so a show can safely verify affinity in its final UI callback.
    pub fn refresh_now(&self, win: &WebviewWindow, verify: bool) -> Result<(), String> {
        let mut protection = self.protection.lock().unwrap();
        let wanted = self.worker_live.load(Ordering::Acquire)
            || self.lock.as_deref().is_some_and(lock_live)
            || protection.requested.is_some_and(|at| at.elapsed() < Duration::from_secs(2));
        protection.wanted = wanted;
        if verify || Some(wanted) != protection.applied {
            // A timed-out UI dispatch can still run later. Retry unknown
            // affinity so a delayed request cannot leave protection stuck on.
            let result = apply_now(win, wanted);
            protection.applied = result.as_ref().ok().map(|()| wanted);
            result?;
        }
        Ok(())
    }

    pub fn refresh(self: &Arc<Self>, win: &WebviewWindow, verify: bool) -> Result<(), String> {
        let (send, receive) = mpsc::sync_channel(1);
        let window = win.clone();
        let state = self.clone();
        win.run_on_main_thread(move || {
            let _ = send.send(state.refresh_now(&window, verify));
        }).map_err(|e| e.to_string())?;
        receive.recv_timeout(Duration::from_millis(750)).map_err(|e| e.to_string())?
    }
}

#[tauri::command]
pub fn computer_use_live(app: AppHandle, live: bool, state: tauri::State<Capture>) {
    if state.worker_live.swap(live, Ordering::AcqRel) != live {
        app.state::<crate::show::Visibility>().retry(&app);
    }
}

fn read_record(path: PathBuf) -> Option<Value> {
    serde_json::from_slice(&std::fs::read(path).ok()?).ok()
}

fn lock_live(lock: &Path) -> bool {
    let Some(holder) = read_record(lock.join("holder.json")) else { return false };
    let Some(token) = holder["token"].as_str().filter(|token| !token.is_empty()) else { return false };
    if process_live(&holder["runnerPid"]) { return true; }
    read_record(lock.join("child.json")).is_some_and(|child|
        child["token"].as_str() == Some(token) && process_live(&child["childPid"]))
}

fn process_live(pid: &Value) -> bool {
    let Some(pid) = pid.as_u64().and_then(|pid| u32::try_from(pid).ok()).filter(|pid| *pid > 0)
        else { return false };
    unsafe {
        let Ok(handle) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) else { return false };
        let mut code = 0;
        let live = GetExitCodeProcess(handle, &mut code).is_ok() && code == STILL_ACTIVE.0 as u32;
        let _ = CloseHandle(handle);
        live
    }
}

// On the UI thread Tauri setters execute synchronously. Verify the Win32
// affinity after applying it, before either an acknowledgement or a show.
fn apply_now(window: &WebviewWindow, protected: bool) -> Result<(), String> {
    let own = HWND(window.hwnd().map_err(|e| e.to_string())?.0 as _);
    let expected = if protected { WDA_EXCLUDEFROMCAPTURE } else { WDA_NONE };
    let affinity = || -> Result<u32, String> {
        let mut affinity = 0;
        unsafe { GetWindowDisplayAffinity(own, &mut affinity).map_err(|e| e.to_string())?; }
        Ok(affinity)
    };
    window.set_content_protected(protected).map_err(|e| e.to_string())?;
    if protected && affinity()? != expected.0 {
        // Windows refuses to turn affinity on for a layered window
        // (ERROR_NOT_ENOUGH_MEMORY), and click-through makes the strip
        // layered. Drop it for the call; this UI thread handles no input
        // meanwhile, and the affinity stays when click-through returns.
        window.set_ignore_cursor_events(false).map_err(|e| e.to_string())?;
        let applied = window.set_content_protected(true);
        window.set_ignore_cursor_events(true).map_err(|e| e.to_string())?;
        applied.map_err(|e| e.to_string())?;
    }
    if affinity()? != expected.0 { return Err("capture affinity was not applied".into()); }
    Ok(())
}

pub fn watch(win: WebviewWindow, state: Capture) {
    let mut previous = None;
    loop {
        let _ = state.refresh(&win, false);
        let status = {
            let protection = state.protection.lock().unwrap();
            (protection.wanted, protection.applied, protection.requested)
        };
        if previous != Some(status) {
            win.state::<crate::show::Visibility>().retry(win.app_handle());
            previous = Some(status);
        }
        std::thread::sleep(Duration::from_millis(500));
    }
}
