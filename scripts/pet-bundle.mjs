#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { downloadPetRelease, readPetRelease } from "../bin/pet.mjs";
import { zip } from "./zip.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));

try {
  const { values } = parseArgs({ options: {
    exe: { type: "string", default: join(root, "pet/app/src-tauri/target/release/codex-delegate-pet.exe") },
    out: { type: "string", default: "dist" },
    "expect-tag": { type: "string" },
    check: { type: "boolean" },
    "check-published": { type: "string" },
    notices: { type: "string" },
  } });
  if (values["check-published"] !== undefined) {
    if (values.check || values["expect-tag"] !== undefined) {
      throw new Error("--check-published cannot be combined with --check or --expect-tag");
    }
    const version = values["check-published"];
    if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
      throw new Error("--check-published requires a bare X.Y.Z version (for example, 0.4.0)");
    }
    const release = readPetRelease(root, version);
    const { sha256 } = await downloadPetRelease(release);
    console.log(`Release ${release.tag} passed (SHA-256 ${sha256})`);
  } else {
    if (values.check && values["expect-tag"] === undefined) throw new Error("--check requires --expect-tag <tag>");
    const { asset, tag } = readPetRelease(root);
    if (values["expect-tag"] !== undefined && values["expect-tag"] !== tag) {
      throw new Error(`Expected tag ${values["expect-tag"]} does not match Release ${tag}`);
    }
    if (values.check) process.exit(0);
    if (!values.notices) throw new Error("--notices <path> is required");
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
    add(resolve(values.notices), "THIRD-PARTY-NOTICES");
    // The first line of the shared development stub is its canonical marker.
    const stubMarker = readFileSync(join(root, "pet/notices/development-stub.txt"), "utf8").split(/\r?\n/)[0];
    if (entries["THIRD-PARTY-NOTICES"].includes(Buffer.from(stubMarker))) {
      throw new Error("Cannot package development stub notices");
    }
    add(resolve(values.exe), "codex-delegate-pet.exe");
    add(join(root, "pet/client/pet-client.mjs"), "client/pet-client.mjs");
    add(join(root, "pet/client"), "client", true);
    add(join(root, "pet/hook/leader-hook.mjs"), "hook/leader-hook.mjs");
    add(join(root, "pet/app/ui/assets"), "default-pets", true);
    const bytes = zip(entries);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const out = resolve(values.out);
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, asset), bytes);
    writeFileSync(join(out, `${asset}.sha256`), `${sha256}  ${asset}\n`);
    console.log(`${sha256}  ${join(out, asset)}`);
    console.log(join(out, `${asset}.sha256`));
  }
} catch (error) {
  console.error(`pet-bundle: ${error.message}${error.url ? ` (${error.url})` : ""}`);
  process.exitCode = 1;
}
