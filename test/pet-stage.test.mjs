import assert from "node:assert/strict";
import test from "node:test";
import { createStage } from "../pet/app/ui/stage.mjs";
import { createAnimationClock } from "../pet/app/ui/animation-clock.mjs";
import { drawingPaused } from "../pet/app/ui/draw-pause.mjs";

function harness() {
  let time = 1000;
  const stage = createStage({ now: () => time });
  return { stage, at(value) { time = value; stage.tick(); } };
}
const event = (fields = {}) => ({ v: 1, source: "worker", team: "123", session: "session-a",
  worker: "worker-a", role: "implementer", label: "task-a", at: 1000, seq: 1, type: "start", ...fields });
const leader = (type, at = 1000, fields = {}) => ({ v: 1, source: "leader", team: "123",
  session: "session-a", at, type, ...fields });

// Existing lifecycle assertions deliberately project the authoritative fields.
function activitySnapshot(stage) {
  const activity = ({ displayState, x, facing, ...pet }) => pet;
  const snapshot = stage.snapshot();
  return { ...snapshot, teams: snapshot.teams.map(team => ({ ...team,
    leader: team.leader && activity(team.leader), workers: team.workers.map(activity),
  })) };
}

const display = pet => [pet.displayState, pet.x, pet.facing];

for (const removal of ["end", "timeout", "session-end", "dead-process"]) {
  test(`inactive ${removal} metadata expires after ten minutes of receipt wall time`, () => {
    const { stage, at } = harness();
    at(60000); // Delayed delivery must still get the full retention period.
    if (["session-end", "dead-process"].includes(removal)) stage.apply(leader("prompt"));
    stage.apply(event({ seq: 20 }));
    if (removal === "end") stage.apply(event({ type: "end", seq: 21, outcome: "success", at: 1001 }));
    if (removal === "session-end") stage.apply(leader("session-end", 1001));
    if (removal === "dead-process") stage.liveness({ team: "123", alive: false, at: 1001 });
    at(659999);
    stage.apply(event({ at: 659999 }));
    assert.equal(stage.snapshot().teams.length, 0, "recent tombstones still reject replay");
    at(660000);
    stage.apply(event({ at: 660000 }));
    assert.deepEqual(stage.snapshot().teams.map(t => t.workers.map(w => w.worker)), [["worker-a"]]);
  });
}

test("delegation waves for one cycle and workers run right from beside their own leader", () => {
  const { stage, at } = harness();
  stage.apply(leader("prompt"));
  stage.apply(event());
  let team = stage.snapshot().teams[0];
  assert.deepEqual(display(team.leader), ["waving", 0, "right"]);
  assert.equal(team.leader.state, "running");
  assert.deepEqual(display(team.workers[0]), ["running-right", 0.5, "right"]);
  at(1160);
  assert.deepEqual(display(stage.snapshot().teams[0].workers[0]), ["running-right", 0.75, "right"]);
  at(1320);
  assert.deepEqual(display(stage.snapshot().teams[0].workers[0]), ["running", 1, "right"]);
  at(1659);
  assert.equal(stage.snapshot().teams[0].leader.displayState, "waving");
  at(1660);
  assert.deepEqual(display(stage.snapshot().teams[0].leader), ["running", 0, "right"]);

  stage.apply(event({ worker: "worker-b", at: 1660 }));
  at(2140);
  team = stage.snapshot().teams[0];
  assert.deepEqual(display(team.workers[1]), ["running-right", 1.25, "right"]);
  at(2620);
  assert.deepEqual(display(stage.snapshot().teams[0].workers[1]), ["running", 2, "right"]);
});

test("a success report runs back, jumps, acknowledges, and exits before removal", () => {
  const { stage, at } = harness();
  stage.apply(leader("prompt"));
  stage.apply(event());
  at(2000);
  stage.apply(event({ type: "end", seq: 2, outcome: "success", at: 2000 }));
  const check = (time, worker, leaderDisplay = "running") => {
    at(time);
    const team = stage.snapshot().teams[0];
    assert.deepEqual(display(team.workers[0]), worker, `worker at ${time}`);
    assert.deepEqual(display(team.leader), [leaderDisplay, 0, "right"], `leader at ${time}`);
    assert.equal(team.leader.state, "running");
    assert.equal(team.workers[0].state, "running");
  };
  check(2000, ["running-left", 1, "left"]);
  check(2160, ["running-left", 0.75, "left"]);
  check(2320, ["jumping", 0.5, "left"]);
  check(2979, ["jumping", 0.5, "left"]);
  check(2980, ["idle", 0.5, "left"], "review");
  check(3939, ["idle", 0.5, "left"], "review");
  check(3940, ["running-left", 0.5, "left"]);
  check(4420, ["running-left", -0.25, "left"]);
  at(4900);
  assert.equal(stage.snapshot().teams[0].workers.length, 0);
  assert.deepEqual(display(stage.snapshot().teams[0].leader), ["running", 0, "right"]);
});

test("a failure report shows two failed cycles, one leader failed cycle, then leaves facing left", () => {
  const { stage, at } = harness();
  stage.apply(leader("prompt"));
  stage.apply(event());
  at(2000);
  stage.apply(event({ type: "end", seq: 2, outcome: "failed", at: 2000 }));
  const check = (time, worker, leaderDisplay = "running") => {
    at(time);
    const team = stage.snapshot().teams[0];
    assert.deepEqual(display(team.workers[0]), worker, `worker at ${time}`);
    assert.deepEqual(display(team.leader), [leaderDisplay, 0, "right"], `leader at ${time}`);
    assert.equal(team.leader.state, "running");
  };
  check(2000, ["failed", 1, "right"]);
  check(3100, ["failed", 1, "right"]);
  check(4199, ["failed", 1, "right"]);
  check(4200, ["idle", 1, "right"], "failed");
  check(5299, ["idle", 1, "right"], "failed");
  check(5300, ["running-left", 1, "left"]);
  check(5940, ["running-left", 0, "left"]);
  at(6580);
  assert.equal(stage.snapshot().teams[0].workers.length, 0);
  assert.equal(stage.snapshot().teams[0].leader.displayState, "running");
});

for (const outcome of ["success", "failed"]) test(`waiting suppresses delegation and ${outcome} report poses while workers keep acting`, () => {
  const { stage, at } = harness();
  stage.apply(leader("waiting"));
  stage.apply(event());
  stage.apply(event({ worker: "worker-b" }));
  assert.deepEqual(display(stage.snapshot().teams[0].leader), ["waiting", 0, "right"]);
  assert.deepEqual(display(stage.snapshot().teams[0].workers[0]), ["running-right", 0.5, "right"]);
  at(2000);
  stage.apply(event({ type: "end", seq: 2, outcome, at: 2000 }));
  const steps = outcome === "success"
    ? [[2160, "running-left", 0.75, "left"], [2320, "jumping", 0.5, "left"],
      [2980, "idle", 0.5, "left"], [3940, "running-left", 0.5, "left"]]
    : [[2000, "failed", 1, "right"], [4199, "failed", 1, "right"],
      [4200, "idle", 1, "right"], [5300, "running-left", 1, "left"]];
  for (const [time, ...expected] of steps) {
    at(time);
    const team = stage.snapshot().teams[0];
    assert.deepEqual(display(team.leader), ["waiting", 0, "right"]);
    assert.equal(team.leader.state, "waiting");
    assert.deepEqual(display(team.workers[0]), expected);
    assert.deepEqual(display(team.workers[1]), ["running", 2, "right"]);
  }
});

for (const outcome of ["success", "failed"]) test(`leaderless workers delegate and report ${outcome} without a leader acknowledgement delay`, () => {
  const { stage, at } = harness();
  stage.apply(event({ team: null }));
  assert.equal(stage.snapshot().teams[0].leader, null);
  assert.deepEqual(display(stage.snapshot().teams[0].workers[0]), ["running-right", 0.5, "right"]);
  at(1160);
  assert.deepEqual(display(stage.snapshot().teams[0].workers[0]), ["running-right", 0.75, "right"]);
  at(2000);
  assert.deepEqual(display(stage.snapshot().teams[0].workers[0]), ["running", 1, "right"]);
  stage.apply(event({ team: null, type: "end", seq: 2, outcome, at: 2000 }));
  const steps = outcome === "success"
    ? [[2000, "running-left", 1, "left"], [2320, "jumping", 0.5, "left"],
      [2980, "running-left", 0.5, "left"], [3460, "running-left", -0.25, "left"]]
    : [[2000, "failed", 1, "right"], [4199, "failed", 1, "right"],
      [4200, "running-left", 1, "left"], [4840, "running-left", 0, "left"]];
  for (const [time, ...expected] of steps) {
    at(time);
    assert.equal(stage.snapshot().teams[0].leader, null);
    assert.deepEqual(display(stage.snapshot().teams[0].workers[0]), expected);
  }
  at(outcome === "success" ? 3940 : 5480);
  assert.deepEqual(stage.snapshot(), { teams: [], overflowSessions: 0 });
});

test("a tombstone applies throughout exit, even when the old heartbeat lease expires", () => {
  const { stage, at } = harness();
  stage.apply(leader("prompt"));
  stage.apply(event());
  at(30900);
  stage.apply(event({ type: "end", seq: 2, outcome: "success", at: 30900 }));
  at(31000);
  stage.apply(event({ type: "heartbeat", seq: 99, label: "late", at: 31000 }));
  stage.apply(event({ type: "start", seq: 100, at: 31000 }));
  let worker = stage.snapshot().teams[0].workers[0];
  assert.equal(worker.label, "task-a");
  assert.equal(worker.lastSeen, 1000);
  assert.equal(worker.displayState, "running-left");
  at(33400);
  worker = stage.snapshot().teams[0].workers[0];
  assert.equal(worker.displayState, "running-left");
  assert.ok(worker.x < 0.5);
  stage.apply(event({ type: "end", seq: 101, outcome: "failed", at: 33400 }));
  at(33800);
  assert.equal(stage.snapshot().teams[0].workers.length, 0);
  stage.apply(event({ type: "heartbeat", seq: 102, at: 33800 }));
  assert.equal(stage.snapshot().teams[0].workers.length, 0);
});

test("idle leaders wander slowly within a quarter slot, facing each direction of movement", () => {
  const { stage, at } = harness();
  stage.apply(leader("session-start"));
  for (const [time, ...expected] of [
    [1000, "idle", 0, "right"], [3000, "running-right", 0.0625, "right"],
    [5000, "running-right", 0.1875, "right"], [6000, "idle", 0.25, "right"],
    [9000, "running-left", 0.125, "left"], [15000, "idle", -0.25, "left"],
    [17000, "running-right", -0.1875, "right"], [21000, "idle", 0, "right"],
  ]) {
    at(time);
    assert.deepEqual(display(stage.snapshot().teams[0].leader), expected, `at ${time}`);
    assert.equal(stage.snapshot().teams[0].leader.state, "idle");
  }
  stage.apply(leader("prompt", 21000));
  at(24000);
  assert.deepEqual(display(stage.snapshot().teams[0].leader), ["running", 0, "right"]);
});

test("a new session generation removes the discarded worker's pending poses", () => {
  const { stage, at } = harness();
  stage.apply(leader("prompt"));
  stage.apply(event());
  stage.apply(leader("session-start", 1001, { session: "new-session" }));
  assert.equal(stage.snapshot().teams[0].workers.length, 0);
  assert.deepEqual(display(stage.snapshot().teams[0].leader), ["idle", 0, "right"]);
  at(1200);
  assert.equal(stage.snapshot().teams[0].leader.displayState, "idle");
});

test("a settled worker's slot follows team order after an earlier worker exits", () => {
  const { stage, at } = harness();
  stage.apply(leader("prompt"));
  stage.apply(event());
  stage.apply(event({ worker: "worker-b" }));
  at(2000);
  stage.apply(event({ type: "end", seq: 2, outcome: "success", at: 2000 }));
  at(4900);
  assert.deepEqual(display(stage.snapshot().teams[0].workers[0]), ["running", 1, "right"]);
  stage.apply(event({ worker: "worker-b", type: "end", seq: 2, outcome: "success", at: 4900 }));
  assert.deepEqual(display(stage.snapshot().teams[0].workers[0]), ["running-left", 1, "left"]);
});

test("a report pose returns to the latest activity and waiting takes effect immediately", () => {
  const { stage, at } = harness();
  stage.apply(leader("prompt"));
  stage.apply(event());
  at(2000);
  stage.apply(event({ type: "end", seq: 2, outcome: "success", at: 2000 }));
  at(2980);
  assert.equal(stage.snapshot().teams[0].leader.displayState, "review");
  at(3100);
  stage.apply(leader("waiting", 3100));
  assert.equal(stage.snapshot().teams[0].leader.displayState, "waiting");
  at(3200);
  stage.apply(leader("resumed", 3200));
  assert.equal(stage.snapshot().teams[0].leader.state, "running");
  assert.equal(stage.snapshot().teams[0].leader.displayState, "review");
  at(3300);
  stage.apply(leader("failed", 3300));
  assert.equal(stage.snapshot().teams[0].leader.state, "failed");
  at(3940);
  assert.equal(stage.snapshot().teams[0].leader.displayState, "failed");
});

test("concurrent scenes affect only their own team", () => {
  const { stage, at } = harness();
  stage.apply(leader("prompt"));
  stage.apply(leader("prompt", 1000, { team: "456" }));
  stage.apply(event());
  assert.equal(stage.snapshot().teams[1].leader.displayState, "running");
  at(2000);
  stage.apply(event({ type: "end", seq: 2, outcome: "success", at: 2000 }));
  at(2800);
  stage.apply(event({ team: "456", worker: "worker-b", at: 2800 }));
  at(2980);
  const [a, b] = stage.snapshot().teams;
  assert.equal(a.leader.displayState, "review");
  assert.equal(b.leader.displayState, "waving");
  assert.deepEqual(display(a.workers[0]), ["idle", 0.5, "left"]);
  assert.deepEqual(display(b.workers[0]), ["running-right", 0.78125, "right"]);
});

test("a fast worker delivered late reports from its current position using receipt wall time", () => {
  const { stage, at } = harness();
  at(60000);
  stage.apply(leader("prompt"));
  stage.apply(event());
  stage.apply(event({ type: "end", seq: 2, outcome: "success", at: 1001 }));
  assert.deepEqual(display(stage.snapshot().teams[0].workers[0]), ["jumping", 0.5, "left"]);
  at(60660);
  assert.equal(stage.snapshot().teams[0].leader.displayState, "review");
  at(61620);
  assert.deepEqual(display(stage.snapshot().teams[0].workers[0]), ["running-left", 0.5, "left"]);
  // A skipped series of render frames still completes on the next wall-time tick.
  at(100000);
  assert.equal(stage.snapshot().teams[0].workers.length, 0);
  assert.equal(stage.snapshot().teams[0].leader.displayState, "running");
});

for (const outcome of ["success", "failed"]) test(`an unseen end ${outcome} still renders its self-contained worker report`, () => {
  const { stage, at } = harness();
  stage.apply(event({ type: "end", seq: 2, outcome }));
  const team = stage.snapshot().teams[0];
  assert.equal(team.leader, null);
  assert.equal(team.workers[0].role, "implementer");
  assert.equal(team.workers[0].label, "task-a");
  assert.deepEqual(display(team.workers[0]), outcome === "success"
    ? ["running-left", 1, "left"] : ["failed", 1, "right"]);
  at(10000);
  assert.deepEqual(stage.snapshot(), { teams: [], overflowSessions: 0 });
});

test("a team's newest workers collapse behind its badge after reserving leader slots", () => {
  const { stage } = harness();
  stage.apply(leader("session-start", 1000));
  stage.apply(event({ worker: "oldest", at: 1001 }));
  stage.apply(event({ worker: "middle", at: 1002 }));
  stage.apply(event({ worker: "newest", at: 1003 }));
  stage.setFitLimit(2);
  const snapshot = stage.snapshot();
  assert.equal(snapshot.overflowSessions, 0);
  assert.deepEqual(snapshot.teams.map(t => [t.key, t.leader.state, t.workers.map(w => w.worker), t.overflowWorkers]), [
    ["123", "idle", ["oldest"], 2],
  ]);
});

test("newest sessions and their workers collapse when leaders alone exceed the limit", () => {
  const { stage } = harness();
  stage.apply(leader("session-start", 1000, { team: "old" }));
  stage.apply(leader("session-start", 1001, { team: "middle" }));
  stage.apply(leader("session-start", 1002, { team: "new" }));
  stage.apply(event({ team: "new", at: 1003 }));
  stage.setFitLimit(1);
  assert.deepEqual(stage.snapshot(), {
    teams: [{ key: "old", leader: { state: "idle", session: "session-a", displayState: "idle", x: 0, facing: "right" },
      workers: [], overflowWorkers: 0 }],
    overflowSessions: 2,
  });
  stage.setFitLimit(4);
  assert.deepEqual(stage.snapshot().teams.map(t => [t.key, t.workers.map(w => w.worker), t.overflowWorkers]), [
    ["old", [], 0], ["middle", [], 0], ["new", ["worker-a"], 0],
  ]);
  assert.equal(stage.snapshot().overflowSessions, 0);
});

test("workers share remaining slots by appearance across teams, including leaderless teams", () => {
  const { stage, at } = harness();
  stage.apply(event({ team: "orphan", worker: "first", at: 1000 }));
  stage.apply(leader("session-start", 1001, { team: "session" }));
  stage.apply(event({ team: "session", worker: "second", at: 1002 }));
  stage.apply(event({ team: "orphan", worker: "third", at: 1003 }));
  stage.apply(event({ team: "overflow-orphan", worker: "fourth", at: 1004 }));
  at(2000);
  stage.apply(event({ team: "orphan", worker: "first", type: "heartbeat", seq: 2, at: 2000 }));
  stage.setFitLimit(3);
  assert.deepEqual(stage.snapshot().teams.map(t => [t.key, t.workers.map(w => w.worker), t.overflowWorkers]), [
    ["orphan", ["first"], 1], ["session", ["second"], 0],
  ]);
  assert.equal(stage.snapshot().overflowSessions, 1);
});

test("changing the fit limit immediately restores overflow state and clamps to zero through sixteen", () => {
  const { stage, at } = harness();
  stage.apply(leader("session-start", 1000));
  for (let i = 0; i < 18; i++) stage.apply(event({ worker: `w${i}`, at: 1001 + i }));
  assert.equal(stage.snapshot().teams[0].workers.length, 15); // default 16, including leader
  stage.setFitLimit(-2);
  assert.deepEqual(stage.snapshot(), { teams: [], overflowSessions: 1 });
  at(2000);
  stage.apply(leader("waiting", 2000));
  stage.apply(event({ worker: "w17", type: "heartbeat", seq: 2, at: 2000, label: "updated while in overflow" }));
  stage.setFitLimit(3.9);
  assert.deepEqual(stage.snapshot().teams[0].workers.map(w => w.worker), ["w0", "w1"]);
  assert.equal(stage.snapshot().teams[0].overflowWorkers, 16);
  stage.setFitLimit(100);
  assert.equal(stage.snapshot().teams[0].workers.length, 15);
  assert.equal(stage.snapshot().teams[0].leader.state, "waiting");
  stage.setFitLimit(1);
  assert.equal(stage.snapshot().teams[0].overflowWorkers, 18);
  at(31018); // all workers except the refreshed w17 have expired, even while in overflow
  stage.setFitLimit(2);
  assert.deepEqual(stage.snapshot().teams[0].workers.map(w => [w.worker, w.label]), [["w17", "updated while in overflow"]]);
  assert.equal(stage.snapshot().teams[0].overflowWorkers, 0);
});

test("a session starts an idle leader beside its workers without changing team appearance order", () => {
  const { stage } = harness();
  stage.apply(event());
  stage.apply(leader("session-start", 1000, { team: "456" }));
  stage.apply(leader("session-start"));
  stage.apply(event({ team: "456", worker: "worker-b" }));
  assert.deepEqual(activitySnapshot(stage).teams.map(t => [t.key, t.leader, t.workers.map(w => w.worker)]), [
    ["123", { state: "idle", session: "session-a" }, ["worker-a"]],
    ["456", { state: "idle", session: "session-a" }, ["worker-b"]],
  ]);
  stage.apply(event({ type: "end", seq: 2, outcome: "success" }));
  assert.equal(activitySnapshot(stage).teams[0].leader.state, "idle");
});

test("leader activity follows prompts, approvals, turn completion and failure", () => {
  const { stage, at } = harness();
  let timestamp = 1000;
  function transition(type, expected) {
    at(timestamp);
    stage.apply(leader(type, timestamp++));
    assert.equal(activitySnapshot(stage).teams[0].leader.state, expected, type);
  }
  transition("session-start", "idle");
  transition("resumed", "idle");
  transition("prompt", "running");
  transition("resumed", "running");
  transition("waiting", "waiting");
  stage.apply(event());
  stage.apply(event({ type: "end", seq: 2, outcome: "success" }));
  assert.equal(activitySnapshot(stage).teams[0].leader.state, "waiting");
  transition("resumed", "running");
  transition("stop", "review");
  transition("resumed", "review");
  at(61005);
  assert.equal(activitySnapshot(stage).teams[0].leader.state, "review");
  at(61006);
  assert.equal(activitySnapshot(stage).teams[0].leader.state, "idle");
  timestamp = 61007;
  transition("prompt", "running");
  transition("stop", "review");
  transition("prompt", "running");
  transition("failed", "failed");
  transition("resumed", "failed");
  at(200000);
  assert.equal(activitySnapshot(stage).teams[0].leader.state, "failed");
  timestamp = 200001;
  transition("prompt", "running");
  at(300000);
  assert.equal(activitySnapshot(stage).teams[0].leader.state, "running");
});

test("leader timestamps reject stale events, including stale restarts and ignored resumes", () => {
  const { stage } = harness();
  stage.apply(leader("prompt", 2000));
  stage.apply(leader("waiting", 3000, { session: "after-clear" }));
  stage.apply(leader("stop", 2500));
  stage.apply(leader("session-start", 1000));
  assert.deepEqual(activitySnapshot(stage).teams[0].leader, { state: "waiting", session: "after-clear" });
  stage.apply(leader("resumed", 4000));
  stage.apply(leader("resumed", 5000));
  stage.apply(leader("waiting", 4500));
  assert.equal(activitySnapshot(stage).teams[0].leader.state, "running");
  stage.apply(leader("session-end", 4999));
  assert.equal(activitySnapshot(stage).teams.length, 1);
  const snapshot = activitySnapshot(stage);
  snapshot.teams[0].leader.state = "failed";
  assert.equal(activitySnapshot(stage).teams[0].leader.state, "running");
});

test("session end removes only its team and requires a newer session start to open a generation", () => {
  const { stage } = harness();
  stage.apply(leader("prompt"));
  stage.apply(event());
  stage.apply(leader("waiting", 1100, { team: "456" }));
  stage.apply(event({ team: "456", worker: "worker-b" }));
  stage.apply(leader("session-end", 2000));
  for (const type of ["prompt", "waiting", "resumed", "stop", "failed", "session-end"]) {
    stage.apply(leader(type, 9000));
  }
  stage.apply(event({ worker: "late-worker", at: 9000 }));
  stage.apply(leader("session-start", 1999));
  stage.apply(leader("session-start", 2000));
  assert.deepEqual(activitySnapshot(stage).teams.map(t => [t.key, t.leader.state, t.workers.map(w => w.worker)]), [
    ["456", "waiting", ["worker-b"]],
  ]);
  stage.apply(leader("session-start", 3000, { session: "new-session" }));
  stage.apply(leader("failed", 2999));
  stage.apply(event({ worker: "late-worker", at: 2999 }));
  stage.apply(event({ worker: "new-worker", at: 3001 }));
  stage.apply(leader("prompt", 3002));
  const teams = activitySnapshot(stage).teams;
  assert.deepEqual(teams.find(t => t.key === "123").workers.map(w => w.worker), ["new-worker"]);
  assert.equal(teams.find(t => t.key === "123").leader.state, "running");
  assert.equal(teams.find(t => t.key === "456").leader.state, "waiting");
  stage.apply(leader("session-end", 10000, { team: "never-seen" }));
  stage.apply(event({ team: "never-seen", worker: "orphan", at: 10001 }));
  assert.equal(activitySnapshot(stage).teams.length, 2);
});

test("a failed turn stays failed until a prompt or a new session generation", () => {
  const { stage, at } = harness();
  stage.apply(leader("failed", 1000));
  for (const [type, timestamp] of [["waiting", 2000], ["resumed", 3000], ["stop", 4000]]) {
    stage.apply(leader(type, timestamp));
    assert.equal(activitySnapshot(stage).teams[0].leader.state, "failed", type);
  }
  at(100000);
  assert.equal(activitySnapshot(stage).teams[0].leader.state, "failed");
  stage.apply(leader("prompt", 100001));
  assert.equal(activitySnapshot(stage).teams[0].leader.state, "running");
  stage.apply(leader("failed", 100002));
  stage.apply(leader("session-start", 100003, { session: "fresh-session" }));
  stage.apply(leader("failed", 100002));
  assert.deepEqual(activitySnapshot(stage).teams[0].leader, { state: "idle", session: "fresh-session" });
});

test("a dead process removes its whole team and blocks late events until a newer session start", () => {
  const { stage } = harness();
  stage.apply(leader("session-start"));
  stage.apply(event());
  stage.apply(leader("waiting", 1100, { team: "456" }));
  const before = stage.snapshot();
  stage.liveness({ team: "123", alive: true, at: 2000 });
  stage.liveness({ team: "123", alive: false, at: 999 });
  assert.deepEqual(stage.snapshot(), before);
  stage.liveness({ team: "123", alive: false, at: 2000 });
  for (const type of ["prompt", "waiting", "resumed", "stop", "failed"]) stage.apply(leader(type, 9000));
  stage.apply(event({ type: "heartbeat", seq: 2, at: 9000 }));
  stage.apply(event({ worker: "late-worker", at: 9000 }));
  stage.liveness({ team: "123", alive: true, at: 9001 });
  stage.apply(leader("session-start", 2000));
  assert.deepEqual(stage.snapshot().teams.map(t => t.key), ["456"]);
  stage.apply(leader("session-start", 3000, { session: "new-session" }));
  stage.liveness({ team: "123", alive: false, at: 2999 });
  stage.apply(event({ worker: "old-worker", at: 2999 }));
  stage.apply(event({ worker: "new-worker", at: 3001 }));
  assert.deepEqual(stage.snapshot().teams.find(t => t.key === "123").workers.map(w => w.worker), ["new-worker"]);
  assert.deepEqual(activitySnapshot(stage).teams.find(t => t.key === "123").leader, { state: "idle", session: "new-session" });
  // A death also tombstones a team whose first event has not arrived yet.
  stage.liveness({ team: "unseen", alive: false, at: 4000 });
  stage.apply(leader("prompt", 5000, { team: "unseen" }));
  stage.apply(event({ team: "unseen", worker: "unseen-worker", at: 5000 }));
  assert.equal(stage.snapshot().teams.length, 2);
});

test("restored leader starts use the recorded time so newer delivered activity wins", () => {
  for (const restoreFirst of [true, false]) {
    const { stage, at } = harness();
    at(600000);
    const restored = leader("session-start", 1000);
    const prompt = leader("prompt", 500000, { session: "after-clear" });
    for (const input of restoreFirst ? [restored, prompt] : [prompt, restored]) stage.apply(input);
    stage.liveness({ team: "123", alive: true, at: 600000 });
    const { teams } = activitySnapshot(stage);
    assert.deepEqual(teams.map(({ key, leader, workers }) => ({ key, leader, workers })),
      [{ key: "123", leader: { state: "running", session: "after-clear" }, workers: [] }]);
  }
});

test("a new generation discards old workers but keeps workers whose events followed its start", () => {
  const { stage } = harness();
  stage.apply(leader("session-start", 1000));
  stage.apply(event({ worker: "old-worker", at: 1001 }));
  stage.apply(event({ worker: "new-worker", at: 3001 }));
  stage.apply(leader("session-start", 3000, { session: "new-session" }));
  stage.apply(event({ worker: "old-worker", at: 2999, seq: 100 }));
  stage.apply(event({ worker: "new-worker", at: 3002, seq: 2, type: "heartbeat" }));
  assert.deepEqual(activitySnapshot(stage).teams[0].leader, { state: "idle", session: "new-session" });
  assert.deepEqual(activitySnapshot(stage).teams[0].workers.map(w => w.worker), ["new-worker"]);
});

test("review expires by the turn end's wall timestamp even when delivery is late", () => {
  const { stage, at } = harness();
  at(60000);
  stage.apply(leader("stop", 1000));
  at(60999);
  assert.equal(activitySnapshot(stage).teams[0].leader.state, "review");
  at(61000);
  assert.equal(activitySnapshot(stage).teams[0].leader.state, "idle");
});

test("any activity event recovers a missing leader and worker expiry keeps its team", () => {
  for (const [type, state] of [["prompt", "running"], ["waiting", "waiting"], ["resumed", "idle"], ["stop", "review"], ["failed", "failed"]]) {
    const { stage, at } = harness();
    stage.apply(leader(type));
    stage.apply(event());
    at(31000);
    assert.deepEqual(activitySnapshot(stage), { teams: [{ key: "123", leader: { state, session: "session-a" }, workers: [], overflowWorkers: 0 }], overflowSessions: 0 }, type);
  }
});

test("a worker starts running with its role and task label in a leaderless team", () => {
  const { stage } = harness();
  stage.apply(event());
  assert.deepEqual(activitySnapshot(stage), { teams: [{ key: "123", leader: null, workers: [{
    worker: "worker-a", role: "implementer", label: "task-a", state: "running", lastSeen: 1000,
  }], overflowWorkers: 0 }], overflowSessions: 0 });
});

test("a heartbeat can recover a lost start and refreshes the 30-second lease", () => {
  const { stage, at } = harness();
  stage.apply(event({ type: "heartbeat", seq: 2 }));
  at(30000);
  stage.apply(event({ type: "heartbeat", seq: 3, at: 30000 }));
  at(59999);
  assert.equal(activitySnapshot(stage).teams[0].workers[0].label, "task-a");
  at(60000);
  assert.deepEqual(activitySnapshot(stage), { teams: [], overflowSessions: 0 });
});

test("older sequences and duplicates cannot change a pet or renew its lease", () => {
  const { stage, at } = harness();
  stage.apply(event({ seq: 4, label: "current" }));
  at(20000);
  stage.apply(event({ seq: 3, type: "heartbeat", label: "old" }));
  stage.apply(event({ seq: 4, type: "heartbeat", label: "duplicate" }));
  assert.equal(activitySnapshot(stage).teams[0].workers[0].label, "current");
  at(31000);
  assert.deepEqual(activitySnapshot(stage), { teams: [], overflowSessions: 0 });
});

for (const outcome of ["success", "failed"]) test(`end ${outcome} removes after its scene and tombstones even an unseen start`, () => {
  const { stage, at } = harness();
  stage.apply(event());
  stage.apply(event({ type: "end", outcome, seq: 3 }));
  stage.apply(event({ type: "heartbeat", seq: 2 }));
  stage.apply(event({ type: "heartbeat", seq: 4 }));
  stage.apply(event({ type: "start", seq: 5 }));
  stage.apply(event({ worker: "unseen", type: "end", outcome, seq: 2 }));
  stage.apply(event({ worker: "unseen", type: "heartbeat", seq: 3 }));
  at(10000);
  stage.apply(event({ type: "heartbeat", seq: 6, at: 10000 }));
  assert.deepEqual(activitySnapshot(stage), { teams: [], overflowSessions: 0 });
});

test("unknown team keys group same-role workers separately; unkeyed workers get their own team", () => {
  const { stage, at } = harness();
  stage.apply(event());
  stage.apply(event({ worker: "worker-b", label: "task-b" }));
  stage.apply(event({ team: "456", worker: "worker-c" }));
  stage.apply(event({ team: null, worker: "worker-d" }));
  stage.apply(event({ team: null, worker: "worker-e" }));
  assert.deepEqual(activitySnapshot(stage).teams.map(team => [team.key, team.leader, team.workers.map(w => w.label)]), [
    ["123", null, ["task-a", "task-b"]], ["456", null, ["task-a"]],
    ["worker:worker-d", null, ["task-a"]], ["worker:worker-e", null, ["task-a"]],
  ]);
  stage.apply(event({ type: "end", seq: 2, outcome: "success" }));
  at(10000);
  assert.equal(activitySnapshot(stage).teams[0].workers[0].worker, "worker-b");
});

test("an out-of-order end cannot remove a newer pet", () => {
  const { stage } = harness();
  stage.apply(event({ seq: 3, type: "heartbeat" }));
  stage.apply(event({ seq: 2, type: "end", outcome: "failed" }));
  assert.equal(activitySnapshot(stage).teams[0].workers.length, 1);
});

test("a self-contained newer heartbeat supplies the current role and label", () => {
  const { stage, at } = harness();
  stage.apply(event());
  at(2000);
  stage.apply(event({ type: "heartbeat", seq: 2, role: "critic", label: "review-task", at: 2000 }));
  assert.deepEqual(activitySnapshot(stage).teams[0].workers, [{
    worker: "worker-a", role: "critic", label: "review-task", state: "running", lastSeen: 2000,
  }]);
});

test("expiry keeps the sequence floor but a fresh heartbeat can recover a worker", () => {
  const { stage, at } = harness();
  stage.apply(event({ seq: 3 }));
  at(31000);
  stage.apply(event({ type: "heartbeat", seq: 2 }));
  assert.deepEqual(activitySnapshot(stage), { teams: [], overflowSessions: 0 });
  stage.apply(event({ type: "heartbeat", seq: 4, at: 31000 }));
  assert.equal(activitySnapshot(stage).teams[0].workers[0].state, "running");
});

for (const flags of [{ hidden: true, fullscreen: false }, { hidden: false, fullscreen: true }])
test(`wall-time lifecycle and events continue while drawing is paused (${flags.hidden ? "hidden" : "fullscreen"})`, () => {
  let time = 1000;
  const stage = createStage({ now: () => time });
  const animation = createAnimationClock({ now: () => time });
  stage.apply(leader("stop"));
  stage.apply(event());
  time = 1500;
  animation.setPaused(drawingPaused(flags));
  const frameTime = animation.now();
  time = 30999;
  stage.tick();
  assert.equal(stage.snapshot().teams[0].workers.length, 1);
  time = 31000;
  stage.tick();
  assert.equal(stage.snapshot().teams[0].workers.length, 0);
  assert.equal(stage.snapshot().teams[0].leader.state, "review");
  time = 61000;
  stage.tick();
  assert.equal(stage.snapshot().teams[0].leader.state, "idle");
  stage.apply(event({ worker: "arrived-while-paused", at: time }));
  assert.equal(stage.snapshot().teams[0].workers[0].worker, "arrived-while-paused");
  stage.apply(event({ worker: "arrived-while-paused", type: "end", outcome: "success", seq: 2, at: time }));
  time += 10000;
  stage.tick();
  assert.equal(stage.snapshot().teams[0].workers.length, 0, "a worker can finish its entire scene while paused");
  assert.equal(animation.now(), frameTime);
  animation.setPaused(false);
  assert.equal(animation.now(), frameTime);
  time += 250;
  assert.equal(animation.now(), frameTime + 250);
});

test("computer use stays live until its last worker ends or expires, including leaderless teams", () => {
  const { stage, at } = harness();
  stage.apply(event());
  assert.equal(stage.computerUseLive(), false);
  stage.apply(event({ worker: "computer-a", role: "computer-user", team: null }));
  stage.apply(event({ worker: "computer-b", role: "computer-user" }));
  assert.equal(stage.computerUseLive(), true);
  stage.apply(event({ worker: "computer-a", role: "computer-user", team: null, seq: 2, type: "end" }));
  assert.equal(stage.computerUseLive(), true);
  at(30999);
  assert.equal(stage.computerUseLive(), true);
  at(31000);
  assert.equal(stage.computerUseLive(), false);
  stage.apply(event({ worker: "computer-b", role: "computer-user", seq: 2, type: "heartbeat", at: 31000 }));
  assert.equal(stage.computerUseLive(), true);
  stage.apply(event({ worker: "computer-b", role: "computer-user", seq: 3, type: "end", at: 31000 }));
  assert.equal(stage.computerUseLive(), false);
});
