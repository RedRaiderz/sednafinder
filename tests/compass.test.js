import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cameraBasis, compassOffset, deviceAxes, yawBasis } from '../src/sensors/orientation.js';

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
