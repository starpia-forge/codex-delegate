#!/usr/bin/env node
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const state = fileURLToPath(new URL("../../pet-state/", import.meta.url));

function recordSession(event) {
  if (!["session-start", "session-end"].includes(event.type) || !/^[1-9]\d*$/.test(event.team)) return;
  const directory = join(state, "sessions");
  const path = join(directory, `${event.team}.json`);
  const temp = `${path}.${process.pid}.tmp`;
  try {
    if (event.type === "session-end") {
      const record = JSON.parse(readFileSync(path, "utf8"));
      if (record.team === event.team && record.at <= event.at) rmSync(path);
      return;
    }
    mkdirSync(directory, { recursive: true });
    writeFileSync(temp, JSON.stringify({ team: event.team, session: event.session, at: event.at }), { mode: 0o600 });
    renameSync(temp, path);
  } catch { /* Record failures must not prevent delivery. */ }
  finally { try { rmSync(temp, { force: true }); } catch {} }
}

function mapHookInput(input, env) {
  if (!input || typeof input !== "object" || !env.CLAUDE_PID) return null;
  let type;
  switch (input.hook_event_name) {
    case "SessionStart":
      if (["clear", "compact"].includes(input.source)) return null;
      type = "session-start";
      break;
    case "UserPromptSubmit": type = "prompt"; break;
    case "PermissionRequest": type = "waiting"; break;
    case "Notification":
      if (input.notification_type !== "elicitation_dialog") return null;
      type = "waiting";
      break;
    case "PostToolUse": type = "resumed"; break;
    case "Stop": type = "stop"; break;
    case "StopFailure": type = "failed"; break;
    case "SessionEnd":
      if (input.reason === "clear") return null;
      type = "session-end";
      break;
    default: return null;
  }
  return { v: 1, source: "leader", team: env.CLAUDE_PID,
    session: typeof input.session_id === "string" ? input.session_id : null, at: Date.now(), type };
}

function readHookInput() {
  return new Promise(resolve => {
    const chunks = [];
    let size = 0;
    function finish(body = null) {
      clearTimeout(timer);
      process.stdin.pause();
      resolve(body);
    }
    const timer = setTimeout(finish, 1000);
    process.stdin.on("error", () => finish());
    process.stdin.on("data", chunk => {
      size += chunk.length;
      if (size > 1024 * 1024) finish();
      else chunks.push(chunk);
    });
    process.stdin.on("end", () => finish(Buffer.concat(chunks).toString("utf8")));
  });
}

try {
  const body = await readHookInput();
  const event = mapHookInput(JSON.parse(body), process.env);
  if (event) {
    recordSession(event);
    const { sendLeader } = await import("../client/pet-client.mjs");
    await sendLeader(event);
  }
} catch { /* Hooks must never affect the leader. */ }
process.exit(0);
