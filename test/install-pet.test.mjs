import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomInt } from "node:crypto";
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  const run = (args, extraEnv = {}, onOutput = () => {}) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], {
      cwd: root, env: { ...env, ...extraEnv }, windowsHide: true,
    });
    let stdout = "", stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; onOutput(stdout); });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", code => resolve({ code, stdout, stderr, output: stdout + stderr }));
  });
  return { root, ...fake, env, run, settingsPath, petRoot: join(fake.home, ".codex-delegate") };
}

function snapshot(dir) {
  if (!existsSync(dir)) return null;
  return Object.fromEntries(readdirSync(dir, { withFileTypes: true }).map(entry => [entry.name,
    entry.isDirectory() ? snapshot(join(dir, entry.name)) : readFileSync(join(dir, entry.name)).toString("base64")
  ]));
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

test("plain install never downloads or changes enabled pet files or settings", async t => {
  const f = fixture(t);
  const r = await release(t, f);
  assert.equal((await f.run(["install"])).code, 0);
  assert.deepEqual(r.requests, []);
  assert.equal(existsSync(f.petRoot), false);
  assert.equal(readFileSync(f.settingsPath, "utf8"), '{ "theme": "dark" }\n');
  assert.equal((await f.run(["install", "--with-pet"])).code, 0);
  r.requests.length = 0;
  const beforePet = snapshot(f.petRoot);
  const beforeSettings = readFileSync(f.settingsPath);
  const result = await f.run(["install"]);
  assert.equal(result.code, 0, result.output);
  assert.deepEqual(r.requests, []);
  assert.deepEqual(snapshot(f.petRoot), beforePet);
  assert.deepEqual(readFileSync(f.settingsPath), beforeSettings);
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

test("without-pet installs normally when disabled and refuses enabled removal before changing anything", async t => {
  const f = fixture(t);
  const r = await release(t, f);
  const initialSettings = readFileSync(f.settingsPath);
  const disabled = await f.run(["install", "--without-pet"]);
  assert.equal(disabled.code, 0, disabled.output);
  assert.match(disabled.output, /no pet installed/i);
  assert.deepEqual(r.requests, []);
  assert.deepEqual(readFileSync(f.settingsPath), initialSettings);
  assert.equal(existsSync(f.petRoot), false);
  assert.equal((await f.run(["install", "--with-pet"])).code, 0);
  r.requests.length = 0;
  const before = snapshot(f.root);
  for (const args of [["install", "--without-pet"], ["install", "--without-pet", "--dry-run"]]) {
    const enabled = await f.run(args);
    assert.notEqual(enabled.code, 0, enabled.output);
    assert.match(enabled.output, /pet removal is not available yet/i);
    assert.deepEqual(snapshot(f.root), before);
  }
  assert.deepEqual(r.requests, []);
});

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

test("a state apply failure reports completed and pending steps and cleans staging", async t => {
  const f = fixture(t);
  await release(t, f);
  mkdirSync(f.petRoot);
  writeFileSync(join(f.petRoot, "pet-state"), "file blocks creation of the state directory");
  const originalSettings = readFileSync(f.settingsPath);
  const result = await f.run(["install", "--with-pet"]);
  assert.notEqual(result.code, 0, result.output);
  assert.match(result.output, /Install apply failed/);
  assert.match(result.output, /applied: install pet bundle/);
  assert.match(result.output, /failed.*create\/keep pet state directory/);
  assert.match(result.output, /not applied: create\/keep pet token/);
  assert.match(result.output, /not applied: write pet marker/);
  assert.match(result.output, /not applied: write Claude Code settings/);
  assert.match(result.output, /Settings backup: none/);
  assert.deepEqual(readFileSync(f.settingsPath), originalSettings);
  assert.deepEqual(readdirSync(f.petRoot).sort(), ["pet", "pet-state"]);
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
