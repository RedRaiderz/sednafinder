import { deg2rad, rad2deg, norm360 } from '../astronomy/angles.js';

// Direction the rear camera points, from DeviceOrientation angles (deg).
// Returns {az, alt} in degrees. World frame: X=East, Y=North, Z=Up.
// Uses the W3C Z-X'-Y'' rotation matrix; camera axis is -Z of the device.
export function cameraDirection(alphaDeg, betaDeg, gammaDeg) {
  const a = deg2rad(alphaDeg), b = deg2rad(betaDeg), g = deg2rad(gammaDeg);
  const cA = Math.cos(a), sA = Math.sin(a);
  const cB = Math.cos(b), sB = Math.sin(b);
  const cG = Math.cos(g), sG = Math.sin(g);

  // Third column of the device->world rotation matrix (device +Z in world).
  const zx = cA * sG + cG * sA * sB;
  const zy = sA * sG - cA * cG * sB;
  const zz = cB * cG;

  // Camera points along device -Z.
  const east = -zx, north = -zy, up = -zz;
  const az = norm360(rad2deg(Math.atan2(east, north)));
  const alt = rad2deg(Math.asin(Math.max(-1, Math.min(1, up))));
  return { az, alt };
}

// --- DOM glue below (not unit-tested) ---

let _heading = 0;     // smoothed azimuth (deg)
let _altitude = 0;    // smoothed altitude (deg)
let _haveCompass = false;

const SMOOTH = 0.15; // low-pass factor
function lp(prev, next) { return prev + SMOOTH * (((next - prev + 540) % 360) - 180); }

function onOrientation(e) {
  const base = cameraDirection(e.alpha || 0, e.beta || 0, e.gamma || 0);
  // iOS: webkitCompassHeading is true-north heading of the device top.
  // Correct azimuth by the difference from alpha.
  let az = base.az;
  if (typeof e.webkitCompassHeading === 'number') {
    _haveCompass = true;
    az = norm360(base.az - (e.alpha || 0) + (360 - e.webkitCompassHeading));
  } else if (e.absolute === true) {
    _haveCompass = true;
  }
  _heading = norm360(lp(_heading, az));
  _altitude = _altitude + SMOOTH * (base.alt - _altitude);
}

// Request permission (iOS 13+) and start listening. Returns true on success.
export async function startOrientation() {
  const Evt = window.DeviceOrientationEvent;
  if (Evt && typeof Evt.requestPermission === 'function') {
    const res = await Evt.requestPermission();
    if (res !== 'granted') return false;
  }
  window.addEventListener('deviceorientation', onOrientation, true);
  return true;
}

export function getAim() { return { az: _heading, alt: _altitude, haveCompass: _haveCompass }; }
