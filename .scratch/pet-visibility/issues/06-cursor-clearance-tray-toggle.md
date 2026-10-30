# 06: Cursor clearance toggle in the tray menu

**What to build:** Cursor clearance is turned on and off from a checked tray item instead of `pet.json`; the change applies immediately and is remembered.

**Blocked by:** 05

**Status:** resolved

Spec: `.scratch/pet-visibility/spec.md` (Solution 2, Decisions). Supersedes the `hideNearCursor` configuration key from ticket 02. Follow the ticket 04 pattern for name tags.

- [x] Tray menu order: Show pets, Show name tags, Clear around cursor (checked), Licences, Language. Labels in `pet/app/messages.json`: `Clear around cursor` / `커서 주변 숨기기`, relabelled on language switch.
- [x] Stored in the pet preferences next to `hidden`, `nameTags`, `language`; default on when absent; unknown preference fields preserved.
- [x] Toggling applies immediately: off stops cursor polling and removes the mask at once; on resumes polling. Works while pets are hidden (takes effect when shown). Checkmark follows the stored state at startup.
- [x] `hideNearCursor` removed from the resolver result and from `set_cursor_clearance`'s startup role (the Rust gate reads the preference); a `hideNearCursor` key in `pet.json` is reported as `unknown-key`; the `hide-near-cursor-invalid` doctor message goes away.
- [x] `pet/README.md` describes the tray item instead of the key; manual check uses it.
- [x] Tests: Rust preference default/round-trip and gate follows the preference; resolver treats `hideNearCursor` as unknown; renderer clears the mask on the toggle event; `npm test` and `cargo test` pass.

## Comments

- 2026-10-30: Implemented on `ticket/pet-visibility-06`. Clearance is stored as `cursorClearance` in the pet preferences (default on); the cursor poller gate reads it via `Visibility::cursor_clearance_active`, and `set_cursor_clearance` was removed. The renderer listens for `pet-cursor-clearance` and drops the mask at once. `npm test` (414) and `cargo test` (44) pass; native tray manual checks not yet run.
- 2026-10-30: Merged to `feat/pet-visibility` with review fixes (a7d5fce); `npm test` 414/414 and `cargo test` 43/43 pass. Not yet checked by hand in the running app.
