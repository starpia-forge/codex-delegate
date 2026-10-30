# 01: Optional name tags

**What to build:** `nameTags: false` in the pet configuration removes every name tag without moving any pet.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

Spec: `.scratch/pet-visibility/spec.md` (Solution 1, Decisions)

- [ ] `resolvePets` returns `nameTags` (default `true`); a non-boolean value is ignored with an issue (like `scale-out-of-range`), and the key is no longer reported as unknown.
- [ ] With `nameTags: false` the renderer draws no tag; pet slot width, fit limit and strip height are unchanged.
- [ ] `pet-doctor` reports a bad `nameTags` value and accepts a valid one.
- [ ] Tests (plain Node) through the resolver: default, `true`, `false`, invalid value.
- [ ] `npm test` passes.
