#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde_json::{json, Value};
use std::io::{BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{atomic::{AtomicBool, Ordering}, Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewWindow};

const DEFAULT_PORT: u16 = 47800;
type Ready = Arc<AtomicBool>;
type EventApp = Arc<Mutex<Option<AppHandle>>>;

#[tauri::command]
fn renderer_ready(ready: tauri::State<Ready>) {
    ready.store(true, Ordering::Release);
}

fn main() {
    let state = std::env::var_os("CODEX_DELEGATE_PET_STATE_DIR").map(std::path::PathBuf::from)
        .or_else(|| std::env::current_exe().ok().and_then(|exe|
            exe.parent().map(|dir| dir.join("..").join("pet-state"))));
    let token = state.and_then(|dir| std::fs::read_to_string(dir.join("token")).ok())
        .map(|token| token.trim().to_owned()).filter(|token| !token.is_empty());
    let Some(token) = token else { std::process::exit(0) };
    let token = Arc::new(token);
    let port = std::env::var("CODEX_DELEGATE_PET_PORT")
        .map(|s| s.parse::<u16>().expect("invalid pet port"))
        .unwrap_or(DEFAULT_PORT);
    // Bind before opening the window; a second instance exits on a port conflict.
    let Ok(listener) = TcpListener::bind(("127.0.0.1", port)) else { std::process::exit(0) };
    let ready: Ready = Arc::new(AtomicBool::new(false));
    let last_event = Arc::new(Mutex::new(Instant::now()));
    let event_app: EventApp = Arc::new(Mutex::new(None));
    // Serve authenticated 503 health before WebView/window creation, so a
    // short worker's end is queued rather than dropped during shell startup.
    let server_app = event_app.clone();
    let server_ready = ready.clone();
    let server_last_event = last_event.clone();
    std::thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            let app = server_app.clone();
            let ready = server_ready.clone();
            let token = token.clone();
            let last_event = server_last_event.clone();
            std::thread::spawn(move || { let _ = serve(stream, app, ready, &token, &last_event); });
        }
    });
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(1));
        if last_event.lock().unwrap().elapsed() >= Duration::from_secs(10 * 60) {
            std::process::exit(0);
        }
    });
    tauri::Builder::default()
        .manage(ready.clone())
        .invoke_handler(tauri::generate_handler![renderer_ready])
        .setup(move |app| {
            *event_app.lock().unwrap() = Some(app.handle().clone());
            let win = app.get_webview_window("main").unwrap();
            place_strip(&win);
            win.set_ignore_cursor_events(true)?;
            win.show()?;
            win.set_ignore_cursor_events(true)?;
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
    e["v"] == 1 && e["source"] == "worker"
        && matches!(e["type"].as_str(), Some("start" | "heartbeat" | "end"))
        && ["team", "session"].iter().all(|k| e.get(k).is_some_and(|v| v.is_null() || v.is_string()))
        && ["worker", "role", "label"].iter().all(|k| e[k].as_str().is_some_and(|s| !s.is_empty()))
        && e["seq"].as_u64().is_some_and(|n| n <= 9_007_199_254_740_991)
        && e["at"].as_u64().is_some_and(|n| n <= 9_007_199_254_740_991)
        && (e["type"] != "end" || matches!(e["outcome"].as_str(), Some("success" | "failed")))
}

fn serve(mut stream: TcpStream, app: EventApp, ready: Ready, token: &str,
    last_event: &Mutex<Instant>) -> std::io::Result<()> {
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
    let headers: Vec<_> = lines.filter_map(|line| line.split_once(':')).collect();
    let authorized = headers.iter().any(|(key, value)|
        key.eq_ignore_ascii_case("x-codex-delegate-pet-token") && value.trim() == token);
    let length = headers.iter()
        .find(|(key, _)| key.eq_ignore_ascii_case("content-length"))
        .and_then(|(_, value)| value.trim().parse::<usize>().ok()).unwrap_or(0);
    let quit = authorized && request == "POST /quit HTTP/1.1";
    let (status, body) = if !authorized {
        ("401 Unauthorized", json!({"error": "unauthorized"}))
    } else if request == "GET /health HTTP/1.1" {
        (if ready.load(Ordering::Acquire) { "200 OK" } else { "503 Service Unavailable" },
            json!({"app": "codex-delegate-pet", "protocol": 1, "version": env!("CARGO_PKG_VERSION")}))
    } else if quit {
        ("200 OK", json!({"ok": true}))
    } else if request == "POST /event HTTP/1.1" && length > 16384 {
        ("413 Payload Too Large", json!({"error": "event too large"}))
    } else if request == "POST /event HTTP/1.1" && length > 0 {
        let mut bytes = vec![0; length];
        reader.read_exact(&mut bytes)?;
        match serde_json::from_slice::<Value>(&bytes) {
            Ok(event) if valid_event(&event) => {
                if !ready.load(Ordering::Acquire) {
                    ("503 Service Unavailable", json!({"error": "renderer unavailable"}))
                } else {
                    if app.lock().unwrap().as_ref().is_some_and(|app| app.emit("pet-event", &event).is_ok()) {
                        *last_event.lock().unwrap() = Instant::now();
                        ("200 OK", json!({"ok": true}))
                    } else {
                        ("503 Service Unavailable", json!({"error": "renderer unavailable"}))
                    }
                }
            }
            _ => ("400 Bad Request", json!({"error": "invalid event or renderer unavailable"})),
        }
    } else { ("404 Not Found", json!({"error": "unknown request"})) };
    let body = body.to_string();
    write!(stream, "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len())?;
    if quit { std::process::exit(0); }
    Ok(())
}
