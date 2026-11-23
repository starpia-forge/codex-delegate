import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { fakeCodex } from "./helpers/fake-codex.mjs";
import { snapshot } from "./helpers/directory-snapshot.mjs";
import { legacyBundle, release, unusedPetPort } from "./helpers/pet-release.mjs";

const cli = fileURLToPath(new URL("../bin/cli.mjs", import.meta.url));
const markerName = ".codex-delegate.json";

for (const invalid of ["standard", "future-mode"]) test(`list describes unresolved markers containing ${invalid}`, t => {
  const f = fixture(t);
  assert.equal(f.run("install", "--mode", "minimum").status, 0);
  const path = join(f.skills, "codex-research", markerName);
  const marker = JSON.parse(readFileSync(path, "utf8"));
  writeFileSync(path, JSON.stringify({ ...marker, mode: invalid }));
  const before = snapshot(f.root);
  const result = f.run("list");
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /Delegation mode: unresolved: found/);
  const line = result.output.split("\n").find(line => line.includes("Delegation mode:"));
  assert.ok(line.includes('"minimum"') && line.includes(JSON.stringify(invalid)), line);
  assert.doesNotMatch(line, /undefined/);
  assert.deepEqual(snapshot(f.root), before);
});
const standardSkills = [
  "ask-matt", "code-review", "codebase-design", "codex-code-review", "codex-computer-use",
  "codex-implement", "codex-plan-review", "codex-research", "diagnosing-bugs", "domain-modeling",
  "grill-me", "grill-with-docs", "grilling", "handoff", "implement", "implement-spec",
  "improve-codebase-architecture", "pr", "prototype", "research", "retro", "setup-matt-pocock-skills",
  "tdd", "teach", "to-questionnaire", "to-spec", "to-tickets", "triage", "wait-what", "wayfinder",
  "wizard", "writing-for-agents",
];

function fixture(t, cliPath = cli) {
  const root = mkdtempSync(join(tmpdir(), "delegation mode test "));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const fake = fakeCodex(root, `
if (process.argv.includes("--version")) console.log("codex-cli test");
else if (process.argv.slice(2).join(" ") === "login status") console.log("Logged in");
else process.exitCode = 1;
`);
  const run = (...args) => {
    const result = spawnSync(process.execPath, [cliPath, ...args], {
      cwd: root, env: fake.env, encoding: "utf8", windowsHide: true,
    });
    assert.equal(result.error, undefined);
    return { ...result, output: result.stdout + result.stderr };
  };
  // Pet release fixtures serve HTTP in this process, so these CLI calls must be async.
  const runAsync = (...args) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: root, env: fake.env, windowsHide: true,
    });
    let stdout = "", stderr = "";
    child.stdout.on("data", chunk => stdout += chunk);
    child.stderr.on("data", chunk => stderr += chunk);
    child.on("error", reject);
    child.on("close", status => resolve({ status, stdout, stderr, output: stdout + stderr }));
  });
  return { root, ...fake, run, runAsync, skills: join(fake.claudeHome, "skills") };
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

for (const mode of ["minimum", "standard"]) test(`plain reinstall retains ${mode} only in Claude Code skill markers`, t => {
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
      if (dir === f.skills) assert.equal(marker.mode, mode, `${dir}/${name}`);
      else assert.ok(!Object.hasOwn(marker, "mode"), `${dir}/${name}`);
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

test("minimum installs successfully when the packaged overlay group is absent", t => {
  const packageDir = mkdtempSync(join(tmpdir(), "delegation package test "));
  t.after(() => rmSync(packageDir, { recursive: true, force: true }));
  for (const path of ["bin", "package.json", "install-manifest.json", "pet/app/ui/pet-config.mjs", "src/runner", "skills/claude", "skills/codex"]) {
    cpSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), join(packageDir, path), { recursive: true });
  }
  const f = fixture(t, join(packageDir, "bin", "cli.mjs"));
  const result = f.run("install", "--mode", "minimum");
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /Delegation mode: minimum/);
  assert.ok(!existsSync(join(f.skills, "codex-implement")));
  assert.ok(!existsSync(join(f.skills, "codex-computer-use")));
  assert.deepEqual(readFileSync(join(f.skills, "implement", "SKILL.md")),
    readFileSync(join(packageDir, "skills", "claude", "implement", "SKILL.md")));
});

test("identical user and project skill directories are diagnosed once and never treated as mixed", t => {
  const f = fixture(t);
  f.env.CLAUDE_CONFIG_DIR = join(f.root, ".claude");
  assert.equal(f.run("install", "--mode", "minimum").status, 0);
  const before = snapshot(f.root);
  const preview = f.run("install", "--scope", "project", "--mode", "standard", "--dry-run");
  assert.equal(preview.status, 0, preview.output);
  assert.doesNotMatch(preview.output, /Mixed delegation modes/);
  const result = f.run("doctor");
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /Delegation mode \(user\).*minimum/);
  assert.doesNotMatch(result.output, /Delegation mode \(project\)/);
  assert.deepEqual(snapshot(f.root), before);
});

for (const minimumScope of ["user", "project"]) test(`a ${minimumScope}-only minimum install warns about unowned excluded skills in both scopes`, t => {
  const f = fixture(t);
  const directories = { user: f.skills, project: join(f.root, ".claude", "skills") };
  for (const dir of Object.values(directories)) {
    for (const name of ["codex-implement", "codex-computer-use"]) {
      mkdirSync(join(dir, name), { recursive: true });
      writeFileSync(join(dir, name, "SKILL.md"), `Personal ${name}\n`);
    }
  }
  const before = snapshot(f.root);
  const preview = f.run("install", "--scope", minimumScope, "--mode", "minimum", "--dry-run");
  assert.equal(preview.status, 0, preview.output);
  assert.deepEqual(snapshot(f.root), before);
  const installed = f.run("install", "--scope", minimumScope, "--mode", "minimum");
  const codexPreview = f.run("install", "--agent", "codex", "--dry-run");
  for (const result of [preview, installed, f.run("doctor"), codexPreview]) {
    assert.equal(result.status, 0, result.output);
    for (const scope of ["user", "project"]) {
      for (const name of ["codex-implement", "codex-computer-use"]) {
        assert.match(result.output, new RegExp(`Unowned skill excluded by delegation mode \\(${scope}\\): ${name}.*still reachable`));
        assert.deepEqual(snapshot(join(directories[scope], name)), before[scope === "user" ? "claude" : ".claude"].skills[name]);
      }
    }
  }
});

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
  for (const name of readdirSync(join(f.codexHome, "skills"))) {
    const marker = JSON.parse(readFileSync(join(f.codexHome, "skills", name, markerName), "utf8"));
    assert.ok(!Object.hasOwn(marker, "mode"), name);
  }
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

test("user minimum over project standard warns about winning workflows and reachable project delegation", t => {
  const f = fixture(t);
  assert.equal(f.run("install", "--mode", "minimum").status, 0);
  const before = snapshot(f.root);
  const preview = f.run("install", "--scope", "project", "--mode", "standard", "--dry-run");
  assert.deepEqual(snapshot(f.root), before);
  const installed = f.run("install", "--scope", "project", "--mode", "standard");
  assert.equal(installed.status, 0, installed.output);
  for (const result of [preview, installed, f.run("doctor")]) {
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /\[WARN\] Mixed delegation modes.*user minimum.*project standard/);
    assert.match(result.output, /implement: user \(minimum\) wins/);
    assert.match(result.output, /implement-spec: user \(minimum\) wins/);
    assert.match(result.output, /Skills excluded by delegation mode still reachable:.*codex-implement \(project\).*codex-computer-use \(project\)/);
  }
});

test("user standard over project minimum warns without refusing, including the dry-run preview", t => {
  const f = fixture(t);
  assert.equal(f.run("install", "--mode", "standard").status, 0);
  const before = snapshot(f.root);
  const preview = f.run("install", "--scope", "project", "--mode", "minimum", "--dry-run");
  assert.deepEqual(snapshot(f.root), before);
  const installed = f.run("install", "--scope", "project", "--mode", "minimum");
  for (const result of [preview, installed, f.run("doctor")]) {
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /\[WARN\] Mixed delegation modes.*user standard.*project minimum/);
    assert.match(result.output, /implement: user \(standard\) wins/);
    assert.match(result.output, /implement-spec: user \(standard\) wins/);
    assert.match(result.output, /Skills excluded by delegation mode still reachable:.*codex-implement \(user\).*codex-computer-use \(user\)/);
  }
});

test("mixed-scope warnings resolve each workflow and unowned excluded skill separately", t => {
  const f = fixture(t);
  assert.equal(f.run("install", "--mode", "minimum").status, 0);
  assert.equal(f.run("install", "--scope", "project", "--mode", "standard").status, 0);
  rmSync(join(f.skills, "implement"), { recursive: true });
  mkdirSync(join(f.skills, "codex-implement"));
  writeFileSync(join(f.skills, "codex-implement", "SKILL.md"), "Personal implementation delegation\n");
  const before = snapshot(f.skills);
  for (const result of [f.run("doctor"), f.run("install", "--scope", "project")]) {
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /\[WARN\] Mixed delegation modes/);
    assert.match(result.output, /implement: project \(standard\) wins/);
    assert.match(result.output, /implement-spec: user \(minimum\) wins/);
    assert.match(result.output, /Skills excluded by delegation mode still reachable: codex-implement \(user\), codex-computer-use \(project\)/);
    assert.deepEqual(snapshot(f.skills), before);
  }
});

for (const scope of ["user", "project"]) test(`minimum warns and leaves unowned ${scope} excluded skills untouched even with force`, t => {
  const f = fixture(t);
  const skills = scope === "user" ? f.skills : join(f.root, ".claude", "skills");
  for (const name of ["codex-implement", "codex-computer-use"]) {
    const dir = join(skills, name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "SKILL.md"), `User's own ${name} skill\n`);
    mkdirSync(join(dir, "assets"));
    writeFileSync(join(dir, "assets", "data.bin"), Buffer.from([0, 255, 128, 13, 10]));
  }
  const before = Object.fromEntries(["codex-implement", "codex-computer-use"].map(name => [
    name, snapshot(join(skills, name)),
  ]));
  for (const flags of [["--mode", "minimum", "--force", "--dry-run"], ["--mode", "minimum", "--force"], []]) {
    const result = f.run("install", "--scope", scope, ...flags);
    assert.equal(result.status, 0, result.output);
    assert.doesNotMatch(result.output, /remove \(delegation mode\)/);
    for (const [name, content] of Object.entries(before)) {
      assert.match(result.output, new RegExp(`\\[WARN\\] Unowned skill excluded by delegation mode \\(${scope}\\): ${name}.*still reachable`));
      assert.deepEqual(snapshot(join(skills, name)), content);
    }
  }
  const installed = snapshot(f.root);
  const diagnosed = f.run("doctor");
  assert.equal(diagnosed.status, 0, diagnosed.output);
  for (const name of Object.keys(before)) {
    assert.match(diagnosed.output, new RegExp(`\\[WARN\\] Unowned skill excluded by delegation mode \\(${scope}\\): ${name}.*still reachable`));
  }
  assert.deepEqual(snapshot(f.root), installed);
});

for (const scope of ["user", "project"]) {
  for (const unresolved of [false, true]) test(`uninstall removes every owned ${scope} skill with ${unresolved ? "unresolved" : "minimum"} mode and preserves unowned skills`, t => {
    const f = fixture(t);
    const initial = f.run("install", "--scope", scope, "--mode", unresolved ? "standard" : "minimum");
    assert.equal(initial.status, 0, initial.output);
    const skills = scope === "user" ? f.skills : join(f.root, ".claude", "skills");
    const codexSkills = scope === "user" ? join(f.codexHome, "skills") : join(f.root, ".agents", "skills");
    const marker = JSON.parse(readFileSync(join(skills, "implement", markerName), "utf8"));
    mkdirSync(join(skills, "retired-skill"));
    writeFileSync(join(skills, "retired-skill", markerName), JSON.stringify(marker));
    writeFileSync(join(skills, "retired-skill", "SKILL.md"), "Previously shipped skill\n");
    if (unresolved) {
      marker.mode = "future-mode";
      writeFileSync(join(skills, "implement", markerName), JSON.stringify(marker));
      // Keep codex-implement tool-owned, but make computer use personal.
      rmSync(join(skills, "codex-computer-use", markerName));
    } else {
      for (const name of ["codex-implement", "codex-computer-use"]) {
        mkdirSync(join(skills, name));
        writeFileSync(join(skills, name, "SKILL.md"), `Personal ${name}\n`);
      }
    }
    mkdirSync(join(codexSkills, "personal-worker"));
    writeFileSync(join(codexSkills, "personal-worker", "SKILL.md"), "Personal worker\n");
    const unowned = unresolved ? ["codex-computer-use"] : ["codex-computer-use", "codex-implement"];
    const expected = Object.fromEntries(unowned.map(name => [name, snapshot(join(skills, name))]));
    const worker = snapshot(join(codexSkills, "personal-worker"));
    const before = snapshot(f.root);
    const preview = f.run("uninstall", "--scope", scope, "--dry-run");
    assert.equal(preview.status, 0, preview.output);
    assert.deepEqual(snapshot(f.root), before);
    const removed = f.run("uninstall", "--scope", scope);
    assert.equal(removed.status, 0, removed.output);
    assert.deepEqual(snapshot(skills), expected);
    assert.deepEqual(snapshot(codexSkills), { "personal-worker": worker });
    const again = f.run("uninstall", "--scope", scope);
    assert.equal(again.status, 0, again.output);
    assert.match(again.output, /nothing installed/);
    assert.deepEqual(snapshot(skills), expected);
  });
}

test("switching delegation modes keeps a disabled pet disabled without downloads or hook changes", async t => {
  const f = fixture(t);
  Object.assign(f.env, {
    CODEX_DELEGATE_TEST_PLATFORM: "win32", CODEX_DELEGATE_PET_TEST_WEBVIEW2: "present",
    CODEX_DELEGATE_PET_PORT: await unusedPetPort(t),
  });
  const r = await release(t, f);
  const settingsPath = join(f.claudeHome, "settings.json");
  const settings = '{ "theme": "dark", "hooks": { "Stop": [] } }\n';
  writeFileSync(settingsPath, settings);
  for (const mode of ["standard", "minimum", "standard"]) {
    const result = await f.runAsync("install", "--mode", mode);
    assert.equal(result.status, 0, result.output);
    assert.deepEqual(r.requests, []);
    assert.equal(existsSync(join(f.home, ".codex-delegate", "pet-state")), false);
    assert.equal(existsSync(join(f.home, ".codex-delegate", "pet")), false);
    assert.equal(readFileSync(settingsPath, "utf8"), settings);
    const listed = await f.runAsync("list");
    assert.equal(listed.status, 0, listed.output);
    assert.match(listed.output, /Pet: not installed/);
    assert.match(listed.output, new RegExp(`Delegation mode: ${mode}`));
  }
});

test("switching delegation modes keeps the pet enabled and updates it like a plain install", async t => {
  const f = fixture(t);
  Object.assign(f.env, {
    CODEX_DELEGATE_TEST_PLATFORM: "win32", CODEX_DELEGATE_PET_TEST_WEBVIEW2: "present",
    CODEX_DELEGATE_PET_PORT: await unusedPetPort(t),
  });
  const r = await release(t, f);
  const initial = await f.runAsync("install", "--with-pet");
  assert.equal(initial.status, 0, initial.output);
  const petRoot = join(f.home, ".codex-delegate");
  const state = join(petRoot, "pet-state");
  const markerPath = join(state, markerName);
  const settingsPath = join(f.claudeHome, "settings.json");
  const token = readFileSync(join(state, "token"));
  const settings = readFileSync(settingsPath);
  const preferences = '{"hidden":true,"future":1}\n';
  writeFileSync(join(state, "pet-preferences.json"), preferences);
  writeFileSync(join(state, "sessions.json"), "keep sessions");
  for (const flags of [[], ["--mode", "minimum"], ["--mode", "standard"]]) {
    const marker = JSON.parse(readFileSync(markerPath, "utf8"));
    marker.bundle = legacyBundle;
    writeFileSync(markerPath, JSON.stringify(marker));
    writeFileSync(join(petRoot, "pet", "obsolete.txt"), "old bundle");
    r.requests.length = 0;
    const result = await f.runAsync("install", ...flags);
    assert.equal(result.status, 0, result.output);
    assert.deepEqual(r.requests, r.paths);
    assert.deepEqual(JSON.parse(readFileSync(markerPath, "utf8")).bundle, r.bundle);
    assert.equal(existsSync(join(petRoot, "pet", "obsolete.txt")), false);
    assert.deepEqual(readFileSync(join(state, "token")), token);
    assert.equal(readFileSync(join(state, "pet-preferences.json"), "utf8"), preferences);
    assert.equal(readFileSync(join(state, "sessions.json"), "utf8"), "keep sessions");
    assert.deepEqual(readFileSync(settingsPath), settings);
    const listed = await f.runAsync("list");
    assert.equal(listed.status, 0, listed.output);
    assert.match(listed.output, /Pet: enabled, .*hidden/);
    assert.match(listed.output, new RegExp(`Delegation mode: ${flags[1] ?? "standard"}`));
  }
});

for (const mode of ["minimum", "standard"]) test(`explicit pet flags combine with delegation mode ${mode}`, async t => {
  const f = fixture(t);
  Object.assign(f.env, {
    CODEX_DELEGATE_TEST_PLATFORM: "win32", CODEX_DELEGATE_PET_TEST_WEBVIEW2: "present",
    CODEX_DELEGATE_PET_PORT: await unusedPetPort(t),
  });
  const r = await release(t, f);
  const settingsPath = join(f.claudeHome, "settings.json");
  writeFileSync(settingsPath, '{"theme":"dark"}');
  const installed = await f.runAsync("install", "--mode", mode, "--with-pet");
  assert.equal(installed.status, 0, installed.output);
  assert.deepEqual(r.requests, r.paths);
  assert.match((await f.runAsync("list")).output, /Pet: enabled/);
  r.requests.length = 0;
  const otherMode = mode === "minimum" ? "standard" : "minimum";
  const removed = await f.runAsync("install", "--mode", otherMode, "--without-pet");
  assert.equal(removed.status, 0, removed.output);
  assert.deepEqual(r.requests, []);
  const listed = await f.runAsync("list");
  assert.equal(listed.status, 0, listed.output);
  assert.match(listed.output, new RegExp(`Delegation mode: ${otherMode}`));
  assert.match(listed.output, /Pet: not installed/);
  assert.deepEqual(JSON.parse(readFileSync(settingsPath, "utf8")), { theme: "dark", hooks: {} });
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
      const marker = JSON.parse(readFileSync(join(dir, name, markerName), "utf8"));
      if (dir === skills) assert.equal(marker.mode, "standard");
      else assert.ok(!Object.hasOwn(marker, "mode"));
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
      const marker = JSON.parse(readFileSync(join(dir, name, markerName), "utf8"));
      if (dir === f.skills) assert.equal(marker.mode, "minimum");
      else assert.ok(!Object.hasOwn(marker, "mode"));
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
