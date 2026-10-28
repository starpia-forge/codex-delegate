import { createHash, randomInt } from "node:crypto";
import { createServer } from "node:http";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { zip } from "./zip.mjs";

export const bundleFiles = {
  "codex-delegate-pet.exe": "fake executable, never run",
  "client/pet-client.mjs": "export const fake = true;\n",
  "hook/leader-hook.mjs": "// fake hook\n",
  "default-pets/pet/manifest.json": "{}",
};

export async function listen(t, handler) {
  const server = createServer(handler);
  // Avoid fetch's blocked low ports and Windows-reserved dynamic port ranges.
  for (let attempt = 0; ; attempt++) {
    try {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(randomInt(49152, 65536), "127.0.0.1", () => {
          server.off("error", reject);
          resolve();
        });
      });
      break;
    } catch (error) {
      if (attempt >= 31 || !["EADDRINUSE", "EACCES"].includes(error.code)) throw error;
    }
  }
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return server;
}

export async function unusedPetPort(t) {
  const server = await listen(t);
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return String(port);
}

export async function release(t, f, { bytes = zip(bundleFiles), status = 200 } = {}) {
  const requests = [];
  const server = await listen(t, (req, res) => {
    requests.push(req.url);
    res.writeHead(status);
    res.end(bytes);
  });
  const pin = { tag: "pet-v1.2.3", asset: "pet.zip", sha256: createHash("sha256").update(bytes).digest("hex"), version: "1.2.3" };
  const pinPath = join(f.root, "pin.json");
  writeFileSync(pinPath, JSON.stringify(pin));
  Object.assign(f.env, {
    CODEX_DELEGATE_PET_TEST_PIN: pinPath,
    CODEX_DELEGATE_PET_BASE_URL: `http://127.0.0.1:${server.address().port}`,
  });
  return { requests, pin, pinPath };
}
