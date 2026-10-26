#!/usr/bin/env node
// Regenerates skills/ from mattpocock/skills plus this repo's sources.
//
//   node scripts/build.mjs            # rebuild at the commit pinned in upstream.json
//   node scripts/build.mjs --ref main # move the pin to another ref, then rebuild
//
// skills/claude/  every upstream skill with patches/claude/ applied,
//                 plus src/skills/* each bundled with src/runner/; Claude Code only
// skills/codex/   the upstream skills the Codex workers need (src/codex-skills.json)
//                 with patches/codex/ applied; Codex only
//
// Each agent gets its own copy, patched for its own role, so a skill's
// instructions never have to serve the delegating and the delegated agent at once.
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
const codexSkills = JSON.parse(readFileSync(join(root, "src/codex-skills.json"), "utf8"));
const outDir = join(root, "skills");

const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();

// A patch's target skill is the directory of the first file it touches: a/<category>/<skill>/...
function patchedSkill(patchPath) {
  const match = readFileSync(patchPath, "utf8").match(/^diff --git a\/[^/]+\/([^/]+)\//m);
  if (!match) throw new Error(`cannot tell which skill ${basename(patchPath)} patches`);
  return match[1];
}

// Applies patches/<agent>/ to a clean upstream checkout and returns the patched skill names.
function applyPatches(upstream, agent, commit) {
  git(upstream, "checkout", "--quiet", "--", ".");
  git(upstream, "clean", "--quiet", "-fd");
  const dir = join(patchesDir, agent);
  const patches = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".patch")).sort() : [];
  const patched = new Set();
  for (const patch of patches) {
    try {
      git(upstream, "apply", "--directory=skills", join(dir, patch));
    } catch {
      console.error(`\n${agent}/${patch} does not apply to upstream ${commit}. skills/ was left unchanged.`);
      process.exit(1);
    }
    patched.add(patchedSkill(join(dir, patch)));
    console.log(`applied ${agent}/${patch}`);
  }
  return patched;
}

const refIndex = process.argv.indexOf("--ref");
const pin = JSON.parse(readFileSync(pinFile, "utf8"));
const ref = refIndex > -1 ? process.argv[refIndex + 1] : pin.commit;

const work = mkdtempSync(join(tmpdir(), "mp-skills-"));
const staging = join(work, "skills");
try {
  // Keep upstream's LF endings on every OS so patches/ and skills/ stay byte-identical.
  git(work, "clone", "--quiet", "--config", "core.autocrlf=false", pin.repo, "upstream");
  const upstream = join(work, "upstream");
  git(upstream, "checkout", "--quiet", ref);
  const commit = git(upstream, "rev-parse", "HEAD");
  const upstreamPlugin = JSON.parse(readFileSync(join(upstream, ".claude-plugin/plugin.json"), "utf8"));
  const upstreamSkills = upstreamPlugin.skills.map((p) => join(upstream, p));
  const upstreamNames = upstreamSkills.map((dir) => basename(dir));

  const authored = readdirSync(srcSkillsDir);
  for (const name of authored) {
    if (upstreamNames.includes(name)) throw new Error(`src/skills/${name} clashes with an upstream skill`);
  }
  for (const name of codexSkills) {
    if (!upstreamNames.includes(name)) throw new Error(`codex skill ${name} is not an upstream skill`);
  }

  // Build into a staging directory so a failure leaves skills/ untouched.
  const claudePatched = applyPatches(upstream, "claude", commit);
  for (const dir of upstreamSkills) cpSync(dir, join(staging, "claude", basename(dir)), { recursive: true });
  for (const name of authored) {
    const dest = join(staging, "claude", name);
    cpSync(join(srcSkillsDir, name), dest, { recursive: true });
    cpSync(runnerDir, join(dest, "scripts"), { recursive: true });
  }

  const codexPatched = applyPatches(upstream, "codex", commit);
  for (const dir of upstreamSkills) {
    if (codexSkills.includes(basename(dir))) cpSync(dir, join(staging, "codex", basename(dir)), { recursive: true });
  }
  cpSync(join(upstream, "LICENSE"), join(staging, "THIRD_PARTY_LICENSE-mattpocock-skills"));

  for (const name of claudePatched) {
    if (!upstreamNames.includes(name)) throw new Error(`patched skill ${name} is not listed in upstream plugin.json`);
  }
  for (const name of codexPatched) {
    if (!codexSkills.includes(name)) throw new Error(`patches/codex/ patches ${name}, which is not listed in src/codex-skills.json`);
  }

  rmSync(outDir, { recursive: true, force: true });
  cpSync(staging, outDir, { recursive: true });

  writeFileSync(pinFile, `${JSON.stringify({ ...pin, commit, version: upstreamPlugin.version }, null, 2)}\n`);
  console.log(`\nbuilt skills/ from mattpocock/skills ${upstreamPlugin.version} (${commit})`);
  console.log(`  claude: ${readdirSync(join(outDir, "claude")).join(", ")}`);
  console.log(`  codex: ${readdirSync(join(outDir, "codex")).join(", ")}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
