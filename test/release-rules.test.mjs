import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { analyzeCommits } from "@semantic-release/commit-analyzer";

const cwd = fileURLToPath(new URL("../", import.meta.url));
const config = JSON.parse(readFileSync(new URL("../.releaserc.json", import.meta.url), "utf8"));
const [, pluginConfig] = config.plugins.find(([name]) => name === "@semantic-release/commit-analyzer");

const cases = [
  { name: "feat gives a minor Release", messages: ["feat: add tray controls"], expected: "minor" },
  { name: "fix gives a patch Release", messages: ["fix: restore tray controls"], expected: "patch" },
  { name: "feat! gives a minor Release below 1.0", messages: ["feat!: replace tray controls"], expected: "minor" },
  { name: "fix(scope)! gives a minor Release below 1.0", messages: ["fix(pet)!: replace the event protocol"], expected: "minor" },
  {
    name: "feat with a BREAKING CHANGE footer gives a minor Release below 1.0",
    messages: ["feat: replace the event protocol\n\nBREAKING CHANGE: clients must use protocol 2"],
    expected: "minor",
  },
  {
    name: "fix with a BREAKING CHANGE footer gives a minor Release below 1.0",
    messages: ["fix: reject obsolete events\n\nBREAKING CHANGE: clients must use protocol 2"],
    expected: "minor",
  },
  { name: "docs gives no Release", messages: ["docs: explain tray controls"], expected: null },
  { name: "refactor gives no Release", messages: ["refactor: simplify event handling"], expected: null },
  { name: "test gives no Release", messages: ["test: cover tray controls"], expected: null },
  { name: "ci gives no Release", messages: ["ci: update the test job"], expected: null },
  { name: "a Release commit gives no Release", messages: ["chore(release): 0.5.0"], expected: null },
  { name: "merge gives no Release", messages: ["merge: integrate tray controls"], expected: null },
  { name: "a default merge subject gives no Release", messages: ["Merge branch 'x' into y"], expected: null },
  {
    name: "several commits give the highest Release type",
    messages: ["fix: restore tray controls", "feat: add tray controls"],
    expected: "minor",
  },
];

for (const { name, messages, expected } of cases) {
  test(name, async () => {
    const actual = await analyzeCommits(pluginConfig, {
      commits: messages.map(message => ({ message })),
      cwd,
      logger: { log() {} },
    });
    assert.equal(actual, expected);
  });
}
