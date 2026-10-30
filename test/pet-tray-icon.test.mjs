import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const icons = new URL("../pet/app/src-tauri/icons/", import.meta.url);
const artwork = new URL("../pet/art/tray-icon/", import.meta.url);
const art = JSON.parse(await readFile(new URL("tray.json", icons), "utf8"));

// Expected RGBA of a pose's map enlarged by a whole number; transparent pixels are all zero.
function expected(pose, map, scale) {
  const size = map * scale, rgba = Buffer.alloc(size * size * 4);
  art[pose][map].forEach((row, y) => [...row].forEach((key, x) => {
    if (key === ".") return;
    const pixel = [1, 3, 5].map((i) => parseInt(art.palette[pose][key].slice(i, i + 2), 16)).concat(255);
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      rgba.set(pixel, ((y * scale + dy) * size + x * scale + dx) * 4);
    }
  }));
  return rgba;
}

function entries(ico) {
  assert.equal(ico.readUInt16LE(2), 1, "icon type");
  return Array.from({ length: ico.readUInt16LE(4) }, (_, i) => {
    const at = 6 + 16 * i, offset = ico.readUInt32LE(at + 12);
    return { size: ico[at] || 256, data: ico.subarray(offset, offset + ico.readUInt32LE(at + 8)) };
  });
}

// Top-down RGBA of a 32-bit DIB entry, with transparent pixels zeroed.
function decode({ size, data }) {
  assert.equal(data.readUInt32LE(0), 40, `${size} px entry is a DIB`);
  assert.deepEqual([data.readInt32LE(4), data.readInt32LE(8), data.readUInt16LE(14)], [size, size * 2, 32]);
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const from = 40 + ((size - 1 - y) * size + x) * 4;
    if (data[from + 3]) rgba.set([data[from + 2], data[from + 1], data[from], data[from + 3]], (y * size + x) * 4);
  }
  return rgba;
}

test("every tray map is square at its size and only uses its pose's palette", () => {
  for (const pose of ["shown", "hidden"]) {
    assert.deepEqual(Object.keys(art[pose]), ["16", "20", "24"], pose);
    for (const [map, rows] of Object.entries(art[pose])) {
      assert.equal(rows.length, Number(map), `${pose} ${map}`);
      for (const row of rows) {
        assert.equal(row.length, Number(map), `${pose} ${map}: ${row}`);
        for (const key of row.replaceAll(".", "")) assert.match(art.palette[pose][key] ?? "", /^#[0-9a-f]{6}$/, `${pose} ${map}: ${key}`);
      }
    }
  }
});

test("the app icon is the shown tray art, drawn sizes and exact multiples, plus a 256 px PNG", async () => {
  const list = entries(await readFile(new URL("icon.ico", icons)));
  assert.deepEqual(list.map(({ size }) => size), [16, 20, 24, 32, 40, 48, 64, 256]);
  const drawn = { 16: [16, 1], 20: [20, 1], 24: [24, 1], 32: [16, 2], 40: [20, 2], 48: [24, 2], 64: [16, 4] };
  for (const entry of list.slice(0, -1)) {
    assert.ok(decode(entry).equals(expected("shown", ...drawn[entry.size])), `${entry.size} px entry differs from the shown map`);
  }
  const big = list.at(-1).data;
  assert.ok(big.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), "256 px entry is a PNG");
  assert.deepEqual([big.readUInt32BE(16), big.readUInt32BE(20), big[24], big[25]], [256, 256, 8, 6], "256 px RGBA");
});

test("the SVG previews draw exactly the tray maps", async () => {
  for (const pose of ["shown", "hidden"]) for (const map of ["16", "20", "24"]) {
    const svg = await readFile(new URL(`${pose}-${map}.svg`, artwork), "utf8");
    const rows = Array.from({ length: Number(map) }, () => Array(Number(map)).fill("."));
    const key = Object.fromEntries(Object.entries(art.palette[pose]).map(([letter, colour]) => [colour, letter]));
    for (const [, fill, d] of svg.matchAll(/<path fill="(#[0-9a-f]{6})" d="([^"]+)"\/>/g)) {
      for (const [, x, y, w] of d.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
        for (let i = 0; i < Number(w); i++) rows[Number(y)][Number(x) + i] = key[fill];
      }
    }
    // Colours shared by two letters (hidden L and T) compare by colour, not letter.
    const colour = (letter) => (letter === "." ? "." : art.palette[pose][letter]);
    assert.deepEqual(rows.map((row) => row.map(colour).join()), art[pose][map].map((row) => [...row].map(colour).join()), `${pose}-${map}.svg`);
  }
});
