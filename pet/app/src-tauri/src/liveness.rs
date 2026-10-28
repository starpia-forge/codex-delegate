use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};
use windows::Win32::Foundation::{CloseHandle, ERROR_ACCESS_DENIED, FILETIME, STILL_ACTIVE};
use windows::Win32::System::Threading::{GetExitCodeProcess, GetProcessTimes, OpenProcess,
    PROCESS_QUERY_LIMITED_INFORMATION};

pub type LeaderSessions = Arc<Mutex<Sessions>>;

struct Team {
    at: u64,
    started_at: Option<u64>,
    ended: bool,
}

pub struct Sessions {
    directory: PathBuf,
    teams: HashMap<String, Team>,
}

fn timestamp() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64
}

fn pid(team: &str) -> Option<u32> {
    if team.is_empty() || !team.bytes().all(|b| b.is_ascii_digit()) { return None; }
    team.parse().ok().filter(|pid| *pid != 0)
}

fn process_alive(team: &str, started_at: Option<u64>) -> bool {
    let Some(pid) = pid(team) else { return false };
    unsafe {
        let process = match OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) {
            Ok(process) => process,
            // An inaccessible process is not evidence of death.
            Err(error) => return error.code() == windows::core::HRESULT::from_win32(ERROR_ACCESS_DENIED.0),
        };
        let mut code = 0;
        let mut alive = GetExitCodeProcess(process, &mut code).is_err() || code == STILL_ACTIVE.0 as u32;
        if alive {
            if let Some(started_at) = started_at {
                let mut creation = FILETIME::default();
                let mut exit = FILETIME::default();
                let mut kernel = FILETIME::default();
                let mut user = FILETIME::default();
                if GetProcessTimes(process, &mut creation, &mut exit, &mut kernel, &mut user).is_ok() {
                    let ticks = ((creation.dwHighDateTime as u64) << 32) | creation.dwLowDateTime as u64;
                    // FILETIME is 100 ns since 1601; records use Unix milliseconds.
                    let created_at = ticks / 10_000 - 11_644_473_600_000;
                    alive = created_at <= started_at;
                }
            }
        }
        let _ = CloseHandle(process);
        alive
    }
}

impl Sessions {
    pub fn new(state: PathBuf) -> Self {
        Self { directory: state.join("sessions"), teams: HashMap::new() }
    }

    pub fn restore(&mut self, app: &AppHandle) -> Result<(), String> {
        let mut records = Vec::new();
        if let Ok(entries) = std::fs::read_dir(&self.directory) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|s| s.to_str()) != Some("json") { continue; }
                let Ok(bytes) = std::fs::read(&path) else { continue };
                let Ok(record) = serde_json::from_slice::<Value>(&bytes) else { continue };
                let Some(team) = record["team"].as_str() else { continue };
                if pid(team).is_none() || path.file_stem().and_then(|s| s.to_str()) != Some(team)
                    || record["at"].as_u64().is_none()
                    || !record.get("session").is_some_and(|s| s.is_null() || s.is_string()) { continue; }
                records.push(record);
            }
        }
        records.sort_by_key(|record| record["at"].as_u64().unwrap());
        for record in records {
            let team = record["team"].as_str().unwrap();
            let at = record["at"].as_u64().unwrap();
            if process_alive(team, Some(at)) {
                let event = json!({ "v": 1, "source": "leader", "team": team,
                    "session": record["session"], "at": at, "type": "session-start" });
                app.emit("pet-event", &event).map_err(|e| e.to_string())?;
                self.observe(&event);
            } else {
                let at = timestamp();
                app.emit("pet-liveness", json!({ "team": team, "alive": false, "at": at }))
                    .map_err(|e| e.to_string())?;
                self.remove_record(team, at);
                self.teams.insert(team.into(), Team { at, started_at: None, ended: true });
            }
        }
        Ok(())
    }

    fn observe(&mut self, event: &Value) {
        if event["source"] != "leader" { return; }
        let Some(team) = event["team"].as_str().filter(|team| pid(team).is_some()) else { return };
        let Some(at) = event["at"].as_u64() else { return };
        let start = event["type"] == "session-start";
        let previous = self.teams.get(team);
        if previous.is_some_and(|p| at < p.at || (p.ended && (!start || at <= p.at))) { return; }
        let started_at = if start { Some(at) } else { previous.and_then(|p| p.started_at) };
        self.teams.insert(team.into(), Team { at, started_at, ended: event["type"] == "session-end" });
    }

    fn remove_record(&self, team: &str, at: u64) {
        let path = self.directory.join(format!("{team}.json"));
        let Ok(bytes) = std::fs::read(&path) else { return };
        let Ok(record) = serde_json::from_slice::<Value>(&bytes) else { return };
        if record["team"] == team && record["at"].as_u64().is_some_and(|start| start <= at) {
            let _ = std::fs::remove_file(path);
        }
    }

    fn poll(&mut self, app: &AppHandle) {
        for key in self.teams.keys().cloned().collect::<Vec<_>>() {
            let team = &self.teams[&key];
            if team.ended { continue; }
            let alive = process_alive(&key, team.started_at);
            let at = timestamp();
            if app.emit("pet-liveness", json!({ "team": key, "alive": alive, "at": at })).is_ok() && !alive {
                self.remove_record(&key, at);
                let team = self.teams.get_mut(&key).unwrap();
                team.at = at;
                team.ended = true;
            }
        }
    }
}

// Serialize accepted events and process checks, including their delivery order.
pub fn emit_event(app: &AppHandle, event: &Value) -> bool {
    let sessions = app.state::<LeaderSessions>();
    let mut sessions = sessions.lock().unwrap();
    if app.emit("pet-event", event).is_err() { return false; }
    sessions.observe(event);
    true
}

pub fn watch(app: AppHandle, ready: crate::Ready, sessions: LeaderSessions) {
    loop {
        std::thread::sleep(Duration::from_secs(5));
        if ready.load(std::sync::atomic::Ordering::Acquire) {
            sessions.lock().unwrap().poll(&app);
        }
    }
}
