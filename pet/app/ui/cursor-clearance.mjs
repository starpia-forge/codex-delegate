// All coordinates and radii are strip-relative logical (CSS) pixels.
const innerRadius = 190;
const outerRadius = 250;

export function clearanceOpacity(point, pointer, enabled = true) {
  if (!enabled || !pointer) return 1;
  const distance = Math.hypot(point.x - pointer.x, point.y - pointer.y);
  return Math.max(0, Math.min(1, (distance - innerRadius) / (outerRadius - innerRadius)));
}

export function clearanceMask(pointer, enabled = true) {
  if (!enabled || !pointer) return "none";
  return `radial-gradient(circle at ${pointer.x}px ${pointer.y}px, transparent ${innerRadius}px, black ${outerRadius}px)`;
}
