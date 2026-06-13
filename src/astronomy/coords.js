import { deg2rad, rad2deg, norm360 } from './angles.js';
import { heliocentricEcliptic } from './orbit.js';

const OBLIQUITY = deg2rad(23.43928); // mean obliquity of the ecliptic, J2000

// Geocentric equatorial RA/Dec (deg) and Earth-distance (AU) for a body.
export function equatorialFromBody(bodyEl, earthEl, jd) {
  const b = heliocentricEcliptic(bodyEl, jd);
  const e = heliocentricEcliptic(earthEl, jd);

  // Geocentric ecliptic = body - earth.
  const xe = b.x - e.x, ye = b.y - e.y, ze = b.z - e.z;

  // Rotate ecliptic -> equatorial about the X axis.
  const xq = xe;
  const yq = ye * Math.cos(OBLIQUITY) - ze * Math.sin(OBLIQUITY);
  const zq = ye * Math.sin(OBLIQUITY) + ze * Math.cos(OBLIQUITY);

  const distAU = Math.hypot(xq, yq, zq);
  const ra = norm360(rad2deg(Math.atan2(yq, xq)));
  const dec = rad2deg(Math.asin(zq / distAU));
  return { ra, dec, distAU };
}

// Local sidereal time (deg) for a Julian Date and east-positive longitude (deg).
export function localSiderealTime(jd, lonEastDeg) {
  const gmst = 280.46061837 + 360.98564736629 * (jd - 2451545.0);
  return norm360(gmst + lonEastDeg);
}

// Convert RA/Dec (deg) to altitude/azimuth (deg). Azimuth measured from North,
// increasing eastward (clockwise). Latitude north-positive.
export function raDecToAltAz(raDeg, decDeg, lstDeg, latDeg) {
  const ha = deg2rad(((lstDeg - raDeg + 540) % 360) - 180); // hour angle
  const dec = deg2rad(decDeg), lat = deg2rad(latDeg);

  const sinAlt = Math.sin(dec) * Math.sin(lat) +
                 Math.cos(dec) * Math.cos(lat) * Math.cos(ha);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));

  const cosAz = (Math.sin(dec) - Math.sin(alt) * Math.sin(lat)) /
                (Math.cos(alt) * Math.cos(lat));
  let az = Math.acos(Math.max(-1, Math.min(1, cosAz)));
  if (Math.sin(ha) > 0) az = 2 * Math.PI - az;
  return { alt: rad2deg(alt), az: rad2deg(az) };
}
