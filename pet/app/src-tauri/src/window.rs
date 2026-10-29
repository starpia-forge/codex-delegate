use std::sync::{atomic::{AtomicBool, AtomicUsize, Ordering}, Arc};
use std::time::Duration;
use tauri::{Emitter, WebviewWindow};
use windows::Win32::Foundation::{HWND, POINT, RECT};
use windows::Win32::Graphics::Gdi::{GetMonitorInfoW, MonitorFromPoint, MonitorFromWindow,
    MONITORINFO, MONITOR_DEFAULTTOPRIMARY, MONITOR_DEFAULTTONULL};
use windows::Win32::UI::WindowsAndMessaging::{GetClassNameW, GetDesktopWindow,
    GetForegroundWindow, GetShellWindow, GetWindowLongW, GetWindowRect, SetWindowPos,
    GWL_STYLE, HWND_NOTOPMOST, HWND_TOPMOST, SWP_NOMOVE, SWP_NOSIZE, SWP_NOACTIVATE, WS_CAPTION};

// Its own type: Tauri manages one state per type, and `Ready` is also an `Arc<AtomicBool>`.
#[derive(Clone, Default)]
pub struct Fullscreen {
    paused: Arc<AtomicBool>,
    foreground: Arc<AtomicUsize>,
}

#[tauri::command]
pub fn fullscreen_paused(state: tauri::State<Fullscreen>) -> bool {
    state.paused.load(Ordering::Acquire)
}

// Monitor bounds and window rectangles are physical pixels. A captioned,
// maximized window (including with an auto-hide taskbar) is never fullscreen.
unsafe fn fullscreen(foreground: HWND, own: HWND) -> bool {
    if foreground.0.is_null() || foreground == own || foreground == GetDesktopWindow()
        || foreground == GetShellWindow() { return false; }
    let mut class = [0u16; 256];
    let len = GetClassNameW(foreground, &mut class);
    if matches!(String::from_utf16_lossy(&class[..len as usize]).as_str(),
        "Shell_TrayWnd" | "Shell_SecondaryTrayWnd" | "Progman" | "WorkerW") { return false; }
    if GetWindowLongW(foreground, GWL_STYLE) as u32 & WS_CAPTION.0 != 0 { return false; }
    let primary = MonitorFromPoint(POINT { x: 0, y: 0 }, MONITOR_DEFAULTTOPRIMARY);
    if MonitorFromWindow(foreground, MONITOR_DEFAULTTONULL) != primary { return false; }
    let mut info = MONITORINFO { cbSize: std::mem::size_of::<MONITORINFO>() as u32,
        ..Default::default() };
    let mut rect = RECT::default();
    if !GetMonitorInfoW(primary, &mut info).as_bool() || GetWindowRect(foreground, &mut rect).is_err() {
        return false;
    }
    rect.left <= info.rcMonitor.left && rect.top <= info.rcMonitor.top
        && rect.right >= info.rcMonitor.right && rect.bottom >= info.rcMonitor.bottom
}

// Call on the UI thread, including immediately before a show. Watcher updates
// use the same thread so they cannot race the coordinator's z-order decision.
pub fn refresh(win: &WebviewWindow, state: &Fullscreen, force: bool) -> Result<(), String> {
    crate::place_strip(win);
    let own = HWND(win.hwnd().map_err(|e| e.to_string())?.0 as _);
    unsafe {
        let foreground = GetForegroundWindow();
        let paused = fullscreen(foreground, own);
        let was_paused = state.paused.swap(paused, Ordering::AcqRel);
        let last_fg = state.foreground.swap(foreground.0 as usize, Ordering::AcqRel);
        // Keep Tauri's window flags in sync with native z-order, too: show and
        // click-through setters must not restore a stale always-on-top style.
        if force || paused != was_paused {
            win.set_always_on_top(!paused).map_err(|e| e.to_string())?;
        }
        let flags = SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE;
        if paused {
            // Dropping topmost alone leaves the strip above the app.
            SetWindowPos(own, Some(HWND_NOTOPMOST), 0, 0, 0, 0, flags).map_err(|e| e.to_string())?;
            SetWindowPos(own, Some(foreground), 0, 0, 0, 0, flags).map_err(|e| e.to_string())?;
        } else if force || was_paused || foreground.0 as usize != last_fg {
            SetWindowPos(own, Some(HWND_TOPMOST), 0, 0, 0, 0, flags).map_err(|e| e.to_string())?;
        }
        if paused != was_paused { let _ = win.emit("pet-fullscreen", paused); }
    }
    Ok(())
}

pub fn watch(win: WebviewWindow, state: Fullscreen) {
    let queued = Arc::new(AtomicBool::new(false));
    loop {
        if !queued.swap(true, Ordering::AcqRel) {
            let window = win.clone();
            let fullscreen = state.clone();
            let pending = queued.clone();
            if win.run_on_main_thread(move || {
                let _ = refresh(&window, &fullscreen, false);
                pending.store(false, Ordering::Release);
            }).is_err() {
                queued.store(false, Ordering::Release);
            }
        }
        std::thread::sleep(Duration::from_millis(300));
    }
}
