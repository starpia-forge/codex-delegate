// Tray and app icon from the pixel maps in app/src-tauri/icons/tray.json. Writes icon.ico
// (16-64 px from the shown maps, 256 px from the vector master art/tray-icon/shown.svg) and
// icon.png next to the maps, plus an SVG preview of every map to art/tray-icon/.
import { readFileSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import sharp from "sharp";

const icons = new URL("./app/src-tauri/icons/", import.meta.url);
const artwork = new URL("./art/tray-icon/", import.meta.url);
const art = JSON.parse(readFileSync(new URL("tray.json", icons), "utf8"));

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const bytes = Buffer.concat([Buffer.from(type), data]);
  const size = Buffer.alloc(4), crc = Buffer.alloc(4);
  size.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(bytes));
  return Buffer.concat([size, bytes, crc]);
}
function png(size, rgba) {
  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) rgba.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
}

// A pose's map enlarged by a whole number, as top-down RGBA.
function pixels(pose, map, scale) {
  const size = map * scale, rgba = Buffer.alloc(size * size * 4);
  art[pose][map].forEach((row, y) => [...row].forEach((key, x) => {
    if (key === ".") return;
    const colour = art.palette[pose][key];
    const pixel = [1, 3, 5].map((i) => parseInt(colour.slice(i, i + 2), 16)).concat(255);
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      rgba.set(pixel, ((y * scale + dy) * size + x * scale + dx) * 4);
    }
  }));
  return rgba;
}

// 32-bit DIB icon entry: bottom-up BGRA, then a 1-bit mask of the transparent pixels.
function dib(size, rgba) {
  const stride = Math.ceil(size / 32) * 4;
  const header = Buffer.alloc(40), colour = Buffer.alloc(size * size * 4), mask = Buffer.alloc(stride * size);
  header.writeUInt32LE(40); header.writeInt32LE(size, 4); header.writeInt32LE(size * 2, 8);
  header.writeUInt16LE(1, 12); header.writeUInt16LE(32, 14); header.writeUInt32LE(colour.length + mask.length, 20);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const from = (y * size + x) * 4, row = size - 1 - y;
    colour.set([rgba[from + 2], rgba[from + 1], rgba[from], rgba[from + 3]], (row * size + x) * 4);
    if (rgba[from + 3] === 0) mask[row * stride + (x >> 3)] |= 0x80 >> (x & 7);
  }
  return Buffer.concat([header, colour, mask]);
}
function ico(entries) {
  const directory = Buffer.alloc(6 + 16 * entries.length);
  directory.writeUInt16LE(1, 2); directory.writeUInt16LE(entries.length, 4);
  let offset = directory.length;
  entries.forEach(({ size, data }, i) => {
    const at = 6 + 16 * i;
    directory[at] = directory[at + 1] = size % 256; // 256 is stored as 0
    directory.writeUInt16LE(1, at + 4); directory.writeUInt16LE(32, at + 6);
    directory.writeUInt32LE(data.length, at + 8); directory.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });
  return Buffer.concat([directory, ...entries.map(({ data }) => data)]);
}

function preview(pose, map) {
  const runs = new Map();
  art[pose][map].forEach((row, y) => {
    for (let x = 0; x < row.length;) {
      let end = x + 1;
      while (row[end] === row[x]) end++;
      if (row[x] !== ".") {
        const fill = art.palette[pose][row[x]];
        runs.set(fill, (runs.get(fill) ?? "") + `M${x} ${y}h${end - x}v1h-${end - x}z`);
      }
      x = end;
    }
  });
  const paths = [...runs].map(([fill, d]) => `<path fill="${fill}" d="${d}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${map}" height="${map}" viewBox="0 0 ${map} ${map}" shape-rendering="crispEdges">${paths}</svg>\n`;
}

// Entries above 24 px are exact multiples of a hand-drawn map, so Windows can shrink
// the large app icon (32 px at 100% scaling) back to the drawn pixels.
const entries = [[16, 1], [20, 1], [24, 1], [16, 2], [20, 2], [24, 2], [16, 4]]
  .map(([map, scale]) => ({ size: map * scale, data: dib(map * scale, pixels("shown", map, scale)) }));
const { data: master, info } = await sharp(readFileSync(new URL("shown.svg", artwork)))
  .resize(256, 256).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
if (info.width !== 256 || info.height !== 256 || info.channels !== 4) throw new Error("unexpected master render");
entries.push({ size: 256, data: png(256, master) });
writeFileSync(new URL("icon.ico", icons), ico(entries));
writeFileSync(new URL("icon.png", icons), png(256, master));
for (const pose of ["shown", "hidden"]) {
  for (const map of Object.keys(art[pose])) writeFileSync(new URL(`${pose}-${map}.svg`, artwork), preview(pose, map));
}
console.log(`wrote icon.ico (${entries.map(({ size }) => size).join(", ")} px), icon.png and ${Object.keys(art.shown).length * 2} previews`);
