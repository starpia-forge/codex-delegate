import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { fakeCodex } from "./helpers/fake-codex.mjs";

const sourceRunner = fileURLToPath(new URL("../src/runner/codex-run.mjs", import.meta.url));
const client = fileURLToPath(new URL("../pet/client/pet-client.mjs", import.meta.url));
const token = "runner-test-token";

async function harness(t, mode = "pet") {
  const root = mkdtempSync(join(tmpdir(), "pet runner "));
  const { home, env } = fakeCodex(root, `
const fs = require("node:fs");
process.stdin.resume();
process.stdin.on("end", () => setTimeout(() => {
  const args = process.argv.slice(2);
  fs.writeFileSync(args[args.indexOf("-o") + 1], "Fake worker result");
  process.exit(Number(process.env.FAKE_CODEX_EXIT || 0));
}, Number(process.env.FAKE_CODEX_DELAY || 0)));
`);
  Object.assign(env, { CLAUDE_PID: "43210", CLAUDE_CODE_SESSION_ID: "test-session" });
  const events = [], requests = [];
  const sockets = new Set();
  const server = createServer((req, res) => {
    requests.push(req.url);
    if (req.headers["x-codex-delegate-pet-token"] !== token) { res.statusCode = 401; res.end(); return; }
    if (mode === "silent") return;
    if (mode === "silent-post" && req.url === "/event") return;
    if (req.url === "/health") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(mode === "foreign" ? { app: "other-app" } :
        { app: "codex-delegate-pet", protocol: 1, version: "0.1.0" }));
    } else if (req.url === "/event" && req.method === "POST") {
      let body = "";
      req.on("data", chunk => body += chunk);
      req.on("end", () => { events.push(JSON.parse(body)); res.end("{}"); });
    } else { res.statusCode = 404; res.end(); }
  });
  server.on("connection", socket => { sockets.add(socket); socket.on("close", () => sockets.delete(socket)); });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  env.CODEX_DELEGATE_PET_PORT = String(server.address().port);
  if (mode === "absent") await new Promise(resolve => server.close(resolve));
  t.after(async () => {
    for (const socket of sockets) socket.destroy();
    if (server.listening) await new Promise(resolve => server.close(resolve));
    rmSync(root, { recursive: true, force: true });
  });
  const task = join(root, "my-task");
  mkdirSync(task);
  const prompt = join(task, "prompt.md"), result = join(task, "result.md");
  writeFileSync(prompt, "Do the task");
  return { events, requests, env, home, root,
    install(source = client) {
      const dest = join(home, ".codex-delegate", "pet", "client");
      mkdirSync(dest, { recursive: true });
      cpSync(dirname(client), dest, { recursive: true });
      if (source !== client) cpSync(source, join(dest, "pet-client.mjs"));
      const state = join(home, ".codex-delegate", "pet-state");
      mkdirSync(state, { recursive: true });
      writeFileSync(join(state, "token"), token);
    },
    async run({ runner = sourceRunner, exit = 0, delay = 0 } = {}) {
      const started = performance.now();
      const child = spawn(process.execPath, [runner, "implementer", "--prompt-file", prompt, "--cwd", root], {
        env: { ...env, FAKE_CODEX_EXIT: String(exit), FAKE_CODEX_DELAY: String(delay) }, windowsHide: true,
      });
      let stdout = "", stderr = "";
      child.stdout.on("data", chunk => stdout += chunk);
      child.stderr.on("data", chunk => stderr += chunk);
      const code = await new Promise((resolve, reject) => { child.on("error", reject); child.on("close", resolve); });
      return { code, stdout, stderr, result: readFileSync(result, "utf8"), elapsed: performance.now() - started };
    },
  };
}

function checkEvents(events, outcome) {
  assert.equal(events[0].type, "start");
  assert.equal(events.at(-1).type, "end");
  assert.equal(events.at(-1).outcome, outcome);
  for (let i = 0; i < events.length; i++) {
    assert.deepEqual({ ...events[i], worker: "id", at: 0, type: "event", outcome: undefined }, {
      v: 1, source: "worker", team: "43210", session: "test-session", worker: "id", role: "implementer",
      label: "my-task", at: 0, seq: i + 1, type: "event", outcome: undefined,
    });
    assert.match(events[i].worker, /^[\da-f-]{36}$/);
    assert.equal(events[i].worker, events[0].worker);
    assert.ok(Math.abs(Date.now() - events[i].at) < 20000);
  }
}

test("an installed pet client reports a successful worker without changing output", async t => {
  const h = await harness(t);
  const baseline = await h.run();
  assert.deepEqual(h.requests, []);
  h.install();
  const actual = await h.run();
  assert.deepEqual({ ...actual, elapsed: 0 }, { ...baseline, elapsed: 0 });
  assert.deepEqual(h.events.map(e => e.type), ["start", "end"]);
  checkEvents(h.events, "success");
});

test("failed workers report failed and concurrent same-role runs have distinct identities", async t => {
  const h = await harness(t);
  h.install();
  const results = await Promise.all([h.run({ exit: 7 }), h.run({ exit: 7 })]);
  assert.deepEqual(results.map(r => r.code), [7, 7]);
  const ids = [...new Set(h.events.map(e => e.worker))];
  assert.equal(ids.length, 2);
  for (const id of ids) checkEvents(h.events.filter(e => e.worker === id), "failed");
});

test("a slow worker reports heartbeats every ten seconds", async t => {
  const h = await harness(t);
  h.install();
  const result = await h.run({ delay: 10500 });
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(h.events.map(e => e.type), ["start", "heartbeat", "end"]);
  checkEvents(h.events, "success");
  const gap = h.events[1].at - h.events[0].at;
  assert.ok(gap >= 9800 && gap < 10400, `heartbeat gap ${gap}ms`);
});

for (const mode of ["absent", "silent", "silent-post", "foreign"]) test(`${mode} listener leaves worker results and timing unchanged`, async t => {
  const h = await harness(t, mode);
  const baseline = await h.run({ exit: 6 });
  h.install();
  const actual = await h.run({ exit: 6 });
  assert.deepEqual({ ...actual, elapsed: 0 }, { ...baseline, elapsed: 0 });
  assert.ok(actual.elapsed - baseline.elapsed < 750, `added ${actual.elapsed - baseline.elapsed}ms`);
  assert.deepEqual(h.events, []);
  if (mode === "foreign") assert.ok(h.requests.every(path => path === "/health"));
});

test("workers outside a Claude session report null team and session", async t => {
  const h = await harness(t);
  delete h.env.CLAUDE_PID;
  delete h.env.CLAUDE_CODE_SESSION_ID;
  h.install();
  assert.equal((await h.run()).code, 0);
  assert.deepEqual(h.events.map(e => [e.team, e.session]), [[null, null], [null, null]]);
});

for (const source of ["throw new Error('broken client');", "await new Promise(() => {});", "export function createWorker() { return { send() { return new Promise(() => {}); } }; }"]) {
  test(`a broken installed client cannot delay exit: ${source.slice(0, 32)}`, async t => {
    const h = await harness(t);
    const broken = join(h.root, "broken.mjs");
    writeFileSync(broken, source);
    const baseline = await h.run();
    h.install(broken);
    const actual = await h.run();
    assert.deepEqual({ ...actual, elapsed: 0 }, { ...baseline, elapsed: 0 });
    assert.ok(actual.elapsed - baseline.elapsed < 750);
  });
}

test("a runner installed from a generated skill reports to the pet", async t => {
  const h = await harness(t);
  const installed = join(h.home, ".claude", "skills", "codex-implement");
  cpSync(fileURLToPath(new URL("../skills/claude/codex-implement", import.meta.url)), installed, { recursive: true });
  h.install();
  const result = await h.run({ runner: join(installed, "scripts", "codex-run.mjs") });
  assert.equal(result.code, 0, result.stderr);
  checkEvents(h.events, "success");
});
