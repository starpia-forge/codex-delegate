# 10: Tray icon art that shows when pets are hidden

**What to build:** Replace the placeholder app icon with the chosen tray art: the pet peeking over a bar that stands for the taskbar. While pets are hidden the tray icon ducks behind the bar with closed eyes, and the tray uses pixel art drawn for its real size instead of shrinking the large app icon.

**Blocked by:** None (can start immediately)

**Status:** resolved

Spec: `.scratch/pet-tray/spec.md` (user story 6, Pet shell tray contents). Supersedes ticket 03's "Its icon is the app icon".

- [x] Pixel maps for both poses at 16, 20 and 24 px live in `pet/app/src-tauri/icons/tray.json`. `node pet/generate-tray-icon.mjs` writes `icon.ico` (the shown maps at 16–24 px, exact 2× and 4× copies at 32–64 px, and `pet/art/tray-icon/shown.svg` rendered at 256 px), `icon.png`, and SVG previews in `pet/art/tray-icon/`.
- [x] The tray draws the map for the system small-icon size (`SM_CXSMICON`: 16, 20 or 24 px at 100–150%). Above that it uses the smallest whole multiple that covers the size, so Windows never resamples drawn pixels.
- [x] Left-click and **Show pets** switch the icon's pose together with the checkmark; a hidden startup shows the ducked pose from the start.
- [x] The build script watches `icons/`. tauri-build embeds `icon.ico` without watching it, so incremental builds kept the old exe icon.
- [x] Tests: Rust map shape and palette, ducked pose over the same bar, size fitting, and pixel-exact scaling; a Node test that `icon.ico` and the previews match the maps. `npm test` and `cargo test` pass.
- [ ] Manual check in `pet/README.md` (Tray icon): the poses switch with the pets, a hidden restart starts ducked, and the icon is sharp at 100% and 150% on a dark and a light taskbar.

## Comments

- 2026-10-30: Chosen from three drafts (cat ears, small horns, peeking over the taskbar). The drafts were checked by:
  - rendering every size;
  - measuring 3:1 edge contrast on seven taskbar colours (at least 96% of edge pixels on dark taskbars);
  - simulating colour-vision deficiencies (shown vs hidden fill ΔE at least 9.8);
  - drawing the ICO with `LoadImage` and `DrawIconEx` (72/72 pixel-exact).

  An independent reviewer's findings were applied. `npm test` (417) and `cargo test` (51) pass, and the built exe's icon resource matches the maps pixel for pixel. Not yet checked by hand in the running app.
