# 05: Display language

**What to build:** The pet app speaks English or 한국어. It starts in Korean when the Windows display language is Korean and in English otherwise, unless the user chose a language. Each click on the tray's **Language** item switches to the other language, and the choice is remembered. The tray menu and the overflow badges change at once. Role names, worker labels, pet names and CLI output stay untranslated.

**Blocked by:** 01, 03

**Status:** resolved

Spec: `.scratch/pet-tray/spec.md` (Translation catalogue; Pet preferences; Pet shell)

- [ ] One catalogue holds an English and a Korean text for every message id. The shell embeds it and serves it to the renderer through a `messages` command, and English is the fallback for a missing id.
- [ ] The effective language is the stored `language` if there is one. Otherwise it comes from the Windows user display language: Korean means `ko`, anything else `en`.
- [ ] A language is stored only when the user switches. Visibility changes, failed saves and restarts never store the Windows-derived language.
- [ ] The tray menu gains a Language item that shows the current language (`Language: English` or `언어: 한국어`). Each click switches language and persists the choice.
- [ ] A switch immediately relabels the tray menu and notifies the renderer. The overflow badges and their tooltips follow. The renderer subscribes to language events before reading the current language.
- [ ] A catalogue test asserts every message id has non-empty English and Korean texts, and that every id the renderer uses exists.
- [ ] Rust tests cover:
  - The stored language winning.
  - Korean and non-Korean Windows language ids.
  - The toggle order.
  - Hiding and restarting without a stored language, which leaves `language` absent and follows a changed Windows language.
  - An explicit language surviving later visibility changes and a failed save.
- [ ] Manual: the app starts in Korean under a Korean Windows display language and in English otherwise. A live switch updates the menu and the badges.

## Comments

- 2026-10-29: Implemented on `feat/pet-tray` (merged with review fixes in e138a48). Automated criteria verified by `npm test`, `cargo test` and `cargo build --release`. Manual desktop checks in this ticket are not yet run; they are carried by ticket 08 against the release bundle.
