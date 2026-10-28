import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_PORT = 47800;
export const bundle = fileURLToPath(new URL("../", import.meta.url));
export const state = join(bundle, "..", "pet-state");
export const spool = join(state, "spool");
export const lock = join(spool, "delivery.lock");
export const EXPIRY_MS = 5 * 60 * 1000;

export function updating() {
  try { return Date.now() - statSync(join(state, "updating")).mtimeMs < EXPIRY_MS; } catch { return false; }
}

export function pending() {
  try { return existsSync(lock) || readdirSync(spool).some(name => name.endsWith(".json")); } catch { return false; }
}

export function readToken() {
  try { return readFileSync(join(state, "token"), "utf8").trim(); } catch { return ""; }
}

function exchange(path, body, token, deadline) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: "127.0.0.1", port: Number(process.env.CODEX_DELEGATE_PET_PORT ?? DEFAULT_PORT),
      path, method: body ? "POST" : "GET", agent: false,
      headers: { "X-Codex-Delegate-Pet-Token": token,
        ...(body ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } : {}) },
    }, res => {
      let data = "";
      res.on("data", chunk => {
        data += chunk;
        if (Buffer.byteLength(data) > 8192) req.destroy(new Error("response too large"));
      });
      res.on("error", reject);
      res.on("end", () => resolve({ status: res.statusCode, data }));
    });
    const timer = setTimeout(() => req.destroy(new Error("timeout")), Math.max(1, deadline - Date.now()));
    req.on("error", reject);
    req.on("close", () => clearTimeout(timer));
    req.end(body);
  });
}

// Only refusal and our own not-ready identity permit a launch/retry. A foreign,
// unauthorized, broken or silent port holder must never cause a launch loop.
export async function health(token, deadline) {
  try {
    const { status, data } = await exchange("/health", null, token, deadline);
    const body = JSON.parse(data);
    if (body.app !== "codex-delegate-pet" || body.protocol !== 1 || typeof body.version !== "string" || !body.version) return "unavailable";
    return status === 200 ? "ready" : status === 503 ? "starting" : "unavailable";
  } catch (error) { return error.code === "ECONNREFUSED" ? "absent" : "unavailable"; }
}

export async function post(event, token, deadline) {
  const { status } = await exchange("/event", JSON.stringify(event), token, deadline);
  return status;
}

export async function exclude(token, deadline) {
  await exchange("/exclude", "{}", token, deadline);
}

let spoolSequence = 0;
export function enqueue(event) {
  mkdirSync(spool, { recursive: true });
  // Preserve producer order even when start and end share a millisecond.
  const sequence = String(++spoolSequence).padStart(12, "0");
  const path = join(spool, `${event.at}-${process.pid}-${sequence}-${randomUUID()}.json`);
  const temp = `${path}.tmp`;
  writeFileSync(temp, JSON.stringify(event), { mode: 0o600 });
  renameSync(temp, path);
}

export function startHelper() {
  const child = spawn(process.execPath, [fileURLToPath(new URL("pet-delivery.mjs", import.meta.url))], {
    detached: true, windowsHide: true, stdio: "ignore",
  });
  child.on("error", () => {});
  child.unref();
}
