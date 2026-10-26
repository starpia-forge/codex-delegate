// A detached Node host survives the runner's hard exit on Windows. Unlike a
// detached cmd.exe, it can pass the prompt pipe to the npm shim reliably. Its
// lifetime covers the shell and Codex, so its PID is the lock's child PID.
import { spawn } from "node:child_process";

const child = spawn(process.argv[2], { shell: true, stdio: "inherit", windowsHide: true });
child.on("error", err => { console.error(err.message); process.exit(2); });
child.on("exit", code => process.exit(code ?? 1));
