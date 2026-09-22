// Satellites: TLEs from CelesTrak (cached a day), live look angles, and visible passes.
// Relies on the satellite.js UMD build (global `satellite`) loaded in index.html.
import * as A from '../../vendor/astronomy.js';

const GROUPS = [
  { key: 'stations', url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle' },
  { key: 'visual', url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=tle' },
];
const DAY = 86400000;
const R2D = 180 / Math.PI, D2R = Math.PI / 180;
const FEATURED = { 25544: 'ISS', 48274: 'Tiangong', 20580: 'Hubble' };

function parseTLE(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out = [];
  for (let i = 0; i + 2 < lines.length + 1; i += 3) {
    if (!lines[i + 2] || lines[i + 1][0] !== '1' || lines[i + 2][0] !== '2') continue;
    out.push({ name: lines[i], l1: lines[i + 1], l2: lines[i + 2] });
  }
  return out;
}

async function fetchGroup(g) {
  const key = `sf.tle.${g.key}`;
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem(key) || 'null'); } catch { /* storage blocked */ }
  if (cached && Date.now() - cached.t < DAY) return cached.text;
  try {
    const res = await fetch(g.url);
    if (!res.ok) throw new Error(res.status);
    const text = await res.text();
    try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), text })); } catch { /* full */ }
    return text;
  } catch {
    return cached ? cached.text : ''; // stale beats nothing when offline
  }
}

export async function loadSatellites() {
  if (!window.satellite) return [];
  const texts = await Promise.all(GROUPS.map(fetchGroup));
  const seen = new Set(); const sats = [];
  for (const t of texts) for (const e of parseTLE(t)) {
    const rec = window.satellite.twoline2satrec(e.l1, e.l2);
    const norad = parseInt(e.l1.slice(2, 7), 10);
    if (seen.has(norad) || rec.error) continue;
    seen.add(norad);
    const label = FEATURED[norad] || titleCase(e.name);
    sats.push({ id: `sat:${norad}`, kind: 'sat', norad, name: label, fullName: e.name, rec,
      featured: !!FEATURED[norad], enu: [0, 0, 0], tleEpoch: tleEpochDate(e.l1) });
  }
  // Featured first so the renderer can label them on top.
  return sats.sort((a, b) => b.featured - a.featured);
}

function titleCase(s) {
  return s.replace(/\s+\(.*\)$/, '').split(/\s+/).map((w) => (/\d/.test(w) || w.length <= 3 ? w : w[0] + w.slice(1).toLowerCase())).join(' ');
}
function tleEpochDate(l1) {
  const yy = parseInt(l1.slice(18, 20), 10); const doy = parseFloat(l1.slice(20, 32));
  return new Date(Date.UTC(yy < 57 ? 2000 + yy : 1900 + yy, 0, 1) + (doy - 1) * DAY);
}

// Observer-relative state of a satellite at `date`. Returns null if propagation fails.
export function satState(sat, date, loc) {
  const S = window.satellite;
  const pv = S.propagate(sat.rec, date);
  if (!pv || !pv.position) return null;
  const gmst = S.gstime(date);
  const gd = { latitude: loc.lat * D2R, longitude: loc.lon * D2R, height: (loc.elev || 0) / 1000 };
  const ecf = S.eciToEcf(pv.position, gmst);
  const look = S.ecfToLookAngles(gd, ecf);
  const geo = S.eciToGeodetic(pv.position, gmst);
  const v = pv.velocity;
  return {
    alt: look.elevation * R2D, az: (look.azimuth * R2D + 360) % 360, rangeKm: look.rangeSat,
    heightKm: geo.height, subLat: geo.latitude * R2D, subLon: S.degreesLong(geo.longitude),
    speedKms: Math.hypot(v.x, v.y, v.z), eci: pv.position,
  };
}

// Is the satellite in sunlight? Cylindrical Earth-shadow test using the Sun's ECI direction.
export function isSunlit(eciKm, date) {
  const t = A.MakeTime(date);
  const sv = A.GeoVector(A.Body.Sun, t, false); // EQJ AU; close enough to TEME for a shadow test
  const sl = Math.hypot(sv.x, sv.y, sv.z); const s = [sv.x / sl, sv.y / sl, sv.z / sl];
  const p = [eciKm.x, eciKm.y, eciKm.z];
  const along = p[0] * s[0] + p[1] * s[1] + p[2] * s[2];
  if (along > 0) return true;
  const perp = Math.hypot(p[0] - along * s[0], p[1] - along * s[1], p[2] - along * s[2]);
  return perp > 6371;
}

// Passes over the next `days`, stepping 20 s and refining edges. Each pass notes whether
// it is visible to the eye (observer in darkness, satellite sunlit, above 10°).
export function findPasses(sat, start, loc, days = 3, minAlt = 10) {
  const obs = new A.Observer(loc.lat, loc.lon, loc.elev || 0);
  const passes = []; const end = +start + days * DAY; const step = 20000;
  let cur = null;
  for (let t = +start; t < end; t += step) {
    const d = new Date(t); const s = satState(sat, d, loc);
    if (!s) continue;
    if (s.alt > 0) {
      if (!cur) cur = { rise: d, riseAz: s.az, max: s, maxAt: d, visible: false };
      if (s.alt > cur.max.alt) { cur.max = s; cur.maxAt = d; }
      if (!cur.visible && s.alt >= minAlt) {
        const sunAlt = A.Horizon(d, obs, ...sunRaDec(d, obs), null).altitude;
        if (sunAlt < -6 && isSunlit(s.eci, d)) cur.visible = true;
      }
    } else if (cur) {
      cur.set = d; cur.setAz = s.az;
      if (cur.max.alt >= minAlt) passes.push(cur);
      cur = null;
    }
  }
  return passes;
}
function sunRaDec(d, obs) { const e = A.Equator(A.Body.Sun, d, obs, true, true); return [e.ra, e.dec]; }
