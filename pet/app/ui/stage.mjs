// The shell supplies wall time; this module has no I/O.
export function createStage({ now }) {
  const teams = new Map();
  const sequences = new Map();
  const workerTimes = new Map();
  const ended = new Set();
  // Kept after removal so late events cannot resurrect a closed team.
  const leaders = new Map();
  function teamFor(key) {
    if (!teams.has(key)) teams.set(key, { leader: null, workers: new Map() });
    return teams.get(key);
  }
  return {
    liveness({ team, alive, at }) {
      if (alive !== false) return;
      const previous = leaders.get(team);
      if (previous?.ended || at < (previous?.at ?? -Infinity)) return;
      leaders.set(team, { at, generation: previous?.generation, ended: true });
      teams.delete(team);
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
            if (workerTimes.get(id) < event.at) team.workers.delete(id);
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
        const team = teams.get(key);
        team?.workers.delete(event.worker);
        if (team && !team.leader && !team.workers.size) teams.delete(key);
        return;
      }
      teamFor(key).workers.set(event.worker, { worker: event.worker, role: event.role,
        label: event.label, state: "running", lastSeen: now() });
    },
    tick() {
      for (const [key, team] of teams) {
        if (team.leader?.state === "review" && now() - team.reviewSince >= 60000) team.leader.state = "idle";
        for (const [id, worker] of team.workers) {
          if (now() - worker.lastSeen >= 30000) team.workers.delete(id);
        }
        if (!team.leader && !team.workers.size) teams.delete(key);
      }
    },
    snapshot() {
      return { teams: [...teams].map(([key, team]) => ({ key,
        leader: team.leader ? { ...team.leader } : null,
        workers: [...team.workers.values()].map(worker => ({ ...worker })) })) };
    },
  };
}
