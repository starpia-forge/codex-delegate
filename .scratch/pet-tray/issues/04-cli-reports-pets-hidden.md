# 04: CLI reports pets hidden

**What to build:** `list` and `doctor` tell the user when **pets hidden** is on, so an empty strip is never mistaken for a fault. The installer keeps the pet preferences file across updates and removes it with the rest of the pet state.

**Blocked by:** 03

**Status:** resolved

Spec: `.scratch/pet-tray/spec.md` (CLI; Pet preferences)

- [ ] `list` appends `, hidden` to the `Pet: enabled …` line when the preferences file says hidden.
- [ ] `doctor` prints an OK-level line when pets are hidden, telling the user to show them from the tray icon. It prints nothing when pets are shown, and nothing pet-related without a pet.
- [ ] A missing file, `{"hidden": false}`, invalid JSON, a non-boolean value or unknown keys all mean shown, with nothing printed.
- [ ] `install --without-pet` and `uninstall` remove the preferences file together with the pet state.
- [ ] An update leaves the preferences file byte for byte unchanged.
- [ ] These cases are covered by CLI child-process tests with an isolated home, following the existing doctor and install pet tests.

## Comments

- 2026-10-29: Implemented on `feat/pet-tray` (merged with review fixes in e138a48). Automated criteria verified by `npm test`, `cargo test` and `cargo build --release`. Manual desktop checks in this ticket are not yet run; they are carried by ticket 08 against the release bundle.
