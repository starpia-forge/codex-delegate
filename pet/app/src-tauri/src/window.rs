use std::sync::{atomic::{AtomicBool, AtomicUsize, Ordering}, Arc};
use std::time::Duration;
use tauri::{Emitter, WebviewWindow};
use windows::Win32::Foundation::{HWND, POINT, RECT};
use windows::Win32::Graphics::Gdi::{GetMonitorInfoW, MonitorFromPoint, MonitorFromWindow,
    MONITORINFO, MONITOR_DEFAULTTOPRIMARY, MONITOR_DEFAULTTONULL};
use windows::Win32::UI::WindowsAndMessaging::{GetClassNameW, GetDesktopWindow,
    GetForegroundWindow, GetShellWindow, GetWindowLongW, GetWindowRect, IsWindowVisible, SetWindowPos,
    GWL_EXSTYLE, GWL_STYLE, HWND_NOTOPMOST, HWND_TOPMOST, SWP_NOMOVE, SWP_NOSIZE,
    SWP_NOACTIVATE, WS_CAPTION, WS_EX_TOPMOST};

// Its own type: Tauri manages one state per type, and `Ready` is also an `Arc<AtomicBool>`.
#[derive(Clone, Default)]
pub struct Fullscreen {
    paused: Arc<AtomicBool>,
    foreground: Arc<AtomicUsize>,
    topmost_refused: Arc<AtomicBool>,
}

impl Fullscreen {
    fn topmost_refusal_started(&self, topmost: bool) -> bool {
        let was_refused = self.topmost_refused.swap(!topmost, Ordering::AcqRel);
        !topmost && !was_refused
    }
}

#[tauri::command]
pub fn fullscreen_paused(state: tauri::State<Fullscreen>) -> bool {
    state.paused.load(Ordering::Acquire)
}

#[derive(Debug, PartialEq, Eq)]
enum ZOrderAction {
    None,
    BehindForeground,
    Topmost,
}

struct ZOrderInputs {
    force: bool,
    paused: bool,
    was_paused: bool,
    foreground_changed: bool,
    topmost: bool,
    visible: bool,
}

fn z_order_action(inputs: ZOrderInputs) -> ZOrderAction {
    let ZOrderInputs { force, paused, was_paused, foreground_changed, topmost, visible } = inputs;
    // A forced refresh prepares the strip before the show transition makes it visible.
    if !force && !visible {
        ZOrderAction::None
    } else if paused {
        ZOrderAction::BehindForeground
    } else if force || was_paused || foreground_changed || !topmost {
        ZOrderAction::Topmost
    } else {
        ZOrderAction::None
    }
}

trait ZOrder {
    fn assert_topmost(&mut self) -> Result<(), String>;
    fn drop_topmost(&mut self) -> Result<(), String>;
    fn place_behind(&mut self, window: HWND) -> Result<(), String>;
    fn is_topmost(&self) -> bool;
}

struct NativeZOrder(HWND);

impl NativeZOrder {
    fn place_after(&self, window: HWND) -> Result<(), String> {
        unsafe {
            SetWindowPos(self.0, Some(window), 0, 0, 0, 0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE).map_err(|e| e.to_string())
        }
    }
}

impl ZOrder for NativeZOrder {
    fn assert_topmost(&mut self) -> Result<(), String> { self.place_after(HWND_TOPMOST) }
    fn drop_topmost(&mut self) -> Result<(), String> { self.place_after(HWND_NOTOPMOST) }
    fn place_behind(&mut self, window: HWND) -> Result<(), String> { self.place_after(window) }
    fn is_topmost(&self) -> bool {
        unsafe { GetWindowLongW(self.0, GWL_EXSTYLE) as u32 & WS_EX_TOPMOST.0 != 0 }
    }
}

// Ok(false) reports a silent refusal; native API errors still propagate.
fn assert_topmost(z_order: &mut impl ZOrder) -> Result<bool, String> {
    z_order.assert_topmost()?;
    // A cold start behind fullscreen can silently refuse TOPMOST.
    // Only reset the native band when the ordinary assert failed.
    if !z_order.is_topmost() {
        z_order.drop_topmost()?;
        z_order.assert_topmost()?;
        // A native refusal must not keep the strip invisible during a show. The
        // watcher retries while the visible, unpaused strip lacks topmost.
        return Ok(z_order.is_topmost());
    }
    Ok(true)
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
        let mut z_order = NativeZOrder(own);
        let topmost = z_order.is_topmost();
        // Recovery by another app also ends the previous failure episode.
        if topmost { state.topmost_refusal_started(true); }
        let action = z_order_action(ZOrderInputs { force, paused, was_paused,
            foreground_changed: foreground.0 as usize != last_fg,
            topmost, visible: IsWindowVisible(own).as_bool() });
        // Keep Tauri's window flags in sync with native z-order, too: show and
        // click-through setters must not restore a stale always-on-top style.
        match action {
            ZOrderAction::None => {},
            ZOrderAction::BehindForeground => {
                if force || !was_paused {
                    win.set_always_on_top(false).map_err(|e| e.to_string())?;
                }
                // Dropping topmost alone leaves the strip above the app.
                z_order.drop_topmost()?;
                z_order.place_behind(foreground)?;
            },
            ZOrderAction::Topmost => {
                win.set_always_on_top(true).map_err(|e| e.to_string())?;
                if state.topmost_refusal_started(assert_topmost(&mut z_order)?) {
                    eprintln!("strip did not become topmost (watcher will retry)");
                }
            },
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

#[cfg(test)]
mod tests {
    use super::*;

    enum TopmostSupport { Plain, AfterReset, Refused }

    struct FakeZOrder {
        support: TopmostSupport,
        topmost: bool,
        reset: bool,
    }

    impl FakeZOrder {
        fn new(support: TopmostSupport) -> Self { Self { support, topmost: false, reset: false } }
    }

    impl ZOrder for FakeZOrder {
        fn assert_topmost(&mut self) -> Result<(), String> {
            self.topmost = match self.support {
                TopmostSupport::Plain => true,
                TopmostSupport::AfterReset => self.reset,
                TopmostSupport::Refused => false,
            };
            Ok(())
        }
        fn drop_topmost(&mut self) -> Result<(), String> {
            self.reset = true;
            self.topmost = false;
            Ok(())
        }
        fn place_behind(&mut self, _: HWND) -> Result<(), String> { Ok(()) }
        fn is_topmost(&self) -> bool { self.topmost }
    }

    #[test]
    fn persistent_topmost_refusal_reports_false_without_blocking_show() {
        let mut z_order = FakeZOrder::new(TopmostSupport::Refused);
        assert_eq!(assert_topmost(&mut z_order), Ok(false));
        assert!(!z_order.is_topmost());
    }

    #[test]
    fn cold_start_topmost_refusal_recovers_after_resetting_the_native_band() {
        let mut z_order = FakeZOrder::new(TopmostSupport::AfterReset);
        assert_eq!(assert_topmost(&mut z_order), Ok(true));
        assert!(z_order.is_topmost());
    }

    #[test]
    fn plain_topmost_success_does_not_reset_the_native_band() {
        let mut z_order = FakeZOrder::new(TopmostSupport::Plain);
        assert_eq!(assert_topmost(&mut z_order), Ok(true));
        assert!(z_order.is_topmost());
        assert!(!z_order.reset);
    }

    #[test]
    fn topmost_refusal_logs_only_once_per_failure_episode() {
        let state = Fullscreen::default();
        let observations = [false, false, false, true, false, false];
        let log_line: Vec<_> = observations.into_iter()
            .map(|topmost| state.topmost_refusal_started(topmost)).collect();
        assert_eq!(log_line, [true, false, false, false, true, false]);
    }

    #[test]
    fn visible_strip_recovers_topmost_without_a_foreground_or_fullscreen_change() {
        assert_eq!(z_order_action(ZOrderInputs { force: false, paused: false,
            was_paused: false, foreground_changed: false, topmost: false, visible: true }),
            ZOrderAction::Topmost);
    }

    #[test]
    fn watcher_leaves_invisible_strip_alone_even_when_fullscreen_or_foreground_changes() {
        for paused in [false, true] {
            for was_paused in [false, true] {
                for foreground_changed in [false, true] {
                    for topmost in [false, true] {
                        assert_eq!(z_order_action(ZOrderInputs { force: false, paused, was_paused,
                            foreground_changed, topmost, visible: false }), ZOrderAction::None);
                    }
                }
            }
        }
    }

    #[test]
    fn fullscreen_keeps_visible_strip_directly_behind_the_foreground_window() {
        // Entry, subsequent ticks, and switching between fullscreen windows.
        for (was_paused, foreground_changed) in [(false, true), (true, false), (true, true)] {
            assert_eq!(z_order_action(ZOrderInputs { force: false, paused: true,
                was_paused, foreground_changed, topmost: true, visible: true }),
                ZOrderAction::BehindForeground);
        }
    }

    #[test]
    fn leaving_fullscreen_restores_topmost_even_if_the_foreground_is_unchanged() {
        assert_eq!(z_order_action(ZOrderInputs { force: false, paused: false,
            was_paused: true, foreground_changed: false, topmost: false, visible: true }),
            ZOrderAction::Topmost);
    }

    #[test]
    fn foreground_change_reasserts_topmost_for_visible_strip() {
        assert_eq!(z_order_action(ZOrderInputs { force: false, paused: false,
            was_paused: false, foreground_changed: true, topmost: true, visible: true }),
            ZOrderAction::Topmost);
    }

    #[test]
    fn unchanged_visible_topmost_strip_needs_no_action() {
        assert_eq!(z_order_action(ZOrderInputs { force: false, paused: false,
            was_paused: false, foreground_changed: false, topmost: true, visible: true }),
            ZOrderAction::None);
    }

    #[test]
    fn forced_show_prepares_invisible_strip_for_the_current_fullscreen_state() {
        assert_eq!(z_order_action(ZOrderInputs { force: true, paused: true,
            was_paused: true, foreground_changed: false, topmost: false, visible: false }),
            ZOrderAction::BehindForeground);
        assert_eq!(z_order_action(ZOrderInputs { force: true, paused: false,
            was_paused: false, foreground_changed: false, topmost: true, visible: false }),
            ZOrderAction::Topmost);
    }
}
