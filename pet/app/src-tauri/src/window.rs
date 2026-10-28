use std::sync::{atomic::{AtomicBool, Ordering}, Arc};
use std::time::Duration;
use tauri::{Emitter, WebviewWindow};
use windows::Win32::Foundation::{HWND, POINT, RECT};
use windows::Win32::Graphics::Gdi::{GetMonitorInfoW, MonitorFromPoint, MonitorFromWindow,
    MONITORINFO, MONITOR_DEFAULTTOPRIMARY, MONITOR_DEFAULTTONULL};
use windows::Win32::UI::WindowsAndMessaging::{GetClassNameW, GetDesktopWindow,
    GetForegroundWindow, GetShellWindow, GetWindowLongW, GetWindowRect, SetWindowPos,
    GWL_STYLE, HWND_NOTOPMOST, HWND_TOPMOST, SWP_NOMOVE, SWP_NOSIZE, SWP_NOACTIVATE, WS_CAPTION};

pub type Fullscreen = Arc<AtomicBool>;

#[tauri::command]
pub fn fullscreen_paused(state: tauri::State<Fullscreen>) -> bool {
    state.load(Ordering::Acquire)
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

pub fn watch(win: WebviewWindow, state: Fullscreen) {
    let own = HWND(win.hwnd().unwrap().0 as _);
    let mut last_fg = HWND::default();
    loop {
        crate::place_strip(&win);
        unsafe {
            let foreground = GetForegroundWindow();
            let paused = fullscreen(foreground, own);
            let was_paused = state.swap(paused, Ordering::AcqRel);
            let flags = SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE;
            if paused {
                // Dropping topmost alone leaves the strip above the app.
                let _ = SetWindowPos(own, Some(HWND_NOTOPMOST), 0, 0, 0, 0, flags);
                let _ = SetWindowPos(own, Some(foreground), 0, 0, 0, 0, flags);
            } else if was_paused || foreground != last_fg {
                let _ = SetWindowPos(own, Some(HWND_TOPMOST), 0, 0, 0, 0, flags);
            }
            if paused != was_paused { let _ = win.emit("pet-fullscreen", paused); }
            last_fg = foreground;
        }
        std::thread::sleep(Duration::from_millis(300));
    }
}
