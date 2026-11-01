# 01: Quit from the tray

**What to build:** The tray menu ends with a separator and a **Quit** entry. Choosing it ends the pet app at once, in every state, without asking and without changing any preference. Later reports start the pet app again as usual.

**Blocked by:** None (can start immediately)

**Status:** resolved

Spec: `.scratch/pet-quit/spec.md` (user stories 1–15, Pet shell, Translation catalogue).

- [x] Tray menu order: Show pets, Show name tags, Clear around cursor, Licences, Language, a separator, Quit.
- [x] `tray.quit` is in the catalogue: `Quit` in English, `종료` in Korean. The label follows a language change without a restart.
- [x] The existing Rust catalogue test that checks native tray labels also asserts the Quit label in both languages.
- [x] Quit is always enabled, shows no confirmation and writes no preference. It doesn't consult the stage, the renderer or computer-use state.
- [x] Quit, `POST /quit` and the idle exit share one bounded exit routine. On the tray path the two-second fallback is armed before asking Tauri to exit and before any operation that could block.
- [x] The HTTP protocol is unchanged.
- [x] The pet README's menu order and manual checks describe Quit, including the spec's "Not automated" checklist.
- [x] `npm test` and `cargo test` pass.

## Comments

- 2026-11-01: Implemented on `ticket/pet-quit-01`: tray Quit after a separator, `tray.quit` catalogue entry, shared `exit_with_handle` routine used by the tray, `POST /quit` and the idle exit; README menu order and "Manual Quit check" added. `cargo test` 51/51 and `npm test` 442/442 pass. One earlier `npm test` run failed `install --without-pet suppresses relaunch before asking the app to quit` at its ESRCH check; the test passed 5/5 alone, 3/3 with its file and in the following full run, and this ticket changes no installer or test code. Manual Quit checklist on real Windows not yet run.
