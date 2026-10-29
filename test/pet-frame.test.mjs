import assert from "node:assert/strict";
import test from "node:test";
import { frameHandler } from "../pet/app/ui/frame.mjs";

test("frame requests acknowledge and log drawing or liveness failures without rejecting", async () => {
  for (const failure of ["draw", "computer_use_live", "frame_ready", null]) {
    const commands = [], errors = [];
    const error = new Error(failure);
    const handler = frameHandler({
      drawFrame() { if (failure === "draw") throw error; },
      computerUseLive: () => true,
      invoke: async (command, payload) => {
        commands.push([command, payload]);
        if (command === failure) throw error;
      },
      log: (...message) => errors.push(message),
    });
    await handler({ payload: { id: 42 } });
    assert.deepEqual(commands.at(-1), ["frame_ready", { id: 42 }]);
    if (failure !== "draw") assert.deepEqual(commands[0], ["computer_use_live", { live: true }]);
    assert.equal(errors.length, failure ? 1 : 0);
    if (failure) assert.equal(errors[0].at(-1), error);
  }
});
