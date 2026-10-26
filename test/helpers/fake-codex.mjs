import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";

export function fakeCodex(root, source) {
  const home = join(root, "home");
  const bin = join(root, "bin");
  const codexHome = join(root, "codex");
  const claudeHome = join(root, "claude");
  for (const dir of [home, bin, codexHome, claudeHome]) mkdirSync(dir);
  writeFileSync(join(bin, "fake-codex.cjs"), source);
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
  });
  return { home, bin, codexHome, claudeHome, env };
}
