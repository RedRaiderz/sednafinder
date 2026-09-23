// Canvas renderer. Draw order: sky wash, grid, constellations, stars, deep sky, TNOs,
// planets/Moon/Sun, satellites, horizon + ground, labels, target arrow.
import { project, projectArr, projScale, screenDirection } from './view.js';
import { enuFromAltAz } from './model.js';

const D2R = Math.PI / 180;
const FONT_UI = '"IBM Plex Sans", system-ui, sans-serif';
const FONT_SERIF = '"Newsreader", Georgia, serif';
const FONT_MONO = '"IBM Plex Mono", ui-monospace, monospace';

// B-V colour index -> star tint. Kept desaturated: real stars are subtle.
function starColor(ci) {
  if (ci < -0.1) return [170, 191, 255];
  if (ci < 0.15) return [202, 216, 255];
  if (ci < 0.45) return [240, 242, 255];
  if (ci < 0.7) return [255, 244, 225];
  if (ci < 1.1) return [255, 222, 180];
  if (ci < 1.5) return [255, 200, 150];
  return [255, 176, 130];
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let dpr = 1, W = 0, H = 0;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  }
  resize();
  return { ctx, resize, get W() { return W; }, get H() { return H; }, get dpr() { return dpr; } };
}

// Draw a frame. `hits` is filled with {obj, x, y, r} for tap/hover testing.
export function drawSky(R, model, view, opts, hits) {
  const { ctx, W, H, dpr } = R;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const s = projScale(view, H);
  const P = {};
  const sunAlt = model.solar[0].alt;
  const ar = opts.camera;
  hits.length = 0;

  // ---- sky wash (skipped over the camera feed) ----
  if (!ar) {
    const day = smooth(-18, 6, sunAlt);
    const top = mix([6, 8, 16], [38, 72, 122], day), bottom = mix([12, 16, 28], [120, 160, 200], day);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, rgb(top)); g.addColorStop(1, rgb(bottom));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  } else {
    ctx.clearRect(0, 0, W, H);
  }
  // Star visibility: daylight washes out faint stars; the chart keeps a hint of them.
  const skyLimit = opts.magLimit - Math.max(0, (sunAlt + 12) / 3);
  const magLimit = opts.telescope ? 9 : Math.max(ar ? 1.5 : -1, Math.min(opts.magLimit, skyLimit)) + zoomBonus(view.fov);

  if (opts.grid) drawGrid(ctx, view, W, H, s);
  if (opts.ecliptic) drawEcliptic(ctx, model, view, W, H, s);

  // ---- constellations ----
  if (opts.constellations) {
    ctx.lineWidth = 1; ctx.strokeStyle = ar ? 'rgba(200,215,255,0.45)' : 'rgba(150,172,214,0.30)';
    ctx.beginPath();
    const a = {}, b = {};
    for (const c of model.cons) for (const seg of c.lines) {
      for (let k = 0; k + 1 < seg.length; k++) {
        if (projectArr(view, model.starEnu, seg[k] * 3, W, H, s, a) && projectArr(view, model.starEnu, seg[k + 1] * 3, W, H, s, b)) {
          // Pull the segment ends back from the stars so lines don't stab through them.
          const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
          if (len < 12 || len > W * 1.5) continue;
          const gap = 5 / len;
          ctx.moveTo(a.x + dx * gap, a.y + dy * gap); ctx.lineTo(b.x - dx * gap, b.y - dy * gap);
        }
      }
    }
    ctx.stroke();
  }

  // ---- stars ----
  const E = model.starEnu, M = model.starMag, C = model.starCi;
  for (let i = 0; i < model.starCount; i++) {
    const m = M[i];
    if (m > magLimit) break; // sorted bright-first
    if (!projectArr(view, E, i * 3, W, H, s, P)) continue;
    if (P.x < -10 || P.y < -10 || P.x > W + 10 || P.y > H + 10) continue;
    const r = Math.max(0.55, 2.9 - 0.42 * m + (60 - Math.min(view.fov, 60)) * 0.012);
    const c0 = starColor(C[i]), sat = Math.max(0.25, Math.min(1, (4.5 - m) / 3));
    const col = [255 - (255 - c0[0]) * sat, 255 - (255 - c0[1]) * sat, 255 - (255 - c0[2]) * sat].map(Math.round);
    const alpha = Math.min(1, 0.35 + (magLimit - m) * 0.3);
    if (m < 1.6) { // soft glow on the bright ones
      const g = ctx.createRadialGradient(P.x, P.y, 0, P.x, P.y, r * 4);
      g.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},0.28)`); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(P.x, P.y, r * 4, 0, 7); ctx.fill();
    }
    ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${alpha})`;
    ctx.beginPath(); ctx.arc(P.x, P.y, r, 0, 7); ctx.fill();
  }
  // Telescope: the faint catalogue, only when zoomed in (sorted bright-first).
  if (opts.telescope && model.deep && model.deepOn) {
    const D = model.deep;
    for (let i = 0; i < D.n; i++) {
      const m = D.mag[i]; if (m > magLimit) break;
      if (!projectArr(view, D.enu, i * 3, W, H, s, P) || offscreen(P, W, H, 4)) continue;
      const r = Math.max(0.6, 2.9 - 0.42 * m + (60 - Math.min(view.fov, 60)) * 0.012);
      const c0 = starColor(D.ci[i]);
      ctx.fillStyle = `rgba(${c0[0]},${c0[1]},${c0[2]},${Math.min(1, 0.4 + (magLimit - m) * 0.3)})`;
      ctx.beginPath(); ctx.arc(P.x, P.y, r, 0, 7); ctx.fill();
    }
  }
  // Named stars are hit targets + get labels when bright enough for the zoom.
  const labels = [];
  for (const st of model.starInfo) {
    if (st.mag > magLimit) continue;
    if (!projectArr(view, E, st.idx * 3, W, H, s, P) || offscreen(P, W, H)) continue;
    if (st.proper === 'Polaris') { // the actual North Star: always marked, always labelled
      ctx.strokeStyle = 'rgba(242,180,90,0.9)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(P.x, P.y, 8, 0, 7);
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; ctx.moveTo(P.x + 10 * Math.cos(a), P.y + 10 * Math.sin(a)); ctx.lineTo(P.x + 14 * Math.cos(a), P.y + 14 * Math.sin(a)); }
      ctx.stroke();
      hits.push({ obj: st, x: P.x, y: P.y, r: 18, pri: 4 });
      if (opts.labels) labels.push({ x: P.x + 16, y: P.y + 4, text: 'Polaris · North Star', kind: 'polaris', u: E[st.idx * 3 + 2] });
      continue;
    }
    hits.push({ obj: st, x: P.x, y: P.y, r: 14, pri: 1 });
    if (opts.labels && st.proper && st.mag < labelMag(view.fov)) labels.push({ x: P.x + 7, y: P.y - 6, text: st.proper, kind: 'star', u: E[st.idx * 3 + 2] });
  }

  // ---- constellation names ----
  if (opts.constellations && opts.labels) {
    for (const c of model.cons) {
      if (!project(view, c.enu, W, H, s, P) || offscreen(P, W, H)) continue;
      labels.push({ x: P.x, y: P.y, text: c.name, kind: 'con', center: true, ar, fov: view.fov, u: c.enu[2] });
      hits.push({ obj: c, x: P.x, y: P.y - 4, r: 22, pri: 0 });
    }
  }

  // ---- deep sky ----
  if (opts.deepSky) {
    for (const d of model.dsos) {
      if (d.mag != null && d.mag > magLimit + 4.5) continue;
      if (!project(view, d.enu, W, H, s, P) || offscreen(P, W, H)) continue;
      drawDso(ctx, d, P.x, P.y, ar);
      hits.push({ obj: d, x: P.x, y: P.y, r: 14, pri: 2 });
      if (opts.labels && (view.fov < 70 || d.mag < 5)) labels.push({ x: P.x + 8, y: P.y + 3, text: d.code, kind: 'dso', u: d.enu[2] });
    }
  }

  // ---- far worlds (the SednaFinder originals) ----
  if (opts.tnos) {
    for (const t of model.tnos) {
      if (!project(view, t.enu, W, H, s, P) || offscreen(P, W, H)) continue;
      const hot = opts.target && opts.target.id === t.id;
      ctx.strokeStyle = hot ? '#f2b45a' : 'rgba(242,180,90,0.75)'; ctx.lineWidth = 1.2;
      ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.arc(P.x, P.y, 7, 0, 7); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#f2b45a'; ctx.fillRect(P.x - 1, P.y - 1, 2, 2);
      hits.push({ obj: t, x: P.x, y: P.y, r: 16, pri: 3 });
      if (opts.labels) labels.push({ x: P.x + 11, y: P.y + 4, text: t.name, kind: 'tno', u: t.enu[2] });
    }
  }

  // ---- Sun, Moon, planets ----
  const sun = model.solar[0];
  for (const b of model.solar) {
    if (!project(view, b.enu, W, H, s, P) || offscreen(P, W, H, 60)) continue;
    const pxR = Math.max(b.kind === 'planet' ? 2.6 + Math.max(0, -b.mag) * 0.9 : 7, (b.angDiamDeg / 2) * D2R * s);
    if (b.kind === 'sun') drawSun(ctx, P.x, P.y, pxR);
    else if (b.kind === 'moon') drawMoon(ctx, P.x, P.y, pxR, b, sun, view, W, H, s);
    else {
      const g = ctx.createRadialGradient(P.x, P.y, 0, P.x, P.y, pxR * 3.5);
      g.addColorStop(0, hexA(b.facts.color, 0.35)); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(P.x, P.y, pxR * 3.5, 0, 7); ctx.fill();
      ctx.fillStyle = b.facts.color; ctx.beginPath(); ctx.arc(P.x, P.y, pxR, 0, 7); ctx.fill();
      if (b.name === 'Saturn') { // a hint of rings
        ctx.strokeStyle = hexA(b.facts.color, 0.8); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(P.x, P.y, pxR * 2.1, pxR * 0.7, -0.35, 0, 7); ctx.stroke();
      }
    }
    hits.push({ obj: b, x: P.x, y: P.y, r: Math.max(18, pxR + 6), pri: 5 });
    if (opts.labels) labels.push({ x: P.x + pxR + 6, y: P.y + 4, text: b.name, kind: b.kind, u: b.enu[2] });
  }

  // ---- satellites ----
  if (opts.sats) {
    for (const sat of model.sats) {
      if (sat.alt == null || sat.alt < -1) continue;
      if (!sat.featured && !(sat.sunlit && sunAlt < -4)) continue;
      if (!project(view, sat.enu, W, H, s, P) || offscreen(P, W, H)) continue;
      const lit = sat.sunlit;
      ctx.strokeStyle = lit ? 'rgba(160,230,220,0.95)' : 'rgba(160,230,220,0.35)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(P.x - 5, P.y); ctx.lineTo(P.x + 5, P.y); ctx.moveTo(P.x, P.y - 5); ctx.lineTo(P.x, P.y + 5); ctx.stroke();
      hits.push({ obj: sat, x: P.x, y: P.y, r: 16, pri: 4 });
      if (opts.labels && (sat.featured || view.fov < 60)) labels.push({ x: P.x + 8, y: P.y - 6, text: sat.name, kind: 'sat', u: sat.enu[2] });
    }
  }

  // ---- ground ----
  drawHorizon(ctx, view, W, H, s, ar, sunAlt);

  // ---- labels on top ----
  drawLabels(ctx, labels, W, H);

  // ---- selected / target ----
  if (opts.target && opts.target.enu) {
    if (project(view, opts.target.enu, W, H, s, P) && !offscreen(P, W, H, -30)) {
      ctx.strokeStyle = '#f2b45a'; ctx.lineWidth = 1.5;
      const r = 17; ctx.beginPath();
      for (let k = 0; k < 4; k++) { const a0 = k * Math.PI / 2 + 0.3; ctx.arc(P.x, P.y, r, a0, a0 + 0.97); ctx.moveTo(P.x + r * Math.cos(a0 + Math.PI / 2 + 0.3), P.y + r * Math.sin(a0 + Math.PI / 2 + 0.3)); }
      ctx.stroke();
    } else drawEdgeArrow(ctx, view, opts.target, W, H);
  }
}

function zoomBonus(fov) { return fov < 60 ? Math.min(2.5, (60 - fov) / 18) : 0; }
function labelMag(fov) { return fov > 100 ? 1.2 : fov > 60 ? 2.0 : fov > 30 ? 3.0 : 4.2; }
function offscreen(P, W, H, pad = 0) { return P.x < -pad || P.y < -pad || P.x > W + pad || P.y > H + pad; }
function smooth(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
function mix(a, b, t) { return a.map((v, i) => v + (b[i] - v) * t); }
function rgb(c) { return `rgb(${c.map(Math.round).join(',')})`; }
function rgba(c, a) { return `rgba(${c.map(Math.round).join(',')},${a})`; }
function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }

function drawGrid(ctx, view, W, H, s) {
  ctx.strokeStyle = 'rgba(120,150,200,0.13)'; ctx.lineWidth = 1;
  const P = {};
  const path = (pts) => {
    let pen = false; ctx.beginPath();
    for (const v of pts) {
      if (project(view, v, W, H, s, P) && Math.abs(P.x) < W * 3 && Math.abs(P.y) < H * 3) { pen ? ctx.lineTo(P.x, P.y) : ctx.moveTo(P.x, P.y); pen = true; } else pen = false;
    }
    ctx.stroke();
  };
  for (let alt = 15; alt < 90; alt += 15) { const pts = []; for (let az = 0; az <= 360; az += 3) pts.push(enuFromAltAz(alt, az)); path(pts); }
  for (let az = 0; az < 360; az += 30) { const pts = []; for (let alt = 0; alt <= 88; alt += 3) pts.push(enuFromAltAz(alt, az)); path(pts); }
}

function drawEcliptic(ctx, model, view, W, H, s) {
  // Ecliptic in J2000: rotate by obliquity, then through the frame's EQJ->ENU matrix.
  const eps = 23.4393 * D2R, rot = model.rot, P = {};
  ctx.strokeStyle = 'rgba(242,180,90,0.22)'; ctx.setLineDash([4, 6]); ctx.lineWidth = 1;
  ctx.beginPath(); let pen = false;
  for (let l = 0; l <= 360; l += 2) {
    const L = l * D2R; const x = Math.cos(L), y = Math.sin(L) * Math.cos(eps), z = Math.sin(L) * Math.sin(eps);
    const hx = rot[0][0] * x + rot[1][0] * y + rot[2][0] * z, hy = rot[0][1] * x + rot[1][1] * y + rot[2][1] * z, hz = rot[0][2] * x + rot[1][2] * y + rot[2][2] * z;
    const v = [-hy, hx, hz];
    if (project(view, v, W, H, s, P) && Math.abs(P.x) < W * 3 && Math.abs(P.y) < H * 3) { pen ? ctx.lineTo(P.x, P.y) : ctx.moveTo(P.x, P.y); pen = true; } else pen = false;
  }
  ctx.stroke(); ctx.setLineDash([]);
}

function drawDso(ctx, d, x, y, ar) {
  ctx.strokeStyle = ar ? 'rgba(210,190,255,0.85)' : 'rgba(190,170,235,0.6)'; ctx.lineWidth = 1;
  ctx.beginPath();
  const t = d.type;
  if (/Galaxy/.test(t)) ctx.ellipse(x, y, 7, 3.5, -0.5, 0, 7);
  else if (/Globular/.test(t)) { ctx.arc(x, y, 5, 0, 7); ctx.moveTo(x - 5, y); ctx.lineTo(x + 5, y); ctx.moveTo(x, y - 5); ctx.lineTo(x, y + 5); }
  else if (/Open cluster|Star cloud/.test(t)) { ctx.setLineDash([1.5, 2.5]); ctx.arc(x, y, 6, 0, 7); }
  else if (/Planetary/.test(t)) { ctx.arc(x, y, 3.5, 0, 7); ctx.moveTo(x - 7, y); ctx.lineTo(x - 3.5, y); ctx.moveTo(x + 3.5, y); ctx.lineTo(x + 7, y); }
  else ctx.rect(x - 5, y - 5, 10, 10);
  ctx.stroke(); ctx.setLineDash([]);
}

function drawSun(ctx, x, y, r) {
  const g = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 5);
  g.addColorStop(0, 'rgba(255,220,160,0.55)'); g.addColorStop(1, 'rgba(255,200,120,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 5, 0, 7); ctx.fill();
  ctx.fillStyle = '#fff1d6'; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
}

// Moon with the lit limb facing the Sun's on-screen direction.
function drawMoon(ctx, x, y, r, moon, sun, view, W, H, s) {
  const d = screenDirection(view, sun.enu); const md = screenDirection(view, moon.enu);
  // Direction from moon to sun on screen, approximated from their projected positions.
  const Ps = {}; let ang;
  if (project(view, sun.enu, W, H, s, Ps)) ang = Math.atan2(Ps.y - y, Ps.x - x);
  else ang = Math.atan2(d.dy - md.dy, d.dx - md.dx);
  const k = moon.phaseFrac; // 0 new .. 1 full
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  const g = ctx.createRadialGradient(0, 0, r, 0, 0, r * 3.2);
  g.addColorStop(0, `rgba(235,230,215,${0.12 + 0.2 * k})`); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r * 3.2, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(40,42,50,0.9)'; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
  // Lit part: half-disc toward +x, plus/minus a terminator ellipse.
  ctx.fillStyle = '#ece6d4'; ctx.beginPath();
  ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
  const e = Math.abs(1 - 2 * k) * r;
  ctx.ellipse(0, 0, e, r, 0, Math.PI / 2, -Math.PI / 2, k < 0.5);
  ctx.fill();
  ctx.restore();
}

// Ground + horizon drawn analytically: the horizon is a great circle, which the gnomonic
// projection maps to a straight line and the stereographic projection maps to a circle.
function drawHorizon(ctx, view, W, H, s, ar, sunAlt) {
  const Ux = view.r[2], Uy = view.u[2], Uz = view.f[2]; // zenith in camera coords
  const cx = W / 2, cy = H / 2;
  ctx.save();
  // Translucent so everything below the horizon stays visible, just dimmed.
  ctx.fillStyle = ar ? 'rgba(10,12,14,0.3)' : rgba(mix([9, 11, 12], [34, 40, 38], smooth(-12, 6, sunAlt)), 0.55);
  ctx.strokeStyle = ar ? 'rgba(242,180,90,0.7)' : 'rgba(242,180,90,0.45)'; ctx.lineWidth = 1;
  const stereoCircle = view.proj === 'stereo' && Math.abs(Uz) > 1e-4 && 2 / Math.abs(Uz) * s < 1e5;
  if (stereoCircle) {
    const ccx = cx + (2 * Ux / Uz) * s, ccy = cy - (2 * Uy / Uz) * s, rad = (2 / Math.abs(Uz)) * s;
    ctx.beginPath();
    if (Uz > 0) { ctx.rect(0, 0, W, H); ctx.moveTo(ccx + rad, ccy); ctx.arc(ccx, ccy, rad, 0, Math.PI * 2, true); ctx.fill('evenodd'); }
    else { ctx.arc(ccx, ccy, rad, 0, Math.PI * 2); ctx.fill(); }
    ctx.beginPath(); ctx.arc(ccx, ccy, rad, 0, Math.PI * 2); ctx.stroke();
  } else {
    // Half-plane Ux*X + Uy*Y + Uz < 0 (stereo with Uz~0 degenerates to the same line through the centre).
    const k = view.proj === 'stereo' ? 0 : Uz;
    const f = (px, py) => Ux * (px - cx) / s + Uy * (cy - py) / s + k;
    const poly = [[0, 0], [W, 0], [W, H], [0, H]]; const out = []; const edge = [];
    for (let i = 0; i < 4; i++) {
      const a = poly[i], b = poly[(i + 1) % 4], fa = f(...a), fb = f(...b);
      if (fa < 0) out.push(a);
      if ((fa < 0) !== (fb < 0)) { const t = fa / (fa - fb); const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; out.push(p); edge.push(p); }
    }
    if (out.length > 2) { ctx.beginPath(); out.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p))); ctx.closePath(); ctx.fill(); }
    if (edge.length === 2) { ctx.beginPath(); ctx.moveTo(...edge[0]); ctx.lineTo(...edge[1]); ctx.stroke(); }
  }
  // Cardinal points
  const P = {};
  const CARD = [['N', 0], ['NE', 45], ['E', 90], ['SE', 135], ['S', 180], ['SW', 225], ['W', 270], ['NW', 315]];
  ctx.textAlign = 'center';
  for (const [t, az] of CARD) {
    if (!project(view, enuFromAltAz(0, az), W, H, s, P) || offscreen(P, W, H)) continue;
    const major = t.length === 1;
    ctx.font = `${major ? 500 : 400} ${major ? 15 : 11}px ${FONT_MONO}`;
    ctx.fillStyle = t === 'N' ? '#f2b45a' : `rgba(236,230,214,${major ? 0.9 : 0.55})`;
    ctx.fillText(t, P.x, P.y + (major ? 20 : 17));
    ctx.fillRect(P.x - 0.5, P.y - 4, 1, 8);
  }
  ctx.textAlign = 'left';
  ctx.restore();
}

function drawLabels(ctx, labels, W, H) {
  // Greedy de-overlap: first come, first placed; skip labels that collide.
  const placed = [];
  const order = { sun: 0, moon: 0, planet: 1, polaris: 1, tno: 2, sat: 3, star: 4, dso: 5, con: 6 };
  labels.sort((a, b) => order[a.kind] - order[b.kind]);
  for (const l of labels) {
    ctx.globalAlpha = l.u < -0.005 ? 0.5 : 1; // under the ground: still shown, dimmed
    const big = l.kind === 'planet' || l.kind === 'moon' || l.kind === 'sun' || l.kind === 'polaris';
    ctx.font = l.kind === 'con' ? `italic 400 ${l.fov > 100 ? 12 : 14}px ${FONT_SERIF}` : big ? `500 13px ${FONT_UI}` : l.kind === 'dso' ? `400 10px ${FONT_MONO}` : `400 11.5px ${FONT_UI}`;
    const w = ctx.measureText(l.text).width, h = 13;
    if (l.center) l.x -= w / 2;
    const box = { x0: l.x - 1, y0: l.y - h + 2, x1: l.x + w + 1, y1: l.y + 3 };
    if (box.x1 < 0 || box.x0 > W || box.y1 < 0 || box.y0 > H) continue;
    if (placed.some((p) => !(box.x1 < p.x0 || box.x0 > p.x1 || box.y1 < p.y0 || box.y0 > p.y1))) continue;
    placed.push(box);
    ctx.fillStyle = l.kind === 'con' ? (l.ar ? 'rgba(210,222,255,0.75)' : 'rgba(170,188,224,0.72)') : l.kind === 'tno' || l.kind === 'polaris' ? '#f2b45a' : l.kind === 'sat' ? 'rgba(160,230,220,0.95)'
      : l.kind === 'dso' ? 'rgba(200,185,240,0.75)' : big ? 'rgba(248,242,228,0.95)' : 'rgba(225,230,240,0.7)';
    // Dark halo so lines and stars never run through the letters (star-atlas style).
    ctx.lineJoin = 'round'; ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(6,8,15,0.92)';
    ctx.strokeText(l.text, l.x, l.y);
    ctx.fillText(l.text, l.x, l.y);
  }
  ctx.globalAlpha = 1;
}

function drawEdgeArrow(ctx, view, target, W, H) {
  const d = screenDirection(view, target.enu);
  const cx = W / 2, cy = H / 2;
  // Intersect the ray from centre with an inset screen rectangle.
  const mx = W / 2 - 34, my = H / 2 - 110;
  const t = Math.min(Math.abs(mx / (d.dx || 1e-6)), Math.abs(my / (d.dy || 1e-6)));
  const x = cx + d.dx * t, y = cy + d.dy * t, a = Math.atan2(d.dy, d.dx);
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  ctx.fillStyle = '#f2b45a'; ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-6, -8); ctx.lineTo(-2, 0); ctx.lineTo(-6, 8); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.font = `500 11px ${FONT_MONO}`; ctx.fillStyle = '#f2b45a';
  ctx.textAlign = d.dx > 0.3 ? 'right' : d.dx < -0.3 ? 'left' : 'center';
  const tx = x - d.dx * 22, ty = y - d.dy * 22 + 4;
  ctx.fillText(String(target.proper || target.name || target.code || target.designation || '').toUpperCase(), tx, ty);
  ctx.textAlign = 'left';
}
