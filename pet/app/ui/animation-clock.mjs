// Frame time excludes fullscreen pauses. Lifecycle rules use the stage's
// independent wall clock, never this clock.
export function createAnimationClock({ now }) {
  let pausedAt = null, pausedTime = 0;
  return {
    now() { return (pausedAt ?? now()) - pausedTime; },
    setPaused(paused) {
      if (paused && pausedAt === null) pausedAt = now();
      else if (!paused && pausedAt !== null) {
        pausedTime += now() - pausedAt;
        pausedAt = null;
      }
    },
  };
}
