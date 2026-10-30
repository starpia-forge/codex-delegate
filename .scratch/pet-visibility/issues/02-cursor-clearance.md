# 02: Cursor clearance

**What to build:** Within a 500 logical-pixel circle around the mouse pointer the strip is not drawn, fading softly at the edge, following the pointer directly. `hideNearCursor: false` turns it off.

**Blocked by:** None (can start immediately)

**Status:** resolved

Spec: `.scratch/pet-visibility/spec.md` (Solution 2, Decisions)

- [x] `resolvePets` returns `hideNearCursor` (default `true`); a non-boolean value is ignored with an issue; `pet-doctor` accepts and checks it.
- [x] Rust side polls the cursor and sends its position to the webview in strip-relative logical pixels (correct at display scales other than 100%): about 60 Hz within 250 px of the strip, about 10 Hz otherwise, none while pets are hidden or the strip is paused for fullscreen, none when `hideNearCursor` is false. The window stays click-through.
- [x] Webview applies a per-pixel mask to the whole strip (pets, name tags, overflow badges): opacity 0 for radius ≤ 190 px, linear 0→1 for 190–250 px, 1 beyond; no lag or fade timing.
- [x] Mask geometry/opacity is a pure module with plain Node tests (centre, feather band, outside, pointer off the strip).
- [x] `npm test` passes and the Rust build and tests pass.

## Comments

- 2026-10-30: Implemented on `ticket/pet-visibility-02`: `hideNearCursor` in the resolver and `pet-doctor` (`hide-near-cursor-invalid`), pure mask module `pet/app/ui/cursor-clearance.mjs`, Rust cursor poller `pet/app/src-tauri/src/cursor.rs` (16 ms within 250 px of the strip, 100 ms otherwise, no cursor reads while hidden, paused for fullscreen or disabled), stage-wide CSS mask in the renderer. `npm test`, `cargo build` and `cargo test` pass; display-scale and fullscreen behaviour not yet checked on a live desktop.
- 2026-10-30: Merged to the integration branch `feat/pet-visibility` with review fixes (7e32b38); `npm test` 409/409 and `cargo test` 38/38 pass. Desktop behaviour not yet checked by hand.
