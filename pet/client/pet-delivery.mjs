import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { closeSync, futimesSync, openSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bundle, EXPIRY_MS, health, lock, post, readToken, spool, updating } from "./pet-transport.mjs";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const LOCK_MAX_AGE_MS = 2 * 60 * 1000;
const claim = join(spool, "delivery.claim");

function stale(path) {
  if (Date.now() - statSync(path).mtimeMs > LOCK_MAX_AGE_MS) return true;
  let pid;
  try { ({ pid } = JSON.parse(readFileSync(path, "utf8"))); } catch { return false; }
  // An empty file may belong to a contender still publishing its PID.
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return false; } catch (error) { return error.code === "ESRCH"; }
}

function acquire() {
  let gate;
  try { gate = openSync(claim, "wx", 0o600); } catch {
    try { if (stale(claim)) unlinkSync(claim); } catch {}
    return null;
  }
  try {
    writeFileSync(gate, JSON.stringify({ pid: process.pid }));
    // Serialize reclamation as well as acquisition: two stale-lock contenders
    // must not unlink a newly published owner's lock.
    let fd;
    try { fd = openSync(lock, "wx", 0o600); } catch {
      if (!stale(lock)) return null;
      unlinkSync(lock);
      fd = openSync(lock, "wx", 0o600);
    }
    const id = randomUUID();
    writeFileSync(fd, JSON.stringify({ pid: process.pid, id }));
    return { fd, id };
  } finally { closeSync(gate); unlinkSync(claim); }
}

function release({ fd, id }) {
  closeSync(fd);
  if (JSON.parse(readFileSync(lock, "utf8")).id === id) unlinkSync(lock);
}

function refresh(fd) {
  const now = new Date();
  futimesSync(fd, now, now);
}

function queued() {
  const events = [];
  for (const name of readdirSync(spool).filter(name => name.endsWith(".json"))) {
    const path = join(spool, name);
    try {
      if (statSync(path).size > 16384) throw new Error("oversized event");
      const event = JSON.parse(readFileSync(path, "utf8"));
      if (!Number.isSafeInteger(event.at) || event.at < 0 || Date.now() - event.at >= EXPIRY_MS) throw new Error("expired or invalid event");
      events.push({ name, event });
    } catch { unlinkSync(path); }
  }
  return events.sort((a, b) => a.event.at - b.event.at || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

let launched = false;
async function deliver(token, fd) {
  if (updating()) return false;
  if (!queued().length) return true;
  const deadline = Date.now() + Number(process.env.CODEX_DELEGATE_PET_TEST_HEALTH_WAIT_MS ?? 20000);
  let status = await health(token, Math.min(deadline, Date.now() + 250));
  if (status === "unavailable") return false;
  if (status === "absent") {
    if (updating() || launched) return false;
    const command = process.env.CODEX_DELEGATE_PET_TEST_COMMAND
      ? JSON.parse(process.env.CODEX_DELEGATE_PET_TEST_COMMAND) : [join(bundle, "codex-delegate-pet.exe")];
    if (updating()) return false;
    const app = spawn(command[0], command.slice(1), { detached: true, windowsHide: true, stdio: "ignore" });
    launched = true;
    app.on("error", () => {});
    app.unref();
  }
  while (status !== "ready") {
    // A spawned app can still hold its executable before binding. Let the
    // installer wait on our lock until it can see the app, or startup times out.
    if (Date.now() >= deadline || (updating() && !(launched && status === "absent"))) return false;
    refresh(fd);
    await sleep(50);
    status = await health(token, Math.min(deadline, Date.now() + 250));
    // Once we launched an app (or saw its starting identity), the socket can
    // be bound before its HTTP/renderer setup finishes. Keep the same bound;
    // never launch again, and never POST until compatible health succeeds.
  }
  for (;;) {
    const events = queued();
    if (!events.length) return true;
    const { name, event } = events[0];
    if (updating()) return false;
    refresh(fd);
    if (await post(event, token, Date.now() + 250) !== 200) return false;
    unlinkSync(join(spool, name));
  }
}

try {
  const token = readToken();
  while (token && !updating()) {
    const owner = acquire();
    if (!owner) break;
    let drained;
    try {
      drained = await deliver(token, owner.fd);
    } finally { release(owner); }
    // A producer can enqueue after the final scan but before release. Check
    // again outside the lock; either we reclaim it or another helper drains.
    if (!drained || !readdirSync(spool).some(name => name.endsWith(".json"))) break;
  }
} catch { /* Detached delivery is best effort and always silent. */ }
