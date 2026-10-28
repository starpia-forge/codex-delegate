import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { fakeCodex } from "./helpers/fake-codex.mjs";
import { unusedPetPort } from "./helpers/pet-release.mjs";

const cli = fileURLToPath(new URL("../bin/cli.mjs", import.meta.url));

async function runDoctor(t, config, { overrides, status = 0 } = {}) {
  const root = mkdtempSync(join(tmpdir(), "codex doctor test "));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const { home, codexHome, env } = fakeCodex(root, `
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--version") console.log("codex-cli 0.164.0");
else if (args.join(" ") === "login status") console.error("Logged in using ChatGPT");
else process.exitCode = 1;
`);
  Object.assign(env, { CODEX_DELEGATE_PET_PORT: await unusedPetPort(t), CODEX_DELEGATE_PET_TEST_WEBVIEW2: "present" });
  if (config !== undefined) writeFileSync(join(codexHome, "config.toml"), config);
  if (overrides) {
    mkdirSync(join(home, ".codex-delegate"));
    writeFileSync(join(home, ".codex-delegate", "roles.json"), JSON.stringify(overrides));
  }
  writeFileSync(join(codexHome, "models_cache.json"), JSON.stringify({ models: [
    { slug: "gpt-6-astra", supported_reasoning_levels: [{ effort: "medium" }] },
    { slug: "gpt-6.1-sol", supported_reasoning_levels: [{ effort: "high" }] },
    { slug: "gpt-6-luna", supported_reasoning_levels: [{ effort: "max" }] },
  ] }));
  const result = spawnSync(process.execPath, [cli, "doctor"], {
    cwd: root, env, encoding: "utf8", timeout: 15000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, status, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /^  \[OK  \] Role computer-user: gpt-6-astra \/ medium$/m);
  return result.stdout;
}

test("doctor reports OK when the Computer Use plugin is enabled", async t => {
  const stdout = await runDoctor(t, '[plugins."computer-use@openai-bundled"]\nenabled = true\n');
  assert.match(stdout, /^  \[OK  \] Computer Use plugin enabled(?: - .*)?$/m);
});

test("doctor warns without failing when the Computer Use plugin is disabled", async t => {
  const stdout = await runDoctor(t, '[plugins."computer-use@openai-bundled"]\nenabled = false\n[plugins.other]\nenabled = true\n');
  assert.match(stdout, /^  \[WARN\] Computer Use plugin enabled(?: - .*)?$/m);
});

test("doctor warns without failing when the Computer Use plugin section is absent", async t => {
  const stdout = await runDoctor(t, '# [plugins."computer-use@openai-bundled"]\n[plugins.other]\nenabled = true\n');
  assert.match(stdout, /^  \[WARN\] Computer Use plugin enabled(?: - .*)?$/m);
});

test("doctor warns without failing when config.toml is missing", async t => {
  const stdout = await runDoctor(t);
  assert.match(stdout, /^  \[WARN\] Computer Use plugin enabled(?: - .*)?$/m);
});

test("doctor fails when role overrides name an unknown role", async t => {
  const stdout = await runDoctor(t, undefined, { overrides: { sol: { effort: "high" } }, status: 1 });
  assert.match(stdout, /^  \[FAIL\] Role overrides - .*roles\.json: unknown role "sol" \(expected one of: critic, computer-user, implementer, researcher\)/m);
});


for (const [form, config] of [
  ["inline table", '[plugins]\n"computer-use@openai-bundled" = { enabled = VALUE }'],
  ["top-level dotted key", 'plugins."computer-use@openai-bundled".enabled = VALUE'],
  ["plugins dotted key", '[plugins]\n"computer-use@openai-bundled".enabled = VALUE'],
]) {
  for (const enabled of [true, false]) {
    test(`doctor reads ${form} with enabled = ${enabled}`, async t => {
      const stdout = await runDoctor(t, config.replace("VALUE", String(enabled)) + "\n");
      assert.match(stdout, enabled
        ? /^  \[OK  \] Computer Use plugin enabled(?: - .*)?$/m
        : /^  \[WARN\] Computer Use plugin enabled(?: - .*)?$/m);
    });
  }
}
