# 09: Language submenu with language names in their own language

**What to build:** The tray's Language item becomes a submenu, so a user stuck in a language they can't read can still find their way back. The submenu label always carries the English word, and each language is listed in its own name with the current one checked.

**Blocked by:** None (can start immediately)

**Status:** resolved

Spec: `.scratch/pet-tray/spec.md` (user stories 29–30, Pet shell tray contents). Supersedes ticket 05's one-step toggle.

- [x] Tray menu: Show pets, Show name tags, Clear around cursor, Licences, then a **Language** submenu (last, as today).
- [x] Submenu label: `Language` when the display language is English; `언어 (Language)` when Korean. Generally, a non-English label is the translated word followed by ` (Language)`.
- [x] Submenu items: one check item per supported language, labelled with its endonym and never translated (`English`, `한국어`); exactly the current effective language is checked, including when it comes from Windows rather than a stored choice.
- [x] Choosing a language stores it (same `language` preference), applies at once to the tray labels, tooltip, overflow badges and an open licences window, and fixes the check marks. Choosing the already-current language changes nothing visible (it may store it as an explicit choice).
- [x] The old cycling behaviour is gone; `tray.language` message ids updated in `pet/app/messages.json`.
- [x] Rust tests: choosing a language sets the stored preference; label for each language; endonyms not translated; check state follows the effective language. `npm test` and `cargo test` pass.
- [x] `pet/README.md` manual checks describe the submenu.

## Comments

- 2026-10-30: Implemented on `ticket/pet-tray-09`: Language submenu with endonym check items, `set_language` replaces the toggle; cargo build/test (46) and npm test (414) pass. Manual tray checklist on real Windows not yet run.
- 2026-10-30: Merged to `feat/language-submenu` with review fixes (f79a4fe); `cargo test` 47/47 and `npm test` 414/414 pass. Tray submenu not yet checked by hand.
