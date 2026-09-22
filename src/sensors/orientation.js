// Device orientation -> camera basis in the ENU world frame.
import { cross, normalize } from '../sky/view.js';

const D2R = Math.PI / 180, R2D = 180 / Math.PI;

// Columns of the W3C device->earth rotation (Z-X'-Y'', earth X=East, Y=North, Z=Up).
export function deviceAxes(alphaDeg, betaDeg, gammaDeg) {
  const a = alphaDeg * D2R, b = betaDeg * D2R, g = gammaDeg * D2R;
  const cA = Math.cos(a), sA = Math.sin(a), cB = Math.cos(b), sB = Math.sin(b), cG = Math.cos(g), sG = Math.sin(g);
  const X = [cA * cG - sA * sB * sG, sA * cG + cA * sB * sG, -cB * sG];
  const Y = [-sA * cB, cA * cB, sB];
  const Z = [cA * sG + sA * sB * cG, sA * sG - cA * sB * cG, cB * cG];
  return { X, Y, Z };
}

// Camera basis for the rear camera, accounting for the screen rotation angle (0/90/-90/180).
export function cameraBasis(alphaDeg, betaDeg, gammaDeg, screenAngleDeg = 0) {
  const { X, Y, Z } = deviceAxes(alphaDeg, betaDeg, gammaDeg);
  const t = screenAngleDeg * D2R, c = Math.cos(t), s = Math.sin(t);
  const u = [Y[0] * c + X[0] * s, Y[1] * c + X[1] * s, Y[2] * c + X[2] * s];
  const r = [X[0] * c - Y[0] * s, X[1] * c - Y[1] * s, X[2] * c - Y[2] * s];
  return { f: [-Z[0], -Z[1], -Z[2]], r, u };
}

// Old API kept for tests: where the rear camera points, as az/alt.
export function cameraDirection(alphaDeg, betaDeg, gammaDeg) {
  const { f } = cameraBasis(alphaDeg, betaDeg, gammaDeg);
  return { az: (Math.atan2(f[0], f[1]) * R2D + 360) % 360, alt: Math.asin(Math.max(-1, Math.min(1, f[2]))) * R2D };
}

// --- live sensor glue (browser only) ---
const state = {
  basis: null, raw: null, northOffset: null, trim: 0, compass: false, events: 0, absolute: false,
};
const SMOOTH = 0.22;       // basis low-pass per event
const OFFSET_SMOOTH = 0.03; // compass offset is noisy; follow it slowly

function screenAngle() {
  if (screen.orientation && typeof screen.orientation.angle === 'number') return screen.orientation.angle;
  return typeof window.orientation === 'number' ? window.orientation : 0;
}
function wrap(d) { return ((d + 540) % 360) - 180; }

function onEvent(e) {
  if (e.alpha == null && e.beta == null) return;
  state.events++;
  let alpha = e.alpha || 0;
  if (typeof e.webkitCompassHeading === 'number' && e.webkitCompassHeading >= 0) {
    // iOS: alpha is relative to an arbitrary start; the compass tells us true north.
    // heading == 360 - alpha_true for the axis alpha tracks, so offset = (360 - heading) - alpha.
    state.compass = true;
    const target = wrap(360 - e.webkitCompassHeading - alpha);
    state.northOffset = state.northOffset == null ? target : state.northOffset + OFFSET_SMOOTH * wrap(target - state.northOffset);
    alpha += state.northOffset;
  } else if (e.absolute || e.type === 'deviceorientationabsolute') {
    state.compass = true; state.absolute = true;
  } else if (state.absolute) {
    return; // prefer the absolute stream once we have it
  }
  alpha += state.trim;
  const nb = cameraBasis(alpha, e.beta || 0, e.gamma || 0, screenAngle());
  if (!state.basis) { state.basis = nb; return; }
  const b = state.basis;
  const lerp = (p, q) => [p[0] + SMOOTH * (q[0] - p[0]), p[1] + SMOOTH * (q[1] - p[1]), p[2] + SMOOTH * (q[2] - p[2])];
  const f = normalize(lerp(b.f, nb.f));
  const u0 = normalize(lerp(b.u, nb.u));
  const r = normalize(cross(f, u0));
  state.basis = { f, r, u: cross(r, f) };
}

export async function startOrientation() {
  const Evt = window.DeviceOrientationEvent;
  if (!Evt) return { ok: false, reason: 'unsupported' };
  if (typeof Evt.requestPermission === 'function') {
    try { if ((await Evt.requestPermission()) !== 'granted') return { ok: false, reason: 'denied' }; }
    catch { return { ok: false, reason: 'denied' }; }
  }
  if ('ondeviceorientationabsolute' in window) window.addEventListener('deviceorientationabsolute', onEvent, true);
  window.addEventListener('deviceorientation', onEvent, true);
  // Give the sensor a moment to report so we can tell a laptop (no events) from a phone.
  await new Promise((r) => setTimeout(r, 700));
  return state.events > 0 ? { ok: true } : { ok: false, reason: 'no-sensor' };
}

export function getBasis() { return state.basis; }
export function hasCompass() { return state.compass; }
export function setTrim(deg) { state.trim = deg; }
export function getTrim() { return state.trim; }
