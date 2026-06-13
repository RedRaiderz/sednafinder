import { deg2rad, norm360 } from './angles.js';
import { solveKepler } from './kepler.js';

// Gaussian mean motion in deg/day from semi-major axis (AU).
function meanMotion(a) {
  return 0.9856076686 / (a * Math.sqrt(a));
}

export function meanAnomalyAtJD(el, jd) {
  return norm360(el.M0 + meanMotion(el.a) * (jd - el.epoch));
}

// Heliocentric ecliptic (J2000) rectangular coordinates in AU.
export function heliocentricEcliptic(el, jd) {
  const M = meanAnomalyAtJD(el, jd);
  const E = deg2rad(solveKepler(M, el.e));

  // Position in orbital plane.
  const xv = el.a * (Math.cos(E) - el.e);
  const yv = el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(E);
  const v = Math.atan2(yv, xv);        // true anomaly
  const r = Math.hypot(xv, yv);        // distance from Sun

  const N = deg2rad(el.Om), w = deg2rad(el.w), i = deg2rad(el.i);
  const vw = v + w;

  const x = r * (Math.cos(N) * Math.cos(vw) - Math.sin(N) * Math.sin(vw) * Math.cos(i));
  const y = r * (Math.sin(N) * Math.cos(vw) + Math.cos(N) * Math.sin(vw) * Math.cos(i));
  const z = r * (Math.sin(vw) * Math.sin(i));
  return { x, y, z };
}
