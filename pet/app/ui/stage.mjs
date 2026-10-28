// Worker-only stage. The shell supplies wall time; this module has no I/O.
export function createStage({ now }) {
  const teams = new Map();
  const sequences = new Map();
  const ended = new Set();
  return {
    apply(event) {
      if (ended.has(event.worker) || event.seq <= (sequences.get(event.worker) ?? -1)) return;
      sequences.set(event.worker, event.seq);
      const key = event.team ?? `worker:${event.worker}`;
      if (event.type === "end") {
        ended.add(event.worker);
        const workers = teams.get(key);
        workers?.delete(event.worker);
        if (!workers?.size) teams.delete(key);
        return;
      }
      if (!teams.has(key)) teams.set(key, new Map());
      teams.get(key).set(event.worker, { worker: event.worker, role: event.role,
        label: event.label, state: "running", lastSeen: now() });
    },
    tick() {
      for (const [key, workers] of teams) {
        for (const [id, worker] of workers) {
          if (now() - worker.lastSeen >= 30000) workers.delete(id);
        }
        if (!workers.size) teams.delete(key);
      }
    },
    snapshot() {
      return { teams: [...teams].map(([key, workers]) => ({ key, leader: null,
        workers: [...workers.values()].map(worker => ({ ...worker })) })) };
    },
  };
}
