import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { fakeCodex } from "./helpers/fake-codex.mjs";

const runner = fileURLToPath(new URL("../src/runner/codex-run.mjs", import.meta.url));
const consoleHelper = fileURLToPath(new URL("./windows-console.ps1", import.meta.url));

function harness(t, overrides, { probe = false, failCleanup = false, suppressClose = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "codex runner test "));
  const runs = [];
  t.after(async () => {
    for (const run of runs) {
      run.finish();
      await run.done;
      for (const path of [run.record, run.descendant]) {
        if (!existsSync(path)) continue;
        const pid = JSON.parse(readFileSync(path, "utf8")).pid;
        try { process.kill(pid, "SIGKILL"); } catch (err) { if (err.code !== "ESRCH") throw err; }
        await until(() => { try { process.kill(pid, 0); return false; } catch (err) { return err.code === "ESRCH"; } });
      }
    }
    rmSync(root, { recursive: true, force: true });
  });
  const { home, env } = fakeCodex(root, `
const fs = require("node:fs");
const args = process.argv.slice(2);
let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => { stdin += chunk; });
process.stdin.on("end", () => {
  if (process.env.FAKE_CODEX_DESCENDANT) {
    require("node:child_process").spawn(process.execPath, ["-e",
      'require("node:fs").writeFileSync(process.env.FAKE_CODEX_DESCENDANT, JSON.stringify({pid:process.pid}));setInterval(()=>{},1000)'], { stdio: "ignore" });
  }
  fs.writeFileSync(process.env.FAKE_CODEX_RECORD, JSON.stringify({ args, stdin, pid: process.pid, launch: JSON.parse(process.env.FAKE_CODEX_LAUNCH || "null") }));
  const finish = () => {
    fs.writeFileSync(args[args.indexOf("-o") + 1], "Fake worker result");
    process.exit(Number(process.env.FAKE_CODEX_EXIT || 0));
  };
  if (process.env.FAKE_CODEX_WAIT) {
    const timer = setInterval(() => {
      if (fs.existsSync(process.env.FAKE_CODEX_WAIT)) { clearInterval(timer); finish(); }
    }, 20);
  } else finish();
});
`);
  if (overrides) {
    mkdirSync(join(home, ".codex-delegate"));
    writeFileSync(join(home, ".codex-delegate", "roles.json"), JSON.stringify(overrides));
  }
  if (probe || failCleanup || suppressClose) {
    const hook = join(root, "probe.cjs");
    writeFileSync(hook, `
const fs = require("node:fs");
const cp = require("node:child_process");
const originalSpawn = cp.spawn;
cp.spawn = function(command, args, options) {
  const opts = Array.isArray(args) ? options : args;
  if (opts?.env) opts.env.FAKE_CODEX_LAUNCH = JSON.stringify({command, args, detached: !!opts.detached});
  const child = originalSpawn.apply(this, arguments);
  if (${suppressClose}) {
    const emit = child.emit;
    child.emit = function(event, ...args) { if (event !== "close") return emit.call(this, event, ...args); };
  }
  return child;
};
const originalRm = fs.rmSync;
fs.rmSync = function(path, options) {
  if (${failCleanup} && String(path).includes("computer-use.lock")) {
    originalRm(require("node:path").join(path, "child.json"), {force:true});
    throw Object.assign(new Error("simulated sharing error"), {code:"EPERM"});
  }
  return originalRm.apply(this, arguments);
};
require("node:module").syncBuiltinESMExports();
`);
    env.NODE_OPTIONS = `--require "${hook.replaceAll("\\", "/")}"`;
  }
  const prompt = join(root, "prompt.md");
  const out = join(root, "result.md");
  writeFileSync(prompt, "Report what you observe.\n");
  function start(role = "astra-cu", { wait = false, cwd, exit = 0, console: ownConsole = false, tree = false } = {}) {
    const dir = join(root, `run-${runs.length}`);
    mkdirSync(dir);
    const record = join(dir, "record.json");
    const descendant = join(dir, "descendant.json");
    const output = join(dir, "result.md");
    const release = join(dir, "finish");
    const argv = [runner, role, "--prompt-file", prompt, "--out", output, "--cwd", cwd ?? dir];
    const stdoutFile = join(dir, "stdout");
    const stderrFile = join(dir, "stderr");
    const pidFile = join(dir, "runner.pid");
    let executable = process.execPath, childArgs = argv;
    if (ownConsole && process.platform === "win32") {
      const request = join(dir, "console.json");
      writeFileSync(request, JSON.stringify({ app: executable, command: [executable, ...argv].map(arg => `"${arg}"`).join(" "), cwd: dir, stdout: stdoutFile, stderr: stderrFile, pidFile }));
      executable = "powershell.exe";
      childArgs = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", consoleHelper, "-Mode", "start", "-Request", request];
    }
    const child = spawn(executable, childArgs, {
      cwd: dir, windowsHide: true,
      env: { ...env, FAKE_CODEX_RECORD: record, FAKE_CODEX_WAIT: wait ? release : "", FAKE_CODEX_EXIT: String(exit), FAKE_CODEX_DESCENDANT: tree ? descendant : "" },
    });
    let stdout = "", stderr = "";
    child.stdout.on("data", data => { stdout += data; });
    child.stderr.on("data", data => { stderr += data; });
    const done = new Promise((resolve, reject) => {
      child.on("error", reject);
      child.on("close", code => resolve({ code,
        stdout: stdout + (existsSync(stdoutFile) ? readFileSync(stdoutFile, "utf8") : ""),
        stderr: stderr + (existsSync(stderrFile) ? readFileSync(stderrFile, "utf8") : ""),
      }));
    });
    const run = { child, record, descendant, out: output, done, pidFile, finish: () => writeFileSync(release, "") };
    runs.push(run);
    return run;
  }
  return { root, home, env, prompt, out, start };
}

async function until(predicate) {
  const deadline = Date.now() + 10000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, "timed out waiting for process condition");
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

function runRole(t, role, overrides) {
  const { root, env, prompt, out } = harness(t, overrides);
  const result = spawnSync(process.execPath, [runner, role, "--prompt-file", prompt, "--cwd", root], {
    cwd: root, env, encoding: "utf8", timeout: 15000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /Fake worker result/);
  return { args: JSON.parse(readFileSync(env.FAKE_CODEX_RECORD, "utf8")).args, stdout: result.stdout, cwd: root, out };
}

test("exclusive worker refuses a second run before invoking Codex or creating output", async t => {
  const h = harness(t);
  const first = h.start("astra-cu", { wait: true });
  await until(() => existsSync(first.record));
  const second = h.start();
  const result = await second.done;
  assert.equal(result.code, 75, result.stderr);
  assert.match(result.stderr, /busy.*astra-cu/);
  assert.ok(result.stderr.includes(String(first.child.pid)));
  for (const path of [second.record, second.out, `${second.out}.log`]) assert.equal(existsSync(path), false);
  first.finish();
  assert.equal((await first.done).code, 0);
  assert.equal((await h.start().done).code, 0);
});

test("exclusive roles share one home lock across working directories; other roles can run", async t => {
  const h = harness(t, { sol: { exclusive: true } });
  const first = h.start("astra-cu", { wait: true });
  await until(() => existsSync(first.record));
  assert.equal((await h.start("sol").done).code, 75);
  for (const role of ["astra", "luna"]) assert.equal((await h.start(role).done).code, 0);
  first.finish();
  await first.done;
  assert.equal((await h.start("sol").done).code, 0);
});

async function contend(h) {
  const runs = Array.from({ length: 8 }, () => h.start("astra-cu", { wait: true }));
  await until(() => runs.filter(run => existsSync(run.record)).length > 0);
  // Keep the winner alive until every contender has either started or exited.
  await until(() => runs.every(run => existsSync(run.record) || run.child.exitCode !== null));
  const winners = runs.filter(run => existsSync(run.record));
  assert.equal(winners.length, 1);
  for (const run of runs.filter(run => !winners.includes(run))) {
    assert.equal((await run.done).code, 75);
    assert.equal(existsSync(`${run.out}.log`), false);
  }
  assert.equal((await h.start().done).code, 75, "winner still owns the lock");
  winners[0].finish();
  const won = await winners[0].done;
  assert.equal(won.code, 0, won.stderr);
  const after = await h.start().done;
  assert.equal(after.code, 0, after.stderr);
}

test("simultaneous acquisition permits exactly one exclusive worker", async t => {
  await contend(harness(t));
});

test("child PID is published separately without changing the holder record", async t => {
  const h = harness(t);
  const first = h.start("astra-cu", { wait: true });
  await until(() => existsSync(first.record));
  const lock = join(h.home, ".codex-delegate", "computer-use.lock");
  const holder = JSON.parse(readFileSync(join(lock, "holder.json"), "utf8"));
  assert.equal(holder.childPid, undefined);
  const child = JSON.parse(readFileSync(join(lock, "child.json"), "utf8"));
  assert.equal(child.token, holder.token);
  assert.ok(Number.isSafeInteger(child.childPid) && child.childPid > 0);
  assert.doesNotThrow(() => process.kill(child.childPid, 0));
  assert.equal((await h.start().done).code, 75);
  first.finish();
  const result = await first.done;
  assert.equal(result.code, 0, result.stderr);
  assert.equal(existsSync(lock), false);
});

test("simultaneous stale reclamation permits exactly one worker and preserves its lock", async t => {
  const h = harness(t);
  const dead = spawnSync(process.execPath, ["-e", ""], { timeout: 10000 });
  assert.equal(dead.status, 0);
  const lock = join(h.home, ".codex-delegate", "computer-use.lock");
  mkdirSync(lock, { recursive: true });
  writeFileSync(join(lock, "holder.json"), JSON.stringify({
    token: "dead-holder", runnerPid: dead.pid, role: "astra-cu",
  }));
  writeFileSync(join(lock, "child.json"), JSON.stringify({ token: "dead-holder", childPid: dead.pid }));
  await contend(h);
});

test("a missing, invalid, or differently owned child record cannot make a dead holder reclaimable", async t => {
  const h = harness(t);
  const dead = spawnSync(process.execPath, ["-e", ""], { timeout: 10000 });
  assert.equal(dead.status, 0);
  const lock = join(h.home, ".codex-delegate", "computer-use.lock");
  mkdirSync(lock, { recursive: true });
  // Even a childPid in the old holder format must not bypass child validation.
  const holder = JSON.stringify({ token: "dead-holder", runnerPid: dead.pid, childPid: dead.pid });
  writeFileSync(join(lock, "holder.json"), holder);
  for (const record of [null, "{", JSON.stringify({ token: "other-holder", childPid: dead.pid }),
    JSON.stringify({ token: "dead-holder", childPid: 0 })]) {
    if (record !== null) writeFileSync(join(lock, "child.json"), record);
    const run = h.start();
    const result = await run.done;
    assert.equal(result.code, 75, result.stderr);
    assert.equal(existsSync(run.record), false);
    assert.equal(existsSync(`${run.out}.log`), false);
    assert.equal(readFileSync(join(lock, "holder.json"), "utf8"), holder);
    if (record !== null) assert.equal(readFileSync(join(lock, "child.json"), "utf8"), record);
  }
});

for (const delay of [250, null]) {
  test(`Windows release preserves the worker exit status with an open reader (${delay === null ? "held until runner exits" : `${delay}ms`})`,
    { skip: process.platform !== "win32" }, async t => {
      const h = harness(t);
      const first = h.start("astra-cu", { wait: true, exit: 9 });
      await until(() => existsSync(first.record));
      const lock = join(h.home, ".codex-delegate", "computer-use.lock");
      const ready = join(h.root, "reader-ready");
      const stop = join(h.root, "reader-stop");
      const reader = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
        fileURLToPath(new URL("./windows-lock-reader.ps1", import.meta.url)),
        "-Path", join(lock, "holder.json"), "-Ready", ready, "-Stop", stop, "-Delay", String(delay ?? 0)],
      { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
      let stderr = "";
      reader.stderr.on("data", data => { stderr += data; });
      const done = new Promise((resolve, reject) => {
        reader.on("error", reject);
        reader.on("close", resolve);
      });
      t.after(async () => { if (existsSync(h.root)) writeFileSync(stop, ""); await done; });
      await until(() => existsSync(ready) || reader.exitCode !== null);
      assert.ok(existsSync(ready), stderr);
      first.finish();
      if (delay !== null) writeFileSync(stop, "");
      const result = await first.done;
      // A persistent reader closes only after the runner exits, so scheduler
      // timing cannot turn this into the brief-reader case.
      writeFileSync(stop, "");
      assert.equal(result.code, 9, result.stderr);
      assert.equal(await done, 0, stderr);
      if (delay === 250) {
        assert.equal(existsSync(lock), false, result.stderr);
        assert.equal((await h.start().done).code, 0);
      } else {
        assert.match(result.stderr, /could not release computer-use lock/);
        assert.ok(existsSync(lock));
        const next = await h.start().done;
        assert.equal(next.code, 0, next.stderr);
      }
    });
}

for (const [name, record] of [
  ["just-created empty directory", null],
  ["empty record", ""],
  ["invalid JSON", "{"],
  ["missing child PID", JSON.stringify({ token: "partial", runnerPid: 1 })],
  ["invalid PID", JSON.stringify({ token: "partial", runnerPid: 0, childPid: -1 })],
]) {
  test(`an incomplete lock (${name}) is busy and is preserved`, async t => {
    const h = harness(t);
    const lock = join(h.home, ".codex-delegate", "computer-use.lock");
    mkdirSync(lock, { recursive: true });
    if (record !== null) writeFileSync(join(lock, "holder.json"), record);
    const run = h.start();
    const result = await run.done;
    assert.equal(result.code, 75);
    assert.match(result.stderr, /busy/);
    assert.equal(existsSync(run.record), false);
    assert.equal(existsSync(`${run.out}.log`), false);
    assert.ok(existsSync(lock));
    if (record !== null) assert.equal(readFileSync(join(lock, "holder.json"), "utf8"), record);
  });
}

test("a hard-killed runner's live worker keeps the desktop busy until it stops", async t => {
  const h = harness(t);
  const first = h.start("astra-cu", { wait: true });
  await until(() => existsSync(first.record));
  const workerPid = JSON.parse(readFileSync(first.record, "utf8")).pid;
  const holder = JSON.parse(readFileSync(join(h.home, ".codex-delegate", "computer-use.lock", "child.json"), "utf8"));
  assert.doesNotThrow(() => process.kill(holder.childPid, 0), "worker host alive before killing runner");
  process.kill(first.child.pid, "SIGKILL"); // Only this node process, never taskkill /T.
  await until(() => first.child.signalCode !== null || first.child.exitCode !== null);
  assert.doesNotThrow(() => process.kill(workerPid, 0));
  assert.doesNotThrow(() => process.kill(holder.childPid, 0), "recorded child survives hard kill");
  const probe = await h.start().done;
  assert.equal(probe.code, 75, probe.stderr);
  first.finish();
  await first.done;
  await until(() => { try { process.kill(workerPid, 0); return false; } catch { return true; } });
  assert.equal((await h.start().done).code, 0);
});

test("Codex failure and genuine spawn failure release the exclusive lock", async t => {
  const h = harness(t);
  assert.equal((await h.start("astra-cu", { exit: 9 }).done).code, 9);
  assert.equal((await h.start().done).code, 0);
  const failed = h.start("astra-cu", { cwd: join(h.root, "does-not-exist") });
  const result = await failed.done;
  assert.equal(result.code, 2, result.stderr);
  assert.match(result.stderr, /could not start codex/);
  assert.equal(existsSync(failed.record), false);
  assert.equal((await h.start().done).code, 0);
});

test("a finishing runner never releases a replacement holder's lock", async t => {
  const h = harness(t);
  const first = h.start("astra-cu", { wait: true });
  await until(() => existsSync(first.record));
  const holder = join(h.home, ".codex-delegate", "computer-use.lock", "holder.json");
  const replacement = JSON.stringify({ token: "replacement", runnerPid: process.pid, childPid: process.pid });
  writeFileSync(holder, replacement);
  first.finish();
  assert.equal((await first.done).code, 0);
  assert.equal(readFileSync(holder, "utf8"), replacement);
  assert.equal((await h.start().done).code, 75);
});

test("interrupt terminates the worker tree before releasing the lock", async t => {
  const h = harness(t);
  const first = h.start("astra-cu", { wait: true, console: true, tree: true });
  await until(() => existsSync(first.record) && existsSync(first.descendant));
  const workerPid = JSON.parse(readFileSync(first.record, "utf8")).pid;
  const descendantPid = JSON.parse(readFileSync(first.descendant, "utf8")).pid;
  interrupt(first);
  await until(() => first.child.exitCode !== null || first.child.signalCode !== null);
  const result = await first.done;
  assert.equal(result.code, process.platform === "win32" ? 149 : 130, result.stderr);
  assert.throws(() => process.kill(workerPid, 0), { code: "ESRCH" });
  assert.throws(() => process.kill(descendantPid, 0), { code: "ESRCH" });
  assert.equal((await h.start().done).code, 0);
});

test("astra-cu bypasses approvals and sandbox for computer use", t => {
  const { args, stdout, cwd, out } = runRole(t, "astra-cu");
  assert.deepEqual(args, [
    "exec", "-m", "gpt-6-astra", "-c", "model_reasoning_effort=medium",
    "--dangerously-bypass-approvals-and-sandbox", "-C", cwd, "-o", out, "-",
  ]);
  assert.match(stdout, /role=astra-cu model=gpt-6-astra effort=medium .*--dangerously-bypass-approvals-and-sandbox/);
  assert.doesNotMatch(stdout, /sandbox=workspace-write/);
});

for (const { role, model, effort, sandbox, extra } of [
  { role: "astra", model: "gpt-6-astra", effort: "medium", sandbox: "read-only", extra: [] },
  { role: "sol", model: "gpt-6.1-sol", effort: "high", sandbox: "workspace-write", extra: [] },
  { role: "luna", model: "gpt-6-luna", effort: "max", sandbox: "read-only", extra: ["-c", "web_search=live"] },
]) {
  test(`${role} keeps its existing sandbox and Codex arguments`, t => {
    const { args, stdout, cwd, out } = runRole(t, role);
    assert.deepEqual(args, [
      "exec", "-m", model, "-c", `model_reasoning_effort=${effort}`,
      "-s", sandbox, "-C", cwd, "-o", out, ...extra, "-",
    ]);
    assert.ok(stdout.includes(`role=${role} model=${model} effort=${effort} sandbox=${sandbox}`));
  });
}

test("a user override disables the astra-cu bypass and restores its sandbox", t => {
  const { args, stdout, cwd, out } = runRole(t, "astra-cu", {
    "astra-cu": { dangerouslyBypassApprovalsAndSandbox: false },
  });
  assert.deepEqual(args, [
    "exec", "-m", "gpt-6-astra", "-c", "model_reasoning_effort=medium",
    "-s", "workspace-write", "-C", cwd, "-o", out, "-",
  ]);
  assert.match(stdout, /role=astra-cu model=gpt-6-astra effort=medium sandbox=workspace-write/);
  assert.doesNotMatch(stdout, /--dangerously-bypass-approvals-and-sandbox/);
});


test("non-exclusive roles use the original attached spawn without a Windows host", async t => {
  const h = harness(t, undefined, { probe: true });
  const run = h.start("astra");
  const result = await run.done;
  assert.equal(result.code, 0, result.stderr);
  const { launch } = JSON.parse(readFileSync(run.record, "utf8"));
  assert.equal(launch.detached, false);
  assert.doesNotMatch(JSON.stringify(launch), /windows-codex/);
  assert.match(launch.command, /^codex(?: |$)/);
});


test("partial cleanup of a released lock cannot block a following exclusive run", async t => {
  const h = harness(t, undefined, { failCleanup: true });
  const first = await h.start().done;
  assert.equal(first.code, 0, first.stderr);
  assert.match(first.stderr, /simulated sharing error/);
  const next = await h.start().done;
  assert.equal(next.code, 0, next.stderr);
});


function interrupt(run) {
  if (process.platform === "win32") {
    const event = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", consoleHelper,
      "-Mode", "break", "-ProcessId", readFileSync(run.pidFile, "utf8")], { stdio: "ignore", windowsHide: true, timeout: 15000 });
    assert.equal(event.status, 0, event.stderr);
  } else process.kill(run.child.pid, "SIGINT");
}

test("interrupt completes when the child exits without closing its pipes", async t => {
  const h = harness(t, undefined, { suppressClose: true });
  const first = h.start("astra-cu", { wait: true, console: true });
  await until(() => existsSync(first.record));
  interrupt(first);
  try {
    await until(() => first.child.exitCode !== null || first.child.signalCode !== null);
    const result = await first.done;
    assert.equal(result.code, process.platform === "win32" ? 149 : 130, result.stderr);
    delete h.env.NODE_OPTIONS;
    assert.equal((await h.start().done).code, 0);
  } finally {
    // A regression must fail without leaving a runner hanging in test cleanup.
    if (first.child.exitCode === null && first.child.signalCode === null) {
      const pid = process.platform === "win32" ? Number(readFileSync(first.pidFile, "utf8")) : first.child.pid;
      process.kill(pid, "SIGKILL");
    }
  }
});
