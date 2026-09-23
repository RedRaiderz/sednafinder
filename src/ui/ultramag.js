// Ultramag: a continuous zoom from Sedna's real star field down to the world itself.
// Wide end is real (catalogue stars, her computed path with its yearly parallax loops); past what
// any telescope resolves, procedural stars and a rendered globe take over, flagged "not to scale".
import { EARTH } from '../data/bodies.js';
import { equatorialFromBody } from '../astronomy/coords.js';
import { eqjVector, attachDeepStars, constellationOf } from '../sky/model.js';

const D2R = Math.PI / 180;
const FOV_MAX = 14, FOV_MIN = 7.5e-6;           // degrees across the short side of the screen
const REAL_LIMIT = 0.5;                        // below this field, background stars are invented

let ui = null;

export function ultramagOpen() { return !!ui; }

export async function openUltramag(model, date) {
  if (ui) return;
  const sedna = model.tnos.find((t) => t.name === 'Sedna');
  if (!sedna) return;
  if (!model.deep) {
    try { attachDeepStars(model, await (await fetch('data/stars_deep.bin')).arrayBuffer()); } catch { /* bright stars only */ }
  }
  const root = document.createElement('div');
  root.className = 'ultra';
  root.innerHTML = `<canvas></canvas>
    <header><div><p class="kicker">Ultramag</p><h2>Sedna</h2><p class="u-sub" id="uSub"></p></div><button class="ghost" id="uClose">Close</button></header>
    <div class="u-read"><b id="uFov"></b><span id="uLike"></span></div>
    <p class="u-scale" id="uScale">Artist’s impression · not to scale</p>
    <div class="u-ctl"><button class="ghost" id="uOut">Out</button><input id="uZoom" type="range" min="0" max="1000" value="0" aria-label="Zoom"><button class="solid" id="uIn">Fly in</button></div>`;
  document.body.appendChild(root);
  const cv = root.querySelector('canvas'), ctx = cv.getContext('2d');

  const jd0 = date.getTime() / 86400000 + 2440587.5;
  const here = equatorialFromBody(sedna.el, EARTH, jd0);
  const f = eqjVector(here.ra, here.dec);
  const e = norm(cross([0, 0, 1], f)), n = cross(f, e);   // east, north on the tangent plane
  const path = [];
  for (let jd = jd0 - 30 * 365.25; jd <= jd0 + 30 * 365.25; jd += 7) {
    const q = equatorialFromBody(sedna.el, EARTH, jd);
    path.push({ v: eqjVector(q.ra, q.dec), jd });
  }
  const angDiam = 2 * Math.atan(sedna.el.facts.diameterKm / 2 / (here.distAU * 149597870.7)) / D2R;
  root.querySelector('#uSub').textContent = `${here.distAU.toFixed(1)} AU away · magnitude ${sedna.mag.toFixed(1)} · in ${constellationOf(here.ra, here.dec).name}`;

  ui = { root, cv, ctx, z: 0, target: null, f, e, n, path, angDiam, jd0, globe: makeGlobe(), t0: performance.now(), model };
  const zoomIn = root.querySelector('#uZoom');
  const setZ = (z) => { ui.z = Math.max(0, Math.min(1, z)); zoomIn.value = Math.round(ui.z * 1000); };
  zoomIn.addEventListener('input', () => { ui.target = null; ui.z = zoomIn.value / 1000; });
  root.querySelector('#uIn').addEventListener('click', () => { ui.target = 1; });
  root.querySelector('#uOut').addEventListener('click', () => { ui.target = 0; });
  root.querySelector('#uClose').addEventListener('click', closeUltramag);
  // Pinch to zoom.
  const pts = new Map(); let pinch = null;
  cv.addEventListener('pointerdown', (ev) => { cv.setPointerCapture(ev.pointerId); pts.set(ev.pointerId, [ev.clientX, ev.clientY]); if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: ui.z }; ui.target = null; } });
  cv.addEventListener('pointermove', (ev) => {
    if (!pts.has(ev.pointerId)) return; pts.set(ev.pointerId, [ev.clientX, ev.clientY]);
    if (pinch && pts.size >= 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); setZ(pinch.z + Math.log10(d / pinch.d) / Math.log10(FOV_MAX / FOV_MIN)); }
  });
  const up = (ev) => { pts.delete(ev.pointerId); if (pts.size < 2) pinch = null; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', (ev) => { ev.preventDefault(); ui.target = null; setZ(ui.z - ev.deltaY * 0.0006); }, { passive: false });
  ui.setZ = setZ;
  requestAnimationFrame(loop);
}

export function closeUltramag() { if (ui) { ui.root.remove(); ui = null; } }

function loop(t) {
  if (!ui) return;
  requestAnimationFrame(loop);
  if (ui.target != null) {
    const d = ui.target - ui.z; // ease; ~12 s for the whole flight
    ui.setZ(Math.abs(d) < 0.0005 ? ui.target : ui.z + Math.sign(d) * Math.min(Math.abs(d), 0.0009 + Math.abs(d) * 0.012));
    if (ui.z === ui.target) ui.target = null;
  }
  draw(t);
}

// ---------- drawing ----------
function draw(t) {
  const { cv, ctx } = ui;
  const dpr = Math.min(window.devicePixelRatio || 1, 3), W = window.innerWidth, H = window.innerHeight;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const fov = FOV_MAX * Math.pow(FOV_MIN / FOV_MAX, ui.z);
  const s = (Math.min(W, H) / 2) / Math.tan(fov / 2 * D2R);  // px per tangent unit
  const cx = W / 2, cy = H / 2;
  const proj = (v) => { const z = dot(v, ui.f); if (z <= 0) return null; return [cx - dot(v, ui.e) / z * s, cy - dot(v, ui.n) / z * s]; };

  // Background: deep ink with a faint warm bloom that grows as we close in.
  const close = smooth(Math.log10(1), Math.log10(1e-4), Math.log10(fov));
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.75);
  g.addColorStop(0, mixc([7, 9, 18], [28, 10, 14], close)); g.addColorStop(1, 'rgb(3,4,9)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  // Real stars (bright + deep catalogue), fading out once the field is far too small for them.
  const realA = 1 - smooth(Math.log10(0.05), Math.log10(0.004), Math.log10(fov));
  if (realA > 0.01) {
    const M = ui.model, magLim = 9;
    drawStarSet(ctx, M.starEqj, M.starMag, M.starCi, M.starCount, proj, W, H, fov, realA, magLim);
    if (M.deep) drawStarSet(ctx, M.deep.eqj, M.deep.mag, M.deep.ci, M.deep.n, proj, W, H, fov, realA, magLim);
  }
  // Invented faint stars: a self-similar field so the zoom never runs dry.
  drawProcedural(ctx, fov, W, H, cx, cy, s, 1 - smooth(Math.log10(0.1), Math.log10(REAL_LIMIT), Math.log10(fov)));

  // Her path: weekly positions ±30 years; Earth's orbit makes the yearly loops.
  const pathA = 1 - smooth(Math.log10(0.002), Math.log10(0.0002), Math.log10(fov));
  if (pathA > 0.01) drawPath(ctx, proj, W, H, fov, pathA);

  // Sedna.
  const rPx = Math.tan(ui.angDiam / 2 * D2R) * s;
  drawSedna(ctx, cx, cy, rPx, t);

  // Readouts.
  root$('uFov').textContent = fmtField(fov);
  root$('uLike').textContent = likeText(fov);
  root$('uScale').classList.toggle('on', fov < REAL_LIMIT);
}

function drawStarSet(ctx, eqj, mag, ci, count, proj, W, H, fov, alpha, magLim) {
  const cosLim = Math.cos(Math.min(89, fov) * D2R);
  for (let i = 0; i < count; i++) {
    const m = mag[i]; if (m > magLim) break;
    const v = [eqj[i * 3], eqj[i * 3 + 1], eqj[i * 3 + 2]];
    if (dot(v, ui.f) < cosLim) continue;
    const p = proj(v); if (!p || p[0] < -20 || p[1] < -20 || p[0] > W + 20 || p[1] > H + 20) continue;
    const r = Math.max(0.7, 3.2 - 0.33 * m);
    const c = starColor(ci[i]);
    if (m < 6.5) { glow(ctx, p[0], p[1], r * 5, c, 0.22 * alpha); }
    ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${Math.min(1, (0.45 + (magLim - m) * 0.12)) * alpha})`;
    ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 7); ctx.fill();
  }
}

// Stars on a hierarchy of grids: level k has cell size 10^-k degrees; each level fades in as it
// becomes the right density for the current field, so zooming reveals ever-fainter stars.
function drawProcedural(ctx, fov, W, H, cx, cy, s, alpha) {
  if (alpha < 0.02) return;
  const pxPerDeg = s * D2R;
  for (let k = -1; k <= 7; k++) {
    const cell = Math.pow(10, -k);
    const cellPx = cell * pxPerDeg;
    const a = alpha * smooth(18, 60, cellPx) * (1 - smooth(900, 3000, cellPx));
    if (a < 0.02) continue;
    const half = [W / 2 / pxPerDeg, H / 2 / pxPerDeg];
    const i0 = Math.floor(-half[0] / cell) - 1, i1 = Math.ceil(half[0] / cell) + 1;
    const j0 = Math.floor(-half[1] / cell) - 1, j1 = Math.ceil(half[1] / cell) + 1;
    if ((i1 - i0) * (j1 - j0) > 5000) continue;
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const h = hash3(i, j, k + 17);
      if (h > 0.75) continue;
      const x = cx - (i + hash3(i, j, k + 101)) * cell * pxPerDeg, y = cy - (j + hash3(i, j, k + 211)) * cell * pxPerDeg;
      const b = hash3(i, j, k + 307);
      const r = 0.55 + b * b * 1.8;
      const c = starColor(hash3(i, j, k + 401) * 1.8 - 0.2);
      if (b > 0.93) glow(ctx, x, y, r * 6, c, 0.18 * a);
      ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${(0.35 + b * 0.65) * a})`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    }
  }
}

function drawPath(ctx, proj, W, H, fov, alpha) {
  ctx.save();
  ctx.lineWidth = 1.4; ctx.lineCap = 'round';
  let prev = null;
  for (const p of ui.path) {
    const q = proj(p.v);
    if (q && prev && Math.abs(q[0] - prev[0]) < W && Math.abs(q[1] - prev[1]) < H) {
      const past = p.jd < ui.jd0;
      const age = Math.abs(p.jd - ui.jd0) / (30 * 365.25);
      ctx.strokeStyle = past ? `rgba(200,70,60,${alpha * (0.75 - age * 0.55)})` : `rgba(242,180,90,${alpha * (0.6 - age * 0.45)})`;
      if (!past) ctx.setLineDash([4, 5]); else ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
    }
    prev = q;
  }
  ctx.setLineDash([]);
  // Year ticks every 5 years when the path is readable at this zoom.
  if (fov > 0.4) {
    ctx.font = '400 10.5px "IBM Plex Mono", monospace'; ctx.textAlign = 'center';
    for (const p of ui.path) {
      const yr = 1970 + (p.jd - 2440587.5) / 365.25;
      const frac = yr - Math.floor(yr);
      if (frac > 7 / 365.25 || Math.floor(yr) % 5 !== 0 || Math.abs(yr - (1970 + (ui.jd0 - 2440587.5) / 365.25)) < 2) continue;
      const q = proj(p.v); if (!q || q[0] < 0 || q[1] < 0 || q[0] > W || q[1] > H) continue;
      ctx.fillStyle = `rgba(236,230,214,${0.55 * alpha})`; ctx.beginPath(); ctx.arc(q[0], q[1], 1.8, 0, 7); ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(3,4,9,0.9)'; ctx.strokeText(String(Math.floor(yr)), q[0], q[1] - 8);
      ctx.fillText(String(Math.floor(yr)), q[0], q[1] - 8);
    }
    ctx.textAlign = 'left';
  }
  ctx.restore();
}

function drawSedna(ctx, cx, cy, rPx, t) {
  // Far away: a crimson point with a soft halo and a thin ring marker.
  const markerA = 1 - smooth(4, 14, rPx);
  if (markerA > 0.01) {
    glow(ctx, cx, cy, 26, [214, 70, 58], 0.45 * markerA);
    ctx.fillStyle = `rgba(236,110,92,${markerA})`; ctx.beginPath(); ctx.arc(cx, cy, 2.6, 0, 7); ctx.fill();
    ctx.strokeStyle = `rgba(242,180,90,${0.7 * markerA})`; ctx.lineWidth = 1.2; ctx.setLineDash([2, 3]);
    ctx.beginPath(); ctx.arc(cx, cy, 11, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    ctx.font = '500 12px "IBM Plex Sans", sans-serif'; ctx.fillStyle = `rgba(242,180,90,${0.9 * markerA})`;
    ctx.fillText('Sedna', cx + 16, cy + 4);
  }
  if (rPx > 3) {
    const a = smooth(3, 10, rPx);
    glow(ctx, cx, cy, rPx * 1.9, [190, 60, 48], 0.35 * a);
    const img = renderGlobe(ui.globe, Math.min(Math.round(rPx * 2 * Math.min(window.devicePixelRatio || 1, 2)), 560), t);
    ctx.globalAlpha = a; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, cx - rPx, cy - rPx, rPx * 2, rPx * 2); ctx.globalAlpha = 1;
  }
}

// ---------- the globe ----------
// Equirectangular albedo from fractal noise, tinted along a crimson ramp (Sedna is one of the
// reddest bodies known — tholins cooked by cosmic rays).
function makeGlobe() {
  const TW = 512, TH = 256, tex = new Float32Array(TW * TH * 3);
  const ramp = [[0, [52, 10, 16]], [0.3, [112, 22, 30]], [0.55, [158, 38, 42]], [0.78, [196, 70, 62]], [0.93, [224, 122, 104]], [1, [240, 176, 160]]];
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
    const lon = x / TW * 2 * Math.PI, lat = (0.5 - y / TH) * Math.PI;
    const px = Math.cos(lat) * Math.cos(lon), py = Math.cos(lat) * Math.sin(lon), pz = Math.sin(lat);
    // broad dark/bright regions + fine grain; brights stay rare so it reads as dusty tholin, not ice
    const broad = fbm(px * 1.6, py * 1.6, pz * 1.6, 5), fine = fbm(px * 8 + 5, py * 8, pz * 8, 4);
    const v = Math.max(0, Math.min(1, 0.5 + (broad - 0.5) * 1.5 + (fine - 0.5) * 0.4));
    const c = rampAt(ramp, v);
    tex.set(c, (y * TW + x) * 3);
  }
  const off = document.createElement('canvas');
  return { tex, TW, TH, off, octx: off.getContext('2d'), size: 0, img: null };
}

function renderGlobe(G, size, t) {
  if (G.size !== size) { G.off.width = G.off.height = size; G.size = size; G.img = G.octx.createImageData(size, size); }
  const d = G.img.data, R = size / 2;
  const spin = (t - ui.t0) / 1000 * 0.06;           // slow turn (the real day is ~10 h)
  const tilt = 0.35, ct = Math.cos(tilt), st = Math.sin(tilt);
  const L = norm([-0.55, 0.42, 0.72]);             // key light upper-left (artistic; real phase is ~full)
  for (let y = 0; y < size; y++) {
    const ny = (R - y - 0.5) / R;
    for (let x = 0; x < size; x++) {
      const nx = (x + 0.5 - R) / R, rr = nx * nx + ny * ny, o = (y * size + x) * 4;
      if (rr > 1) { d[o + 3] = 0; continue; }
      const nz = Math.sqrt(1 - rr);
      // body-fixed coordinates: undo tilt, then spin
      const by = ny * ct - nz * st, bz = ny * st + nz * ct;
      const lon = Math.atan2(nx, bz) + spin, lat = Math.asin(Math.max(-1, Math.min(1, by)));
      const tx = ((lon / (2 * Math.PI)) % 1 + 1) % 1 * G.TW | 0, ty = Math.min(G.TH - 1, (0.5 - lat / Math.PI) * G.TH | 0);
      const ti = (ty * G.TW + tx) * 3;
      const lam = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
      const diffuse = 0.06 + 0.94 * Math.pow(lam, 0.85);
      const limb = 0.72 + 0.28 * nz;
      const rim = Math.pow(1 - nz, 3) * 0.35 * (0.3 + lam);  // thin warm edge glow
      d[o] = Math.min(255, G.tex[ti] * diffuse * limb + 210 * rim);
      d[o + 1] = Math.min(255, G.tex[ti + 1] * diffuse * limb + 80 * rim);
      d[o + 2] = Math.min(255, G.tex[ti + 2] * diffuse * limb + 60 * rim);
      d[o + 3] = rr > 0.985 ? Math.round(255 * (1 - rr) / 0.015) : 255; // anti-aliased edge
    }
  }
  G.octx.putImageData(G.img, 0, 0);
  return G.off;
}

// ---------- helpers ----------
function root$(id) { return ui.root.querySelector('#' + id); }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function norm(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
function smooth(a, b, x) { const k = Math.max(0, Math.min(1, (x - a) / (b - a))); return k * k * (3 - 2 * k); }
function mixc(a, b, k) { return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',')})`; }
function glow(ctx, x, y, r, c, a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${a})`); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
}
function starColor(ci) {
  if (ci < -0.1) return [170, 191, 255]; if (ci < 0.15) return [202, 216, 255]; if (ci < 0.45) return [240, 242, 255];
  if (ci < 0.7) return [255, 244, 225]; if (ci < 1.1) return [255, 222, 180]; if (ci < 1.5) return [255, 200, 150]; return [255, 176, 130];
}
function rampAt(ramp, v) {
  for (let i = 1; i < ramp.length; i++) if (v <= ramp[i][0]) {
    const [a0, c0] = ramp[i - 1], [a1, c1] = ramp[i], k = (v - a0) / (a1 - a0);
    return [c0[0] + (c1[0] - c0[0]) * k, c0[1] + (c1[1] - c0[1]) * k, c0[2] + (c1[2] - c0[2]) * k];
  }
  return ramp[ramp.length - 1][1];
}
function hash3(i, j, k) {
  let h = (i * 374761393 + j * 668265263 + k * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const h = (a, b, c) => hash3(xi + a, yi + b, zi + c);
  const l = (a, b, k) => a + (b - a) * k;
  return l(l(l(h(0, 0, 0), h(1, 0, 0), u), l(h(0, 1, 0), h(1, 1, 0), u), v), l(l(h(0, 0, 1), h(1, 0, 1), u), l(h(0, 1, 1), h(1, 1, 1), u), v), w);
}
function fbm(x, y, z, oct) { let a = 0.5, f = 1, s = 0, n = 0; for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f, z * f); n += a; a *= 0.5; f *= 2.03; } return s / n; }

function fmtField(fov) {
  if (fov >= 1) return `${fov.toFixed(fov < 10 ? 1 : 0)}° field`;
  const am = fov * 60; if (am >= 1) return `${am.toFixed(am < 10 ? 1 : 0)}′ field`;
  const as = am * 60; if (as >= 0.1) return `${as.toFixed(as < 10 ? 2 : 0)}″ field`;
  return `${(as * 1000).toFixed(as * 1000 < 10 ? 2 : 0)} milliarcsec field`;
}
function likeText(fov) {
  const as = fov * 3600;
  if (fov > 5) return 'binoculars';
  if (fov > 0.8) return 'finder scope';
  if (as > 600) return 'backyard telescope';
  if (as > 60) return 'big observatory telescope';
  if (as > 3) return 'Hubble-class';
  if (as > 0.05) return 'past Hubble’s sharpest';
  return 'beyond any telescope ever built';
}
