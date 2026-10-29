import assert from "node:assert/strict";
import test from "node:test";
import { cycleDuration, frameAt } from "../pet/app/ui/animations.mjs";

test("every pet state starts on its first frame at nonpositive elapsed time", () => {
  for (const state of ["idle", "running-right", "running-left", "waving", "jumping", "failed", "waiting", "running", "review"]) {
    for (const elapsed of [-10000, -0.1, 0]) assert.equal(frameAt(state, elapsed), 0, `${state} at ${elapsed}`);
  }
});

const cycles = [
  { state: "idle", starts: [0, 560, 780, 1000, 1280, 1560], end: 2200, cycle: 4600 },
  { state: "running-right", starts: [0, 240, 480, 720, 960, 1200, 1440, 1680], end: 2120, cycle: 2120 },
  { state: "running-left", starts: [0, 240, 480, 720, 960, 1200, 1440, 1680], end: 2120, cycle: 2120 },
  { state: "waving", starts: [0, 280, 560, 840], end: 1400, cycle: 1400 },
  { state: "jumping", starts: [0, 280, 560, 840, 1120], end: 1680, cycle: 1680 },
  { state: "failed", starts: [0, 280, 560, 840, 1120, 1400, 1680, 1960], end: 2440, cycle: 2440 },
  { state: "waiting", starts: [0, 300, 600, 900, 1200, 1500], end: 2020, cycle: 3520 },
  { state: "running", starts: [0, 240, 480, 720, 960, 1200], end: 1640, cycle: 1640 },
  { state: "review", starts: [0, 300, 600, 900, 1200, 1500], end: 2060, cycle: 3060 },
];

for (const { state, starts, end, cycle } of cycles) test(`${state} plays calm frames and repeats after its full cycle`, () => {
  assert.equal(cycleDuration(state), cycle);
  for (const turn of [0, 1, 4]) {
    for (const [frame, start] of starts.entries()) {
      const next = starts[frame + 1] ?? end;
      assert.equal(frameAt(state, turn * cycle + start), frame, `frame ${frame} starts in cycle ${turn}`);
      assert.equal(frameAt(state, turn * cycle + next - 1), frame, `frame ${frame} ends in cycle ${turn}`);
    }
    assert.equal(frameAt(state, turn * cycle + end), 0, "playback ends on the first frame");
    if (end < cycle) {
      assert.equal(frameAt(state, turn * cycle + end + 1), 0, "rest holds the first frame");
      assert.equal(frameAt(state, turn * cycle + cycle - 1), 0, "rest lasts until the next cycle");
    }
    assert.equal(frameAt(state, (turn + 1) * cycle), 0, "the next cycle starts on the first frame");
  }
});
