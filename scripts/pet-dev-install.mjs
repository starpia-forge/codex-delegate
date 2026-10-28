#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const home = process.argv[2];
if (!home) {
  console.error("Usage: node scripts/pet-dev-install.mjs <home-dir>");
  process.exit(2);
}
const root = fileURLToPath(new URL("../", import.meta.url));
const executable = join(root, "pet/app/src-tauri/target/release/codex-delegate-pet.exe");
const client = join(root, "pet/client/pet-client.mjs");
const hook = join(root, "pet/hook/leader-hook.mjs");
const pets = join(root, "pet/app/ui/assets");
for (const path of [executable, client, hook, pets]) {
  if (!existsSync(path)) {
    console.error(`Missing ${path}. Build the app and generate placeholders first (see pet/README.md).`);
    process.exit(1);
  }
}
const dest = join(resolve(home), ".codex-delegate", "pet");
mkdirSync(join(dest, "client"), { recursive: true });
mkdirSync(join(dest, "hook"), { recursive: true });
cpSync(executable, join(dest, "codex-delegate-pet.exe"));
cpSync(client, join(dest, "client", "pet-client.mjs"));
cpSync(hook, join(dest, "hook", "leader-hook.mjs"));
cpSync(pets, join(dest, "default-pets"), { recursive: true });
console.log(`Installed app: ${join(dest, "codex-delegate-pet.exe")}`);
console.log(`Installed client: ${join(dest, "client", "pet-client.mjs")}`);
console.log(`Installed hook: ${join(dest, "hook", "leader-hook.mjs")}`);
console.log(`Installed placeholder pets: ${join(dest, "default-pets")}`);
console.log("Start the app manually before running a worker; use this home for HOME and USERPROFILE.");
