import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";
import sharp from "sharp";

const icons = new URL("../pet/app/src-tauri/icons/", import.meta.url);
const artwork = new URL("../pet/art/tray-icon/", import.meta.url);
const art = JSON.parse(await readFile(new URL("tray.json", icons), "utf8"));
const SIZES = ["16", "20", "24", "28", "32", "40", "48"];

function entries(ico) {
  assert.equal(ico.readUInt16LE(2), 1, "icon type");
  return Array.from({ length: ico.readUInt16LE(4) }, (_, i) => {
    const at = 6 + 16 * i, offset = ico.readUInt32LE(at + 12);
    return { size: ico[at] || 256, data: ico.subarray(offset, offset + ico.readUInt32LE(at + 8)) };
  });
}

test("every tray map is square at its size and holds only coverage", () => {
  for (const pose of ["shown", "hidden"]) {
    assert.deepEqual(Object.keys(art[pose]), SIZES, pose);
    for (const [map, rows] of Object.entries(art[pose])) {
      assert.equal(rows.length, Number(map), `${pose} ${map}`);
      for (const row of rows) assert.match(row, new RegExp(`^[.0-9a-f]{${map}}$`), `${pose} ${map}`);
    }
  }
});

test("the tray maps are the line art rendered at each size", async () => {
  for (const pose of ["shown", "hidden"]) for (const map of SIZES) {
    const sized = new URL(`${pose}-${map}.svg`, artwork);
    const source = readFileSync(existsSync(sized) ? sized : new URL(`${pose}.svg`, artwork), "utf8");
    const svg = source.replace(/width="\d+" height="\d+"/, `width="${map}" height="${map}"`);
    const rgba = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer();
    const size = Number(map);
    const rows = Array.from({ length: size }, (_, y) => Array.from({ length: size }, (_, x) => {
      const level = Math.round(rgba[(y * size + x) * 4 + 3] / 17);
      return level ? level.toString(16) : ".";
    }).join(""));
    assert.deepEqual(rows, art[pose][map], `${pose} ${map}: run node pet/generate-tray-icon.mjs`);
  }
});

test("the line art uses white lines and no fill", async () => {
  for (const file of ["shown.svg", "shown-16.svg", "hidden.svg", "hidden-16.svg", "hidden-24.svg"]) {
    const svg = await readFile(new URL(file, artwork), "utf8");
    assert.match(svg, /<g fill="none" stroke="#fff"/, file);
    assert.doesNotMatch(svg.replace('fill="none"', "").replace('stroke="#fff"', ""), /\b(fill|stroke)="/, file);
  }
});

test("the app icon is a DIB at each small size and a 256 px PNG, opaque at its centre", async () => {
  const list = entries(await readFile(new URL("icon.ico", icons)));
  assert.deepEqual(list.map(({ size }) => size), [16, 20, 24, 32, 40, 48, 64, 256]);
  for (const { size, data } of list.slice(0, -1)) {
    assert.equal(data.readUInt32LE(0), 40, `${size} px entry is a DIB`);
    assert.deepEqual([data.readInt32LE(4), data.readInt32LE(8), data.readUInt16LE(14)], [size, size * 2, 32]);
    assert.equal(data[40 + (Math.floor(size / 2) * size + Math.floor(size / 2)) * 4 + 3], 255, `${size} px tile`);
  }
  const big = list.at(-1).data;
  assert.ok(big.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), "256 px entry is a PNG");
  assert.deepEqual([big.readUInt32BE(16), big.readUInt32BE(20), big[24], big[25]], [256, 256, 8, 6], "256 px RGBA");
  assert.ok((await readFile(new URL("icon.png", icons))).equals(Buffer.from(big)), "icon.png is the 256 px entry");
});
