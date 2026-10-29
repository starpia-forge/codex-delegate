import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomInt } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { fakeCodex } from "./helpers/fake-codex.mjs";
import { unusedPetPort } from "./helpers/pet-release.mjs";

const repo = fileURLToPath(new URL("../", import.meta.url));

function run(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, timeout: 45000, ...options });
    let stdout = "", stderr = "";
    child.stdout.on("data", chunk => stdout += chunk);
    child.stderr.on("data", chunk => stderr += chunk);
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code !== 0) reject(new Error(`${command} exited ${code ?? signal}\n${stdout}\n${stderr}`));
      else resolve(stdout);
    });
  });
}

async function listen(t, handler) {
  const server = createServer(handler);
  // Avoid fetch's blocked low ports and Windows-reserved dynamic port ranges.
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
      if (attempt >= 31 || !["EADDRINUSE", "EACCES"].includes(error.code)) throw error;
    }
  }
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return server.address().port;
}

test("the packed package installs a current generated runner that reports a successful worker to the pet", { timeout: 60000 }, async t => {
  const work = mkdtempSync(join(tmpdir(), "package smoke "));
  t.after(() => rmSync(work, { recursive: true, force: true }));
  const { home, codexHome, env } = fakeCodex(work, `
const fs = require("node:fs");
const args = process.argv.slice(2);
if (args.includes("--version")) console.log("codex-cli test");
else if (args.join(" ") === "login status") console.log("Logged in");
else {
  process.stdin.resume();
  process.stdin.on("end", () => {
    fs.writeFileSync(args[args.indexOf("-o") + 1], "Packed worker result");
  });
}
`);
  Object.assign(env, {
    CLAUDE_CONFIG_DIR: join(home, ".claude"),
    CODEX_DELEGATE_TEST_PLATFORM: "win32",
    CODEX_DELEGATE_PET_TEST_WEBVIEW2: "present",
    CODEX_DELEGATE_PET_PORT: await unusedPetPort(t),
    CLAUDE_PID: "43210",
    CLAUDE_CODE_SESSION_ID: "package-smoke",
    npm_config_cache: join(work, "npm-cache"),
  });
  const windows = process.platform === "win32";
  const packed = JSON.parse(await run(
    windows ? `npm.cmd pack --json --pack-destination "${work}" --offline` : "npm",
    windows ? [] : ["pack", "--json", "--pack-destination", work, "--offline"],
    { cwd: repo, env, shell: windows },
  ))[0];
  const files = packed.files.map(file => file.path);
  for (const required of ["pet-pin.json", "bin/cli.mjs", "bin/pet.mjs", "bin/zip.mjs", "pet/app/ui/pet-config.mjs",
    "skills/claude/codex-implement/scripts/codex-run.mjs"]) {
    assert.ok(files.includes(required), `packed package is missing ${required}`);
  }
  assert.ok(!files.some(file => file.startsWith("node_modules/") || file.startsWith("pet/art/")
    || /^pet\/generate-.*\.mjs$/.test(file)), "npm package must not ship the artwork sources or development generators and encoder");
  const extracted = join(work, "extracted");
  mkdirSync(extracted);
  await run("tar", ["-xzf", packed.filename, "-C", "extracted"], { cwd: work, env });
  const pkg = join(extracted, "package");
  const packedManifest = JSON.parse(readFileSync(join(pkg, "package.json"), "utf8"));
  for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) {
    assert.ok(!Object.hasOwn(packedManifest[field] ?? {}, "sharp"), "the encoder must remain a development dependency only");
  }
  assert.deepEqual(readFileSync(join(pkg, "pet-pin.json")), readFileSync(join(repo, "pet-pin.json")));
  // build.mjs copies src/runner directly into each authored skill's scripts/.
  const packedScripts = join(pkg, "skills/claude/codex-implement/scripts");
  for (const file of readdirSync(join(repo, "src/runner"))) {
    assert.deepEqual(readFileSync(join(packedScripts, file)), readFileSync(join(repo, "src/runner", file)),
      `stale generated runner file: ${file}; regenerate skills before release`);
  }

  const exe = join(work, "fake.exe"), bundleDir = join(work, "bundle");
  const notices = join(repo, "test/fixtures/pet-notices.txt");
  writeFileSync(exe, "fake executable, never run");
  await run(process.execPath, [join(repo, "scripts/pet-bundle.mjs"), "--exe", exe,
    "--notices", notices, "--out", bundleDir, "--tag", "pet-v1.2.3"], { env });
  const pinPath = join(bundleDir, "pet-pin.json");
  const pin = JSON.parse(readFileSync(pinPath, "utf8"));
  const bytes = readFileSync(join(bundleDir, pin.asset)), downloads = [];
  const releasePort = await listen(t, (req, res) => {
    downloads.push(req.url);
    if (req.url !== `/${pin.tag}/${pin.asset}`) { res.writeHead(404); res.end(); return; }
    res.end(bytes);
  });
  Object.assign(env, {
    CODEX_DELEGATE_PET_TEST_PIN: pinPath,
    CODEX_DELEGATE_PET_BASE_URL: `http://127.0.0.1:${releasePort}`,
  });
  await run(process.execPath, [join(pkg, "bin/cli.mjs"), "install", "--scope", "user",
    "--agent", "claude-code", "--with-pet"], { cwd: work, env });
  assert.deepEqual(downloads, [`/${pin.tag}/${pin.asset}`]);
  assert.deepEqual(readFileSync(join(home, ".codex-delegate/pet/THIRD-PARTY-NOTICES")), readFileSync(notices));
  assert.ok(!files.some(file => file.startsWith("pet/app/ui/assets/")), "npm package must not supply doctor's bundled assets");
  writeFileSync(join(codexHome, "models_cache.json"), JSON.stringify({ models: [
    { slug: "gpt-6-astra", supported_reasoning_levels: [{ effort: "medium" }] },
    { slug: "gpt-6.1-sol", supported_reasoning_levels: [{ effort: "high" }] },
    { slug: "gpt-6-luna", supported_reasoning_levels: [{ effort: "max" }] },
  ] }));
  const doctor = await run(process.execPath, [join(pkg, "bin/cli.mjs"), "doctor"], { cwd: work, env });
  assert.match(doctor, /\[OK  \] Pet packages - valid/);
  assert.doesNotMatch(doctor, /\[WARN\] Pet packages/);
  const token = readFileSync(join(home, ".codex-delegate/pet-state/token"), "utf8").trim();
  assert.match(token, /^[0-9a-f]{64}$/);
  const events = [];
  const petPort = await listen(t, (req, res) => {
    if (req.headers["x-codex-delegate-pet-token"] !== token) { res.writeHead(401); res.end(); return; }
    if (req.url === "/health") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ app: "codex-delegate-pet", protocol: 1, version: pin.version }));
    } else if (req.url === "/event" && req.method === "POST") {
      let body = "";
      req.on("data", chunk => body += chunk);
      req.on("end", () => { events.push(JSON.parse(body)); res.end("{}"); });
    } else { res.writeHead(404); res.end(); }
  });
  env.CODEX_DELEGATE_PET_PORT = String(petPort);
  const task = join(work, "packed-task");
  mkdirSync(task);
  const prompt = join(task, "prompt.md");
  writeFileSync(prompt, "Do the task");
  await run(process.execPath, [join(home, ".claude/skills/codex-implement/scripts/codex-run.mjs"),
    "implementer", "--prompt-file", prompt, "--cwd", work], { cwd: work, env });
  assert.equal(readFileSync(join(task, "result.md"), "utf8"), "Packed worker result");
  assert.deepEqual(events.map(event => event.type), ["start", "end"]);
  assert.equal(events[1].outcome, "success");
  assert.match(events[0].worker, /^[\da-f-]{36}$/);
  assert.equal(events[1].worker, events[0].worker);
  for (const [index, event] of events.entries()) {
    assert.equal(event.team, "43210");
    assert.equal(event.session, "package-smoke");
    assert.equal(event.role, "implementer");
    assert.equal(event.label, "packed-task");
    assert.equal(event.seq, index + 1);
  }
});
