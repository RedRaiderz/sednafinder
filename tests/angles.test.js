import test from 'node:test';
import assert from 'node:assert/strict';
import { deg2rad, rad2deg, norm360, angleDiff } from '../src/astronomy/angles.js';

test('deg2rad and rad2deg round-trip', () => {
  assert.ok(Math.abs(deg2rad(180) - Math.PI) < 1e-12);
  assert.ok(Math.abs(rad2deg(Math.PI) - 180) < 1e-12);
});

test('norm360 wraps into [0,360)', () => {
  assert.equal(norm360(370), 10);
  assert.equal(norm360(-10), 350);
  assert.equal(norm360(0), 0);
});

test('angleDiff returns shortest signed difference', () => {
  assert.equal(angleDiff(10, 350), 20);    // 10 is 20deg "ahead" of 350
  assert.equal(angleDiff(350, 10), -20);
  assert.equal(angleDiff(180, 0), 180);
});
