# 05: Pets drop to the taskbar when name tags are off

**What to build:** With name tags off, the tag's space goes too, so each pet stands just above the taskbar.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

Spec: `.scratch/pet-visibility/spec.md` (Solution 1, Decisions). Supersedes "keeps the tag's space" from tickets 01 and 04.

- [x] Name tags off removes the tag from layout (not just hides it); the pet canvas then sits on the strip's 4 px bottom padding, level with the overflow badges.
- [x] Horizontal layout unchanged: pet slot width, gaps, per-row fit (`layout.mjs`), scene and exit offsets; strip window size unchanged.
- [x] Toggling applies instantly to existing and later pets, also while pets are hidden; turning tags back on restores the previous position.
- [x] Renderer tests updated (`test/pet-renderer.test.mjs`) for the new hide style; `pet/README.md` and its manual visibility check describe the drop.
- [x] `npm test` passes.

## Comments

- 2026-10-30: Implemented on `ticket/pet-visibility-05`: name tags off now sets `display: none` on each tag (was `visibility: hidden`), so pets drop onto the 4 px bottom padding; `.pet` keeps its fixed width, so horizontal layout is unchanged. Renderer tests and `pet/README.md` (incl. manual check) updated; `npm test` 412/412 pass. Native visual check not run.
