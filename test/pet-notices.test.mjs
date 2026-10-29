import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { generateNotices, generateNoticeSections } from "../scripts/pet-notices.mjs";

const project = "MIT project licence\nCopyright project\n";
const fanArt = "Unofficial fan art notice\n";

test("notice sections expose crate terms separately without depending on project or artwork headings", () => {
  const data = about([pkg("example"), [["MIT", "Copyright Alice\nMIT terms"]]]);
  const sections = generateNoticeSections(data, "Future project heading", "Future artwork heading", () => "");
  assert.equal(sections.third_party, "example 1.2.3 — MIT\n\nCopyright Alice\nMIT terms\n");
  assert.ok(sections.text.includes("Future project heading"));
  assert.ok(sections.text.includes("Future artwork heading"));
  assert.ok(sections.text.endsWith(sections.third_party));
  assert.equal(generateNotices(data, project, fanArt, () => ""),
    generateNoticeSections(data, project, fanArt, () => "").text);
  assert.equal(generateNoticeSections({ crates: [], licenses: [] }, project, fanArt, () => "").third_party, "");
});
function pkg(name, license = "MIT") {
  return { name, version: "1.2.3", source: "registry+fixture", license, manifest_path: `/crates/${name}/Cargo.toml` };
}
function about(...entries) {
  return {
    crates: entries.map(([crate]) => ({ package: crate, license: crate.license })),
    licenses: entries.flatMap(([crate, selections]) => selections.map(([id, text, source_path = "LICENSE"]) => ({
      id, text, source_path, used_by: [{ crate, path: null }],
    }))),
  };
}

test("notices include required licence text, copyright, project and fan art but exclude notice-free crates and the root", () => {
  const data = about(
    [pkg("included"), [["MIT", "MIT licence\nCopyright Alice\n"]]],
    ...["0BSD", "MIT-0", "Unlicense", "CC0-1.0", "Zlib", "WTFPL", "BSL-1.0"].map(id =>
      [pkg(`excluded-${id}`, id), [[id, "Excluded text", null]]]),
    [{ ...pkg("codex-delegate-pet"), source: null }, [["MIT", "Root crate text"]]],
  );
  const result = generateNotices(data, project, fanArt, () => "");
  assert.ok(result.includes("included 1.2.3 — MIT"));
  assert.ok(result.includes("MIT licence\nCopyright Alice\n"));
  assert.ok(result.includes(project));
  assert.ok(result.includes(fanArt));
  assert.ok(!result.includes("excluded-"));
  assert.ok(!result.includes("Root crate text"));
});

test("notices keep all selected AND components and honour a notice-free OR alternative", () => {
  const data = about(
    [pkg("compound", "Apache-2.0 AND MIT"), [["Apache-2.0", "Apache text"], ["MIT", "MIT text\nCopyright Alice"]]],
    [pkg("alternative", "MIT OR Unlicense"), [["Unlicense", "Public domain", null]]],
  );
  const result = generateNotices(data, project, fanArt, () => "");
  assert.ok(result.includes("compound 1.2.3 — Apache-2.0"));
  assert.ok(result.includes("compound 1.2.3 — MIT"));
  assert.ok(result.includes("Apache text"));
  assert.ok(result.includes("MIT text"));
  assert.ok(!result.includes("alternative"));
});

test("notices fail naming the crate on unknown licences, missing attribution or no selected licence", () => {
  for (const [id, text, source] of [["LicenseRef-unknown", "Some text", "LICENSE"], ["MIT", "Generic MIT", null], ["MIT", "   ", "LICENSE"]]) {
    assert.throws(() => generateNotices(about([pkg("broken"), [[id, text, source]]]), project, fanArt, () => ""), /broken/);
  }
  assert.throws(() => generateNotices(about([pkg("unselected"), []]), project, fanArt, () => ""), /unselected/);
});

test("copyright-bearing licences reject template-only attribution even with a real source path", () => {
  for (const id of ["MIT", "BSD-2-Clause", "BSD-3-Clause", "ISC"]) {
    for (const text of [
      "Copyright (c) <year> <copyright holders>",
      "Copyright [yyyy] [name of copyright owner]",
      "Copyright (c) 2024 <copyright holders>",
      "Copyright (c) <year> Alice",
    ]) {
      assert.throws(() => generateNotices(about([pkg("template-only", id), [[id, text]]]),
        project, fanArt, () => ""), /template-only.*attribution/, `${id}: ${text}`);
    }
    const text = "Copyright (c) <year> <copyright holders>\nCopyright (c) 2024 Alice";
    assert.ok(generateNotices(about([pkg("attributed", id), [[id, text]]]), project, fanArt, () => "")
      .includes("Copyright (c) 2024 Alice"));
  }
  for (const id of ["Apache-2.0", "Apache-2.0 WITH LLVM-exception"]) {
    assert.doesNotThrow(() => generateNotices(about([pkg("apache", id),
      [[id, "Apache terms\nAPPENDIX: How to apply the Apache License\nCopyright [yyyy] [name of copyright owner]"]]]),
    project, fanArt, () => ""));
  }
});

test("copyright-bearing licences preserve upstream text with no copyright line or only a year", () => {
  for (const id of ["MIT", "BSD-2-Clause", "BSD-3-Clause", "ISC"]) {
    for (const text of [
      "Permission is hereby granted, free of charge...",
      "Copyright (c) 2015",
      "Copyright (c) 2016--2017",
      "Copyright (c) 2016--2023",
      "Copyright (c) <year> <copyright holders>\nCopyright (c) 2015",
      "Copyright (c) <year> <copyright holders>\nCopyright (c) 2024 Alice <alice@example.com>",
    ]) {
      assert.ok(generateNotices(about([pkg("upstream", id), [[id, text]]]), project, fanArt, () => "")
        .includes(text), `${id}: ${text}`);
    }
  }
});

test("notices group identical texts and NOTICE content while preserving distinct Apache attributions", () => {
  const data = about(
    [pkg("alpha", "Apache-2.0"), [["Apache-2.0", "Shared licence\nCopyright Alice\n"]]],
    [pkg("beta", "Apache-2.0"), [["Apache-2.0", "Shared licence\nCopyright Alice\n"]]],
    [pkg("gamma", "Apache-2.0"), [["Apache-2.0", "Shared licence\nCopyright Alice\n"]]],
  );
  const result = generateNotices(data, project, fanArt, crate => crate.name === "gamma" ? "NOTICE Gamma\n" : "NOTICE Alpha\n");
  assert.equal(result.split("Shared licence").length - 1, 2);
  assert.equal(result.split("NOTICE Alpha").length - 1, 1);
  assert.equal(result.split("NOTICE Gamma").length - 1, 1);
  assert.match(result, /alpha 1\.2\.3 — Apache-2\.0\nbeta 1\.2\.3 — Apache-2\.0/);
  assert.ok(result.includes("Copyright Alice\n"));
});

test("notices have stable ordering and LF line endings regardless of input ordering", () => {
  const data = about(
    [pkg("zeta"), [["MIT", "Shared\r\nCopyright Alice\r\n"]]],
    [pkg("beta"), [["MIT", "Other text\r\nCopyright Bob\r\n"]]],
    [pkg("alpha"), [["MIT", "Shared\nCopyright Alice\n"]]],
  );
  const first = generateNotices(data, project, fanArt, () => "");
  const shuffled = { crates: [...data.crates].reverse(), licenses: [...data.licenses].reverse() };
  assert.equal(first, generateNotices(shuffled, project.replaceAll("\n", "\r\n"), fanArt, () => ""));
  assert.ok(!first.includes("\r"));
  assert.equal(first.split("Shared").length - 1, 1);
});

test("notices CLI reads case-insensitive Apache NOTICE filenames and the committed project and fan-art notices", t => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const work = mkdtempSync(join(tmpdir(), "pet notices "));
  t.after(() => rmSync(work, { recursive: true, force: true }));
  const entries = ["nOtIcE", "notice.TXT", "NOTICE.md"].map((file, index) => {
    const dir = join(work, `crate-${index}`);
    mkdirSync(dir);
    writeFileSync(join(dir, file), `Copyright NOTICE ${index}\r\n`);
    return [{ ...pkg(`apache-${index}`, "Apache-2.0 WITH LLVM-exception"), manifest_path: join(dir, "Cargo.toml") },
      [["Apache-2.0 WITH LLVM-exception", "Apache licence\r\nCopyright author\r\n"]]];
  });
  const input = join(work, "about.json"), out = join(work, "assets", "notices.txt");
  writeFileSync(input, JSON.stringify(about(...entries)));
  const result = spawnSync(process.execPath, [join(root, "scripts/pet-notices.mjs"), "--about", input, "--out", out], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const text = readFileSync(out, "utf8");
  const crates = readFileSync(`${out}.crates`, "utf8");
  assert.equal(crates, generateNoticeSections(about(...entries), project, fanArt,
    crate => `Copyright NOTICE ${crate.name.at(-1)}\r\n`).third_party);
  assert.ok(!crates.includes("Fan-art notice"));
  assert.ok(text.endsWith(crates));
  for (const index of [0, 1, 2]) assert.ok(text.includes(`Copyright NOTICE ${index}\n`));
  assert.ok(text.includes(readFileSync(join(root, "LICENSE"), "utf8").replace(/\r\n?/g, "\n")));
  assert.ok(text.includes(readFileSync(join(root, "pet/notices/fan-art-notice.txt"), "utf8").replace(/\r\n?/g, "\n")));
  assert.ok(!text.includes("\r"));
});
