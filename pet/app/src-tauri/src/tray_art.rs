// The tray icon is line art rendered for each size Windows uses at 100-300% scaling
// (icons/tray.json): the pet awake, or ducked behind a bar while pets are hidden.
// The maps hold coverage only, so one drawing serves both taskbar themes: white lines
// on a dark taskbar, dark lines on a light one, where white would disappear.
use serde_json::Value;
use tauri::image::Image;

const ART: &str = include_str!("../icons/tray.json");
const MAPS: [u32; 7] = [16, 20, 24, 28, 32, 40, 48];
const WHITE: [u8; 3] = [255, 255, 255];
const DARK: [u8; 3] = [27, 28, 32];
#[cfg(windows)]
const PERSONALIZE: windows::core::PCWSTR = windows::core::w!(r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize");

// The smallest map that covers the tray size, so Windows only ever shrinks the icon.
fn fit(size: u32) -> u32 {
    MAPS.into_iter().find(|&map| map >= size).unwrap_or(MAPS[MAPS.len() - 1])
}

fn draw(art: &Value, pose: &str, map: u32, ink: [u8; 3]) -> Image<'static> {
    let side = map as usize;
    let mut rgba = vec![0; side * side * 4];
    let rows = art[pose][map.to_string()].as_array().expect("tray art map");
    for (y, row) in rows.iter().enumerate() {
        for (x, key) in row.as_str().expect("tray art row").chars().enumerate() {
            let Some(coverage) = key.to_digit(16) else { continue };
            let [r, g, b] = ink;
            rgba[(y * side + x) * 4..][..4].copy_from_slice(&[r, g, b, coverage as u8 * 17]);
        }
    }
    Image::new_owned(rgba, map, map)
}

#[derive(Clone)]
pub struct TrayArt { shown: [Image<'static>; 2], hidden: [Image<'static>; 2] }

impl TrayArt {
    pub fn new(size: u32) -> Self {
        let art: Value = serde_json::from_str(ART).expect("tray art");
        let map = fit(size);
        let pose = |pose| [WHITE, DARK].map(|ink| draw(&art, pose, map, ink));
        Self { shown: pose("shown"), hidden: pose("hidden") }
    }

    // In the ink for the taskbar's current theme.
    pub fn image(&self, hidden: bool) -> Image<'static> {
        let inks = if hidden { &self.hidden } else { &self.shown };
        inks[usize::from(light_taskbar())].clone()
    }
}

// Windows keeps the taskbar's theme apart from the apps' theme. A missing value is a dark taskbar.
fn light_taskbar() -> bool {
    #[cfg(windows)]
    {
        use windows::{core::w, Win32::System::Registry::{RegGetValueW, HKEY_CURRENT_USER, RRF_RT_REG_DWORD}};
        let (mut value, mut size) = (0u32, 4u32);
        let read = unsafe { RegGetValueW(HKEY_CURRENT_USER, PERSONALIZE, w!("SystemUsesLightTheme"), RRF_RT_REG_DWORD,
            None, Some((&raw mut value).cast()), Some(&raw mut size)) };
        read.is_ok() && value != 0
    }
    #[cfg(not(windows))]
    { false }
}

// Calls back on a background thread whenever a value in the theme's key is written.
pub fn on_theme_change(changed: impl Fn() + Send + 'static) {
    #[cfg(windows)]
    std::thread::spawn(move || unsafe {
        use windows::Win32::System::Registry::{RegNotifyChangeKeyValue, RegOpenKeyExW, HKEY, HKEY_CURRENT_USER,
            KEY_NOTIFY, REG_NOTIFY_CHANGE_LAST_SET};
        let mut key = HKEY::default();
        if RegOpenKeyExW(HKEY_CURRENT_USER, PERSONALIZE, Some(0), KEY_NOTIFY, &raw mut key).is_err() { return; }
        while RegNotifyChangeKeyValue(key, false, REG_NOTIFY_CHANGE_LAST_SET, None, false).is_ok() { changed(); }
    });
    #[cfg(not(windows))]
    drop(changed);
}

// The notification area draws icons at the small-icon size for the system DPI.
pub fn small_icon_size() -> u32 {
    #[cfg(windows)]
    {
        use windows::Win32::UI::WindowsAndMessaging::{GetSystemMetrics, SM_CXSMICON};
        u32::try_from(unsafe { GetSystemMetrics(SM_CXSMICON) }).ok().filter(|&size| size > 0).unwrap_or(16)
    }
    #[cfg(not(windows))]
    { 16 }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn art() -> Value { serde_json::from_str(ART).unwrap() }

    fn rows(art: &Value, pose: &str, map: u32) -> Vec<String> {
        art[pose][map.to_string()].as_array().unwrap().iter().map(|row| row.as_str().unwrap().to_owned()).collect()
    }

    #[test]
    fn every_map_is_square_and_holds_only_coverage() {
        let art = art();
        for pose in ["shown", "hidden"] {
            for map in MAPS {
                let rows = rows(&art, pose, map);
                assert_eq!(rows.len(), map as usize, "{pose} {map}");
                for row in rows {
                    assert_eq!(row.chars().count(), map as usize, "{pose} {map}: {row}");
                    assert!(row.chars().all(|key| key == '.' || key.is_digit(16)), "{pose} {map}: {row}");
                }
            }
        }
    }

    #[test]
    fn hidden_pets_duck_behind_a_bar() {
        let art = art();
        let inked = |row: &String| row.chars().filter(|&key| key != '.').count();
        for map in MAPS {
            let top = |pose| rows(&art, pose, map).iter().position(|row| inked(row) > 0).unwrap();
            assert!(top("hidden") > top("shown"), "{map}");
            let widest = rows(&art, "hidden", map).iter().map(inked).max().unwrap();
            assert!(widest as u32 >= map * 3 / 4, "{map}: bar is {widest}");
        }
    }

    #[test]
    fn tray_sizes_use_the_smallest_map_that_covers_them() {
        for (size, expected) in [(16, 16), (20, 20), (24, 24), (28, 28), (32, 32), (40, 40), (48, 48),
            (12, 16), (18, 20), (36, 40), (200, 48)] {
            assert_eq!(fit(size), expected, "{size}");
        }
    }

    #[test]
    fn icons_draw_each_map_in_the_ink_at_its_coverage() {
        let art = art();
        for ink in [WHITE, DARK] {
            let image = draw(&art, "shown", 32, ink);
            assert_eq!((image.width(), image.height()), (32, 32));
            for (y, row) in rows(&art, "shown", 32).iter().enumerate() {
                for (x, key) in row.chars().enumerate() {
                    let [r, g, b] = ink;
                    let expected = key.to_digit(16).map_or([0; 4], |coverage| [r, g, b, coverage as u8 * 17]);
                    assert_eq!(image.rgba()[(y * 32 + x) * 4..][..4], expected, "({x}, {y})");
                }
            }
        }
        let small = TrayArt::new(16);
        assert_eq!((small.image(true).width(), small.image(true).height()), (16, 16));
        assert_ne!(small.image(true).rgba(), small.image(false).rgba());
    }
}
