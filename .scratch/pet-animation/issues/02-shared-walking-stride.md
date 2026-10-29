# 02: Walking pets move at one shared stride

**What to build:** A walking pet's body moves in step with its feet. Today a worker walking to its slot covers one slot per running cycle, while an idle leader's wander drifts about one slot every 16 s with its legs cycling far faster than it moves. Both now use one shared stride: 0.5 slot per running cycle (with ticket 01's cycle, about 35 px/s at the default scale). This covers a worker walking from beside its leader to its own slot, a finished worker walking back beside its leader, and the idle leader's wander. The wander keeps its 20 s period and its ±0.25 slot range; its walking legs get shorter and idle fills the rest of the period. Exits off the strip are out of scope (see ticket 03).

**Blocked by:** 01

**Status:** resolved

- [x] Worker scene travel and leader wander derive their speed from the same stride constant and the running cycle duration.
- [x] Wander never leaves ±0.25 slot and repeats every 20 s.
- [x] Stage tests cover walk-in, walk-back and wander pacing against the shared stride.
- [x] Code or docs note that exits are not yet held to the stride.
