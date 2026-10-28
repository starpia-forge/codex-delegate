// The shell supplies wall time; this module has no I/O.
import { applyOverflow } from "./layout.mjs";
import { createScenes } from "./scenes.mjs";

export function createStage({ now }) {
  let fitLimit = 16;
  const teams = new Map();
  const sequences = new Map();
  const workerTimes = new Map();
  const workerAppearance = new Map();
  let nextAppearance = 0;
  const ended = new Set();
  // Kept after removal so late events cannot resurrect a closed team.
  const leaders = new Map();
  function teamFor(key) {
    if (!teams.has(key)) teams.set(key, { leader: null, workers: new Map(), scenes: createScenes({ now }) });
    return teams.get(key);
  }
  return {
    setFitLimit(n) {
      fitLimit = Math.max(0, Math.min(16, Math.floor(n)));
    },
    apply(event) {
      if (event.source === "leader") {
        const previous = leaders.get(event.team);
        if (event.at < (previous?.at ?? -Infinity)) return;
        if (previous?.ended && (event.type !== "session-start" || event.at <= previous.at)) return;
        const generation = event.type === "session-start" ? event.at : previous?.generation;
        leaders.set(event.team, { at: event.at, generation, ended: event.type === "session-end" });
        if (event.type === "session-end") {
          teams.delete(event.team);
          return;
        }
        const team = teamFor(event.team);
        if (event.type === "session-start") {
          for (const id of team.workers.keys()) {
            if (workerTimes.get(id) < event.at) {
              team.workers.delete(id);
              team.scenes.remove(id);
            }
          }
        }
        let state = team.leader?.state ?? "idle";
        if (event.type === "session-start") state = "idle";
        else if (event.type === "prompt") state = "running";
        else if (state !== "failed") {
          if (event.type === "waiting") state = "waiting";
          else if (event.type === "resumed" && state === "waiting") state = "running";
          else if (event.type === "stop") { state = "review"; team.reviewSince = event.at; }
          else if (event.type === "failed") state = "failed";
        }
        team.leader = { state, session: event.session };
        return;
      }
      const key = event.team ?? `worker:${event.worker}`;
      const lifecycle = leaders.get(key);
      if (lifecycle?.ended || event.at < (lifecycle?.generation ?? -Infinity)) return;
      if (ended.has(event.worker) || event.seq <= (sequences.get(event.worker) ?? -1)) return;
      sequences.set(event.worker, event.seq);
      workerTimes.set(event.worker, event.at);
      if (event.type === "end") {
        ended.add(event.worker);
        const team = teamFor(key);
        if (!team.workers.has(event.worker)) {
          workerAppearance.set(event.worker, nextAppearance++);
          team.workers.set(event.worker, { worker: event.worker, role: event.role,
            label: event.label, state: "running", lastSeen: now() });
        }
        team.scenes.end(event.worker, [...team.workers.keys()].indexOf(event.worker) + 1, !!team.leader, event.outcome);
        return;
      }
      const team = teamFor(key);
      if (!team.workers.has(event.worker)) workerAppearance.set(event.worker, nextAppearance++);
      team.workers.set(event.worker, { worker: event.worker, role: event.role,
        label: event.label, state: "running", lastSeen: now() });
      if (event.type === "start") team.scenes.start(event.worker, [...team.workers.keys()].indexOf(event.worker) + 1, !!team.leader);
    },
    tick() {
      for (const [key, team] of teams) {
        for (const id of team.scenes.tick()) team.workers.delete(id);
        if (team.leader?.state === "review" && now() - team.reviewSince >= 60000) team.leader.state = "idle";
        for (const [id, worker] of team.workers) {
          if (!ended.has(id) && now() - worker.lastSeen >= 30000) {
            team.workers.delete(id);
            team.scenes.remove(id);
          }
        }
        if (!team.leader && !team.workers.size) teams.delete(key);
      }
    },
    snapshot() {
      return applyOverflow([...teams].map(([key, team]) => ({ key,
        leader: team.leader ? { ...team.leader, ...team.scenes.leader(team.leader.state) } : null,
        workers: [...team.workers.values()].map((worker, index) => ({ ...worker,
          ...team.scenes.worker(worker.worker, index + 1) })) })), fitLimit, workerAppearance);
    },
  };
}
