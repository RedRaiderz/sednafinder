import test from 'node:test';
import assert from 'node:assert/strict';
import { solveKepler } from '../src/astronomy/kepler.js';
import { deg2rad } from '../src/astronomy/angles.js';

test('solution satisfies Kepler equation E - e*sinE = M', () => {
  const Mdeg = 30, e = 0.8;
  const Edeg = solveKepler(Mdeg, e);
  const E = deg2rad(Edeg), M = deg2rad(Mdeg);
  const residual = E - e * Math.sin(E) - M;
  assert.ok(Math.abs(residual) < 1e-8, `residual ${residual}`);
});

test('M=0 gives E=0; M=180 gives E=180', () => {
  assert.ok(Math.abs(solveKepler(0, 0.5)) < 1e-6);
  assert.ok(Math.abs(solveKepler(180, 0.5) - 180) < 1e-6);
});
