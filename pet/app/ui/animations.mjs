// Codex v1 row order; frame durations are twice the upstream guide's milliseconds:
// https://github.com/openai/skills/blob/main/skills/.curated/hatch-pet/references/animation-rows.md
export const CODEX_V1_FRAME_TIMINGS_MS = {
  idle: [560, 220, 220, 280, 280, 640],
  "running-right": [240, 240, 240, 240, 240, 240, 240, 440],
  "running-left": [240, 240, 240, 240, 240, 240, 240, 440],
  waving: [280, 280, 280, 560],
  jumping: [280, 280, 280, 280, 560],
  failed: [280, 280, 280, 280, 280, 280, 280, 480],
  waiting: [300, 300, 300, 300, 300, 520],
  running: [240, 240, 240, 240, 240, 440],
  review: [300, 300, 300, 300, 300, 560],
};

// Ambient states rest on frame 0 after playback; these holds are not doubled.
const REST_MS = { idle: 2400, waiting: 1500, review: 1000 };

export function cycleDuration(state) {
  return CODEX_V1_FRAME_TIMINGS_MS[state].reduce((total, duration) => total + duration, REST_MS[state] ?? 0);
}

export function frameAt(state, elapsed) {
  if (elapsed <= 0) return 0;
  const timings = CODEX_V1_FRAME_TIMINGS_MS[state];
  elapsed %= cycleDuration(state);
  for (const [frame, duration] of timings.entries()) {
    if (elapsed < duration) return frame;
    elapsed -= duration;
  }
  return 0;
}
