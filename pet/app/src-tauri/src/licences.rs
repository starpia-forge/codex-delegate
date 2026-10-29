use crate::{messages::text, prefs::Lang};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{utils::config::WindowConfig, AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

fn window_config(language: Lang) -> WindowConfig {
    WindowConfig {
        label: "licences".into(),
        url: WebviewUrl::App("licences.html".into()),
        title: text("licences.title", language).into(),
        width: 760.0,
        height: 640.0,
        min_width: Some(360.0),
        min_height: Some(240.0),
        center: true,
        decorations: true,
        focus: true,
        focusable: true,
        resizable: true,
        skip_taskbar: false,
        always_on_top: false,
        transparent: false,
        content_protected: false,
        ..Default::default()
    }
}

static OPENING: AtomicBool = AtomicBool::new(false);
struct Opening;
impl Drop for Opening {
    fn drop(&mut self) { OPENING.store(false, Ordering::Release); }
}

// Window creation must leave the synchronous tray handler on Windows. The
// guard covers queued creation too, before get_webview_window can find it.
pub fn open(app: &AppHandle) {
    if OPENING.swap(true, Ordering::AcqRel) { return; }
    let opening = Opening;
    let app = app.clone();
    std::thread::spawn(move || {
        let _opening = opening;
        if let Err(error) = open_window(&app) { eprintln!("cannot open licences: {error}"); }
    });
}

fn open_window(app: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("licences") {
        window.unminimize()?;
        window.show()?;
        window.set_focus()?;
    } else {
        let language = app.state::<crate::show::Visibility>().language();
        WebviewWindowBuilder::from_config(app, &window_config(language))?.build()?;
        // A switch may have arrived while build waited for the UI thread.
        set_language(app, app.state::<crate::show::Visibility>().language());
    }
    Ok(())
}

pub fn set_language(app: &AppHandle, language: Lang) {
    if let Some(window) = app.get_webview_window("licences") {
        if let Err(error) = window.set_title(text("licences.title", language)) {
            eprintln!("cannot update licences title: {error}");
        }
    }
}

// App commands are unrestricted by Tauri unless an app manifest opts them all
// into ACL enforcement. Keep the strip capability unchanged and enforce this
// window's read-only command boundary at the Rust IPC dispatcher instead.
pub fn command_allowed(window: &str, command: &str) -> bool {
    match window {
        "main" => true,
        "licences" => matches!(command, "messages" | "notices"),
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::prefs::Lang;
    use tauri::WebviewUrl;

    #[test]
    fn licences_config_is_a_normal_independent_window_in_the_current_language() {
        let config = window_config(Lang::En);
        assert_eq!(config.label, "licences");
        assert_eq!(config.url, WebviewUrl::App("licences.html".into()));
        assert_eq!(config.title, "Licences");
        assert_eq!(window_config(Lang::Ko).title, "라이선스");
        assert!(config.decorations && config.focus && config.focusable && config.resizable);
        assert!(config.visible && config.closable);
        assert!(!(config.skip_taskbar || config.always_on_top || config.transparent || config.content_protected || config.fullscreen));
    }

    #[test]
    fn licences_capability_and_ipc_policy_allow_only_listening_and_the_two_read_commands() {
        let capability: serde_json::Value = serde_json::from_str(include_str!("../capabilities/licences.json")).unwrap();
        assert_eq!(capability["windows"], serde_json::json!(["licences"]));
        assert_eq!(capability["permissions"], serde_json::json!([
            "core:event:allow-listen", "core:event:allow-unlisten"
        ]));
        assert!(command_allowed("licences", "messages"));
        assert!(command_allowed("licences", "notices"));
        for command in ["renderer_ready", "pet_paths", "read_pet_file", "set_pet_scale",
            "computer_use_live", "fullscreen_paused", "pet_preferences", "frame_ready", "future_command"] {
            assert!(!command_allowed("licences", command), "{command}");
            assert!(command_allowed("main", command), "strip access remains unchanged: {command}");
        }
        assert!(!command_allowed("unknown", "notices"));
    }
}
