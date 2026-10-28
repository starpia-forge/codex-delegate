import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { request } from "node:http";
import { dirname, join, resolve } from "node:path";
import { unpackZip } from "./zip.mjs";

const EVENTS = ["SessionStart", "SessionEnd", "UserPromptSubmit", "PermissionRequest", "Notification", "Stop", "StopFailure", "PostToolUse"];
const petRoot = () => join(homedir(), ".codex-delegate");
const markerPath = () => join(petRoot(), "pet-state", ".codex-delegate.json");
const removalPath = () => join(petRoot(), ".pet-removal.json");

function writeJson(path, value) {
  const temp = `${path}.tmp-${randomUUID()}`;
  try {
    writeFileSync(temp, JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    renameSync(temp, path);
  } finally { rmSync(temp, { force: true }); }
}

export async function withInstallerLock(action, { recoverPet = false } = {}) {
  const parentExisted = existsSync(petRoot());
  mkdirSync(petRoot(), { recursive: true });
  const lock = join(petRoot(), "install.lock");
  const claim = join(petRoot(), "install.claim");
  const ownership = JSON.stringify({ pid: process.pid, id: randomUUID() });
  let acquired = false;
  let claimed = false;
  const busy = () => new Error(`Another installer holds the install lock: ${lock}`);
  const deadHolder = path => {
    let holder;
    try { holder = JSON.parse(readFileSync(path, "utf8")); } catch { return false; }
    return Number.isSafeInteger(holder?.pid) && holder.pid > 0 && !alive(holder.pid);
  };
  try {
    // Serialize stale-lock reclamation as well as acquisition. A contender
    // must never unlink a new lock published by a fellow stale-lock contender.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        writeFileSync(claim, ownership, { flag: "wx", mode: 0o600 });
        claimed = true;
        break;
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
        if (!deadHolder(claim)) throw busy();
        rmSync(claim);
      }
    }
    if (!claimed) throw busy();
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        writeFileSync(lock, ownership, { flag: "wx", mode: 0o600 });
        acquired = true;
        break;
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
        if (!deadHolder(lock)) throw busy();
        rmSync(lock);
      }
    }
    if (!acquired) throw busy();
    rmSync(claim);
    claimed = false;
    // Only the holder may clear a flag left by a previous interrupted apply.
    if (recoverPet) {
      const flag = join(petRoot(), "pet-state", "updating");
      if (existsSync(flag)) rmSync(flag);
      // A dead installer cannot finish its staging directories. Keep previous
      // bundles until a replacement is in place, in case the swap was interrupted.
      for (const entry of readdirSync(petRoot(), { withFileTypes: true })) {
        if (entry.isDirectory() && entry.name.startsWith(".pet-staging-")) rmSync(join(petRoot(), entry.name), { recursive: true });
      }
    }
    return await action();
  } finally {
    if (claimed && readFileSync(claim, "utf8") === ownership) rmSync(claim);
    if (acquired && readFileSync(lock, "utf8") === ownership) rmSync(lock);
    if (!parentExisted && existsSync(petRoot()) && readdirSync(petRoot()).length === 0) rmdirSync(petRoot());
  }
}

export function readPetMarker() {
  try { return JSON.parse(readFileSync(markerPath(), "utf8")); }
  catch { return null; }
}

export function listPet() {
  const marker = readPetMarker();
  console.log(marker
    ? `Pet: enabled, bundle ${marker.bundle?.version ?? "unknown"} (${marker.bundle?.tag ?? "unknown"}) -> ${join(petRoot(), "pet")}, hooks in ${marker.settingsPath ?? "unknown"}`
    : "Pet: not installed");
}

function readSettings(path) {
  try { return readFileSync(path); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

const object = value => value !== null && typeof value === "object" && !Array.isArray(value);

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function alive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { if (error.code === "ESRCH") return false; throw error; }
}

async function stopPet(state) {
  let token;
  try { token = readFileSync(join(state, "token"), "utf8").trim(); }
  catch (error) { if (error.code === "ENOENT") return; throw error; }
  if (!token) return;
  const timeout = Math.max(50, Number(process.env.CODEX_DELEGATE_PET_QUIT_TIMEOUT_MS) || 1500);
  const exchange = (path, method = "GET") => new Promise((resolve, reject) => {
    const req = request({ hostname: "127.0.0.1", port: Number(process.env.CODEX_DELEGATE_PET_PORT || 47800), path, method,
      agent: false, headers: { "x-codex-delegate-pet-token": token } }, res => {
      let body = "";
      res.on("data", chunk => {
        body += chunk;
        if (body.length > 8192) req.destroy(new Error("Pet response too large"));
      });
      res.on("error", reject);
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    const timer = setTimeout(() => req.destroy(new Error("Pet request timed out")), timeout);
    req.on("close", () => clearTimeout(timer));
    req.on("error", reject);
    req.end();
  });
  let health;
  try {
    const response = await exchange("/health");
    if (![200, 503].includes(response.status)) return;
    health = JSON.parse(response.body);
  } catch { return; }
  if (health?.app !== "codex-delegate-pet" || health.protocol !== 1 || typeof health.version !== "string") return;
  const pid = health.pid;
  if (!Number.isSafeInteger(pid) || pid <= 0 || pid === process.pid) throw new Error("Pet health has no safe process id; cannot safely replace or remove the running app");
  try { await exchange("/quit", "POST"); } catch { /* A quitting app may close the socket. */ }
  const deadline = Date.now() + timeout;
  while (alive(pid) && Date.now() < deadline) await delay(25);
  if (alive(pid)) {
    try { process.kill(pid, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") throw error; }
    const forcedDeadline = Date.now() + timeout;
    while (alive(pid) && Date.now() < forcedDeadline) await delay(25);
    if (alive(pid)) throw new Error(`Pet process ${pid} did not stop; bundle was not changed`);
  }
}

function pausePet(steps, state) {
  const flag = join(state, "updating");
  let flagged = false;
  let refresh;
  steps.push({ label: `set updating flag and stop pet app (${flag})`, status: "not applied", apply: async () => {
    mkdirSync(state, { recursive: true });
    writeFileSync(flag, "updating\n");
    flagged = true;
    refresh = setInterval(() => writeFileSync(flag, "updating\n"), 30_000);
    refresh.unref();
    await stopPet(state);
  } });
  return () => {
    clearInterval(refresh);
    if (flagged) rmSync(flag, { force: true });
  };
}

export function preparePetRemoval({ dryRun = false } = {}) {
  const marker = existsSync(removalPath()) ? JSON.parse(readFileSync(removalPath(), "utf8")) : readPetMarker();
  if (!marker) {
    console.log("Pet: no pet installed");
    return;
  }
  const bundle = join(petRoot(), "pet");
  const state = join(petRoot(), "pet-state");
  const settingsPath = marker.settingsPath;
  if (!settingsPath) throw new Error("Pet marker has no recorded settings path; cannot safely remove hooks");
  const original = readSettings(settingsPath);
  let settings;
  try {
    settings = original === null ? {} : JSON.parse(original.toString("utf8"));
    if (!object(settings) || (settings.hooks !== undefined && !object(settings.hooks))) throw new Error("expected settings and hooks objects");
    for (const event of new Set([...Object.keys(marker.hooks ?? {}), ...Object.keys(marker.pendingHooks ?? {})])) {
      const owned = [marker.hooks?.[event], marker.pendingHooks?.[event]].filter(value => typeof value === "string");
      const groups = settings.hooks?.[event];
      if (groups === undefined) continue;
      if (!Array.isArray(groups)) throw new Error(`hooks.${event} must be an array`);
      settings.hooks[event] = groups.flatMap(group => {
        if (!Array.isArray(group?.hooks)) return [group];
        const hooks = group.hooks.filter(entry => !owned.includes(entry?.command));
        if (hooks.length === group.hooks.length) return [group];
        return hooks.length ? [{ ...group, hooks }] : [];
      });
      if (!settings.hooks[event].length) delete settings.hooks[event];
    }
  } catch (error) { throw new Error(`Cannot parse Claude Code settings ${settingsPath}: ${error.message}`); }
  const steps = [];
  const add = (label, apply) => steps.push({ label, apply, status: "not applied" });
  const backupPath = original === null ? null : `${settingsPath}.codex-delegate-backup-${Date.now()}-${randomUUID()}`;
  let backupWritten = false;
  const changed = original !== null && JSON.stringify(settings) !== JSON.stringify(JSON.parse(original));
  if (changed) add(`write Claude Code settings ${settingsPath} (remove owned pet hooks)`, () => {
    const check = () => {
      const current = readSettings(settingsPath);
      if (current === null || !current.equals(original)) throw new Error(`Claude Code settings changed since preflight: ${settingsPath}; refusing to overwrite`);
    };
    check();
    writeFileSync(backupPath, original, { flag: "wx" });
    backupWritten = true;
    const temp = `${settingsPath}.codex-delegate-temp-${randomUUID()}`;
    try {
      writeFileSync(temp, JSON.stringify(settings, null, 2) + "\n", { flag: "wx" });
      check();
      renameSync(temp, settingsPath);
    } finally { rmSync(temp, { force: true }); }
  });
  // Keep ownership outside the state being deleted so even a partial recursive
  // removal, or interruption after deleting the marker, remains retryable.
  add(`record pending pet removal ${removalPath()}`, () => writeJson(removalPath(), marker));
  add(`remove pet bundle ${bundle}`, () => rmSync(bundle, { recursive: true, force: true }));
  for (const name of readdirSync(petRoot()).filter(name => name.startsWith(".pet-previous-"))) {
    const path = join(petRoot(), name);
    add(`remove previous pet bundle ${path}`, () => rmSync(path, { recursive: true, force: true }));
  }
  add(`remove pet state ${state}`, () => rmSync(state, { recursive: true, force: true }));
  if (process.env.CODEX_DELEGATE_PET_TEST_FAIL_AFTER_REMOVAL === "1") add("checkpoint after pet state removal", () => {
    throw new Error("Injected failure after state removal; rerun the same command to finish cleanup");
  });
  add(`complete pet removal ${removalPath()}`, () => rmSync(removalPath(), { force: true }));
  if (dryRun) {
    console.log(`Pet: remove owned hooks from ${settingsPath}`);
    console.log("  set updating flag, stop pet app before changes, clear flag afterwards");
    for (const step of steps) console.log(`  ${step.label}`);
    console.log(`  settings backup: ${changed ? backupPath : "none (settings unchanged)"}`);
    return { steps: [], cleanup() {} };
  }
  const pause = [];
  const resume = pausePet(pause, state);
  return { steps: [...pause, ...steps], cleanup: resume, backup: () => backupWritten ? backupPath : "none (no settings backup written)" };
}

export async function preparePet({ root, pkg, dryRun = false }) {
  const existing = readPetMarker();
  const pin = JSON.parse(readFileSync(process.env.CODEX_DELEGATE_PET_TEST_PIN || join(root, "pet-pin.json"), "utf8"));
  if (![pin.tag, pin.asset, pin.version].every(value => typeof value === "string" && value.length)
    || !/^[a-f0-9]{64}$/i.test(pin.sha256)) throw new Error("Invalid pet pin");
  const base = process.env.CODEX_DELEGATE_PET_BASE_URL || "https://github.com/starpia-forge/codex-delegate/releases/download";
  const url = `${base.replace(/\/$/, "")}/${pin.tag}/${pin.asset}`;
  const settingsPath = existing?.settingsPath ?? resolve(process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), "settings.json");
  const bundle = join(petRoot(), "pet");
  const state = join(petRoot(), "pet-state");
  const backupName = () => `${settingsPath}.codex-delegate-backup-${Date.now()}-${randomUUID()}`;
  if (dryRun) {
    console.log(`Pet: ${existing ? "update" : "install"} pet bundle`);
    console.log(`Pet: download ${url}`);
    console.log(`  verify SHA-256 ${pin.sha256}`);
    if (existsSync(bundle)) console.log(`  move existing pet bundle aside from ${bundle}`);
    console.log(`  unpack to staging in ${petRoot()}, then move bundle ${pin.version} -> ${bundle}`);
    if (existsSync(bundle)) console.log("  remove previous bundle after the new bundle is in place");
    console.log(`  ${existsSync(state) ? "keep" : "create"} state directory ${state}`);
    console.log(`  ${existsSync(join(state, "token")) ? "keep" : "create"} token ${join(state, "token")}`);
    console.log(`  write marker ${markerPath()}`);
    console.log(`  add/replace hooks in ${settingsPath}: ${EVENTS.join(", ")}`);
    console.log(`  settings backup: ${existsSync(settingsPath) ? backupName() : "none (settings file will be created)"}`);
    console.log("  write settings via temp file and rename after checking for concurrent changes");
    console.log("  set updating flag, stop pet app before changes, clear flag afterwards");
    console.log("  restart Claude Code so the pet hooks take effect");
    return { steps: [], cleanup() {} };
  }
  let bytes;
  try {
    const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
  } catch (error) { throw new Error(`Pet download failed (${url}): ${error.message}`); }
  if (createHash("sha256").update(bytes).digest("hex") !== pin.sha256.toLowerCase()) throw new Error("Pet checksum mismatch (SHA-256); nothing was changed");

  const original = readSettings(settingsPath);
  const backupPath = original === null ? null : backupName();
  let settings;
  try {
    settings = original === null ? {} : JSON.parse(original.toString("utf8"));
    if (!object(settings)) throw new Error("expected an object");
    if (settings.hooks !== undefined && !object(settings.hooks)) throw new Error("hooks must be an object");
    for (const event of EVENTS) {
      if (settings.hooks?.[event] !== undefined && !Array.isArray(settings.hooks[event])) throw new Error(`hooks.${event} must be an array`);
    }
  } catch (error) { throw new Error(`Cannot parse Claude Code settings ${settingsPath}: ${error.message}`); }
  const command = `node "${join(bundle, "hook", "leader-hook.mjs")}"`;
  const hooks = Object.fromEntries(EVENTS.map(event => [event, command]));
  settings.hooks ??= {};
  for (const event of EVENTS) {
    settings.hooks[event] ??= [];
    const leaf = { type: "command", command, timeout: 10, ...(event === "PostToolUse" ? { async: true } : {}) };
    let replaced = false;
    settings.hooks[event] = settings.hooks[event].flatMap(group => {
      if (!Array.isArray(group?.hooks)) return [group];
      const hooks = group.hooks.flatMap(entry => {
        if (typeof entry?.command === "string" && (entry.command === command || entry.command === existing?.hooks?.[event] || entry.command === existing?.pendingHooks?.[event])) {
          if (replaced) return [];
          replaced = true;
          return [{ ...leaf }];
        }
        return [entry];
      });
      return hooks.length || !group.hooks.length ? [{ ...group, hooks }] : [];
    });
    if (!replaced) settings.hooks[event].push({ hooks: [leaf] });
  }

  const parentExisted = existsSync(petRoot());
  let staging;
  let resume = () => {};
  const cleanup = () => {
    resume();
    if (staging) rmSync(staging, { recursive: true, force: true });
    if (!parentExisted && existsSync(petRoot()) && readdirSync(petRoot()).length === 0) rmdirSync(petRoot());
  };
  try {
    mkdirSync(petRoot(), { recursive: true });
    staging = mkdtempSync(join(petRoot(), ".pet-staging-"));
    unpackZip(bytes, staging);
  } catch (error) { cleanup(); throw error; }

  const temp = `${settingsPath}.codex-delegate-temp-${randomUUID()}`;
  const previous = join(petRoot(), `.pet-previous-${randomUUID()}`);
  const previousBundles = readdirSync(petRoot()).filter(name => name.startsWith(".pet-previous-")).map(name => join(petRoot(), name));
  const marker = { package: pkg.name, version: pkg.version, bundle: pin, settingsPath, hooks, installedAt: new Date().toISOString() };
  const steps = [];
  const add = (label, apply) => steps.push({ label, apply, status: "not applied" });
  resume = pausePet(steps, state);
  if (existsSync(bundle)) add(`move existing pet bundle to ${previous}`, () => renameSync(bundle, previous));
  add(`install pet bundle ${pin.version} -> ${bundle}`, () => renameSync(staging, bundle));
  if (existsSync(bundle)) previousBundles.push(previous);
  for (const path of previousBundles) add(`remove previous pet bundle ${path}`, () => rmSync(path, { recursive: true, force: true }));
  add(`create/keep pet state directory ${state}`, () => mkdirSync(state, { recursive: true }));
  add(`create/keep pet token ${join(state, "token")}`, () => {
    try { writeFileSync(join(state, "token"), randomBytes(32).toString("hex"), { flag: "wx", mode: 0o600 }); }
    catch (error) { if (error.code !== "EEXIST") throw error; }
  });
  const writeMarker = value => writeJson(markerPath(), value);
  // Keep both generations of commands owned until the settings write succeeds.
  // Otherwise a retry after the bundle swap would orphan the old registrations.
  add(`write pet marker ${markerPath()}`, () => writeMarker({ ...marker, hooks: existing?.hooks ?? hooks, pendingHooks: hooks }));
  if (process.env.CODEX_DELEGATE_PET_TEST_FAIL_AFTER_SWAP === "1") add("checkpoint after pet bundle swap", () => {
    throw new Error("Injected failure after bundle swap, before settings write; rerun the same command to complete installation");
  });
  const checkUnchanged = () => {
    const current = readSettings(settingsPath);
    if (original === null ? current !== null : current === null || !current.equals(original)) {
      throw new Error(`Claude Code settings changed since preflight: ${settingsPath}; refusing to overwrite`);
    }
  };
  let backupWritten = false;
  add(`write Claude Code settings ${settingsPath} (${EVENTS.join(", ")})`, () => {
    checkUnchanged();
    mkdirSync(dirname(settingsPath), { recursive: true });
    if (backupPath) {
      writeFileSync(backupPath, original, { flag: "wx" });
      backupWritten = true;
    }
    try {
      writeFileSync(temp, JSON.stringify(settings, null, 2) + "\n", { flag: "wx" });
      checkUnchanged();
      renameSync(temp, settingsPath);
    } finally { rmSync(temp, { force: true }); }
  });
  add(`finalize pet marker ${markerPath()}`, () => writeMarker(marker));
  if (existsSync(removalPath())) add(`clear superseded pet removal ${removalPath()}`, () => rmSync(removalPath()));
  return { steps, cleanup, backup: () => backupWritten ? backupPath : "none (no settings backup written)" };
}
