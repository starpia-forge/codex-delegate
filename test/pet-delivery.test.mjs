import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { fakeCodex } from "./helpers/fake-codex.mjs";
import { bundleFiles, release } from "./helpers/pet-release.mjs";
import { zip } from "./helpers/zip.mjs";

const clients = fileURLToPath(new URL("../pet/client", import.meta.url));
const token = "delivery-test-token";
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, message) {
  const deadline = Date.now() + 7000;
  while (Date.now() < deadline) {
    if (check()) return;
    await sleep(25);
  }
  assert.fail(message);
}

async function harness(t, overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), "pet delivery "));
  const bundle = join(root, ".codex-delegate", "pet");
  const state = join(root, ".codex-delegate", "pet-state");
  mkdirSync(state, { recursive: true });
  cpSync(clients, join(bundle, "client"), { recursive: true });
  writeFileSync(join(state, "token"), token);
  const server = createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  const stub = join(root, "stub.mjs");
  writeFileSync(stub, `
import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createStage } from ${JSON.stringify(new URL("../pet/app/ui/stage.mjs", import.meta.url).href)};
const root = process.env.HOME;
let time = 1000;
const stage = createStage({ now: () => time });
appendFileSync(root + '/starts', process.pid + '\\n');
const healthyAt = Date.now() + Number(process.env.STUB_DELAY);
const silentUntil = Date.now() + Number(process.env.STUB_HEALTH_SILENT_MS || 0);
const server = createServer((req, res) => {
  if (req.headers['x-codex-delegate-pet-token'] !== ${JSON.stringify(token)}) {
    appendFileSync(root + '/unauthorized', req.url + '\\n');
    res.writeHead(401).end(); return;
  }
  if (req.url === '/health') {
    if (Date.now() < silentUntil) return;
    res.statusCode = Date.now() < healthyAt ? 503 : 200;
    res.end(JSON.stringify({ app: 'codex-delegate-pet', protocol: 1, version: '0.1.0', pid: process.pid }));
  } else if (req.url === '/quit') {
    res.end('{}', () => process.exit(0));
  } else if (req.url === '/event') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      appendFileSync(root + '/events', body + '\\n');
      const event = JSON.parse(body);
      stage.apply(event);
      appendFileSync(root + '/stages', JSON.stringify(stage.snapshot()) + '\\n');
      if (event.type === 'end') {
        time += 60000;
        stage.tick();
        stage.apply({ ...event, type: 'heartbeat', seq: event.seq + 1, at: time });
        stage.tick();
        appendFileSync(root + '/late', JSON.stringify(stage.snapshot()) + '\\n');
      }
      setTimeout(() => res.end('{}'), Number(process.env.STUB_POST_DELAY || 0));
    });
  } else { res.writeHead(404).end(); }
});

if (process.env.STUB_BIND_GATE) {
  writeFileSync(root + '/.codex-delegate/pet-state/updating', 'updating');
  while (!existsSync(process.env.STUB_BIND_GATE)) await new Promise(resolve => setTimeout(resolve, 10));
}
server.listen(Number(process.env.CODEX_DELEGATE_PET_PORT), '127.0.0.1');
setTimeout(() => process.exit(), 15000).unref();
`);
  const env = { ...process.env, HOME: root, USERPROFILE: root,
    CLAUDE_CONFIG_DIR: join(root, "claude"), CODEX_HOME: join(root, "codex"),
    CODEX_DELEGATE_PET_PORT: String(port), STUB_DELAY: "1200",
    CODEX_DELEGATE_PET_TEST_COMMAND: JSON.stringify([process.execPath, stub]),
    CODEX_DELEGATE_PET_TEST_HEALTH_WAIT_MS: "4000", ...overrides };
  const lines = name => existsSync(join(root, name)) ? readFileSync(join(root, name), "utf8").trim().split("\n").filter(Boolean) : [];
  t.after(async () => {
    for (const pid of lines("starts")) { try { process.kill(Number(pid)); } catch {} }
    const lock = join(state, "spool", "delivery.lock");
    if (existsSync(lock)) {
      try {
        const owner = JSON.parse(readFileSync(lock));
        if (owner.id && owner.pid !== process.pid) process.kill(owner.pid);
      } catch {}
    }
    if (server.listening) await new Promise(resolve => server.close(resolve));
    rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 });
  });
  return { root, bundle, state, server, port, env, lines,
    events: () => lines("events").map(line => JSON.parse(line)),
    // On Windows a deleted file that another process (such as an antivirus
    // scan) holds open stays listed but can no longer be opened.
    spooled: () => existsSync(join(state, "spool")) ? readdirSync(join(state, "spool")).filter(name => {
      if (!name.endsWith(".json")) return false;
      try { readFileSync(join(state, "spool", name)); return true; } catch { return false; }
    }) : [],
    async produce(source = "await worker.send('start');") {
      const code = `import { createWorker } from ${JSON.stringify(pathToFileURL(join(bundle, "client", "pet-client.mjs")).href)};
const worker = createWorker({ role: 'implementer', label: 'quick-task' });
${source}`;
      const started = performance.now();
      const child = spawn(process.execPath, ["--input-type=module", "-e", code], { env, windowsHide: true });
      let stdout = "", stderr = "";
      child.stdout.on("data", data => stdout += data);
      child.stderr.on("data", data => stderr += data);
      const codeResult = await new Promise((resolve, reject) => { child.on("error", reject); child.on("close", resolve); });
      assert.deepEqual({ code: codeResult, stdout, stderr }, { code: 0, stdout: "", stderr: "" });
      return performance.now() - started;
    },
  };
}

test("an absent app starts in the background and receives an authenticated event after delayed health", async t => {
  const h = await harness(t);
  assert.ok(await h.produce() < 850, "producer waited for app startup");
  await until(() => h.events().length === 1, "spooled event never arrived");
  assert.equal(h.lines("starts").length, 1);
  assert.deepEqual(h.events().map(e => [e.type, e.role, e.label]), [["start", "implementer", "quick-task"]]);
  assert.deepEqual(h.lines("unauthorized"), []);
  await until(() => h.spooled().length === 0, "delivered event was not removed");
  const url = `http://127.0.0.1:${h.port}/health`;
  assert.equal((await fetch(url)).status, 401);
  assert.equal((await fetch(url, { headers: { "X-Codex-Delegate-Pet-Token": "wrong" } })).status, 401);
  assert.deepEqual(await (await fetch(url, { headers: { "X-Codex-Delegate-Pet-Token": token } })).json(),
    { app: "codex-delegate-pet", protocol: 1, version: "0.1.0", pid: Number(h.lines("starts")[0]) });
});

test("a helper rechecks updating immediately before spawning the configured app", async t => {
  const h = await harness(t);
  const preload = join(h.root, "update-before-spawn.mjs");
  writeFileSync(preload, `
    import { writeFileSync } from 'node:fs';
    const parse = JSON.parse;
    JSON.parse = function(value, ...args) {
      const result = parse(value, ...args);
      if (value === process.env.CODEX_DELEGATE_PET_TEST_COMMAND) {
        writeFileSync(${JSON.stringify(join(h.state, "updating"))}, 'updating');
      }
      return result;
    };
  `);
  h.env.NODE_OPTIONS = `--import=${pathToFileURL(preload).href}`;
  await h.produce();
  await until(() => existsSync(join(h.state, "updating")), "helper did not reach launch configuration");
  await until(() => !existsSync(join(h.state, "spool", "delivery.lock")), "helper did not release delivery");
  await sleep(150);
  assert.deepEqual(h.lines("starts"), []);
  assert.equal(h.spooled().length, 1);
});

for (const delay of ["0", "60000"]) test(`updating holds and refreshes delivery until a launched app binds without posting (health delay=${delay})`, async t => {
  const h = await harness(t, { STUB_DELAY: delay });
  h.env.STUB_BIND_GATE = join(h.root, "allow-bind");
  await h.produce();
  await until(() => existsSync(join(h.state, "updating")), "app did not reach its bind gate");
  const lock = join(h.state, "spool", "delivery.lock");
  assert.equal(existsSync(lock), true, "helper released delivery before the app bound");
  const old = new Date(Date.now() - 1000);
  utimesSync(lock, old, old);
  await sleep(200);
  assert.equal(existsSync(lock), true, "updating released delivery while the app was still absent");
  assert.ok(statSync(lock).mtimeMs > old.getTime(), "helper did not refresh delivery while waiting for bind");
  writeFileSync(h.env.STUB_BIND_GATE, "bind");
  await until(() => !existsSync(lock), "helper did not release delivery after the app bound");
  const response = await fetch(`http://127.0.0.1:${h.port}/health`, { headers: { "X-Codex-Delegate-Pet-Token": token } });
  assert.equal(response.status, delay === "0" ? 200 : 503);
  assert.deepEqual(h.events(), [], "helper posted while updating");
  assert.equal(h.spooled().length, 1);
  assert.equal(h.lines("starts").length, 1);
});

test("updating releases delivery at the health deadline if the launched app never binds", async t => {
  const h = await harness(t, { CODEX_DELEGATE_PET_TEST_HEALTH_WAIT_MS: "1200" });
  h.env.STUB_BIND_GATE = join(h.root, "allow-bind");
  const started = performance.now();
  await h.produce();
  await until(() => existsSync(join(h.state, "updating")), "app did not reach its bind gate");
  await until(() => !existsSync(join(h.state, "spool", "delivery.lock")), "helper exceeded its health deadline");
  assert.ok(performance.now() - started >= 1200, "helper released delivery before its health deadline");
  assert.deepEqual(h.events(), []);
  assert.equal(h.spooled().length, 1);
  assert.equal(h.lines("starts").length, 1);
});

test("a producer resumes delivery when the installer clears updating during enqueue", async t => {
  const h = await harness(t, { STUB_DELAY: "20" });
  const flag = join(h.state, "updating");
  writeFileSync(flag, "updating");
  const preload = join(h.root, "clear-during-enqueue.mjs");
  writeFileSync(preload, `
    import fs from 'node:fs';
    import { syncBuiltinESMExports } from 'node:module';
    const rename = fs.renameSync;
    fs.renameSync = function(from, to) {
      const result = rename(from, to);
      if (String(to).endsWith('.json')) fs.rmSync(${JSON.stringify(flag)}, { force: true });
      return result;
    };
    syncBuiltinESMExports();
  `);
  h.env.NODE_OPTIONS = `--import=${pathToFileURL(preload).href}`;
  await h.produce();
  await until(() => h.events().length === 1, "event published after the installer's scan was stranded");
});

for (const listening of [false, true]) test(`a fresh updating flag spools without launch or delivery (listening=${listening})`, async t => {
  const h = await harness(t);
  let requests = 0;
  if (listening) {
    h.server.on("request", (req, res) => {
      requests++;
      res.end(JSON.stringify({ app: "codex-delegate-pet", protocol: 1, version: "0.1.0" }));
    });
    await new Promise(resolve => h.server.listen(h.port, "127.0.0.1", resolve));
  }
  writeFileSync(join(h.state, "updating"), "");
  await h.produce();
  await sleep(350);
  assert.equal(requests, 0);
  assert.equal(h.lines("starts").length, 0);
  assert.equal(h.spooled().length, 1);
});

test("concurrent producers launch once and new healthy events cannot overtake the startup backlog", async t => {
  const h = await harness(t, { STUB_POST_DELAY: "180" });
  await Promise.all(Array.from({ length: 4 }, () => h.produce("await worker.send('start'); await worker.send('end', 'success');")));
  assert.equal(h.events().length, 0, "workers should finish before health is ready");
  await until(() => h.events().length >= 1, "startup backlog never began delivery");
  await h.produce();
  await until(() => h.events().length === 9, "events arriving during replay were stranded");
  assert.equal(h.lines("starts").length, 1);
  const events = h.events();
  assert.deepEqual(events.map(e => e.at), events.map(e => e.at).sort((a, b) => a - b));
  for (const id of new Set(events.slice(0, 8).map(e => e.worker))) {
    assert.deepEqual(events.filter(e => e.worker === id).map(e => e.type), ["start", "end"]);
  }
});

test("expired spool events are discarded and a stale updating flag does not prevent delivery", async t => {
  const h = await harness(t, { STUB_DELAY: "50" });
  const old = new Date(Date.now() - 6 * 60 * 1000);
  writeFileSync(join(h.state, "updating"), "");
  utimesSync(join(h.state, "updating"), old, old);
  mkdirSync(join(h.state, "spool"));
  writeFileSync(join(h.state, "spool", "expired.json"), JSON.stringify({ v: 1, source: "worker",
    team: null, session: null, worker: "expired", role: "critic", label: "old-task", at: old.getTime(), seq: 1, type: "start" }));
  await h.produce();
  await until(() => h.events().some(e => e.label === "quick-task"), "stale updating flag blocked startup");
  assert.deepEqual(h.events().map(e => e.label), ["quick-task"]);
  await until(() => h.spooled().length === 0, "expired event was not discarded");
});

for (const owner of ["dead", "stale"]) test(`concurrent producers recover a ${owner} helper lock and launch only once`, async t => {
  const h = await harness(t, { STUB_DELAY: "250" });
  mkdirSync(join(h.state, "spool"));
  const lock = join(h.state, "spool", "delivery.lock");
  let pid = process.pid;
  if (owner === "dead") {
    const child = spawn(process.execPath, ["-e", ""], { windowsHide: true });
    pid = child.pid;
    await new Promise(resolve => child.on("close", resolve));
  }
  writeFileSync(lock, JSON.stringify({ pid }));
  if (owner === "stale") {
    const old = new Date(Date.now() - 6 * 60 * 1000);
    utimesSync(lock, old, old);
  }
  await Promise.all(Array.from({ length: 6 }, () => h.produce()));
  await until(() => h.events().length === 6, "abandoned lock stranded events");
  assert.equal(h.lines("starts").length, 1);
});

test("a real worker finishing before cold-start health is labelled, removed, and never resurrected", async t => {
  const h = await harness(t);
  const fake = fakeCodex(h.root, `
const fs = require('node:fs');
process.stdin.resume();
process.stdin.on('end', () => {
  const args = process.argv.slice(2);
  fs.writeFileSync(args[args.indexOf('-o') + 1], 'done');
});
`);
  const task = join(h.root, "quick-task");
  mkdirSync(task);
  writeFileSync(join(task, "prompt.md"), "Do the task");
  const env = { ...fake.env, ...h.env };
  for (const key of Object.keys(env)) if (key.toUpperCase() === "PATH") delete env[key];
  env.PATH = fake.env.PATH;
  const child = spawn(process.execPath, [fileURLToPath(new URL("../src/runner/codex-run.mjs", import.meta.url)),
    "implementer", "--prompt-file", join(task, "prompt.md"), "--cwd", h.root], { env, windowsHide: true });
  let stderr = "";
  child.stdout.resume();
  child.stderr.on("data", data => stderr += data);
  assert.equal(await new Promise(resolve => child.on("close", resolve)), 0, stderr);
  assert.deepEqual(h.events(), [], "worker did not finish before health");
  await until(() => h.lines("late").length === 1, "cold-start worker was not replayed");
  assert.deepEqual(h.events().map(e => e.type), ["start", "end"]);
  const stages = h.lines("stages").map(line => JSON.parse(line));
  assert.deepEqual(stages[0].teams[0].workers.map(w => [w.role, w.label]), [["implementer", "quick-task"]]);
  // The ended worker stays only for its report scene, then leaves for good.
  assert.equal(stages[1].teams[0].workers.length, 1);
  assert.deepEqual(JSON.parse(h.lines("late")[0]), { teams: [], overflowSessions: 0 });
});

for (const mode of ["foreign", "protocol", "missing-version", "unauthorized", "silent", "silent-post", "error-post"]) {
  test(`${mode} listener causes no spool or launch`, async t => {
    const h = await harness(t);
    const requests = [];
    const sockets = new Set();
    h.server.on("connection", socket => { sockets.add(socket); socket.on("close", () => sockets.delete(socket)); });
    t.after(() => { for (const socket of sockets) socket.destroy(); });
    h.server.on("request", (req, res) => {
      requests.push(req.url);
      assert.equal(req.headers["x-codex-delegate-pet-token"], token);
      if (mode === "silent" || (mode === "silent-post" && req.url === "/event")) return;
      if (req.url === "/health") {
        if (mode === "unauthorized") res.statusCode = 401;
        res.end(JSON.stringify({ app: mode === "foreign" ? "other" : "codex-delegate-pet",
          protocol: mode === "protocol" ? 2 : 1, ...(mode === "missing-version" ? {} : { version: "0.1.0" }) }));
      } else { res.writeHead(500).end(); }
    });
    await new Promise(resolve => h.server.listen(h.port, "127.0.0.1", resolve));
    assert.ok(await h.produce() < 850);
    await sleep(100);
    assert.deepEqual(h.spooled(), []);
    assert.deepEqual(h.lines("starts"), []);
    if (!["silent-post", "error-post"].includes(mode)) assert.deepEqual(requests, ["/health"]);
  });
}

test("without a token the installed producer is silent and does nothing", async t => {
  const h = await harness(t);
  rmSync(join(h.state, "token"));
  await h.produce();
  await sleep(100);
  assert.deepEqual(h.spooled(), []);
  assert.deepEqual(h.lines("starts"), []);
});

test("the installer resumes queued delivery after an update without another producer event", async t => {
  const h = await harness(t, { STUB_DELAY: "700" });
  await h.produce();
  await until(() => h.lines("starts").length === 1, "helper never launched");
  writeFileSync(join(h.state, "updating"), "");
  await until(() => !existsSync(join(h.state, "spool", "delivery.lock")), "helper did not stop for update");
  await sleep(800);
  assert.deepEqual(h.events(), []);
  assert.equal(h.spooled().length, 1);
  const files = { ...bundleFiles };
  for (const name of readdirSync(clients)) files[`client/${name}`] = readFileSync(join(clients, name));
  await release(t, h, { bytes: zip(files) });
  const child = spawn(process.execPath, ["--input-type=module", "-e", `
    import { preparePet, withInstallerLock } from ${JSON.stringify(new URL("../bin/pet.mjs", import.meta.url).href)};
    await withInstallerLock(async () => {
      const plan = await preparePet({ root: ${JSON.stringify(fileURLToPath(new URL("../", import.meta.url)))}, pkg: { name: 'codex-delegate', version: 'test' } });
      try { for (const step of plan.steps) await step.apply(); } finally { plan.cleanup(); }
    }, { recoverPet: true });
  `], { env: h.env, windowsHide: true });
  let stderr = "";
  child.stderr.on("data", chunk => stderr += chunk);
  child.stdout.resume();
  assert.equal(await new Promise(resolve => child.on("close", resolve)), 0, stderr);
  await until(() => h.events().length === 1, "installer stranded the queued event");
  assert.equal(h.lines("starts").length, 2);
});

test("health startup has a bound and leaves undelivered events for a later retry", async t => {
  const h = await harness(t, { STUB_DELAY: "10000", CODEX_DELEGATE_PET_TEST_HEALTH_WAIT_MS: "300" });
  await h.produce();
  await until(() => h.lines("starts").length === 1, "stub was not launched");
  await until(() => !existsSync(join(h.state, "spool", "delivery.lock")), "helper did not respect health bound");
  assert.deepEqual(h.events(), []);
  assert.equal(h.spooled().length, 1);
  assert.equal(h.lines("starts").length, 1);
});

test("a launched app may hold its port silently before health becomes available", async t => {
  const h = await harness(t, { STUB_HEALTH_SILENT_MS: "700", STUB_DELAY: "900" });
  await h.produce();
  await until(() => h.events().length === 1, "temporary startup silence stranded the event");
  assert.equal(h.lines("starts").length, 1);
});

test("replay sorts by event timestamp then file name, independent of directory order", async t => {
  const h = await harness(t, { STUB_DELAY: "20" });
  mkdirSync(join(h.state, "spool"));
  const at = Date.now() - 1000;
  for (const [name, offset, label] of [["a.json", 2, "third"], ["c.json", 1, "second"], ["b.json", 1, "first"]]) {
    writeFileSync(join(h.state, "spool", name), JSON.stringify({ v: 1, source: "worker", team: null,
      session: null, worker: label, role: "critic", label, at: at + offset, seq: 1, type: "start" }));
  }
  await h.produce();
  await until(() => h.events().length === 4, "spool was not fully replayed");
  assert.deepEqual(h.events().map(e => e.label), ["first", "second", "third", "quick-task"]);
});
