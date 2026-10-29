export function frameHandler({ drawFrame, computerUseLive, invoke, log = console.error }) {
  return async ({ payload }) => {
    try {
      // Hidden webviews may throttle rAF; draw directly, even paused.
      drawFrame();
      await invoke("computer_use_live", { live: computerUseLive() });
    } catch (error) {
      log("cannot prepare pet frame:", error);
    } finally {
      try {
        await invoke("frame_ready", { id: payload.id });
      } catch (error) {
        log("cannot acknowledge pet frame:", error);
      }
    }
  };
}
