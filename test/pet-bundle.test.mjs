import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { unpackZip } from "../bin/zip.mjs";
import { release } from "./helpers/pet-release.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const script = join(root, "scripts", "pet-bundle.mjs");
const notices = join(root, "test/fixtures/pet-notices.txt");
const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

function assertNothingWritten(directory) {
  assert.deepEqual(readdirSync(directory, { recursive: true }), []);
}

async function publishedRelease(t, options = {}) {
  const work = mkdtempSync(join(tmpdir(), "published Release "));
  t.after(() => rmSync(work, { recursive: true, force: true }));
  const env = { ...process.env, HOME: work, USERPROFILE: work };
  const remote = await release(t, { env }, options);
  const run = (args = ["--check-published", version]) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args,
      "--exe", join(work, "missing.exe"), "--out", join(work, "dist"),
    ], { cwd: work, env, windowsHide: true });
    let stdout = "", stderr = "";
    child.stdout.on("data", chunk => stdout += chunk);
    child.stderr.on("data", chunk => stderr += chunk);
    child.on("error", reject);
    child.on("close", code => resolve({ code, stdout, stderr }));
  });
  return { ...remote, work, run, baseUrl: env.CODEX_DELEGATE_PET_BASE_URL };
}

test("bundle CLI checks a good published Release without reading bundle inputs or writing files", async t => {
  const r = await publishedRelease(t);
  const result = await r.run();
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout.trim().split(/\r?\n/).length, 1, result.stdout);
  assert.ok(result.stdout.includes(`Release v${version} passed`), result.stdout);
  assert.ok(result.stdout.includes(r.bundle.sha256), result.stdout);
  assert.deepEqual(r.requests, r.paths);
  assertNothingWritten(r.work);
});

test("bundle CLI checks the requested published Release even when package.json has another version", async t => {
  assert.notEqual(version, "9.9.9");
  const r = await publishedRelease(t, { version: "9.9.9" });
  const result = await r.run(["--check-published", "9.9.9"]);
  assert.equal(result.code, 0, result.stderr);
  assert.ok(result.stdout.includes("Release v9.9.9 passed"), result.stdout);
  assert.ok(result.stdout.includes(r.bundle.sha256), result.stdout);
  assert.deepEqual(r.requests, [
    "/v9.9.9/codex-delegate-pet-windows-x64.zip.sha256",
    "/v9.9.9/codex-delegate-pet-windows-x64.zip",
  ]);
  assertNothingWritten(r.work);
});

for (const target of ["zip", "checksum"]) {
  test(`bundle CLI names the missing ${target} file when checking a published Release`, async t => {
    const r = await publishedRelease(t, { [`${target}Status`]: 404 });
    const result = await r.run();
    assert.notEqual(result.code, 0, result.stderr);
    assert.match(result.stderr, /^pet-bundle: /);
    const path = target === "zip" ? r.bundlePath : r.checksumPath;
    assert.ok(result.stderr.includes(`(${r.baseUrl}${path})`), result.stderr);
    assert.deepEqual(r.requests, target === "zip" ? r.paths : [r.checksumPath]);
    assert.equal(result.stdout, "");
    assertNothingWritten(r.work);
  });
}

test("bundle CLI refuses invalid published Release versions before any request", async t => {
  const r = await publishedRelease(t);
  for (const invalid of ["", `v${version}`, "0.4", "0.4.0.1", "0.4.0-beta.1", "0.4.0+build", "01.2.3", "1.02.3", "1.2.03", " 0.4.0", "0.4.0\n", "../0.4.0"]) {
    const result = await r.run([`--check-published=${invalid}`]);
    assert.notEqual(result.code, 0, JSON.stringify(invalid));
    assert.match(result.stderr, /^pet-bundle: .*--check-published.*bare X\.Y\.Z version/);
    assert.equal(result.stdout, "");
    assert.deepEqual(r.requests, [], JSON.stringify(invalid));
    assertNothingWritten(r.work);
  }
  const missing = await r.run(["--check-published"]);
  assert.notEqual(missing.code, 0);
  assert.match(missing.stderr, /^pet-bundle: .*--check-published.*argument/);
  assert.deepEqual(r.requests, []);
  assertNothingWritten(r.work);
});

test("bundle CLI refuses published Release checks combined with local check flags before any request", async t => {
  const r = await publishedRelease(t);
  for (const flags of [["--check"], ["--expect-tag", `v${version}`], ["--check", "--expect-tag", `v${version}`]]) {
    const result = await r.run(["--check-published", version, ...flags]);
    assert.notEqual(result.code, 0, flags.join(" "));
    assert.match(result.stderr, /^pet-bundle: .*--check-published.*cannot be combined.*--check.*--expect-tag/);
    assert.equal(result.stdout, "");
    assert.deepEqual(r.requests, []);
    assertNothingWritten(r.work);
  }
});

test("bundle CLI fails when the requested published Release is not served", async t => {
  const r = await publishedRelease(t);
  const result = await r.run(["--check-published", "9.9.9"]);
  assert.notEqual(result.code, 0, result.stderr);
  const path = "/v9.9.9/codex-delegate-pet-windows-x64.zip.sha256";
  assert.ok(result.stderr.includes(`(${r.baseUrl}${path})`), result.stderr);
  assert.match(result.stderr, /^pet-bundle: Release v9\.9\.9/);
  assert.deepEqual(r.requests, [path]);
  assert.equal(result.stdout, "");
  assertNothingWritten(r.work);
});

test("bundle CLI rejects malformed published Release checksum lines before requesting the zip", async t => {
  const r = await publishedRelease(t);
  const { sha256, asset } = r.bundle;
  for (const checksum of [
    `${sha256} ${asset}\n`,
    `${sha256}  other.zip\n`,
    `${sha256.slice(1)}  ${asset}\n`,
    `${sha256}  ${asset}\n${sha256}  ${asset}\n`,
    `${sha256}  ${asset}\n\n`,
    `${"g".repeat(64)}  ${asset}\n`,
  ]) {
    r.options.checksum = checksum;
    r.requests.length = 0;
    const result = await r.run();
    assert.notEqual(result.code, 0, JSON.stringify(checksum));
    assert.match(result.stderr, /^pet-bundle: Invalid pet checksum file/);
    assert.ok(result.stderr.includes(`(${r.baseUrl}${r.checksumPath})`), result.stderr);
    assert.deepEqual(r.requests, [r.checksumPath]);
    assert.equal(result.stdout, "");
    assertNothingWritten(r.work);
  }
});

test("bundle CLI rejects a published Release whose zip does not match its checksum", async t => {
  const r = await publishedRelease(t, { sha256: "0".repeat(64) });
  const result = await r.run();
  assert.notEqual(result.code, 0, result.stderr);
  assert.match(result.stderr, /^pet-bundle: Pet checksum mismatch \(SHA-256\)/);
  assert.deepEqual(r.requests, r.paths);
  assert.equal(result.stdout, "");
  assertNothingWritten(r.work);
});

test("bundle CLI accepts the installer's published Release checksum line forms", async t => {
  const r = await publishedRelease(t);
  const { sha256, asset } = r.bundle;
  for (const checksum of [
    `${sha256.toUpperCase()}  ${asset}\n`,
    `${sha256}  ${asset}\r\n`,
    `${sha256}  ${asset}`,
  ]) {
    r.options.checksum = checksum;
    r.requests.length = 0;
    const result = await r.run();
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stderr, "");
    assert.equal(result.stdout, `Release v${version} passed (SHA-256 ${sha256})\n`);
    assert.deepEqual(r.requests, r.paths);
    assertNothingWritten(r.work);
  }
});

test("bundle CLI packages the app, client, hook and default pets with a Release checksum", t => {
  const work = mkdtempSync(join(tmpdir(), "pet bundle "));
  t.after(() => rmSync(work, { recursive: true, force: true }));
  const exe = join(work, "fake.exe");
  writeFileSync(exe, "fake executable, never run");
  const out = join(work, "dist");
  const args = [script, "--exe", exe, "--notices", notices, "--out", out];
  const result = spawnSync(process.execPath, args, { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const asset = "codex-delegate-pet-windows-x64.zip";
  const bytes = readFileSync(join(out, asset));
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  assert.deepEqual(readdirSync(out).sort(), [asset, `${asset}.sha256`]);
  for (const text of [sha256, join(out, asset), join(out, `${asset}.sha256`)]) assert.ok(result.stdout.includes(text), result.stdout);
  assert.equal(readFileSync(join(out, `${asset}.sha256`), "utf8"), `${sha256}  ${asset}\n`);
  const unpacked = join(work, "unpacked");
  unpackZip(bytes, unpacked);
  assert.deepEqual(readFileSync(join(unpacked, "THIRD-PARTY-NOTICES")), readFileSync(notices));
  assert.equal(readFileSync(join(unpacked, "codex-delegate-pet.exe"), "utf8"), "fake executable, never run");
  for (const dir of ["client", "hook", "default-pets"]) {
    const source = join(root, "pet", dir === "default-pets" ? "app/ui/assets" : dir);
    for (const path of readdirSync(source, { recursive: true, withFileTypes: true }).filter(entry => entry.isFile())) {
      // parentPath is named path on Node 18/20.
      const parent = path.parentPath ?? path.path;
      const relative = join(parent, path.name).slice(source.length + 1);
      assert.deepEqual(readFileSync(join(unpacked, dir, relative)), readFileSync(join(source, relative)), `${dir}/${relative}`);
    }
  }
  const again = spawnSync(process.execPath, args, { encoding: "utf8" });
  assert.equal(again.status, 0, again.stderr);
  assert.deepEqual(readFileSync(join(out, asset)), bytes, "same inputs produce identical zip bytes");
});

test("bundle CLI refuses a missing input before writing release artifacts", t => {
  const work = mkdtempSync(join(tmpdir(), "missing pet bundle "));
  t.after(() => rmSync(work, { recursive: true, force: true }));
  const missing = join(work, "missing.exe");
  const result = spawnSync(process.execPath, [script, "--exe", missing, "--notices", notices, "--out", work], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.ok(result.stderr.includes(`Missing bundle input: ${missing}`), result.stderr);
  assertNothingWritten(work);
});

test("bundle CLI refuses omitted, missing or stub notices before writing anything", t => {
  const work = mkdtempSync(join(tmpdir(), "invalid notices bundle "));
  t.after(() => rmSync(work, { recursive: true, force: true }));
  const exe = join(work, "fake.exe");
  writeFileSync(exe, "fake executable, never run");
  const args = [script, "--exe", exe, "--out", join(work, "dist")];
  const stub = join(work, "stub.txt");
  const marker = readFileSync(join(root, "pet/notices/development-stub.txt"), "utf8").split(/\r?\n/)[0];
  writeFileSync(stub, `Preamble\r\n${marker}\r\nTrailing text\r\n`);
  for (const noticesArgs of [[], ["--notices", join(work, "missing.txt")], ["--notices", stub]]) {
    const before = readdirSync(work);
    const result = spawnSync(process.execPath, [...args, ...noticesArgs], { encoding: "utf8" });
    assert.notEqual(result.status, 0, result.stderr);
    assert.match(result.stderr, /notices|stub|Missing bundle input/);
    assert.deepEqual(readdirSync(work), before);
  }
});

test("bundle CLI requires --expect-tag with --check and writes nothing when omitted", t => {
  const work = mkdtempSync(join(tmpdir(), "missing Release tag "));
  t.after(() => rmSync(work, { recursive: true, force: true }));
  const result = spawnSync(process.execPath, [script, "--check", "--out", join(work, "dist")], { encoding: "utf8" });
  assert.notEqual(result.status, 0, result.stderr);
  assert.match(result.stderr, /--check requires --expect-tag/);
  assertNothingWritten(work);
});

test("bundle CLI checks the package's Release tag before reading inputs or writing artifacts", t => {
  const work = mkdtempSync(join(tmpdir(), "check Release tag "));
  t.after(() => rmSync(work, { recursive: true, force: true }));
  const args = [script, "--out", join(work, "dist"), "--exe", join(work, "missing.exe")];
  const result = spawnSync(process.execPath, [...args, "--check", "--expect-tag", `v${version}`], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assertNothingWritten(work);
  for (const flags of [["--expect-tag", "v999.0.0"], ["--check", "--expect-tag", "v999.0.0"], ["--tag", `v${version}`]]) {
    const result = spawnSync(process.execPath, [...args, ...flags], { encoding: "utf8" });
    assert.notEqual(result.status, 0, result.stderr);
    assert.match(result.stderr, /tag/);
    assert.doesNotMatch(result.stderr, /Missing bundle input|notices.*required/);
    assertNothingWritten(work);
    if (!flags.includes("--tag")) assert.ok(result.stderr.includes(`v${version}`), result.stderr);
  }
});
