import test from 'node:test';
import assert from 'node:assert/strict';
import { julianDate } from '../src/astronomy/time.js';

test('J2000 epoch is JD 2451545.0', () => {
  const d = new Date(Date.UTC(2000, 0, 1, 12, 0, 0)); // 2000-01-01 12:00 UTC
  assert.ok(Math.abs(julianDate(d) - 2451545.0) < 1e-6);
});

test('one day later is +1 JD', () => {
  const d = new Date(Date.UTC(2000, 0, 2, 12, 0, 0));
  assert.ok(Math.abs(julianDate(d) - 2451546.0) < 1e-6);
});
