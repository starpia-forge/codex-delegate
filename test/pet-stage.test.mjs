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
