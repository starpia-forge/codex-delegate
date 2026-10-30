# 05: Pets drop to the taskbar when name tags are off

**What to build:** With name tags off, the tag's space goes too, so each pet stands just above the taskbar.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

Spec: `.scratch/pet-visibility/spec.md` (Solution 1, Decisions). Supersedes "keeps the tag's space" from tickets 01 and 04.

- [ ] Name tags off removes the tag from layout (not just hides it); the pet canvas then sits on the strip's 4 px bottom padding, level with the overflow badges.
- [ ] Horizontal layout unchanged: pet slot width, gaps, per-row fit (`layout.mjs`), scene and exit offsets; strip window size unchanged.
- [ ] Toggling applies instantly to existing and later pets, also while pets are hidden; turning tags back on restores the previous position.
- [ ] Renderer tests updated (`test/pet-renderer.test.mjs`) for the new hide style; `pet/README.md` and its manual visibility check describe the drop.
- [ ] `npm test` passes.
