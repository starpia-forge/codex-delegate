import assert from "node:assert/strict";
import test from "node:test";
import { applyOverflow, exitSlot, fitLimit, sceneOffset } from "../pet/app/ui/layout.mjs";
import { createStage } from "../pet/app/ui/stage.mjs";
import { cycleDuration } from "../pet/app/ui/animations.mjs";

test("exit slots clear the strip from any team position and scale in team slot units", () => {
  // At scale 1 a slot is 220px: home 1 at 223px has a team origin of 3px.
  assert.equal(exitSlot({ home: 1, homeLeft: 223, petWidth: 216, scale: 1 }), -1);
  for (let step = 3; step <= 10; step++) {
    const scale = step / 10;
    for (const teamLeft of [8, 350, 1200]) for (const home of [0, 1, 4]) {
      const geometry = { homeLeft: teamLeft + home * (192 * scale + 28), petWidth: 192 * scale + 24, scale };
      const x = exitSlot({ home, ...geometry });
      const right = geometry.homeLeft + sceneOffset({ x, home }, geometry) + geometry.petWidth;
      assert.ok(Math.abs(right + 1) < 1e-9, `one pixel clear at scale ${scale}, team ${teamLeft}, home ${home}`);
    }
  }
});

for (const outcome of ["success", "failed"]) {
  test(`a ${outcome} worker exits at the shared stride and is removed fully off the strip`, () => {
    for (let step = 3; step <= 10; step++) for (const teamLeft of [8, 350, 1200])
    for (const hasLeader of [true, false]) for (const home of [1, 3]) {
      let time = 1000;
      const scale = step / 10;
      const geometry = { homeLeft: teamLeft + home * (192 * scale + 28), petWidth: 192 * scale + 24, scale };
      const stage = createStage({ now: () => time });
      stage.apply({ source: "leader", type: "prompt", team: "first", at: time });
      if (hasLeader) stage.apply({ source: "leader", type: "prompt", team: "second", at: time });
      for (let slot = 1; slot <= home; slot++) stage.apply({ source: "worker", type: "heartbeat", team: "second", worker: `w${slot}`,
        role: "implementer", label: "task", seq: 1, at: time });
      stage.setExitSlot("second", exitSlot({ home, ...geometry }));
      stage.apply({ source: "worker", type: "end", team: "second", worker: `w${home}`,
        role: "implementer", label: "task", seq: 2, at: time, outcome });
      const cycle = cycleDuration("running-left");
      const exitStart = outcome === "success"
        ? 1000 + (home - 0.5) * 2 * cycle + cycleDuration("jumping") + (hasLeader ? cycleDuration("review") : 0)
        : 1000 + cycleDuration("failed") * (hasLeader ? 3 : 2);
      const worker = () => stage.snapshot().teams.find(team => team.key === "second")?.workers.find(pet => pet.worker === `w${home}`);
      const right = () => geometry.homeLeft + sceneOffset({ ...worker(), home }, geometry) + geometry.petWidth;
      time = exitStart;
      stage.tick();
      const startRight = right();
      time += cycle;
      stage.tick();
      assert.equal(worker().displayState, "running-left");
      const stridePixels = [42.8, 52.4, 62, 71.6, 81.2, 90.8, 100.4, 110][step - 3];
      assert.ok(Math.abs(startRight - right() - stridePixels) < 1e-9, `half a slot at scale ${scale}, team ${teamLeft}`);
      const exitEnd = exitStart + (startRight + 1) / stridePixels * cycle;
      time = exitEnd - 1;
      stage.tick();
      assert.equal(worker().facing, "left");
      assert.ok(right() <= 0 && right() > -1, `fully outside before removal at scale ${scale}, team ${teamLeft}`);
      time = Math.ceil(exitEnd);
      stage.tick();
      assert.equal(worker(), undefined);
      assert.equal(stage.snapshot().teams[0].leader.state, "running");
    }
  });
}

test("in-flight exits keep their position and stride when a team moves right or the scale shrinks", () => {
  for (const geometry of [
    { homeLeft: 663, petWidth: 216, scale: 1, stridePixels: 110 },
    { homeLeft: 650, petWidth: 81.6, scale: 0.3, stridePixels: 42.8 },
  ]) {
    let time = 1000;
    const stage = createStage({ now: () => time });
    stage.apply({ source: "leader", type: "prompt", team: "team", at: time });
    stage.apply({ source: "worker", type: "heartbeat", team: "team", worker: "w", seq: 1, at: time });
    stage.setExitSlot("team", -1);
    stage.apply({ source: "worker", type: "end", outcome: "success", team: "team", worker: "w", seq: 2, at: time });
    const worker = () => stage.snapshot().teams[0].workers[0];
    const right = () => geometry.homeLeft + sceneOffset({ ...worker(), home: 1 }, geometry) + geometry.petWidth;
    time = 9980; // One running cycle into the exit.
    stage.tick();
    assert.equal(worker().x, 0);
    stage.setExitSlot("team", exitSlot({ home: 1, ...geometry }));
    assert.equal(worker().x, 0, "refresh does not jump the pet");
    const startRight = right();
    time += cycleDuration("running-left");
    stage.tick();
    assert.ok(Math.abs(startRight - right() - geometry.stridePixels) < 1e-9);
    time = 14220;
    stage.tick();
    assert.ok(right() > 0, "pet is still visible at the old completion time");
    const exitEnd = 9980 + (startRight + 1) / geometry.stridePixels * cycleDuration("running-left");
    time = exitEnd - 1;
    stage.tick();
    assert.ok(right() <= 0 && right() > -1);
    time = Math.ceil(exitEnd);
    stage.tick();
    assert.equal(worker(), undefined);
  }
});

test("a team moving left past an in-flight exit completes without returning the pet to its slot", () => {
  let time = 1000;
  const stage = createStage({ now: () => time });
  stage.apply({ source: "leader", type: "prompt", team: "team", at: time });
  stage.apply({ source: "worker", type: "heartbeat", team: "team", worker: "w", seq: 1, at: time });
  stage.setExitSlot("team", -3);
  stage.apply({ source: "worker", type: "end", outcome: "success", team: "team", worker: "w", seq: 2, at: time });
  time = 16340; // Four running cycles into the exit: x = -1.5.
  stage.tick();
  const geometry = { homeLeft: 223, petWidth: 216, scale: 1 };
  stage.setExitSlot("team", exitSlot({ home: 1, ...geometry }));
  const worker = stage.snapshot().teams[0].workers[0];
  assert.equal(worker.x, -1.5, "an already clear pet stays at its current position until removal");
  assert.equal(worker.facing, "left");
  assert.equal(worker.displayState, "running-left");
  assert.ok(geometry.homeLeft + sceneOffset({ ...worker, home: 1 }, geometry) + geometry.petWidth < 0);
  stage.tick();
  assert.equal(stage.snapshot().teams[0].workers.length, 0);
});

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
