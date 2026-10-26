#!/usr/bin/env node
// Regenerates skills/ from mattpocock/skills plus this repo's sources.
//
//   node scripts/build.mjs            # rebuild at the commit pinned in upstream.json
//   node scripts/build.mjs --ref main # move the pin to another ref, then rebuild
//
// skills/shared/  upstream skills the Codex workers need (src/worker-skills.json),
//                 unmodified; installed into both Claude Code and Codex
// skills/claude/  every other upstream skill (patched where patches/ says so),
//                 plus src/skills/* each bundled with src/runner/
//
// skills/ is generated: edit patches/, src/ or upstream.json instead. If a patch
// no longer applies, skills/ is left untouched.

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pinFile = join(root, "upstream.json");
const patchesDir = join(root, "patches");
const srcSkillsDir = join(root, "src/skills");
const runnerDir = join(root, "src/runner");
const workerSkills = JSON.parse(readFileSync(join(root, "src/worker-skills.json"), "utf8"));
const outDir = join(root, "skills");

const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();

// A patch's target skill is the directory of the first file it touches: a/<category>/<skill>/...
function patchedSkill(patchPath) {
  const match = readFileSync(patchPath, "utf8").match(/^diff --git a\/[^/]+\/([^/]+)\//m);
  if (!match) throw new Error(`cannot tell which skill ${basename(patchPath)} patches`);
  return match[1];
}

const refIndex = process.argv.indexOf("--ref");
const pin = JSON.parse(readFileSync(pinFile, "utf8"));
const ref = refIndex > -1 ? process.argv[refIndex + 1] : pin.commit;

const work = mkdtempSync(join(tmpdir(), "mp-skills-"));
try {
  // Keep upstream's LF endings on every OS so patches/ and skills/ stay byte-identical.
  git(work, "clone", "--quiet", "--config", "core.autocrlf=false", pin.repo, "upstream");
  const upstream = join(work, "upstream");
  git(upstream, "checkout", "--quiet", ref);
  const commit = git(upstream, "rev-parse", "HEAD");
  const upstreamPlugin = JSON.parse(readFileSync(join(upstream, ".claude-plugin/plugin.json"), "utf8"));

  const patches = readdirSync(patchesDir).filter((f) => f.endsWith(".patch")).sort();
  const patched = new Set();
  for (const patch of patches) {
    try {
      git(upstream, "apply", "--directory=skills", join(patchesDir, patch));
    } catch {
      console.error(`\n${patch} does not apply to upstream ${commit}. skills/ was left unchanged.`);
      process.exit(1);
    }
    patched.add(patchedSkill(join(patchesDir, patch)));
    console.log(`applied ${patch}`);
  }

  const authored = readdirSync(srcSkillsDir);
  const upstreamSkills = upstreamPlugin.skills.map((p) => join(upstream, p));
  const upstreamNames = upstreamSkills.map((dir) => basename(dir));
  for (const name of authored) {
    if (upstreamNames.includes(name)) throw new Error(`src/skills/${name} clashes with an upstream skill`);
  }
  for (const name of workerSkills) {
    if (!upstreamNames.includes(name)) throw new Error(`worker skill ${name} is not an upstream skill`);
    if (patched.has(name)) throw new Error(`worker skill ${name} is patched; workers must get the unmodified upstream skill`);
  }

  rmSync(outDir, { recursive: true, force: true });
  for (const dir of upstreamSkills) {
    const name = basename(dir);
    cpSync(dir, join(outDir, workerSkills.includes(name) ? "shared" : "claude", name), { recursive: true });
  }
  for (const name of authored) {
    const dest = join(outDir, "claude", name);
    cpSync(join(srcSkillsDir, name), dest, { recursive: true });
    cpSync(runnerDir, join(dest, "scripts"), { recursive: true });
  }
  cpSync(join(upstream, "LICENSE"), join(outDir, "THIRD_PARTY_LICENSE-mattpocock-skills"));

  for (const name of patched) {
    if (!existsSync(join(outDir, "claude", name))) throw new Error(`patched skill ${name} is not listed in upstream plugin.json`);
  }

  writeFileSync(pinFile, `${JSON.stringify({ ...pin, commit, version: upstreamPlugin.version }, null, 2)}\n`);
  console.log(`\nbuilt skills/ from mattpocock/skills ${upstreamPlugin.version} (${commit})`);
  console.log(`  claude: ${readdirSync(join(outDir, "claude")).join(", ")}`);
  console.log(`  shared: ${readdirSync(join(outDir, "shared")).join(", ")}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
