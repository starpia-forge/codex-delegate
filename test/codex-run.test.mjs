import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const runner = fileURLToPath(new URL("../src/runner/codex-run.mjs", import.meta.url));

function runRole(t, role, overrides) {
  const root = mkdtempSync(join(tmpdir(), "codex runner test "));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const home = join(root, "home");
  const bin = join(root, "bin");
  mkdirSync(home);
  mkdirSync(bin);
  if (overrides) {
    mkdirSync(join(home, ".codex-delegate"));
    writeFileSync(join(home, ".codex-delegate", "roles.json"), JSON.stringify(overrides));
  }
  const fake = join(bin, "fake-codex.cjs");
  writeFileSync(fake, `
const fs = require("node:fs");
const args = process.argv.slice(2);
let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => { stdin += chunk; });
process.stdin.on("end", () => {
  fs.writeFileSync(process.env.FAKE_CODEX_RECORD, JSON.stringify({ args, stdin }));
  fs.writeFileSync(args[args.indexOf("-o") + 1], "Fake worker result");
});
`);
  if (process.platform === "win32") {
    writeFileSync(join(bin, "codex.cmd"), `@echo off\r\n"${process.execPath}" "%~dp0fake-codex.cjs" %*\r\n`);
  } else {
    const executable = join(bin, "codex");
    writeFileSync(executable, `#!/bin/sh\nexec '${process.execPath.replace(/'/g, "'\\''")}' "$(dirname "$0")/fake-codex.cjs" "$@"\n`);
    chmodSync(executable, 0o755);
  }
  const env = { ...process.env };
  // Windows environment keys are case-insensitive; keep exactly one PATH key.
  const pathKey = Object.keys(env).find(key => key.toUpperCase() === "PATH");
  const systemPath = env[pathKey] ?? "";
  for (const key of Object.keys(env)) {
    if (["PATH", "HOME", "USERPROFILE", "HOMEDRIVE", "HOMEPATH"].includes(key.toUpperCase())) delete env[key];
  }
  Object.assign(env, {
    PATH: `${bin}${delimiter}${systemPath}`,
    HOME: home,
    USERPROFILE: home,
    FAKE_CODEX_RECORD: join(root, "record.json"),
  });
  const prompt = join(root, "prompt.md");
  const out = join(root, "result.md");
  writeFileSync(prompt, "Report what you observe.\n");
  const result = spawnSync(process.execPath, [runner, role, "--prompt-file", prompt, "--cwd", root], {
    cwd: root, env, encoding: "utf8", timeout: 15000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /Fake worker result/);
  return { args: JSON.parse(readFileSync(env.FAKE_CODEX_RECORD, "utf8")).args, stdout: result.stdout, cwd: root, out };
}

test("astra-cu bypasses approvals and sandbox for computer use", t => {
  const { args, stdout, cwd, out } = runRole(t, "astra-cu");
  assert.deepEqual(args, [
    "exec", "-m", "gpt-6-astra", "-c", "model_reasoning_effort=medium",
    "--dangerously-bypass-approvals-and-sandbox", "-C", cwd, "-o", out, "-",
  ]);
  assert.match(stdout, /role=astra-cu model=gpt-6-astra effort=medium .*--dangerously-bypass-approvals-and-sandbox/);
  assert.doesNotMatch(stdout, /sandbox=workspace-write/);
});

for (const { role, model, effort, sandbox, extra } of [
  { role: "astra", model: "gpt-6-astra", effort: "medium", sandbox: "read-only", extra: [] },
  { role: "sol", model: "gpt-6.1-sol", effort: "medium", sandbox: "workspace-write", extra: [] },
  { role: "luna", model: "gpt-6-luna", effort: "max", sandbox: "read-only", extra: ["-c", "web_search=live"] },
]) {
  test(`${role} keeps its existing sandbox and Codex arguments`, t => {
    const { args, stdout, cwd, out } = runRole(t, role);
    assert.deepEqual(args, [
      "exec", "-m", model, "-c", `model_reasoning_effort=${effort}`,
      "-s", sandbox, "-C", cwd, "-o", out, ...extra, "-",
    ]);
    assert.ok(stdout.includes(`role=${role} model=${model} effort=${effort} sandbox=${sandbox}`));
  });
}

test("a user override disables the astra-cu bypass and restores its sandbox", t => {
  const { args, stdout, cwd, out } = runRole(t, "astra-cu", {
    "astra-cu": { dangerouslyBypassApprovalsAndSandbox: false },
  });
  assert.deepEqual(args, [
    "exec", "-m", "gpt-6-astra", "-c", "model_reasoning_effort=medium",
    "-s", "workspace-write", "-C", cwd, "-o", out, "-",
  ]);
  assert.match(stdout, /role=astra-cu model=gpt-6-astra effort=medium sandbox=workspace-write/);
  assert.doesNotMatch(stdout, /--dangerously-bypass-approvals-and-sandbox/);
});
