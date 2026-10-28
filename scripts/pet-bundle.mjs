#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { zip } from "./zip.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));

try {
  const { values } = parseArgs({ options: {
    exe: { type: "string", default: join(root, "pet/app/src-tauri/target/release/codex-delegate-pet.exe") },
    out: { type: "string", default: "dist" },
    tag: { type: "string" },
  } });
  if (!/^pet-v\d+\.\d+\.\d+$/.test(values.tag ?? "")) {
    throw new Error("--tag must be pet-vX.Y.Z (for example pet-v1.2.3)");
  }
  const entries = {};
  function add(source, destination, directory = false) {
    let stat;
    try { stat = statSync(source); }
    catch (error) {
      if (error.code === "ENOENT") throw new Error(`Missing bundle input: ${source}`);
      throw error;
    }
    if (directory) {
      if (!stat.isDirectory()) throw new Error(`Expected bundle directory: ${source}`);
      for (const name of readdirSync(source).sort()) {
        const path = join(source, name);
        add(path, `${destination}/${name}`, statSync(path).isDirectory());
      }
    } else {
      if (!stat.isFile()) throw new Error(`Expected bundle file: ${source}`);
      entries[destination] = readFileSync(source);
    }
  }
  add(resolve(values.exe), "codex-delegate-pet.exe");
  add(join(root, "pet/client/pet-client.mjs"), "client/pet-client.mjs");
  add(join(root, "pet/client"), "client", true);
  add(join(root, "pet/hook/leader-hook.mjs"), "hook/leader-hook.mjs");
  add(join(root, "pet/app/ui/assets"), "default-pets", true);
  const bytes = zip(entries);
  const asset = "codex-delegate-pet-windows-x64.zip";
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const pin = JSON.stringify({ tag: values.tag, asset, sha256, version: values.tag.slice(5) }, null, 2) + "\n";
  const out = resolve(values.out);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, asset), bytes);
  writeFileSync(join(out, `${asset}.sha256`), `${sha256}  ${asset}\n`);
  writeFileSync(join(out, "pet-pin.json"), pin);
  process.stdout.write(pin);
} catch (error) {
  console.error(`pet-bundle: ${error.message}`);
  process.exitCode = 1;
}
