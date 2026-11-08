import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";

export function fakeCodex(root, source) {
  const home = join(root, "home");
  const bin = join(root, "bin");
  const codexHome = join(root, "codex");
  const claudeHome = join(root, "claude");
  for (const dir of [home, bin, codexHome, claudeHome]) mkdirSync(dir);
  writeFileSync(join(bin, "fake-worker.cjs"), source);
  writeFileSync(join(bin, "fake-codex.cjs"), `
const fs = require("node:fs");
const args = process.argv.slice(2);
if (args.join(" ") === "mcp get node_repl --json") {
  fs.writeFileSync(process.env.FAKE_CODEX_PROBE_RECORD, JSON.stringify({
    args, cwd: process.cwd(), codexHome: process.env.CODEX_HOME, pid: process.pid,
    launch: JSON.parse(process.env.FAKE_CODEX_LAUNCH || "null"),
  }));
  if (process.env.FAKE_CODEX_NODE_REPL === "defined") {
    console.log(JSON.stringify({ name: "node_repl", enabled: true }));
  } else if (process.env.FAKE_CODEX_NODE_REPL === "failure") {
    console.error("Could not load configuration");
    process.exitCode = 2;
  } else if (process.env.FAKE_CODEX_NODE_REPL === "unparseable") {
    console.log("not JSON");
  } else if (process.env.FAKE_CODEX_NODE_REPL === "wrong-name") {
    console.log(JSON.stringify({ name: "another_server" }));
  } else if (process.env.FAKE_CODEX_NODE_REPL === "null") {
    console.log("null");
  } else if (process.env.FAKE_CODEX_NODE_REPL === "failed-defined") {
    console.log(JSON.stringify({ name: "node_repl" }));
    process.exitCode = 1;
  } else if (process.env.FAKE_CODEX_NODE_REPL === "absent-other") {
    console.error("Error: No MCP server named 'another_server' found.");
    process.exitCode = 1;
  } else if (["hang", "defined-open-pipes"].includes(process.env.FAKE_CODEX_NODE_REPL)) {
    const descendant = require("node:child_process").spawn(process.execPath,
      ["-e", "setInterval(() => {}, 1000)"], {
        stdio: ["ignore", "inherit", "inherit"],
        // Survive the probe's temporary Windows console closing on exit.
        detached: process.env.FAKE_CODEX_NODE_REPL === "defined-open-pipes", windowsHide: true,
      });
    fs.writeFileSync(process.env.FAKE_CODEX_PROBE_RECORD, JSON.stringify({
      args, cwd: process.cwd(), codexHome: process.env.CODEX_HOME, pid: process.pid, descendantPid: descendant.pid,
    }));
    if (process.env.FAKE_CODEX_NODE_REPL === "defined-open-pipes") {
      console.log(JSON.stringify({ name: "node_repl", enabled: true }));
      process.exit(0);
    }
    setInterval(() => {}, 1000);
  } else {
    console.error("Error: No MCP server named 'node_repl' found.");
    process.exitCode = 1;
  }
} else require("./fake-worker.cjs");
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
    if (["PATH", "HOME", "USERPROFILE", "HOMEDRIVE", "HOMEPATH", "CODEX_HOME", "CLAUDE_CONFIG_DIR"].includes(key.toUpperCase())) delete env[key];
  }
  Object.assign(env, {
    PATH: `${bin}${delimiter}${systemPath}`,
    HOME: home,
    USERPROFILE: home,
    CODEX_HOME: codexHome,
    CLAUDE_CONFIG_DIR: claudeHome,
    FAKE_CODEX_RECORD: join(root, "record.json"),
    FAKE_CODEX_PROBE_RECORD: join(root, "probe.json"),
  });
  return { home, bin, codexHome, claudeHome, env };
}
