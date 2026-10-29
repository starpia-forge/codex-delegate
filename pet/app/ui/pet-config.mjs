// Shared by the webview and Node callers. All filesystem access is injected.
const slots = ["leader", "researcher", "critic", "implementer", "computer-user"];
export const bundledPetName = role => slots.includes(role) ? role : "implementer";
const join = (...parts) => parts.map((part, i) => String(part).replace(/\\/g, "/")
  .replace(i === 0 ? /\/+$/g : /^\/+|\/+$/g, "")).join("/");
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);

function sheetHeader(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (at, length) => String.fromCharCode(...bytes.subarray(at, at + length));
  if (bytes.length >= 33 && [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b)
    && view.getUint32(8) === 13 && text(12, 4) === "IHDR") {
    let alpha = bytes[25] === 4 || bytes[25] === 6;
    for (let at = 33; at + 12 <= bytes.length;) {
      const size = view.getUint32(at), type = text(at + 4, 4);
      if (at + 12 + size > bytes.length) return null;
      if (type === "IDAT" || type === "IEND") break;
      if (type === "tRNS" && size > 0) alpha = true;
      at += 12 + size;
    }
    return { width: view.getUint32(16), height: view.getUint32(20), alpha, mime: "image/png" };
  }
  if (bytes.length >= 20 && text(0, 4) === "RIFF" && text(8, 4) === "WEBP") {
    const end = view.getUint32(4, true) + 8;
    if (end > bytes.length || end < 20) return null;
    const uint24 = at => bytes[at] + bytes[at + 1] * 256 + bytes[at + 2] * 65536;
    for (let at = 12; at + 8 <= end;) {
      const type = text(at, 4), size = view.getUint32(at + 4, true), data = at + 8;
      if (data + size > end) return null;
      if (type === "VP8X" && size === 10) {
        return { width: uint24(data + 4) + 1, height: uint24(data + 7) + 1,
          alpha: !!(bytes[data] & 0x10), mime: "image/webp" };
      }
      if (type === "VP8L" && size >= 5 && bytes[data] === 0x2f) {
        const bits = view.getUint32(data + 1, true);
        if (bits >>> 29) return null; // Only version zero is defined.
        return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1,
          alpha: !!(bits & 0x10000000), mime: "image/webp" };
      }
      if (type === "VP8 " && size >= 10 && text(data + 3, 3) === "\u009d\u0001\u002a") {
        return { width: view.getUint16(data + 6, true) & 0x3fff,
          height: view.getUint16(data + 8, true) & 0x3fff, alpha: false, mime: "image/webp" };
      }
      at = data + size + (size % 2);
    }
  }
  return null;
}

async function validatePackage(dir, bytes, readFile, decodeSheet) {
  if (bytes === null) return { issue: { code: "manifest-missing" } };
  let manifest;
  try { manifest = JSON.parse(new TextDecoder().decode(bytes)); }
  catch { return { issue: { code: "manifest-json" } }; }
  if (!object(manifest)) return { issue: { code: "manifest-field" } };
  for (const field of ["id", "displayName", "description", "spritesheetPath"]) {
    if (typeof manifest[field] !== "string" || !manifest[field].trim()) {
      return { issue: { code: "manifest-field", field } };
    }
  }
  const path = manifest.spritesheetPath.replace(/\\/g, "/");
  if (path.startsWith("/") || /[:\u0000-\u001f]/.test(path) || path.split("/").includes("..")) {
    return { issue: { code: "sheet-path" } };
  }
  const sheetPath = join(dir, path);
  const sheet = await readFile(sheetPath);
  if (sheet === null) return { issue: { code: "sheet-missing" } };
  const header = sheetHeader(sheet);
  if (!header) return { issue: { code: "sheet-format" } };
  if (header.width !== 1536 || header.height !== 1872) return { issue: { code: "sheet-size" } };
  if (!header.alpha) return { issue: { code: "sheet-not-transparent" } };
  if (decodeSheet) {
    try { await decodeSheet(sheet, header.mime); }
    catch { return { issue: { code: "sheet-decode" } }; }
  }
  return { manifest, sheetPath, mime: header.mime };
}

// Bundled paths belong to the caller: embedded URLs in the app, installed
// default-pets paths in doctor. Both readers return bytes or null for missing files.
export async function resolvePets({ home, codexHome, readFile, bundledRoot, readBundledFile, decodeSheet }) {
  const result = { scale: 0.6, pets: {}, issues: [] };
  const defaults = Object.create(null);
  for (const name of slots) {
    const dir = join(bundledRoot, name);
    const { issue, ...artwork } = await validatePackage(dir, await readBundledFile(join(dir, "pet.json")), readBundledFile);
    defaults[name] = { name, source: "bundled", dir, ...artwork };
    if (issue) result.issues.push({ ...issue, slot: name, name, source: "bundled", dir });
  }
  const bundled = name => defaults[name];
  let config = {};
  const bytes = await readFile(join(home, ".codex-delegate", "pet.json"));
  if (bytes !== null) {
    try {
      config = JSON.parse(new TextDecoder().decode(bytes));
      if (!object(config)) throw new Error("configuration must be an object");
    } catch {
      result.issues.push({ code: "config-invalid" });
      config = {};
    }
  }
  if (Object.hasOwn(config, "scale")) {
    if (Number.isFinite(config.scale) && config.scale >= 0.3 && config.scale <= 1) result.scale = config.scale;
    else result.issues.push({ code: "scale-out-of-range", key: "scale" });
  }
  for (const key of Object.keys(config)) {
    if (key !== "scale" && key !== "pets") result.issues.push({ code: "unknown-key", key });
  }
  const names = Object.create(null);
  const configuredSlots = new Set(slots);
  if (Object.hasOwn(config, "pets")) {
    if (!object(config.pets)) result.issues.push({ code: "pets-invalid", key: "pets" });
    else for (const [slot, name] of Object.entries(config.pets)) {
      const key = `pets.${slot}`;
      // Role names use lower-case letters, digits and hyphens, starting with a
      // letter. Unknown names are accepted for roles added after this release.
      if (!/^[a-z][a-z0-9-]*$/.test(slot)) { result.issues.push({ code: "unknown-key", key }); continue; }
      configuredSlots.add(slot);
      if (typeof name !== "string" || !name.trim() || /[/\\:\u0000-\u001f]/.test(name)
        || name.includes("..") || name === ".") result.issues.push({ code: "pet-name", key });
      else names[slot] = name;
    }
  }
  for (const slot of configuredSlots) {
    result.pets[slot] = bundled(bundledPetName(slot));
    const name = names[slot] ?? slot;
    let present = false;
    for (const [source, base] of [["codex-delegate", join(home, ".codex-delegate")],
      ["codex", codexHome ?? join(home, ".codex")]]) {
      const dir = join(base, "pets", name);
      const bytes = await readFile(join(dir, "pet.json"));
      if (bytes === null) continue;
      present = true;
      const { issue, ...artwork } = await validatePackage(dir, bytes, readFile, decodeSheet);
      if (issue) result.issues.push({ ...issue, slot, name, source, dir });
      else result.pets[slot] = { name, source, dir, ...artwork, fallback: bundled(bundledPetName(slot)) };
      break;
    }
    if (present) continue;
    if (slots.includes(name)) result.pets[slot] = bundled(name);
    else if (names[slot]) result.issues.push({ code: "pet-not-found", slot, name });
  }
  return result;
}
