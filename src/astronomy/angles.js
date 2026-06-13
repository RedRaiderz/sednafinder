export const deg2rad = (d) => (d * Math.PI) / 180;
export const rad2deg = (r) => (r * 180) / Math.PI;

export function norm360(deg) {
  return ((deg % 360) + 360) % 360;
}

// Shortest signed difference a - b, in (-180, 180].
export function angleDiff(a, b) {
  const d = ((a - b + 540) % 360) - 180;
  return d === -180 ? 180 : d;
}
