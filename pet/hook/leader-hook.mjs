#!/usr/bin/env node
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
    const { sendLeader } = await import("../client/pet-client.mjs");
    await sendLeader(event);
  }
} catch { /* Hooks must never affect the leader. */ }
process.exit(0);
