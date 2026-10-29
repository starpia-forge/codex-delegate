// Development-only conversion; the app, tests and releases use the committed outputs.
// Run: node pet/generate-default-pets.mjs
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import sharp from "sharp";

const cellWidth = 192, cellHeight = 208, columns = 8, sourceRows = 11, petRows = 9;
const characters = { leader: "momo", researcher: "mikan", critic: "sion", implementer: "shamiko", "computer-user": "lico" };
const sourceRoot = fileURLToPath(new URL("./art/machikado-mazoku/", import.meta.url));
const out = fileURLToPath(new URL("./app/ui/assets/", import.meta.url));
const notice = (await readFile(new URL("./notices/fan-art-notice.txt", import.meta.url), "utf8")).trim();

for (const [slot, character] of Object.entries(characters)) {
  const source = join(sourceRoot, `${character}.png`);
  const image = sharp(source);
  const metadata = await image.metadata();
  if (metadata.format !== "png" || metadata.width !== columns * cellWidth || metadata.height !== sourceRows * cellHeight) {
    throw new Error(`${source}: expected a 1536 x 2288 PNG (8 columns, 11 rows of 208 px)`);
  }
  const sheet = await image
    .extract({ left: 0, top: 0, width: columns * cellWidth, height: petRows * cellHeight })
    .webp({ lossless: true })
    .toBuffer();
  const dir = join(out, slot);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "spritesheet.webp"), sheet);
  await writeFile(join(dir, "pet.json"), JSON.stringify({
    id: `machikado-mazoku-${character}`, displayName: character,
    description: notice, spritesheetPath: "spritesheet.webp",
  }, null, 2) + "\n");
  console.log(`wrote ${slot}: ${character}, 1536×1872, ${sheet.length} bytes`);
}
