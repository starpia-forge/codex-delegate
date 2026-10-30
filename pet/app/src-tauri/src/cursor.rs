use std::sync::atomic::Ordering;
use std::time::Duration;
use serde_json::json;
use tauri::{Emitter, Manager, WebviewWindow};

// Subtract physical positions before scaling, including on negative-origin displays.
fn strip_point(cursor: (f64, f64), origin: (f64, f64), scale: f64) -> (f64, f64) {
    ((cursor.0 - origin.0) / scale, (cursor.1 - origin.1) / scale)
}

fn distance_to_strip(point: (f64, f64), size: (f64, f64)) -> f64 {
    let dx = (-point.0).max(point.0 - size.0).max(0.0);
    let dy = (-point.1).max(point.1 - size.1).max(0.0);
    dx.hypot(dy)
}

type Point = (f64, f64);

// Twin of the outer radius in pet/app/ui/cursor-clearance.mjs (logical pixels).
const CLEARANCE_RADIUS: f64 = 250.0;

// The outer Option distinguishes no event from an event carrying null.
// None observations cover a closed gate, failed sample, or pointer beyond the band.
fn emit_decision(last: Option<Point>, observation: Option<Point>) -> (Option<Option<Point>>, Option<Point>) {
    let event = if last != observation { Some(observation) } else { None };
    (event, observation)
}

fn polling_gate(renderer_ready: bool, cursor_clearance_active: bool) -> bool {
    renderer_ready && cursor_clearance_active
}

fn poll_interval(distance: f64) -> Duration {
    Duration::from_millis(if distance <= CLEARANCE_RADIUS { 16 } else { 100 })
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
    let mut last_emitted = None;
    loop {
        let paused = win.state::<crate::window::Fullscreen>().paused();
        // Do not lose the first stationary-pointer event before the renderer subscribes.
        let active = polling_gate(win.state::<crate::Ready>().load(Ordering::Acquire),
            win.state::<crate::show::Visibility>().cursor_clearance_active(paused));
        // Check the gate before reading either the cursor or window geometry.
        let (observation, interval) = if !active {
            (None, None)
        } else if let Ok((point, distance)) = sample(&win) {
            ((distance <= CLEARANCE_RADIUS).then_some(point), Some(poll_interval(distance)))
        } else {
            (None, None)
        };
        let (event, next) = emit_decision(last_emitted, observation);
        if let Some(pointer) = event {
            let payload = match pointer {
                Some(point) => json!({ "x": point.0, "y": point.1 }),
                None => serde_json::Value::Null,
            };
            let _ = win.emit("pet-cursor", payload);
        }
        last_emitted = next;
        std::thread::sleep(interval.unwrap_or(Duration::from_millis(100)));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn polling_gate_requires_renderer_ready_and_cursor_clearance_active() {
        assert!(!polling_gate(false, false));
        assert!(!polling_gate(false, true));
        assert!(!polling_gate(true, false));
        assert!(polling_gate(true, true));
    }

    #[test]
    fn unchanged_pointer_does_not_emit() {
        let point = Some((300.0, 80.0));
        assert_eq!(emit_decision(point, point), (None, point));
    }

    #[test]
    fn first_or_moved_pointer_emits_the_point() {
        let point = Some((300.0, 80.0));
        for last in [None, Some((299.0, 80.0)), Some((300.0, 81.0))] {
            assert_eq!(emit_decision(last, point), (Some(point), point));
        }
    }

    #[test]
    fn leaving_the_band_emits_one_null_then_nothing() {
        let (event, last) = emit_decision(Some((300.0, 80.0)), None);
        assert_eq!(event, Some(None));
        assert_eq!(last, None);
        assert_eq!(emit_decision(last, None), (None, None));
        let point = Some((300.0, 80.0));
        assert_eq!(emit_decision(last, point), (Some(point), point));
    }

    #[test]
    fn outside_without_a_previous_point_does_not_emit_null() {
        assert_eq!(emit_decision(None, None), (None, None));
    }

    #[test]
    fn failed_sample_clears_a_previous_point_once() {
        let observation = None; // A failed sample has no usable point.
        let (event, last) = emit_decision(Some((300.0, 80.0)), observation);
        assert_eq!((event, last), (Some(None), None));
        assert_eq!(emit_decision(last, observation), (None, None));
    }

    #[test]
    fn polling_is_fast_within_250_logical_pixels_and_slow_beyond() {
        assert_eq!(poll_interval(0.0), Duration::from_millis(16));
        assert_eq!(poll_interval(250.0), Duration::from_millis(16));
        assert_eq!(poll_interval(250.01), Duration::from_millis(100));
        assert_eq!(poll_interval(1500.0), Duration::from_millis(100));
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
