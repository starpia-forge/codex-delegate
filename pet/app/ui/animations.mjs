// Codex v1 row order and per-frame durations in milliseconds. These timings
// are provisional: exact Codex timings were not supplied with the v1 contract.
// Replace this single table when verified upstream values are available.
export const CODEX_V1_FRAME_TIMINGS_MS = {
  idle: [240, 160, 180, 240, 160, 200],
  "running-right": [80, 80, 80, 80, 80, 80, 80, 80],
  "running-left": [80, 80, 80, 80, 80, 80, 80, 80],
  waving: [160, 120, 160, 220],
  jumping: [120, 100, 180, 100, 160],
  failed: [140, 100, 100, 140, 100, 100, 180, 240],
  waiting: [240, 160, 160, 240, 160, 240],
  running: [100, 100, 100, 100, 100, 160],
  review: [180, 120, 120, 180, 120, 240],
};

export function cycleDuration(state) {
  return CODEX_V1_FRAME_TIMINGS_MS[state].reduce((total, duration) => total + duration, 0);
}
