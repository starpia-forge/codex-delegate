import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));

function snapshot(dir) {
  return Object.fromEntries(readdirSync(dir, { withFileTypes: true }).map(entry => [entry.name,
    entry.isDirectory() ? snapshot(join(dir, entry.name)) : readFileSync(join(dir, entry.name)).toString("base64")
  ]));
}

function fixture(t) {
  const scratch = join(root, ".scratch");
  mkdirSync(scratch, { recursive: true });
  const dir = mkdtempSync(join(scratch, "build-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const write = (path, content) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  };
  const upstream = join(dir, "upstream");
  write(join(upstream, ".claude-plugin/plugin.json"), JSON.stringify({ version: "test", skills: ["skills/engineering/implement"] }));
  write(join(upstream, "skills/engineering/implement/SKILL.md"), "upstream\n");
  write(join(upstream, "LICENSE"), "test license\n");
  const git = (...args) => execFileSync("git", args, { cwd: upstream, encoding: "utf8", windowsHide: true }).trim();
  git("init", "--quiet");
  git("-c", "core.autocrlf=false", "add", ".");
  git("-c", "user.name=Build Test", "-c", "user.email=build@example.invalid", "-c", "core.hooksPath=", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "test fixture");
  const commit = git("rev-parse", "HEAD");
  const project = join(dir, "project");
  mkdirSync(join(project, "scripts"), { recursive: true });
  copyFileSync(join(root, "scripts/build.mjs"), join(project, "scripts/build.mjs"));
  mkdirSync(join(project, "src/skills"), { recursive: true });
  write(join(project, "src/codex-skills.json"), '["implement"]\n');
  write(join(project, "upstream.json"), JSON.stringify({ repo: upstream, commit, version: "unchanged pin" }) + "\n");
  write(join(project, "skills/claude/existing/SKILL.md"), "existing generated output\n");
  const temp = join(dir, "temp");
  mkdirSync(temp);
  return {
    project,
    writePatch: (path, content) => write(join(project, "patches/claude", path), content),
    run: () => spawnSync(process.execPath, [join(project, "scripts/build.mjs")], {
      cwd: project, encoding: "utf8", windowsHide: true,
      env: { ...process.env, TMPDIR: temp, TMP: temp, TEMP: temp },
    }),
  };
}

const patch = (before, after) => `diff --git a/engineering/implement/SKILL.md b/engineering/implement/SKILL.md
--- a/engineering/implement/SKILL.md
+++ b/engineering/implement/SKILL.md
@@ -1 +1 @@
-${before}
+${after}
`;

test("a failing standard patch preserves generated skills and the upstream pin", t => {
  const f = fixture(t);
  f.writePatch("01-shared.patch", patch("upstream", "shared"));
  f.writePatch("standard/01-delegation.patch", patch("shared", "delegation"));
  f.writePatch("standard/02-broken.patch", patch("missing", "broken"));
  const skills = snapshot(join(f.project, "skills"));
  const pin = readFileSync(join(f.project, "upstream.json"));
  const result = f.run();
  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stderr, /claude[/\\]standard[/\\]02-broken.patch does not apply/);
  assert.deepEqual(snapshot(join(f.project, "skills")), skills);
  assert.deepEqual(readFileSync(join(f.project, "upstream.json")), pin);
});

test("a failing shared patch preserves generated skills and the upstream pin", t => {
  const f = fixture(t);
  f.writePatch("01-shared.patch", patch("upstream", "shared"));
  f.writePatch("02-broken.patch", patch("missing", "broken"));
  const skills = snapshot(join(f.project, "skills"));
  const pin = readFileSync(join(f.project, "upstream.json"));
  const result = f.run();
  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stderr, /claude[/\\]02-broken.patch does not apply/);
  assert.deepEqual(snapshot(join(f.project, "skills")), skills);
  assert.deepEqual(readFileSync(join(f.project, "upstream.json")), pin);
});
