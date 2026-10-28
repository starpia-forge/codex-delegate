import { cycleDuration } from "./animations.mjs";

// Coordinates are team-relative slot units, never strip pixels. The leader's
// home is 0; workers' homes are their one-based order in the team.
const BESIDE = 0.5;
const view = (displayState, x, facing = "right") => ({ displayState, x, facing });
function move(from, to) {
  const facing = to < from ? "left" : "right";
  const displayState = `running-${facing}`;
  return { duration: Math.abs(to - from) * cycleDuration(displayState), from, to, displayState, facing };
}
const hold = (displayState, duration, x, facing) => ({ displayState, duration, from: x, to: x, facing });
// Slot-space travel supplies pacing; the renderer projects this final phase
// from its origin all the way beyond the strip's left edge.
const leave = from => ({ ...move(from, -1), exit: true });

function sample(scene, time, slot) {
  let elapsed = time - scene.began;
  for (const phase of scene.phases) {
    if (elapsed < phase.duration) {
      const x = phase.from === phase.to ? phase.from : phase.from + (phase.to - phase.from) * elapsed / phase.duration;
      return { ...view(phase.displayState, x, phase.facing),
        ...(phase.exit ? { exit: { from: phase.from, progress: elapsed / phase.duration } } : {}) };
    }
    elapsed -= phase.duration;
  }
  return view("running", slot);
}

// A slow, bounded stroll with pauses. Its phase depends only on wall time,
// so skipped ticks (including fullscreen) cannot accumulate movement drift.
function wander(elapsed) {
  const phase = Math.max(0, elapsed) % 20000;
  if (phase < 1000) return view("idle", 0);
  if (phase < 5000) return view("running-right", (phase - 1000) / 16000);
  if (phase < 6000) return view("idle", 0.25);
  if (phase < 14000) return view("running-left", 0.25 - (phase - 6000) / 16000, "left");
  if (phase < 15000) return view("idle", -0.25, "left");
  if (phase < 19000) return view("running-right", -0.25 + (phase - 15000) / 16000);
  return view("idle", 0);
}

export function createScenes({ now }) {
  const workers = new Map();
  let time = now();
  const began = time;
  return {
    start(id, slot, hasLeader) {
      time = now();
      workers.set(id, { began: time, slot, phases: [move(BESIDE, slot)],
        pose: hasLeader ? { state: "waving", start: time, duration: cycleDuration("waving") } : null });
    },
    end(id, slot, hasLeader, outcome) {
      time = now();
      const current = workers.has(id) ? sample(workers.get(id), time, slot) : view("running", slot);
      const origin = current.x;
      if (outcome === "failed") {
        const failed = cycleDuration("failed");
        const acknowledge = hasLeader ? failed : 0;
        const phases = [hold("failed", failed * 2, origin, current.facing),
          hold("idle", acknowledge, origin, current.facing), leave(origin)];
        workers.set(id, { began: time, slot, phases, ends: time + phases.reduce((sum, phase) => sum + phase.duration, 0),
          pose: hasLeader ? { state: "failed", start: time + failed * 2, duration: failed } : null });
        return;
      }
      const back = move(origin, BESIDE);
      const jump = hold("jumping", cycleDuration("jumping"), BESIDE, "left");
      const review = hasLeader ? cycleDuration("review") : 0;
      const phases = [back, jump, hold("idle", review, BESIDE, "left"), leave(BESIDE)];
      workers.set(id, { began: time, slot, phases, ends: time + phases.reduce((sum, phase) => sum + phase.duration, 0),
        pose: hasLeader ? { state: "review", start: time + back.duration + jump.duration, duration: review } : null });
    },
    remove(id) { workers.delete(id); },
    tick() {
      time = now();
      const completed = [];
      for (const [id, scene] of workers) {
        if (time >= scene.ends) { completed.push(id); workers.delete(id); }
      }
      return completed;
    },
    leader(state) {
      if (state === "waiting") return view("waiting", 0);
      let latest;
      for (const { pose } of workers.values()) {
        if (pose && time >= pose.start && time < pose.start + pose.duration && (!latest || pose.start >= latest.start)) latest = pose;
      }
      if (latest) return view(latest.state, 0);
      return state === "idle" ? wander(time - began) : view(state, 0);
    },
    worker(id, slot) {
      const scene = workers.get(id);
      if (!scene) return view("running", slot);
      return sample(scene, time, slot);
    },
  };
}
