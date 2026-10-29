# 18: Name tags overlap at small scales

**What to build:** Name tags stay readable when pets are small. At scale 0.3 the pets are 58 px wide but tags such as `translator · mine` are wider, so neighbouring tags overlap (seen in the ticket 16 checks).

**Blocked by:** None (can start immediately)

**Status:** needs-triage

- [ ] At scale 0.3, adjacent tags don't overlap (for example truncated with an ellipsis to the pet's slot width, with the full text in a title).
- [ ] Scale 1.0 tags unchanged.
