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

// Rotate a basis about Up so every azimuth increases by `deg`.
export function yawBasis(b, deg) {
  const t = deg * D2R, c = Math.cos(t), s = Math.sin(t);
  const rot = (v) => [v[0] * c + v[1] * s, -v[0] * s + v[1] * c, v[2]];
  return { f: rot(b.f), r: rot(b.r), u: rot(b.u) };
}
const yawOf = (v) => (Math.atan2(v[0], v[1]) * R2D + 360) % 360;

// North offset for iOS: webkitCompassHeading is the (magnetic) heading of whichever device axis,
// the rear camera (-Z) or the top edge (+Y), lies closer to horizontal. Measured on Paine's
// iPhone 15 Pro 2026-09-22: that rule gives one steady offset flat, upright and tilted 55° up,
// where the old "camera only while nearly upright" rule froze a stale offset whenever the phone
// pointed more than ~27° up. Measure the same axis in the raw, arbitrarily-oriented alpha frame;
// the offset is the difference. Pure, for tests.
// Near 45° (both axes about equally horizontal) iOS may be using either one, and the two readings
// give offsets about 180° apart. There the offset already held picks the one it agrees with; with
// nothing held, or neither within DEADZONE_TOL, it returns null. (Until 3.3.0 it always returned
// null there, so aiming ~40-50° up -- the Moon on 2026-09-26 -- kept an offset learned in another
// pose: 3.6° of that night's 10.8° azimuth error.)
const DEADZONE_TOL = 45;
export function compassOffset(alphaDeg, betaDeg, gammaDeg, headingDeg, declinationDeg = 0, heldDeg = null) {
  const { Y, Z } = deviceAxes(alphaDeg, betaDeg, gammaDeg);
  const cam = [-Z[0], -Z[1], -Z[2]];
  const hc = Math.hypot(cam[0], cam[1]), hy = Math.hypot(Y[0], Y[1]);
  const offCam = wrap(headingDeg + declinationDeg - yawOf(cam)), offTop = wrap(headingDeg + declinationDeg - yawOf(Y));
  if (Math.abs(hc - hy) >= 0.12) return hc > hy ? offCam : offTop;
  if (heldDeg == null) return null;
  const dc = Math.abs(wrap(offCam - heldDeg)), dt = Math.abs(wrap(offTop - heldDeg));
  if (Math.min(dc, dt) > DEADZONE_TOL) return null;
  return dc <= dt ? offCam : offTop;
}

// --- live sensor glue (browser only) ---
const state = {
  basis: null, northOffset: null, rejects: 0, trim: 0, compass: false, events: 0, absolute: false, declination: 0,
};
let SMOOTH = 0.22;          // basis low-pass per event (lower = steadier, used when zoomed in)
const OFFSET_SMOOTH = 0.04; // compass offset is noisy; follow it slowly
const GAP_MS = 800;         // iOS re-zeroes alpha when the sensor stream pauses (measured: 30-70° jumps)
const STEADY_DEG_S = 25;    // iOS heading lags the gyro; only learn from it while the phone is steady

function screenAngle() {
  if (screen.orientation && typeof screen.orientation.angle === 'number') return screen.orientation.angle;
  return typeof window.orientation === 'number' ? window.orientation : 0;
}
function wrap(d) { return ((d % 360) + 540) % 360 - 180; }

function onEvent(e) {
  if (e.alpha == null && e.beta == null) return;
  state.events++;
  const alpha = e.alpha || 0, beta = e.beta || 0, gamma = e.gamma || 0;
  const now = performance.now(), prev = state.raw;
  state.raw = { type: e.type, alpha: e.alpha, beta: e.beta, gamma: e.gamma, abs: !!e.absolute,
    hdg: e.webkitCompassHeading, hdgAcc: e.webkitCompassAccuracy, t: now };
  // After a pause the alpha frame may have been re-zeroed: forget the old offset and re-acquire.
  if (prev && now - prev.t > GAP_MS) { state.northOffset = null; state.basis = null; }
  let yaw = 0;
  if (typeof e.webkitCompassHeading === 'number') {
    state.compass = true;
    let rate = 0;
    if (prev && prev.alpha != null && now > prev.t) {
      const f0 = deviceAxes(prev.alpha, prev.beta, prev.gamma).Z, f1 = deviceAxes(alpha, beta, gamma).Z;
      rate = Math.acos(Math.max(-1, Math.min(1, f0[0] * f1[0] + f0[1] * f1[1] + f0[2] * f1[2]))) * R2D / ((now - prev.t) / 1000);
    }
    state.rate = state.rate == null ? rate : state.rate + 0.2 * (rate - state.rate);
    if (e.webkitCompassHeading >= 0 && (state.northOffset == null || state.rate < STEADY_DEG_S)) {
      const target = compassOffset(alpha, beta, gamma, e.webkitCompassHeading, state.declination, state.northOffset);
      if (target != null) {
        if (state.northOffset == null) state.northOffset = target;
        else {
          const d = wrap(target - state.northOffset);
          // A big disagreement that persists is real (frame re-zeroed); a brief one is heading lag.
          if (Math.abs(d) > 40 && ++state.rejects < 20) { /* skip */ }
          else { state.rejects = 0; state.northOffset = wrap(state.northOffset + (Math.abs(d) > 40 ? d : OFFSET_SMOOTH * d)); }
        }
      }
    }
    yaw = state.northOffset || 0; // keep the last good offset while the compass is uncalibrated (-1)
  } else if (e.absolute || e.type === 'deviceorientationabsolute') {
    state.compass = true; state.absolute = true;
    // absolute streams are already true-north referenced
  } else if (state.absolute) {
    return; // prefer the absolute stream once we have it
  }
  const nb = yawBasis(cameraBasis(alpha, beta, gamma, screenAngle()), yaw + state.trim);
  const b = state.basis;
  if (!b || b.f[0] * nb.f[0] + b.f[1] * nb.f[1] + b.f[2] * nb.f[2] < 0.5) { state.basis = nb; return; } // big jump: snap
  const lerp = (p, q) => [p[0] + SMOOTH * (q[0] - p[0]), p[1] + SMOOTH * (q[1] - p[1]), p[2] + SMOOTH * (q[2] - p[2])];
  const f = normalize(lerp(b.f, nb.f));
  const u0 = normalize(lerp(b.u, nb.u));
  const r = normalize(cross(f, u0));
  state.basis = { f, r, u: cross(r, f) };
}

export async function startOrientation(declinationDeg = 0) {
  state.declination = declinationDeg; state.basis = null; state.northOffset = null; state.rejects = 0;
  const Evt = window.DeviceOrientationEvent;
  if (!Evt) return { ok: false, reason: 'unsupported' };
  if (typeof Evt.requestPermission === 'function') {
    try { if ((await Evt.requestPermission()) !== 'granted') return { ok: false, reason: 'denied' }; }
    catch { return { ok: false, reason: 'denied' }; }
  }
  if (!state.listening) {
    if ('ondeviceorientationabsolute' in window) window.addEventListener('deviceorientationabsolute', onEvent, true);
    window.addEventListener('deviceorientation', onEvent, true);
    state.listening = true;
  }
  // Give the sensor a moment to report so we can tell a laptop (no events) from a phone.
  await new Promise((r) => setTimeout(r, 700));
  return state.events > 0 ? { ok: true } : { ok: false, reason: 'no-sensor' };
}

export function setDeclination(d) { state.declination = d; }
export function getBasis() { return state.basis; }
export function hasCompass() { return state.compass; }
export function setTrim(deg) { state.trim = deg; }
export function setSmoothing(k) { SMOOTH = k; }
export function getTrim() { return state.trim; }
// Snapshot for telemetry: last raw event + the fused state it produced.
export function sensorDebug() {
  return { raw: state.raw || null, northOffset: state.northOffset, rejects: state.rejects, trim: state.trim, rate: state.rate,
    decl: state.declination, absolute: state.absolute, events: state.events, screen: screenAngle() };
}
