import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { unpackZip } from "../bin/zip.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const script = join(root, "scripts", "pet-bundle.mjs");
const notices = join(root, "test/fixtures/pet-notices.txt");

test("bundle CLI packages the app, client, hook and default pets with a matching release pin", t => {
  const work = mkdtempSync(join(tmpdir(), "pet bundle "));
  t.after(() => rmSync(work, { recursive: true, force: true }));
  const exe = join(work, "fake.exe");
  writeFileSync(exe, "fake executable, never run");
  const out = join(work, "dist");
  const args = [script, "--exe", exe, "--notices", notices, "--out", out, "--tag", "pet-v1.2.3"];
  const result = spawnSync(process.execPath, args, { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const asset = "codex-delegate-pet-windows-x64.zip";
  const bytes = readFileSync(join(out, asset));
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const pin = { tag: "pet-v1.2.3", asset, sha256, version: "1.2.3" };
  assert.deepEqual(JSON.parse(readFileSync(join(out, "pet-pin.json"), "utf8")), pin);
  assert.deepEqual(JSON.parse(result.stdout), pin);
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
  const result = spawnSync(process.execPath, [script, "--exe", missing, "--notices", notices, "--out", work, "--tag", "pet-v1.2.3"], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.ok(result.stderr.includes(`Missing bundle input: ${missing}`), result.stderr);
  assert.deepEqual(readdirSync(work), []);
});

test("bundle CLI refuses omitted, missing or stub notices before writing anything", t => {
  const work = mkdtempSync(join(tmpdir(), "invalid notices bundle "));
  t.after(() => rmSync(work, { recursive: true, force: true }));
  const exe = join(work, "fake.exe");
  writeFileSync(exe, "fake executable, never run");
  const args = [script, "--exe", exe, "--out", join(work, "dist"), "--tag", "pet-v1.2.3"];
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
