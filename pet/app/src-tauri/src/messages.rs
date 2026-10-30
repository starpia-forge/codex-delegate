use crate::prefs::Lang;
use serde_json::Value;
use std::sync::OnceLock;

fn catalogue() -> &'static Value {
    static CATALOGUE: OnceLock<Value> = OnceLock::new();
    CATALOGUE.get_or_init(|| serde_json::from_str(include_str!("../../messages.json"))
        .expect("valid translation catalogue"))
}

#[tauri::command]
pub fn messages() -> Value { catalogue().clone() }

fn lookup<'a>(catalogue: &'a Value, id: &'a str, language: &str) -> &'a str {
    catalogue[id][language].as_str().filter(|text| !text.is_empty())
        .or_else(|| catalogue[id]["en"].as_str()).unwrap_or(id)
}

pub fn text(id: &str, language: Lang) -> &str { lookup(catalogue(), id, language.code()) }

#[cfg(test)]
mod tests {
    use crate::prefs::Lang;

    #[test]
    fn embedded_catalogue_supplies_tray_labels_and_english_fallback() {
        let catalogue = super::messages();
        assert_eq!(super::text("tray.clearAroundCursor", Lang::En), "Clear around cursor");
        assert_eq!(super::text("tray.clearAroundCursor", Lang::Ko), "커서 주변 숨기기");
        assert_eq!(super::text("tray.showNameTags", Lang::En), "Show name tags");
        assert_eq!(super::text("tray.showNameTags", Lang::Ko), "이름표 표시");
        assert_eq!(super::text("tray.showPets", Lang::Ko), "펫 표시");
        assert_eq!(super::text("tray.language", Lang::En), "Language: English");
        assert_eq!(super::text("tray.language", Lang::Ko), "언어: 한국어");
        assert_eq!(super::lookup(&catalogue, "tray.licences", "fr"), "Licences");
    }
}
