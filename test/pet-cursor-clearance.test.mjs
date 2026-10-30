import assert from "node:assert/strict";
import test from "node:test";
import { clearanceOpacity, clearanceMask } from "../pet/app/ui/cursor-clearance.mjs";

test("cursor clearance is transparent at the centre and through radius 190", () => {
  const pointer = { x: 300, y: 100 };
  assert.equal(clearanceOpacity({ x: 300, y: 100 }, pointer), 0);
  assert.equal(clearanceOpacity({ x: 490, y: 100 }, pointer), 0);
});

test("cursor clearance feathers linearly to fully opaque at radius 250", () => {
  const pointer = { x: 300, y: 100 };
  assert.equal(clearanceOpacity({ x: 505, y: 100 }, pointer), 0.25);
  assert.equal(clearanceOpacity({ x: 520, y: 100 }, pointer), 0.5);
  assert.equal(clearanceOpacity({ x: 535, y: 100 }, pointer), 0.75);
  assert.equal(clearanceOpacity({ x: 550, y: 100 }, pointer), 1);
  assert.equal(clearanceOpacity({ x: 600, y: 500 }, pointer), 1);
});

test("the stage mask uses the pointer's logical coordinates, even off the strip", () => {
  assert.equal(clearanceMask({ x: 300, y: 100 }),
    "radial-gradient(circle at 300px 100px, transparent 190px, black 250px)");
  const pointer = { x: -100, y: -50 };
  assert.equal(clearanceMask(pointer),
    "radial-gradient(circle at -100px -50px, transparent 190px, black 250px)");
  assert.equal(clearanceOpacity({ x: 0, y: 0 }, pointer), 0);
  assert.equal(clearanceOpacity({ x: 120, y: -50 }, pointer), 0.5);
  assert.equal(clearanceOpacity({ x: 300, y: 0 }, pointer), 1);
});

test("an absent pointer or disabled cursor clearance leaves the strip unmasked", () => {
  assert.equal(clearanceMask(null), "none");
  assert.equal(clearanceMask(undefined), "none");
  assert.equal(clearanceMask({ x: 100, y: 50 }, false), "none");
  assert.equal(clearanceOpacity({ x: 100, y: 50 }, null), 1);
  assert.equal(clearanceOpacity({ x: 100, y: 50 }, { x: 100, y: 50 }, false), 1);
});
