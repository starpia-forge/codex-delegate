import assert from "node:assert/strict";
import test from "node:test";
import { createStage } from "../pet/app/ui/stage.mjs";

function harness() {
  let time = 1000;
  const stage = createStage({ now: () => time });
  return { stage, at(value) { time = value; stage.tick(); } };
}
const event = (fields = {}) => ({ v: 1, source: "worker", team: "123", session: "session-a",
  worker: "worker-a", role: "implementer", label: "task-a", at: 1000, seq: 1, type: "start", ...fields });
const leader = (type, at = 1000, fields = {}) => ({ v: 1, source: "leader", team: "123",
  session: "session-a", at, type, ...fields });

test("a session starts an idle leader beside its workers without changing team appearance order", () => {
  const { stage } = harness();
  stage.apply(event());
  stage.apply(leader("session-start", 1000, { team: "456" }));
  stage.apply(leader("session-start"));
  stage.apply(event({ team: "456", worker: "worker-b" }));
  assert.deepEqual(stage.snapshot().teams.map(t => [t.key, t.leader, t.workers.map(w => w.worker)]), [
    ["123", { state: "idle", session: "session-a" }, ["worker-a"]],
    ["456", { state: "idle", session: "session-a" }, ["worker-b"]],
  ]);
  stage.apply(event({ type: "end", seq: 2, outcome: "success" }));
  assert.equal(stage.snapshot().teams[0].leader.state, "idle");
});

test("leader activity follows prompts, approvals, turn completion and failure", () => {
  const { stage, at } = harness();
  let timestamp = 1000;
  function transition(type, expected) {
    at(timestamp);
    stage.apply(leader(type, timestamp++));
    assert.equal(stage.snapshot().teams[0].leader.state, expected, type);
  }
  transition("session-start", "idle");
  transition("resumed", "idle");
  transition("prompt", "running");
  transition("resumed", "running");
  transition("waiting", "waiting");
  stage.apply(event());
  stage.apply(event({ type: "end", seq: 2, outcome: "success" }));
  assert.equal(stage.snapshot().teams[0].leader.state, "waiting");
  transition("resumed", "running");
  transition("stop", "review");
  transition("resumed", "review");
  at(61005);
  assert.equal(stage.snapshot().teams[0].leader.state, "review");
  at(61006);
  assert.equal(stage.snapshot().teams[0].leader.state, "idle");
  timestamp = 61007;
  transition("prompt", "running");
  transition("stop", "review");
  transition("prompt", "running");
  transition("failed", "failed");
  transition("resumed", "failed");
  at(200000);
  assert.equal(stage.snapshot().teams[0].leader.state, "failed");
  timestamp = 200001;
  transition("prompt", "running");
  at(300000);
  assert.equal(stage.snapshot().teams[0].leader.state, "running");
});

test("leader timestamps reject stale events, including stale restarts and ignored resumes", () => {
  const { stage } = harness();
  stage.apply(leader("prompt", 2000));
  stage.apply(leader("waiting", 3000, { session: "after-clear" }));
  stage.apply(leader("stop", 2500));
  stage.apply(leader("session-start", 1000));
  assert.deepEqual(stage.snapshot().teams[0].leader, { state: "waiting", session: "after-clear" });
  stage.apply(leader("resumed", 4000));
  stage.apply(leader("resumed", 5000));
  stage.apply(leader("waiting", 4500));
  assert.equal(stage.snapshot().teams[0].leader.state, "running");
  stage.apply(leader("session-end", 4999));
  assert.equal(stage.snapshot().teams.length, 1);
  const snapshot = stage.snapshot();
  snapshot.teams[0].leader.state = "failed";
  assert.equal(stage.snapshot().teams[0].leader.state, "running");
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
  assert.deepEqual(stage.snapshot().teams.map(t => [t.key, t.leader.state, t.workers.map(w => w.worker)]), [
    ["456", "waiting", ["worker-b"]],
  ]);
  stage.apply(leader("session-start", 3000, { session: "new-session" }));
  stage.apply(leader("failed", 2999));
  stage.apply(event({ worker: "late-worker", at: 2999 }));
  stage.apply(event({ worker: "new-worker", at: 3001 }));
  stage.apply(leader("prompt", 3002));
  const teams = stage.snapshot().teams;
  assert.deepEqual(teams.find(t => t.key === "123").workers.map(w => w.worker), ["new-worker"]);
  assert.equal(teams.find(t => t.key === "123").leader.state, "running");
  assert.equal(teams.find(t => t.key === "456").leader.state, "waiting");
  stage.apply(leader("session-end", 10000, { team: "never-seen" }));
  stage.apply(event({ team: "never-seen", worker: "orphan", at: 10001 }));
  assert.equal(stage.snapshot().teams.length, 2);
});

test("a failed turn stays failed until a prompt or a new session generation", () => {
  const { stage, at } = harness();
  stage.apply(leader("failed", 1000));
  for (const [type, timestamp] of [["waiting", 2000], ["resumed", 3000], ["stop", 4000]]) {
    stage.apply(leader(type, timestamp));
    assert.equal(stage.snapshot().teams[0].leader.state, "failed", type);
  }
  at(100000);
  assert.equal(stage.snapshot().teams[0].leader.state, "failed");
  stage.apply(leader("prompt", 100001));
  assert.equal(stage.snapshot().teams[0].leader.state, "running");
  stage.apply(leader("failed", 100002));
  stage.apply(leader("session-start", 100003, { session: "fresh-session" }));
  stage.apply(leader("failed", 100002));
  assert.deepEqual(stage.snapshot().teams[0].leader, { state: "idle", session: "fresh-session" });
});

test("a new generation discards old workers but keeps workers whose events followed its start", () => {
  const { stage } = harness();
  stage.apply(leader("session-start", 1000));
  stage.apply(event({ worker: "old-worker", at: 1001 }));
  stage.apply(event({ worker: "new-worker", at: 3001 }));
  stage.apply(leader("session-start", 3000, { session: "new-session" }));
  stage.apply(event({ worker: "old-worker", at: 2999, seq: 100 }));
  stage.apply(event({ worker: "new-worker", at: 3002, seq: 2, type: "heartbeat" }));
  assert.deepEqual(stage.snapshot().teams[0].leader, { state: "idle", session: "new-session" });
  assert.deepEqual(stage.snapshot().teams[0].workers.map(w => w.worker), ["new-worker"]);
});

test("review expires by the turn end's wall timestamp even when delivery is late", () => {
  const { stage, at } = harness();
  at(60000);
  stage.apply(leader("stop", 1000));
  at(60999);
  assert.equal(stage.snapshot().teams[0].leader.state, "review");
  at(61000);
  assert.equal(stage.snapshot().teams[0].leader.state, "idle");
});

test("any activity event recovers a missing leader and worker expiry keeps its team", () => {
  for (const [type, state] of [["prompt", "running"], ["waiting", "waiting"], ["resumed", "idle"], ["stop", "review"], ["failed", "failed"]]) {
    const { stage, at } = harness();
    stage.apply(leader(type));
    stage.apply(event());
    at(31000);
    assert.deepEqual(stage.snapshot(), { teams: [{ key: "123", leader: { state, session: "session-a" }, workers: [] }] }, type);
  }
});

test("a worker starts running with its role and task label in a leaderless team", () => {
  const { stage } = harness();
  stage.apply(event());
  assert.deepEqual(stage.snapshot(), { teams: [{ key: "123", leader: null, workers: [{
    worker: "worker-a", role: "implementer", label: "task-a", state: "running", lastSeen: 1000,
  }] }] });
});

test("a heartbeat can recover a lost start and refreshes the 30-second lease", () => {
  const { stage, at } = harness();
  stage.apply(event({ type: "heartbeat", seq: 2 }));
  at(30000);
  stage.apply(event({ type: "heartbeat", seq: 3, at: 30000 }));
  at(59999);
  assert.equal(stage.snapshot().teams[0].workers[0].label, "task-a");
  at(60000);
  assert.deepEqual(stage.snapshot(), { teams: [] });
});

test("older sequences and duplicates cannot change a pet or renew its lease", () => {
  const { stage, at } = harness();
  stage.apply(event({ seq: 4, label: "current" }));
  at(20000);
  stage.apply(event({ seq: 3, type: "heartbeat", label: "old" }));
  stage.apply(event({ seq: 4, type: "heartbeat", label: "duplicate" }));
  assert.equal(stage.snapshot().teams[0].workers[0].label, "current");
  at(31000);
  assert.deepEqual(stage.snapshot(), { teams: [] });
});

for (const outcome of ["success", "failed"]) test(`end ${outcome} removes a worker and tombstones even an unseen start`, () => {
  const { stage } = harness();
  stage.apply(event());
  stage.apply(event({ type: "end", outcome, seq: 3 }));
  stage.apply(event({ type: "heartbeat", seq: 2 }));
  stage.apply(event({ type: "heartbeat", seq: 4 }));
  stage.apply(event({ type: "start", seq: 5 }));
  stage.apply(event({ worker: "unseen", type: "end", outcome, seq: 2 }));
  stage.apply(event({ worker: "unseen", type: "heartbeat", seq: 3 }));
  assert.deepEqual(stage.snapshot(), { teams: [] });
});

test("unknown team keys group same-role workers separately; unkeyed workers get their own team", () => {
  const { stage } = harness();
  stage.apply(event());
  stage.apply(event({ worker: "worker-b", label: "task-b" }));
  stage.apply(event({ team: "456", worker: "worker-c" }));
  stage.apply(event({ team: null, worker: "worker-d" }));
  stage.apply(event({ team: null, worker: "worker-e" }));
  assert.deepEqual(stage.snapshot().teams.map(team => [team.key, team.leader, team.workers.map(w => w.label)]), [
    ["123", null, ["task-a", "task-b"]], ["456", null, ["task-a"]],
    ["worker:worker-d", null, ["task-a"]], ["worker:worker-e", null, ["task-a"]],
  ]);
  stage.apply(event({ type: "end", seq: 2, outcome: "success" }));
  assert.equal(stage.snapshot().teams[0].workers[0].worker, "worker-b");
});

test("an out-of-order end cannot remove a newer pet", () => {
  const { stage } = harness();
  stage.apply(event({ seq: 3, type: "heartbeat" }));
  stage.apply(event({ seq: 2, type: "end", outcome: "failed" }));
  assert.equal(stage.snapshot().teams[0].workers.length, 1);
});

test("a self-contained newer heartbeat supplies the current role and label", () => {
  const { stage, at } = harness();
  stage.apply(event());
  at(2000);
  stage.apply(event({ type: "heartbeat", seq: 2, role: "critic", label: "review-task", at: 2000 }));
  assert.deepEqual(stage.snapshot().teams[0].workers, [{
    worker: "worker-a", role: "critic", label: "review-task", state: "running", lastSeen: 2000,
  }]);
});

test("expiry keeps the sequence floor but a fresh heartbeat can recover a worker", () => {
  const { stage, at } = harness();
  stage.apply(event({ seq: 3 }));
  at(31000);
  stage.apply(event({ type: "heartbeat", seq: 2 }));
  assert.deepEqual(stage.snapshot(), { teams: [] });
  stage.apply(event({ type: "heartbeat", seq: 4, at: 31000 }));
  assert.equal(stage.snapshot().teams[0].workers[0].state, "running");
});
