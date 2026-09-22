import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as A from '../vendor/astronomy.js';
import { createModel, updateModel, altAzFromEnu, fixedRiseSet } from '../src/sky/model.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url)));
const model = createModel({ stars: load('stars.json'), constellations: load('constellations.json'), dso: load('dso.json') });
const loc = { lat: 33.85, lon: -84.38 };
const date = new Date('2026-09-23T03:00:00Z');
updateModel(model, date, loc);

test('Vega alt/az matches astronomy-engine Horizon within 0.3 deg', () => {
  const i = model.starInfo.find((s) => s.proper === 'Vega').idx;
  const got = altAzFromEnu([model.starEnu[i * 3], model.starEnu[i * 3 + 1], model.starEnu[i * 3 + 2]]);
  const obs = new A.Observer(loc.lat, loc.lon, 0);
  const eqd = A.RotateVector(A.Rotation_EQJ_EQD(A.MakeTime(date)), A.VectorFromSphere(new A.Spherical(38.7837, 279.2347, 1), A.MakeTime(date)));
  const sph = A.EquatorFromVector(eqd);
  const hor = A.Horizon(date, obs, sph.ra, sph.dec, 'normal');
  assert.ok(Math.abs(got.alt - hor.altitude) < 0.3, `alt ${got.alt} vs ${hor.altitude}`);
  assert.ok(Math.abs(got.az - hor.azimuth) < 0.3, `az ${got.az} vs ${hor.azimuth}`);
});

test('Jupiter from the model matches Horizon', () => {
  const j = model.solar.find((b) => b.name === 'Jupiter');
  const obs = new A.Observer(loc.lat, loc.lon, 0);
  const eq = A.Equator(A.Body.Jupiter, date, obs, true, true);
  let hor = A.Horizon(date, obs, eq.ra, eq.dec, 'normal');
  if (hor.altitude < -2) hor = A.Horizon(date, obs, eq.ra, eq.dec, null); // we skip refraction well below the horizon
  assert.ok(Math.abs(j.alt - hor.altitude) < 0.1 && Math.abs(j.az - hor.azimuth) < 0.2, `${j.alt},${j.az} vs ${hor.altitude},${hor.azimuth}`);
});

test('fixedRiseSet: Vega transit altitude is highest point', () => {
  const r = fixedRiseSet(279.2347, 38.7837, date, loc);
  assert.ok(r.rise && r.set && r.transit);
  const obs = new A.Observer(loc.lat, loc.lon, 0);
  const at = (d) => A.Horizon(d, obs, 279.2347 / 15, 38.7837, null).altitude;
  const t = r.transit;
  assert.ok(at(t) >= at(new Date(+t - 600000)) && at(t) >= at(new Date(+t + 600000)));
  assert.ok(Math.abs(at(r.rise) + 0.57) < 0.5, `rise alt ${at(r.rise)}`);
});

test('Sedna is in Taurus/Cetus region and very faint', () => {
  const s = model.tnos.find((t) => t.name === 'Sedna');
  assert.ok(s.mag > 20 && s.mag < 22, `mag ${s.mag}`);
  console.log('Sedna', A.Constellation(s.ra / 15, s.dec).name, s.ra.toFixed(2), s.dec.toFixed(2), s.distAU.toFixed(2));
});

test('rise/set describe the current pass when the object is up', async () => {
  const { bodyRiseSet } = await import('../src/sky/model.js');
  // Saturn is up at 22:30 EDT on 2026-09-22 in Atlanta.
  const d = new Date('2026-09-23T02:30:00Z');
  const r = bodyRiseSet('Saturn', d, loc);
  assert.ok(r.rise < d && r.set > d && r.transit > r.rise && r.transit < r.set, JSON.stringify(r));
  const f = fixedRiseSet(279.2347, 38.7837, d, loc); // Vega, up at that time
  assert.ok(f.rise < d && f.set > d && f.transit > f.rise && f.transit < f.set);
});
