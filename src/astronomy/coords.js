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
