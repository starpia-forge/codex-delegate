# 04: Name tags toggle in the tray menu

**What to build:** Name tags are turned on and off from a checked tray menu item instead of `pet.json`. The change applies immediately and is remembered.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

Spec: `.scratch/pet-visibility/spec.md` (Solution 1, Decisions). Supersedes the `nameTags` configuration key from ticket 01.

- [ ] Tray menu order: Show pets, Show name tags (checked item), Licences, Language. Labels in `pet/app/messages.json`: `Show name tags` / `이름표 표시`, relabelled on language switch like the others.
- [ ] The choice is stored in the pet preferences next to `hidden` and `language` (`pet/app/src-tauri/src/prefs.rs`), default on when absent; unknown preference fields are still preserved.
- [ ] Toggling applies to the strip immediately (no restart), including pets added later, and works while pets are hidden; the checkmark follows the stored state at startup.
- [ ] Hiding still keeps the tag's space, so no pet moves.
- [ ] `nameTags` removed from the resolver result; a `nameTags` key in `pet.json` is reported as `unknown-key`; the `name-tags-invalid` doctor message goes away.
- [ ] `pet/README.md` describes the tray item instead of the `nameTags` key, and the manual visibility check uses the tray item.
- [ ] Tests: Rust preference round-trip and default; resolver treats `nameTags` as unknown; `npm test` and `cargo test` pass.
