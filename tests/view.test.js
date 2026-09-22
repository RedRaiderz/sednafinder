import { test } from 'node:test';
import assert from 'node:assert/strict';
import { basisFromAltAz, project, unproject, projScale } from '../src/sky/view.js';
import { enuFromAltAz } from '../src/sky/model.js';
import { cameraBasis } from '../src/sensors/orientation.js';

for (const proj of ['stereo', 'gnomonic']) {
  test(`${proj}: unproject inverts project`, () => {
    const b = basisFromAltAz(30, 120); const view = { ...b, fov: 60, proj };
    const W = 400, H = 800, s = projScale(view, H), out = {};
    const v = enuFromAltAz(38, 131);
    assert.ok(project(view, v, W, H, s, out));
    const back = unproject(view, out.x, out.y, W, H, s);
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(back[i] - v[i]) < 1e-9);
  });
  test(`${proj}: higher target is above centre, east of an N-facing view is right`, () => {
    const view = { ...basisFromAltAz(20, 0), fov: 60, proj }; const s = projScale(view, 800); const o = {};
    project(view, enuFromAltAz(30, 0), 400, 800, s, o); assert.ok(o.y < 400 && Math.abs(o.x - 200) < 1e-9);
    project(view, enuFromAltAz(20, 10), 400, 800, s, o); assert.ok(o.x > 200);
  });
}

test('upright portrait phone facing north: basis looks north, up is up', () => {
  const b = cameraBasis(0, 90, 0, 0);
  assert.ok(Math.abs(b.f[1] - 1) < 1e-9 && Math.abs(b.u[2] - 1) < 1e-9 && Math.abs(b.r[0] - 1) < 1e-9);
});
test('landscape (screen angle 90, top to the left) keeps sky-up as screen-up', () => {
  // Phone upright, rotated so its top points west: gamma = -90 in W3C terms.
  const b = cameraBasis(0, 0, -90, 90);
  assert.ok(b.u[2] > 0.99, `up ${b.u}`);
});
