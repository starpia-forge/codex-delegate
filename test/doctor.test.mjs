import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const cli = fileURLToPath(new URL("../bin/cli.mjs", import.meta.url));

function runDoctor(t, config) {
  const root = mkdtempSync(join(tmpdir(), "codex doctor test "));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const home = join(root, "home");
  const codexHome = join(root, "codex");
  const claudeHome = join(root, "claude");
  const bin = join(root, "bin");
  for (const dir of [home, codexHome, claudeHome, bin]) mkdirSync(dir);
  if (config !== undefined) writeFileSync(join(codexHome, "config.toml"), config);
  writeFileSync(join(codexHome, "models_cache.json"), JSON.stringify({ models: [
    { slug: "gpt-6-astra", supported_reasoning_levels: [{ effort: "medium" }] },
    { slug: "gpt-6.1-sol", supported_reasoning_levels: [{ effort: "medium" }] },
    { slug: "gpt-6-luna", supported_reasoning_levels: [{ effort: "max" }] },
  ] }));
  writeFileSync(join(bin, "fake-codex.cjs"), `
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--version") console.log("codex-cli 0.164.0");
else if (args.join(" ") === "login status") console.error("Logged in using ChatGPT");
else process.exitCode = 1;
`);
  if (process.platform === "win32") {
    writeFileSync(join(bin, "codex.cmd"), `@echo off\r\n"${process.execPath}" "%~dp0fake-codex.cjs" %*\r\n`);
  } else {
    const executable = join(bin, "codex");
    writeFileSync(executable, `#!/bin/sh\nexec '${process.execPath.replace(/'/g, "'\\''")}' "$(dirname "$0")/fake-codex.cjs" "$@"\n`);
    chmodSync(executable, 0o755);
  }
  const env = { ...process.env };
  const pathKey = Object.keys(env).find(key => key.toUpperCase() === "PATH");
  const systemPath = env[pathKey] ?? "";
  for (const key of Object.keys(env)) {
    if (["PATH", "HOME", "USERPROFILE", "HOMEDRIVE", "HOMEPATH", "CODEX_HOME", "CLAUDE_CONFIG_DIR"].includes(key.toUpperCase())) delete env[key];
  }
  Object.assign(env, {
    PATH: `${bin}${delimiter}${systemPath}`,
    HOME: home,
    USERPROFILE: home,
    CODEX_HOME: codexHome,
    CLAUDE_CONFIG_DIR: claudeHome,
  });
  const result = spawnSync(process.execPath, [cli, "doctor"], {
    cwd: root, env, encoding: "utf8", timeout: 15000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /^  \[OK  \] Role astra-cu: gpt-6-astra \/ medium$/m);
  return result.stdout;
}

test("doctor reports OK when the Computer Use plugin is enabled", t => {
  const stdout = runDoctor(t, '[plugins."computer-use@openai-bundled"]\nenabled = true\n');
  assert.match(stdout, /^  \[OK  \] Computer Use plugin enabled(?: - .*)?$/m);
});

test("doctor warns without failing when the Computer Use plugin is disabled", t => {
  const stdout = runDoctor(t, '[plugins."computer-use@openai-bundled"]\nenabled = false\n[plugins.other]\nenabled = true\n');
  assert.match(stdout, /^  \[WARN\] Computer Use plugin enabled(?: - .*)?$/m);
});

test("doctor warns without failing when the Computer Use plugin section is absent", t => {
  const stdout = runDoctor(t, '# [plugins."computer-use@openai-bundled"]\n[plugins.other]\nenabled = true\n');
  assert.match(stdout, /^  \[WARN\] Computer Use plugin enabled(?: - .*)?$/m);
});

test("doctor warns without failing when config.toml is missing", t => {
  const stdout = runDoctor(t);
  assert.match(stdout, /^  \[WARN\] Computer Use plugin enabled(?: - .*)?$/m);
});
