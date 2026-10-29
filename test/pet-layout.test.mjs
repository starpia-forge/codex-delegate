import assert from "node:assert/strict";
import test from "node:test";
import { applyOverflow, fitLimit, sceneOffset } from "../pet/app/ui/layout.mjs";
import { createStage } from "../pet/app/ui/stage.mjs";

for (const outcome of ["success", "failed"]) {
  test(`a ${outcome} worker in a later team exits beyond the strip's left edge`, () => {
    let time = 1000;
    const stage = createStage({ now: () => time });
    stage.apply({ source: "leader", type: "prompt", team: "first", at: time });
    stage.apply({ source: "leader", type: "prompt", team: "second", at: time });
    stage.apply({ source: "worker", type: "heartbeat", team: "second", worker: "w",
      role: "implementer", label: "task", seq: 1, at: time });
    stage.apply({ source: "worker", type: "end", team: "second", worker: "w",
      role: "implementer", label: "task", seq: 2, at: time, outcome });
    // End of the exit phase: the pet's entire width must be outside the strip,
    // even though its home is well to the right of the neighbouring team.
    time = outcome === "success" ? 3899 : 5579;
    stage.tick();
    const worker = stage.snapshot().teams[1].workers[0];
    assert.equal(worker.facing, "left");
    assert.equal(worker.displayState, "running-left");
    for (const scale of [0.3, 1]) {
      const geometry = { homeLeft: 650, petWidth: 192 * scale + 24, scale };
      const left = geometry.homeLeft + sceneOffset({ ...worker, home: 1 }, geometry);
      assert.ok(left + geometry.petWidth < 2, `worker reaches strip edge at scale ${scale}`);
    }
    time++;
    stage.tick();
    assert.equal(stage.snapshot().teams[1].workers.length, 0);
    assert.equal(stage.snapshot().teams[0].leader.state, "running");
  });
}

test("fit limit includes name tags, both gaps, padding and worst-case overflow badges", () => {
  // Two separate teams at scale 1: 2 * (216 pet + 4 gap + 48 badge),
  // 16 between teams, 16 before the 96 sessions badge, and 16 side padding.
  assert.equal(fitLimit({ width: 679, scale: 1 }), 1);
  assert.equal(fitLimit({ width: 680, scale: 1 }), 2);
  assert.equal(fitLimit({ width: 963, scale: 1 }), 2);
  assert.equal(fitLimit({ width: 964, scale: 1 }), 3);
});

test("fit limit responds to scale and width and stays between zero and sixteen", () => {
  assert.equal(fitLimit({ width: 1920, scale: 0.3 }), 12);
  assert.equal(fitLimit({ width: 1920, scale: 0.6 }), 8);
  assert.equal(fitLimit({ width: 1920, scale: 1 }), 6);
  assert.equal(fitLimit({ width: 1280, scale: 1 }), 4);
  assert.equal(fitLimit({ width: 395, scale: 1 }), 0);
  assert.equal(fitLimit({ width: 0, scale: 0.3 }), 0);
  assert.equal(fitLimit({ width: 10000, scale: 0.3 }), 16);
});

test("overflow projection counts workers and sessions without discarding their state", () => {
  const teams = [
    { key: "first", leader: { state: "idle" }, workers: [{ worker: "w1" }, { worker: "w2" }] },
    { key: "second", leader: { state: "running" }, workers: [] },
  ];
  assert.deepEqual(applyOverflow(teams, 1, new Map([["w1", 1], ["w2", 2]])), {
    teams: [{ key: "first", leader: { state: "idle" }, workers: [], overflowWorkers: 2 }],
    overflowSessions: 1,
  });
  assert.equal(teams[0].workers.length, 2);
});
