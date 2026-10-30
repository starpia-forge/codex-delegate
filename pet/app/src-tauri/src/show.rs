use crate::{capture, licences, messages::text, prefs::{self, Lang, PreferenceStore}, tray_art::{self, TrayArt}, window, BUNDLE_VERSION};
use serde_json::{json, Value};
use std::sync::{mpsc, Arc, Mutex};
use std::time::Duration;
use tauri::{menu::{CheckMenuItem, Menu, MenuItem, Submenu}, tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, WebviewWindow};

fn retry_delay(attempt: u32) -> Duration {
    Duration::from_millis((100u64 << attempt.min(6)).min(5000))
}

fn language_submenu_label(language: Lang) -> String {
    let translated = text("tray.language", language);
    if language == Lang::En { translated.into() } else { format!("{translated} (Language)") }
}

struct LanguageChoice {
    lang: Lang,
    menu_id: &'static str,
    endonym: &'static str,
}

const LANGUAGES: [LanguageChoice; 2] = [
    LanguageChoice { lang: Lang::En, menu_id: "language-en", endonym: "English" },
    LanguageChoice { lang: Lang::Ko, menu_id: "language-ko", endonym: "한국어" },
];

fn language_choices(current: Lang) -> impl Iterator<Item = (&'static LanguageChoice, bool)> {
    LANGUAGES.iter().map(move |choice| (choice, choice.lang == current))
}

fn language_for_menu_id(id: &str) -> Option<Lang> {
    LANGUAGES.iter().find(|choice| choice.menu_id == id).map(|choice| choice.lang)
}

struct TrayItems {
    show: CheckMenuItem<tauri::Wry>,
    name_tags: CheckMenuItem<tauri::Wry>,
    cursor_clearance: CheckMenuItem<tauri::Wry>,
    licences: MenuItem<tauri::Wry>,
    language_menu: Submenu<tauri::Wry>,
    language_items: Vec<(Lang, CheckMenuItem<tauri::Wry>)>,
}
impl TrayItems {
    fn relabel(&self, language: Lang) -> tauri::Result<()> {
        let mut first_error = None;
        let mut attempt = |result: tauri::Result<()>| {
            if let Err(error) = result { first_error.get_or_insert(error); }
        };
        // Native check items toggle before dispatch. Restore every check first,
        // and attempt all updates even if a native menu operation fails.
        for (lang, item) in &self.language_items {
            attempt(item.set_checked(*lang == language));
        }
        attempt(self.show.set_text(text("tray.showPets", language)));
        attempt(self.name_tags.set_text(text("tray.showNameTags", language)));
        attempt(self.cursor_clearance.set_text(text("tray.clearAroundCursor", language)));
        attempt(self.licences.set_text(text("tray.licences", language)));
        attempt(self.language_menu.set_text(language_submenu_label(language)));
        first_error.map_or(Ok(()), Err)
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
    fn cursor_clearance(&self) -> bool { self.preferences.current().cursor_clearance() }
    fn language(&self) -> Lang { self.preferences.current().effective_language(self.windows_language) }
    fn choose_language(&mut self, language: Lang) -> bool {
        let previous = self.language();
        let _ = self.preferences.set_language(language); // Store reports failures; memory wins.
        self.language() != previous
    }
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
        preferences["cursorClearance"] = state.cursor_clearance().into();
        preferences
    }

    pub fn language(&self) -> Lang { self.0.lock().unwrap().language() }

    pub fn cursor_clearance_active(&self, paused: bool) -> bool {
        let state = self.0.lock().unwrap();
        state.cursor_clearance() && !state.hidden() && !paused
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
        let enabled = !state.cursor_clearance();
        let _ = state.preferences.set_cursor_clearance(enabled); // Store reports failures; memory wins.
        let _ = app.emit_to("main", "pet-cursor-clearance", json!({ "cursorClearance": enabled }));
        enabled
    }

    fn set_language(&self, app: &AppHandle, items: &TrayItems, language: Lang) {
        let mut state = self.0.lock().unwrap();
        let changed = state.choose_language(language);
        let current = state.language();
        // Native check items toggle before dispatch, including the current one.
        // Always restore exactly one check, even when the language is unchanged.
        let _ = items.relabel(current);
        if !changed { return; }
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
        (state.hidden(), state.show_name_tags(), state.cursor_clearance(), state.language())
    };
    let language_menu = Submenu::with_id(app, "language", "", true)?;
    let mut language_items = Vec::new();
    for (choice, checked) in language_choices(current) {
        let item = CheckMenuItem::with_id(app, choice.menu_id, choice.endonym, true, checked, None::<&str>)?;
        language_menu.append(&item)?;
        language_items.push((choice.lang, item));
    }
    let items = TrayItems {
        show: CheckMenuItem::with_id(app, "show-pets", "", true, !hidden, None::<&str>)?,
        name_tags: CheckMenuItem::with_id(app, "show-name-tags", "", true, name_tags, None::<&str>)?,
        cursor_clearance: CheckMenuItem::with_id(app, "clear-around-cursor", "", true, cursor_clearance, None::<&str>)?,
        licences: MenuItem::with_id(app, "licences", "", true, None::<&str>)?,
        language_menu,
        language_items,
    };
    items.relabel(current)?;
    let menu = Menu::with_items(app, &[&items.show, &items.name_tags, &items.cursor_clearance, &items.licences, &items.language_menu])?;
    let click_show = items.show.clone();
    // The icon's pose follows the Show pets check: peeking when shown, ducked when hidden.
    let art = TrayArt::new(tray_art::small_icon_size());
    let click_art = art.clone();
    TrayIconBuilder::with_id("pets")
        .icon(art.image(hidden))
        .tooltip(format!("codex-delegate pet {BUNDLE_VERSION}"))
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(move |tray, event| {
            if matches!(event, TrayIconEvent::Click { button: MouseButton::Left,
                button_state: MouseButtonState::Up, .. }) {
                let app = tray.app_handle();
                let hidden = app.state::<Visibility>().toggle(app);
                let _ = click_show.set_checked(!hidden);
                let _ = tray.set_icon(Some(click_art.image(hidden)));
            }
        })
        .on_menu_event(move |app, event| {
            if event.id.as_ref() == "show-pets" {
                let hidden = app.state::<Visibility>().toggle(app);
                let _ = items.show.set_checked(!hidden);
                if let Some(tray) = app.tray_by_id("pets") { let _ = tray.set_icon(Some(art.image(hidden))); }
            } else if event.id.as_ref() == "show-name-tags" {
                let enabled = app.state::<Visibility>().toggle_name_tags(app);
                let _ = items.name_tags.set_checked(enabled);
            } else if event.id.as_ref() == "clear-around-cursor" {
                let enabled = app.state::<Visibility>().toggle_cursor_clearance(app);
                let _ = items.cursor_clearance.set_checked(enabled);
            } else if let Some(language) = language_for_menu_id(event.id.as_ref()) {
                app.state::<Visibility>().set_language(app, &items, language);
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
    fn choosing_a_language_stores_the_choice_and_reports_only_effective_changes() {
        let dir = TestDir::new();
        let mut state = Transition {
            preferences: PreferenceStore::load(dir.0.join("pet-preferences.json")),
            windows_language: 0x0412,
            generation: 0, ready: false, pending: true, running: false,
            retry_requested: false, retry_attempt: 0, frame: None,
        };
        assert_eq!(state.preferences.current().language, None);
        assert_eq!(state.language(), Lang::Ko);

        assert!(!state.choose_language(Lang::Ko));
        assert_eq!(state.language(), Lang::Ko);
        assert_eq!(state.preferences.current().language, Some(Lang::Ko));

        assert!(state.choose_language(Lang::En));
        assert_eq!(state.language(), Lang::En);
        assert!(!state.choose_language(Lang::En));
        assert_eq!(state.language(), Lang::En);
    }

    #[test]
    fn language_submenu_label_always_includes_the_english_word() {
        assert_eq!(language_submenu_label(Lang::En), "Language");
        assert_eq!(language_submenu_label(Lang::Ko), "언어 (Language)");
    }

    #[test]
    fn language_choices_keep_endonyms_and_check_only_the_effective_language() {
        use crate::prefs::Preferences;
        for (stored, windows, expected) in [
            (None, 0x0412, [("language-en", "English", false), ("language-ko", "한국어", true)]),
            (None, 0x0409, [("language-en", "English", true), ("language-ko", "한국어", false)]),
            (Some(Lang::En), 0x0412, [("language-en", "English", true), ("language-ko", "한국어", false)]),
            (Some(Lang::Ko), 0x0409, [("language-en", "English", false), ("language-ko", "한국어", true)]),
        ] {
            let effective = Preferences { language: stored, ..Preferences::default() }.effective_language(windows);
            let choices: Vec<_> = language_choices(effective)
                .map(|(choice, checked)| (choice.menu_id, choice.endonym, checked)).collect();
            assert_eq!(choices, expected);
        }
    }

    #[test]
    fn only_language_choice_menu_ids_select_a_language() {
        assert_eq!(language_for_menu_id("language-en"), Some(Lang::En));
        assert_eq!(language_for_menu_id("language-ko"), Some(Lang::Ko));
        for id in ["language", "licences", "show-pets", "language-fr", ""] {
            assert_eq!(language_for_menu_id(id), None, "{id}");
        }
    }

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
