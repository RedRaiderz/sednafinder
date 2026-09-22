// Camera basis + projection. A view is { f, r, u } (forward/right/up, ENU unit vectors),
// a vertical field of view in degrees, and a projection ('stereo' for the free-look chart,
// 'gnomonic' for AR so markers line up with the real camera image).
const D2R = Math.PI / 180;

export function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
export function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
export function normalize(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }

// Basis for looking at azimuth/altitude with the horizon level (no roll).
export function basisFromAltAz(altDeg, azDeg) {
  const a = altDeg * D2R, z = azDeg * D2R;
  const f = [Math.cos(a) * Math.sin(z), Math.cos(a) * Math.cos(z), Math.sin(a)];
  const r = [Math.cos(z), -Math.sin(z), 0];
  return { f, r, u: cross(r, f) };
}

// Scale in px per unit of projected coordinate so the vertical FOV fills the height.
export function projScale(view, H) {
  const half = (view.fov / 2) * D2R;
  return view.proj === 'stereo' ? (H / 2) / (2 * Math.tan(half / 2)) : (H / 2) / Math.tan(half);
}

// Project an ENU vector. Writes x,y into out and returns true if it is in front of the camera.
export function project(view, v, W, H, s, out) {
  const x = v[0] * view.r[0] + v[1] * view.r[1] + v[2] * view.r[2];
  const y = v[0] * view.u[0] + v[1] * view.u[1] + v[2] * view.u[2];
  const z = v[0] * view.f[0] + v[1] * view.f[1] + v[2] * view.f[2];
  if (view.proj === 'stereo') {
    if (z < -0.6) return false;
    const k = 2 / (1 + z);
    out.x = W / 2 + x * k * s; out.y = H / 2 - y * k * s;
  } else {
    if (z < 0.02) return false;
    out.x = W / 2 + (x / z) * s; out.y = H / 2 - (y / z) * s;
  }
  out.z = z;
  return true;
}

// Same as project() but for a flat Float32Array at offset o (hot loop for stars).
export function projectArr(view, arr, o, W, H, s, out) {
  const a = arr[o], b = arr[o + 1], c = arr[o + 2];
  const x = a * view.r[0] + b * view.r[1] + c * view.r[2];
  const y = a * view.u[0] + b * view.u[1] + c * view.u[2];
  const z = a * view.f[0] + b * view.f[1] + c * view.f[2];
  if (view.proj === 'stereo') {
    if (z < -0.6) return false;
    const k = 2 / (1 + z); out.x = W / 2 + x * k * s; out.y = H / 2 - y * k * s;
  } else {
    if (z < 0.02) return false;
    out.x = W / 2 + (x / z) * s; out.y = H / 2 - (y / z) * s;
  }
  return true;
}

// Inverse: screen pixel -> ENU direction.
export function unproject(view, px, py, W, H, s) {
  const X = (px - W / 2) / s, Y = (H / 2 - py) / s;
  let x, y, z;
  if (view.proj === 'stereo') {
    const q = (X * X + Y * Y) / 4;
    x = X / (1 + q); y = Y / (1 + q); z = (1 - q) / (1 + q);
  } else { const l = Math.hypot(X, Y, 1); x = X / l; y = Y / l; z = 1 / l; }
  return normalize([
    x * view.r[0] + y * view.u[0] + z * view.f[0],
    x * view.r[1] + y * view.u[1] + z * view.f[1],
    x * view.r[2] + y * view.u[2] + z * view.f[2],
  ]);
}

// Screen-space direction (unit) toward an off-screen ENU target, for edge arrows.
export function screenDirection(view, v) {
  const x = dot(v, view.r), y = dot(v, view.u);
  const l = Math.hypot(x, y) || 1;
  return { dx: x / l, dy: -y / l, behind: dot(v, view.f) < 0 };
}
