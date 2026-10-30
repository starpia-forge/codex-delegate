use serde_json::{Map, Value};
use std::path::PathBuf;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Lang { En, Ko }

impl Lang {
    pub fn code(self) -> &'static str { match self { Self::En => "en", Self::Ko => "ko" } }
}

pub fn windows_ui_language() -> u16 {
    #[cfg(windows)]
    { unsafe { windows::Win32::Globalization::GetUserDefaultUILanguage() } }
    #[cfg(not(windows))]
    { 0 }
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Preferences {
    pub hidden: Option<bool>,
    pub name_tags: Option<bool>,
    // Only an explicit choice belongs here, never the effective display language.
    pub language: Option<Lang>,
}

impl Preferences {
    pub fn show_name_tags(self) -> bool { self.name_tags.unwrap_or(true) }

    pub fn effective_language(self, windows_language: u16) -> Lang {
        self.language.unwrap_or_else(|| {
            if windows_language & 0x03ff == 0x12 { Lang::Ko } else { Lang::En }
        })
    }

    pub fn json(self) -> Value {
        let mut fields = Map::new();
        if let Some(hidden) = self.hidden { fields.insert("hidden".into(), hidden.into()); }
        if let Some(name_tags) = self.name_tags { fields.insert("nameTags".into(), name_tags.into()); }
        if let Some(language) = self.language {
            fields.insert("language".into(), language.code().into());
        }
        fields.into()
    }
    pub fn parse(input: &str) -> Self {
        let value: Value = serde_json::from_str(input).unwrap_or(Value::Null);
        Self { hidden: value["hidden"].as_bool(), name_tags: value["nameTags"].as_bool(), language: match value["language"].as_str() {
            Some("en") => Some(Lang::En), Some("ko") => Some(Lang::Ko), _ => None,
        } }
    }
}

pub struct PreferenceStore { path: PathBuf, value: Preferences, unknown: Map<String, Value> }
impl PreferenceStore {
    pub fn load(path: PathBuf) -> Self {
        let input = std::fs::read_to_string(&path).unwrap_or_default();
        let value = Preferences::parse(&input);
        let mut unknown = serde_json::from_str::<Value>(&input).ok()
            .and_then(|value| value.as_object().cloned()).unwrap_or_default();
        unknown.remove("hidden");
        unknown.remove("nameTags");
        unknown.remove("language");
        Self { path, value, unknown }
    }
    pub fn current(&self) -> Preferences { self.value }
    pub fn set_hidden(&mut self, hidden: bool) -> std::io::Result<()> {
        self.value.hidden = Some(hidden);
        self.save()
    }
    pub fn set_name_tags(&mut self, enabled: bool) -> std::io::Result<()> {
        self.value.name_tags = Some(enabled);
        self.save()
    }
    pub fn toggle_language(&mut self, windows_language: u16) -> std::io::Result<()> {
        self.value.language = Some(match self.value.effective_language(windows_language) {
            Lang::En => Lang::Ko, Lang::Ko => Lang::En,
        });
        self.save()
    }
    fn save(&self) -> std::io::Result<()> {
        let temp = self.path.with_extension(format!("{}.tmp", std::process::id()));
        let mut fields = self.unknown.clone();
        fields.extend(self.value.json().as_object().unwrap().clone());
        let result = std::fs::write(&temp, Value::Object(fields).to_string())
            .and_then(|_| std::fs::rename(&temp, &self.path));
        if let Err(error) = &result {
            eprintln!("cannot save pet preferences: {error}");
            let _ = std::fs::remove_file(&temp);
        }
        result
    }
}

#[cfg(test)]
pub(crate) struct TestDir(pub(crate) PathBuf);
#[cfg(test)]
impl TestDir {
    pub(crate) fn new() -> Self {
        static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        loop {
            let path = std::env::temp_dir().join(format!("pet-prefs-{}-{}", std::process::id(),
                NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed)));
            match std::fs::create_dir(&path) {
                Ok(()) => return Self(path),
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
                Err(error) => panic!("cannot create test directory: {error}"),
            }
        }
    }
}
#[cfg(test)]
impl Drop for TestDir {
    fn drop(&mut self) { let _ = std::fs::remove_dir_all(&self.0); }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn name_tags_default_on_when_absent_or_invalid() {
        assert!(Preferences::default().show_name_tags());
        let dir = TestDir::new();
        assert!(PreferenceStore::load(dir.0.join("missing.json")).current().show_name_tags());
        for input in ["{}", r#"{"hidden":true,"language":"ko"}"#, r#"{"nameTags":"false"}"#, "null", "{"] {
            assert!(Preferences::parse(input).show_name_tags(), "{input}");
        }
        assert!(!Preferences::parse(r#"{"nameTags":false}"#).show_name_tags());
    }

    #[test]
    fn name_tags_round_trip_with_other_and_unknown_preferences() {
        let dir = TestDir::new();
        let path = dir.0.join("pet-preferences.json");
        std::fs::write(&path, r#"{"hidden":true,"language":"ko","future":{"mode":"auto"}}"#).unwrap();
        let mut store = PreferenceStore::load(path.clone());
        for enabled in [false, true] {
            store.set_name_tags(enabled).unwrap();
            let restarted = PreferenceStore::load(path.clone());
            assert_eq!(restarted.current().name_tags, Some(enabled));
            assert_eq!(restarted.current().hidden, Some(true));
            assert_eq!(restarted.current().language, Some(Lang::Ko));
            let saved: Value = serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
            assert_eq!(saved, serde_json::json!({
                "hidden": true, "language": "ko", "nameTags": enabled, "future": {"mode": "auto"}
            }));
        }
    }

    #[test]
    fn toggle_saves_preserve_unknown_top_level_preferences() {
        let dir = TestDir::new();
        let path = dir.0.join("pet-preferences.json");
        std::fs::write(&path, r#"{"hidden":false,"future":{"mode":"auto","values":[1,true]}}"#).unwrap();
        let mut store = PreferenceStore::load(path.clone());
        store.set_hidden(true).unwrap();
        store.toggle_language(0x0409).unwrap();
        let saved: Value = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
        assert_eq!(saved, serde_json::json!({
            "hidden": true, "language": "ko", "future": {"mode": "auto", "values": [1, true]}
        }));
    }

    #[test]
    fn stored_language_wins_otherwise_follow_the_windows_user_ui_language() {
        let defaults = Preferences::default();
        for id in [0x0412, 0x0812] {
            assert_eq!(defaults.effective_language(id), Lang::Ko);
            assert_eq!(Preferences { language: Some(Lang::En), ..defaults }.effective_language(id), Lang::En);
        }
        for id in [0x0409, 0x0809, 0x0411, 0] {
            assert_eq!(defaults.effective_language(id), Lang::En);
            assert_eq!(Preferences { language: Some(Lang::Ko), ..defaults }.effective_language(id), Lang::Ko);
        }
    }

    #[test]
    fn switching_cycles_from_the_effective_language_and_remembers_the_choice() {
        let dir = TestDir::new();
        let path = dir.0.join("pet-preferences.json");
        let mut store = PreferenceStore::load(path.clone());
        store.toggle_language(0x0412).unwrap();
        assert_eq!(store.current().language, Some(Lang::En));
        store.toggle_language(0x0412).unwrap();
        assert_eq!(store.current().language, Some(Lang::Ko));
        store.toggle_language(0x0409).unwrap();
        assert_eq!(PreferenceStore::load(path).current().language, Some(Lang::En));
    }

    #[test]
    fn missing_invalid_and_unknown_preferences_use_defaults() {
        let path = std::env::temp_dir().join(format!("pet-prefs-missing-{}", std::process::id()));
        assert_eq!(PreferenceStore::load(path).current(), Preferences::default());
        for input in ["{", "null", "[]", r#"{"hidden":"true","language":12}"#,
            r#"{"hidden":0,"language":"fr","future":true}"#, r#"{"future":true}"#] {
            assert_eq!(Preferences::parse(input), Preferences::default(), "{input}");
        }
        assert_eq!(Preferences::parse(r#"{"hidden":true,"language":false,"future":1}"#),
            Preferences { hidden: Some(true), language: None, ..Preferences::default() });
    }

    #[test]
    fn preferences_round_trip_and_replace_existing_file_without_a_temp_file() {
        let dir = TestDir::new();
        let path = dir.0.join("pet-preferences.json");
        std::fs::write(&path, r#"{"hidden":true,"language":"ko"}"#).unwrap();
        let mut store = PreferenceStore::load(path.clone());
        store.set_hidden(false).unwrap();
        assert_eq!(PreferenceStore::load(path).current(),
            Preferences { hidden: Some(false), language: Some(Lang::Ko), ..Preferences::default() });
        assert_eq!(std::fs::read_dir(&dir.0).unwrap().count(), 1);
    }

    #[test]
    fn failed_save_keeps_memory_and_old_file_then_retries_the_full_preferences() {
        let dir = TestDir::new();
        let path = dir.0.join("pet-preferences.json");
        let original = r#"{"hidden":false,"language":"en"}"#;
        std::fs::write(&path, original).unwrap();
        let mut store = PreferenceStore::load(path.clone());
        // Windows denies replacement while the old file has no delete sharing.
        use std::os::windows::fs::OpenOptionsExt;
        let held = std::fs::OpenOptions::new().read(true).share_mode(1).open(&path).unwrap();
        assert!(store.set_hidden(true).is_err());
        assert_eq!(store.current(), Preferences { hidden: Some(true), language: Some(Lang::En), ..Preferences::default() });
        assert_eq!(std::fs::read_to_string(&path).unwrap(), original);
        assert_eq!(std::fs::read_dir(&dir.0).unwrap().count(), 1);
        drop(held);
        store.set_hidden(true).unwrap();
        assert_eq!(PreferenceStore::load(path).current(), store.current());
    }

    #[test]
    fn hide_only_does_not_create_a_stored_language() {
        let dir = TestDir::new();
        let path = dir.0.join("pet-preferences.json");
        let mut store = PreferenceStore::load(path.clone());
        assert_eq!(store.current().effective_language(0x0412), Lang::Ko);
        store.set_hidden(true).unwrap();
        let saved: Value = serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(saved, serde_json::json!({ "hidden": true }));
        let restarted = PreferenceStore::load(path).current();
        assert_eq!(restarted.language, None);
        assert_eq!(restarted.hidden, Some(true));
        assert_eq!(restarted.effective_language(0x0409), Lang::En);
    }

    #[test]
    fn explicit_language_survives_visibility_and_a_failed_switch_then_saves_in_full() {
        let dir = TestDir::new();
        let path = dir.0.join("pet-preferences.json");
        let mut store = PreferenceStore::load(path.clone());
        store.toggle_language(0x0409).unwrap();
        store.set_hidden(true).unwrap();
        assert_eq!(PreferenceStore::load(path.clone()).current(),
            Preferences { hidden: Some(true), language: Some(Lang::Ko), ..Preferences::default() });
        let original = std::fs::read_to_string(&path).unwrap();
        use std::os::windows::fs::OpenOptionsExt;
        let held = std::fs::OpenOptions::new().read(true).share_mode(1).open(&path).unwrap();
        assert!(store.toggle_language(0x0412).is_err());
        assert_eq!(store.current().language, Some(Lang::En));
        assert!(store.set_hidden(false).is_err());
        assert_eq!(store.current(), Preferences { hidden: Some(false), language: Some(Lang::En), ..Preferences::default() });
        assert_eq!(std::fs::read_to_string(&path).unwrap(), original);
        assert_eq!(std::fs::read_dir(&dir.0).unwrap().count(), 1);
        drop(held);
        store.set_hidden(true).unwrap();
        let restarted = PreferenceStore::load(path).current();
        assert_eq!(restarted, Preferences { hidden: Some(true), language: Some(Lang::En), ..Preferences::default() });
        assert_eq!(restarted.effective_language(0x0412), Lang::En);
    }

    #[test]
    fn unavailable_directory_still_keeps_the_running_choice() {
        let dir = TestDir::new();
        let mut store = PreferenceStore::load(dir.0.join("missing").join("pet-preferences.json"));
        assert!(store.set_hidden(true).is_err());
        assert_eq!(store.current().hidden, Some(true));
        assert_eq!(store.current().language, None);
        assert_eq!(store.current().effective_language(0x0412), Lang::Ko);
        std::fs::create_dir(dir.0.join("missing")).unwrap();
        store.set_hidden(false).unwrap();
        let saved = std::fs::read_to_string(dir.0.join("missing/pet-preferences.json")).unwrap();
        assert_eq!(serde_json::from_str::<Value>(&saved).unwrap(), serde_json::json!({ "hidden": false }));
    }
}
