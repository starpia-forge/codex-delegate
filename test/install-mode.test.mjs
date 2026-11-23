import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { fakeCodex } from "./helpers/fake-codex.mjs";

const cli = fileURLToPath(new URL("../bin/cli.mjs", import.meta.url));
const markerName = ".codex-delegate.json";
const standardSkills = [
  "ask-matt", "code-review", "codebase-design", "codex-code-review", "codex-computer-use",
  "codex-implement", "codex-plan-review", "codex-research", "diagnosing-bugs", "domain-modeling",
  "grill-me", "grill-with-docs", "grilling", "handoff", "implement", "implement-spec",
  "improve-codebase-architecture", "pr", "prototype", "research", "retro", "setup-matt-pocock-skills",
  "tdd", "teach", "to-questionnaire", "to-spec", "to-tickets", "triage", "wait-what", "wayfinder",
  "wizard", "writing-for-agents",
];

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "delegation mode test "));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const fake = fakeCodex(root, `
if (process.argv.includes("--version")) console.log("codex-cli test");
else if (process.argv.slice(2).join(" ") === "login status") console.log("Logged in");
else process.exitCode = 1;
`);
  const run = (...args) => {
    const result = spawnSync(process.execPath, [cli, ...args], {
      cwd: root, env: fake.env, encoding: "utf8", windowsHide: true,
    });
    assert.equal(result.error, undefined);
    return { ...result, output: result.stdout + result.stderr };
  };
  return { root, ...fake, run, skills: join(fake.claudeHome, "skills") };
}

test("minimum installs the shared test-first workflow and keeps research and review delegation", t => {
  const f = fixture(t);
  const result = f.run("install", "--mode", "minimum");
  assert.equal(result.status, 0, result.output);
  const names = readdirSync(f.skills);
  assert.ok(!names.includes("codex-implement"));
  assert.ok(!names.includes("codex-computer-use"));
  for (const name of names) {
    const skill = readFileSync(join(f.skills, name, "SKILL.md"), "utf8");
    assert.doesNotMatch(skill, /codex-implement|codex-computer-use/, name);
  }
  const skill = name => readFileSync(join(f.skills, name, "SKILL.md"), "utf8");
  assert.match(skill("implement"), /Before implementing anything, record.*review base/);
  assert.match(skill("implement"), /"tdd".*pre-agreed seams/);
  assert.match(skill("implement"), /After each ticket, run typechecking.*then commit/);
  assert.match(skill("implement"), /"code-review".*review base as the fixed point/);
  assert.match(skill("implement-spec"), /Each implementer subagent:[\s\S]*`tdd` to build the ticket, then commits/);
  assert.match(skill("implement-spec"), /record.*review base/);
  assert.match(skill("implement-spec"), /`code-review`.*review base as the fixed point/);
  assert.match(skill("implement-spec"), /`codex-research`/);
  for (const [name, delegation] of [
    ["grill-with-docs", "codex-research"], ["to-spec", "codex-plan-review"],
    ["to-tickets", "codex-plan-review"], ["code-review", "codex-code-review"],
  ]) assert.match(skill(name), new RegExp(delegation));
});

for (const mode of ["minimum", "standard"]) test(`plain reinstall retains ${mode} in all skill markers`, t => {
  const f = fixture(t);
  let result = f.run("install", "--mode", mode);
  assert.equal(result.status, 0, result.output);
  const names = readdirSync(f.skills);
  const implement = readFileSync(join(f.skills, "implement", "SKILL.md"));
  result = f.run("install");
  assert.equal(result.status, 0, result.output);
  assert.deepEqual(readdirSync(f.skills), names);
  assert.deepEqual(readFileSync(join(f.skills, "implement", "SKILL.md")), implement);
  for (const dir of [f.skills, join(f.codexHome, "skills")]) {
    for (const name of readdirSync(dir)) {
      const marker = JSON.parse(readFileSync(join(dir, name, markerName), "utf8"));
      assert.equal(marker.mode, mode, `${dir}/${name}`);
    }
  }
});

test("fresh and pre-feature installs use the unchanged standard skill set", t => {
  const f = fixture(t);
  let result = f.run("install");
  assert.equal(result.status, 0, result.output);
  assert.deepEqual(readdirSync(f.skills), standardSkills);
  for (const name of standardSkills) {
    const path = join(f.skills, name, markerName);
    const marker = JSON.parse(readFileSync(path, "utf8"));
    assert.equal(marker.mode, "standard");
    delete marker.mode;
    writeFileSync(path, JSON.stringify(marker));
  }
  assert.match(f.run("list").output, /Delegation mode: standard/);
  assert.match(f.run("doctor").output, /Delegation mode \(user\).*standard/);
  result = f.run("install");
  assert.equal(result.status, 0, result.output);
  assert.deepEqual(readdirSync(f.skills), standardSkills);
  for (const name of standardSkills) {
    assert.equal(JSON.parse(readFileSync(join(f.skills, name, markerName), "utf8")).mode, "standard");
  }
  assert.match(readFileSync(join(f.skills, "implement", "SKILL.md"), "utf8"), /codex-implement/);
  assert.deepEqual(readdirSync(join(f.codexHome, "skills")), ["codebase-design", "research", "tdd"]);
});

function snapshot(dir) {
  return Object.fromEntries(readdirSync(dir, { withFileTypes: true }).map(entry => [entry.name,
    entry.isDirectory() ? snapshot(join(dir, entry.name)) : readFileSync(join(dir, entry.name)).toString("base64")
  ]));
}

for (const args of [
  ["install", "--mode", "tiny"], ["install", "--mode"],
  ["uninstall", "--mode", "minimum"], ["list", "--mode", "minimum"],
  ["doctor", "--mode", "minimum"], ["install", "--agent", "codex", "--mode", "minimum"],
]) test(`${args.join(" ")} is refused before changing anything`, t => {
  const f = fixture(t);
  const installed = f.run("install");
  assert.equal(installed.status, 0, installed.output);
  const before = snapshot(f.root);
  const result = f.run(...args);
  assert.equal(result.status, 2, result.output);
  assert.match(result.output, /standard\|minimum/);
  assert.deepEqual(snapshot(f.root), before);
});

test("list reports the delegation mode only for an installed Claude Code scope", t => {
  const f = fixture(t);
  assert.doesNotMatch(f.run("list").output, /Delegation mode/);
  const installed = f.run("install", "--mode", "minimum");
  assert.equal(installed.status, 0, installed.output);
  const result = f.run("list");
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /Delegation mode: minimum/);
  assert.doesNotMatch(f.run("list", "--scope", "project").output, /Delegation mode/);
});

test("minimum's post-install doctor passes without the implementer's model and skips unused roles", t => {
  const f = fixture(t);
  writeFileSync(join(f.codexHome, "models_cache.json"), JSON.stringify({ models: [
    { slug: "gpt-6-astra", supported_reasoning_levels: [{ effort: "medium" }] },
    { slug: "gpt-6-luna", supported_reasoning_levels: [{ effort: "max" }] },
  ] }));
  for (const args of [["install", "--mode", "minimum"], ["doctor"]]) {
    const result = f.run(...args);
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /Delegation mode \(user\).*minimum/);
    assert.doesNotMatch(result.output, /Role implementer:|Role computer-user:|Computer Use plugin/);
    assert.match(result.output, /\[OK  \] Role critic: gpt-6-astra \/ medium/);
    assert.match(result.output, /\[OK  \] Role researcher: gpt-6-luna \/ max/);
  }
});

for (const [role, override, status, message] of [
  ["researcher", { model: "unavailable" }, 1, /Role researcher: unavailable.*model not offered/],
  ["critic", { model: "unavailable" }, 1, /Role critic: unavailable.*model not offered/],
  ["researcher", { effort: "unsupported" }, 1, /Role researcher:.*effort not supported/],
  ["critic", { effort: "unsupported" }, 1, /Role critic:.*effort not supported/],
  ["unknown-role", {}, 1, /Role overrides.*unknown role "unknown-role"/],
  ["implementer", { model: "unavailable", effort: "unsupported" }, 0, /\[OK  \] Role overrides/],
  ["computer-user", { model: "unavailable", effort: "unsupported" }, 0, /\[OK  \] Role overrides/],
]) test(`minimum doctor validates ${role} override ${JSON.stringify(override)}`, t => {
  const f = fixture(t);
  const installed = f.run("install", "--mode", "minimum");
  assert.equal(installed.status, 0, installed.output);
  writeFileSync(join(f.codexHome, "models_cache.json"), JSON.stringify({ models: [
    { slug: "gpt-6-astra", supported_reasoning_levels: [{ effort: "medium" }] },
    { slug: "gpt-6-luna", supported_reasoning_levels: [{ effort: "max" }] },
  ] }));
  mkdirSync(join(f.home, ".codex-delegate"), { recursive: true });
  writeFileSync(join(f.home, ".codex-delegate", "roles.json"), JSON.stringify({ [role]: override }));
  const result = f.run("doctor");
  assert.equal(result.status, status, result.output);
  assert.match(result.output, message);
  assert.doesNotMatch(result.output, /Role implementer:|Role computer-user:|Computer Use plugin/);
});

for (const mode of [undefined, "standard"]) test(`doctor keeps all checks with ${mode ?? "nothing"} installed`, t => {
  const f = fixture(t);
  if (mode) {
    const installed = f.run("install", "--mode", mode);
    assert.equal(installed.status, 0, installed.output);
  }
  writeFileSync(join(f.codexHome, "models_cache.json"), JSON.stringify({ models: [
    { slug: "gpt-6-astra", supported_reasoning_levels: [{ effort: "medium" }] },
    { slug: "gpt-6.1-sol", supported_reasoning_levels: [{ effort: "high" }] },
    { slug: "gpt-6-luna", supported_reasoning_levels: [{ effort: "max" }] },
  ] }));
  const result = f.run("doctor");
  assert.equal(result.status, 0, result.output);
  for (const role of ["critic", "computer-user", "implementer", "researcher"]) {
    assert.match(result.output, new RegExp(`\\[OK  \\] Role ${role}:`));
  }
  assert.match(result.output, /Computer Use plugin enabled/);
  assert.match(result.output, new RegExp(`Delegation mode \\(user\\).*${mode ?? "not installed"}`));
  assert.doesNotMatch(result.output, /Delegation mode \(project\)/);
});

for (const modes of [[null, "minimum"], ["minimum", "minimum"], ["standard", "minimum"], ["minimum", "standard"]]) {
  test(`doctor reports user ${modes[0] ?? "absent"} and project ${modes[1]} and checks their used roles`, t => {
    const f = fixture(t);
    for (const [scope, mode] of [["user", modes[0]], ["project", modes[1]]]) {
      if (!mode) continue;
      const installed = f.run("install", "--scope", scope, "--mode", mode);
      assert.equal(installed.status, 0, installed.output);
      const listed = f.run("list", "--scope", scope);
      assert.match(listed.output, new RegExp(`Delegation mode: ${mode}`));
    }
    writeFileSync(join(f.codexHome, "models_cache.json"), JSON.stringify({ models: [
      { slug: "gpt-6-astra", supported_reasoning_levels: [{ effort: "medium" }] },
      { slug: "gpt-6.1-sol", supported_reasoning_levels: [{ effort: "high" }] },
      { slug: "gpt-6-luna", supported_reasoning_levels: [{ effort: "max" }] },
    ] }));
    const result = f.run("doctor");
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, new RegExp(`Delegation mode \\(user\\).*${modes[0] ?? "not installed"}`));
    assert.match(result.output, new RegExp(`Delegation mode \\(project\\).*${modes[1]}`));
    const unused = /Role implementer:|Role computer-user:|Computer Use plugin/;
    if (modes.includes("standard")) {
      assert.match(result.output, /Role implementer:/);
      assert.match(result.output, /Role computer-user:/);
      assert.match(result.output, /Computer Use plugin/);
    } else assert.doesNotMatch(result.output, unused);
  });
}
