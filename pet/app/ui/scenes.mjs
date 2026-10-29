import { cycleDuration } from "./animations.mjs";

// Coordinates are team-relative slot units, never strip pixels. The leader's
// home is 0; workers' homes are their one-based order in the team.
const BESIDE = 0.5;
const STRIDE = 0.5;
const WANDER = 0.25;
const view = (displayState, x, facing = "right") => ({ displayState, x, facing });
function move(from, to) {
  const facing = to < from ? "left" : "right";
  const displayState = `running-${facing}`;
  return { duration: Math.abs(to - from) / STRIDE * cycleDuration(displayState), from, to, displayState, facing };
}
const hold = (displayState, duration, x, facing) => ({ displayState, duration, from: x, to: x, facing });
const leave = (from, to) => ({ ...move(from, to), displayState: "running-left", facing: "left", exit: true });
const endTime = (began, phases) => began + phases.reduce((sum, phase) => sum + phase.duration, 0);

function sample(scene, time, slot) {
  let elapsed = time - scene.began;
  for (const phase of scene.phases) {
    if (elapsed < phase.duration) {
      const x = phase.from === phase.to ? phase.from : phase.from + (phase.to - phase.from) * elapsed / phase.duration;
      return view(phase.displayState, x, phase.facing);
    }
    elapsed -= phase.duration;
  }
  const last = scene.phases.at(-1);
  return last.exit ? view(last.displayState, last.to, last.facing) : view("running", slot);
}

// A slow, bounded stroll with pauses. Its phase depends only on wall time,
// so skipped ticks (including fullscreen) cannot accumulate movement drift.
function wander(elapsed) {
  const phase = Math.max(0, elapsed) % 20000;
  const right = move(0, WANDER).duration;
  const left = move(WANDER, -WANDER).duration;
  if (phase < 1000) return view("idle", 0);
  if (phase < 1000 + right) return view("running-right", WANDER * (phase - 1000) / right);
  if (phase < 6000) return view("idle", WANDER);
  if (phase < 6000 + left) return view("running-left", WANDER - 2 * WANDER * (phase - 6000) / left, "left");
  if (phase < 15000) return view("idle", -WANDER, "left");
  if (phase < 15000 + right) return view("running-right", -WANDER + WANDER * (phase - 15000) / right);
  return view("idle", 0);
}

export function createScenes({ now }) {
  const workers = new Map();
  let time = now();
  const began = time;
  let exitSlot = -1; // Until the renderer reports geometry, keep the old slot target.
  return {
    setExitSlot(slot) {
      if (slot === exitSlot) return;
      exitSlot = slot;
      for (const scene of workers.values()) {
        const phase = scene.phases.at(-1);
        if (!phase.exit) continue;
        const start = scene.ends - phase.duration;
        if (time >= start) {
          // Re-plan from the current position, even when the new edge is
          // already behind us. Never turn around or snap back to the slot.
          const x = sample(scene, time, scene.slot).x;
          scene.phases = [leave(x, Math.min(x, exitSlot))];
          scene.began = time;
        } else {
          Object.assign(phase, leave(phase.from, exitSlot));
        }
        scene.ends = endTime(scene.began, scene.phases);
      }
    },
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
          hold("idle", acknowledge, origin, current.facing), leave(origin, exitSlot)];
        workers.set(id, { began: time, slot, phases, ends: endTime(time, phases),
          pose: hasLeader ? { state: "failed", start: time + failed * 2, duration: failed } : null });
        return;
      }
      const back = move(origin, BESIDE);
      const jump = hold("jumping", cycleDuration("jumping"), BESIDE, "left");
      const review = hasLeader ? cycleDuration("review") : 0;
      const phases = [back, jump, hold("idle", review, BESIDE, "left"), leave(BESIDE, exitSlot)];
      workers.set(id, { began: time, slot, phases, ends: endTime(time, phases),
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
