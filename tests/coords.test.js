import test from 'node:test';
import assert from 'node:assert/strict';
import { equatorialFromBody } from '../src/astronomy/coords.js';

const EARTH = { a: 1.00000261, e: 0.01671123, i: -0.00001531,
                Om: 0.0, w: 102.93768193, M0: -2.47311027, epoch: 2451545.0 };
// Sedna osculating elements from JPL SBDB (epoch 2461200.5).
const SEDNA = { a: 543.7195289104732, e: 0.8598824585187618, i: 11.92527582847476,
                Om: 144.5061662673739, w: 311.0987725939751, M0: 358.5956944005428, epoch: 2461200.5 };

test('Sedna geocentric distance is plausible (~80-90 AU) in 2026', () => {
  const jd = 2461203.5; // 2026-06-12 00:00 UTC (see time.js: matches julianDate)
  const { distAU } = equatorialFromBody(SEDNA, EARTH, jd);
  assert.ok(distAU > 80 && distAU < 90, `distAU=${distAU}`);
});

test('RA in [0,360), Dec in [-90,90]', () => {
  const jd = 2461203.5;
  const { ra, dec } = equatorialFromBody(SEDNA, EARTH, jd);
  assert.ok(ra >= 0 && ra < 360);
  assert.ok(dec >= -90 && dec <= 90);
});
