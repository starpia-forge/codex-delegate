import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { EventEmitter, once } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { createStage } from "../pet/app/ui/stage.mjs";

async function harness(t, mode = "pet") {
  const root = mkdtempSync(join(tmpdir(), "pet leader "));
  const home = join(root, "home"), config = join(root, "claude"), codex = join(root, "codex");
  for (const dir of [home, config, codex]) mkdirSync(dir);
  const bundle = join(home, ".codex-delegate", "pet");
  for (const part of ["client", "hook"]) {
    const source = fileURLToPath(new URL(`../pet/${part}`, import.meta.url));
    if (existsSync(source)) cpSync(source, join(bundle, part), { recursive: true });
  }
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (["HOME", "USERPROFILE", "HOMEDRIVE", "HOMEPATH", "CODEX_HOME", "CLAUDE_CONFIG_DIR", "CLAUDE_PID"].includes(key.toUpperCase())) delete env[key];
  }
  Object.assign(env, { HOME: home, USERPROFILE: home, CODEX_HOME: codex, CLAUDE_CONFIG_DIR: config, CLAUDE_PID: "43210" });
  const events = [], sockets = new Set(), children = new Set(), replies = [];
  const arrivals = new EventEmitter();
  const server = createServer((req, res) => {
    if (mode === "silent") return;
    if (req.url === "/health") {
      res.end(JSON.stringify(mode === "foreign" ? { app: "other" } : { app: "codex-delegate-pet", protocol: 1 }));
    } else if (req.url === "/event" && req.method === "POST") {
      let body = "";
      req.on("data", chunk => body += chunk);
      req.on("end", () => {
        const event = JSON.parse(body);
        events.push(event);
        arrivals.emit("event", event);
        if (mode === "concurrent") {
          replies.push(res);
          if (replies.length === 4) for (const reply of replies) reply.end("{}");
        } else res.end("{}");
      });
    } else { res.statusCode = 404; res.end(); }
  });
  server.on("connection", socket => { sockets.add(socket); socket.on("close", () => sockets.delete(socket)); });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  env.CODEX_DELEGATE_PET_PORT = String(server.address().port);
  if (mode === "absent") await new Promise(resolve => server.close(resolve));
  t.after(async () => {
    for (const child of children) child.kill();
    for (const socket of sockets) socket.destroy();
    if (server.listening) await new Promise(resolve => server.close(resolve));
    rmSync(root, { recursive: true, force: true });
  });
  return { events, nextEvent: () => once(arrivals, "event").then(([event]) => event),
    run(input, overrides = {}, { open = false } = {}) {
      const childEnv = { ...env, ...overrides };
      for (const key of Object.keys(childEnv)) if (childEnv[key] === undefined) delete childEnv[key];
      const started = performance.now();
      const child = spawn(process.execPath, [join(bundle, "hook", "leader-hook.mjs")], { env: childEnv, windowsHide: true });
      children.add(child);
      let stdout = "", stderr = "";
      child.stdout.on("data", chunk => stdout += chunk);
      child.stderr.on("data", chunk => stderr += chunk);
      child.stdin.on("error", () => {}); // The bounded reader can close before a large input finishes.
      const watchdog = setTimeout(() => child.kill(), 4000);
      const result = new Promise((resolve, reject) => {
        child.on("error", reject);
        child.on("close", code => {
          clearTimeout(watchdog);
          children.delete(child);
          resolve({ code, stdout, stderr, elapsed: performance.now() - started });
        });
      });
      const body = typeof input === "string" ? input : JSON.stringify(input);
      if (open) child.stdin.write(body);
      else child.stdin.end(body);
      result.endInput = () => child.stdin.end();
      return result;
    },
  };
}

function quiet(result) {
  assert.deepEqual({ code: result.code, stdout: result.stdout, stderr: result.stderr }, { code: 0, stdout: "", stderr: "" });
}

test("a real SessionStart hook sends the leader identity from its isolated installed layout", async t => {
  const h = await harness(t);
  const before = Date.now();
  quiet(await h.run({ hook_event_name: "SessionStart", session_id: "session-a", source: "startup" }));
  assert.equal(h.events.length, 1);
  const [event] = h.events;
  assert.deepEqual({ ...event, at: 0 }, { v: 1, source: "leader", team: "43210", session: "session-a", at: 0, type: "session-start" });
  assert.ok(event.at >= before && event.at <= Date.now());
});

test("registered hooks map to leader events while clear, compact, notifications and subagents stay quiet", async t => {
  const h = await harness(t);
  const cases = [
    [{ hook_event_name: "UserPromptSubmit" }, "prompt"],
    [{ hook_event_name: "PermissionRequest", tool_name: "AskUserQuestion" }, "waiting"],
    [{ hook_event_name: "Notification", notification_type: "elicitation_dialog" }, "waiting"],
    [{ hook_event_name: "PostToolUse" }, "resumed"],
    [{ hook_event_name: "Stop" }, "stop"],
    [{ hook_event_name: "StopFailure" }, "failed"],
    [{ hook_event_name: "SessionEnd", reason: "prompt_input_exit" }, "session-end"],
    [{ hook_event_name: "SessionStart", source: "resume" }, "session-start"],
    [{ hook_event_name: "SessionStart", source: "clear" }, null],
    [{ hook_event_name: "SessionStart", source: "compact" }, null],
    [{ hook_event_name: "SessionEnd", reason: "clear" }, null],
    [{ hook_event_name: "Notification", notification_type: "permission_prompt" }, null],
    [{ hook_event_name: "Notification", notification_type: "idle_prompt" }, null],
    [{ hook_event_name: "Notification", notification_type: "future_type" }, null],
    [{ hook_event_name: "Notification" }, null],
    [{ hook_event_name: "SubagentStop" }, null],
    [{ hook_event_name: "SubagentStart" }, null],
    [{ hook_event_name: "PreToolUse" }, null],
    [{ hook_event_name: "constructor" }, null],
    [{}, null],
  ];
  for (const [input, type] of cases) {
    await t.test(JSON.stringify(input), async () => {
      h.events.length = 0;
      quiet(await h.run({ session_id: "new-session-after-clear", ...input }));
      assert.deepEqual(h.events.map(e => ({ ...e, at: 0 })), type ? [{
        v: 1, source: "leader", team: "43210", session: "new-session-after-clear", at: 0, type,
      }] : []);
    });
  }
});

test("invalid input and missing team keys send nothing and never affect the leader", async t => {
  const h = await harness(t);
  for (const input of ["", "{broken", "null", "[]", "42"]) quiet(await h.run(input));
  const prompt = { hook_event_name: "UserPromptSubmit", session_id: "session-a" };
  quiet(await h.run(prompt, { CLAUDE_PID: undefined }));
  quiet(await h.run(prompt, { CLAUDE_PID: "" }));
  assert.deepEqual(h.events, []);
  quiet(await h.run({ hook_event_name: "UserPromptSubmit" }));
  assert.equal(h.events[0].session, null);
});

test("oversized input or stdin left open is abandoned with a quiet successful exit", async t => {
  const h = await harness(t);
  const oversized = JSON.stringify({ hook_event_name: "UserPromptSubmit", padding: "x".repeat(2 * 1024 * 1024) });
  quiet(await h.run(oversized));
  const result = await h.run({ hook_event_name: "UserPromptSubmit" }, {}, { open: true });
  quiet(result);
  assert.ok(result.elapsed < 2500, `open stdin took ${result.elapsed}ms`);
  assert.deepEqual(h.events, []);
});

for (const mode of ["absent", "silent", "foreign"]) test(`${mode} listener cannot block or add hook output`, async t => {
  const h = await harness(t, mode);
  const result = await h.run({ hook_event_name: "UserPromptSubmit", session_id: "session-a" });
  quiet(result);
  assert.ok(result.elapsed < 1500, `${mode} took ${result.elapsed}ms`);
  assert.deepEqual(h.events, []);
});

test("concurrent real hooks delivered in reverse timestamp order leave the latest leader state", { timeout: 5000 }, async t => {
  const h = await harness(t, "concurrent");
  const runs = ["UserPromptSubmit", "PermissionRequest", "PostToolUse", "Stop"].map(hook_event_name =>
    h.run({ hook_event_name, session_id: "session-a" }, {}, { open: true }));
  // All processes are alive together. Release stdin in order and hold POST replies
  // until all four have arrived, keeping their deliveries concurrent.
  for (const run of runs) {
    const arrival = h.nextEvent();
    run.endInput();
    await arrival;
    await delay(20);
  }
  for (const result of await Promise.all(runs)) quiet(result);
  assert.deepEqual(h.events.map(e => e.type), ["prompt", "waiting", "resumed", "stop"]);
  assert.ok(h.events.every((event, i) => i === 0 || event.at > h.events[i - 1].at));
  const stage = createStage({ now: () => Date.now() });
  for (const event of [...h.events].reverse()) stage.apply(event);
  assert.deepEqual(stage.snapshot(), { teams: [{ key: "43210", leader: { state: "review", session: "session-a" }, workers: [] }] });
});
