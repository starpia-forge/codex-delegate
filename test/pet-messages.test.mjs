import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { createMessages } from "../pet/app/ui/messages.mjs";

const ui = new URL("../pet/app/ui/", import.meta.url);
const catalogueUrl = new URL("../pet/app/messages.json", import.meta.url);

test("every catalogue message has English and Korean text and every renderer id exists", async () => {
  const catalogue = JSON.parse(await readFile(catalogueUrl, "utf8"));
  assert.ok(Object.keys(catalogue).length > 0);
  for (const [id, texts] of Object.entries(catalogue)) {
    for (const language of ["en", "ko"]) {
      assert.equal(typeof texts[language], "string", `${id}.${language}`);
      assert.ok(texts[language].trim(), `${id}.${language} is empty`);
    }
  }
  const used = new Set();
  async function scan(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const url = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
      if (entry.isDirectory()) await scan(url);
      else if (entry.name.endsWith(".mjs")) {
        const source = await readFile(url, "utf8");
        for (const match of source.matchAll(/\bmessage\(\s*["']([^"']+)["']/g)) used.add(match[1]);
      }
    }
  }
  await scan(ui);
  assert.ok(used.size > 0, "renderer message calls must be discoverable");
  for (const id of used) assert.ok(Object.hasOwn(catalogue, id), `missing renderer message: ${id}`);
});

test("messages use the selected language, substitute counts, and fall back to English", async () => {
  const catalogue = JSON.parse(await readFile(catalogueUrl, "utf8"));
  const english = createMessages(catalogue, "en");
  const korean = createMessages(catalogue, "ko");
  assert.equal(english("overflow.sessions", { count: 3 }), "+3 sessions");
  assert.equal(korean("overflow.sessions", { count: 3 }), "+3개 세션");
  assert.equal(korean("overflow.workersTooltip", { count: 2 }), "추가 작업자 2명");
  const incomplete = createMessages({ greeting: { en: "Hello {name}" } }, "ko");
  assert.equal(incomplete("greeting", { name: "momo" }), "Hello momo");
  assert.equal(incomplete("unknown"), "unknown");
});
