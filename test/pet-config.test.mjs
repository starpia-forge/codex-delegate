import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { bundledPetName, resolvePets } from "../pet/app/ui/pet-config.mjs";

const slots = ["leader", "researcher", "critic", "implementer", "computer-user"];
const bundledRoot = fileURLToPath(new URL("../pet/app/ui/assets/", import.meta.url)).replaceAll("\\", "/").replace(/\/$/, "");
const bundledManifests = Object.fromEntries(await Promise.all(slots.map(async slot =>
  [slot, JSON.parse(await readFile(join(bundledRoot, slot, "pet.json"), "utf8"))])));
const bundled = name => ({ name, source: "bundled", dir: `${bundledRoot}/${name}`,
  manifest: bundledManifests[name], sheetPath: `${bundledRoot}/${name}/${bundledManifests[name].spritesheetPath}`, mime: "image/webp" });
const manifest = { id: "custom", displayName: "Custom pet", description: "Test pet", spritesheetPath: "spritesheet.webp" };
const realSheet = () => readFile(bundled("leader").sheetPath);

async function packageAt(h, base, name, fields = manifest, sheet) {
  const dir = join(base, "pets", name);
  await h.put(join(dir, "pet.json"), JSON.stringify(fields));
  await h.put(join(dir, fields.spritesheetPath ?? manifest.spritesheetPath), sheet ?? await realSheet());
  return dir;
}

function png({ width = 1536, height = 1872, color = 6, trns = false, lateTrns = false } = {}) {
  const chunk = (type, data = Buffer.alloc(0)) => {
    const size = Buffer.alloc(4);
    size.writeUInt32BE(data.length);
    return Buffer.concat([size, Buffer.from(type), data, Buffer.alloc(4)]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = color;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr),
    ...(trns ? [chunk("tRNS", Buffer.from([0]))] : []), chunk("IDAT"),
    ...(lateTrns ? [chunk("tRNS", Buffer.from([0]))] : []), chunk("IEND")]);
}

function webp(type, { width = 1536, height = 1872, alpha = true } = {}) {
  const data = Buffer.alloc(type === "VP8L" ? 5 : 10);
  if (type === "VP8X") {
    data[0] = alpha ? 0x10 : 0;
    data.writeUIntLE(width - 1, 4, 3); data.writeUIntLE(height - 1, 7, 3);
  } else if (type === "VP8L") {
    data[0] = 0x2f;
    data.writeUInt32LE(((width - 1) | ((height - 1) << 14) | (alpha ? 1 << 28 : 0)) >>> 0, 1);
  } else {
    data.set([0x9d, 0x01, 0x2a], 3);
    data.writeUInt16LE(width, 6); data.writeUInt16LE(height, 8);
  }
  const header = Buffer.alloc(20);
  header.write("RIFF"); header.writeUInt32LE(12 + data.length + (data.length % 2), 4);
  header.write("WEBP", 8); header.write(type, 12); header.writeUInt32LE(data.length, 16);
  return Buffer.concat([header, data, Buffer.alloc(data.length % 2)]);
}

async function harness(t) {
  const root = await mkdtemp(join(tmpdir(), "pet-config-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const home = join(root, "home"), codexHome = join(root, "codex");
  const reader = async path => { try { return await readFile(path); } catch { return null; } };
  const put = async (path, value) => {
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, value);
  };
  return { root, home, codexHome, put,
    config: value => put(join(home, ".codex-delegate", "pet.json"), JSON.stringify(value)),
    resolve: (options = {}) => resolvePets({ home, codexHome, readFile: reader, bundledRoot, readBundledFile: reader, ...options }),
  };
}

test("no configuration uses all five bundled slot pets at scale 0.6", async t => {
  const h = await harness(t);
  const result = await h.resolve();
  assert.deepEqual(result, { scale: 0.6,
    pets: Object.fromEntries(slots.map(slot => [slot, bundled(slot)])), issues: [] });
  const characters = { leader: "momo", researcher: "mikan", critic: "sion", implementer: "shamiko", "computer-user": "lico" };
  for (const [slot, character] of Object.entries(characters)) {
    const pet = result.pets[slot];
    assert.equal(pet.sheetPath, `${bundledRoot}/${slot}/spritesheet.webp`);
    assert.equal(pet.mime, "image/webp");
    assert.equal(pet.manifest.displayName, character);
    assert.equal(pet.manifest.description,
      (await readFile(new URL("../pet/notices/fan-art-notice.txt", import.meta.url), "utf8")).trim());
    assert.deepEqual((await readdir(pet.dir)).sort(), ["pet.json", pet.manifest.spritesheetPath].sort());
  }
});

test("configuration accepts inclusive scale bounds and reports ignored values", async t => {
  const h = await harness(t);
  for (const scale of [0.3, 0.6, 1.0]) {
    await h.config({ scale });
    assert.equal((await h.resolve()).scale, scale);
  }
  for (const scale of [0.29, 1.01, "0.8", null, true, [], {}]) {
    await h.config({ scale });
    const result = await h.resolve();
    assert.equal(result.scale, 0.6);
    assert.deepEqual(result.issues, [{ code: "scale-out-of-range", key: "scale" }]);
  }
  await h.put(join(h.home, ".codex-delegate", "pet.json"), '{"scale":1e999}');
  assert.equal((await h.resolve()).issues[0].code, "scale-out-of-range");
  for (const raw of ['{"scale":NaN}', '{', 'null', '[]', '"oops"']) {
    await h.put(join(h.home, ".codex-delegate", "pet.json"), raw);
    const result = await h.resolve();
    assert.equal(result.scale, 0.6);
    assert.deepEqual(result.pets, Object.fromEntries(slots.map(slot => [slot, bundled(slot)])));
    assert.equal(result.issues[0].code, "config-invalid");
  }
});

test("configuration accepts pets for user roles and roles reserved for future use", async t => {
  const h = await harness(t);
  await h.config({ pets: { "release-manager": "custom", "future-role2": "leader" } });
  await packageAt(h, h.codexHome, "custom");
  const result = await h.resolve();
  assert.equal(result.pets["release-manager"]?.name, "custom");
  assert.equal(result.pets["release-manager"]?.source, "codex");
  assert.deepEqual(result.pets["future-role2"], bundled("leader"));
  assert.deepEqual(result.issues, []);
});

test("user roles fall back to the bundled implementer when artwork is absent or invalid", async t => {
  const h = await harness(t);
  assert.equal(bundledPetName("release-manager"), "implementer");
  for (const slot of slots) assert.equal(bundledPetName(slot), slot);
  for (const role of ["release-manager", "constructor"]) for (const name of ["missing", "broken", "../unsafe"]) {
    await h.config({ pets: { [role]: name } });
    if (name === "broken") await packageAt(h, h.codexHome, name, { ...manifest, id: "" });
    const result = await h.resolve();
    assert.deepEqual(result.pets[role], bundled("implementer"));
    assert.equal(result.issues.length, 1);
  }
});

test("configuration ignores invalid keys and unsafe names, and accepts bundled assignments", async t => {
  const h = await harness(t);
  await h.config({ extra: 42, pets: { researcher: "critic", "bad/role": "leader", critic: "../bad",
    leader: "", implementer: 3, "computer-user": "nested/pet" } });
  const result = await h.resolve();
  assert.deepEqual(result.pets.researcher, bundled("critic"));
  assert.deepEqual(result.pets.critic, bundled("critic"));
  assert.deepEqual(result.issues.map(i => [i.code, i.key]), [
    ["unknown-key", "extra"], ["unknown-key", "pets.bad/role"], ["pet-name", "pets.critic"],
    ["pet-name", "pets.leader"], ["pet-name", "pets.implementer"], ["pet-name", "pets.computer-user"],
  ]);
  for (const name of [".", "..", "a..b", "a\\b", "   ", "C:pet", "bad\u0000name"]) {
    await h.config({ pets: { leader: name } });
    assert.deepEqual((await h.resolve()).issues, [{ code: "pet-name", key: "pets.leader" }]);
  }
  for (const pets of [null, [], "critic", 42]) {
    await h.config({ pets });
    assert.deepEqual((await h.resolve()).issues, [{ code: "pets-invalid", key: "pets" }]);
  }
  await h.config({ pets: { leader: "unknown" } });
  const missing = await h.resolve();
  assert.deepEqual(missing.pets.leader, bundled("leader"));
  assert.deepEqual(missing.issues, [{ code: "pet-not-found", slot: "leader", name: "unknown" }]);
});

test("local pets override Codex pets; explicit and default Codex homes are supported", async t => {
  const h = await harness(t);
  await h.config({ pets: { researcher: "custom", critic: "codex-only", leader: "default-home" } });
  const local = await packageAt(h, join(h.home, ".codex-delegate"), "custom");
  await packageAt(h, h.codexHome, "custom");
  const codex = await packageAt(h, h.codexHome, "codex-only");
  await packageAt(h, join(h.home, ".codex"), "default-home");
  const result = await h.resolve();
  assert.equal(result.pets.researcher.source, "codex-delegate");
  assert.equal(result.pets.researcher.dir.replaceAll("\\", "/"), local.replaceAll("\\", "/"));
  assert.equal(result.pets.researcher.name, "custom");
  assert.deepEqual(result.pets.researcher.manifest, manifest);
  assert.equal(result.pets.researcher.sheetPath.replaceAll("\\", "/"), join(local, "spritesheet.webp").replaceAll("\\", "/"));
  assert.equal(result.pets.researcher.mime, "image/webp");
  assert.deepEqual(result.pets.researcher.fallback, bundled("researcher"));
  assert.equal(result.pets.critic.source, "codex");
  assert.equal(result.pets.critic.dir.replaceAll("\\", "/"), codex.replaceAll("\\", "/"));
  assert.deepEqual(result.pets.leader, bundled("leader"));
  assert.equal((await h.resolve({ codexHome: undefined })).pets.leader.source, "codex");
  // Default slot names can also be overridden without any pets map.
  await h.config({});
  await packageAt(h, h.codexHome, "implementer");
  assert.equal((await h.resolve()).pets.implementer.source, "codex");
});

test("an invalid present manifest falls back per slot without trying Codex", async t => {
  const h = await harness(t);
  await h.config({ pets: { researcher: "custom", critic: "researcher" } });
  const dir = await packageAt(h, join(h.home, ".codex-delegate"), "custom");
  await packageAt(h, h.codexHome, "custom");
  const failures = [["{", "manifest-json"], ["null", "manifest-field"], ["[]", "manifest-field"]];
  for (const field of Object.keys(manifest)) for (const value of [undefined, "", "  ", 7, null]) {
    failures.push([JSON.stringify({ ...manifest, [field]: value }), "manifest-field", field]);
  }
  for (const [raw, code, field] of failures) {
    await h.put(join(dir, "pet.json"), raw);
    const result = await h.resolve();
    assert.deepEqual(result.pets.researcher, bundled("researcher"), raw);
    assert.deepEqual(result.pets.critic, bundled("researcher"));
    assert.equal(result.issues.length, 1);
    assert.equal(result.issues[0].code, code, raw);
    assert.equal(result.issues[0].slot, "researcher");
    if (field) assert.equal(result.issues[0].field, field);
  }
});

test("sheet paths stay in their package and a missing sheet falls back without trying Codex", async t => {
  const h = await harness(t);
  await h.config({ pets: { researcher: "custom" } });
  const dir = await packageAt(h, join(h.home, ".codex-delegate"), "custom");
  await packageAt(h, h.codexHome, "custom");
  for (const path of ["../sheet.png", "nested/../../sheet.png", "nested\\..\\sheet.png", "/sheet.png",
    "\\sheet.png", "C:\\sheet.png", "C:sheet.png", "//server/sheet.png", "https://site/sheet.png", "a\u0000b"]) {
    await h.put(join(dir, "pet.json"), JSON.stringify({ ...manifest, spritesheetPath: path }));
    const result = await h.resolve();
    assert.deepEqual(result.pets.researcher, bundled("researcher"), path);
    assert.equal(result.issues[0].code, "sheet-path", path);
  }
  await h.put(join(dir, "pet.json"), JSON.stringify({ ...manifest, spritesheetPath: "missing.png" }));
  const result = await h.resolve();
  assert.deepEqual(result.pets.researcher, bundled("researcher"));
  assert.equal(result.issues[0].code, "sheet-missing");
  // Nested relative paths, including Windows separators, remain valid.
  await h.put(join(dir, "pet.json"), JSON.stringify({ ...manifest, spritesheetPath: "art\\sheet.webp" }));
  await h.put(join(dir, "art", "sheet.webp"), await realSheet());
  assert.equal((await h.resolve()).pets.researcher.source, "codex-delegate");
});

test("a folder without a manifest is absent and allows the next folder or bundled fallback", async t => {
  const h = await harness(t);
  await h.config({ pets: { researcher: "custom" } });
  await h.put(join(h.home, ".codex-delegate", "pets", "custom", "spritesheet.webp"), await realSheet());
  const missing = await h.resolve();
  assert.deepEqual(missing.pets.researcher, bundled("researcher"));
  assert.equal(missing.issues[0].code, "pet-not-found");
  await packageAt(h, h.codexHome, "custom");
  assert.equal((await h.resolve()).pets.researcher.source, "codex");
});

test("PNG header validation rejects format, size and opaque sheets with per-slot fallback", async t => {
  const h = await harness(t);
  await h.config({ pets: { researcher: "custom" } });
  const dir = await packageAt(h, join(h.home, ".codex-delegate"), "custom");
  await packageAt(h, h.codexHome, "custom");
  for (const [sheet, code] of [
    [Buffer.from("not an image"), "sheet-format"], [Buffer.alloc(0), "sheet-format"],
    [png().subarray(0, 25), "sheet-format"], [png({ width: 1535 }), "sheet-size"],
    [png({ height: 1871 }), "sheet-size"], [png({ color: 2 }), "sheet-not-transparent"],
    [png({ color: 3, lateTrns: true }), "sheet-not-transparent"],
  ]) {
    await h.put(join(dir, manifest.spritesheetPath), sheet);
    const result = await h.resolve();
    assert.deepEqual(result.pets.researcher, bundled("researcher"));
    assert.equal(result.issues[0].code, code);
  }
  for (const sheet of [png(), png({ color: 4 }), png({ color: 2, trns: true }), png({ color: 3, trns: true })]) {
    await h.put(join(dir, manifest.spritesheetPath), sheet);
    const result = await h.resolve();
    assert.equal(result.pets.researcher.source, "codex-delegate");
    assert.equal(result.pets.researcher.mime, "image/png");
    assert.deepEqual(result.issues, []);
  }
});

test("WebP magic and all three headers enforce dimensions and transparency regardless of extension", async t => {
  const h = await harness(t);
  await h.config({ pets: { researcher: "custom" } });
  const dir = await packageAt(h, join(h.home, ".codex-delegate"), "custom", { ...manifest, spritesheetPath: "spritesheet.png" });
  await packageAt(h, h.codexHome, "custom");
  for (const type of ["VP8X", "VP8L"]) {
    await h.put(join(dir, "spritesheet.png"), webp(type));
    const result = await h.resolve();
    assert.equal(result.pets.researcher.source, "codex-delegate", type);
    assert.equal(result.pets.researcher.mime, "image/webp");
    assert.deepEqual(result.issues, []);
  }
  for (const [sheet, code] of [
    [webp("VP8 "), "sheet-not-transparent"],
    [webp("VP8X", { alpha: false }), "sheet-not-transparent"],
    [webp("VP8L", { alpha: false }), "sheet-not-transparent"],
    ...["VP8X", "VP8L", "VP8 "].flatMap(type => [
      [webp(type, { width: 192 }), "sheet-size"], [webp(type, { height: 208 }), "sheet-size"],
      [webp(type).subarray(0, 23), "sheet-format"],
    ]),
  ]) {
    await h.put(join(dir, "spritesheet.png"), sheet);
    const result = await h.resolve();
    assert.deepEqual(result.pets.researcher, bundled("researcher"));
    assert.equal(result.issues[0].code, code);
  }
});

test("all five real bundled fan-art packages pass the resolver's package validation", async t => {
  const h = await harness(t);
  for (const slot of slots) {
    const asset = new URL(`../pet/app/ui/assets/${slot}/`, import.meta.url);
    const dir = join(h.home, ".codex-delegate", "pets", slot);
    await h.put(join(dir, "pet.json"), await readFile(new URL("pet.json", asset)));
    const sheet = bundledManifests[slot].spritesheetPath;
    await h.put(join(dir, sheet), await readFile(new URL(sheet, asset)));
  }
  const result = await h.resolve();
  for (const slot of slots) {
    assert.equal(result.pets[slot].source, "codex-delegate", slot);
    assert.equal(result.pets[slot].name, slot);
    assert.equal(result.pets[slot].mime, "image/webp");
  }
  assert.deepEqual(result.issues, []);
});

test("bundled manifests determine sheet paths and MIME types independent of filename", async t => {
  const h = await harness(t);
  const result = await h.resolve({ bundledRoot: "./embedded", readBundledFile: async path => {
    if (path.endsWith("/pet.json")) return Buffer.from(JSON.stringify({ ...manifest, spritesheetPath: "art/default.data" }));
    if (path.endsWith("/art/default.data")) return webp("VP8L");
    return null;
  } });
  assert.deepEqual(result.issues, []);
  for (const slot of slots) {
    assert.equal(result.pets[slot].sheetPath, `./embedded/${slot}/art/default.data`);
    assert.equal(result.pets[slot].mime, "image/webp");
  }
});

test("a custom sheet with a valid header that fails decoding resolves to its bundled slot", async t => {
  const h = await harness(t);
  await h.config({ pets: { researcher: "custom" } });
  const invalidSheet = png(); // Valid dimensions and alpha, but an empty IDAT cannot decode.
  await packageAt(h, h.codexHome, "custom", manifest, invalidSheet);
  assert.equal((await h.resolve()).pets.researcher.source, "codex");
  let decoded;
  const result = await h.resolve({ decodeSheet: async (bytes, mime) => {
    decoded = { bytes, mime };
    throw new Error("image decoder rejected empty IDAT");
  } });
  assert.deepEqual(decoded, { bytes: invalidSheet, mime: "image/png" });
  assert.deepEqual(result.pets.researcher, bundled("researcher"));
  assert.equal(result.pets.researcher.sheetPath, `${bundledRoot}/researcher/spritesheet.webp`);
  assert.equal(result.pets.researcher.mime, "image/webp");
  assert.deepEqual(result.issues.map(issue => [issue.code, issue.slot]), [["sheet-decode", "researcher"]]);
});

test("placeholder generation replaces each slot with exactly its manifest and referenced sheet, keeping the artwork", async t => {
  const h = await harness(t);
  const originalSheets = await Promise.all(slots.map(slot => readFile(bundled(slot).sheetPath)));
  const script = join(h.root, "generate-placeholders.mjs");
  await h.put(script, await readFile(new URL("../pet/generate-placeholders.mjs", import.meta.url)));
  const generatedRoot = join(h.root, "app/ui/assets");
  for (const slot of slots) await h.put(join(generatedRoot, slot, "old-art.webp"), "stale artwork");
  execFileSync(process.execPath, [script], { windowsHide: true });
  const result = await h.resolve({ bundledRoot: generatedRoot, readBundledFile: async path => {
    try { return await readFile(path); } catch { return null; }
  } });
  assert.deepEqual(result.issues, []);
  for (const slot of slots) {
    const pet = result.pets[slot];
    assert.deepEqual((await readdir(pet.dir)).sort(), ["pet.json", pet.manifest.spritesheetPath].sort());
    assert.deepEqual((await readdir(bundled(slot).dir)).sort(), ["pet.json", bundledManifests[slot].spritesheetPath].sort());
    assert.equal(pet.mime, "image/png");
    assert.deepEqual(pet.manifest, { id: `placeholder-${slot}`, displayName: `${slot} placeholder`,
      description: "Original development placeholder for codex-delegate", spritesheetPath: "spritesheet.png" });
    assert.deepEqual(await readFile(bundled(slot).sheetPath), originalSheets[slots.indexOf(slot)]);
    assert.deepEqual(JSON.parse(await readFile(join(bundled(slot).dir, "pet.json"), "utf8")), bundledManifests[slot]);
  }
});
