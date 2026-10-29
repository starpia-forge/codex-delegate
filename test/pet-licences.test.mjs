import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { licencesView, startLicences } from "../pet/app/ui/licences.mjs";
import { generateNoticeSections } from "../scripts/pet-notices.mjs";

const catalogue = JSON.parse(await readFile(new URL("../pet/app/messages.json", import.meta.url), "utf8"));
const document = {
  text: "CODEX-DELEGATE-NOTICES-STUB\nNot a real crate list",
  third_party: "",
  is_stub: true,
  project: "MIT License\nCopyright project",
  fan_art: "Unofficial fan art, removed on request.",
};

test("developer licences show original terms and a translated release-build explanation instead of the stub", () => {
  const view = licencesView(document, catalogue, "ko");
  assert.equal(view.title, "라이선스");
  assert.deepEqual(view.sections, [
    { heading: "codex-delegate — MIT", text: document.project, preformatted: true },
    { heading: "팬 아트 고지", text: document.fan_art, preformatted: true },
    { heading: "타사 고지", text: "타사 고지는 릴리스 빌드에서 생성됩니다.", preformatted: false },
  ]);
  assert.ok(!JSON.stringify(view).includes("CODEX-DELEGATE-NOTICES-STUB"));
});

test("release licences keep crate attributions in English and translate only the surrounding headings", () => {
  const crate = { name: "example", version: "1.0.0", source: "registry+fixture" };
  const generated = generateNoticeSections({
    crates: [{ package: crate }],
    licenses: [{ id: "MIT", source_path: "LICENSE", text: "MIT terms\nCopyright Alice\n",
      used_by: [{ crate }] }],
  }, document.project, document.fan_art, () => "");
  const notices = { ...document, is_stub: false, ...generated, text: "A future full-document format" };
  const english = licencesView(notices, catalogue, "en");
  const korean = licencesView(notices, catalogue, "ko");
  assert.equal(english.sections[2].text, "example 1.0.0 — MIT\n\nMIT terms\nCopyright Alice\n\n");
  assert.equal(korean.sections[2].text, english.sections[2].text);
  assert.equal(english.sections[1].heading, "Fan-art notice");
  assert.equal(korean.sections[1].heading, "팬 아트 고지");
  assert.equal(english.sections[2].preformatted, true);
});

test("an empty release crate section has a translated empty state independently of the full document", () => {
  const generated = generateNoticeSections({ crates: [], licenses: [] }, document.project, document.fan_art, () => "");
  for (const [language, expected] of [["en", "No third-party notices."], ["ko", "타사 고지가 없습니다."]]) {
    const section = licencesView({ ...document, is_stub: false, ...generated }, catalogue, language).sections[2];
    assert.equal(section.text, expected);
    assert.equal(section.preformatted, false);
  }
  const unfamiliar = "A future document format\nCopyright Bob\n";
  assert.equal(licencesView({ ...document, is_stub: false, third_party: unfamiliar }, catalogue, "ko").sections[2].text,
    unfamiliar);
});

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

test("licences subscribe before both reads and a switch during startup wins over a stale language read", async () => {
  const subscribed = deferred(), readNotices = deferred(), readCatalogue = deferred(), readsStarted = deferred();
  const commands = [], views = [];
  let listener, stopped = false;
  const started = startLicences({
    listen: async (event, callback) => {
      assert.equal(event, "pet-language");
      listener = callback;
      await subscribed.promise;
      return () => { stopped = true; };
    },
    invoke: command => {
      commands.push(command);
      if (commands.length === 2) readsStarted.resolve();
      if (command === "messages") return readCatalogue.promise;
      if (command === "notices") return readNotices.promise;
      assert.fail(`licences must not use ${command}`);
    },
    render: (view, language) => views.push({ view, language }),
  });
  assert.deepEqual(commands, []);
  subscribed.resolve();
  await readsStarted.promise;
  assert.deepEqual(commands.sort(), ["messages", "notices"]);
  listener({ payload: { language: "ko" } });
  readNotices.resolve({ ...document, language: "en" });
  readCatalogue.resolve(catalogue);
  const stop = await started;
  assert.equal(views.at(-1).view.title, "라이선스");
  assert.equal(views.at(-1).language, "ko");
  listener({ payload: { language: "en" } });
  assert.equal(views.at(-1).view.title, "Licences");
  assert.equal(views.at(-1).view.sections[0].text, document.project);
  stop();
  assert.equal(stopped, true);
});

test("a window opened after a language switch reads the current language without needing another event", async () => {
  let view, language;
  await startLicences({
    listen: async () => () => {},
    invoke: async command => command === "messages" ? catalogue : { ...document, language: "ko" },
    render: (current, code) => { view = current; language = code; },
  });
  assert.equal(view.title, "라이선스");
  assert.equal(language, "ko");
});
