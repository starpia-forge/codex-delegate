#!/usr/bin/env node
// Runs one Codex worker role non-interactively.
//
//   node codex-run.mjs <role> --prompt-file <path> [--out <path>] [--cwd <dir>]
//
// Roles come from roles.json next to this script; fields in
// ~/.codex-delegate/roles.json override them per role.
//
// The prompt is piped to `codex exec` on stdin. Codex's final message is written
// to --out (default: result.md next to the prompt file) and the full event log
// to <out>.log. Exit code is Codex's exit code.

import { spawn } from "node:child_process";
import { createWriteStream, existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const USER_ROLES = join(homedir(), ".codex-delegate", "roles.json");

const PRINT_LIMIT = 6000;

function fail(message) {
  console.error(`codex-run: ${message}`);
  process.exit(2);
}

function parseArgs(argv) {
  const [role, ...rest] = argv;
  const opts = {};
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i];
    const value = rest[i + 1];
    if (!key?.startsWith("--") || value === undefined) fail(`bad argument near "${key}"`);
    opts[key.slice(2)] = value;
  }
  return { role, opts };
}

// cmd.exe quoting: on Windows codex is an npm `codex.cmd` shim, which needs a shell.
function quote(arg) {
  return /[\s"&|<>^]/.test(arg) ? `"${arg.replace(/"/g, '""')}"` : arg;
}

const { role, opts } = parseArgs(process.argv.slice(2));
const roles = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "roles.json"), "utf8"));
const overrides = existsSync(USER_ROLES) ? JSON.parse(readFileSync(USER_ROLES, "utf8")) : {};
const config = roles[role] && { ...roles[role], ...overrides[role] };
if (!config) fail(`unknown role "${role}" (expected one of: ${Object.keys(roles).join(", ")})`);
if (!opts["prompt-file"]) fail("--prompt-file is required");

const promptFile = resolve(opts["prompt-file"]);
if (!existsSync(promptFile)) fail(`prompt file not found: ${promptFile}`);
const out = resolve(opts.out ?? join(dirname(promptFile), "result.md"));
const cwd = resolve(opts.cwd ?? process.cwd());

const args = [
  "exec",
  "-m", config.model,
  "-c", `model_reasoning_effort=${config.effort}`,
  "-s", config.sandbox,
  "-C", cwd,
  "-o", out,
];
if (config.webSearch) args.push("-c", "web_search=live");
args.push("-");

// The sandbox runs as a different OS user on Windows, so git refuses the repo
// as "dubious ownership" unless every directory is marked safe.
const env = {
  ...process.env,
  GIT_CONFIG_COUNT: "1",
  GIT_CONFIG_KEY_0: "safe.directory",
  GIT_CONFIG_VALUE_0: "*",
};

console.log(`codex-run: role=${role} model=${config.model} effort=${config.effort} sandbox=${config.sandbox}`);
console.log(`codex-run: cwd=${cwd}`);

const log = createWriteStream(`${out}.log`);
const child =
  process.platform === "win32"
    ? spawn(["codex", ...args.map(quote)].join(" "), { cwd, env, shell: true })
    : spawn("codex", args, { cwd, env });
child.stdout.pipe(log, { end: false });
child.stderr.pipe(log, { end: false });
child.stdin.end(readFileSync(promptFile));

child.on("error", (err) => fail(`could not start codex (is it installed and on PATH?): ${err.message}`));
child.on("close", (code) => {
  log.end();
  console.log(`codex-run: exit=${code} result=${out} log=${out}.log`);
  if (existsSync(out)) {
    const result = readFileSync(out, "utf8");
    console.log("----- result -----");
    console.log(result.length > PRINT_LIMIT ? `${result.slice(0, PRINT_LIMIT)}\n[truncated - read ${out} for the rest]` : result);
  } else {
    console.log(`codex-run: no result written - check ${out}.log`);
  }
  process.exit(code ?? 1);
});
