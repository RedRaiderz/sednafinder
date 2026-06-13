import test from 'node:test';
import assert from 'node:assert/strict';
import { heliocentricEcliptic, meanAnomalyAtJD } from '../src/astronomy/orbit.js';

// Earth (EM barycenter) J2000 heliocentric ecliptic elements.
const EARTH = { a: 1.00000261, e: 0.01671123, i: -0.00001531,
                Om: 0.0, w: 102.93768193, M0: -2.47311027, epoch: 2451545.0 };

test('mean anomaly advances with time', () => {
  const m0 = meanAnomalyAtJD(EARTH, 2451545.0);
  const m1 = meanAnomalyAtJD(EARTH, 2451545.0 + 1);
  assert.ok(Math.abs(((m1 - m0 + 540) % 360) - 180 - 0.9856) < 0.01); // ~0.9856 deg/day
});

test('Earth-Sun distance at J2000 is ~0.983 AU', () => {
  const p = heliocentricEcliptic(EARTH, 2451545.0);
  const r = Math.hypot(p.x, p.y, p.z);
  assert.ok(r > 0.982 && r < 0.985, `r=${r}`);
});
