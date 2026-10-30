# 01: Optional name tags

**What to build:** `nameTags: false` in the pet configuration removes every name tag without moving any pet.

**Blocked by:** None (can start immediately)

**Status:** resolved

Spec: `.scratch/pet-visibility/spec.md` (Solution 1, Decisions)

- [x] `resolvePets` returns `nameTags` (default `true`); a non-boolean value is ignored with an issue (like `scale-out-of-range`), and the key is no longer reported as unknown.
- [x] With `nameTags: false` the renderer draws no tag; pet slot width, fit limit and strip height are unchanged.
- [x] `pet-doctor` reports a bad `nameTags` value and accepts a valid one.
- [x] Tests (plain Node) through the resolver: default, `true`, `false`, invalid value.
- [x] `npm test` passes.

## Comments

- 2026-10-30: Implemented on `ticket/pet-visibility-01`: resolver returns `nameTags` (invalid values -> `name-tags-invalid`), renderer hides tags with `visibility: hidden` so layout is unchanged, pet-doctor reports bad values; `npm test` 399/399 pass.
- 2026-10-30: Merged to the integration branch `feat/pet-visibility` with review fixes (7e32b38); `npm test` 409/409 and `cargo test` 38/38 pass. Desktop behaviour not yet checked by hand.
