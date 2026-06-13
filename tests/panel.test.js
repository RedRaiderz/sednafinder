import test from 'node:test';
import assert from 'node:assert/strict';
import { formatLiveStats } from '../src/ui/panel.js';

test('formats distance, light-time, and visibility note', () => {
  const rows = formatLiveStats(
    { name: 'Sedna', facts: { blurb: 'x' }, H: 1.5 },
    { distAU: 84, ra: 40, dec: 7, alt: -30, az: 120, rHelio: 84 }
  );
  const map = Object.fromEntries(rows.map((r) => [r.label, r.value]));
  assert.ok(map['Distance from Earth'].includes('84.0 AU'));
  assert.ok(map['Light-time'].toLowerCase().includes('hour'));
  assert.ok(map['Above horizon?'].toLowerCase().includes('below'));
  assert.ok(map['Apparent magnitude'].includes('too faint'));
});
