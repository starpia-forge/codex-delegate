#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod capture;
mod liveness;
mod licences;
mod messages;
mod notices;
mod prefs;
mod show;
mod window;

use serde_json::{json, Value};
use std::io::{BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::{atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering}, Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewWindow};
use liveness::{LeaderSessions, Sessions};

const DEFAULT_PORT: u16 = 47800;
const BUNDLE_VERSION: &str = match option_env!("CODEX_DELEGATE_PET_VERSION") {
    Some(version) => version,
    None => env!("CARGO_PKG_VERSION"),
};
const MAX_CONNECTIONS: usize = 8;

// Acquire before spawning, and release even on an I/O error or handler panic.
struct ConnectionPermit(Arc<AtomicUsize>);
impl ConnectionPermit {
    fn acquire(active: &Arc<AtomicUsize>) -> Option<Self> {
        active.fetch_update(Ordering::Relaxed, Ordering::Relaxed,
            |n| (n < MAX_CONNECTIONS).then_some(n + 1)).ok()?;
        Some(Self(active.clone()))
    }
}
impl Drop for ConnectionPermit {
    fn drop(&mut self) { self.0.fetch_sub(1, Ordering::Relaxed); }
}

type Ready = Arc<AtomicBool>;
type EventApp = Arc<Mutex<Option<AppHandle>>>;
type PetScale = Arc<AtomicU64>;

#[tauri::command]
fn renderer_ready(app: AppHandle, ready: tauri::State<Ready>, sessions: tauri::State<LeaderSessions>) -> Result<(), String> {
    sessions.lock().unwrap().restore(&app)?;
    ready.store(true, Ordering::Release);
    app.state::<show::Visibility>().start(&app);
    Ok(())
}

fn pet_directories() -> Result<(PathBuf, PathBuf), String> {
    let env_path = |key| std::env::var_os(key).filter(|value| !value.is_empty()).map(PathBuf::from);
    let home = env_path("USERPROFILE").or_else(|| env_path("HOME"))
        .ok_or("home directory unavailable")?;
    let codex_home = env_path("CODEX_HOME").unwrap_or_else(|| home.join(".codex"));
    Ok((home, codex_home))
}

#[tauri::command]
fn pet_paths() -> Result<Value, String> {
    let (home, codex_home) = pet_directories()?;
    Ok(json!({ "home": home, "codexHome": codex_home }))
}

#[tauri::command]
fn read_pet_file(path: String) -> Result<tauri::ipc::Response, String> {
    let (home, codex_home) = pet_directories()?;
    let path = std::fs::canonicalize(path).map_err(|e| e.to_string())?;
    let config = home.join(".codex-delegate").join("pet.json");
    let is_config = std::fs::canonicalize(config).is_ok_and(|allowed| path == allowed);
    let in_pets = [home.join(".codex-delegate").join("pets"), codex_home.join("pets")]
        .iter().any(|root| std::fs::canonicalize(root)
            .is_ok_and(|root| path != root && path.starts_with(root)));
    if !is_config && !in_pets { return Err("pet file access denied".into()); }
    std::fs::read(path).map(tauri::ipc::Response::new).map_err(|e| e.to_string())
}

#[tauri::command]
fn set_pet_scale(win: WebviewWindow, scale: f64, state: tauri::State<PetScale>) -> Result<(), String> {
    if !scale.is_finite() || !(0.3..=1.0).contains(&scale) {
        return Err("pet scale must be between 0.3 and 1.0".into());
    }
    state.store(scale.to_bits(), Ordering::Relaxed);
    place_strip(&win);
    Ok(())
}

fn main() {
    let state = std::env::var_os("CODEX_DELEGATE_PET_STATE_DIR").map(std::path::PathBuf::from)
        .or_else(|| std::env::current_exe().ok().and_then(|exe|
            exe.parent().map(|dir| dir.join("..").join("pet-state"))));
    let token = state.as_ref().and_then(|dir| std::fs::read_to_string(dir.join("token")).ok())
        .map(|token| token.trim().to_owned()).filter(|token| !token.is_empty());
    let Some(token) = token else { std::process::exit(0) };
    let token = Arc::new(token);
    let port = std::env::var("CODEX_DELEGATE_PET_PORT")
        .map(|s| s.parse::<u16>().expect("invalid pet port"))
        .unwrap_or(DEFAULT_PORT);
    // Bind before opening the window; a second instance exits on a port conflict.
    let Ok(listener) = TcpListener::bind(("127.0.0.1", port)) else { std::process::exit(0) };
    // Publish only after binding, so a losing second instance cannot overwrite
    // the running app's PID. The installer also verifies its executable path.
    let state = state.unwrap();
    let process_file = state.join("app-process.json");
    let process_temp = state.join(format!("app-process-{}.tmp", std::process::id()));
    if let Err(error) = std::fs::write(&process_temp, json!({ "pid": std::process::id() }).to_string())
        .and_then(|_| std::fs::rename(&process_temp, &process_file))
    {
        eprintln!("cannot publish pet process id: {error}");
        let _ = std::fs::remove_file(&process_temp);
    }
    let ready: Ready = Arc::new(AtomicBool::new(false));
    let visibility = show::Visibility::new(prefs::PreferenceStore::load(state.join("pet-preferences.json")));
    let sessions: LeaderSessions = Arc::new(Mutex::new(Sessions::new(state)));
    let last_event = Arc::new(Mutex::new(Instant::now()));
    let event_app: EventApp = Arc::new(Mutex::new(None));
    // Serve authenticated 503 health before WebView/window creation, so a
    // short worker's end is queued rather than dropped during shell startup.
    let server_app = event_app.clone();
    let server_ready = ready.clone();
    let server_last_event = last_event.clone();
    let capture = Arc::new(capture::CaptureState::new(pet_directories().ok().map(|(home, _)| home)));
    let server_capture = capture.clone();
    std::thread::spawn(move || {
        let active = Arc::new(AtomicUsize::new(0));
        for stream in listener.incoming().flatten() {
            // Dropping an excess stream closes it without creating a thread.
            let Some(permit) = ConnectionPermit::acquire(&active) else { continue };
            let app = server_app.clone();
            let ready = server_ready.clone();
            let token = token.clone();
            let last_event = server_last_event.clone();
            let capture = server_capture.clone();
            std::thread::spawn(move || {
                let _permit = permit;
                let _ = serve(stream, app, ready, &token, &last_event, &capture);
            });
        }
    });
    let idle_app = event_app.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(1));
        if last_event.lock().unwrap().elapsed() >= Duration::from_secs(10 * 60) {
            exit_app(&idle_app);
            return;
        }
    });
    let fullscreen = window::Fullscreen::default();
    tauri::Builder::default()
        .manage(ready.clone())
        .manage(sessions.clone())
        .manage(capture.clone())
        .manage(fullscreen.clone())
        .manage(visibility)
        .manage(Arc::new(AtomicU64::new(0.6_f64.to_bits())) as PetScale)
        .invoke_handler(|invoke| {
            if !licences::command_allowed(invoke.message.webview_ref().label(), invoke.message.command()) {
                invoke.resolver.reject("command not available to this window");
                return true;
            }
            let handler: fn(tauri::ipc::Invoke<tauri::Wry>) -> bool = tauri::generate_handler![renderer_ready, pet_paths, read_pet_file, set_pet_scale,
                capture::computer_use_live, window::fullscreen_paused, show::pet_preferences, show::frame_ready,
                messages::messages, notices::notices];
            handler(invoke)
        })
        .setup(move |app| {
            let win = app.get_webview_window("main").unwrap();
            show::create_tray(app.handle())?;
            // The strip stays hidden until renderer_ready starts the shared
            // show transition, and stays hidden entirely for a hidden startup.
            *event_app.lock().unwrap() = Some(app.handle().clone());
            let capture_win = win.clone();
            std::thread::spawn(move || capture::watch(capture_win, capture));
            std::thread::spawn(move || window::watch(win, fullscreen));
            let handle = app.handle().clone();
            std::thread::spawn(move || liveness::watch(handle, ready, sessions));
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("pet application failed");
}

fn exit_app(app: &EventApp) {
    let handle = app.lock().unwrap().clone();
    if let Some(app) = handle {
        // Tauri removes its tray resources on exit; process::exit skips Drop.
        app.exit(0);
    } else {
        std::process::exit(0);
    }
}

fn place_strip(win: &WebviewWindow) {
    let Ok(Some(mon)) = win.primary_monitor() else { return };
    let area = mon.work_area();
    let scale = f64::from_bits(win.state::<PetScale>().load(Ordering::Relaxed));
    let height = ((208.0 * scale + 36.0) * mon.scale_factor()).ceil() as u32;
    let size = PhysicalSize::new(area.size.width, height);
    let position = PhysicalPosition::new(area.position.x,
        area.position.y + area.size.height as i32 - height as i32);
    if win.outer_size().ok() != Some(size) { let _ = win.set_size(size); }
    if win.outer_position().ok() != Some(position) { let _ = win.set_position(position); }
}

fn valid_event(e: &Value) -> bool {
    if e["v"] == 1 && e["source"] == "leader" {
        return matches!(e["type"].as_str(), Some("session-start" | "prompt" | "waiting" | "resumed" | "stop" | "failed" | "session-end"))
            && e["team"].as_str().is_some_and(|s| !s.is_empty())
            && e["at"].as_u64().is_some_and(|n| n <= 9_007_199_254_740_991)
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

fn serve(mut stream: TcpStream, app: EventApp, ready: Ready, token: &str,
    last_event: &Mutex<Instant>, capture: &capture::Capture) -> std::io::Result<()> {
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
            json!({"app": "codex-delegate-pet", "protocol": 1, "version": BUNDLE_VERSION, "pid": std::process::id()}))
    } else if quit {
        ("200 OK", json!({"ok": true}))
    } else if request == "POST /exclude HTTP/1.1" {
        let win = app.lock().unwrap().as_ref().and_then(|app| app.get_webview_window("main"));
        let excluded = win.as_ref().is_some_and(|win| capture.request(win).is_ok());
        if let Some(win) = &win { win.state::<show::Visibility>().retry(win.app_handle()); }
        if excluded {
            ("200 OK", json!({"ok": true}))
        } else {
            ("503 Service Unavailable", json!({"error": "capture exclusion unavailable"}))
        }
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
                    if app.lock().unwrap().as_ref().is_some_and(|app| liveness::emit_event(app, &event)) {
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
    if quit { exit_app(&app); }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn health_reports_the_builds_bundle_version() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let mut client = TcpStream::connect(listener.local_addr().unwrap()).unwrap();
        client.set_read_timeout(Some(Duration::from_secs(2))).unwrap();
        let (stream, _) = listener.accept().unwrap();
        let handler = std::thread::spawn(move || serve(stream,
            Arc::new(Mutex::new(None)), Arc::new(AtomicBool::new(true)), "test-token",
            &Mutex::new(Instant::now()), &Arc::new(capture::CaptureState::new(None))));
        client.write_all(b"GET /health HTTP/1.1\r\nx-codex-delegate-pet-token: test-token\r\n\r\n").unwrap();
        let mut response = String::new();
        client.read_to_string(&mut response).unwrap();
        handler.join().unwrap().unwrap();
        let (_, body) = response.split_once("\r\n\r\n").unwrap();
        let body: Value = serde_json::from_str(body).unwrap();
        assert_eq!(body["version"], option_env!("CODEX_DELEGATE_PET_VERSION").unwrap_or(env!("CARGO_PKG_VERSION")));
    }

    #[test]
    fn connections_are_capped_and_capacity_returns_when_a_handler_exits() {
        let active = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let mut permits: Vec<_> = (0..MAX_CONNECTIONS)
            .map(|_| ConnectionPermit::acquire(&active).expect("connection within cap"))
            .collect();
        assert!(ConnectionPermit::acquire(&active).is_none());
        permits.pop();
        let replacement = ConnectionPermit::acquire(&active).expect("released capacity");
        assert!(ConnectionPermit::acquire(&active).is_none());
        drop(permits);
        drop(replacement);
        assert_eq!(active.load(Ordering::Relaxed), 0);
    }

    #[test]
    fn leader_timestamps_are_non_negative_safe_integers() {
        let mut event = json!({ "v": 1, "source": "leader", "type": "prompt",
            "team": "123", "session": null, "at": 0 });
        for at in [json!(0), json!(9_007_199_254_740_991_u64)] {
            event["at"] = at;
            assert!(valid_event(&event));
        }
        for at in [json!(-1), json!(1.5), json!(9_007_199_254_740_992_u64), json!("1"), Value::Null] {
            event["at"] = at;
            assert!(!valid_event(&event));
        }
    }
}
