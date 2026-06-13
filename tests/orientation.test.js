import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraDirection } from '../src/sensors/orientation.js';

test('phone flat on table (screen up) -> camera points straight down', () => {
  const { alt } = cameraDirection(0, 0, 0);
  assert.ok(Math.abs(alt - (-90)) < 1e-6, `alt=${alt}`);
});

test('phone upright in portrait (beta=90) -> camera at horizon, due north', () => {
  const { az, alt } = cameraDirection(0, 90, 0);
  assert.ok(Math.abs(alt) < 1e-6, `alt=${alt}`);
  assert.ok(Math.abs(az) < 1e-6 || Math.abs(az - 360) < 1e-6, `az=${az}`);
});
