use crate::{prefs::Lang, show::Visibility};
use serde_json::{json, Value};

pub const TEXT: &str = include_str!(concat!(env!("OUT_DIR"), "/THIRD-PARTY-NOTICES.txt"));
const THIRD_PARTY: &str = include_str!(concat!(env!("OUT_DIR"), "/THIRD-PARTY-NOTICES.txt.crates"));
const DEVELOPMENT_STUB: &str = include_str!("../../../notices/development-stub.txt");

pub fn is_stub() -> bool {
    TEXT.contains(DEVELOPMENT_STUB.lines().next().expect("development stub marker"))
}

fn document(language: Lang) -> Value {
    json!({
        "text": TEXT,
        "third_party": THIRD_PARTY,
        "is_stub": is_stub(),
        "language": language.code(),
        "project": include_str!("../../../../LICENSE"),
        "fan_art": include_str!("../../../notices/fan-art-notice.txt"),
    })
}

#[tauri::command]
pub fn notices(state: tauri::State<Visibility>) -> Value { document(state.language()) }

#[cfg(test)]
mod tests {
    use super::*;
    use crate::prefs::Lang;

    #[test]
    fn payload_serves_embedded_notices_and_original_project_and_artwork_terms() {
        let payload = document(Lang::Ko);
        assert_eq!(payload["text"], TEXT);
        assert_eq!(payload["third_party"].as_str(), Some(THIRD_PARTY));
        assert_eq!(payload["is_stub"], is_stub());
        assert_eq!(payload["language"], "ko");
        assert_eq!(payload["project"], include_str!("../../../../LICENSE"));
        assert_eq!(payload["fan_art"], include_str!("../../../notices/fan-art-notice.txt"));
    }
}
