import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { unpackZip } from "./zip.mjs";

const EVENTS = ["SessionStart", "SessionEnd", "UserPromptSubmit", "PermissionRequest", "Notification", "Stop", "StopFailure", "PostToolUse"];
const petRoot = () => join(homedir(), ".codex-delegate");
const markerPath = () => join(petRoot(), "pet-state", ".codex-delegate.json");

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

export async function preparePet({ root, pkg, dryRun = false }) {
  const pin = JSON.parse(readFileSync(process.env.CODEX_DELEGATE_PET_TEST_PIN || join(root, "pet-pin.json"), "utf8"));
  if (![pin.tag, pin.asset, pin.version].every(value => typeof value === "string" && value.length)
    || !/^[a-f0-9]{64}$/i.test(pin.sha256)) throw new Error("Invalid pet pin");
  const base = process.env.CODEX_DELEGATE_PET_BASE_URL || "https://github.com/starpia-forge/codex-delegate/releases/download";
  const url = `${base.replace(/\/$/, "")}/${pin.tag}/${pin.asset}`;
  const settingsPath = resolve(process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), "settings.json");
  const bundle = join(petRoot(), "pet");
  const state = join(petRoot(), "pet-state");
  const backupName = () => `${settingsPath}.codex-delegate-backup-${Date.now()}-${randomUUID()}`;
  if (dryRun) {
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
  const existing = readPetMarker();
  settings.hooks ??= {};
  for (const event of EVENTS) {
    settings.hooks[event] ??= [];
    const leaf = { type: "command", command, timeout: 10, ...(event === "PostToolUse" ? { async: true } : {}) };
    let replaced = false;
    for (const group of settings.hooks[event]) {
      if (!Array.isArray(group?.hooks)) continue;
      group.hooks = group.hooks.map(entry => {
        if (typeof entry?.command === "string" && (entry.command === command || entry.command === existing?.hooks?.[event])) {
          replaced = true;
          return { ...leaf };
        }
        return entry;
      });
    }
    if (!replaced) settings.hooks[event].push({ hooks: [leaf] });
  }

  const parentExisted = existsSync(petRoot());
  let staging;
  const cleanup = () => {
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
  const marker = { package: pkg.name, version: pkg.version, bundle: pin, settingsPath, hooks, installedAt: new Date().toISOString() };
  const steps = [];
  const add = (label, apply) => steps.push({ label, apply, status: "not applied" });
  if (existsSync(bundle)) add(`move existing pet bundle to ${previous}`, () => renameSync(bundle, previous));
  add(`install pet bundle ${pin.version} -> ${bundle}`, () => renameSync(staging, bundle));
  if (existsSync(bundle)) add(`remove previous pet bundle ${previous}`, () => rmSync(previous, { recursive: true }));
  add(`create/keep pet state directory ${state}`, () => mkdirSync(state, { recursive: true }));
  add(`create/keep pet token ${join(state, "token")}`, () => {
    try { writeFileSync(join(state, "token"), randomBytes(32).toString("hex"), { flag: "wx", mode: 0o600 }); }
    catch (error) { if (error.code !== "EEXIST") throw error; }
  });
  add(`write pet marker ${markerPath()}`, () => writeFileSync(markerPath(), JSON.stringify(marker, null, 2) + "\n"));
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
  return { steps, cleanup, backup: () => backupWritten ? backupPath : "none (no settings backup written)" };
}
