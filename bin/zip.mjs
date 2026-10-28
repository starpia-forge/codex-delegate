import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { inflateRawSync } from "node:zlib";

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Read central-directory sizes (also works with data-descriptor ZIPs). No ZIP64,
// encryption, symlinks or methods other than stored/deflate are accepted.
export function unpackZip(bytes, destination) {
  const invalid = message => { throw new Error(`Invalid pet zip: ${message}`); };
  const signature = (offset, value) => offset >= 0 && offset + 4 <= bytes.length && bytes.readUInt32LE(offset) === value;
  let end = bytes.length - 22;
  for (; end >= Math.max(0, bytes.length - 65557); end--) {
    if (signature(end, 0x06054b50) && end + 22 + bytes.readUInt16LE(end + 20) === bytes.length) break;
  }
  if (end < 0 || !signature(end, 0x06054b50)) invalid("missing end of central directory");
  const count = bytes.readUInt16LE(end + 10);
  const size = bytes.readUInt32LE(end + 12);
  let cursor = bytes.readUInt32LE(end + 16);
  if (bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6)
    || bytes.readUInt16LE(end + 8) !== count || count === 0xffff
    || cursor + size !== end) invalid("unsupported central directory");
  const names = new Set();
  const files = new Set();
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || !signature(cursor, 0x02014b50)) invalid("bad central entry");
    const flags = bytes.readUInt16LE(cursor + 8);
    const method = bytes.readUInt16LE(cursor + 10);
    const crc = bytes.readUInt32LE(cursor + 16);
    const packedSize = bytes.readUInt32LE(cursor + 20);
    const unpackedSize = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const next = cursor + 46 + nameLength + bytes.readUInt16LE(cursor + 30) + bytes.readUInt16LE(cursor + 32);
    const mode = bytes.readUInt32LE(cursor + 38) >>> 16;
    const local = bytes.readUInt32LE(cursor + 42);
    if (next > end || flags & 1 || ![0, 8].includes(method) || (mode & 0xf000) === 0xa000
      || bytes.readUInt16LE(cursor + 34)) invalid("unsupported entry");
    const name = bytes.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8").replaceAll("\\", "/");
    const parts = name.replace(/\/$/, "").split("/");
    // Windows also interprets colons, trailing dots/spaces and device names.
    if (!name || name.startsWith("/") || parts.some(part => !part || part === "." || part === ".."
      || /[:\x00-\x1f<>"|?*]/.test(part) || /[. ]$/.test(part)
      || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) invalid(`unsafe path: ${name}`);
    const key = parts.join("/").toLowerCase();
    if (names.has(key)) invalid(`duplicate path: ${name}`);
    names.add(key);
    if (local + 30 > bytes.readUInt32LE(end + 16) || !signature(local, 0x04034b50)) invalid("bad local entry");
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    if (start + packedSize > bytes.readUInt32LE(end + 16)) invalid("truncated entry");
    const packed = bytes.subarray(start, start + packedSize);
    const data = method === 8 ? inflateRawSync(packed) : packed;
    if (data.length !== unpackedSize || crc32(data) !== crc) invalid(`corrupt entry: ${name}`);
    const path = join(destination, ...parts);
    if (name.endsWith("/")) mkdirSync(path, { recursive: true });
    else {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, data, { flag: "wx" });
      files.add(parts.join("/"));
    }
    cursor = next;
  }
  if (cursor !== end) invalid("central directory size mismatch");
  for (const required of ["codex-delegate-pet.exe", "client/pet-client.mjs", "hook/leader-hook.mjs"]) {
    if (!files.has(required)) invalid(`missing required file ${required}`);
  }
}
