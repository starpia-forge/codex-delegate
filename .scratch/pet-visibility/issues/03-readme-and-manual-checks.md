# 03: Document the new options and their manual checks

**What to build:** `pet/README.md` documents `nameTags` and `hideNearCursor` and adds manual checks for both.

**Blocked by:** 01, 02

**Status:** resolved

Spec: `.scratch/pet-visibility/spec.md`

- [x] Configuration section shows both keys with defaults and the restart-to-apply note.
- [ ] Manual checks: name tags off keeps pet positions identical; clearance circle size and soft edge at 100% and at another display scale; pets reappear immediately when the pointer leaves; no effect with `hideNearCursor: false`; no polling while pets hidden.

## Comments

- 2026-10-30: `pet/README.md` documents `nameTags` and `hideNearCursor` (defaults, validation, restart-to-apply) and adds a five-step manual visibility check. `npm test`: 407 passed. Desktop checks not yet run.
- 2026-10-30: Merged to the integration branch `feat/pet-visibility` with review fixes (7e32b38); `npm test` 409/409 and `cargo test` 38/38 pass. Desktop behaviour not yet checked by hand.
