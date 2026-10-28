import assert from "node:assert/strict";
import test from "node:test";
import { fitLimit } from "../pet/app/ui/layout.mjs";

test("fit limit includes name tags, both gaps, padding and worst-case overflow badges", () => {
  // Two separate teams at scale 1: 2 * (216 pet + 4 gap + 48 badge),
  // 16 between teams, 16 before the 96 sessions badge, and 16 side padding.
  assert.equal(fitLimit({ width: 679, scale: 1 }), 1);
  assert.equal(fitLimit({ width: 680, scale: 1 }), 2);
  assert.equal(fitLimit({ width: 963, scale: 1 }), 2);
  assert.equal(fitLimit({ width: 964, scale: 1 }), 3);
});

test("fit limit responds to scale and width and stays between zero and sixteen", () => {
  assert.equal(fitLimit({ width: 1920, scale: 0.3 }), 12);
  assert.equal(fitLimit({ width: 1920, scale: 0.6 }), 8);
  assert.equal(fitLimit({ width: 1920, scale: 1 }), 6);
  assert.equal(fitLimit({ width: 1280, scale: 1 }), 4);
  assert.equal(fitLimit({ width: 395, scale: 1 }), 0);
  assert.equal(fitLimit({ width: 0, scale: 0.3 }), 0);
  assert.equal(fitLimit({ width: 10000, scale: 0.3 }), 16);
});
