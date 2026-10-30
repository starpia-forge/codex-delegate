import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { fakeCodex } from "./helpers/fake-codex.mjs";
import { asset, bundleFiles, legacyBundle, listen, release, tag, unusedPetPort, version } from "./helpers/pet-release.mjs";
import { zip } from "./helpers/zip.mjs";

const cli = fileURLToPath(new URL("../bin/cli.mjs", import.meta.url));
const bundledAssets = new URL("../pet/app/ui/assets/", import.meta.url);
const defaultPetFiles = {};
for (const slot of ["leader", "researcher", "critic", "implementer", "computer-user"]) {
  const asset = new URL(`${slot}/`, bundledAssets);
  const bytes = readFileSync(new URL("pet.json", asset));
  const { spritesheetPath } = JSON.parse(bytes);
  defaultPetFiles[`default-pets/${slot}/pet.json`] = bytes;
  defaultPetFiles[`default-pets/${slot}/${spritesheetPath}`] = readFileSync(new URL(spritesheetPath, asset));
}

async function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "doctor checks "));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const f = { root, cli, ...fakeCodex(root, `
if (process.argv.includes("--version")) console.log("codex-cli test");
else if (process.argv.slice(2).join(" ") === "login status") console.log("Logged in");
else process.exitCode = 1;
`) };
  Object.assign(f.env, {
    CODEX_DELEGATE_TEST_PLATFORM: "win32",
    CODEX_DELEGATE_PET_TEST_WEBVIEW2: "present",
    CODEX_DELEGATE_PET_PORT: await unusedPetPort(t),
  });
  writeFileSync(join(f.codexHome, "models_cache.json"), JSON.stringify({ models: [
    { slug: "gpt-6-astra", supported_reasoning_levels: [{ effort: "medium" }] },
    { slug: "gpt-6.1-sol", supported_reasoning_levels: [{ effort: "high" }] },
    { slug: "gpt-6-luna", supported_reasoning_levels: [{ effort: "max" }] },
  ] }));
  f.petRoot = join(f.home, ".codex-delegate");
  f.settingsPath = join(f.claudeHome, "settings.json");
  f.run = (args = ["doctor"], extraEnv = {}) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [f.cli, ...args], {
      cwd: root, env: { ...f.env, ...extraEnv }, windowsHide: true, timeout: 15000,
    });
    let stdout = "", stderr = "";
    child.stdout.on("data", chunk => stdout += chunk);
    child.stderr.on("data", chunk => stderr += chunk);
    child.on("error", reject);
    child.on("close", code => resolve({ code, stdout, output: stdout + stderr }));
  });
  return f;
}

async function installedFixture(t) {
  const f = await fixture(t);
  const bundle = { tag, asset, sha256: "a".repeat(64), version };
  const state = join(f.petRoot, "pet-state");
  mkdirSync(state, { recursive: true });
  mkdirSync(join(f.petRoot, "pet"));
  cpSync(bundledAssets, join(f.petRoot, "pet", "default-pets"), { recursive: true });
  writeFileSync(join(f.petRoot, "pet", "codex-delegate-pet.exe"), "fake executable, never run");
  writeFileSync(join(state, "token"), "doctor-test-token\n");
  const command = `node "${join(f.petRoot, "pet", "hook", "leader-hook.mjs")}"`;
  const hooks = Object.fromEntries(["SessionStart", "SessionEnd", "UserPromptSubmit", "PermissionRequest", "Notification", "Stop", "StopFailure", "PostToolUse"].map(event => [event, command]));
  const marker = { package: "codex-delegate", version, bundle, settingsPath: f.settingsPath, hooks };
  f.markerPath = join(state, ".codex-delegate.json");
  writeFileSync(f.markerPath, JSON.stringify(marker));
  writeFileSync(f.settingsPath, JSON.stringify({ hooks: Object.fromEntries(Object.entries(hooks)
    .map(([event, command]) => [event, [{ hooks: [{ type: "command", command }] }]])) }));
  f.marker = marker;
  return f;
}

test("doctor without an installed pet prints no pet or WebView2 lines and never probes the port", async t => {
  const f = await fixture(t);
  const state = join(f.petRoot, "pet-state");
  mkdirSync(state, { recursive: true });
  writeFileSync(join(state, "pet-preferences.json"), '{"hidden":true}\n');
  const requests = [];
  const server = await listen(t, (req, res) => { requests.push(req.url); res.end("foreign"); });
  const result = await f.run(["doctor"], {
    CODEX_DELEGATE_PET_PORT: String(server.address().port), CODEX_DELEGATE_PET_TEST_WEBVIEW2: "missing",
  });
  assert.equal(result.code, 0, result.output);
  assert.doesNotMatch(result.stdout, /pet|WebView2/i);
  assert.deepEqual(requests, []);
  const listed = await f.run(["list"]);
  assert.equal(listed.code, 0, listed.output);
  assert.match(listed.stdout, /^Pet: not installed$/m);
});

test("doctor reports pets hidden at OK level with tray guidance", async t => {
  const f = await installedFixture(t);
  const path = join(f.petRoot, "pet-state", "pet-preferences.json");
  const preferences = '{"hidden":true,"future":1}\n';
  writeFileSync(path, preferences);
  const result = await f.run();
  assert.equal(result.code, 0, result.output);
  assert.match(result.stdout, /^  \[OK  \] Pet visibility - Pets are hidden; show them from the pet's tray icon\.$/m);
  assert.equal(readFileSync(path, "utf8"), preferences, "doctor only reads preferences");
});

for (const [description, preferences] of [
  ["missing file", null],
  ["hidden false", '{"hidden":false}'],
  ["invalid JSON", '{"hidden":true'],
  ["trailing invalid JSON", '{"hidden":true} garbage'],
  ["string hidden", '{"hidden":"true"}'],
  ["number hidden", '{"hidden":1}'],
  ["null hidden", '{"hidden":null}'],
  ["array hidden", '{"hidden":[true]}'],
  ["object hidden", '{"hidden":{}}'],
  ["unknown keys only", '{"future":true,"language":"ko"}'],
  ["null document", 'null'],
  ["boolean document", 'true'],
  ["number document", '1'],
  ["string document", '"hidden"'],
  ["array document", '[{"hidden":true}]'],
  ["UTF-8 BOM", '\uFEFF{"hidden":true}'],
  ["invalid UTF-8", Buffer.concat([Buffer.from('{"hidden":true,"future":"'), Buffer.from([0xff]), Buffer.from('"}')])],
  ["unreadable file", "directory"],
]) {
  test(`list and doctor treat ${description} preferences as pets shown`, async t => {
    const f = await installedFixture(t);
    const path = join(f.petRoot, "pet-state", "pet-preferences.json");
    if (preferences === "directory") mkdirSync(path);
    else if (preferences !== null) writeFileSync(path, preferences);
    const listed = await f.run(["list"]);
    assert.equal(listed.code, 0, listed.output);
    const line = listed.stdout.split("\n").find(line => line.startsWith("Pet:"));
    assert.equal(line, `Pet: enabled, bundle ${version} (v${version}) -> ${join(f.petRoot, "pet")}, hooks in ${f.settingsPath}`);
    const diagnosed = await f.run();
    assert.equal(diagnosed.code, 0, diagnosed.output);
    assert.doesNotMatch(diagnosed.output, /hidden|Pet visibility|pet-preferences|tray icon/i);
  });
}

test("doctor reports the matching Release bundle after a real install", async t => {
  const f = await fixture(t);
  await release(t, f, { bytes: zip({ ...bundleFiles, ...defaultPetFiles }) });
  const installed = await f.run(["install", "--with-pet"]);
  assert.equal(installed.code, 0, installed.output);
  const result = await f.run();
  assert.equal(result.code, 0, result.output);
  assert.ok(result.stdout.includes(`[OK  ] Pet bundle - ${version}`), result.output);
  assert.match(result.stdout, /\[OK  \] Pet hooks - /);
  assert.ok(result.stdout.includes(f.settingsPath), result.output);
  assert.match(result.stdout, /\[OK  \] Pet WebView2 runtime/);
  assert.match(result.stdout, /\[OK  \] Pet configuration/);
  assert.match(result.stdout, /\[OK  \] Pet packages/);
  assert.doesNotMatch(result.stdout, /\[WARN\] Pet packages/);
  assert.match(result.stdout, /\[OK  \] Pet port - .*pet app not running/);
});

test("doctor resolves installed bundled manifests and diagnoses their sheets", async t => {
  const f = await installedFixture(t);
  const dir = join(f.petRoot, "pet", "default-pets", "leader");
  const manifestPath = join(dir, "pet.json");
  const manifest = JSON.parse(readFileSync(manifestPath));
  renameSync(join(dir, manifest.spritesheetPath), join(dir, "renamed-sheet.data"));
  writeFileSync(manifestPath, JSON.stringify({ ...manifest, spritesheetPath: "renamed-sheet.data" }));
  const valid = await f.run();
  assert.equal(valid.code, 0, valid.output);
  assert.match(valid.stdout, /\[OK  \] Pet packages/);
  assert.doesNotMatch(valid.stdout, /\[WARN\] Pet packages/);
  writeFileSync(join(dir, "renamed-sheet.data"), "corrupt sheet");
  const broken = await f.run();
  assert.equal(broken.code, 0, broken.output);
  assert.match(broken.stdout, /\[WARN\] Pet packages \(leader\).*bundled: .*default-pets.*spritesheet must be PNG or WebP.*reinstall/);
});

for (const change of [{}, { sha256: "b".repeat(64) }, { tag: legacyBundle.tag, sha256: "c".repeat(64) }]) {
  test(`doctor accepts matching Release versions regardless of tag and hash (${Object.keys(change).join() || "unchanged"})`, async t => {
    const f = await installedFixture(t);
    writeFileSync(f.markerPath, JSON.stringify({ ...f.marker, bundle: { ...f.marker.bundle, ...change } }));
    const result = await f.run();
    assert.equal(result.code, 0, result.output);
    assert.ok(result.stdout.includes(`[OK  ] Pet bundle - ${version}`), result.output);
    assert.doesNotMatch(result.stdout, /\[WARN\] Pet bundle/);
  });
}

test("doctor warns when a legacy marker differs from the package's Release", async t => {
  const f = await installedFixture(t);
  writeFileSync(f.markerPath, JSON.stringify({ ...f.marker, bundle: legacyBundle }));
  const result = await f.run();
  assert.equal(result.code, 0, result.output);
  assert.ok(result.stdout.includes(`[WARN] Pet bundle - installed 0.2.0 (pet-v0.2.0), expected ${version} (v${version}); run codex-delegate install --with-pet`), result.output);
});

test("doctor accepts settings with a UTF-8 BOM and all recorded pet hooks", async t => {
  const f = await installedFixture(t);
  writeFileSync(f.settingsPath, "\uFEFF" + readFileSync(f.settingsPath, "utf8"));
  const result = await f.run();
  assert.match(result.stdout, /\[OK  \] Pet hooks - /);
  assert.equal(result.code, 0, result.output);
});

test("doctor fails for removed hook commands even when a user command mentions the owned command", async t => {
  const f = await installedFixture(t);
  const settings = JSON.parse(readFileSync(f.settingsPath));
  settings.hooks.Stop[0].hooks[0].command += " --user-hook";
  delete settings.hooks.SessionStart;
  writeFileSync(f.settingsPath, JSON.stringify(settings));
  const result = await f.run();
  assert.equal(result.code, 1, result.output);
  assert.match(result.stdout, /\[FAIL\] Pet hooks - .*SessionStart.*Stop/);
  assert.ok(result.stdout.includes(f.settingsPath), result.output);
});

for (const settings of [null, "{broken JSON"]) {
  test(`doctor fails when the recorded settings file is ${settings === null ? "missing" : "unparseable"}`, async t => {
    const f = await installedFixture(t);
    if (settings === null) rmSync(f.settingsPath);
    else writeFileSync(f.settingsPath, settings);
    const result = await f.run();
    assert.equal(result.code, 1, result.output);
    assert.match(result.stdout, /\[FAIL\] Pet hooks - /);
    assert.ok(result.stdout.includes(f.settingsPath), result.output);
  });
}

for (const missing of ["bundle directory", "app executable"]) {
  test(`doctor fails when the pet ${missing} is missing`, async t => {
    const f = await installedFixture(t);
    const path = join(f.petRoot, "pet", ...(missing === "app executable" ? ["codex-delegate-pet.exe"] : []));
    rmSync(path, { recursive: true });
    const result = await f.run();
    assert.equal(result.code, 1, result.output);
    assert.match(result.stdout, /\[FAIL\] Pet bundle - .*missing/i);
    assert.ok(result.stdout.includes(path), result.output);
  });
}

test("doctor warns when hooks live in a different config directory and still checks the recorded file", async t => {
  const f = await installedFixture(t);
  const current = join(f.root, "other-claude");
  const result = await f.run(["doctor"], { CLAUDE_CONFIG_DIR: current });
  assert.equal(result.code, 0, result.output);
  assert.match(result.stdout, /\[OK  \] Pet hooks - /);
  assert.match(result.stdout, /\[WARN\] Pet hooks config directory - .*different config directory/i);
  assert.ok(result.stdout.includes(f.settingsPath), result.output);
  assert.ok(result.stdout.includes(current), result.output);
});

test("doctor treats Windows settings paths as case insensitive", async t => {
  const f = await installedFixture(t);
  const result = await f.run(["doctor"], { CLAUDE_CONFIG_DIR: f.claudeHome.toUpperCase() });
  assert.equal(result.code, 0, result.output);
  assert.doesNotMatch(result.stdout, /\[WARN\] Pet hooks config directory/);
});

test("doctor fails when Windows has no WebView2 Evergreen runtime", async t => {
  const f = await installedFixture(t);
  const result = await f.run(["doctor"], { CODEX_DELEGATE_PET_TEST_WEBVIEW2: "missing" });
  assert.equal(result.code, 1, result.output);
  assert.match(result.stdout, /\[FAIL\] Pet WebView2 runtime - .*install.*WebView2 Evergreen runtime/i);
});

test("doctor skips WebView2 off Windows", async t => {
  const f = await installedFixture(t);
  const result = await f.run(["doctor"], {
    CODEX_DELEGATE_TEST_PLATFORM: "linux", CODEX_DELEGATE_PET_TEST_WEBVIEW2: "missing",
  });
  assert.equal(result.code, 0, result.output);
  assert.doesNotMatch(result.stdout, /WebView2/);
});

test("doctor reports obsolete hideNearCursor values as unknown configuration keys", async t => {
  const f = await installedFixture(t);
  for (const hideNearCursor of [false, true, "false"]) {
    writeFileSync(join(f.petRoot, "pet.json"), JSON.stringify({ hideNearCursor }));
    const result = await f.run();
    assert.equal(result.code, 0, result.output);
    assert.match(result.stdout, /\[WARN\] Pet configuration - hideNearCursor: unknown key; ignored/);
  }
});

for (const [description, config, problem] of [
  ["bad JSON", "{", /pet\.json: invalid JSON or object/],
  ["unknown key and out-of-range scale", '{"scale":2,"surprise":true}', /scale:.*0\.3.*1.*surprise: unknown key/],
  ["obsolete nameTags key", '{"nameTags":"false"}', /nameTags: unknown key/],
  ["invalid pets map", '{"pets":[]}', /pets:.*object/],
  ["invalid pet name", '{"pets":{"leader":"../unsafe"}}', /pets\.leader:.*invalid pet name/],
]) {
  test(`doctor warns about ${description} in pet configuration and explains the fallback`, async t => {
    const f = await installedFixture(t);
    writeFileSync(join(f.petRoot, "pet.json"), config);
    const result = await f.run();
    assert.equal(result.code, 0, result.output);
    const warnings = result.stdout.split("\n").filter(line => /\[WARN\] Pet configuration/.test(line));
    assert.equal(warnings.length, 1, result.output);
    assert.match(warnings[0], problem);
    assert.match(warnings[0], /ignored.*default/i);
  });
}

for (const nameTags of [true, false]) {
  test(`doctor reports nameTags ${nameTags} as an unknown configuration key`, async t => {
    const f = await installedFixture(t);
    writeFileSync(join(f.petRoot, "pet.json"), JSON.stringify({ nameTags }));
    const result = await f.run();
    assert.equal(result.code, 0, result.output);
    assert.match(result.stdout, /\[WARN\] Pet configuration - nameTags: unknown key; ignored/);
  });
}

const manifest = { id: "custom", displayName: "Custom", description: "Test pet", spritesheetPath: "sheet.webp" };
for (const [description, fields, sheet, problem] of [
  ["missing", null, null, /package not found/],
  ["bad manifest JSON", "{", null, /invalid manifest JSON/],
  ["missing manifest field", { ...manifest, description: "" }, null, /description.*non-empty string/],
  ["unsafe sheet path", { ...manifest, spritesheetPath: "../sheet.png" }, null, /unsafe spritesheet path/],
  ["missing sheet", manifest, null, /spritesheet missing/],
  ["invalid sheet", manifest, "not an image", /PNG or WebP/],
  ["wrong sheet size", manifest, "small", /1536.*1872/],
  ["opaque sheet", manifest, "opaque", /transparent/],
]) {
  test(`doctor warns per slot for a ${description} pet package and names its source and fallback`, async t => {
    const f = await installedFixture(t);
    writeFileSync(join(f.petRoot, "pet.json"), JSON.stringify({ pets: { leader: "custom", critic: "custom" } }));
    const dir = join(f.codexHome, "pets", "custom");
    if (fields !== null) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "pet.json"), typeof fields === "string" ? fields : JSON.stringify(fields));
      if (sheet !== null) {
        let bytes = sheet;
        if (["small", "opaque"].includes(sheet)) {
          // Independent VP8L header fixtures; don't mutate PNG offsets in bundled WebP bytes.
          bytes = Buffer.alloc(26);
          bytes.write("RIFF"); bytes.writeUInt32LE(18, 4);
          bytes.write("WEBPVP8L", 8); bytes.writeUInt32LE(5, 16); bytes[20] = 0x2f;
          const width = sheet === "small" ? 100 : 1536;
          bytes.writeUInt32LE(((width - 1) | ((1872 - 1) << 14) | (sheet === "opaque" ? 0 : 1 << 28)) >>> 0, 21);
        }
        writeFileSync(join(dir, manifest.spritesheetPath), bytes);
      }
    }
    const result = await f.run();
    assert.equal(result.code, 0, result.output);
    const warnings = result.stdout.split("\n").filter(line => /\[WARN\] Pet packages/.test(line));
    assert.equal(warnings.length, 2, result.output);
    for (const slot of ["leader", "critic"]) {
      const line = warnings.find(line => line.includes(`(${slot})`));
      assert.ok(line, result.output);
      assert.ok(line.includes("custom"), line);
      assert.ok(line.replaceAll("\\", "/").includes(dir.replaceAll("\\", "/")), line);
      assert.match(line, problem);
      assert.match(line, /bundled default.*shown instead/);
    }
    assert.match(result.stdout, /\[OK  \] Pet configuration/);
  });
}

test("doctor reports an unreadable Release as FAIL and continues its checks", async t => {
  const f = await installedFixture(t);
  const packageRoot = join(f.root, "package");
  for (const path of ["bin", "package.json", "install-manifest.json", "src/runner/roles.json", "pet/app/ui/pet-config.mjs"]) {
    cpSync(new URL(`../${path}`, import.meta.url), join(packageRoot, path), { recursive: true });
  }
  f.cli = join(packageRoot, "bin", "cli.mjs");
  const fake = join(f.bin, "fake-codex.cjs");
  writeFileSync(fake, `
if (process.argv.includes("--version")) require("node:fs").writeFileSync(${JSON.stringify(join(packageRoot, "package.json"))}, "{");
${readFileSync(fake, "utf8")}`);
  const result = await f.run();
  assert.equal(result.code, 1, result.output);
  assert.match(result.stdout, /\[FAIL\] Pet bundle - cannot read Release:/);
  assert.match(result.stdout, /\[OK  \] Pet hooks/);
  assert.match(result.stdout, /\[OK  \] Pet port/);
  assert.doesNotMatch(result.output, /Usage:/);
});

test("doctor warns per slot when the spritesheet is a directory", async t => {
  const f = await installedFixture(t);
  writeFileSync(join(f.petRoot, "pet.json"), JSON.stringify({ pets: { leader: "custom", critic: "custom" } }));
  const dir = join(f.codexHome, "pets", "custom");
  mkdirSync(join(dir, manifest.spritesheetPath), { recursive: true });
  writeFileSync(join(dir, "pet.json"), JSON.stringify(manifest));
  const result = await f.run();
  assert.equal(result.code, 0, result.output);
  for (const slot of ["leader", "critic"]) {
    assert.ok(result.stdout.split("\n").some(line => line.includes(`[WARN] Pet packages (${slot})`) && line.includes("bundled default")), result.output);
  }
  assert.match(result.stdout, /Pet port/);
});

test("doctor accepts a valid package from CODEX_HOME", async t => {
  const f = await installedFixture(t);
  writeFileSync(join(f.petRoot, "pet.json"), JSON.stringify({ pets: { leader: "custom" } }));
  const dir = join(f.codexHome, "pets", "custom");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "pet.json"), JSON.stringify(manifest));
  writeFileSync(join(dir, manifest.spritesheetPath), defaultPetFiles[`default-pets/leader/${JSON.parse(defaultPetFiles["default-pets/leader/pet.json"]).spritesheetPath}`]);
  const result = await f.run();
  assert.equal(result.code, 0, result.output);
  assert.match(result.stdout, /\[OK  \] Pet packages/);
  assert.doesNotMatch(result.stdout, /\[WARN\] Pet packages/);
});

for (const status of [200, 503]) {
  test(`doctor recognizes the authenticated pet health identity (HTTP ${status})`, async t => {
    const f = await installedFixture(t);
    const requests = [];
    const server = await listen(t, (req, res) => {
      requests.push({ path: req.url, method: req.method, token: req.headers["x-codex-delegate-pet-token"] });
      res.writeHead(status);
      res.end(JSON.stringify({ app: "codex-delegate-pet", protocol: 1, version, pid: 4321 }));
    });
    const result = await f.run(["doctor"], { CODEX_DELEGATE_PET_PORT: String(server.address().port) });
    assert.equal(result.code, 0, result.output);
    assert.ok(result.stdout.includes(`pet app ${version}, pid 4321`), result.output);
    assert.match(result.stdout, /\[OK  \] Pet port/);
    assert.deepEqual(requests, [{ path: "/health", method: "GET", token: "doctor-test-token" }]);
  });
}

for (const status of [200, 503]) {
  test(`doctor warns when the running app differs from the package's Release (HTTP ${status})`, async t => {
    const f = await installedFixture(t);
    const server = await listen(t, (req, res) => {
      res.writeHead(status);
      res.end(JSON.stringify({ app: "codex-delegate-pet", protocol: 1, version: "0.1.0", pid: 4321 }));
    });
    const result = await f.run(["doctor"], { CODEX_DELEGATE_PET_PORT: String(server.address().port) });
    assert.equal(result.code, 0, result.output);
    assert.match(result.stdout, /\[WARN\] Pet port - .*0\.1\.0.*4321.*install --with-pet/);
    assert.ok(result.stdout.includes(`expected ${version}`), result.output);
    assert.doesNotMatch(result.stdout, /held by something that isn't the pet app/);
  });
}

const identity = { app: "codex-delegate-pet", protocol: 1, version };
for (const [description, body, status = 200] of [
  ["another app", { ...identity, app: "foreign-app" }],
  ["non-JSON", "<html>another server</html>"],
  ["null JSON", "null"],
  ["wrong protocol", { ...identity, protocol: 2 }],
  ["empty version", { ...identity, version: "" }],
  ["missing version", { app: identity.app, protocol: 1 }],
  ["unauthorized response", identity, 401],
  ["oversized response", "x".repeat(9000)],
  ["timeout before headers", null],
  ["timeout during body", "partial"],
]) {
  test(`doctor warns about a port holder with ${description}`, async t => {
    const f = await installedFixture(t);
    const requests = [];
    const server = await listen(t, (req, res) => {
      requests.push(`${req.method} ${req.url}`);
      if (body === null) return;
      res.writeHead(status);
      if (body === "partial") { res.write("{"); return; }
      res.end(typeof body === "string" ? body : JSON.stringify(body));
    });
    const port = server.address().port;
    const started = Date.now();
    const result = await f.run(["doctor"], { CODEX_DELEGATE_PET_PORT: String(port) });
    assert.equal(result.code, 0, result.output);
    assert.ok(result.stdout.includes(`[WARN] Pet port - port ${port} is held by something that isn't the pet app`), result.output);
    assert.deepEqual(requests, ["GET /health"]);
    assert.ok(Date.now() - started < 5000, "health probing must have a short bounded timeout");
  });
}
