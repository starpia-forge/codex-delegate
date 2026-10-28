import { randomUUID } from "node:crypto";
import { request } from "node:http";

export const DEFAULT_PORT = 47800;
const DELIVERY_TIMEOUT_MS = 250;

function exchange(port, path, body, deadline) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: "127.0.0.1", port, path, method: body ? "POST" : "GET", agent: false,
      headers: body ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } : {},
    }, res => {
      let data = "";
      res.on("data", chunk => {
        data += chunk;
        if (data.length > 8192) req.destroy(new Error("response too large"));
      });
      res.on("error", reject);
      res.on("end", () => res.statusCode === 200 ? resolve(data) : reject(new Error("unavailable")));
    });
    // An absolute deadline also covers a peer that trickles data indefinitely.
    const timer = setTimeout(() => req.destroy(new Error("timeout")), Math.max(1, deadline - Date.now()));
    req.on("error", reject);
    req.on("close", () => clearTimeout(timer));
    req.end(body);
  });
}

export function createWorker({ role, label }) {
  const worker = randomUUID();
  let seq = 0;
  return {
    async send(type, outcome) {
      const event = { v: 1, source: "worker", team: process.env.CLAUDE_PID ?? null,
        session: process.env.CLAUDE_CODE_SESSION_ID ?? null, worker, role, label,
        at: Date.now(), seq: ++seq, type, ...(outcome ? { outcome } : {}) };
      try {
        const port = Number(process.env.CODEX_DELEGATE_PET_PORT ?? DEFAULT_PORT);
        const deadline = Date.now() + DELIVERY_TIMEOUT_MS;
        const health = JSON.parse(await exchange(port, "/health", null, deadline));
        if (health.app !== "codex-delegate-pet" || health.protocol !== 1) return;
        await exchange(port, "/event", JSON.stringify(event), deadline);
      } catch { /* Pets must never affect a worker. No logging or retries. */ }
    },
  };
}
