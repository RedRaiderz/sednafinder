import test from 'node:test';
import assert from 'node:assert/strict';
import { projectToScreen, isHovering } from '../src/render/projection.js';

const W = 400, H = 800, FOV = 60; // horizontal field of view degrees

test('target dead ahead maps to screen center, on-screen', () => {
  const p = projectToScreen({ az: 180, alt: 30 }, { az: 180, alt: 30 }, FOV, W, H);
  assert.ok(p.onScreen);
  assert.ok(Math.abs(p.x - W / 2) < 1e-6);
  assert.ok(Math.abs(p.y - H / 2) < 1e-6);
});

test('target at +half-FOV in azimuth maps to right edge', () => {
  const p = projectToScreen({ az: 180, alt: 30 }, { az: 210, alt: 30 }, FOV, W, H);
  assert.ok(Math.abs(p.x - W) < 1e-6, `x=${p.x}`);
});

test('higher target maps above center (smaller y)', () => {
  const p = projectToScreen({ az: 180, alt: 30 }, { az: 180, alt: 40 }, FOV, W, H);
  assert.ok(p.y < H / 2);
});

test('target behind you is off-screen', () => {
  const p = projectToScreen({ az: 180, alt: 30 }, { az: 0, alt: 30 }, FOV, W, H);
  assert.ok(!p.onScreen);
});

test('isHovering true only within threshold of center', () => {
  assert.ok(isHovering({ x: 205, y: 405 }, W / 2, H / 2, 30));
  assert.ok(!isHovering({ x: 50, y: 50 }, W / 2, H / 2, 30));
});
