import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cameraBasis, compassOffset, yawBasis } from '../src/sensors/orientation.js';

const az = (v) => (Math.atan2(v[0], v[1]) * 180 / Math.PI + 360) % 360;
const near = (a, b, tol) => Math.abs(((a - b + 540) % 360) - 180) < tol;

// Simulate iOS: the phone's true pose has alpha_true; iOS reports alpha_raw = alpha_true - k (arbitrary)
// and a heading equal to the true azimuth of the camera (upright) or of the top edge (flat).
for (const [beta, gamma] of [[90, 0], [110, 0], [112, 5], [100, -8], [70, 3], [12, 4]]) {
  test(`compass offset recovers true north (beta ${beta}, gamma ${gamma})`, () => {
    const alphaTrue = 57, k = 133;
    const truth = cameraBasis(alphaTrue, beta, gamma);
    const flat = beta < 45;
    const topAz = az(cameraBasis(alphaTrue, beta, gamma).u); // device top ~ screen up in portrait
    const heading = flat ? az([truth.u[0], truth.u[1], 0]) : az(truth.f);
    const off = compassOffset(alphaTrue - k, beta, gamma, heading, 0);
    const fixed = yawBasis(cameraBasis(alphaTrue - k, beta, gamma), off);
    assert.ok(near(az(fixed.f), az(truth.f), 0.5), `got ${az(fixed.f)} want ${az(truth.f)} (top ${topAz})`);
  });
}

test('ambiguous steep pose returns null (offset is held)', () => {
  assert.equal(compassOffset(10, 150, 3, 200, 0), null);
});
