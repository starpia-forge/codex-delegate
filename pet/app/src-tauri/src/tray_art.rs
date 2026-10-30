// The tray icon is pixel art drawn for the sizes Windows uses at 100-150% scaling
// (icons/tray.json): the pet peeking over the taskbar, or ducked behind it while
// pets are hidden. Larger tray sizes use whole multiples, so no pixel is resampled.
use serde_json::Value;
use tauri::image::Image;

const ART: &str = include_str!("../icons/tray.json");
const MAPS: [u32; 3] = [16, 20, 24];

// The smallest drawn map times a whole number that covers the tray size, so Windows
// only ever shrinks the icon; exact sizes use their own map.
fn fit(size: u32) -> (u32, u32) {
    let mut options: Vec<(u32, u32)> = (1..=4).flat_map(|scale| MAPS.map(|map| (map, scale))).collect();
    options.sort_by_key(|&(map, scale)| map * scale);
    options.iter().copied().find(|&(map, scale)| map * scale >= size).unwrap_or(options[options.len() - 1])
}

fn colour(hex: &str) -> [u8; 3] {
    let value = u32::from_str_radix(hex.trim_start_matches('#'), 16).expect("tray art colour");
    [(value >> 16) as u8, (value >> 8) as u8, value as u8]
}

fn draw(art: &Value, pose: &str, map: u32, scale: u32) -> Image<'static> {
    let side = (map * scale) as usize;
    let scale = scale as usize;
    let mut rgba = vec![0; side * side * 4];
    let rows = art[pose][map.to_string()].as_array().expect("tray art map");
    for (y, row) in rows.iter().enumerate() {
        for (x, key) in row.as_str().expect("tray art row").chars().enumerate() {
            if key == '.' { continue; }
            let [r, g, b] = colour(art["palette"][pose][key.to_string()].as_str().expect("tray art palette"));
            for dy in 0..scale {
                let at = ((y * scale + dy) * side + x * scale) * 4;
                for pixel in rgba[at..at + scale * 4].chunks_exact_mut(4) { pixel.copy_from_slice(&[r, g, b, 255]); }
            }
        }
    }
    Image::new_owned(rgba, side as u32, side as u32)
}

#[derive(Clone)]
pub struct TrayArt { shown: Image<'static>, hidden: Image<'static> }

impl TrayArt {
    pub fn new(size: u32) -> Self {
        let art: Value = serde_json::from_str(ART).expect("tray art");
        let (map, scale) = fit(size);
        Self { shown: draw(&art, "shown", map, scale), hidden: draw(&art, "hidden", map, scale) }
    }

    pub fn image(&self, hidden: bool) -> Image<'static> {
        if hidden { self.hidden.clone() } else { self.shown.clone() }
    }
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
    fn every_map_is_square_and_coloured_from_its_pose_palette() {
        let art = art();
        for pose in ["shown", "hidden"] {
            for map in MAPS {
                let rows = rows(&art, pose, map);
                assert_eq!(rows.len(), map as usize, "{pose} {map}");
                for row in rows {
                    assert_eq!(row.chars().count(), map as usize, "{pose} {map}: {row}");
                    for key in row.chars().filter(|&key| key != '.') {
                        let hex = art["palette"][pose][key.to_string()].as_str();
                        assert!(hex.is_some_and(|hex| hex.len() == 7 && hex.starts_with('#')), "{pose} {map}: {key}");
                    }
                }
            }
        }
    }

    #[test]
    fn hidden_pets_duck_behind_the_same_bar() {
        let art = art();
        for map in MAPS {
            let top = |pose| rows(&art, pose, map).iter().position(|row| row.contains(|key: char| key != '.')).unwrap();
            assert!(top("hidden") > top("shown"), "{map}");
            assert_eq!(rows(&art, "hidden", map).last(), rows(&art, "shown", map).last(), "{map}");
        }
    }

    #[test]
    fn tray_sizes_use_a_drawn_map_or_the_smallest_whole_multiple_that_covers_them() {
        for (size, expected) in [(16, (16, 1)), (20, (20, 1)), (24, (24, 1)), (32, (16, 2)), (40, (20, 2)),
            (48, (24, 2)), (28, (16, 2)), (36, (20, 2)), (12, (16, 1)), (200, (24, 4))] {
            assert_eq!(fit(size), expected, "{size}");
        }
    }

    #[test]
    fn icons_repeat_each_drawn_pixel_at_the_fitted_scale() {
        let art = art();
        let image = TrayArt::new(32).image(false);
        assert_eq!((image.width(), image.height()), (32, 32));
        for (y, row) in rows(&art, "shown", 16).iter().enumerate() {
            for (x, key) in row.chars().enumerate() {
                let expected = if key == '.' { [0; 4] } else {
                    let [r, g, b] = colour(art["palette"]["shown"][key.to_string()].as_str().unwrap());
                    [r, g, b, 255]
                };
                for (dx, dy) in [(0, 0), (1, 0), (0, 1), (1, 1)] {
                    let at = ((y * 2 + dy) * 32 + x * 2 + dx) * 4;
                    assert_eq!(image.rgba()[at..at + 4], expected, "({x}, {y})");
                }
            }
        }
        let small = TrayArt::new(16);
        assert_eq!((small.image(true).width(), small.image(true).height()), (16, 16));
        assert_ne!(small.image(true).rgba(), small.image(false).rgba());
    }
}
