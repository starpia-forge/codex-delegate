use crate::{capture, licences, messages::text, prefs::{self, Lang, PreferenceStore}, window, BUNDLE_VERSION};
use serde_json::{json, Value};
use std::sync::{mpsc, Arc, Mutex};
use std::time::Duration;
use tauri::{menu::{CheckMenuItem, Menu, MenuItem}, tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, WebviewWindow};

fn retry_delay(attempt: u32) -> Duration {
    Duration::from_millis((100u64 << attempt.min(6)).min(5000))
}

struct TrayItems {
    show: CheckMenuItem<tauri::Wry>,
    name_tags: CheckMenuItem<tauri::Wry>,
    cursor_clearance: CheckMenuItem<tauri::Wry>,
    licences: MenuItem<tauri::Wry>,
    language: MenuItem<tauri::Wry>,
}
impl TrayItems {
    fn relabel(&self, language: Lang) -> tauri::Result<()> {
        self.show.set_text(text("tray.showPets", language))?;
        self.name_tags.set_text(text("tray.showNameTags", language))?;
        self.cursor_clearance.set_text(text("tray.clearAroundCursor", language))?;
        self.licences.set_text(text("tray.licences", language))?;
        self.language.set_text(text("tray.language", language))
    }
}

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
    retry_attempt: u32,
    frame: Option<mpsc::Sender<()>>,
}
impl Transition {
    fn hidden(&self) -> bool { self.preferences.current().hidden.unwrap_or(false) }
    fn show_name_tags(&self) -> bool { self.preferences.current().show_name_tags() }
    fn clear_around_cursor(&self) -> bool { self.preferences.current().clear_around_cursor() }
    fn language(&self) -> Lang { self.preferences.current().effective_language(self.windows_language) }
    fn active(&self, generation: u64) -> bool {
        self.generation == generation && self.running && self.pending && !self.hidden()
    }
}

impl Visibility {
    pub fn new(preferences: PreferenceStore) -> Self {
        Self(Arc::new(Mutex::new(Transition { preferences, windows_language: prefs::windows_ui_language(),
            generation: 0, ready: false,
            pending: true, running: false, retry_requested: false, retry_attempt: 0, frame: None })))
    }

    pub fn preferences(&self) -> Value {
        let state = self.0.lock().unwrap();
        let mut preferences = state.preferences.current().json();
        // The renderer needs the effective language; this never writes it to disk.
        preferences["language"] = state.language().code().into();
        preferences["nameTags"] = state.show_name_tags().into();
        preferences["cursorClearance"] = state.clear_around_cursor().into();
        preferences
    }

    pub fn language(&self) -> Lang { self.0.lock().unwrap().language() }

    pub fn cursor_clearance_active(&self, paused: bool) -> bool {
        let state = self.0.lock().unwrap();
        state.clear_around_cursor() && !state.hidden() && !paused
    }

    fn toggle_name_tags(&self, app: &AppHandle) -> bool {
        let mut state = self.0.lock().unwrap();
        let enabled = !state.show_name_tags();
        let _ = state.preferences.set_name_tags(enabled); // Store reports failures; memory wins.
        let _ = app.emit_to("main", "pet-name-tags", json!({ "nameTags": enabled }));
        enabled
    }

    fn toggle_cursor_clearance(&self, app: &AppHandle) -> bool {
        let mut state = self.0.lock().unwrap();
        let enabled = !state.clear_around_cursor();
        let _ = state.preferences.set_cursor_clearance(enabled); // Store reports failures; memory wins.
        let _ = app.emit_to("main", "pet-cursor-clearance", json!({ "cursorClearance": enabled }));
        enabled
    }

    fn toggle_language(&self, app: &AppHandle, items: &TrayItems) {
        let mut state = self.0.lock().unwrap();
        let windows_language = state.windows_language;
        let _ = state.preferences.toggle_language(windows_language);
        let current = state.language();
        let _ = items.relabel(current);
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
            state.retry_attempt = 0;
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
        self.retry_for(app, None);
    }

    fn retry_for(&self, app: &AppHandle, expected_generation: Option<u64>) {
        let Some(win) = app.get_webview_window("main") else { return };
        let (generation, receive) = {
            let mut state = self.0.lock().unwrap();
            if !state.ready || state.hidden() || !state.pending { return; }
            // A sleeping retry must never start work for a later hide/show cycle
            // or supersede an attempt started by a capture/tray trigger.
            if expected_generation.is_some_and(|expected| state.generation != expected) { return; }
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
            let delay = {
                let mut state = visibility.0.lock().unwrap();
                if state.generation != generation { return; }
                state.running = false;
                state.frame = None;
                if let Err(error) = result { eprintln!("cannot show pets (will retry): {error}"); }
                let requested = std::mem::take(&mut state.retry_requested);
                if !state.pending || state.hidden() {
                    state.retry_attempt = 0;
                    return;
                }
                let delay = if requested { Duration::ZERO } else { retry_delay(state.retry_attempt) };
                state.retry_attempt = state.retry_attempt.saturating_add(1);
                delay
            };
            std::thread::sleep(delay);
            visibility.retry_for(win.app_handle(), Some(generation));
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
    let (hidden, name_tags, cursor_clearance, current) = {
        let visibility = app.state::<Visibility>();
        let state = visibility.0.lock().unwrap();
        (state.hidden(), state.show_name_tags(), state.clear_around_cursor(), state.language())
    };
    let items = TrayItems {
        show: CheckMenuItem::with_id(app, "show-pets", "", true, !hidden, None::<&str>)?,
        name_tags: CheckMenuItem::with_id(app, "show-name-tags", "", true, name_tags, None::<&str>)?,
        cursor_clearance: CheckMenuItem::with_id(app, "clear-around-cursor", "", true, cursor_clearance, None::<&str>)?,
        licences: MenuItem::with_id(app, "licences", "", true, None::<&str>)?,
        language: MenuItem::with_id(app, "language", "", true, None::<&str>)?,
    };
    items.relabel(current)?;
    let menu = Menu::with_items(app, &[&items.show, &items.name_tags, &items.cursor_clearance, &items.licences, &items.language])?;
    let click_show = items.show.clone();
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
                let _ = items.show.set_checked(!hidden);
            } else if event.id.as_ref() == "show-name-tags" {
                let enabled = app.state::<Visibility>().toggle_name_tags(app);
                let _ = items.name_tags.set_checked(enabled);
            } else if event.id.as_ref() == "clear-around-cursor" {
                let enabled = app.state::<Visibility>().toggle_cursor_clearance(app);
                let _ = items.cursor_clearance.set_checked(enabled);
            } else if event.id.as_ref() == "language" {
                app.state::<Visibility>().toggle_language(app, &items);
            } else if event.id.as_ref() == "licences" {
                licences::open(app);
            }
        })
        .build(app)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::prefs::TestDir;

    #[test]
    fn cursor_clearance_gate_and_renderer_follow_the_stored_choice() {
        let dir = TestDir::new();
        let path = dir.0.join("pet-preferences.json");
        let defaults = Visibility::new(PreferenceStore::load(path.clone()));
        assert!(defaults.cursor_clearance_active(false));
        assert_eq!(defaults.preferences()["cursorClearance"], true);
        let mut store = PreferenceStore::load(path.clone());
        for enabled in [false, true] {
            store.set_cursor_clearance(enabled).unwrap();
            for hidden in [true, false] {
                store.set_hidden(hidden).unwrap();
                let visibility = Visibility::new(PreferenceStore::load(path.clone()));
                assert_eq!(visibility.preferences()["cursorClearance"], enabled);
                assert_eq!(visibility.cursor_clearance_active(false), enabled && !hidden);
                assert!(!visibility.cursor_clearance_active(true));
            }
        }
    }

    #[test]
    fn renderer_preferences_restore_name_tags_even_while_pets_are_hidden() {
        let dir = TestDir::new();
        let path = dir.0.join("pet-preferences.json");
        assert_eq!(Visibility::new(PreferenceStore::load(path.clone())).preferences()["nameTags"], true);
        let mut store = PreferenceStore::load(path.clone());
        store.set_hidden(true).unwrap();
        store.set_name_tags(false).unwrap();
        let visibility = Visibility::new(store);
        assert_eq!(visibility.preferences()["nameTags"], false);
        assert_eq!(visibility.preferences()["hidden"], true);
        let restarted = PreferenceStore::load(path);
        assert_eq!(restarted.current().name_tags, Some(false));
        let visibility = Visibility::new(restarted);
        assert_eq!(visibility.preferences()["nameTags"], false);
        assert_eq!(visibility.preferences()["hidden"], true);
    }

    #[test]
    fn failed_show_backoff_grows_to_a_five_second_cap_without_overflow() {
        let delays: Vec<_> = (0..8).map(|attempt| retry_delay(attempt).as_millis()).collect();
        assert_eq!(delays, [100, 200, 400, 800, 1600, 3200, 5000, 5000]);
        assert_eq!(retry_delay(u32::MAX), Duration::from_secs(5));
    }
}
