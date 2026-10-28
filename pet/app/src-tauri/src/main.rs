#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde_json::{json, Value};
use std::io::{BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{atomic::{AtomicBool, Ordering}, Arc};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewWindow};

const DEFAULT_PORT: u16 = 47800;
type Ready = Arc<AtomicBool>;

#[tauri::command]
fn renderer_ready(ready: tauri::State<Ready>) {
    ready.store(true, Ordering::Release);
}

fn main() {
    let port = std::env::var("CODEX_DELEGATE_PET_PORT")
        .map(|s| s.parse::<u16>().expect("invalid pet port"))
        .unwrap_or(DEFAULT_PORT);
    // Bind before opening the window; a second instance exits on a port conflict.
    let listener = TcpListener::bind(("127.0.0.1", port)).expect("pet port unavailable");
    let ready: Ready = Arc::new(AtomicBool::new(false));
    tauri::Builder::default()
        .manage(ready.clone())
        .invoke_handler(tauri::generate_handler![renderer_ready])
        .setup(move |app| {
            let win = app.get_webview_window("main").unwrap();
            place_strip(&win);
            win.set_ignore_cursor_events(true)?;
            win.show()?;
            win.set_ignore_cursor_events(true)?;
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                for stream in listener.incoming().flatten() {
                    let handle = handle.clone();
                    let ready = ready.clone();
                    std::thread::spawn(move || { let _ = serve(stream, handle, ready); });
                }
            });
            let win = win.clone();
            std::thread::spawn(move || watch_window(win));
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("pet application failed");
}

fn place_strip(win: &WebviewWindow) {
    let Ok(Some(mon)) = win.primary_monitor() else { return };
    let area = mon.work_area();
    let height = (160.0 * mon.scale_factor()).round() as u32;
    let size = PhysicalSize::new(area.size.width, height);
    let position = PhysicalPosition::new(area.position.x,
        area.position.y + area.size.height as i32 - height as i32);
    if win.outer_size().ok() != Some(size) { let _ = win.set_size(size); }
    if win.outer_position().ok() != Some(position) { let _ = win.set_position(position); }
}

fn watch_window(win: WebviewWindow) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, SetWindowPos,
        HWND_TOPMOST, SWP_NOMOVE, SWP_NOSIZE, SWP_NOACTIVATE};
    let own = win.hwnd().unwrap().0 as isize;
    let mut last_fg: isize = 0;
    loop {
        std::thread::sleep(Duration::from_millis(300));
        place_strip(&win);
        unsafe {
            let foreground = GetForegroundWindow().0 as isize;
            if foreground != last_fg {
                last_fg = foreground;
                // Tauri's setter is a no-op when its topmost flag is unchanged.
                let _ = SetWindowPos(HWND(own as _), Some(HWND_TOPMOST), 0, 0, 0, 0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
            }
        }
    }
}

fn valid_event(e: &Value) -> bool {
    if e["v"] == 1 && e["source"] == "leader" {
        return matches!(e["type"].as_str(), Some("session-start" | "prompt" | "waiting" | "resumed" | "stop" | "failed" | "session-end"))
            && e["team"].as_str().is_some_and(|s| !s.is_empty())
            && e["at"].is_number()
            && e.get("session").is_some_and(|v| v.is_null() || v.is_string());
    }
    e["v"] == 1 && e["source"] == "worker"
        && matches!(e["type"].as_str(), Some("start" | "heartbeat" | "end"))
        && ["team", "session"].iter().all(|k| e.get(k).is_some_and(|v| v.is_null() || v.is_string()))
        && ["worker", "role", "label"].iter().all(|k| e[k].as_str().is_some_and(|s| !s.is_empty()))
        && e["seq"].as_u64().is_some_and(|n| n <= 9_007_199_254_740_991)
        && e["at"].as_u64().is_some_and(|n| n <= 9_007_199_254_740_991)
        && (e["type"] != "end" || matches!(e["outcome"].as_str(), Some("success" | "failed")))
}

fn serve(mut stream: TcpStream, app: AppHandle, ready: Ready) -> std::io::Result<()> {
    stream.set_read_timeout(Some(Duration::from_secs(1)))?;
    stream.set_write_timeout(Some(Duration::from_secs(1)))?;
    let mut reader = BufReader::new(&stream);
    let mut header = Vec::new();
    while !header.ends_with(b"\r\n\r\n") {
        if header.len() >= 8192 { return Ok(()); }
        let mut byte = [0];
        reader.read_exact(&mut byte)?;
        header.push(byte[0]);
    }
    let header = String::from_utf8_lossy(&header);
    let mut lines = header.split("\r\n");
    let request = lines.next().unwrap_or("");
    let length = lines.filter_map(|line| line.split_once(':'))
        .find(|(key, _)| key.eq_ignore_ascii_case("content-length"))
        .and_then(|(_, value)| value.trim().parse::<usize>().ok()).unwrap_or(0);
    let (status, body) = if request == "GET /health HTTP/1.1" {
        (if ready.load(Ordering::Acquire) { "200 OK" } else { "503 Service Unavailable" },
            json!({"app": "codex-delegate-pet", "protocol": 1, "version": env!("CARGO_PKG_VERSION")}))
    } else if request == "POST /event HTTP/1.1" && (1..=16384).contains(&length) {
        let mut bytes = vec![0; length];
        reader.read_exact(&mut bytes)?;
        match serde_json::from_slice::<Value>(&bytes) {
            Ok(event) if valid_event(&event) && ready.load(Ordering::Acquire) => {
                match app.emit("pet-event", &event) {
                    Ok(()) => ("200 OK", json!({"ok": true})),
                    Err(_) => ("503 Service Unavailable", json!({"error": "renderer unavailable"})),
                }
            }
            _ => ("400 Bad Request", json!({"error": "invalid event or renderer unavailable"})),
        }
    } else { ("404 Not Found", json!({"error": "unknown request"})) };
    let body = body.to_string();
    write!(stream, "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len())
}
