import { createHash, randomInt } from "node:crypto";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { zip } from "./zip.mjs";

export const { version } = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
export const asset = "codex-delegate-pet-windows-x64.zip";

export const bundleFiles = {
  "codex-delegate-pet.exe": "fake executable, never run",
  "client/pet-client.mjs": "export const fake = true;\n",
  "hook/leader-hook.mjs": "// fake hook\n",
  "default-pets/pet/manifest.json": "{}",
  "THIRD-PARTY-NOTICES": readFileSync(new URL("../fixtures/pet-notices.txt", import.meta.url), "utf8"),
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

export async function release(t, f, options = {}) {
  const bytes = options.bytes ?? zip(bundleFiles);
  const bundle = { tag: `v${version}`, asset, sha256: createHash("sha256").update(bytes).digest("hex"), version };
  const paths = [`/v${version}/${asset}.sha256`, `/v${version}/${asset}`];
  const requests = [];
  const server = await listen(t, (req, res) => {
    requests.push(req.url);
    if (req.url === paths[0]) {
      res.writeHead(options.checksumStatus ?? options.status ?? 200);
      res.end(options.checksum ?? `${options.sha256 ?? bundle.sha256}  ${asset}\n`);
    } else if (req.url === paths[1]) {
      res.writeHead(options.zipStatus ?? options.status ?? 200);
      res.end(bytes);
    } else { res.writeHead(404); res.end(); }
  });
  Object.assign(f.env, {
    CODEX_DELEGATE_PET_BASE_URL: `http://127.0.0.1:${server.address().port}`,
  });
  return { requests, bundle, paths, options };
}
