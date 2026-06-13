import test from 'node:test';
import assert from 'node:assert/strict';
import { lightTimeSeconds, apparentMagnitude } from '../src/astronomy/photometry.js';

test('light crosses 1 AU in ~499 seconds', () => {
  assert.ok(Math.abs(lightTimeSeconds(1) - 499.0) < 1, lightTimeSeconds(1));
});

test('Sedna apparent magnitude is ~20-21', () => {
  // H~1.5, heliocentric ~84 AU, geocentric ~84 AU
  const m = apparentMagnitude(1.5, 84, 84);
  assert.ok(m > 20 && m < 21.5, `m=${m}`);
});
