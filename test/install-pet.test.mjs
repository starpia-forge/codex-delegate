import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomInt } from "node:crypto";
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, watch, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { fakeCodex } from "./helpers/fake-codex.mjs";
import { zip } from "./helpers/zip.mjs";

const cli = fileURLToPath(new URL("../bin/cli.mjs", import.meta.url));
const events = ["SessionStart", "SessionEnd", "UserPromptSubmit", "PermissionRequest", "Notification", "Stop", "StopFailure", "PostToolUse"];
const bundleFiles = {
  "codex-delegate-pet.exe": "fake executable, never run",
  "client/pet-client.mjs": "export const fake = true;\n",
  "hook/leader-hook.mjs": "// fake hook\n",
  "default-pets/pet/manifest.json": "{}",
};

async function release(t, f, { bytes = zip(bundleFiles), status = 200 } = {}) {
  const requests = [];
  const server = createServer((req, res) => {
    requests.push(req.url);
    res.writeHead(status);
    res.end(bytes);
  });
  // Windows can allocate a low port for listen(0); fetch refuses certain
  // well-known ports (for example 1720) even on a loopback fake server.
  for (let attempt = 0; ; attempt++) {
    try {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(randomInt(49152, 65536), "127.0.0.1", () => {
          server.off("error", reject);
          resolve();
        });
      });
      break;
    } catch (error) {
      // Windows reserves some dynamic-port ranges, reported as EACCES.
      if (attempt >= 31 || !["EADDRINUSE", "EACCES"].includes(error.code)) throw error;
    }
  }
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const pin = { tag: "pet-v1.2.3", asset: "pet.zip", sha256: createHash("sha256").update(bytes).digest("hex"), version: "1.2.3" };
  const pinPath = join(f.root, "pin.json");
  writeFileSync(pinPath, JSON.stringify(pin));
  Object.assign(f.env, {
    CODEX_DELEGATE_PET_TEST_PIN: pinPath,
    CODEX_DELEGATE_PET_BASE_URL: `http://127.0.0.1:${server.address().port}`,
  });
  return { requests, pin, pinPath };
}

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "install pet test "));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const fake = fakeCodex(root, `
if (process.argv.includes("--version")) console.log("codex-cli test");
else if (process.argv.slice(2).join(" ") === "login status") console.log("Logged in");
else process.exitCode = 1;
`);
  const env = { ...fake.env, CODEX_DELEGATE_TEST_PLATFORM: "win32" };
  const settingsPath = join(fake.claudeHome, "settings.json");
  writeFileSync(settingsPath, '{ "theme": "dark" }\n');
  const run = (args, extraEnv = {}, onOutput = () => {}) => {
    const child = spawn(process.execPath, [cli, ...args], {
      cwd: root, env: { ...env, ...extraEnv }, windowsHide: true,
    });
    const completion = new Promise((resolve, reject) => {
      let stdout = "", stderr = "";
      child.stdout.on("data", chunk => { stdout += chunk; onOutput(stdout); });
      child.stderr.on("data", chunk => { stderr += chunk; });
      child.on("error", reject);
      child.on("close", code => resolve({ code, stdout, stderr, output: stdout + stderr }));
    });
    completion.child = child;
    return completion;
  };
  return { root, ...fake, env, run, settingsPath, petRoot: join(fake.home, ".codex-delegate") };
}

function snapshot(dir) {
  if (!existsSync(dir)) return null;
  return Object.fromEntries(readdirSync(dir, { withFileTypes: true }).map(entry => [entry.name,
    entry.isDirectory() ? snapshot(join(dir, entry.name)) : readFileSync(join(dir, entry.name)).toString("base64")
  ]));
}

async function appStub(t, f, { ignoreQuit = false, foreign = false } = {}) {
  const log = join(f.root, "app-quit.json");
  const child = spawn(process.execPath, ["--input-type=module", "-e", `
    import { createServer } from "node:http";
    import { existsSync, readFileSync, writeFileSync } from "node:fs";
    const state = ${JSON.stringify(join(f.petRoot, "pet-state"))};
    const server = createServer((req, res) => {
      if (req.headers["x-codex-delegate-pet-token"] !== readFileSync(state + "/token", "utf8").trim()) {
        res.writeHead(401); return res.end();
      }
      if (req.url === "/health") return res.end(JSON.stringify({ app: ${JSON.stringify(foreign ? "other-app" : "codex-delegate-pet")}, protocol: 1, version: "1", pid: process.pid }));
      if (req.url === "/quit" && req.method === "POST") {
        writeFileSync(${JSON.stringify(log)}, JSON.stringify({ updating: existsSync(state + "/updating"), bundle: existsSync(${JSON.stringify(join(f.petRoot, "pet", "codex-delegate-pet.exe"))}) }));
        res.end("{}", () => { if (!${ignoreQuit}) server.close(() => process.exit(0)); });
      } else { res.writeHead(404); res.end(); }
    });
    server.listen(0, "127.0.0.1", () => console.log(server.address().port));
  `], { env: f.env, windowsHide: true });
  const exited = new Promise(resolve => child.once("close", resolve));
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); await exited; });
  const port = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.stdout.once("data", chunk => resolve(Number(chunk.toString().trim())));
    child.once("exit", code => reject(new Error(`app stub exited ${code}`)));
  });
  return { child, exited, log, env: { CODEX_DELEGATE_PET_PORT: String(port), CODEX_DELEGATE_PET_QUIT_TIMEOUT_MS: "150" } };
}

for (const args of [
  ["install", "--scope", "project"],
  ["install", "--agent", "codex"],
  ["uninstall", "--scope", "project"],
  ["uninstall", "--agent", "codex"],
]) {
  test(`${args.join(" ")} leaves an enabled pet untouched`, async t => {
    const f = fixture(t);
    const r = await release(t, f);
    const installed = await f.run(["install", "--with-pet"]);
    assert.equal(installed.code, 0, installed.output);
    const state = join(f.petRoot, "pet-state");
    writeFileSync(join(f.petRoot, "pet", "keep.txt"), "keep the installed bundle intact");
    mkdirSync(join(state, "sessions"));
    writeFileSync(join(state, "sessions", "leader.json"), '{"team":"1234"}\n');
    mkdirSync(join(state, "spool"));
    writeFileSync(join(state, "spool", "event.json"), '{"type":"prompt"}\n');
    const app = await appStub(t, f);
    const before = snapshot(f.petRoot);
    const settings = readFileSync(f.settingsPath);
    const requests = [...r.requests];
    const flagEvents = [];
    // Observe transient writes too: a final snapshot alone misses a flag
    // that was created and then cleared during the command.
    const watcher = watch(state, (event, filename) => {
      if (filename?.toString() === "updating") flagEvents.push(event);
    });
    t.after(() => watcher.close());

    const result = await f.run(args, app.env);

    assert.equal(result.code, 0, result.output);
    assert.deepEqual(r.requests, requests, "no pet download");
    assert.deepEqual(snapshot(f.petRoot), before, "bundle and state remain byte-identical");
    assert.deepEqual(readFileSync(f.settingsPath), settings, "Claude settings remain byte-identical");
    assert.equal(existsSync(app.log), false, "app must not be asked to quit");
    assert.doesNotThrow(() => process.kill(app.child.pid, 0), "app remains running");
    assert.deepEqual(flagEvents, [], "no updating flag is written, even transiently");
    assert.equal(existsSync(join(state, "updating")), false);
  });
}

for (const args of [["install"], ["install", "--without-pet"], ["uninstall"]]) {
  for (const ignoreQuit of [false, true]) {
    test(`${args.join(" ")} suppresses relaunch before asking the app to quit${ignoreQuit ? " and force-stops it" : ""}`, async t => {
      const f = fixture(t);
      await release(t, f);
      assert.equal((await f.run(["install", "--with-pet"])).code, 0);
      const app = await appStub(t, f, { ignoreQuit });
      const result = await f.run(args, app.env);
      assert.equal(result.code, 0, result.output);
      assert.equal(existsSync(app.log), true, "app must be asked to quit");
      assert.deepEqual(JSON.parse(readFileSync(app.log)), { updating: true, bundle: true });
      assert.throws(() => process.kill(app.child.pid, 0), { code: "ESRCH" });
      await app.exited;
      assert.equal(existsSync(join(f.petRoot, "pet-state", "updating")), false);
    });
  }
}

test("a concurrent installer is refused while the first installer waits for the app to stop", { timeout: 15_000 }, async t => {
  const f = fixture(t);
  const r = await release(t, f);
  assert.equal((await f.run(["install", "--with-pet"])).code, 0);
  const app = await appStub(t, f, { ignoreQuit: true });
  const first = f.run(["install"], { ...app.env, CODEX_DELEGATE_PET_QUIT_TIMEOUT_MS: "1800" });
  const deadline = Date.now() + 5000;
  while (!existsSync(app.log) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(existsSync(app.log), true);
  const before = snapshot(f.petRoot);
  const requests = r.requests.length;
  const contenders = await Promise.all([
    ["install", "--without-pet"], ["install", "--scope", "project"], ["install", "--agent", "codex"],
  ].map(args => f.run(args)));
  const afterSecond = snapshot(f.petRoot);
  const firstResult = await first;
  for (const second of contenders) {
    assert.notEqual(second.code, 0, second.output);
    assert.match(second.output, /another.*install|install.*lock/i);
  }
  assert.deepEqual(afterSecond, before);
  assert.equal(r.requests.length, requests);
  assert.equal(firstResult.code, 0, firstResult.output);
  assert.deepEqual(readdirSync(f.petRoot).sort(), ["pet", "pet-state"]);
});

for (const enabled of [false, true]) {
  test(`rerunning ${enabled ? "implicit update" : "with-pet"} completes a failure after the bundle swap`, async t => {
    const f = fixture(t);
    const r = await release(t, f);
    const state = join(f.petRoot, "pet-state");
    let token;
    if (enabled) {
      assert.equal((await f.run(["install", "--with-pet"])).code, 0);
      token = readFileSync(join(state, "token"));
      const markerPath = join(state, ".codex-delegate.json");
      const marker = JSON.parse(readFileSync(markerPath));
      const settings = JSON.parse(readFileSync(f.settingsPath));
      // Exercise ownership across an interrupted command migration.
      marker.hooks.Stop = 'node "old leader-hook.mjs"';
      settings.hooks.Stop[0].hooks[0].command = marker.hooks.Stop;
      writeFileSync(markerPath, JSON.stringify(marker));
      writeFileSync(f.settingsPath, JSON.stringify(settings));
      writeFileSync(r.pinPath, JSON.stringify({ ...r.pin, version: "1.2.4" }));
    }
    const args = enabled ? ["install"] : ["install", "--with-pet"];
    const originalSettings = readFileSync(f.settingsPath);
    const failed = await f.run(args, { CODEX_DELEGATE_PET_TEST_FAIL_AFTER_SWAP: "1" });
    assert.notEqual(failed.code, 0, failed.output);
    assert.match(failed.output, /applied: install pet bundle/);
    assert.match(failed.output, /not applied: write Claude Code settings/);
    assert.match(failed.output, /Settings backup: none/);
    assert.deepEqual(readFileSync(f.settingsPath), originalSettings);
    assert.equal(existsSync(join(f.petRoot, "pet", "codex-delegate-pet.exe")), true);
    assert.equal(existsSync(join(state, "updating")), false);
    const rerun = await f.run(args);
    assert.equal(rerun.code, 0, rerun.output);
    if (token) assert.deepEqual(readFileSync(join(state, "token")), token);
    const settings = JSON.parse(readFileSync(f.settingsPath));
    for (const event of events) assert.equal(settings.hooks[event].length, 1);
    assert.doesNotMatch(readFileSync(f.settingsPath, "utf8"), /old leader-hook/);
    const marker = JSON.parse(readFileSync(join(state, ".codex-delegate.json")));
    assert.equal(marker.bundle.version, enabled ? "1.2.4" : "1.2.3");
    assert.equal(marker.settingsPath, f.settingsPath);
    assert.equal(marker.pendingHooks, undefined);
    assert.deepEqual(readdirSync(f.petRoot).sort(), ["pet", "pet-state"]);
  });
}

test("the same install recovers the lock and updating flag after a hard interruption", async t => {
  const f = fixture(t);
  await release(t, f);
  assert.equal((await f.run(["install", "--with-pet"])).code, 0);
  const app = await appStub(t, f, { ignoreQuit: true });
  const running = f.run(["install"], { ...app.env, CODEX_DELEGATE_PET_QUIT_TIMEOUT_MS: "5000" });
  const deadline = Date.now() + 5000;
  while (!existsSync(app.log) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(existsSync(app.log), true);
  running.child.kill("SIGKILL");
  await running;
  assert.equal(existsSync(join(f.petRoot, "install.lock")), true);
  assert.equal(existsSync(join(f.petRoot, "pet-state", "updating")), true);
  const result = await f.run(["install"], app.env);
  assert.equal(result.code, 0, result.output);
  assert.equal(existsSync(join(f.petRoot, "install.lock")), false);
  assert.equal(existsSync(join(f.petRoot, "pet-state", "updating")), false);
  assert.deepEqual(readdirSync(f.petRoot).sort(), ["pet", "pet-state"]);
});

test("a stale updating flag is cleared even when the next install fails preflight", async t => {
  const f = fixture(t);
  const r = await release(t, f);
  assert.equal((await f.run(["install", "--with-pet"])).code, 0);
  const flag = join(f.petRoot, "pet-state", "updating");
  writeFileSync(flag, "interrupted");
  writeFileSync(r.pinPath, JSON.stringify({ ...r.pin, sha256: "0".repeat(64) }));
  const result = await f.run(["install"]);
  assert.notEqual(result.code, 0);
  assert.match(result.output, /checksum/i);
  assert.equal(existsSync(flag), false);
  assert.equal(existsSync(join(f.petRoot, "install.lock")), false);
});

for (const args of [["install"], ["uninstall"]]) {
  test(`${args.join(" ")} never asks a foreign listener to quit or kills its process`, async t => {
    const f = fixture(t);
    await release(t, f);
    assert.equal((await f.run(["install", "--with-pet"])).code, 0);
    const app = await appStub(t, f, { foreign: true });
    const result = await f.run(args, app.env);
    assert.equal(result.code, 0, result.output);
    assert.equal(existsSync(app.log), false);
    assert.equal(process.kill(app.child.pid, 0), true);
  });
}

for (const scope of ["user", "project"]) {
  for (const agents of [[], ["claude-code"], ["codex"]]) {
    for (const enabled of [false, true]) {
      for (const command of ["install", "uninstall"]) {
        test(`matrix: ${command}, ${scope}, ${agents.join() || "both agents"}, pet ${enabled ? "enabled" : "disabled"}`, async t => {
          const f = fixture(t);
          const r = await release(t, f);
          if (enabled) assert.equal((await f.run(["install", "--with-pet"])).code, 0);
          r.requests.length = 0;
          const before = snapshot(f.petRoot);
          const settings = readFileSync(f.settingsPath);
          const args = [command, "--scope", scope, ...agents.flatMap(agent => ["--agent", agent])];
          const result = await f.run(args);
          assert.equal(result.code, 0, result.output);
          const eligible = scope === "user" && !agents.includes("codex");
          assert.equal(r.requests.length, eligible && enabled && command === "install" ? 1 : 0);
          if (!eligible || !enabled) {
            assert.deepEqual(snapshot(f.petRoot), before);
            assert.deepEqual(readFileSync(f.settingsPath), settings);
          } else if (command === "uninstall") {
            assert.equal(existsSync(join(f.petRoot, "pet")), false);
            assert.equal(existsSync(join(f.petRoot, "pet-state")), false);
          } else {
            assert.equal(existsSync(join(f.petRoot, "pet", "codex-delegate-pet.exe")), true);
          }
        });
      }
    }
  }
}

test("contradictory pet options are refused without changing anything", async t => {
  const f = fixture(t);
  const before = snapshot(f.root);
  const result = await f.run(["install", "--with-pet", "--without-pet"]);
  assert.notEqual(result.code, 0);
  assert.match(result.output, /contradictory/i);
  assert.deepEqual(snapshot(f.root), before);
});

for (const [args, extraEnv, reason] of [
  [["install", "--with-pet", "--scope", "project"], {}, /user scope/i],
  [["install", "--without-pet", "--scope", "project"], {}, /user scope/i],
  [["install", "--with-pet", "--agent", "codex"], {}, /Claude Code/i],
  [["install", "--without-pet", "--agent", "codex"], {}, /Claude Code/i],
  [["install", "--with-pet"], { CODEX_DELEGATE_TEST_PLATFORM: "linux" }, /not supported on this platform yet/i],
  ...["list", "uninstall", "doctor"].flatMap(command => ["--with-pet", "--without-pet"].map(flag => [[command, flag], {}, /only.*install/i])),
]) {
  test(`refuses ${args.join(" ")} ${extraEnv.CODEX_DELEGATE_TEST_PLATFORM ?? ""} without changes`, async t => {
    const f = fixture(t);
    const before = snapshot(f.root);
    const result = await f.run(args, extraEnv);
    assert.notEqual(result.code, 0);
    assert.match(result.output, reason);
    assert.deepEqual(snapshot(f.root), before);
  });
}

test("fresh install downloads the pin, installs bundle and state, and registers all leader hooks with a backup", async t => {
  const f = fixture(t);
  const r = await release(t, f);
  const original = readFileSync(f.settingsPath, "utf8");
  const result = await f.run(["install", "--with-pet"]);
  assert.equal(result.code, 0, result.output);
  assert.deepEqual(r.requests, ["/pet-v1.2.3/pet.zip"]);
  for (const [path, contents] of Object.entries(bundleFiles)) {
    assert.equal(readFileSync(join(f.petRoot, "pet", path), "utf8"), contents);
  }
  const state = join(f.petRoot, "pet-state");
  assert.match(readFileSync(join(state, "token"), "utf8"), /^[0-9a-f]{64}$/);
  const marker = JSON.parse(readFileSync(join(state, ".codex-delegate.json"), "utf8"));
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const command = `node "${join(f.petRoot, "pet", "hook", "leader-hook.mjs")}"`;
  assert.equal(marker.package, pkg.name);
  assert.equal(marker.version, pkg.version);
  assert.deepEqual(marker.bundle, r.pin);
  assert.equal(marker.settingsPath, f.settingsPath);
  assert.ok(Number.isFinite(Date.parse(marker.installedAt)));
  assert.deepEqual(marker.hooks, Object.fromEntries(events.map(event => [event, command])));
  const settings = JSON.parse(readFileSync(f.settingsPath, "utf8"));
  assert.equal(settings.theme, "dark");
  for (const event of events) assert.deepEqual(settings.hooks[event], [{ hooks: [{ type: "command", command, timeout: 10, ...(event === "PostToolUse" ? { async: true } : {}) }] }]);
  assert.equal(readFileSync(f.settingsPath, "utf8"), JSON.stringify(settings, null, 2) + "\n");
  const backups = readdirSync(f.claudeHome).filter(name => name.startsWith("settings.json.codex-delegate-backup-"));
  assert.equal(backups.length, 1);
  assert.equal(readFileSync(join(f.claudeHome, backups[0]), "utf8"), original);
  assert.match(result.output, /restart Claude Code.*hooks/i);
  assert.deepEqual(readdirSync(f.petRoot).sort(), ["pet", "pet-state"]);
  assert.ok(existsSync(join(f.claudeHome, "skills", "codex-implement", ".codex-delegate.json")));
});

test("reinstall replaces owned leaves in place, preserves user hooks and state, and never duplicates", async t => {
  const f = fixture(t);
  await release(t, f);
  assert.equal((await f.run(["install", "--with-pet"])).code, 0);
  const tokenPath = join(f.petRoot, "pet-state", "token");
  const token = readFileSync(tokenPath, "utf8");
  writeFileSync(join(f.petRoot, "pet-state", "sessions.json"), "keep session state");
  writeFileSync(join(f.petRoot, "pet", "obsolete.txt"), "remove on bundle replacement");
  const command = `node "${join(f.petRoot, "pet", "hook", "leader-hook.mjs")}"`;
  const userLeaf = { type: "command", command: `echo before && ${command} --user`, timeout: 123 };
  const userGroup = { matcher: "something", hooks: [userLeaf, { type: "prompt", prompt: "User prompt" }] };
  const beforeLeaf = { type: "command", command: "echo before" };
  const afterLeaf = { type: "command", command: "echo after" };
  const ownedGroup = { matcher: "", custom: "preserve group", hooks: [beforeLeaf, { type: "command", command, timeout: 999, async: true }, afterLeaf] };
  const initial = { theme: "light", permissions: { allow: ["Read"] }, hooks: { Stop: [userGroup, ownedGroup], PreToolUse: [userGroup] } };
  writeFileSync(f.settingsPath, JSON.stringify(initial));
  const result = await f.run(["install", "--with-pet"]);
  assert.equal(result.code, 0, result.output);
  const settings = JSON.parse(readFileSync(f.settingsPath, "utf8"));
  assert.equal(settings.theme, "light");
  assert.deepEqual(settings.permissions, initial.permissions);
  assert.deepEqual(settings.hooks.PreToolUse, [userGroup]);
  assert.deepEqual(settings.hooks.Stop, [userGroup, { ...ownedGroup, hooks: [beforeLeaf, { type: "command", command, timeout: 10 }, afterLeaf] }]);
  const once = readFileSync(f.settingsPath, "utf8");
  assert.equal((await f.run(["install", "--with-pet"])).code, 0);
  assert.equal(readFileSync(f.settingsPath, "utf8"), once);
  assert.equal(readFileSync(tokenPath, "utf8"), token);
  assert.equal(readFileSync(join(f.petRoot, "pet-state", "sessions.json"), "utf8"), "keep session state");
  assert.equal(existsSync(join(f.petRoot, "pet", "obsolete.txt")), false);
  assert.deepEqual(readdirSync(f.petRoot).sort(), ["pet", "pet-state"]);
});

for (const enabled of [false, true]) {
  for (const failure of ["checksum", "download", "settings"]) {
    test(`${failure} preflight failure leaves ${enabled ? "existing" : "fresh"} skills, pet and settings unchanged`, async t => {
      const f = fixture(t);
      const r = await release(t, f, { status: failure === "download" ? 404 : 200 });
      if (enabled) {
        // Seed pre-existing files, including an enabled marker, without needing a successful download.
        for (const dir of [join(f.claudeHome, "skills"), join(f.codexHome, "skills"), join(f.petRoot, "pet"), join(f.petRoot, "pet-state")]) mkdirSync(dir, { recursive: true });
        writeFileSync(join(f.petRoot, "pet", "keep.txt"), "original bundle");
        writeFileSync(join(f.petRoot, "pet-state", ".codex-delegate.json"), JSON.stringify({ bundle: { version: "old" } }));
        writeFileSync(join(f.petRoot, "pet-state", "token"), "original token");
      }
      if (failure === "checksum") writeFileSync(r.pinPath, JSON.stringify({ ...r.pin, sha256: "0".repeat(64) }));
      if (failure === "settings") writeFileSync(f.settingsPath, "{ unparseable settings");
      const before = snapshot(f.root);
      const result = await f.run(["install", "--with-pet"]);
      assert.notEqual(result.code, 0, result.output);
      assert.match(result.output, failure === "checksum" ? /checksum mismatch/i : failure === "download" ? /download failed.*404/i : /cannot parse.*settings/i);
      assert.deepEqual(snapshot(f.root), before);
    });
  }
}

for (const [name, bytes] of [
  ["missing required file", zip({ "codex-delegate-pet.exe": "fake" })],
  ["malformed archive", Buffer.from("not a zip")],
  ...["../escape", "/absolute", "C:/drive", "client/../../escape", "..\\escape", "client/file:stream"].map(path => [path, zip({ ...bundleFiles, [path]: "escape" })]),
]) {
  test(`invalid bundle (${name}) is refused and staging is cleaned`, async t => {
    const f = fixture(t);
    await release(t, f, { bytes });
    const before = snapshot(f.root);
    const result = await f.run(["install", "--with-pet"]);
    assert.notEqual(result.code, 0, result.output);
    assert.match(result.output, /zip/i);
    assert.deepEqual(snapshot(f.root), before);
  });
}

for (const body of ["null", "[]", '"settings"', '{"hooks":[]}', '{"hooks":{"Stop":{}}}']) {
  test(`invalid settings shape ${body} changes nothing`, async t => {
    const f = fixture(t);
    await release(t, f);
    writeFileSync(f.settingsPath, body);
    const before = snapshot(f.root);
    const result = await f.run(["install", "--with-pet"]);
    assert.notEqual(result.code, 0, result.output);
    assert.match(result.output, /cannot parse.*settings/i);
    assert.deepEqual(snapshot(f.root), before);
  });
}

test("missing settings and its parent directory are created", async t => {
  const f = fixture(t);
  await release(t, f);
  const config = join(f.root, "new config");
  const result = await f.run(["install", "--with-pet"], { CLAUDE_CONFIG_DIR: config });
  assert.equal(result.code, 0, result.output);
  assert.equal(Object.keys(JSON.parse(readFileSync(join(config, "settings.json"))).hooks).length, 8);
  assert.equal(readdirSync(config).some(name => name.includes("backup")), false);
});

test("skill conflicts abort before the pet download", async t => {
  const f = fixture(t);
  const r = await release(t, f);
  mkdirSync(join(f.claudeHome, "skills", "codex-implement"), { recursive: true });
  writeFileSync(join(f.claudeHome, "skills", "codex-implement", "SKILL.md"), "user skill");
  const before = snapshot(f.root);
  const result = await f.run(["install", "--with-pet"]);
  assert.notEqual(result.code, 0, result.output);
  assert.match(result.output, /already has skills/);
  assert.deepEqual(r.requests, []);
  assert.deepEqual(snapshot(f.root), before);
});

test("plain install downloads nothing when disabled and updates an enabled pet with its original ownership", async t => {
  const f = fixture(t);
  const r = await release(t, f);
  assert.equal((await f.run(["install"])).code, 0);
  assert.deepEqual(r.requests, []);
  assert.equal(existsSync(f.petRoot), false);
  assert.equal(readFileSync(f.settingsPath, "utf8"), '{ "theme": "dark" }\n');
  assert.equal((await f.run(["install", "--with-pet"])).code, 0);
  r.requests.length = 0;
  const state = join(f.petRoot, "pet-state");
  const token = readFileSync(join(state, "token"));
  writeFileSync(join(state, "sessions.json"), "keep sessions");
  writeFileSync(join(f.petRoot, "pet", "obsolete.txt"), "old bundle");
  writeFileSync(r.pinPath, JSON.stringify({ ...r.pin, version: "1.2.4" }));
  const otherConfig = join(f.root, "other config");
  const result = await f.run(["install"], { CLAUDE_CONFIG_DIR: otherConfig });
  assert.equal(result.code, 0, result.output);
  assert.deepEqual(r.requests, ["/pet-v1.2.3/pet.zip"]);
  assert.equal(existsSync(join(f.petRoot, "pet", "obsolete.txt")), false);
  assert.deepEqual(readFileSync(join(state, "token")), token);
  assert.equal(readFileSync(join(state, "sessions.json"), "utf8"), "keep sessions");
  const marker = JSON.parse(readFileSync(join(state, ".codex-delegate.json")));
  assert.equal(marker.bundle.version, "1.2.4");
  assert.equal(marker.settingsPath, f.settingsPath);
  assert.equal(existsSync(join(otherConfig, "settings.json")), false);
  const settings = JSON.parse(readFileSync(f.settingsPath));
  for (const event of events) assert.equal(settings.hooks[event].length, 1);
});

test("dry run reports every pet action without downloading or changing files", async t => {
  const f = fixture(t);
  const r = await release(t, f);
  const before = snapshot(f.root);
  const result = await f.run(["install", "--with-pet", "--dry-run"]);
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /download.*http:\/\/127\.0\.0\.1:.*\/pet-v1\.2\.3\/pet.zip/i);
  assert.match(result.output, /SHA-256/i);
  assert.match(result.output, /staging/i);
  assert.match(result.output, /bundle 1\.2\.3/);
  for (const text of [join(f.petRoot, "pet"), join(f.petRoot, "pet-state"), "token", f.settingsPath, "settings.json.codex-delegate-backup-"]) assert.ok(result.output.includes(text), text);
  for (const event of events) assert.ok(result.output.includes(event));
  assert.deepEqual(r.requests, []);
  assert.deepEqual(snapshot(f.root), before);
  assert.equal((await f.run(["install", "--with-pet"])).code, 0);
  r.requests.length = 0;
  const installed = snapshot(f.root);
  const reinstall = await f.run(["install", "--with-pet", "--dry-run"]);
  assert.equal(reinstall.code, 0, reinstall.output);
  assert.match(reinstall.output, /move existing.*bundle aside/i);
  assert.match(reinstall.output, /remove.*previous bundle/i);
  assert.match(reinstall.output, /keep state directory/);
  assert.match(reinstall.output, /keep token/);
  assert.deepEqual(r.requests, []);
  assert.deepEqual(snapshot(f.root), installed);
});

test("without-pet installs skills normally when disabled", async t => {
  const f = fixture(t);
  const r = await release(t, f);
  const initialSettings = readFileSync(f.settingsPath);
  const disabled = await f.run(["install", "--without-pet"]);
  assert.equal(disabled.code, 0, disabled.output);
  assert.match(disabled.output, /no pet installed/i);
  assert.deepEqual(r.requests, []);
  assert.deepEqual(readFileSync(f.settingsPath), initialSettings);
  assert.equal(existsSync(f.petRoot), false);
});

for (const args of [["install", "--without-pet"], ["uninstall"]]) {
  test(`${args.join(" ")} removes only owned hooks from the recorded settings path`, async t => {
    const f = fixture(t);
    const r = await release(t, f);
    assert.equal((await f.run(["install", "--with-pet"])).code, 0);
    const marker = JSON.parse(readFileSync(join(f.petRoot, "pet-state", ".codex-delegate.json")));
    const userLeaf = { type: "command", command: `${marker.hooks.Stop} --user`, timeout: 77 };
    const userGroup = { matcher: "user", hooks: [userLeaf] };
    const settings = JSON.parse(readFileSync(f.settingsPath));
    settings.hooks.Stop[0].hooks.push(userLeaf);
    settings.hooks.Stop[0].matcher = "keep matcher";
    settings.hooks.SessionStart.push(userGroup);
    settings.hooks.PreToolUse = [userGroup];
    writeFileSync(f.settingsPath, JSON.stringify(settings));
    writeFileSync(join(f.petRoot, "pet.json"), '{"scale":0.5}');
    const config = join(f.root, "new config");
    mkdirSync(config);
    writeFileSync(join(config, "settings.json"), '{"new":true}');
    r.requests.length = 0;
    const before = snapshot(f.root);
    const dry = await f.run([...args, "--dry-run"], { CLAUDE_CONFIG_DIR: config });
    assert.equal(dry.code, 0, dry.output);
    assert.match(dry.output, /remove pet bundle/i);
    assert.ok(dry.output.includes(f.settingsPath));
    assert.deepEqual(snapshot(f.root), before);
    const result = await f.run(args, { CLAUDE_CONFIG_DIR: config });
    assert.equal(result.code, 0, result.output);
    assert.equal(existsSync(join(f.petRoot, "pet")), false);
    assert.equal(existsSync(join(f.petRoot, "pet-state")), false);
    assert.equal(readFileSync(join(f.petRoot, "pet.json"), "utf8"), '{"scale":0.5}');
    assert.deepEqual(JSON.parse(readFileSync(f.settingsPath)), {
      theme: "dark", hooks: { Stop: [{ matcher: "keep matcher", hooks: [userLeaf] }], SessionStart: [userGroup], PreToolUse: [userGroup] },
    });
    assert.equal(readFileSync(join(config, "settings.json"), "utf8"), '{"new":true}');
    const backups = readdirSync(f.claudeHome).filter(name => name.includes("backup"));
    assert.ok(backups.some(name => readFileSync(join(f.claudeHome, name), "utf8") === JSON.stringify(settings)));
    assert.deepEqual(r.requests, []);
    const again = await f.run(args, { CLAUDE_CONFIG_DIR: config });
    assert.equal(again.code, 0, again.output);
    const skill = join(config, "skills", "codex-implement", ".codex-delegate.json");
    assert.equal(existsSync(skill), args[0] === "install");
  });
}

for (const args of [["install", "--without-pet"], ["uninstall"]]) {
  test(`${args.join(" ")} retries cleanup even after an interrupted removal deleted the state marker`, async t => {
    const f = fixture(t);
    await release(t, f);
    assert.equal((await f.run(["install", "--with-pet"])).code, 0);
    const failed = await f.run(args, { CODEX_DELEGATE_PET_TEST_FAIL_AFTER_REMOVAL: "1" });
    assert.notEqual(failed.code, 0, failed.output);
    assert.match(failed.output, /applied: remove pet state/);
    assert.equal(existsSync(join(f.petRoot, "pet-state")), false);
    const result = await f.run(args);
    assert.equal(result.code, 0, result.output);
    assert.deepEqual(readdirSync(f.petRoot), []);
    assert.deepEqual(JSON.parse(readFileSync(f.settingsPath)), { theme: "dark", hooks: {} });
  });

  test(`${args.join(" ")} refuses changed settings during apply and can be rerun`, async t => {
    const f = fixture(t);
    await release(t, f);
    assert.equal((await f.run(["install", "--with-pet"])).code, 0);
    const edited = JSON.parse(readFileSync(f.settingsPath));
    edited.theme = "concurrent user edit";
    let changed = false;
    const result = await f.run(args, {}, output => {
      if (!changed && output.includes("Claude Code (Leader) ->")) {
        changed = true;
        writeFileSync(f.settingsPath, JSON.stringify(edited));
      }
    });
    assert.ok(changed);
    assert.notEqual(result.code, 0, result.output);
    assert.match(result.output, /settings changed since preflight/i);
    assert.equal(readFileSync(f.settingsPath, "utf8"), JSON.stringify(edited));
    assert.equal(existsSync(join(f.petRoot, "pet", "codex-delegate-pet.exe")), true);
    assert.equal(existsSync(join(f.petRoot, "pet-state", "updating")), false);
    const rerun = await f.run(args);
    assert.equal(rerun.code, 0, rerun.output);
    assert.deepEqual(JSON.parse(readFileSync(f.settingsPath)), { theme: "concurrent user edit", hooks: {} });
    assert.equal(existsSync(join(f.petRoot, "pet-state")), false);
  });

  test(`${args.join(" ")} aborts before skills change when recorded settings are invalid`, async t => {
    const f = fixture(t);
    await release(t, f);
    assert.equal((await f.run(["install", "--with-pet"])).code, 0);
    writeFileSync(f.settingsPath, "invalid JSON");
    const before = snapshot(f.root);
    const result = await f.run(args, { CLAUDE_CONFIG_DIR: join(f.root, "another config") });
    assert.notEqual(result.code, 0);
    assert.match(result.output, /cannot parse.*settings/i);
    assert.deepEqual(snapshot(f.root), before);
  });
}

test("user-scope list reports pet state, bundle version, and recorded settings path", async t => {
  const f = fixture(t);
  const r = await release(t, f);
  const before = snapshot(f.root);
  const empty = await f.run(["list"]);
  assert.equal(empty.code, 0, empty.output);
  assert.match(empty.output, /^Pet: not installed$/m);
  assert.deepEqual(snapshot(f.root), before);
  assert.equal((await f.run(["install", "--with-pet"])).code, 0);
  const installed = snapshot(f.root);
  const result = await f.run(["list"], { CLAUDE_CONFIG_DIR: join(f.root, "another config") });
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /^Pet: enabled, bundle 1\.2\.3 \(pet-v1\.2\.3\)/m);
  assert.ok(result.output.includes(join(f.petRoot, "pet")));
  assert.ok(result.output.includes(`hooks in ${f.settingsPath}`));
  assert.deepEqual(snapshot(f.root), installed);
  assert.equal(r.requests.length, 1);
  assert.doesNotMatch((await f.run(["list", "--scope", "project"])).output, /^Pet:/m);
});

test("commands recorded in the marker are replaced exactly, keeping surrounding user leaves", async t => {
  const f = fixture(t);
  await release(t, f);
  const recorded = 'node "C:\\old location\\leader-hook.mjs"';
  const user = { type: "command", command: `echo ${recorded}`, timeout: 20 };
  mkdirSync(join(f.petRoot, "pet-state"), { recursive: true });
  writeFileSync(join(f.petRoot, "pet-state", ".codex-delegate.json"), JSON.stringify({ hooks: { Stop: recorded } }));
  writeFileSync(f.settingsPath, JSON.stringify({ hooks: { Stop: [{ matcher: "*", hooks: [user, { type: "command", command: recorded }] }] } }));
  const result = await f.run(["install", "--with-pet"]);
  assert.equal(result.code, 0, result.output);
  const stop = JSON.parse(readFileSync(f.settingsPath)).hooks.Stop;
  assert.deepEqual(stop, [{ matcher: "*", hooks: [user, { type: "command", command: `node "${join(f.petRoot, "pet", "hook", "leader-hook.mjs")}"`, timeout: 10 }] }]);
});

test("updating removes duplicate owned registrations while preserving their surrounding user hooks", async t => {
  const f = fixture(t);
  await release(t, f);
  assert.equal((await f.run(["install", "--with-pet"])).code, 0);
  const settings = JSON.parse(readFileSync(f.settingsPath));
  const owned = settings.hooks.Stop[0].hooks[0];
  const user = { type: "command", command: "echo user" };
  settings.hooks.Stop = [
    { matcher: "first", hooks: [owned, user, owned] },
    { matcher: "duplicate", hooks: [owned] },
    { matcher: "keep", hooks: [owned, user] },
  ];
  writeFileSync(f.settingsPath, JSON.stringify(settings));
  const result = await f.run(["install"]);
  assert.equal(result.code, 0, result.output);
  assert.deepEqual(JSON.parse(readFileSync(f.settingsPath)).hooks.Stop, [
    { matcher: "first", hooks: [owned, user] },
    { matcher: "keep", hooks: [user] },
  ]);
});

for (const change of ["modified", "appeared", "disappeared"]) {
  test(`settings ${change} during apply are not overwritten and applied steps are reported`, async t => {
    const f = fixture(t);
    await release(t, f);
    if (change === "appeared") rmSync(f.settingsPath);
    let changed = false;
    const concurrentSettings = '{"user":"concurrent edit"}\n';
    const result = await f.run(["install", "--with-pet"], {}, output => {
      // The CLI prints the skill plan only after preflight has read settings.
      if (!changed && output.includes("Claude Code (Leader) ->")) {
        changed = true;
        if (change === "disappeared") rmSync(f.settingsPath);
        else writeFileSync(f.settingsPath, concurrentSettings);
      }
    });
    assert.ok(changed);
    assert.notEqual(result.code, 0, result.output);
    assert.match(result.output, /settings changed since preflight/i);
    assert.match(result.output, /applied: copy skill/);
    assert.match(result.output, /applied: install pet bundle 1\.2\.3/);
    assert.match(result.output, /applied: write pet marker/);
    assert.match(result.output, /failed.*write Claude Code settings/i);
    assert.match(result.output, /Settings backup: none/);
    assert.equal(readdirSync(f.claudeHome).some(name => name.includes("backup") || name.includes("temp")), false);
    if (change === "disappeared") assert.equal(existsSync(f.settingsPath), false);
    else assert.equal(readFileSync(f.settingsPath, "utf8"), concurrentSettings);
    assert.deepEqual(readdirSync(f.petRoot).sort(), ["pet", "pet-state"]);
  });
}

test("a blocked updating flag fails before the bundle swap and reports completed and pending steps", async t => {
  const f = fixture(t);
  await release(t, f);
  mkdirSync(f.petRoot);
  writeFileSync(join(f.petRoot, "pet-state"), "file blocks creation of the state directory");
  const originalSettings = readFileSync(f.settingsPath);
  const result = await f.run(["install", "--with-pet"]);
  assert.notEqual(result.code, 0, result.output);
  assert.match(result.output, /Install apply failed/);
  assert.match(result.output, /not applied: install pet bundle/);
  assert.match(result.output, /failed.*set updating flag and stop pet app/);
  assert.match(result.output, /not applied: create\/keep pet token/);
  assert.match(result.output, /not applied: write pet marker/);
  assert.match(result.output, /not applied: write Claude Code settings/);
  assert.match(result.output, /Settings backup: none/);
  assert.deepEqual(readFileSync(f.settingsPath), originalSettings);
  assert.deepEqual(readdirSync(f.petRoot).sort(), ["pet-state"]);
});

test("a locked settings destination reports the actual backup and leaves original settings intact", { skip: process.platform !== "win32", timeout: 20_000 }, async t => {
  const f = fixture(t);
  await release(t, f);
  const original = readFileSync(f.settingsPath);
  const script = join(f.root, "lock-settings.ps1");
  writeFileSync(script, `param([string]$SettingsPath)
$stream = [System.IO.File]::Open($SettingsPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
try {
  [Console]::Out.WriteLine('locked')
  [Console]::Out.Flush()
  [Console]::ReadLine() | Out-Null
} finally { $stream.Dispose() }
`);
  const locker = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script, f.settingsPath], { windowsHide: true });
  const closed = new Promise(resolve => locker.on("close", resolve));
  try {
    await new Promise((resolve, reject) => {
      let output = "";
      const timer = setTimeout(() => reject(new Error("settings locker did not become ready")), 10_000);
      locker.on("error", reject);
      locker.on("close", code => { clearTimeout(timer); reject(new Error(`settings locker exited: ${code}`)); });
      locker.stdout.on("data", chunk => {
        output += chunk;
        if (output.includes("locked")) { clearTimeout(timer); resolve(); }
      });
    });
    const result = await f.run(["install", "--with-pet"]);
    assert.notEqual(result.code, 0, result.output);
    assert.match(result.output, /failed.*write Claude Code settings/);
    const backup = result.output.match(/Settings backup: (.+)/)?.[1].trim();
    assert.ok(backup?.startsWith(`${f.settingsPath}.codex-delegate-backup-`), result.output);
    assert.deepEqual(readFileSync(backup), original);
    assert.deepEqual(readFileSync(f.settingsPath), original);
    assert.equal(readdirSync(f.claudeHome).some(name => name.includes("temp")), false);
  } finally {
    locker.stdin.end("release\n");
    await closed;
  }
});
