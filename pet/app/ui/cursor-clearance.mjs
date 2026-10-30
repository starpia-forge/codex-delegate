// All coordinates and radii are strip-relative logical (CSS) pixels.
const innerRadius = 190;
// Twin of the clearance radius in pet/app/src-tauri/src/cursor.rs.
const outerRadius = 250;

export function clearanceMask(pointer, enabled) {
  if (!enabled || !pointer) return "none";
  return `radial-gradient(circle at ${pointer.x}px ${pointer.y}px, transparent ${innerRadius}px, black ${outerRadius}px)`;
}
