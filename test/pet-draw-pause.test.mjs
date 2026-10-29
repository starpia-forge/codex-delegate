import assert from "node:assert/strict";
import test from "node:test";
import { drawingPaused } from "../pet/app/ui/draw-pause.mjs";

test("drawing pauses for either pets hidden or fullscreen independently", () => {
  assert.equal(drawingPaused({ hidden: false, fullscreen: false }), false);
  assert.equal(drawingPaused({ hidden: true, fullscreen: false }), true);
  assert.equal(drawingPaused({ hidden: false, fullscreen: true }), true);
  assert.equal(drawingPaused({ hidden: true, fullscreen: true }), true);
});

test("leaving fullscreen while hidden and showing during fullscreen keep drawing paused", () => {
  const flags = { hidden: true, fullscreen: true };
  flags.fullscreen = false;
  assert.equal(drawingPaused(flags), true);
  flags.fullscreen = true;
  flags.hidden = false;
  assert.equal(drawingPaused(flags), true);
  flags.fullscreen = false;
  assert.equal(drawingPaused(flags), false);
});
