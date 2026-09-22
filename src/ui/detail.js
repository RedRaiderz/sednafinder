// Detail sheet for any sky object.
import * as A from '../../vendor/astronomy.js';
import { fixedRiseSet, bodyRiseSet, constellationOf, altAzFromEnu } from '../sky/model.js';
import { satState, findPasses } from '../sky/sats.js';
import * as F from './format.js';

const CON_NAMES = {};
export function registerConstellations(cons) { for (const c of cons) CON_NAMES[c.abbr] = c.name; }
const conName = (abbr) => CON_NAMES[abbr] || abbr || '—';

function moonPhaseName(angle) {
  const a = ((angle % 360) + 360) % 360;
  if (a < 11.25 || a >= 348.75) return 'New Moon';
  if (a < 78.75) return 'Waxing crescent';
  if (a < 101.25) return 'First quarter';
  if (a < 168.75) return 'Waxing gibbous';
  if (a < 191.25) return 'Full Moon';
  if (a < 258.75) return 'Waning gibbous';
  if (a < 281.25) return 'Last quarter';
  return 'Waning crescent';
}
export { moonPhaseName };

function spectralNote(sp) {
  const c = (sp || '')[0];
  return { O: 'Blue, >30,000 K', B: 'Blue-white, 10–30,000 K', A: 'White, 7,500–10,000 K', F: 'Yellow-white, 6–7,500 K',
    G: 'Yellow, 5–6,000 K (like the Sun)', K: 'Orange, 3,900–5,200 K', M: 'Red, <3,900 K' }[c] || '';
}

function visLine(alt, riseSet, now) {
  if (alt > 10) return `<p class="vis"><span class="dot up"></span>Up now, ${F.deg(alt)} above the horizon</p>`;
  if (alt > 0) return `<p class="vis"><span class="dot low"></span>Just above the horizon (${F.deg(alt, 1)}) — needs a clear, low view</p>`;
  if (riseSet && riseSet.always === 'down') return '<p class="vis"><span class="dot"></span>Never rises from here</p>';
  if (riseSet && riseSet.rise) return `<p class="vis"><span class="dot"></span>Below the horizon · rises ${F.dayTime(riseSet.rise, now)} (${F.rel(riseSet.rise, now)})</p>`;
  return '<p class="vis"><span class="dot"></span>Below the horizon right now</p>';
}

function riseSetRows(rs, now) {
  if (!rs) return '';
  if (rs.always === 'up') return F.row('Rise / set', 'Circumpolar — never sets') + F.row('Highest', F.dayTime(rs.transit, now));
  if (rs.always === 'down') return F.row('Rise / set', 'Never rises here');
  return F.row('Rises', F.dayTime(rs.rise, now)) + F.row('Highest', F.dayTime(rs.transit, now) + (rs.transitAlt != null ? ` · ${F.deg(rs.transitAlt)}` : '')) + F.row('Sets', F.dayTime(rs.set, now));
}

function positionRows(ra, dec, alt, az) {
  return F.row('Altitude', F.deg(alt, 1)) + F.row('Azimuth', `${F.deg(az, 1)} ${F.compass(az)}`) +
    F.row('Right ascension', F.ra(ra)) + F.row('Declination', F.dec(dec));
}

function header(kicker, title, subtitle) {
  return `<p class="kicker">${F.esc(kicker)}</p><h2 class="title">${F.esc(title)}</h2>` + (subtitle ? `<p class="subtitle">${F.esc(subtitle)}</p>` : '');
}
function stats(a) { return `<div class="stats">${a.map(([v, k]) => `<div><b>${v}</b><span>${F.esc(k)}</span></div>`).join('')}</div>`; }
const actions = `<div class="actions"><button class="solid" data-act="point">Point me there</button><button class="ghost" data-act="center">Show on chart</button></div>`;

export function renderDetail(obj, ctx) {
  const { model, loc, date } = ctx;
  const now = date;
  switch (obj.kind) {
    case 'sun': case 'moon': case 'planet': return solarDetail(obj, model, loc, now);
    case 'tno': return tnoDetail(obj, loc, now);
    case 'star': return starDetail(obj, model, loc, now);
    case 'dso': return dsoDetail(obj, loc, now);
    case 'con': return conDetail(obj, model, loc, now);
    case 'sat': return satDetail(obj, loc, now);
    default: return '';
  }
}

function solarDetail(b, model, loc, now) {
  const rs = bodyRiseSet(b.name, now, loc);
  const con = constellationOf(b.ra, b.dec).name;
  let html = header(b.kind === 'planet' ? `Planet · in ${con}` : b.kind === 'moon' ? `Moon · in ${con}` : `Star · in ${con}`, b.name,
    b.kind === 'moon' ? `${moonPhaseName(A.MoonPhase(now))}, ${(b.phaseFrac * 100).toFixed(0)}% lit` : null);
  html += stats([
    [b.mag.toFixed(1), 'Magnitude'], [F.deg(b.alt), 'Altitude'],
    [b.kind === 'moon' ? `${F.num(b.distAU * 149597870.7 / 1000)}k` : b.distAU.toFixed(2), b.kind === 'moon' ? 'km away' : 'AU away'],
  ]);
  html += visLine(b.alt, rs, now) + actions;
  if (b.kind === 'sun') html += `<p class="blurb warn">${F.esc(b.facts.blurb)}</p>`;
  html += `<p class="section">Today</p>` + riseSetRows(rs, now);
  if (b.kind === 'sun') {
    const obs = model.observer;
    const civ = A.SearchAltitude(A.Body.Sun, obs, -1, now, 1, -6), ast = A.SearchAltitude(A.Body.Sun, obs, -1, now, 1, -18);
    html += F.row('Civil dusk', F.dayTime(civ && civ.date, now)) + F.row('Astronomical dark', F.dayTime(ast && ast.date, now));
    if (rs.rise && rs.set) {
      const len = rs.set > rs.rise ? rs.set - rs.rise : rs.set - rs.rise + 86400000;
      if (len > 0 && len < 86400000) html += F.row('Daylight', `${Math.floor(len / 3600000)}h ${Math.round(len / 60000) % 60}m`);
    }
  }
  if (b.kind === 'moon') {
    const q = A.SearchMoonQuarter(now); const names = ['New Moon', 'First quarter', 'Full Moon', 'Last quarter'];
    let mq = q; const list = [];
    for (let i = 0; i < 4; i++) { list.push(F.row(names[mq.quarter], `${F.date(mq.time.date)} · ${F.time(mq.time.date)}`)); mq = A.NextMoonQuarter(mq); }
    html += `<p class="section">Coming phases</p>` + list.join('');
    const age = ((A.MoonPhase(now) / 360) * 29.530588).toFixed(1);
    html += `<p class="section">Now</p>` + F.row('Age', `${age} days`) + F.row('Distance', `${F.num(b.distAU * 149597870.7)} km`) +
      F.row('Apparent size', F.angSize(b.angDiamDeg)) + F.row('Light-time', F.lightTime(b.distAU));
  } else {
    html += `<p class="section">Now</p>` + F.row('Distance', `${F.dist(b.distAU)}`) + F.row('Light-time', F.lightTime(b.distAU));
    if (b.kind === 'planet') {
      html += F.row('From the Sun', `${b.helioAU.toFixed(2)} AU`) + F.row('Apparent size', F.angSize(b.angDiamDeg)) +
        F.row('Lit fraction', `${(b.phaseFrac * 100).toFixed(0)}%`) + F.row('Angle from Sun', F.deg(b.elongation, 1));
    } else html += F.row('Apparent size', F.angSize(b.angDiamDeg));
  }
  html += `<p class="section">Position</p>` + positionRows(b.raDate, b.decDate, b.alt, b.az);
  html += `<p class="section">Physical</p>` + b.facts.rows.map(([k, v]) => F.row(k, F.esc(v))).join('');
  if (b.kind !== 'sun') html += `<p class="blurb">${F.esc(b.facts.blurb)}</p>`;
  return html;
}

function tnoDetail(t, loc, now) {
  const f = t.el.facts; const rs = fixedRiseSet(t.ra, t.dec, now, loc);
  const con = constellationOf(t.ra, t.dec).name;
  let html = header(`Far frontier · in ${con}`, t.name, t.el.designation);
  html += stats([[t.mag.toFixed(1), 'Magnitude'], [F.deg(t.alt), 'Altitude'], [t.distAU.toFixed(1), 'AU away']]);
  html += visLine(t.alt, rs, now) + actions;
  html += `<p class="blurb">${F.esc(f.blurb)}</p>`;
  html += `<p class="note">Magnitude ${t.mag.toFixed(1)} — ${F.visibilityClass(t.mag).toLowerCase()}. The marker is where it is; the light that reaches you left ${F.lightTime(t.distAU).replace('light-', '')} ago.</p>`;
  html += `<p class="section">Tonight</p>` + riseSetRows(rs, now);
  html += `<p class="section">Now</p>` + F.row('From Earth', `${t.distAU.toFixed(2)} AU`) + F.row('In km', `${(t.distAU * 149597870.7).toExponential(2).replace('e+', ' × 10^')}`) +
    F.row('From the Sun', `${t.helioAU.toFixed(2)} AU`) + F.row('Light-time', F.lightTime(t.distAU));
  html += `<p class="section">Position</p>` + positionRows(t.ra, t.dec, t.alt, t.az);
  html += `<p class="section">Orbit & body</p>` + F.row('Diameter', `~${F.num(f.diameterKm)} km`) + F.row('Orbital period', `${F.num(f.periodYears)} years`) +
    F.row('Perihelion / aphelion', `${f.perihelionAU} / ${f.aphelionAU} AU`) + F.row('Next perihelion', f.nextPerihelion) +
    F.row('Surface', `~${f.surfaceTempK} K (${Math.round(f.surfaceTempK - 273.15)} °C)`) + F.row('Discovered', F.esc(f.discovery));
  return html;
}

function starDetail(s, model, loc, now) {
  const { alt, az } = altAzFromEnu(s.enu);
  const rs = fixedRiseSet(s.ra, s.dec, now, loc);
  let html = header(`Star · ${conName(s.con)}`, s.proper || s.designation, s.proper ? s.designation : null);
  html += stats([[s.mag.toFixed(2), 'Magnitude'], [F.deg(alt), 'Altitude'], [s.distLy ? (s.distLy < 1000 ? s.distLy.toFixed(s.distLy < 100 ? 1 : 0) : F.num(s.distLy)) : '—', 'Light-years']]);
  html += visLine(alt, rs, now) + actions;
  if (s.distLy) {
    const year = now.getFullYear() - Math.round(s.distLy);
    html += `<p class="blurb">The light you'd see tonight left it ${s.distLy < 2 ? 'a little over a year' : `around ${year > 0 ? year : `${-year} BCE`}`} ago.</p>`;
  }
  html += `<p class="section">Tonight</p>` + riseSetRows(rs, now);
  html += `<p class="section">Star</p>` + F.row('Spectral type', F.esc(s.spect || '—')) + F.row('Colour', spectralNote(s.spect) || '—') +
    F.row('Distance', F.ly(s.distLy)) + (s.hip ? F.row('Catalogue', `HIP ${s.hip}`) : '');
  html += `<p class="section">Position</p>` + positionRows(s.ra, s.dec, alt, az);
  return html;
}

function dsoDetail(d, loc, now) {
  const rs = fixedRiseSet(d.ra, d.dec, now, loc);
  const { alt, az } = altAzFromEnu(d.enu);
  let html = header(`${d.type} · ${conName(d.con)}`, d.name ? `${d.code} · ${d.name}` : d.code, d.ngc || null);
  html += stats([[d.mag != null ? d.mag.toFixed(1) : '—', 'Magnitude'], [F.deg(alt), 'Altitude'], [d.size ? F.angSize(d.size / 60) : '—', 'Size']]);
  html += visLine(alt, rs, now) + actions;
  html += `<p class="note">${F.visibilityClass(d.mag)}${d.mag != null && d.size > 10 && d.mag > 6 ? ' — spread out, so it looks fainter than its magnitude' : ''}. Best when it is high and the Moon is down.</p>`;
  html += `<p class="section">Tonight</p>` + riseSetRows(rs, now);
  html += `<p class="section">Position</p>` + positionRows(d.ra, d.dec, alt, az);
  return html;
}

function conDetail(c, model, loc, now) {
  const rs = fixedRiseSet(c.ra, c.dec, now, loc);
  const { alt, az } = altAzFromEnu(c.enu);
  const members = new Set(c.lines.flat());
  const named = model.starInfo.filter((s) => members.has(s.idx) && s.proper).sort((a, b) => a.mag - b.mag).slice(0, 6);
  const dsos = model.dsos.filter((d) => d.con === c.abbr);
  let html = header('Constellation', c.name, `“${c.meaning}”`);
  html += stats([[members.size, 'Line stars'], [F.deg(alt), 'Altitude'], [dsos.length, 'Deep sky']]);
  html += visLine(alt, rs, now) + actions;
  html += `<p class="section">Tonight</p>` + riseSetRows(rs, now);
  if (named.length) html += `<p class="section">Brightest named stars</p>` + named.map((s) => F.row(s.proper, `mag ${s.mag.toFixed(1)}`)).join('');
  if (dsos.length) html += `<p class="section">Deep sky inside</p>` + dsos.map((d) => F.row(`${d.code}${d.name ? ' · ' + d.name : ''}`, F.esc(d.type))).join('');
  return html;
}

function satDetail(sat, loc, now) {
  const st = satState(sat, now, loc);
  if (!st) return header('Satellite', sat.name) + '<p class="note">Orbit data could not be propagated — the TLE may be stale.</p>';
  let html = header(`Satellite · NORAD ${sat.norad}`, sat.name, sat.fullName !== sat.name ? sat.fullName : null);
  html += stats([[F.num(st.heightKm), 'km high'], [F.deg(st.alt), 'Altitude'], [st.speedKms.toFixed(2), 'km/s']]);
  html += `<p class="vis"><span class="dot ${st.alt > 10 ? 'up' : st.alt > 0 ? 'low' : ''}"></span>${st.alt > 0 ? `Above the horizon, ${F.compass(st.az)} · ${sat.sunlit ? 'in sunlight' : 'in Earth’s shadow'}` : 'Below the horizon right now'}</p>`;
  html += actions;
  const passes = findPasses(sat, now, loc, 3).slice(0, 8);
  html += `<p class="section">Passes · next 3 days</p>`;
  if (!passes.length) html += '<p class="note">No passes above 10° in the next three days.</p>';
  else html += `<div class="timeline">${passes.map((p) => `<div class="t">${F.dayTime(p.rise, now)}</div><div class="x">${F.compass(p.riseAz)} → ${F.compass(p.setAz)}${p.visible ? ' · <b style="color:var(--amber);font-weight:500">visible</b>' : ''}</div><div class="alt">${F.deg(p.max.alt)}</div>`).join('')}</div>`;
  html += `<p class="note">“Visible” means it's dark where you are and the satellite is still in sunlight, so it shows as a moving star.</p>`;
  html += `<p class="section">Now</p>` + F.row('Range', `${F.num(st.rangeKm)} km`) + F.row('Over', `${st.subLat.toFixed(1)}°, ${st.subLon.toFixed(1)}°`) +
    F.row('Azimuth', `${F.deg(st.az, 1)} ${F.compass(st.az)}`) + F.row('Orbit data from', F.dateLong(sat.tleEpoch));
  return html;
}
