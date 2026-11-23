import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function snapshot(dir) {
  return Object.fromEntries(readdirSync(dir, { withFileTypes: true }).map(entry => [entry.name,
    entry.isDirectory() ? snapshot(join(dir, entry.name)) : readFileSync(join(dir, entry.name)).toString("base64")
  ]));
}
