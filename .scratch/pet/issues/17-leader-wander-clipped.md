# 17: Leftmost leader wanders partly off the strip

**What to build:** An idle leader in the leftmost team stays fully inside the strip while it wanders. In the ticket 16 checks, the leftmost leader's pet node reached x = −28 px (about a quarter of the pet clipped at scale 0.6), because the wander offset is applied without clamping to the strip's left edge.

**Blocked by:** None (can start immediately)

**Status:** needs-triage

- [ ] Wandering never moves any pet outside the strip's left or right edge, at every scale from 0.3 to 1.0.
- [ ] Covered at the stage or layout seam.
