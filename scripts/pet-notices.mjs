#!/usr/bin/env node
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const noticeFree = new Set(["0BSD", "MIT-0", "Unlicense", "CC0-1.0", "Zlib", "WTFPL", "BSL-1.0"]);
const noticeBearing = new Set(["MIT", "Apache-2.0", "Apache-2.0 WITH LLVM-exception", "BSD-2-Clause", "BSD-3-Clause", "ISC", "Unicode-3.0", "Unicode-DFS-2016", "MPL-2.0"]);
const copyrightTemplateGuard = new Set(["MIT", "BSD-2-Clause", "BSD-3-Clause", "ISC"]);
const normalize = text => text.replace(/\r\n?/g, "\n");
const isRoot = crate => crate.name === "codex-delegate-pet" && crate.source === null;
const crateKey = crate => JSON.stringify([crate.name, crate.version, crate.source]);

function hasOnlyPlaceholderCopyright(text) {
  let hasPlaceholder = false;
  let hasNonPlaceholder = false;
  for (const line of normalize(text).split("\n")) {
    const copyright = line.match(/^\s*(?:\/\/?|\*|#)?\s*(?:copyright\b|©)\s*(.*)/i);
    if (!copyright) continue;
    if (/<(?:yyyy|year|name of copyright owner|copyright holders?)>|\[(?:yyyy|year|name of copyright owner|copyright holders?)\]/i.test(copyright[1])) {
      hasPlaceholder = true;
    } else {
      hasNonPlaceholder = true;
    }
  }
  return hasPlaceholder && !hasNonPlaceholder;
}

// Selected licences come from used_by, not crates[].license (the original expression).
// lookupNotice receives a cargo metadata package and returns its NOTICE content, or "".
export function generateNotices(about, projectLicense, fanArtNotice, lookupNotice) {
  return generateNoticeSections(about, projectLicense, fanArtNotice, lookupNotice).text;
}

export function generateNoticeSections(about, projectLicense, fanArtNotice, lookupNotice) {
  const sections = ["codex-delegate — MIT\n\n" + normalize(projectLicense),
    "Fan-art notice\n\n" + normalize(fanArtNotice)];
  const selected = new Set();
  const groups = new Map();
  const notices = new Map();
  for (const license of about.licenses) {
    for (const { crate } of license.used_by) {
      if (isRoot(crate)) continue;
      selected.add(crateKey(crate));
      if (noticeFree.has(license.id)) continue;
      if (!noticeBearing.has(license.id)) throw new Error(`${crate.name} ${crate.version}: unknown selected licence ${license.id}`);
      if (!license.source_path || typeof license.text !== "string" || !license.text.trim()
        || (copyrightTemplateGuard.has(license.id) && hasOnlyPlaceholderCopyright(license.text))) {
        throw new Error(`${crate.name} ${crate.version}: missing required licence text or attribution (${license.id})`);
      }
      const key = crateKey(crate);
      if (!notices.has(key)) {
        const hasApache = about.licenses.some(entry => entry.id.startsWith("Apache-2.0") &&
          entry.used_by.some(user => crateKey(user.crate) === key));
        notices.set(key, hasApache ? normalize(lookupNotice(crate)) : "");
      }
      const text = normalize(license.text);
      const notice = notices.get(key);
      const groupKey = JSON.stringify([text, notice]);
      if (!groups.has(groupKey)) groups.set(groupKey, { text, notice, crates: new Set() });
      groups.get(groupKey).crates.add(`${crate.name} ${crate.version} — ${license.id}`);
    }
  }
  for (const key of [...groups.keys()].sort()) {
    const { text, notice, crates } = groups.get(key);
    sections.push([...crates].sort().join("\n") + "\n\n" + text + (notice ? "\n\nNOTICE\n\n" + notice : ""));
  }
  for (const { package: crate } of about.crates) {
    if (!isRoot(crate) && !selected.has(crateKey(crate))) throw new Error(`${crate.name} ${crate.version}: no selected licence`);
  }
  return { text: sections.join("\n\n") + "\n",
    third_party: sections.length > 2 ? sections.slice(2).join("\n\n") + "\n" : "" };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: { about: { type: "string" }, out: { type: "string" } } });
    if (!values.about || !values.out) throw new Error("--about <json> and --out <file> are required");
    const root = fileURLToPath(new URL("../", import.meta.url));
    const document = generateNoticeSections(JSON.parse(readFileSync(values.about, "utf8")),
      readFileSync(join(root, "LICENSE"), "utf8"),
      readFileSync(join(root, "pet/notices/fan-art-notice.txt"), "utf8"), crate => {
        try {
          const dir = dirname(crate.manifest_path);
          return readdirSync(dir).filter(name => /^notice(?:\.txt|\.md)?$/i.test(name)).sort()
            .map(name => readFileSync(join(dir, name), "utf8")).join("\n\n");
        } catch (error) {
          throw new Error(`${crate.name} ${crate.version}: cannot read Apache NOTICE files: ${error.message}`);
        }
      });
    mkdirSync(dirname(resolve(values.out)), { recursive: true });
    writeFileSync(`${values.out}.crates`, document.third_party);
    writeFileSync(values.out, document.text);
  } catch (error) {
    console.error(`pet-notices: ${error.message}`);
    process.exitCode = 1;
  }
}
