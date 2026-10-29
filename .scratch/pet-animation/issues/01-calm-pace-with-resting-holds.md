# 01: Pets animate at a calm pace with resting holds

**What to build:** Every pet state plays slowly enough to read instead of flickering. Frame durations are twice the values in OpenAI's hatch-pet animation guide (https://github.com/openai/skills/blob/main/skills/.curated/hatch-pet/references/animation-rows.md), replacing the provisional guesses. The looping ambient states (`idle`, `waiting`, `review`) rest on their first frame for a while at the end of each cycle before playing again; movement states (`running-left`, `running-right`, `running`) and one-shot states (`waving`, `jumping`, `failed`) have no rest. A pet keeps looping its state for as long as the state lasts: Codex's "three cycles, then fall back to idle" policy is deliberately not adopted, because a pet state shows what the leader or worker is doing. Scenes that last one cycle (waving, jumping, failed, review) lengthen to follow the new cycle durations, rest included.

Agreed timings (ms):

| State | Frames (2 × guide) | Rest on first frame | Cycle |
|---|---|---|---|
| `idle` | 560, 220, 220, 280, 280, 640 | 2400 | 4600 |
| `running-right` | 240 × 7, 440 | — | 2120 |
| `running-left` | 240 × 7, 440 | — | 2120 |
| `waving` | 280 × 3, 560 | — | 1400 |
| `jumping` | 280 × 4, 560 | — | 1680 |
| `failed` | 280 × 7, 480 | — | 2440 |
| `waiting` | 300 × 5, 520 | 1500 | 3520 |
| `running` | 240 × 5, 440 | — | 1640 |
| `review` | 300 × 5, 560 | 1000 | 3060 |

The rests are absolute values, not doubled.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] Frame selection (state + elapsed animation time → sprite frame) is a pure function, and the renderer draws frames through it.
- [x] A table-driven test covers all nine states: every frame boundary, each cycle duration, the three rests selecting the first frame, wrap-around after several cycles, and elapsed time at or below zero selecting the first frame. Expected values are written out in the test, not read from the production timing table.
- [x] Cycle duration includes the rest, and scene lengths follow it; stage and layout tests with hard-coded scene times are updated to the new cycles.
- [x] The pet README and code comments no longer call the timings provisional; they cite the upstream guide and state that this app plays them at twice its durations, with rests on the ambient states.
