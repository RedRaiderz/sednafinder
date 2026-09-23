// "Lab" sheet: hobby analysis on public data, computed on Solace by lab/*.py and shipped as
// data/lab/*.json. Every number here traces back to a catalogue or an archive file.
import * as F from './format.js';

let cache = null;
async function load() {
  if (cache) return cache;
  const [red, spec] = await Promise.all(['reddest', 'sedna_spectrum'].map((n) => fetch(`data/lab/${n}.json`).then((r) => r.json())));
  cache = { red, spec };
  return cache;
}

export async function renderLab() {
  const { red, spec } = await load();
  const solid = red.rows.filter((r) => r.solid).sort((a, b) => a.solidRank - b.solidRank);
  const top = solid.slice(0, 10);
  const sedna = red.rows.find((r) => /Sedna/.test(r.name));
  const max = Math.max(...red.rows.map((r) => r.S));
  const single = red.rows[0];

  let html = `<p class="kicker">Lab · public data</p><h2 class="title">The reddest things out there</h2>
    <p class="subtitle">${red.count} outer-solar-system bodies with a measured colour. Ranked by spectral slope: how much more red light than blue they reflect.</p>`;

  html += `<p class="section">Most reliably red · ${red.solidCount} well-measured</p>`;
  html += `<div class="lab-bars">${top.map((r) => bar(r, max, r.solidRank)).join('')}`;
  if (sedna && !top.includes(sedna)) html += `<div class="lab-gap">⋯</div>${bar(sedna, max, sedna.solidRank || sedna.rank, true)}`;
  html += `</div>`;
  html += `<p class="note">Ranked by the low end of each error bar, and only bodies measured at least three times. ${F.esc(single.name)} has the single highest value (${single.S}) but only ${single.epochs} measurements and no error estimate, so it isn't counted as solid yet.</p>`;

  html += `<p class="section">Sedna through JWST</p>`;
  html += spectrumSvg(spec);
  html += `<p class="note">Her reflectance from 0.65 to 5.2 µm: light from Sedna divided by sunlight, set to 1 at ${spec.normalisedAt} µm. The dips are ices absorbing light at their own wavelengths. The deep trough near 3 µm is where water ice and organics absorb.</p>`;
  html += `<p class="note">Re-extracted by us: the archive's automatic spectrum used an aperture off her position with no background removed, which made her look bright past 4.5 µm. Measuring her in the 3D data cube directly removes that (dashed line = archive version, before the fix).</p>`;

  html += `<p class="section">The math</p>
    <div class="lab-eq"><b>Reflectance from colours</b><code>R₂ / R₁ = 10<sup>−0.4 [(m₁ − m₂)<sub>obj</sub> − (m₁ − m₂)<sub>☉</sub>]</sup></code><span>Two magnitudes of the object, minus the Sun's own colour, give how much more it reflects in band 2.</span></div>
    <div class="lab-eq"><b>Spectral slope</b><code>S = (dR/dλ) / R × 100 nm</code><span>Fit a straight line to R against wavelength; S is its slope in % per 100 nm. Neutral grey = 0. Pholus ≈ 48.</span></div>
    <div class="lab-eq"><b>Flux units</b><code>F<sub>ν</sub> = F<sub>λ</sub> · λ² / c</code><span>JWST reports per-frequency flux; the solar model is per-wavelength. Convert before dividing.</span></div>
    <div class="lab-eq"><b>Aperture photometry</b><code>F = Σ<sub>aperture</sub> I − N<sub>pix</sub> · median(I<sub>annulus</sub>)</code><span>Add up the light in a circle around her, subtract the sky measured in a ring outside it.</span></div>`;

  html += `<p class="section">Sources</p>
    <p class="note">${F.esc(red.source)}.<br>${F.esc(spec.source)}.<br>Sun: ${F.esc(spec.sun)}.<br>Computed on Solace by <code>lab/reddest.py</code> and <code>lab/sedna_jwst.py</code>.</p>`;
  return html;
}

function bar(r, max, rank, hot) {
  const w = Math.max(2, (r.S / max) * 100);
  return `<div class="lab-bar${hot || /Sedna/.test(r.name) ? ' hot' : ''}">
    <span class="lab-rank">${rank}</span><span class="lab-name">${F.esc(r.name)}<small>${F.esc(r.cls)} · ${r.epochs}×</small></span>
    <span class="lab-track"><i style="width:${w.toFixed(1)}%"></i></span><span class="lab-val">${r.S.toFixed(1)}<small>±${r.err.toFixed(1)}</small></span></div>`;
}

function spectrumSvg(spec) {
  const W = 340, H = 190, L = 30, B = 24, T = 10, Rr = 8;
  const x = (um) => L + (um - 0.6) / (5.3 - 0.6) * (W - L - Rr);
  const y = (v) => T + (1 - v / 1.2) * (H - T - B);
  const pts = spec.points;
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join('');
  const band = pts.map((p) => `${x(p[0]).toFixed(1)},${y(p[1] + p[2]).toFixed(1)}`).join(' ') + ' ' +
    pts.slice().reverse().map((p) => `${x(p[0]).toFixed(1)},${y(Math.max(0, p[1] - p[2])).toFixed(1)}`).join(' ');
  const archive = spec.archive ? spec.archive.map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(1)},${y(Math.min(1.2, p[1])).toFixed(1)}`).join('') : '';
  const ticks = [1, 2, 3, 4, 5].map((u) => `<line x1="${x(u)}" x2="${x(u)}" y1="${H - B}" y2="${H - B + 4}" class="ax"/><text x="${x(u)}" y="${H - 6}" text-anchor="middle">${u}</text>`).join('');
  const yt = [0, 0.5, 1].map((v) => `<line x1="${L - 4}" x2="${W - Rr}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${L - 7}" y="${y(v) + 3.5}" text-anchor="end">${v}</text>`).join('');
  const seen = new Set();
  const bands = spec.bands.map((b) => {
    const lab = seen.has(b.label + Math.round(b.um)) ? '' : b.label; seen.add(b.label + Math.round(b.um));
    return `<line x1="${x(b.um)}" x2="${x(b.um)}" y1="${T}" y2="${H - B}" class="bandl"/>` + (lab ? `<text x="${x(b.um) + 2}" y="${T + 8}" class="bandt">${lab.replace(/(\d)/g, '<tspan baseline-shift="sub" font-size="6">$1</tspan>')}</text>` : '');
  }).join('');
  return `<svg class="lab-spec" viewBox="0 0 ${W} ${H}" role="img" aria-label="Sedna reflectance spectrum from JWST">
    ${yt}${bands}
    ${archive ? `<path d="${archive}" class="arch"/>` : ''}
    <polygon points="${band}" class="err"/><path d="${line}" class="spec"/>
    <line x1="${L}" x2="${W - Rr}" y1="${H - B}" y2="${H - B}" class="ax"/>${ticks}
    <text x="${W - Rr}" y="${H - B - 4}" text-anchor="end" class="unit">wavelength, µm</text>
  </svg>`;
}
