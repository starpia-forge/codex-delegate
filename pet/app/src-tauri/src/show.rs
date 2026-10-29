use crate::{capture, licences, messages::text, prefs::{self, Lang, PreferenceStore}, window, BUNDLE_VERSION};
use serde_json::{json, Value};
use std::sync::{mpsc, Arc, Mutex};
use std::time::Duration;
use tauri::{menu::{CheckMenuItem, Menu, MenuItem}, tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, WebviewWindow};

// One owner serializes all preference writes and visibility transitions. The
// generation invalidates queued UI work as well as an outstanding frame ack.
#[derive(Clone)]
pub struct Visibility(Arc<Mutex<Transition>>);
struct Transition {
    preferences: PreferenceStore,
    windows_language: u16,
    generation: u64,
    ready: bool,
    pending: bool,
    running: bool,
    retry_requested: bool,
    frame: Option<mpsc::Sender<()>>,
}
impl Transition {
    fn hidden(&self) -> bool { self.preferences.current().hidden.unwrap_or(false) }
    fn language(&self) -> Lang { self.preferences.current().effective_language(self.windows_language) }
    fn active(&self, generation: u64) -> bool {
        self.generation == generation && self.running && self.pending && !self.hidden()
    }
}

impl Visibility {
    pub fn new(preferences: PreferenceStore) -> Self {
        Self(Arc::new(Mutex::new(Transition { preferences, windows_language: prefs::windows_ui_language(),
            generation: 0, ready: false,
            pending: true, running: false, retry_requested: false, frame: None })))
    }

    pub fn preferences(&self) -> Value {
        let state = self.0.lock().unwrap();
        let mut preferences = state.preferences.current().json();
        // The renderer needs the effective language; this never writes it to disk.
        preferences["language"] = state.language().code().into();
        preferences
    }

    pub fn language(&self) -> Lang { self.0.lock().unwrap().language() }

    fn toggle_language(&self, app: &AppHandle, show: &CheckMenuItem<tauri::Wry>,
        licences: &MenuItem<tauri::Wry>, language: &MenuItem<tauri::Wry>) {
        let mut state = self.0.lock().unwrap();
        let windows_language = state.windows_language;
        let _ = state.preferences.toggle_language(windows_language);
        let current = state.language();
        let _ = show.set_text(text("tray.showPets", current));
        let _ = licences.set_text(text("tray.licences", current));
        let _ = language.set_text(text("tray.language", current));
        licences::set_language(app, current);
        // Broadcast reaches both webviews. Keep the tray tooltip
        // as the untranslated app name and version.
        let _ = app.emit("pet-language", json!({ "language": current.code() }));
    }

    pub fn start(&self, app: &AppHandle) {
        self.0.lock().unwrap().ready = true;
        self.retry(app);
    }

    // Tray callbacks run on the UI thread, as does the final show callback.
    // A hide therefore cannot be followed by a stale, already-queued show.
    fn toggle(&self, app: &AppHandle) -> bool {
        let hidden = {
            let mut state = self.0.lock().unwrap();
            let hidden = !state.hidden();
            let _ = state.preferences.set_hidden(hidden); // Store reports failures; memory wins.
            state.generation += 1;
            state.pending = !hidden;
            state.running = false;
            state.retry_requested = false;
            state.frame = None; // Wake a cancelled ack wait immediately.
            if hidden {
                if let Some(win) = app.get_webview_window("main") {
                    if let Err(error) = win.hide() { eprintln!("cannot hide pets: {error}"); }
                }
            }
            let _ = app.emit_to("main", "pet-visibility", json!({ "hidden": hidden }));
            hidden
        };
        self.retry(app);
        hidden
    }

    pub fn retry(&self, app: &AppHandle) {
        let Some(win) = app.get_webview_window("main") else { return };
        let (generation, receive) = {
            let mut state = self.0.lock().unwrap();
            if !state.ready || state.hidden() || !state.pending { return; }
            if state.running {
                state.retry_requested = true;
                return;
            }
            state.generation += 1;
            state.running = true;
            let (send, receive) = mpsc::channel();
            state.frame = Some(send);
            (state.generation, receive)
        };
        let visibility = self.clone();
        std::thread::spawn(move || {
            let result = visibility.ui(&win, generation, move |win, _| {
                window::refresh(win, &win.state::<window::Fullscreen>(), true)?;
                win.set_ignore_cursor_events(true).map_err(|e| e.to_string())?;
                win.state::<capture::Capture>().refresh_now(win, true)?;
                win.emit("pet-frame", json!({ "id": generation })).map_err(|e| e.to_string())
            }).and_then(|()| {
                // Only this background thread waits. A hidden webview need not
                // deliver rAF, and a stalled renderer must not stall the tray.
                let _ = receive.recv_timeout(Duration::from_millis(500));
                visibility.ui(&win, generation, |win, state| {
                    // Computer use or fullscreen may have changed during the ack.
                    // All checks and show execute in this single UI callback.
                    window::refresh(win, &win.state::<window::Fullscreen>(), true)?;
                    win.state::<capture::Capture>().refresh_now(win, true)?;
                    win.show().map_err(|e| e.to_string())?;
                    // The previous cold-start path re-applied click-through after show; keep that.
                    win.set_ignore_cursor_events(true).map_err(|e| e.to_string())?;
                    state.pending = false;
                    Ok(())
                })
            });
            let retry = {
                let mut state = visibility.0.lock().unwrap();
                if state.generation != generation { return; }
                state.running = false;
                state.frame = None;
                if let Err(error) = result { eprintln!("cannot show pets (will retry on capture or tray change): {error}"); }
                std::mem::take(&mut state.retry_requested)
            };
            if retry { visibility.retry(win.app_handle()); }
        });
    }

    fn ui<F>(&self, win: &WebviewWindow, generation: u64, action: F) -> Result<(), String>
    where F: FnOnce(&WebviewWindow, &mut Transition) -> Result<(), String> + Send + 'static {
        let (send, receive) = mpsc::sync_channel(1);
        let visibility = self.clone();
        let window = win.clone();
        win.run_on_main_thread(move || {
            let mut state = visibility.0.lock().unwrap();
            let result = if state.active(generation) { action(&window, &mut state) }
                else { Err("show cancelled".into()) };
            let _ = send.send(result);
        }).map_err(|e| e.to_string())?;
        receive.recv_timeout(Duration::from_secs(2)).map_err(|e| e.to_string())?
    }
}

#[tauri::command]
pub fn pet_preferences(state: tauri::State<Visibility>) -> Value { state.preferences() }

#[tauri::command]
pub fn frame_ready(id: u64, state: tauri::State<Visibility>) {
    let mut state = state.0.lock().unwrap();
    if state.active(id) {
        if let Some(send) = state.frame.take() { let _ = send.send(()); }
    }
}

pub fn create_tray(app: &AppHandle) -> tauri::Result<()> {
    let (hidden, current) = {
        let visibility = app.state::<Visibility>();
        let state = visibility.0.lock().unwrap();
        (state.hidden(), state.language())
    };
    let show = CheckMenuItem::with_id(app, "show-pets", text("tray.showPets", current), true, !hidden, None::<&str>)?;
    let licences = MenuItem::with_id(app, "licences", text("tray.licences", current), true, None::<&str>)?;
    let language = MenuItem::with_id(app, "language", text("tray.language", current), true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &licences, &language])?;
    let click_show = show.clone();
    let icon = app.default_window_icon().expect("pet app icon").clone();
    TrayIconBuilder::with_id("pets")
        .icon(icon)
        .tooltip(format!("codex-delegate pet {BUNDLE_VERSION}"))
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(move |tray, event| {
            if matches!(event, TrayIconEvent::Click { button: MouseButton::Left,
                button_state: MouseButtonState::Up, .. }) {
                let app = tray.app_handle();
                let hidden = app.state::<Visibility>().toggle(app);
                let _ = click_show.set_checked(!hidden);
            }
        })
        .on_menu_event(move |app, event| {
            if event.id.as_ref() == "show-pets" {
                let hidden = app.state::<Visibility>().toggle(app);
                let _ = show.set_checked(!hidden);
            } else if event.id.as_ref() == "language" {
                app.state::<Visibility>().toggle_language(app, &show, &licences, &language);
            } else if event.id.as_ref() == "licences" {
                if let Err(error) = licences::open(app, app.state::<Visibility>().language()) {
                    eprintln!("cannot open licences: {error}");
                }
            }
        })
        .build(app)?;
    Ok(())
}
