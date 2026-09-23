// Builds data/*.json from the raw catalogs in tools/raw/ (not committed).
//   HYG v4.1 star database  -> data/stars.json
//   Stellarium modern sky culture -> data/constellations.json
//   OpenNGC (NGC + addendum) -> data/dso.json
// Run: node tools/build-data.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const RAW = new URL('./raw/', import.meta.url);
const OUT = new URL('../data/', import.meta.url);
const MAG_LIMIT = 6.0;

// ---------- CSV helper (HYG uses quotes; OpenNGC uses ';' with no quotes) ----------
function parseCSVLine(line) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur); return out;
}

const GREEK = { Alp: 'α', Bet: 'β', Gam: 'γ', Del: 'δ', Eps: 'ε', Zet: 'ζ', Eta: 'η', The: 'θ',
  Iot: 'ι', Kap: 'κ', Lam: 'λ', Mu: 'μ', Nu: 'ν', Xi: 'ξ', Omi: 'ο', Pi: 'π', Rho: 'ρ', Sig: 'σ',
  Tau: 'τ', Ups: 'υ', Phi: 'φ', Chi: 'χ', Psi: 'ψ', Ome: 'ω' };
function bayerLabel(bayer, con) {
  if (!bayer) return '';
  const m = bayer.match(/^([A-Za-z]+)(-?\d*)$/);
  if (!m) return '';
  const g = GREEK[m[1]]; if (!g) return '';
  const sup = m[2] ? m[2].replace('-', '') : '';
  return `${g}${sup} ${con}`;
}

// ---------- constellations (needs star HIP set first) ----------
const cl = JSON.parse(readFileSync(new URL('cl.json', RAW), 'utf8'));
const lineHips = new Set();
for (const c of cl.constellations) for (const seg of c.lines) for (const h of seg) lineHips.add(h);

// ---------- stars ----------
const hygLines = readFileSync(new URL('hyg.csv', RAW), 'utf8').split('\n');
const H = parseCSVLine(hygLines[0]);
const col = (n) => H.indexOf(n);
const I = { hip: col('hip'), proper: col('proper'), ra: col('ra'), dec: col('dec'), mag: col('mag'),
  ci: col('ci'), bayer: col('bayer'), flam: col('flam'), con: col('con'), dist: col('dist'),
  spect: col('spect'), absmag: col('absmag') };

const stars = []; const hipIndex = {};
for (let i = 2; i < hygLines.length; i++) { // row 1 is the Sun
  if (!hygLines[i]) continue;
  const r = parseCSVLine(hygLines[i]);
  const mag = parseFloat(r[I.mag]); const hip = parseInt(r[I.hip], 10) || 0;
  if (!(mag <= MAG_LIMIT) && !lineHips.has(hip)) continue;
  if (hip && hipIndex[hip] !== undefined) continue;
  const raDeg = parseFloat(r[I.ra]) * 15, dec = parseFloat(r[I.dec]);
  const ci = parseFloat(r[I.ci]); const dist = parseFloat(r[I.dist]);
  const s = [
    +raDeg.toFixed(4), +dec.toFixed(4), +mag.toFixed(2), Number.isFinite(ci) ? +ci.toFixed(2) : 0.6,
  ];
  const name = r[I.proper] || '';
  const des = bayerLabel(r[I.bayer], r[I.con]) || (r[I.flam] ? `${r[I.flam]} ${r[I.con]}` : '');
  // Extra detail only for stars worth a detail sheet (named or bright).
  if (name || mag < 4.5) {
    s.push(name, des, r[I.con], dist > 0 && dist < 100000 ? +(dist * 3.26156).toFixed(1) : 0,
      r[I.spect] || '', hip);
  }
  if (hip) hipIndex[hip] = stars.length;
  stars.push(s);
}
// Sort bright-first so the renderer can stop early at a magnitude limit.
const order = stars.map((_, i) => i).sort((a, b) => stars[a][2] - stars[b][2]);
const remap = {}; order.forEach((old, n) => { remap[old] = n; });
const sorted = order.map((i) => stars[i]);
for (const h in hipIndex) hipIndex[h] = remap[hipIndex[h]];

// ---------- constellation output ----------
const cons = [];
for (const c of cl.constellations) {
  const abbr = c.id.split(' ').pop();
  const lines = [];
  for (const seg of c.lines) {
    const idx = seg.map((h) => hipIndex[h]).filter((v) => v !== undefined);
    if (idx.length >= 2) lines.push(idx);
  }
  cons.push({ abbr, name: c.common_name.native, meaning: c.common_name.english, lines });
}

// ---------- deep sky ----------
function hms(s) { const [h, m, x] = s.split(':').map(Number); return (h + m / 60 + x / 3600) * 15; }
function dms(s) { const sg = s[0] === '-' ? -1 : 1; const [d, m, x] = s.replace(/^[+-]/, '').split(':').map(Number); return sg * (d + m / 60 + x / 3600); }
const TYPES = { G: 'Galaxy', GGroup: 'Galaxy group', GPair: 'Galaxy pair', GTrpl: 'Galaxy triplet',
  OCl: 'Open cluster', GCl: 'Globular cluster', 'Cl+N': 'Cluster + nebula', PN: 'Planetary nebula',
  HII: 'Emission nebula', EmN: 'Emission nebula', RfN: 'Reflection nebula', Neb: 'Nebula', SNR: 'Supernova remnant',
  '*Ass': 'Star cloud', '**': 'Double star', DrkN: 'Dark nebula', Other: 'Other' };
// A few famous non-Messier showpieces worth listing.
const EXTRA = { NGC0869: 'Double Cluster (h Per)', NGC0884: 'Double Cluster (χ Per)', NGC0253: 'Sculptor Galaxy',
  NGC5139: 'Omega Centauri', NGC0104: '47 Tucanae', NGC3372: 'Carina Nebula', NGC7000: 'North America Nebula',
  NGC2392: 'Eskimo Nebula', NGC7293: 'Helix Nebula', NGC6543: "Cat's Eye Nebula", NGC0457: 'Owl Cluster',
  NGC2244: 'Rosette Cluster', NGC5128: 'Centaurus A', NGC6960: 'Veil Nebula (West)', NGC4565: 'Needle Galaxy',
  NGC0292: 'Small Magellanic Cloud', NGC2070: 'Tarantula Nebula' };
const dso = [];
for (const file of ['ngc.csv', 'add.csv']) {
  const rows = readFileSync(new URL(file, RAW), 'utf8').split('\n');
  const h = rows[0].split(';'); const c = (n) => h.indexOf(n);
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i].split(';'); if (r.length < 10) continue;
    const name = r[c('Name')]; const m = r[c('M')];
    if (!m && !EXTRA[name]) continue;
    if (r[c('Type')] === 'Dup') continue;
    const vmag = parseFloat(r[c('V-Mag')]); const bmag = parseFloat(r[c('B-Mag')]);
    dso.push({
      id: m ? `M${parseInt(m, 10)}` : name.replace(/^NGC0*/, 'NGC '),
      ngc: m && name.startsWith('NGC') ? name.replace(/^NGC0*/, 'NGC ') : (m && name.startsWith('IC') ? name.replace(/^IC0*/, 'IC ') : ''),
      name: (r[c('Common names')] || '').split(',')[0] || EXTRA[name] || '',
      type: TYPES[r[c('Type')]] || r[c('Type')],
      ra: +hms(r[c('RA')]).toFixed(4), dec: +dms(r[c('Dec')]).toFixed(4),
      mag: Number.isFinite(vmag) ? vmag : (Number.isFinite(bmag) ? bmag : null),
      size: parseFloat(r[c('MajAx')]) || null, con: r[c('Const')],
    });
  }
}
// OpenNGC lists some Messier objects twice (component rows); keep the first per id.
const seen = new Set(); const dsoOut = [];
for (const d of dso.sort((a, b) => (parseInt(a.id.slice(1)) || 999) - (parseInt(b.id.slice(1)) || 999))) {
  if (seen.has(d.id)) continue; seen.add(d.id); dsoOut.push(d);
}

writeFileSync(new URL('stars.json', OUT), JSON.stringify(sorted));

// ---------- deep stars for telescope mode (packed binary, fainter than the main set) ----------
// 6 bytes/star, little-endian: u16 RA (0..360), i16 Dec (-90..90), u8 mag*20, i8 B-V*50. Bright-first.
const DEEP_LIMIT = 9.0;
const deep = [];
for (let i = 2; i < hygLines.length; i++) {
  if (!hygLines[i]) continue;
  const r = parseCSVLine(hygLines[i]);
  const mag = parseFloat(r[I.mag]); const hip = parseInt(r[I.hip], 10) || 0;
  if (!(mag > MAG_LIMIT && mag <= DEEP_LIMIT) || (hip && hipIndex[hip] !== undefined)) continue;
  deep.push([parseFloat(r[I.ra]) * 15, parseFloat(r[I.dec]), mag, parseFloat(r[I.ci])]);
}
deep.sort((a, b) => a[2] - b[2]);
const buf = Buffer.alloc(deep.length * 6);
deep.forEach(([ra, dec, mag, ci], k) => {
  const o = k * 6;
  buf.writeUInt16LE(Math.round(((ra % 360) + 360) % 360 / 360 * 65535), o);
  buf.writeInt16LE(Math.round(dec / 90 * 32767), o + 2);
  buf.writeUInt8(Math.min(255, Math.round(mag * 20)), o + 4);
  buf.writeInt8(Math.max(-127, Math.min(127, Math.round((Number.isFinite(ci) ? ci : 0.6) * 50))), o + 5);
});
writeFileSync(new URL('stars_deep.bin', OUT), buf);
console.log('deep stars', deep.length, 'bytes', buf.length);
writeFileSync(new URL('constellations.json', OUT), JSON.stringify(cons));
writeFileSync(new URL('dso.json', OUT), JSON.stringify(dsoOut));
console.log(`stars ${sorted.length}, constellations ${cons.length}, dso ${dsoOut.length} (messier ${dsoOut.filter((d) => /^M\d/.test(d.id)).length})`);
