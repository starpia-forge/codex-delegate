#!/usr/bin/env node
// Runs one Codex worker role non-interactively.
//
//   node codex-run.mjs <role> --prompt-file <path> [--out <path>] [--cwd <dir>]
//
// Roles come from roles.json next to this script; fields in
// ~/.codex-delegate/roles.json override them per role.
//
// The prompt is piped to `codex exec` on stdin. Codex's final message is written
// to --out (default: result.md next to the prompt file) and the full event log
// to <out>.log. Exit code is Codex's exit code, or 75 if computer use is busy.

import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const USER_ROLES = join(homedir(), ".codex-delegate", "roles.json");

const PRINT_LIMIT = 6000;
const BUSY_EXIT_CODE = 75;
const CHILD_EXIT_TIMEOUT_MS = 1000;
const SIGNAL_EXIT_CODES = { SIGINT: 130, SIGTERM: 143, SIGBREAK: 149, SIGHUP: 129 };
const LOCK = join(homedir(), ".codex-delegate", "computer-use.lock");
const HOLDER = join(LOCK, "holder.json");
const CHILD = join(LOCK, "child.json");

function readHolder() {
  let holder;
  try { holder = JSON.parse(readFileSync(HOLDER, "utf8")); } catch { return null; }
  if (!holder || typeof holder !== "object") return null;
  // The holder is immutable. Publishing the child separately avoids replacing
  // a file that a contender may have open (EPERM on Windows).
  delete holder.childPid;
  try {
    const child = JSON.parse(readFileSync(CHILD, "utf8"));
    if (child?.token === holder.token) holder.childPid = child.childPid;
  } catch { /* A missing/invalid child record is incomplete, hence busy. */ }
  return holder;
}

function removeLock() {
  const tombstone = `${LOCK}.released-${randomUUID()}`;
  for (let attempt = 0; ; attempt++) {
    try {
      // Never unlink records in the live lock. If rename is blocked, leave the
      // complete record available for stale reclamation after both PIDs die.
      renameSync(LOCK, tombstone);
      break;
    } catch (err) {
      // Retry renameSync on Windows sharing errors; it has no built-in
      // retry option. Bound total waiting to 1.1s.
      if (attempt < 10 && ["EPERM", "EACCES", "EBUSY", "ENOTEMPTY"].includes(err.code)) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20 * (attempt + 1));
        continue;
      }
      // Cleanup must not replace the worker's exit status. If readers outlast
      // retries, leave the complete record available for reclamation.
      console.error(`codex-run: could not release computer-use lock: ${err.message}`);
      return;
    }
  }
  // A partial tombstone cleanup cannot block the next owner.
  try { rmSync(tombstone, { recursive: true, force: true }); } catch (err) {
    console.error(`codex-run: could not clean released lock: ${err.message}`);
  }
}

function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (err) { return err.code !== "ESRCH"; }
}

function stale(holder) {
  return typeof holder?.token === "string" && holder.token.length > 0
    && [holder.runnerPid, holder.childPid].every(pid => Number.isSafeInteger(pid) && pid > 0 && !alive(pid));
}

function exitBusy(holder) {
  console.error(`codex-run: computer use busy: ${holder ? JSON.stringify(holder) : "incomplete holder record"}`);
  process.exit(BUSY_EXIT_CODE);
}

function acquireLock(role, cwd) {
  mkdirSync(dirname(LOCK), { recursive: true });
  for (;;) {
    try { mkdirSync(LOCK); break; } catch (err) {
      if (err.code !== "EEXIST") throw err;
      const holder = readHolder();
      if (!stale(holder)) exitBusy(holder);
      // Keep a nonempty tombstone for each reclaimed token. Directory rename
      // cannot replace it (on Windows or POSIX), so a delayed stale contender
      // cannot move a new owner's lock. No separate reclaim guard can get stuck.
      const tombstoneId = createHash("sha256").update(holder.token).digest("hex");
      try { renameSync(LOCK, `${LOCK}.stale-${tombstoneId}`); } catch (err) {
        // A Windows reader may prevent moving the directory. Refuse safely;
        // never remove a lock in place or bypass the token's tombstone.
        if (!["ENOENT", "EEXIST", "ENOTEMPTY", "EPERM", "EACCES", "EBUSY"].includes(err.code)) throw err;
        exitBusy(readHolder());
      }
    }
  }
  const holder = { token: randomUUID(), runnerPid: process.pid, role, cwd, startedAt: new Date().toISOString() };
  try { writeFileSync(HOLDER, JSON.stringify(holder)); } catch (err) {
    // We just created this directory; an incomplete record cannot be reclaimed.
    removeLock();
    throw err;
  }
  return {
    setChild(pid) {
      if (readHolder()?.token !== holder.token) throw new Error("computer-use lock ownership lost");
      const pending = join(LOCK, `${holder.token}.tmp`);
      writeFileSync(pending, JSON.stringify({ token: holder.token, childPid: pid }), { flag: "wx" });
      // This destination has never existed: readers cannot hold it open yet.
      renameSync(pending, CHILD);
    },
    release() {
      if (readHolder()?.token === holder.token) removeLock();
    },
  };
}

function fail(message) {
  console.error(`codex-run: ${message}`);
  process.exit(2);
}

function parseArgs(argv) {
  const [role, ...rest] = argv;
  const opts = {};
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i];
    const value = rest[i + 1];
    if (!key?.startsWith("--") || value === undefined) fail(`bad argument near "${key}"`);
    opts[key.slice(2)] = value;
  }
  return { role, opts };
}

// cmd.exe quoting: on Windows codex is an npm `codex.cmd` shim, which needs a shell.
function quote(arg) {
  return /[\s"&|<>^]/.test(arg) ? `"${arg.replace(/"/g, '""')}"` : arg;
}

const { role, opts } = parseArgs(process.argv.slice(2));
const roles = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "roles.json"), "utf8"));
const overrides = existsSync(USER_ROLES) ? JSON.parse(readFileSync(USER_ROLES, "utf8")) : {};
// An ignored override could silently drop a setting such as the bypass opt-out.
const unknown = Object.keys(overrides).filter((name) => !Object.hasOwn(roles, name));
if (unknown.length) fail(`unknown role ${unknown.map((name) => `"${name}"`).join(", ")} in ${USER_ROLES} (expected one of: ${Object.keys(roles).join(", ")})`);
const config = roles[role] && { exclusive: false, dangerouslyBypassApprovalsAndSandbox: false, ...roles[role], ...overrides[role] };
if (!config) fail(`unknown role "${role}" (expected one of: ${Object.keys(roles).join(", ")})`);
if (!opts["prompt-file"]) fail("--prompt-file is required");

const promptFile = resolve(opts["prompt-file"]);
if (!existsSync(promptFile)) fail(`prompt file not found: ${promptFile}`);
const out = resolve(opts.out ?? join(dirname(promptFile), "result.md"));
const cwd = resolve(opts.cwd ?? process.cwd());
const lock = config.exclusive ? acquireLock(role, cwd) : null;
let child;
let stopping = false;
let closed = false;
let canRelease = true;
if (config.exclusive) process.on("exit", () => { if (canRelease) lock.release(); });

async function shutdown(code, message) {
  if (stopping) return;
  stopping = true;
  if (message) console.error(`codex-run: ${message}`);
  try {
    if (child?.pid && !closed) {
      if (process.platform === "win32") {
        const killed = spawnSync("taskkill", ["/T", "/F", "/PID", String(child.pid)], { stdio: "ignore", windowsHide: true, timeout: 10000 });
        if (killed.status !== 0) {
          const fallback = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
            fileURLToPath(new URL("./windows-stop-tree.ps1", import.meta.url)), "-RootProcessId", String(child.pid)],
          { encoding: "utf8", windowsHide: true, timeout: 20000 });
          if (fallback.status !== 0) throw new Error(fallback.stderr || "could not terminate Codex process tree");
        }
      } else {
        try { process.kill(-child.pid, "SIGKILL"); } catch (err) { if (err.code !== "ESRCH") throw err; }
      }
      // Pipe closure can depend on a process outside the worker tree. Wait for
      // the process itself, with a bound even if its exit event never arrives.
      if (child.exitCode === null && child.signalCode === null) {
        await new Promise(resolve => {
          const finish = () => { clearTimeout(timer); child.off("exit", finish); resolve(); };
          const timer = setTimeout(finish, CHILD_EXIT_TIMEOUT_MS);
          child.once("exit", finish);
        });
      }
      if (alive(child.pid)) throw new Error("Codex host is still alive after termination");
    }
    canRelease = true;
  } catch (err) {
    // Keep the recorded live child protected if termination could not be proved.
    console.error(`codex-run: ${err.message}; retaining computer-use lock`);
  }
  process.exit(code);
}

if (config.exclusive) {
  for (const [signal, code] of Object.entries(SIGNAL_EXIT_CODES)) {
    if (signal !== "SIGBREAK" || process.platform === "win32") process.on(signal, () => shutdown(code));
  }
  process.on("uncaughtException", err => shutdown(2, err.message));
}

const bypass = config.dangerouslyBypassApprovalsAndSandbox;
const sandboxArgs = bypass ? ["--dangerously-bypass-approvals-and-sandbox"] : ["-s", config.sandbox];
const sandbox = bypass ? sandboxArgs[0] : `sandbox=${config.sandbox}`;
const args = [
  "exec",
  "-m", config.model,
  "-c", `model_reasoning_effort=${config.effort}`,
  ...sandboxArgs,
  "-C", cwd,
  "-o", out,
];
if (config.webSearch) args.push("-c", "web_search=live");
args.push("-");

// The sandbox runs as a different OS user on Windows, so git refuses the repo
// as "dubious ownership" unless every directory is marked safe.
const env = {
  ...process.env,
  GIT_CONFIG_COUNT: "1",
  GIT_CONFIG_KEY_0: "safe.directory",
  GIT_CONFIG_VALUE_0: "*",
};

console.log(`codex-run: role=${role} model=${config.model} effort=${config.effort} ${sandbox}`);
console.log(`codex-run: cwd=${cwd}`);

const log = createWriteStream(`${out}.log`);
child = !config.exclusive
  ? (process.platform === "win32"
    ? spawn(["codex", ...args.map(quote)].join(" "), { cwd, env, shell: true })
    : spawn("codex", args, { cwd, env }))
  : process.platform === "win32"
    ? spawn(process.execPath, [fileURLToPath(new URL("./windows-codex.mjs", import.meta.url)), ["codex", ...args.map(quote)].join(" ")], { cwd, env, detached: true, windowsHide: true })
    : spawn("codex", args, { cwd, env, detached: true });
if (config.exclusive && child.pid) {
  canRelease = false;
  lock?.setChild(child.pid);
}
child.stdout.pipe(log, { end: false });
child.stderr.pipe(log, { end: false });
child.stdin.end(readFileSync(promptFile));
if (config.exclusive) {
  child.stdin.on("error", err => { if (err.code !== "EPIPE") shutdown(2, err.message); });
  log.on("error", err => shutdown(2, err.message));
}

child.on("error", err => {
  const message = `could not start codex (is it installed and on PATH?): ${err.message}`;
  if (config.exclusive) shutdown(2, message);
  else fail(message);
});
child.on("close", (code) => {
  closed = true;
  log.end();
  if (stopping) return;
  canRelease = true;
  console.log(`codex-run: exit=${code} result=${out} log=${out}.log`);
  if (existsSync(out)) {
    const result = readFileSync(out, "utf8");
    console.log("----- result -----");
    console.log(result.length > PRINT_LIMIT ? `${result.slice(0, PRINT_LIMIT)}\n[truncated - read ${out} for the rest]` : result);
  } else {
    console.log(`codex-run: no result written - check ${out}.log`);
  }
  process.exit(code ?? 1);
});
