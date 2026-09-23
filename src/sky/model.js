// The sky model: every object we know about, and where it is right now for an observer.
// World frame for everything downstream is ENU: [east, north, up] unit vectors.
import * as A from '../../vendor/astronomy.js';
import { BODIES as TNOS, EARTH } from '../data/bodies.js';
import { SOLAR_FACTS } from '../data/facts.js';
import { equatorialFromBody } from '../astronomy/coords.js';
import { heliocentricEcliptic } from '../astronomy/orbit.js';
import { apparentMagnitude } from '../astronomy/photometry.js';

const D2R = Math.PI / 180, R2D = 180 / Math.PI;
export const PLANETS = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'];

// J2000 equatorial unit vector from RA/Dec in degrees.
export function eqjVector(raDeg, decDeg) {
  const ra = raDeg * D2R, dec = decDeg * D2R;
  return [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
}

// Bennett refraction (deg) for an apparent-ish altitude in degrees.
export function refractionDeg(alt) {
  if (alt < -1.5) return 0;
  const h = Math.max(alt, -1);
  return (1.02 / Math.tan((h + 10.3 / (h + 5.11)) * D2R)) / 60;
}

export function altAzFromEnu(v) {
  return { alt: Math.asin(Math.max(-1, Math.min(1, v[2]))) * R2D,
    az: (Math.atan2(v[0], v[1]) * R2D + 360) % 360 };
}
export function enuFromAltAz(alt, az) {
  const a = alt * D2R, z = az * D2R;
  return [Math.cos(a) * Math.sin(z), Math.cos(a) * Math.cos(z), Math.sin(a)];
}

// Apply a 3x3 rotation (astronomy-engine RotationMatrix.rot, EQJ->HOR) and convert HOR->ENU.
// HOR from the library is x=north, y=west, z=zenith.
function rotToEnu(rot, x, y, z, out, o) {
  const hx = rot[0][0] * x + rot[1][0] * y + rot[2][0] * z;
  const hy = rot[0][1] * x + rot[1][1] * y + rot[2][1] * z;
  const hz = rot[0][2] * x + rot[1][2] * y + rot[2][2] * z;
  out[o] = -hy; out[o + 1] = hx; out[o + 2] = hz;
}

// Lift near-horizon vectors by refraction in place.
function refractInPlace(out, o) {
  const u = out[o + 2];
  if (u > 0.35 || u < -0.03) return;
  const alt = Math.asin(u) * R2D;
  const na = alt + refractionDeg(alt);
  const c0 = Math.cos(alt * D2R), c1 = Math.cos(na * D2R);
  const k = c0 > 1e-6 ? c1 / c0 : 1;
  out[o] *= k; out[o + 1] *= k; out[o + 2] = Math.sin(na * D2R);
}

export function createModel({ stars, constellations, dso }) {
  const n = stars.length;
  const starEqj = new Float32Array(n * 3);
  const starEnu = new Float32Array(n * 3);
  const starMag = new Float32Array(n), starCi = new Float32Array(n);
  const starInfo = [];
  for (let i = 0; i < n; i++) {
    const s = stars[i];
    const v = eqjVector(s[0], s[1]);
    starEqj.set(v, i * 3); starMag[i] = s[2]; starCi[i] = s[3];
    if (s.length > 4) {
      starInfo.push({ idx: i, id: `star:${i}`, kind: 'star', ra: s[0], dec: s[1], mag: s[2], ci: s[3],
        name: s[4] || s[5], proper: s[4], designation: s[5], con: s[6], distLy: s[7], spect: s[8], hip: s[9],
        enu: starEnu.subarray(i * 3, i * 3 + 3) }); // live view into the per-frame buffer
    }
  }

  const cons = constellations.map((c) => {
    // Label anchor = normalized mean of the member stars.
    const idx = new Set(c.lines.flat());
    let x = 0, y = 0, z = 0;
    for (const i of idx) { x += starEqj[i * 3]; y += starEqj[i * 3 + 1]; z += starEqj[i * 3 + 2]; }
    const r = Math.hypot(x, y, z) || 1;
    const eqj = [x / r, y / r, z / r];
    const ra = (Math.atan2(eqj[1], eqj[0]) * R2D + 360) % 360, dec = Math.asin(eqj[2]) * R2D;
    let brightest = null;
    for (const i of idx) if (!brightest || starMag[i] < starMag[brightest]) brightest = i;
    return { id: `con:${c.abbr}`, kind: 'con', abbr: c.abbr, name: c.name, meaning: c.meaning, lines: c.lines,
      eqj, ra, dec, brightest, enu: [0, 0, 0] };
  });

  const dsos = dso.map((d) => ({ ...d, id: `dso:${d.id}`, code: d.id, kind: 'dso',
    eqj: eqjVector(d.ra, d.dec), enu: [0, 0, 0] }));

  const solar = ['Sun', 'Moon', ...PLANETS].map((name) => ({
    id: `sol:${name}`, kind: name === 'Sun' ? 'sun' : name === 'Moon' ? 'moon' : 'planet', name,
    body: A.Body[name], facts: SOLAR_FACTS[name], enu: [0, 0, 0] }));

  const tnos = TNOS.map((b) => ({ id: `tno:${b.name}`, kind: 'tno', name: b.name, el: b, enu: [0, 0, 0] }));

  return { starEqj, starEnu, starMag, starCi, starInfo, starCount: n, cons, dsos, solar, tnos,
    sats: [], lastSolarMs: NaN, lastObsKey: '' };
}

// Faint stars for telescope mode, from data/stars_deep.bin (see tools/build-data.mjs).
export function attachDeepStars(m, buffer) {
  const dv = new DataView(buffer), n = Math.floor(buffer.byteLength / 6);
  const eqj = new Float32Array(n * 3), enu = new Float32Array(n * 3), mag = new Float32Array(n), ci = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 6;
    eqj.set(eqjVector(dv.getUint16(o, true) / 65535 * 360, dv.getInt16(o + 2, true) / 32767 * 90), i * 3);
    mag[i] = dv.getUint8(o + 4) / 20; ci[i] = dv.getInt8(o + 5) / 50;
  }
  m.deep = { n, eqj, enu, mag, ci };
}

export function makeObserver(loc) { return new A.Observer(loc.lat, loc.lon, loc.elev || 0); }

// Recompute every position for `date` at location `loc`. Cheap enough to run each frame;
// solar-system work is throttled to when time moves >= 20 s or the observer changes.
export function updateModel(m, date, loc) {
  const obs = makeObserver(loc);
  const time = A.MakeTime(date);
  const rot = A.Rotation_EQJ_HOR(time, obs).rot;
  m.rot = rot; m.observer = obs; m.date = date;

  const E = m.starEqj, O = m.starEnu;
  for (let i = 0, o = 0; i < m.starCount; i++, o += 3) {
    rotToEnu(rot, E[o], E[o + 1], E[o + 2], O, o);
    refractInPlace(O, o);
  }
  if (m.deep && m.deepOn) {
    const D = m.deep;
    for (let i = 0, o = 0; i < D.n; i++, o += 3) { rotToEnu(rot, D.eqj[o], D.eqj[o + 1], D.eqj[o + 2], D.enu, o); refractInPlace(D.enu, o); }
  }
  for (const c of m.cons) { rotToEnu(rot, c.eqj[0], c.eqj[1], c.eqj[2], c.enu, 0); }
  for (const d of m.dsos) { rotToEnu(rot, d.eqj[0], d.eqj[1], d.eqj[2], d.enu, 0); refractInPlace(d.enu, 0); }

  const key = `${loc.lat.toFixed(3)},${loc.lon.toFixed(3)}`;
  if (!(Math.abs(date - m.lastSolarMs) < 20000) || key !== m.lastObsKey) {
    computeSolar(m, date, obs);
    m.lastSolarMs = +date; m.lastObsKey = key;
  } else {
    // Between full recomputes, carry solar bodies with the sky rotation (their RA/Dec barely move).
    for (const b of [...m.solar, ...m.tnos]) { rotToEnu(rot, b.eqj[0], b.eqj[1], b.eqj[2], b.enu, 0); refractInPlace(b.enu, 0); }
  }
  for (const b of [...m.solar, ...m.tnos]) Object.assign(b, altAzFromEnu(b.enu));
}

function computeSolar(m, date, obs) {
  const time = A.MakeTime(date);
  for (const b of m.solar) {
    const eqd = A.Equator(b.body, time, obs, true, true);   // of-date, for display
    const eqj = A.Equator(b.body, time, obs, false, true);  // J2000, for rotation
    b.raDate = eqd.ra * 15; b.decDate = eqd.dec;
    b.ra = eqj.ra * 15; b.dec = eqj.dec; b.distAU = eqj.dist;
    b.eqj = eqjVector(b.ra, b.dec);
    rotToEnu(m.rot, b.eqj[0], b.eqj[1], b.eqj[2], b.enu, 0); refractInPlace(b.enu, 0);
    b.angDiamDeg = 2 * Math.atan(b.facts.radiusKm / (b.distAU * A.KM_PER_AU)) * R2D;
    if (b.kind !== 'sun') {
      const ill = A.Illumination(b.body, time);
      b.mag = ill.mag; b.phaseFrac = ill.phase_fraction; b.phaseAngle = ill.phase_angle;
      b.helioAU = ill.helio_dist; b.elongation = A.AngleFromSun(b.body, time);
    } else { b.mag = -26.7; b.helioAU = 0; }
  }
  const jd = time.ut + 2451545.0;
  for (const t of m.tnos) {
    const q = equatorialFromBody(t.el, EARTH, jd);
    const h = heliocentricEcliptic(t.el, jd);
    t.ra = q.ra; t.dec = q.dec; t.distAU = q.distAU; t.helioAU = Math.hypot(h.x, h.y, h.z);
    t.mag = apparentMagnitude(t.el.H, t.helioAU, t.distAU);
    t.eqj = eqjVector(t.ra, t.dec);
    rotToEnu(m.rot, t.eqj[0], t.eqj[1], t.eqj[2], t.enu, 0); refractInPlace(t.enu, 0);
  }
}

// Sun altitude (deg) from an updated model — drives sky colour and "is it dark".
export function sunAltitude(m) { return m.solar[0].alt; }

// Rise / transit / set for a fixed RA/Dec (deg), describing the current pass if the object
// is up now, otherwise the next one. Returns Dates, or { always:'up'|'down', transit }.
export function fixedRiseSet(raDeg, decDeg, date, loc, h0 = -0.5667) {
  const lat = loc.lat * D2R, dec = decDeg * D2R;
  const gmst = A.SiderealTime(date) * 15;               // deg
  const lst = (gmst + loc.lon + 360) % 360;
  const SID = 0.9972695663 * 86400000;                   // sidereal day, ms
  const ahead = (deg) => new Date(+date + ((deg % 360 + 360) % 360) / 360 * SID);
  const transitNext = ahead(raDeg - lst);
  const cosH = (Math.sin(h0 * D2R) - Math.sin(lat) * Math.sin(dec)) / (Math.cos(lat) * Math.cos(dec));
  if (cosH < -1) return { always: 'up', transit: transitNext };
  if (cosH > 1) return { always: 'down', transit: transitNext };
  const H = Math.acos(cosH) * R2D;
  let rise = ahead(raDeg - H - lst), set = ahead(raDeg + H - lst);
  if (set < rise) rise = new Date(+rise - SID);           // up now: this pass rose earlier
  const transit = new Date((+rise + +set) / 2);
  return { rise, transit, set };
}

// Same, for a solar-system body (rise/set searched with refraction + disc size).
export function bodyRiseSet(bodyName, date, loc) {
  const obs = makeObserver(loc); const body = A.Body[bodyName];
  const eq = A.Equator(body, date, obs, true, true);
  const up = A.Horizon(date, obs, eq.ra, eq.dec, 'normal').altitude > -0.8;
  let rise;
  if (up) {
    let r = A.SearchRiseSet(body, obs, +1, new Date(+date - 1.1 * 86400000), 1.1);
    while (r) { const nx = A.SearchRiseSet(body, obs, +1, r.AddDays(0.01), 1.1); if (!nx || nx.date > date) break; r = nx; }
    rise = r;
  } else rise = A.SearchRiseSet(body, obs, +1, date, 1.2);
  const from = rise ? rise : A.MakeTime(date);
  const set = A.SearchRiseSet(body, obs, -1, from, 1.2);
  if (!rise && !set) return { always: up ? 'up' : 'down', transit: A.SearchHourAngle(body, obs, 0, date).time.date };
  const t = A.SearchHourAngle(body, obs, 0, from);
  return { rise: rise && rise.date, set: set && set.date, transit: t.time.date, transitAlt: t.hor.altitude };
}

export function constellationOf(raDeg, decDeg) {
  // astronomy-engine expects J2000 RA in hours.
  return A.Constellation(raDeg / 15, decDeg);
}
