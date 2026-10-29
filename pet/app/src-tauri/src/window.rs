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

fn z_order_action(force: bool, paused: bool, was_paused: bool,
    foreground_changed: bool, topmost: bool, visible: bool) -> ZOrderAction {
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
        let topmost = GetWindowLongW(own, GWL_EXSTYLE) as u32 & WS_EX_TOPMOST.0 != 0;
        let action = z_order_action(force, paused, was_paused,
            foreground.0 as usize != last_fg, topmost, IsWindowVisible(own).as_bool());
        let flags = SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE;
        // Keep Tauri's window flags in sync with native z-order, too: show and
        // click-through setters must not restore a stale always-on-top style.
        match action {
            ZOrderAction::None => {},
            ZOrderAction::BehindForeground => {
                if force || !was_paused {
                    win.set_always_on_top(false).map_err(|e| e.to_string())?;
                }
                // Dropping topmost alone leaves the strip above the app.
                SetWindowPos(own, Some(HWND_NOTOPMOST), 0, 0, 0, 0, flags).map_err(|e| e.to_string())?;
                SetWindowPos(own, Some(foreground), 0, 0, 0, 0, flags).map_err(|e| e.to_string())?;
            },
            ZOrderAction::Topmost => {
                win.set_always_on_top(true).map_err(|e| e.to_string())?;
                SetWindowPos(own, Some(HWND_TOPMOST), 0, 0, 0, 0, flags).map_err(|e| e.to_string())?;
                // A cold start behind fullscreen can silently refuse TOPMOST.
                // Only reset the native band when the ordinary assert failed.
                if GetWindowLongW(own, GWL_EXSTYLE) as u32 & WS_EX_TOPMOST.0 == 0 {
                    SetWindowPos(own, Some(HWND_NOTOPMOST), 0, 0, 0, 0, flags).map_err(|e| e.to_string())?;
                    SetWindowPos(own, Some(HWND_TOPMOST), 0, 0, 0, 0, flags).map_err(|e| e.to_string())?;
                }
            },
        }
        if paused != was_paused { let _ = win.emit("pet-fullscreen", paused); }
        if action == ZOrderAction::Topmost
            && GetWindowLongW(own, GWL_EXSTYLE) as u32 & WS_EX_TOPMOST.0 == 0 {
            return Err("strip did not become topmost".into());
        }
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

    #[test]
    fn visible_pets_recover_topmost_without_a_foreground_or_fullscreen_change() {
        assert_eq!(z_order_action(false, false, false, false, false, true),
            ZOrderAction::Topmost);
    }

    #[test]
    fn watcher_leaves_hidden_pets_alone_even_when_fullscreen_or_foreground_changes() {
        for paused in [false, true] {
            for was_paused in [false, true] {
                for foreground_changed in [false, true] {
                    for topmost in [false, true] {
                        assert_eq!(z_order_action(false, paused, was_paused,
                            foreground_changed, topmost, false), ZOrderAction::None);
                    }
                }
            }
        }
    }

    #[test]
    fn fullscreen_keeps_visible_pets_directly_behind_the_foreground_window() {
        // Entry, subsequent ticks, and switching between fullscreen windows.
        for (was_paused, foreground_changed) in [(false, true), (true, false), (true, true)] {
            assert_eq!(z_order_action(false, true, was_paused, foreground_changed, true, true),
                ZOrderAction::BehindForeground);
        }
    }

    #[test]
    fn leaving_fullscreen_restores_topmost_even_if_the_foreground_is_unchanged() {
        assert_eq!(z_order_action(false, false, true, false, false, true),
            ZOrderAction::Topmost);
    }

    #[test]
    fn foreground_change_reasserts_topmost_for_visible_pets() {
        assert_eq!(z_order_action(false, false, false, true, true, true),
            ZOrderAction::Topmost);
    }

    #[test]
    fn unchanged_visible_topmost_pets_need_no_action() {
        assert_eq!(z_order_action(false, false, false, false, true, true),
            ZOrderAction::None);
    }

    #[test]
    fn forced_show_prepares_hidden_pets_for_the_current_fullscreen_state() {
        assert_eq!(z_order_action(true, true, true, false, false, false),
            ZOrderAction::BehindForeground);
        assert_eq!(z_order_action(true, false, false, false, true, false),
            ZOrderAction::Topmost);
    }
}
