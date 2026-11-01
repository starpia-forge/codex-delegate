# 11: Line art tray icon

**What to build:** Replace the pixel art tray and app icon with modern line art that carries the Claude + Codex identity and the pet feature: a pet outline whose face is the prompt `>_` and whose right ear is a spark. While pets are hidden it ducks behind a bar with closed eyes.

**Blocked by:** None (can start immediately)

**Status:** resolved

Spec: `.scratch/pet-tray/spec.md` (user story 6, Pet shell tray contents). Supersedes the art and sizing in ticket 10.

- [x] `pet/art/tray-icon/` holds the source SVGs, with lines and no fills. `node pet/generate-tray-icon.mjs` writes `tray.json` (coverage maps at 16, 20, 24, 28, 32, 40 and 48 px), `icon.ico` and `icon.png`.
- [x] The tray draws white lines on a dark taskbar and dark lines on a light one, and follows theme changes while the app runs. White is the rule; dark ink exists only where white would disappear.
- [x] The app icon is the same art on a dark tile, so it reads on any background.
- [x] Tests: map shape and coverage, maps match the SVGs, line art has no fills, app icon sizes, ducked pose, size fitting, and drawing in each ink. `npm test` and `cargo test` pass.
- [ ] Manual check in `pet/README.md` (Tray icon) at 150% display scale, and the switch back from a light taskbar to a dark one. The rest was checked on the real tray, see Comments.

## Comments

- 2026-11-01: Chosen from three drafts (face with a spark eye, spark ear, ears over a bare prompt). The Codex app's own tray icons set the style: anti-aliased white lines, rendered per size, with separate dark and light sets. No OpenAI or Anthropic logo is copied; the spark is drawn for this project.
- 2026-11-01: Checked on the real tray of a Windows 10 desktop, at one display scale, with an isolated app. On a dark taskbar it drew white lines, and left-click switched to the ducked pose. Switching the taskbar to light while the app ran changed it to dark lines without a restart, in both poses, with no white fringe. The switch back to dark was not watched, because the app had reached its idle exit; it uses the same path. Other display scales were not checked.
- 2026-11-01: Decided with the maintainer: no attribution notice for the icon, since it is the project's own art; no ADR, since the art is easy to replace.
