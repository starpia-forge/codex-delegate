#!/usr/bin/env node
// Installs this repo's skills into each agent as defined in install-manifest.json.
// Every installed skill directory gets a marker file, so update and uninstall
// only ever touch skills this tool put there.

import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { listPet, preparePet, preparePetRemoval, readPetMarker, withInstallerLock } from "./pet.mjs";
import { checkPet } from "./pet-doctor.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(root, "install-manifest.json"), "utf8"));
const delegationModes = manifest.agents["claude-code"].modes;
const acceptedModes = Object.keys(delegationModes).join("|");
const MARKER = ".codex-delegate.json";
const USER_ROLES = join(homedir(), ".codex-delegate", "roles.json");

const HELP = `codex-delegate ${pkg.version}

Usage: npx github:<owner>/codex-delegate <command> [options]

Commands:
  install     Install or update the skills (default)
  uninstall   Remove the skills this tool installed
  list        Show installed skills and user-scope pet state
  doctor      Check Codex, models and conflicting installs

Options:
  --scope <user|project>  user: home directory (default); project: current directory
  --agent <id>            Only this agent: ${Object.keys(manifest.agents).join(", ")} (repeatable)
  --mode <${acceptedModes}>  Delegation mode (install with Claude Code only)
  --force                 Overwrite skills with the same name that this tool did not install
  --dry-run               Show what would change without changing anything
  --with-pet              Install the Release's Windows pet and Claude Code hooks (user scope)
  --without-pet           Remove the pet and its owned hooks, keeping skills
  -h, --help              Show this help`;

function parseArgs(argv) {
  const opts = { command: "install", scope: "user", agents: [], force: false, dryRun: false };
  const args = [...argv];
  if (args[0] && !args[0].startsWith("-")) opts.command = args.shift();
  while (args.length) {
    const arg = args.shift();
    if (arg === "--scope") opts.scope = args.shift();
    else if (arg === "--agent") opts.agents.push(args.shift());
    else if (arg === "--mode") opts.mode = args.shift() ?? "";
    else if (arg === "--force") opts.force = true;
    else if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--with-pet") opts.withPet = true;
    else if (arg === "--without-pet") opts.withoutPet = true;
    else if (arg === "-h" || arg === "--help") opts.command = "help";
    else throw new Error(`unknown option: ${arg}`);
  }
  if (!["user", "project"].includes(opts.scope)) throw new Error(`--scope must be user or project, got: ${opts.scope}`);
  for (const id of opts.agents) {
    if (!manifest.agents[id]) throw new Error(`unknown agent: ${id} (expected: ${Object.keys(manifest.agents).join(", ")})`);
  }
  if (!opts.agents.length) opts.agents = Object.keys(manifest.agents);
  if (opts.mode !== undefined) {
    if (!Object.hasOwn(delegationModes, opts.mode)) throw new Error(`--mode must be ${acceptedModes}, got: ${opts.mode}`);
    if (opts.command !== "install") throw new Error(`--mode is only valid for install (accepted values: ${acceptedModes})`);
    if (!opts.agents.includes("claude-code")) throw new Error(`--mode requires Claude Code in the agent selection (accepted values: ${acceptedModes})`);
  }
  if (opts.withPet && opts.withoutPet) throw new Error("--with-pet and --without-pet are contradictory");
  if (opts.withPet || opts.withoutPet) {
    if (opts.command !== "install") throw new Error("pet options are only valid for install");
    if (opts.scope !== "user") throw new Error("pet options require user scope");
    if (!opts.agents.includes("claude-code")) throw new Error("pet options require Claude Code in the agent selection");
    if (opts.withPet && (process.env.CODEX_DELEGATE_TEST_PLATFORM || process.platform) !== "win32") {
      throw new Error("pet is not supported on this platform yet (Windows only)");
    }
  }
  return opts;
}

// "claude/*" or "codex/tdd" -> [{ name, src }]
function resolveSkills(patterns, { allowMissingGroups = false } = {}) {
  const skills = [];
  for (const pattern of patterns) {
    const [group, name] = pattern.split("/");
    const groupDir = join(root, "skills", group);
    if (allowMissingGroups && !existsSync(groupDir)) continue;
    const names = name === "*" ? readdirSync(groupDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) : [name];
    for (const n of names) {
      if (!existsSync(join(groupDir, n, "SKILL.md"))) throw new Error(`manifest entry ${pattern}: skills/${group}/${n}/SKILL.md not found`);
      if (skills.some((s) => s.name === n)) throw new Error(`manifest installs two skills named ${n}`);
      skills.push({ name: n, src: join(groupDir, n) });
    }
  }
  return skills;
}

// The agent's config directory: its home env var (CODEX_HOME, CLAUDE_CONFIG_DIR)
// when set, else ~/<home>. userDir is relative to it.
function agentHome(agent) {
  return process.env[agent.homeEnv] || join(homedir(), agent.home);
}

function targetDir(agent, scope) {
  return scope === "user" ? join(agentHome(agent), agent.userDir) : join(process.cwd(), agent.projectDir);
}

// Read the common TOML spellings of this one optional plugin flag.
function readComputerUseEnabled(configPath) {
  try {
    let section = "";
    const plugin = String.raw`plugins\s*\.\s*["']computer-use@openai-bundled["']`;
    const flag = new RegExp(`^${plugin}\\s*\\.\\s*enabled\\s*=\\s*(true|false)\\s*(?:#.*)?$`);
    const inline = new RegExp(`^${plugin}\\s*=\\s*\\{(.*)\\}\\s*(?:#.*)?$`);
    for (const line of readFileSync(configPath, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed.startsWith("[")) {
        section = trimmed.match(/^\[\s*(.*?)\s*\]\s*(?:#.*)?$/)?.[1] ?? "?";
        continue;
      }
      const key = section ? `${section}.${trimmed}` : trimmed;
      const enabled = key.match(flag)?.[1]
        ?? key.match(inline)?.[1].match(/(?:^|,)\s*enabled\s*=\s*(true|false)\s*(?:,|$)/)?.[1];
      if (enabled !== undefined) return enabled === "true";
    }
  } catch {
    // Missing or unreadable configuration leaves the optional plugin disabled.
  }
  return false;
}

function readMarker(skillDir) {
  try {
    return JSON.parse(readFileSync(join(skillDir, MARKER), "utf8"));
  } catch {
    return null;
  }
}

function installedSkills(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && readMarker(join(dir, e.name)))
    .map((e) => ({ name: e.name, marker: readMarker(join(dir, e.name)) }));
}

function recordedModes(scope) {
  const skills = installedSkills(targetDir(manifest.agents["claude-code"], scope));
  return [...new Set(skills.map(({ marker }) => Object.hasOwn(marker, "mode") ? marker.mode : "standard"))];
}

function recordedMode(scope) {
  const modes = recordedModes(scope);
  return modes.length === 1 && typeof modes[0] === "string" && Object.hasOwn(delegationModes, modes[0]) ? modes[0] : undefined;
}

function unresolvedModeDetail(scope) {
  return `unresolved: found ${recordedModes(scope).map(mode => JSON.stringify(mode)).join(", ")}; reinstall with --mode ${acceptedModes} to repair it`;
}

function claudeScopes() {
  const agent = manifest.agents["claude-code"];
  return targetDir(agent, "project") !== targetDir(agent, "user") ? ["user", "project"] : ["user"];
}

function mixedModeWarning(projectPlan, plannedMode) {
  if (claudeScopes().length === 1) return;
  const userMode = recordedMode("user");
  const projectMode = projectPlan ? plannedMode : recordedMode("project");
  if (!userMode || !projectMode || userMode === projectMode) return;
  const agent = manifest.agents["claude-code"];
  const skillInScope = (scope, name) => {
    if (scope === "project" && projectPlan) {
      if (projectPlan.skills.some(s => s.name === name)) return { owned: true, mode: plannedMode };
      if ([...projectPlan.stale, ...projectPlan.excluded].includes(name)) return;
    }
    const dir = join(targetDir(agent, scope), name);
    if (existsSync(dir)) {
      const marker = readMarker(dir);
      return { owned: !!marker, mode: marker?.mode ?? "standard" };
    }
  };
  const winningSkill = name => ["user", "project"].map(scope => {
    const installed = skillInScope(scope, name);
    return installed && { scope, ...installed };
  }).find(Boolean);
  const workflows = ["implement", "implement-spec"].map(name => {
    const installed = winningSkill(name);
    if (!installed) return `${name}: absent`;
    return `${name}: ${installed.scope} (${installed.owned ? installed.mode : "unowned"}) wins`;
  });
  const reachableExcludedSkills = excludedSkills([userMode, projectMode]).flatMap(name => {
    const installed = winningSkill(name);
    return installed ? [`${name} (${installed.scope})`] : [];
  });
  return `user ${userMode}, project ${projectMode}. Claude Code prefers personal skills per name; ${workflows.join("; ")}. Skills excluded by delegation mode still reachable: ${reachableExcludedSkills.join(", ") || "none"}.`;
}

function excludedSkills(modes) {
  return [...new Set(modes.flatMap(mode => delegationModes[mode]?.exclude ?? []))];
}

function unownedExcludedSkills(scope, exclusions) {
  const agent = manifest.agents["claude-code"];
  const dir = targetDir(agent, scope);
  return exclusions.filter(name =>
    existsSync(join(dir, name)) && !readMarker(join(dir, name)));
}

const unownedDelegationDetail = "not installed by this tool; delegation excluded by the mode is still reachable through this skill. Left untouched.";

async function install(opts) {
  if (opts.mode === undefined && opts.agents.includes("claude-code")) {
    const modes = recordedModes(opts.scope);
    if (modes.length && recordedMode(opts.scope) === undefined) {
      console.error(`Delegation mode (${opts.scope}) is ${unresolvedModeDetail(opts.scope)}. No skills or markers were changed.`);
      process.exitCode = 1;
      return;
    }
  }
  const mode = opts.mode ?? recordedMode(opts.scope) ?? "standard";
  // Plan every agent before touching anything, so a conflict aborts cleanly.
  const plans = opts.agents.map((id) => {
    const agent = manifest.agents[id];
    const dir = targetDir(agent, opts.scope);
    const shipped = resolveSkills(agent.skills);
    const definition = agent.modes?.[mode];
    const overlays = definition ? resolveSkills(definition.overlay, { allowMissingGroups: true }) : [];
    const skills = shipped.filter(s => !definition?.exclude.includes(s.name))
      .map(s => overlays.find(overlay => overlay.name === s.name) ?? s);
    const conflicts = skills.filter((s) => existsSync(join(dir, s.name)) && !readMarker(join(dir, s.name))).map((s) => s.name);
    const installed = installedSkills(dir);
    const stale = installed.filter((i) => !shipped.some((s) => s.name === i.name)).map((i) => i.name);
    const excluded = installed.filter((i) => shipped.some((s) => s.name === i.name) && definition?.exclude.includes(i.name)).map((i) => i.name);
    return { id, agent, dir, skills, conflicts, stale, excluded };
  });

  const conflicted = plans.filter((p) => p.conflicts.length);
  if (conflicted.length && !opts.force) {
    for (const p of conflicted) console.error(`${p.agent.name}: ${p.dir} already has skills with these names, not installed by this tool:\n  ${p.conflicts.join(", ")}`);
    console.error("\nNothing was changed. Remove those skills (for example an existing mattpocock-skills install), or re-run with --force to overwrite them.");
    process.exitCode = 1;
    return;
  }

  let pet;
  try {
    if (opts.withoutPet) pet = preparePetRemoval({ dryRun: opts.dryRun });
    if (opts.withPet || (!opts.withoutPet && opts.scope === "user" && opts.agents.includes("claude-code") && readPetMarker())) {
      pet = await preparePet({ root, pkg, dryRun: opts.dryRun });
    }
  } catch (error) {
    console.error(`codex-delegate: ${error.message.replace(/; nothing was changed$/, "")}\nNothing was changed.`);
    process.exitCode = 1;
    return;
  }

  const steps = [];
  const add = (label, apply) => steps.push({ label, apply, status: "not applied" });
  for (const p of plans) {
    console.log(`${p.agent.name} -> ${p.dir}`);
    if (p.id === "claude-code") console.log(`  Delegation mode: ${mode}`);
    console.log(`  install ${p.skills.length}: ${p.skills.map((s) => s.name).join(", ")}`);
    if (p.stale.length) console.log(`  remove (no longer shipped): ${p.stale.join(", ")}`);
    if (p.excluded.length) console.log(`  remove (delegation mode): ${p.excluded.join(", ")}`);
    if (p.conflicts.length) console.log(`  overwrite (--force): ${p.conflicts.join(", ")}`);
    if (opts.dryRun) continue;

    add(`create skill directory ${p.dir}`, () => mkdirSync(p.dir, { recursive: true }));
    for (const name of p.stale) add(`remove stale skill ${join(p.dir, name)}`, () => rmSync(join(p.dir, name), { recursive: true, force: true }));
    for (const name of p.excluded) add(`remove excluded skill ${join(p.dir, name)}`, () => rmSync(join(p.dir, name), { recursive: true, force: true }));
    for (const s of p.skills) {
      const dest = join(p.dir, s.name);
      add(`remove previous skill ${dest}`, () => rmSync(dest, { recursive: true, force: true }));
      add(`copy skill ${s.src} -> ${dest}`, () => cpSync(s.src, dest, { recursive: true }));
      const marker = { package: pkg.name, version: pkg.version, agent: p.id, ...(p.id === "claude-code" ? { mode } : {}), installedAt: new Date().toISOString() };
      add(`write skill marker ${join(dest, MARKER)}`, () => writeFileSync(join(dest, MARKER), `${JSON.stringify(marker, null, 2)}\n`));
    }
  }

  if (opts.dryRun) {
    const claudePlan = plans.find(p => p.id === "claude-code");
    const scopes = claudeScopes();
    const exclusions = excludedSkills(scopes.map(scope =>
      claudePlan && (scope === opts.scope || scopes.length === 1) ? mode : recordedMode(scope)));
    for (const scope of scopes) {
      for (const name of unownedExcludedSkills(scope, exclusions)) {
        console.log(`  [WARN] Unowned skill excluded by delegation mode (${scope}): ${name} - ${unownedDelegationDetail}`);
      }
    }
    const projectPlan = opts.scope === "project" && claudePlan;
    const mixed = projectPlan && mixedModeWarning(projectPlan, mode);
    if (mixed) console.log(`  [WARN] Mixed delegation modes - ${mixed}`);
    console.log("\nDry run: nothing was changed.");
    return;
  }
  if (!await applySteps(steps, pet, "Install")) return;
  console.log(`\nInstalled codex-delegate ${pkg.version}. Restart Claude Code and Codex to pick up the skills.\n`);
  await doctor();
}

async function applySteps(steps, pet, operation) {
  steps.push(...(pet?.steps ?? []));
  try {
    for (const step of steps) {
      step.status = "failed (may be partially applied)";
      await step.apply();
      step.status = "applied";
    }
  } catch (error) {
    console.error(`${operation} apply failed: ${error.message}`);
    for (const step of steps) console.error(`  ${step.status}: ${step.label}`);
    console.error(`Settings backup: ${pet?.backup() ?? "none (settings were not changed)"}`);
    process.exitCode = 1;
    return false;
  } finally { pet?.cleanup(); }
  if (pet) console.log("Restart Claude Code so the pet hooks take effect.");
  return true;
}

async function uninstall(opts) {
  let pet;
  try {
    pet = opts.scope === "user" && opts.agents.includes("claude-code")
      ? preparePetRemoval({ dryRun: opts.dryRun }) : undefined;
  } catch (error) {
    console.error(`codex-delegate: ${error.message}\nNothing was changed.`);
    process.exitCode = 1;
    return;
  }
  const steps = [];
  for (const id of opts.agents) {
    const agent = manifest.agents[id];
    const dir = targetDir(agent, opts.scope);
    const names = installedSkills(dir).map((i) => i.name);
    console.log(`${agent.name} -> ${dir}`);
    console.log(names.length ? `  remove ${names.length}: ${names.join(", ")}` : "  nothing installed");
    if (!opts.dryRun) for (const name of names) steps.push({
      label: `remove skill ${join(dir, name)}`, status: "not applied",
      apply: () => rmSync(join(dir, name), { recursive: true, force: true }),
    });
  }
  if (opts.dryRun) console.log("\nDry run: nothing was changed.");
  else await applySteps(steps, pet, "Uninstall");
}

function list(opts) {
  for (const id of opts.agents) {
    const agent = manifest.agents[id];
    const dir = targetDir(agent, opts.scope);
    const installed = installedSkills(dir);
    console.log(`${agent.name} -> ${dir}`);
    if (id === "claude-code" && installed.length) console.log(`  Delegation mode: ${recordedMode(opts.scope) ?? unresolvedModeDetail(opts.scope)}`);
    if (!installed.length) console.log("  nothing installed");
    for (const { name, marker } of installed) console.log(`  ${name}  ${marker.version}`);
  }
  if (opts.scope === "user") listPet();
}

// Combined stdout and stderr of a successful command, else null. Some CLIs
// (codex login status) report on stderr.
function run(command) {
  const result = spawnSync(command, { shell: true, encoding: "utf8" });
  if (result.status !== 0) return null;
  return `${result.stdout}${result.stderr}`.trim();
}

async function doctor() {
  const results = [];
  const check = (ok, label, detail = "") => results.push({ ok, label, detail });
  const scopes = claudeScopes().map(scope => ({
    scope, mode: recordedMode(scope),
    installed: installedSkills(targetDir(manifest.agents["claude-code"], scope)).length > 0,
  }));
  const installedScopes = scopes.filter(s => s.installed);
  const unusedRoles = installedScopes.length
    ? (delegationModes[installedScopes[0].mode]?.unusedRoles ?? []).filter(role =>
      installedScopes.every(s => delegationModes[s.mode]?.unusedRoles?.includes(role)))
    : [];
  const exclusions = excludedSkills(installedScopes.map(s => s.mode));
  for (const s of scopes) {
    if (s.installed && s.mode === undefined) {
      check("fail", `Delegation mode (${s.scope})`, unresolvedModeDetail(s.scope));
    } else if (s.scope === "user" || s.installed) {
      check("ok", `Delegation mode (${s.scope})`, s.installed ? s.mode : "not installed");
    }
    for (const name of unownedExcludedSkills(s.scope, exclusions)) {
      check("warn", `Unowned skill excluded by delegation mode (${s.scope}): ${name}`, unownedDelegationDetail);
    }
  }
  const mixed = mixedModeWarning();
  if (mixed) check("warn", "Mixed delegation modes", mixed);

  const [major, minor] = process.versions.node.split(".").map(Number);
  check(major > 18 || (major === 18 && minor >= 18) ? "ok" : "fail", "Node.js >= 18.18", process.versions.node);

  const codexVersion = run("codex --version");
  check(codexVersion ? "ok" : "fail", "Codex CLI on PATH", codexVersion ?? "install with: npm i -g @openai/codex");
  if (codexVersion) {
    const login = run("codex login status");
    const loggedIn = login && /logged in/i.test(login) && !/not logged in/i.test(login);
    check(loggedIn ? "ok" : "fail", "Codex logged in", loggedIn ? login : "run: codex login");
  }
  const claudeVersion = run("claude --version");
  check(claudeVersion ? "ok" : "warn", "Claude Code on PATH", claudeVersion ?? "not found");

  if (!unusedRoles.includes("computer-user")) {
    const configPath = join(agentHome(manifest.agents.codex), "config.toml");
    const computerUseEnabled = readComputerUseEnabled(configPath);
    check(computerUseEnabled ? "ok" : "warn", "Computer Use plugin enabled",
      computerUseEnabled ? configPath : `enable computer-use@openai-bundled in ${configPath} to use computer use`);
  }

  // Validate overrides for every role, even when its availability check is skipped.
  const roles = JSON.parse(readFileSync(join(root, "src/runner/roles.json"), "utf8"));
  let overrides = {};
  if (existsSync(USER_ROLES)) {
    try {
      overrides = JSON.parse(readFileSync(USER_ROLES, "utf8"));
      const unknown = Object.keys(overrides).filter((name) => !Object.hasOwn(roles, name));
      if (unknown.length) check("fail", "Role overrides", `${USER_ROLES}: unknown role ${unknown.map((name) => `"${name}"`).join(", ")} (expected one of: ${Object.keys(roles).join(", ")}); the runner refuses to start until it is fixed`);
      else check("ok", "Role overrides", USER_ROLES);
    } catch (err) {
      check("fail", "Role overrides", `${USER_ROLES}: ${err.message}`);
    }
  }
  const cachePath = join(agentHome(manifest.agents.codex), "models_cache.json");
  let models = null;
  try {
    const cache = JSON.parse(readFileSync(cachePath, "utf8"));
    models = cache.models ?? cache.data ?? cache;
  } catch {
    check("warn", "Codex model list", `${cachePath} not readable; run codex once to create it`);
  }
  for (const [role, base] of Object.entries(roles)) {
    if (unusedRoles.includes(role)) continue;
    const config = { ...base, ...overrides[role] };
    const label = `Role ${role}: ${config.model} / ${config.effort}`;
    if (!models) continue;
    const model = (Array.isArray(models) ? models : Object.values(models)).find((m) => (m.slug ?? m.id) === config.model);
    if (!model) check("fail", label, "model not offered to this Codex account");
    else if (model.supported_reasoning_levels && !model.supported_reasoning_levels.some((l) => l.effort === config.effort)) {
      check("fail", label, `effort not supported (${model.supported_reasoning_levels.map((l) => l.effort).join(", ")})`);
    } else check("ok", label);
  }

  // Another copy of mattpocock-skills in Claude Code would shadow the patched workflow skills.
  const pluginsFile = join(agentHome(manifest.agents["claude-code"]), "plugins", "installed_plugins.json");
  if (existsSync(pluginsFile) && /mattpocock-skills/.test(readFileSync(pluginsFile, "utf8"))) {
    check("warn", "No duplicate mattpocock-skills plugin", "the mattpocock-skills Claude Code plugin is installed; uninstall it so /implement etc. resolve to the patched skills");
  }

  // Claude Code resolves a name clash as personal over project, so a personal
  // skill this tool didn't install hides the project copy that it did.
  const claude = manifest.agents["claude-code"];
  const projectDir = targetDir(claude, "project");
  const userDir = targetDir(claude, "user");
  if (projectDir !== userDir) {
    const shadowed = installedSkills(projectDir)
      .map((i) => i.name)
      .filter((name) => existsSync(join(userDir, name)) && !readMarker(join(userDir, name)));
    if (shadowed.length) check("warn", "No personal skills shadowing project install", `${userDir} has ${shadowed.join(", ")}, not installed by this tool; Claude Code uses those instead of the project copies`);
  }

  await checkPet(root, check);

  const icon = { ok: "OK  ", warn: "WARN", fail: "FAIL" };
  console.log("doctor:");
  for (const r of results) console.log(`  [${icon[r.ok]}] ${r.label}${r.detail ? ` - ${r.detail}` : ""}`);
  if (results.some((r) => r.ok === "fail")) process.exitCode = 1;
}

try {
  const opts = parseArgs(process.argv.slice(2));
  const commands = { install: () => install(opts), uninstall: () => uninstall(opts), list: () => list(opts), doctor, help: () => console.log(HELP) };
  if (!commands[opts.command]) throw new Error(`unknown command: ${opts.command}`);
  if (["install", "uninstall"].includes(opts.command) && !opts.dryRun) {
    await withInstallerLock(commands[opts.command], { recoverPet: opts.scope === "user" && opts.agents.includes("claude-code") });
  } else await commands[opts.command]();
} catch (err) {
  console.error(`codex-delegate: ${err.message}\n\n${HELP}`);
  process.exitCode = 2;
}
