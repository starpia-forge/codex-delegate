import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { petHealth, readPetMarker, readPetPin } from "./pet.mjs";
import { resolvePets } from "../pet/app/ui/pet-config.mjs";

const configProblems = {
  "config-invalid": "invalid JSON or object",
  "scale-out-of-range": "must be a number from 0.3 to 1.0",
  "unknown-key": "unknown key",
  "pets-invalid": "must be an object mapping slots to pet names",
  "pet-name": "invalid pet name",
};

const packageProblems = {
  "pet-not-found": "package not found",
  "manifest-json": "invalid manifest JSON",
  "manifest-field": "manifest field must be a non-empty string",
  "sheet-path": "unsafe spritesheet path",
  "sheet-missing": "spritesheet missing",
  "sheet-format": "spritesheet must be PNG or WebP",
  "sheet-size": "spritesheet must be 1536 x 1872 pixels",
  "sheet-not-transparent": "spritesheet must be transparent",
};

function hasWebView2() {
  const override = process.env.CODEX_DELEGATE_PET_TEST_WEBVIEW2;
  if (override === "present" || override === "missing") return override === "present";
  const client = "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";
  return ["HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients",
    "HKLM\\SOFTWARE\\Microsoft\\EdgeUpdate\\Clients", "HKCU\\Software\\Microsoft\\EdgeUpdate\\Clients"].some(base => {
    const result = spawnSync("reg", ["query", `${base}\\${client}`, "/v", "pv"], {
      encoding: "utf8", windowsHide: true, timeout: 1500,
    });
    const version = result.status === 0 && result.stdout?.match(/^\s*pv\s+REG_\w+\s+(.*?)\s*$/mi)?.[1];
    return !!version && version !== "0.0.0.0";
  });
}

export async function checkPet(root, check) {
  const marker = readPetMarker();
  if (!marker) return;
  let pin;
  try { pin = readPetPin(root); }
  catch (error) { check("fail", "Pet bundle", `cannot read pet pin: ${error.message}`); }
  const bundle = join(homedir(), ".codex-delegate", "pet");
  const missing = [bundle, join(bundle, "codex-delegate-pet.exe")].find(path => !existsSync(path));
  const matches = pin && marker.bundle?.tag === pin.tag && marker.bundle?.sha256 === pin.sha256;
  if (!pin) { /* The pin failure is reported above; continue other checks. */ }
  else if (missing) check("fail", "Pet bundle", `missing ${missing}; run codex-delegate install --with-pet`);
  else check(matches ? "ok" : "warn", "Pet bundle", matches ? pin.version
    : `installed ${marker.bundle?.version ?? "unknown"} (${marker.bundle?.tag ?? "unknown"}), expected ${pin.version} (${pin.tag}); run codex-delegate install --with-pet`);

  try {
    const settings = JSON.parse(readFileSync(marker.settingsPath, "utf8"));
    const missing = Object.entries(marker.hooks ?? {}).filter(([event, command]) => {
      const groups = settings?.hooks?.[event];
      return !Array.isArray(groups) || !groups.some(group => Array.isArray(group?.hooks)
        && group.hooks.some(leaf => leaf?.command === command));
    }).map(([event]) => event);
    check(missing.length ? "fail" : "ok", "Pet hooks", missing.length
      ? `missing ${missing.join(", ")} in ${marker.settingsPath}` : marker.settingsPath);
  } catch (error) {
    check("fail", "Pet hooks", `cannot read settings ${marker.settingsPath}: ${error.message}`);
  }

  const platform = process.env.CODEX_DELEGATE_TEST_PLATFORM || process.platform;
  const currentSettings = resolve(process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), "settings.json");
  const normalize = path => platform === "win32" ? resolve(path).toLowerCase() : resolve(path);
  if (typeof marker.settingsPath === "string" && normalize(marker.settingsPath) !== normalize(currentSettings)) {
    check("warn", "Pet hooks config directory", `hooks in ${marker.settingsPath} live in a different config directory than the current one (${currentSettings})`);
  }
  if (platform === "win32") {
    const present = hasWebView2();
    check(present ? "ok" : "fail", "Pet WebView2 runtime", present ? "Evergreen runtime present"
      : "pet window cannot appear; install the WebView2 Evergreen runtime");
  }
  const resolved = await resolvePets({ home: homedir(), codexHome: process.env.CODEX_HOME,
    readFile: async path => {
      try { return await readFile(path); }
      catch (error) {
        if (error.code === "ENOENT") return null;
        // Unreadable files are invalid packages/configuration too. Let the
        // resolver report the affected slots and their bundled fallback.
        return Buffer.alloc(0);
      }
    },
  });
  const configIssues = resolved.issues.filter(issue => Object.hasOwn(configProblems, issue.code));
  check(configIssues.length ? "warn" : "ok", "Pet configuration", configIssues.length
    ? `${configIssues.map(issue => `${issue.key ?? "pet.json"}: ${configProblems[issue.code]}`).join("; ")}; ignored, default used`
    : "valid (missing keys use bundled defaults)");
  const packageIssues = resolved.issues.filter(issue => issue.slot);
  if (!packageIssues.length) check("ok", "Pet packages", "valid (bundled defaults where unconfigured)");
  for (const issue of packageIssues) {
    const source = issue.dir ? `${issue.source}: ${issue.dir}`
      : `searched ${join(homedir(), ".codex-delegate", "pets", issue.name)} and ${join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "pets", issue.name)}`;
    check("warn", `Pet packages (${issue.slot})`, `${issue.name} (${source}): ${issue.field ? `${issue.field}: ` : ""}${packageProblems[issue.code]}; bundled default is shown instead`);
  }
  const port = process.env.CODEX_DELEGATE_PET_PORT || 47800;
  const app = await petHealth();
  if (app.status === "absent") check("ok", "Pet port", `${port}: pet app not running`);
  else if (app.status === "pet") check("ok", "Pet port", `${port}: pet app ${app.health.version}, pid ${app.health.pid ?? "unknown"}`);
  else check("warn", "Pet port", `port ${port} is held by something that isn't the pet app`);
}
