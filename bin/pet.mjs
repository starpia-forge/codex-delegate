import { createHash, randomBytes, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, linkSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, renameSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
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

function removeOwned(path, ownership) {
  try { if (readFileSync(path, "utf8") === ownership) rmSync(path); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
}

function resumeDelivery(state) {
  try {
    const helper = join(petRoot(), "pet", "client", "pet-delivery.mjs");
    if (existsSync(join(state, "updating")) || !existsSync(helper)
      || !readdirSync(join(state, "spool")).some(name => name.endsWith(".json"))) return;
    const child = spawn(process.execPath, [helper], { detached: true, windowsHide: true, stdio: "ignore" });
    child.on("error", () => {});
    child.unref();
  } catch { /* Delivery is best effort and must not mask an installer error. */ }
}

export async function withInstallerLock(action, { recoverPet = false } = {}) {
  const parentExisted = existsSync(petRoot());
  mkdirSync(petRoot(), { recursive: true });
  const lock = join(petRoot(), "install.lock");
  // Each contender publishes a unique claim and keeps it until completion.
  // Dead claims can never be replaced at the same pathname by a new owner.
  const claim = join(petRoot(), `install.claim-${randomUUID()}`);
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
    writeFileSync(claim, ownership, { flag: "wx", mode: 0o600 });
    claimed = true;
    for (const name of readdirSync(petRoot()).filter(name => name.startsWith("install.claim-"))) {
      const other = join(petRoot(), name);
      if (other === claim) continue;
      if (!existsSync(other)) continue;
      if (!deadHolder(other)) {
        if (!existsSync(other)) continue;
        throw busy();
      }
      rmSync(other, { force: true });
    }
    // Only one live claimant can reach reclamation. Handle the legacy fixed
    // claim by moving it first and verifying what we actually took ownership of.
    const legacy = join(petRoot(), "install.claim");
    if (existsSync(legacy)) {
      const expected = readFileSync(legacy, "utf8");
      if (!deadHolder(legacy)) throw busy();
      const retired = `${legacy}.retired-${randomUUID()}`;
      renameSync(legacy, retired);
      if (readFileSync(retired, "utf8") !== expected) {
        try { linkSync(retired, legacy); } finally { rmSync(retired, { force: true }); }
        throw busy();
      }
      rmSync(retired);
    }
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
    if (claimed) removeOwned(claim, ownership);
    if (acquired) removeOwned(lock, ownership);
    if (acquired && recoverPet) resumeDelivery(join(petRoot(), "pet-state"));
    if (!parentExisted && existsSync(petRoot()) && readdirSync(petRoot()).length === 0) rmdirSync(petRoot());
  }
}

export function readPetMarker() {
  try { return JSON.parse(readFileSync(markerPath(), "utf8")); }
  catch { return null; }
}

export function petsHidden() {
  try {
    // Match the shell: reject invalid UTF-8 and leave any BOM for JSON.parse to reject.
    const input = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true })
      .decode(readFileSync(join(petRoot(), "pet-state", "pet-preferences.json")));
    const value = JSON.parse(input);
    return value?.hidden === true;
  } catch { return false; }
}

export function readPetPin(root) {
  const pin = JSON.parse(readFileSync(process.env.CODEX_DELEGATE_PET_TEST_PIN || join(root, "pet-pin.json"), "utf8"));
  if (![pin.tag, pin.asset, pin.version].every(value => typeof value === "string" && value.length)
    || !/^[a-f0-9]{64}$/i.test(pin.sha256)) throw new Error("Invalid pet pin");
  return pin;
}

export function listPet() {
  const marker = readPetMarker();
  console.log(marker
    ? `Pet: enabled, bundle ${marker.bundle?.version ?? "unknown"} (${marker.bundle?.tag ?? "unknown"}) -> ${join(petRoot(), "pet")}, hooks in ${marker.settingsPath ?? "unknown"}${petsHidden() ? ", hidden" : ""}`
    : "Pet: not installed");
}

function readSettings(path) {
  try { return readFileSync(path); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

const parseSettings = bytes => JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/, ""));
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// WebView2 helper processes keep files in the bundle open for a moment after
// the app exits, so moving or deleting the bundle can fail briefly.
async function whileLocked(action) {
  for (let attempt = 1; ; attempt++) {
    try { return action(); }
    catch (error) {
      if (!["EPERM", "EBUSY", "EACCES"].includes(error.code) || attempt >= 50) throw error;
      await delay(100);
    }
  }
}
function alive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { if (error.code === "ESRCH") return false; if (error.code === "EPERM") return true; throw error; }
}

function exchangePet(path, { token, timeout, method = "GET" }) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: "127.0.0.1", port: Number(process.env.CODEX_DELEGATE_PET_PORT || 47800), path, method,
      agent: false, headers: { "x-codex-delegate-pet-token": token } }, res => {
      let body = "";
      res.on("data", chunk => {
        body += chunk;
        if (Buffer.byteLength(body) > 8192) req.destroy(new Error("Pet response too large"));
      });
      res.on("error", reject);
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    const timer = setTimeout(() => req.destroy(new Error("Pet request timed out")), timeout);
    req.on("close", () => clearTimeout(timer));
    req.on("error", reject);
    req.end();
  });
}

export async function petHealth({ token, timeout = 1000 } = {}) {
  if (token === undefined) {
    try { token = readFileSync(join(petRoot(), "pet-state", "token"), "utf8").trim(); }
    catch { token = ""; }
  }
  try {
    const response = await exchangePet("/health", { token, timeout });
    const health = JSON.parse(response.body);
    if ([200, 503].includes(response.status) && health?.app === "codex-delegate-pet"
      && health.protocol === 1 && typeof health.version === "string" && health.version.length) {
      return { status: "pet", health };
    }
  } catch (error) {
    if (error.code === "ECONNREFUSED") return { status: "absent" };
  }
  return { status: "unavailable" };
}

async function stopPet(state) {
  let token;
  try { token = readFileSync(join(state, "token"), "utf8").trim(); }
  catch (error) { if (error.code !== "ENOENT") throw error; token = ""; }
  const timeout = Math.max(50, Number(process.env.CODEX_DELEGATE_PET_QUIT_TIMEOUT_MS) || 1500);
  const result = await petHealth({ token, timeout });
  if (result.status === "absent") return;
  let pid = result.health?.pid;
  if (result.status === "unavailable") {
    try {
      ({ pid } = JSON.parse(readFileSync(join(state, "app-process.json"), "utf8")));
      if (!Number.isSafeInteger(pid) || pid <= 0 || pid === process.pid || !alive(pid)) throw new Error("invalid pid");
      const exe = process.platform === "win32"
        ? spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
          `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; (Get-Process -Id ${pid} -ErrorAction Stop).Path`],
          { encoding: "utf8", windowsHide: true, timeout: 3000 }).stdout?.trim()
        : realpathSync(`/proc/${pid}/exe`);
      const normalize = path => {
        const resolved = realpathSync(path).replace(/^\\\\\?\\/, "");
        return process.platform === "win32" ? resolved.toLowerCase() : resolved;
      };
      if (!exe || normalize(exe) !== normalize(join(petRoot(), "pet", "codex-delegate-pet.exe"))) throw new Error("executable mismatch");
    } catch {
      throw new Error("Pet port is held but health is unavailable and its process cannot be verified; cannot safely replace or remove the running app. Close the pet app or resolve the port conflict and retry");
    }
  }
  if (!Number.isSafeInteger(pid) || pid <= 0 || pid === process.pid) throw new Error("Pet health has no safe process id; cannot safely replace or remove the running app");
  if (result.status === "pet") {
    try { await exchangePet("/quit", { token, timeout, method: "POST" }); } catch { /* A quitting app may close the socket. */ }
  }
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
    // A helper may already have passed its flag check. It holds this lock
    // through spawn/startup/delivery, so wait for it before probing/stopping.
    const lock = join(state, "spool", "delivery.lock");
    // Cover the helper's entire health wait (20 s by default), plus time to
    // finish its last probe and release the lock.
    const deadline = Date.now() + Number(process.env.CODEX_DELEGATE_PET_TEST_HEALTH_WAIT_MS ?? 20000) + 5000;
    while (existsSync(lock)) {
      try {
        const holder = JSON.parse(readFileSync(lock, "utf8"));
        if (Number.isSafeInteger(holder.pid) && holder.pid > 0 && !alive(holder.pid)) break;
      } catch (error) { if (error.code === "ENOENT") break; }
      if (Date.now() >= deadline) throw new Error("Pet delivery helper did not stop for update; bundle was not changed. Retry after delivery finishes");
      await delay(25);
    }
    await stopPet(state);
  } });
  return () => {
    clearInterval(refresh);
    if (flagged) {
      rmSync(flag, { force: true });
      resumeDelivery(state);
    }
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
    settings = original === null ? {} : parseSettings(original);
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
  const changed = original !== null && JSON.stringify(settings) !== JSON.stringify(parseSettings(original));
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
  add(`remove pet bundle ${bundle}`, () => whileLocked(() => rmSync(bundle, { recursive: true, force: true })));
  for (const name of readdirSync(petRoot()).filter(name => name.startsWith(".pet-previous-"))) {
    const path = join(petRoot(), name);
    add(`remove previous pet bundle ${path}`, () => whileLocked(() => rmSync(path, { recursive: true, force: true })));
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
  const pin = readPetPin(root);
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
    settings = original === null ? {} : parseSettings(original);
    if (!object(settings)) throw new Error("expected an object");
    if (settings.hooks !== undefined && !object(settings.hooks)) throw new Error("hooks must be an object");
    for (const event of EVENTS) {
      if (settings.hooks?.[event] !== undefined && !Array.isArray(settings.hooks[event])) throw new Error(`hooks.${event} must be an array`);
    }
  } catch (error) { throw new Error(`Cannot parse Claude Code settings ${settingsPath}: ${error.message}`); }
  const command = `node "${join(bundle, "hook", "leader-hook.mjs")}"`;
  const hooks = {};
  settings.hooks ??= {};
  for (const event of EVENTS) {
    settings.hooks[event] ??= [];
    const owned = [existing?.hooks?.[event], existing?.pendingHooks?.[event]].filter(value => typeof value === "string");
    const leaves = settings.hooks[event].flatMap(group => Array.isArray(group?.hooks) ? group.hooks : []);
    // An identical command without recorded ownership belongs to the user.
    if (!leaves.some(entry => owned.includes(entry?.command)) && leaves.some(entry => entry?.command === command)) continue;
    hooks[event] = command;
    const leaf = { type: "command", command, timeout: 10, ...(event === "PostToolUse" ? { async: true } : {}) };
    let replaced = false;
    settings.hooks[event] = settings.hooks[event].flatMap(group => {
      if (!Array.isArray(group?.hooks)) return [group];
      const hooks = group.hooks.flatMap(entry => {
        if (typeof entry?.command === "string" && owned.includes(entry.command)) {
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
  if (existsSync(bundle)) add(`move existing pet bundle to ${previous}`, () => whileLocked(() => renameSync(bundle, previous)));
  add(`install pet bundle ${pin.version} -> ${bundle}`, () => renameSync(staging, bundle));
  if (existsSync(bundle)) previousBundles.push(previous);
  for (const path of previousBundles) add(`remove previous pet bundle ${path}`, () => whileLocked(() => rmSync(path, { recursive: true, force: true })));
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
