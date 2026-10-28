#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const home = process.argv[2];
if (!home) {
  console.error("Usage: node scripts/pet-dev-install.mjs <home-dir>");
  process.exit(2);
}
const root = fileURLToPath(new URL("../", import.meta.url));
const executable = join(root, "pet/app/src-tauri/target/release/codex-delegate-pet.exe");
const client = join(root, "pet/client");
const pets = join(root, "pet/app/ui/assets");
for (const path of [executable, client, pets]) {
  if (!existsSync(path)) {
    console.error(`Missing ${path}. Build the app and generate placeholders first (see pet/README.md).`);
    process.exit(1);
  }
}
const dest = join(resolve(home), ".codex-delegate", "pet");
const state = join(resolve(home), ".codex-delegate", "pet-state");
mkdirSync(state, { recursive: true });
try { writeFileSync(join(state, "token"), randomBytes(32).toString("hex"), { flag: "wx", mode: 0o600 }); }
catch (error) { if (error.code !== "EEXIST") throw error; }
mkdirSync(join(dest, "client"), { recursive: true });
cpSync(executable, join(dest, "codex-delegate-pet.exe"));
cpSync(client, join(dest, "client"), { recursive: true });
cpSync(pets, join(dest, "default-pets"), { recursive: true });
console.log(`Installed app: ${join(dest, "codex-delegate-pet.exe")}`);
console.log(`Installed client: ${join(dest, "client", "pet-client.mjs")}`);
console.log(`Installed placeholder pets: ${join(dest, "default-pets")}`);
console.log(`Pet state: ${state}`);
console.log("The first worker event starts the app automatically; use this home for HOME and USERPROFILE.");
