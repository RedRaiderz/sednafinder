import test from 'node:test';
import assert from 'node:assert/strict';
import { BODIES, EARTH } from '../src/data/bodies.js';

test('Earth has J2000 epoch', () => {
  assert.equal(EARTH.epoch, 2451545.0);
});

test('there are exactly 7 target worlds', () => {
  assert.equal(BODIES.length, 7);
});

test('every body has elements + facts', () => {
  for (const b of BODIES) {
    for (const k of ['a', 'e', 'i', 'Om', 'w', 'M0', 'epoch', 'H']) {
      assert.equal(typeof b[k], 'number', `${b.name} missing ${k}`);
    }
    assert.equal(typeof b.name, 'string');
    assert.ok(b.facts && typeof b.facts.blurb === 'string');
  }
});

test('Sedna semi-major axis is ~500 AU', () => {
  const sedna = BODIES.find((b) => b.name === 'Sedna');
  assert.ok(sedna.a > 490 && sedna.a < 520, `a=${sedna.a}`);
});
