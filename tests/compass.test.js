import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cameraBasis, compassOffset, deviceAxes, yawBasis, trimFromMark } from '../src/sensors/orientation.js';

const az = (v) => (Math.atan2(v[0], v[1]) * 180 / Math.PI + 360) % 360;
const near = (a, b, tol) => Math.abs(((a - b + 540) % 360) - 180) < tol;

// Simulate iOS: the phone's true pose has alpha_true; iOS reports alpha_raw = alpha_true - k (arbitrary)
// and a heading equal to the true azimuth of whichever of camera / top edge is more horizontal.
for (const [beta, gamma] of [[90, 0], [110, 0], [112, 5], [100, -8], [70, 3], [12, 4], [150, 3], [160, -6], [25, -10]]) {
  test(`compass offset recovers true north (beta ${beta}, gamma ${gamma})`, () => {
    const alphaTrue = 57, k = 133;
    const truth = cameraBasis(alphaTrue, beta, gamma);
    const { Y, Z } = deviceAxes(alphaTrue, beta, gamma);
    const heading = Math.hypot(Z[0], Z[1]) > Math.hypot(Y[0], Y[1]) ? az(truth.f) : az(Y);
    const off = compassOffset(alphaTrue - k, beta, gamma, heading, 0);
    const fixed = yawBasis(cameraBasis(alphaTrue - k, beta, gamma), off);
    assert.ok(near(az(fixed.f), az(truth.f), 0.5), `got ${az(fixed.f)} want ${az(truth.f)}`);
  });
}

test('near-45° pose (either axis possible) returns null', () => {
  assert.equal(compassOffset(10, 135, 0, 200, 0), null);
});

// Real iPhone 15 Pro frames, 2026-09-22 West Lafayette, reticle on the Moon (true az 154.35°, alt 27.7°).
// Two sessions with different arbitrary alpha frames must both land on the Moon.
for (const [a, b, g, hdg] of [[5.3, 118.1, -6.1, 159.7], [295.5, 118.7, -0.6, 158.8]]) {
  test(`real iPhone frame lands on the Moon (alpha ${a})`, () => {
    const off = compassOffset(a, b, g, hdg, -4.55);
    const f = yawBasis(cameraBasis(a, b, g), off).f;
    assert.ok(near(az(f), 154.35, 3), `az ${az(f)}`);
    assert.ok(Math.abs(Math.asin(f[2]) * 180 / Math.PI - 27.7) < 2);
  });
}

// Near 45° iOS may report either axis; the offset already held picks the reading it agrees with.
// Camera 45° up (beta ~135): the two readings are ~180° apart, so the pick is exact. Camera 45° down (beta 45): the
// axes point nearly the same way and the readings differ only by the roll, so the pick is within that (3° here).
for (const [beta, gamma, tol] of [[135, 0, 0.5], [132, 4, 0.5], [138, -3, 0.5], [45, 2, 3]]) {
  for (const useCam of [true, false]) {
    test(`dead zone (beta ${beta}, gamma ${gamma}, iOS using ${useCam ? 'camera' : 'top edge'}) resolved by the held offset`, () => {
      const alphaTrue = 57, k = 133;
      const truth = cameraBasis(alphaTrue, beta, gamma);
      const { Y } = deviceAxes(alphaTrue, beta, gamma);
      const heading = useCam ? az(truth.f) : az(Y);
      const trueOff = -k; // raw alpha = true - k puts every raw azimuth k ahead
      for (const drift of [-30, 0, 30]) {
        const off = compassOffset(alphaTrue - k, beta, gamma, heading, 0, trueOff + drift);
        const fixed = yawBasis(cameraBasis(alphaTrue - k, beta, gamma), off);
        assert.ok(near(az(fixed.f), az(truth.f), tol), `drift ${drift}: got ${az(fixed.f)} want ${az(truth.f)}`);
      }
      assert.equal(compassOffset(alphaTrue - k, beta, gamma, heading, 0, trueOff + 90), null);
    });
  }
}

// Real frame, 2026-09-26 Purdue, his first "I'm on it" on the Moon (az 173.24°, alt 49.7°): camera 49° up sits in
// the dead zone. Held offset -175.4° (what the app had). The fresh reading must be taken (not the one 180° away);
// what is left, ~7°, is the iOS compass itself (webkitCompassAccuracy 10 that night).
test('real dead-zone frame on the Moon takes the fresh reading next to the held offset', () => {
  const [a, b, g, hdg, decl] = [358.58682521997486, 139.08497192331572, 1.0182228611246837, 6.520928859710693, -4.54];
  assert.equal(compassOffset(a, b, g, hdg, decl), null);
  const off = compassOffset(a, b, g, hdg, decl, -175.4);
  assert.ok(near(off, -175.4, 10), `off ${off}`);
  const f = yawBasis(cameraBasis(a, b, g), off).f;
  assert.ok(near(az(f), 173.24, 8), `az ${az(f)}`);
});

// One-tap aim fix: the trim from a mark turns the camera's azimuth onto the body.
test('trimFromMark puts the marked body on the reticle (sign)', () => {
  const b = cameraBasis(40, 120, 3), camAz = az(b.f), bodyAz = camAz - 7.3; // app reads 7.3° too far east
  const t = trimFromMark(0, camAz - bodyAz);
  assert.ok(near(az(yawBasis(b, t).f), bodyAz, 1e-6));
  assert.ok(near(trimFromMark(-2, 350 - 355), 3, 1e-9)); // wraps: dAz -5 from an existing -2 trim gives +3
});

// Replay of his 2026-09-26 session (app's own logged camera azimuths, 3.2.1): fixing the aim on the first Moon mark
// cuts the second mark's error (13 s later) from 14.9° to 4.1°. What is left is the iOS heading drifting between them.
test('fix on his first 09-26 Moon mark helps the second', () => {
  const m1 = { cam: 184.02, moon: 173.24 }, m2 = { cam: 188.24, moon: 173.32 };
  const t = trimFromMark(0, m1.cam - m1.moon);
  const before = Math.abs(m2.cam - m2.moon), after = Math.abs(m2.cam + t - m2.moon);
  assert.ok(before > 14 && after < 5, `before ${before} after ${after}`);
});
