# 01: Quit from the tray

**What to build:** The tray menu ends with a separator and a **Quit** entry. Choosing it ends the pet app at once, in every state, without asking and without changing any preference. Later reports start the pet app again as usual.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

Spec: `.scratch/pet-quit/spec.md` (user stories 1–15, Pet shell, Translation catalogue).

- [ ] Tray menu order: Show pets, Show name tags, Clear around cursor, Licences, Language, a separator, Quit.
- [ ] `tray.quit` is in the catalogue: `Quit` in English, `종료` in Korean. The label follows a language change without a restart.
- [ ] The existing Rust catalogue test that checks native tray labels also asserts the Quit label in both languages.
- [ ] Quit is always enabled, shows no confirmation and writes no preference. It doesn't consult the stage, the renderer or computer-use state.
- [ ] Quit, `POST /quit` and the idle exit share one bounded exit routine. On the tray path the two-second fallback is armed before asking Tauri to exit and before any operation that could block.
- [ ] The HTTP protocol is unchanged.
- [ ] The pet README's menu order and manual checks describe Quit, including the spec's "Not automated" checklist.
- [ ] `npm test` and `cargo test` pass.
