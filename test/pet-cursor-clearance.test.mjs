import assert from "node:assert/strict";
import test from "node:test";
import { clearanceMask } from "../pet/app/ui/cursor-clearance.mjs";

test("cursor clearance masks through radius 190 and feathers to opaque at radius 250", () => {
  assert.equal(clearanceMask({ x: 300, y: 100 }, true),
    "radial-gradient(circle at 300px 100px, transparent 190px, black 250px)");
});

test("the stage mask preserves negative pointer coordinates off the strip", () => {
  assert.equal(clearanceMask({ x: -100, y: -50 }, true),
    "radial-gradient(circle at -100px -50px, transparent 190px, black 250px)");
});

test("the stage mask preserves pointer coordinates beyond the strip size", () => {
  // A 1000 by 160 strip still needs clearance from a pointer beyond its edges.
  assert.equal(clearanceMask({ x: 1100, y: 200 }, true),
    "radial-gradient(circle at 1100px 200px, transparent 190px, black 250px)");
});

test("an absent pointer leaves the strip unmasked", () => {
  assert.equal(clearanceMask(null, true), "none");
  assert.equal(clearanceMask(undefined, true), "none");
});

test("disabled cursor clearance leaves the strip unmasked", () => {
  assert.equal(clearanceMask({ x: 100, y: 50 }, false), "none");
});

test("cursor clearance requires an explicit enabled flag", () => {
  assert.equal(clearanceMask({ x: 100, y: 50 }), "none");
});
