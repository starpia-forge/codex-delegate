# 03: Exiting pets walk at the shared stride

**What to build:** A pet leaving the strip walks at the same stride as every other walk. Today an exit is timed in slot units (from its position to one slot left of the leader), but drawn stretched to the strip's actual left edge, so pets in teams further right cross many more pixels in the same time and visibly slide. Fixing it means exit timing has to account for real on-screen distance, which crosses the boundary between the slot-space scene model and the pixel layout.

Agreed design: the renderer, which knows each team's home position, the pet width and the scale, tells the stage how many slots each team's pets must walk to be fully off the strip's left edge, and refreshes it whenever the layout changes (as it already does for the fit limit). An exit then walks that many slots at the shared stride, and the layout drops its special stretched-exit projection and translates exit positions linearly like any other walk. The scene model stays in slot units. Pets in teams far to the right take correspondingly longer to leave.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] An exiting pet covers the shared stride per running cycle in on-screen distance, whatever its team's position and the pet scale (0.3 to 1.0).
- [ ] The scene still completes, and the pet is removed, once it is fully off the strip.
- [ ] Covered at a seam that combines the scene timing with the layout.
