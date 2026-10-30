use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use serde_json::json;
use tauri::{Emitter, Manager, WebviewWindow};

// Disabled until the renderer has resolved its startup configuration and subscribed.
#[derive(Default)]
pub struct CursorClearance(AtomicBool);

#[tauri::command]
pub fn set_cursor_clearance(enabled: bool, state: tauri::State<CursorClearance>) {
    state.0.store(enabled, Ordering::Release);
}

// Subtract physical positions before scaling, including on negative-origin displays.
fn strip_point(cursor: (f64, f64), origin: (f64, f64), scale: f64) -> (f64, f64) {
    ((cursor.0 - origin.0) / scale, (cursor.1 - origin.1) / scale)
}

fn distance_to_strip(point: (f64, f64), size: (f64, f64)) -> f64 {
    let dx = (-point.0).max(point.0 - size.0).max(0.0);
    let dy = (-point.1).max(point.1 - size.1).max(0.0);
    dx.hypot(dy)
}

fn poll_interval(enabled: bool, hidden: bool, paused: bool, distance: f64) -> Option<Duration> {
    if !enabled || hidden || paused { return None; }
    Some(Duration::from_millis(if distance <= 250.0 { 16 } else { 100 }))
}

fn sample(win: &WebviewWindow) -> tauri::Result<((f64, f64), f64)> {
    // Tauri reports global cursor and client origin/size in physical pixels.
    // The mask covers the client area; pet scale does not change CSS pixel units.
    let cursor = win.cursor_position()?;
    let origin = win.inner_position()?;
    let size = win.inner_size()?;
    let scale = win.scale_factor()?;
    let point = strip_point((cursor.x, cursor.y), (origin.x as f64, origin.y as f64), scale);
    let distance = distance_to_strip(point, (size.width as f64 / scale, size.height as f64 / scale));
    Ok((point, distance))
}

pub fn watch(win: WebviewWindow) {
    let mut masked = false;
    loop {
        let enabled = win.state::<CursorClearance>().0.load(Ordering::Acquire);
        let hidden = win.state::<crate::show::Visibility>().hidden();
        let paused = win.state::<crate::window::Fullscreen>().paused();
        // Check the gate before reading either the cursor or window geometry.
        let interval = if poll_interval(enabled, hidden, paused, 0.0).is_none() {
            None
        } else if let Ok((point, distance)) = sample(&win) {
            let _ = win.emit("pet-cursor", json!({ "x": point.0, "y": point.1 }));
            masked = true;
            poll_interval(enabled, hidden, paused, distance)
        } else {
            None
        };
        if interval.is_none() && masked {
            let _ = win.emit("pet-cursor", serde_json::Value::Null);
            masked = false;
        }
        std::thread::sleep(interval.unwrap_or(Duration::from_millis(100)));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn disabled_hidden_or_fullscreen_strip_does_not_poll() {
        for enabled in [false, true] {
            for hidden in [false, true] {
                for paused in [false, true] {
                    if enabled && !hidden && !paused { continue; }
                    for distance in [0.0, 500.0] {
                        assert_eq!(poll_interval(enabled, hidden, paused, distance), None);
                    }
                }
            }
        }
    }

    #[test]
    fn polling_is_fast_within_250_logical_pixels_and_slow_beyond() {
        assert_eq!(poll_interval(true, false, false, 0.0), Some(Duration::from_millis(16)));
        assert_eq!(poll_interval(true, false, false, 250.0), Some(Duration::from_millis(16)));
        assert_eq!(poll_interval(true, false, false, 250.01), Some(Duration::from_millis(100)));
        assert_eq!(poll_interval(true, false, false, 1500.0), Some(Duration::from_millis(100)));
    }

    #[test]
    fn distance_to_strip_includes_edges_and_off_strip_corners() {
        assert_eq!(distance_to_strip((300.0, 80.0), (1000.0, 160.0)), 0.0);
        assert_eq!(distance_to_strip((1000.0, 160.0), (1000.0, 160.0)), 0.0);
        assert_eq!(distance_to_strip((300.0, -250.0), (1000.0, 160.0)), 250.0);
        assert_eq!(distance_to_strip((1100.0, 80.0), (1000.0, 160.0)), 100.0);
        assert_eq!(distance_to_strip((-150.0, -200.0), (1000.0, 160.0)), 250.0);
        assert_eq!(distance_to_strip((1300.0, 560.0), (1000.0, 160.0)), 500.0);
    }

    #[test]
    fn physical_cursor_becomes_strip_relative_logical_pixels_at_each_display_scale() {
        assert_eq!(strip_point((450.0, 1050.0), (150.0, 900.0), 1.5), (200.0, 100.0));
        assert_eq!(strip_point((-600.0, 500.0), (-1000.0, 600.0), 2.0), (200.0, -50.0));
        assert_eq!(strip_point((50.0, 75.0), (10.0, 25.0), 1.0), (40.0, 50.0));
    }
}
