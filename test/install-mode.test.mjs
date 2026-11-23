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

test("switching delegation modes removes excluded skills and restores standard workflows", t => {
  const f = fixture(t);
  const initial = f.run("install");
  assert.equal(initial.status, 0, initial.output);
  const standard = Object.fromEntries(["implement", "implement-spec"].map(name => [
    name, readFileSync(join(f.skills, name, "SKILL.md"), "utf8"),
  ]));
  const retired = join(f.skills, "retired-skill");
  mkdirSync(retired);
  writeFileSync(join(retired, markerName), JSON.stringify({ package: "codex-delegate", mode: "standard" }));

  const minimum = f.run("install", "--mode", "minimum");
  assert.equal(minimum.status, 0, minimum.output);
  assert.match(minimum.output, /Delegation mode: minimum/);
  assert.match(minimum.output, /remove \(delegation mode\): codex-computer-use, codex-implement/);
  assert.match(minimum.output, /remove \(no longer shipped\): retired-skill/);
  assert.ok(!readdirSync(f.skills).includes("retired-skill"));
  for (const name of ["codex-implement", "codex-computer-use"]) assert.ok(!readdirSync(f.skills).includes(name));
  for (const name of ["implement", "implement-spec"]) {
    const skill = readFileSync(join(f.skills, name, "SKILL.md"), "utf8");
    assert.doesNotMatch(skill, /codex-implement|codex-computer-use/);
    assert.match(skill, /tdd/);
  }

  const restored = f.run("install", "--mode", "standard");
  assert.equal(restored.status, 0, restored.output);
  assert.match(restored.output, /Delegation mode: standard/);
  assert.match(restored.output, /install \d+: .*codex-computer-use, codex-implement/);
  assert.deepEqual(readdirSync(f.skills), standardSkills);
  for (const [name, content] of Object.entries(standard)) {
    assert.equal(readFileSync(join(f.skills, name, "SKILL.md"), "utf8"), content);
  }
  for (const name of standardSkills) {
    assert.equal(JSON.parse(readFileSync(join(f.skills, name, markerName), "utf8")).mode, "standard");
  }
});

test("a dry run previews the same mode switch plan without changing disk", t => {
  const f = fixture(t);
  const initial = f.run("install");
  assert.equal(initial.status, 0, initial.output);
  const before = snapshot(f.root);
  const dry = f.run("install", "--dry-run", "--mode", "minimum");
  assert.equal(dry.status, 0, dry.output);
  assert.match(dry.output, /Delegation mode: minimum/);
  assert.match(dry.output, /install 30: .*implement, implement-spec/);
  assert.match(dry.output, /remove \(delegation mode\): codex-computer-use, codex-implement/);
  assert.match(dry.output, /Dry run: nothing was changed/);
  assert.deepEqual(snapshot(f.root), before);
  const applied = f.run("install", "--mode", "minimum");
  assert.equal(applied.status, 0, applied.output);
  assert.equal(dry.output.split("\n\nDry run:")[0], applied.output.split("\n\nInstalled")[0]);
});

test("a Codex-only install restores worker skills without changing Claude Code's minimum markers", t => {
  const f = fixture(t);
  const initial = f.run("install", "--mode", "minimum");
  assert.equal(initial.status, 0, initial.output);
  const before = snapshot(f.skills);
  rmSync(join(f.codexHome, "skills", "research"), { recursive: true });
  const result = f.run("install", "--agent", "codex");
  assert.equal(result.status, 0, result.output);
  assert.deepEqual(readdirSync(join(f.codexHome, "skills")), ["codebase-design", "research", "tdd"]);
  assert.deepEqual(snapshot(f.skills), before);
});

test("user and project installs keep their recorded modes and skills independent", t => {
  const f = fixture(t);
  const user = f.run("install", "--mode", "minimum");
  assert.equal(user.status, 0, user.output);
  const userBefore = snapshot(f.skills);
  const project = f.run("install", "--scope", "project", "--mode", "standard");
  assert.equal(project.status, 0, project.output);
  assert.deepEqual(snapshot(f.skills), userBefore);
  const projectSkills = join(f.root, ".claude", "skills");
  const projectBefore = snapshot(projectSkills);
  for (const mode of ["standard", "minimum"]) {
    const switched = f.run("install", "--mode", mode);
    assert.equal(switched.status, 0, switched.output);
    assert.deepEqual(snapshot(projectSkills), projectBefore);
  }
  for (const scope of ["user", "project"]) {
    const updated = f.run("install", "--scope", scope);
    assert.equal(updated.status, 0, updated.output);
    const skills = scope === "user" ? f.skills : projectSkills;
    for (const name of readdirSync(skills)) {
      assert.equal(JSON.parse(readFileSync(join(skills, name, markerName), "utf8")).mode,
        scope === "user" ? "minimum" : "standard");
    }
  }
});

test("minimum leaves unowned heavy-delegation skills untouched even with force", t => {
  const f = fixture(t);
  for (const name of ["codex-implement", "codex-computer-use"]) {
    const dir = join(f.skills, name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "SKILL.md"), `User's own ${name} skill\n`);
    writeFileSync(join(dir, "notes.txt"), "User content\n");
  }
  const before = Object.fromEntries(["codex-implement", "codex-computer-use"].map(name => [
    name, snapshot(join(f.skills, name)),
  ]));
  for (const flags of [["--mode", "minimum", "--force"], []]) {
    const result = f.run("install", ...flags);
    assert.equal(result.status, 0, result.output);
    assert.doesNotMatch(result.output, /remove \(delegation mode\)/);
    for (const [name, content] of Object.entries(before)) {
      assert.deepEqual(snapshot(join(f.skills, name)), content);
    }
  }
});

for (const scope of ["user", "project"]) test(`disagreeing ${scope} Claude Code markers refuse plain installs until an explicit mode repairs them`, t => {
  const f = fixture(t);
  const initial = f.run("install", "--scope", scope, "--mode", "minimum");
  assert.equal(initial.status, 0, initial.output);
  const skills = scope === "user" ? f.skills : join(f.root, ".claude", "skills");
  const codexSkills = scope === "user" ? join(f.codexHome, "skills") : join(f.root, ".agents", "skills");
  const path = join(skills, "codex-research", markerName);
  const marker = JSON.parse(readFileSync(path, "utf8"));
  marker.mode = "standard";
  writeFileSync(path, JSON.stringify(marker));
  const before = snapshot(f.root);
  for (const flags of [[], ["--dry-run"], ["--force"]]) {
    const refused = f.run("install", "--scope", scope, ...flags);
    assert.equal(refused.status, 1, refused.output);
    assert.match(refused.output, /unresolved/i);
    assert.match(refused.output, /found .*"standard"/);
    assert.match(refused.output, /found .*"minimum"/);
    assert.match(refused.output, /--mode/);
    assert.deepEqual(snapshot(f.root), before);
  }
  const repaired = f.run("install", "--scope", scope, "--mode", "standard");
  assert.equal(repaired.status, 0, repaired.output);
  assert.deepEqual(readdirSync(skills), standardSkills);
  for (const dir of [skills, codexSkills]) {
    for (const name of readdirSync(dir)) {
      assert.equal(JSON.parse(readFileSync(join(dir, name, markerName), "utf8")).mode, "standard");
    }
  }
});

test("an unresolved install still recovers interrupted pet state without changing skills or markers", t => {
  const f = fixture(t);
  const initial = f.run("install", "--mode", "minimum");
  assert.equal(initial.status, 0, initial.output);
  const path = join(f.skills, "codex-research", markerName);
  const marker = JSON.parse(readFileSync(path, "utf8"));
  marker.mode = "standard";
  writeFileSync(path, JSON.stringify(marker));
  const petRoot = join(f.home, ".codex-delegate");
  const state = join(petRoot, "pet-state");
  const staging = join(petRoot, ".pet-staging-interrupted");
  const previous = join(petRoot, ".pet-previous-interrupted");
  for (const dir of [state, staging, previous]) mkdirSync(dir, { recursive: true });
  writeFileSync(join(state, "updating"), "interrupted");
  writeFileSync(join(state, "token"), "keep token");
  writeFileSync(join(state, markerName), JSON.stringify({ package: "codex-delegate", hooks: {} }));
  writeFileSync(join(staging, "partial-bundle"), "unfinished download");
  writeFileSync(join(previous, "previous-bundle"), "keep previous bundle");
  const expected = snapshot(f.root);
  delete expected.home[".codex-delegate"]["pet-state"].updating;
  delete expected.home[".codex-delegate"][".pet-staging-interrupted"];
  const result = f.run("install");
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /unresolved.*--mode/i);
  assert.deepEqual(snapshot(f.root), expected);
});

for (const unknown of ["future-mode", null, 0]) test(`unknown recorded mode ${JSON.stringify(unknown)} needs an explicit repair`, t => {
  const f = fixture(t);
  const initial = f.run("install");
  assert.equal(initial.status, 0, initial.output);
  for (const name of readdirSync(f.skills)) {
    const path = join(f.skills, name, markerName);
    const marker = JSON.parse(readFileSync(path, "utf8"));
    marker.mode = unknown;
    writeFileSync(path, JSON.stringify(marker));
  }
  const before = snapshot(f.root);
  const refused = f.run("install");
  assert.equal(refused.status, 1, refused.output);
  assert.match(refused.output, /unresolved/i);
  assert.ok(refused.output.includes(JSON.stringify(unknown)), refused.output);
  assert.match(refused.output, /--mode/);
  assert.deepEqual(snapshot(f.root), before);
  const repaired = f.run("install", "--mode", "minimum");
  assert.equal(repaired.status, 0, repaired.output);
  assert.ok(!readdirSync(f.skills).includes("codex-implement"));
  assert.ok(!readdirSync(f.skills).includes("codex-computer-use"));
  for (const dir of [f.skills, join(f.codexHome, "skills")]) {
    for (const name of readdirSync(dir)) {
      assert.equal(JSON.parse(readFileSync(join(dir, name, markerName), "utf8")).mode, "minimum");
    }
  }
});

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

for (const scope of ["user", "project"]) {
  for (const invalid of ["standard", "future-mode", null, undefined]) {
    test(`doctor fails for unresolved ${scope} mode ${JSON.stringify(invalid)} and keeps standard checks`, t => {
      const f = fixture(t);
      for (const installedScope of ["user", "project"]) {
        const installed = f.run("install", "--scope", installedScope, "--mode", "minimum");
        assert.equal(installed.status, 0, installed.output);
      }
      const skills = scope === "user" ? f.skills : join(f.root, ".claude", "skills");
      const path = join(skills, "codex-research", markerName);
      const marker = JSON.parse(readFileSync(path, "utf8"));
      if (invalid === undefined) delete marker.mode;
      else marker.mode = invalid;
      writeFileSync(path, JSON.stringify(marker));
      writeFileSync(join(f.codexHome, "models_cache.json"), JSON.stringify({ models: [
        { slug: "gpt-6-astra", supported_reasoning_levels: [{ effort: "medium" }] },
        { slug: "gpt-6.1-sol", supported_reasoning_levels: [{ effort: "high" }] },
        { slug: "gpt-6-luna", supported_reasoning_levels: [{ effort: "max" }] },
      ] }));
      const before = snapshot(f.root);
      const result = f.run("doctor");
      assert.equal(result.status, 1, result.output);
      assert.match(result.output, new RegExp(`\\[FAIL\\] Delegation mode \\(${scope}\\).*unresolved.*--mode`));
      const modeLine = result.output.split("\n").find(line => line.includes(`Delegation mode (${scope})`));
      const found = invalid === undefined ? "standard" : invalid;
      assert.ok(modeLine.split(";")[0].includes(JSON.stringify(found)), modeLine);
      assert.match(modeLine, /found .*"minimum"/);
      for (const role of ["critic", "computer-user", "implementer", "researcher"]) {
        assert.match(result.output, new RegExp(`\\[OK  \\] Role ${role}:`));
      }
      assert.match(result.output, /Computer Use plugin/);
      assert.deepEqual(snapshot(f.root), before);
    });
  }
}

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
