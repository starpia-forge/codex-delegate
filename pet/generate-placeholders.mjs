// Original placeholder artwork; no image library or Python required.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const width = 1536, height = 1872, cellWidth = 192, cellHeight = 208;
const counts = [6, 8, 8, 4, 5, 8, 6, 6, 6];
const colors = { leader: [230, 140, 60], researcher: [90, 160, 240], critic: [200, 80, 200],
  implementer: [250, 200, 50], "computer-user": [80, 200, 150] };

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
const out = fileURLToPath(new URL("./app/ui/assets/", import.meta.url));
for (const [role, color] of Object.entries(colors)) {
  const pixels = Buffer.alloc(height * (width * 4 + 1));
  function ellipse(cx, cy, rx, ry, rgba) {
    for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(height - 1, cy + ry); y++) {
      for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(width - 1, cx + rx); x++) {
        if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) {
          const offset = y * (width * 4 + 1) + 1 + x * 4;
          pixels.set(rgba, offset);
        }
      }
    }
  }
  for (let row = 0; row < counts.length; row++) for (let frame = 0; frame < counts[row]; frame++) {
    const phase = frame / counts[row] * Math.PI * 2;
    const x = frame * cellWidth + 96, floor = row * cellHeight + 187;
    const bounce = row === 4 ? Math.abs(Math.sin(phase)) * 36 : Math.abs(Math.sin(phase)) * 8;
    const y = row * cellHeight + 122 - bounce;
    ellipse(x, floor, 40, 9, [0, 0, 0, 65]);
    ellipse(x - 24, floor - 13 - Math.sin(phase) * 5, 16, 9, [...color, 255]);
    ellipse(x + 24, floor - 13 + Math.sin(phase) * 5, 16, 9, [...color, 255]);
    ellipse(x, y, 45, 48, [...(row === 5 ? [220, 70, 70] : color), 255]);
    ellipse(x - 15, y - 8, 5, frame === 2 && row === 0 ? 2 : 7, [35, 30, 35, 255]);
    ellipse(x + 15, y - 8, 5, frame === 2 && row === 0 ? 2 : 7, [35, 30, 35, 255]);
    if (row === 3) ellipse(x + 52, y - 22 + Math.sin(phase) * 14, 12, 12, [...color, 255]);
    if (row === 7) for (let k = 0; k < 3; k++) {
      const a = phase + k * Math.PI * 2 / 3;
      ellipse(x + Math.cos(a) * 25, y - 63 + Math.sin(a) * 7, 5, 5, [255, 255, 255, 210]);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0))]);
  const dir = join(out, role);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "spritesheet.png"), png);
  writeFileSync(join(dir, "pet.json"), JSON.stringify({ id: `placeholder-${role}`, displayName: `${role} placeholder`,
    description: "Original development placeholder for codex-delegate", spritesheetPath: "spritesheet.png" }, null, 2) + "\n");
  console.log(`wrote ${role}: ${width}×${height}`);
}
