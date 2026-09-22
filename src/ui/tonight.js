// "Tonight" sheet: the night's timeline, what's up, and what's coming.
import * as A from '../../vendor/astronomy.js';
import { PLANETS, makeObserver } from '../sky/model.js';
import { findPasses } from '../sky/sats.js';
import { METEOR_SHOWERS } from '../data/facts.js';
import { moonPhaseName } from './detail.js';
import * as F from './format.js';

const MIN = 60000, HOUR = 3600000, DAY = 86400000;

function altOf(body, d, obs) {
  const e = A.Equator(body, d, obs, true, true);
  return A.Horizon(d, obs, e.ra, e.dec, 'normal');
}

export function nightWindow(date, loc) {
  const obs = makeObserver(loc);
  const sunNow = altOf(A.Body.Sun, date, obs).altitude;
  const from = sunNow > -0.8 ? date : new Date(+date - 20 * HOUR);
  const sunset = A.SearchRiseSet(A.Body.Sun, obs, -1, from, 1.5);
  const base = sunset ? sunset.date : date;
  const sunrise = A.SearchRiseSet(A.Body.Sun, obs, +1, base, 1.5);
  const alt = (dir, a, start) => { const r = A.SearchAltitude(A.Body.Sun, obs, dir, start, 1, a); return r ? r.date : null; };
  const civil = alt(-1, -6, base), naut = alt(-1, -12, base), astro = alt(-1, -18, base);
  const astroDawn = astro ? alt(+1, -18, astro) : null;
  const civilDawn = alt(+1, -6, base);
  return { obs, sunset: sunset && sunset.date, sunrise: sunrise && sunrise.date, civil, naut, astro, astroDawn, civilDawn,
    darkStart: astro || naut || civil || base, darkEnd: astroDawn || civilDawn || (sunrise && sunrise.date) || new Date(+base + 10 * HOUR) };
}

// Sample a body across the night; returns best time + the span it's usefully up in the dark.
function sampleBody(body, w, obs, minAlt = 8, altFn = altOf) {
  const start = w.civil || w.sunset, end = w.civilDawn || w.sunrise;
  if (!start || !end) return null;
  let best = null, first = null, last = null;
  for (let t = +start; t <= +end; t += 10 * MIN) {
    const d = new Date(t); const h = altFn(body, d, obs);
    if (h.altitude > minAlt) { if (!first) first = d; last = d; if (!best || h.altitude > best.alt) best = { at: d, alt: h.altitude, az: h.azimuth }; }
  }
  return best ? { best, first, last } : null;
}

function moonlessDark(w, obs) {
  let mins = 0;
  for (let t = +w.darkStart; t < +w.darkEnd; t += 10 * MIN) if (altOf(A.Body.Moon, new Date(t), obs).altitude < 0) mins += 10;
  return mins;
}

export function drawMoonIcon(canvas, phaseAngle) {
  const dpr = window.devicePixelRatio || 1; const S = 64;
  canvas.width = S * dpr; canvas.height = S * dpr; const c = canvas.getContext('2d'); c.scale(dpr, dpr);
  const r = 26, x = 32, y = 32;
  const k = (1 - Math.cos(phaseAngle * Math.PI / 180)) / 2; const waxing = phaseAngle < 180;
  c.fillStyle = 'rgba(236,230,214,0.12)'; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
  c.save(); c.translate(x, y); if (!waxing) c.rotate(Math.PI);
  c.fillStyle = '#ece6d4'; c.beginPath(); c.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
  c.ellipse(0, 0, Math.abs(1 - 2 * k) * r, r, 0, Math.PI / 2, -Math.PI / 2, k < 0.5); c.fill(); c.restore();
}

export function renderTonight(ctx) {
  const { model, loc, date } = ctx;
  const w = nightWindow(date, loc); const obs = w.obs;
  const phase = A.MoonPhase(date); const ill = A.Illumination(A.Body.Moon, date);
  const t0 = w.sunset || date;
  const moonUpAtSunset = altOf(A.Body.Moon, t0, obs).altitude > 0;
  const mRise = A.SearchRiseSet(A.Body.Moon, obs, +1, t0, 1.2);
  const mSet = A.SearchRiseSet(A.Body.Moon, obs, -1, t0, 1.2);
  const dark = moonlessDark(w, obs);
  const ref = w.sunset || date;

  let html = `<p class="kicker">${F.esc(F.date(ref))}</p><h2 class="title">Tonight</h2>`;
  html += `<p class="subtitle">${dark >= 60 ? `${Math.floor(dark / 60)}h ${dark % 60}m of true dark with the Moon down` : dark > 0 ? `Only ${dark} minutes of moonless dark` : 'The Moon is up through the dark hours'}</p>`;

  html += `<div class="moonrow"><canvas id="moonIcon"></canvas><p><b>${moonPhaseName(phase)}</b>${(ill.phase_fraction * 100).toFixed(0)}% lit · ${moonUpAtSunset ? `up at sunset, sets ${F.dayTime(mSet && mSet.date, ref)}` : `rises ${F.dayTime(mRise && mRise.date, ref)}`}</p></div>`;

  html += `<p class="section">The night</p><div class="timeline">`;
  const tl = [[w.sunset, 'Sunset'], [w.civil, 'Civil dusk'], [w.naut, 'Nautical dusk'], [w.astro, 'Fully dark'], [w.astroDawn, 'Dark ends'], [w.civilDawn, 'Civil dawn'], [w.sunrise, 'Sunrise']];
  if (mRise && mRise.date < (w.sunrise || 0) && mRise.date > (w.sunset || 0)) tl.push([mRise.date, 'Moonrise']);
  if (mSet && mSet.date < (w.sunrise || 0) && mSet.date > (w.sunset || 0)) tl.push([mSet.date, 'Moonset']);
  html += tl.filter(([d]) => d).sort((a, b) => a[0] - b[0]).map(([d, n]) => `<div class="t">${F.dayTime(d, ref)}</div><div class="x">${n}</div><div class="alt"></div>`).join('');
  if (!w.astro) html += `<div class="t">—</div><div class="x">Never fully dark tonight</div><div class="alt"></div>`;
  html += `</div>`;

  // Planets
  const rows = [];
  for (const name of PLANETS) {
    const b = A.Body[name]; const s = sampleBody(b, w, obs);
    const mag = A.Illumination(b, date).mag;
    rows.push({ name, s, mag });
  }
  rows.sort((a, b) => (!!b.s - !!a.s) || a.mag - b.mag);
  html += `<p class="section">Planets</p>`;
  html += rows.map(({ name, s, mag }) => {
    const id = `sol:${name}`;
    if (!s) return `<button class="item" data-open="${id}"><span class="n">${name}</span><span class="d">Not up in the dark tonight — too close to the Sun or below the horizon</span><span class="m"><b>${mag.toFixed(1)}</b>mag</span></button>`;
    return `<button class="item" data-open="${id}"><span class="n">${name}</span><span class="d">${F.dayTime(s.first, ref)} → ${F.dayTime(s.last, ref)} · best ${F.time(s.best.at)}, ${F.deg(s.best.alt)} ${F.compass(s.best.az)}</span><span class="m up"><b>${mag.toFixed(1)}</b>mag</span></button>`;
  }).join('');

  // ISS
  const iss = model.sats.find((x) => x.norad === 25544);
  if (iss) {
    const passes = findPasses(iss, date, loc, 4).filter((p) => p.visible).slice(0, 4);
    html += `<p class="section">ISS · visible passes</p>`;
    html += passes.length ? `<div class="timeline">${passes.map((p) => `<div class="t">${F.dayTime(p.rise, date)}</div><div class="x">${F.compass(p.riseAz)} → ${F.compass(p.setAz)}, ${Math.round((p.set - p.rise) / MIN)} min</div><div class="alt">${F.deg(p.max.alt)}</div>`).join('')}</div>`
      : '<p class="note">No visible ISS passes in the next four days from here. It needs you in darkness while it is still sunlit — those windows come in runs of a week or two.</p>';
  }

  // Deep sky picks: bright, well placed a couple of hours into the dark.
  const mid = new Date(+w.darkStart + 1.5 * HOUR);
  const picks = model.dsos.filter((d) => d.mag != null && d.mag < 7.6).map((d) => {
    const h = A.Horizon(mid, obs, d.ra / 15, d.dec, null); return { d, alt: h.altitude, az: h.azimuth };
  }).filter((p) => p.alt > 35).sort((a, b) => a.d.mag - b.d.mag).slice(0, 6);
  if (picks.length) {
    html += `<p class="section">Deep sky, well placed at ${F.time(mid)}</p>`;
    html += picks.map(({ d, alt, az }) => `<button class="item" data-open="${d.id}"><span class="n">${d.code}${d.name ? ` · ${F.esc(d.name)}` : ''}</span><span class="d">${F.esc(d.type)} · ${F.visibilityClass(d.mag)}</span><span class="m"><b>${d.mag.toFixed(1)}</b>${F.deg(alt)} ${F.compass(az)}</span></button>`).join('');
  }

  // The far frontier — the originals.
  html += `<p class="section">Far frontier</p>`;
  html += model.tnos.map((t) => {
    const sm = sampleBody(t, w, obs, 8, (o, d, ob) => A.Horizon(d, ob, o.ra / 15, o.dec, null));
    const note = sm ? `best ${F.dayTime(sm.best.at, ref)} at ${F.deg(sm.best.alt)} ${F.compass(sm.best.az)} · in ${A.Constellation(t.ra / 15, t.dec).name}` : 'not up in the dark tonight';
    return `<button class="item" data-open="${t.id}"><span class="n">${t.name}</span><span class="d">${note}</span><span class="m"><b>${t.mag.toFixed(1)}</b>${t.distAU.toFixed(1)} AU</span></button>`;
  }).join('');

  html += `<p class="section">Coming up</p><div class="timeline">${upcoming(date, obs).map((e) => `<div class="t">${F.esc(e.d.toLocaleDateString([], { month: 'short', day: 'numeric' }))}</div><div class="x">${F.esc(e.text)}</div><div class="alt">${F.esc(e.rel)}</div>`).join('')}</div>`;
  return { html, after: (root) => { const c = root.querySelector('#moonIcon'); if (c) drawMoonIcon(c, phase); } };
}

// Next notable events in the coming year, soonest first.
export function upcoming(date, obs) {
  const ev = []; const horizon = +date + 365 * DAY;
  const add = (d, text) => { if (d && d >= date && +d < horizon) ev.push({ d, text }); };
  // Full & new moons (next 2 each)
  let mq = A.SearchMoonQuarter(date);
  for (let i = 0; i < 8; i++) { if (mq.quarter === 0) add(mq.time.date, 'New Moon — darkest skies'); if (mq.quarter === 2) add(mq.time.date, 'Full Moon'); mq = A.NextMoonQuarter(mq); }
  try { const le = A.SearchLunarEclipse(date); add(le.peak.date, `${cap(le.kind)} lunar eclipse`); } catch { /* none */ }
  try {
    const se = A.SearchLocalSolarEclipse(date, obs);
    add(se.peak.time.date, `${cap(se.kind)} solar eclipse visible here (${(se.obscuration * 100).toFixed(0)}% covered)`);
  } catch { /* none */ }
  for (const name of ['Mercury', 'Venus']) {
    try { const e = A.SearchMaxElongation(A.Body[name], date); add(e.time.date, `${name} at greatest ${e.visibility} elongation (${e.elongation.toFixed(0)}°)`); } catch { /* */ }
  }
  for (const name of ['Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune']) {
    try { const t = A.SearchRelativeLongitude(A.Body[name], 0, date); add(t.date, `${name} at opposition — biggest and brightest`); } catch { /* */ }
  }
  const y = date.getFullYear();
  for (const [name, m, d, zhr, where] of METEOR_SHOWERS) {
    for (const yy of [y, y + 1]) add(new Date(yy, m - 1, d, 2), `${name} meteor shower peaks (~${zhr}/hr, from ${where})`);
  }
  try {
    const s = A.Seasons(y), s2 = A.Seasons(y + 1);
    for (const x of [s, s2]) { add(x.mar_equinox.date, 'March equinox'); add(x.jun_solstice.date, 'June solstice'); add(x.sep_equinox.date, 'September equinox'); add(x.dec_solstice.date, 'December solstice'); }
  } catch { /* */ }
  return ev.sort((a, b) => a.d - b.d).slice(0, 12).map((e) => ({ ...e, rel: F.rel(e.d, date).replace('in ', '') }));
}
const cap = (s) => s[0].toUpperCase() + s.slice(1);
