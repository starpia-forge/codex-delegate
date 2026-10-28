import { randomUUID } from "node:crypto";
import { enqueue, exclude, health, pending, post, readToken, startHelper, updating } from "./pet-transport.mjs";
export { DEFAULT_PORT } from "./pet-transport.mjs";

// This boundary never starts an app or spools a request. Nothing listening
// means there is no visible strip to protect.
export async function requestCaptureExclusion() {
  try {
    const deadline = Date.now() + 1000;
    const token = readToken();
    if (!token) return;
    const status = await health(token, deadline);
    if (status === "ready" || status === "starting") await exclude(token, deadline);
  } catch { /* Capture must never prevent a worker from starting. */ }
}

async function deliver(event) {
  try {
    const token = readToken();
    if (!token) return;
    if (updating()) { enqueue(event); return; }
    const deadline = Date.now() + 250;
    const status = await health(token, deadline);
    if (status === "unavailable") return;
    if (updating()) { enqueue(event); return; }
    if (status === "ready" && !pending()) {
      try {
        const response = await post(event, token, deadline);
        if (response !== 503) return;
      } catch (error) { if (error.code !== "ECONNREFUSED") return; }
    }
    enqueue(event);
    startHelper();
  } catch { /* Pets must never affect a producer. No logging or retries. */ }
}

export async function sendLeader({ type, team, session, at = Date.now() }) {
  await deliver({ v: 1, source: "leader", team, session, at, type });
}

export function createWorker({ role, label }) {
  const worker = randomUUID();
  let seq = 0;
  return {
    async send(type, outcome) {
      const event = { v: 1, source: "worker", team: process.env.CLAUDE_PID ?? null,
        session: process.env.CLAUDE_CODE_SESSION_ID ?? null, worker, role, label,
        at: Date.now(), seq: ++seq, type, ...(outcome ? { outcome } : {}) };
      await deliver(event);
    },
  };
}
