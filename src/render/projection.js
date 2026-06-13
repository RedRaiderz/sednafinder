import { angleDiff } from '../astronomy/angles.js';

// Project a target (az/alt) onto the screen given where the device points.
// Returns {x, y, onScreen}. Pinhole-style linear mapping across the FOV.
export function projectToScreen(device, target, fovDeg, width, height) {
  const vfov = (fovDeg * height) / width; // vertical FOV from aspect ratio
  const dAz = angleDiff(target.az, device.az); // +right
  const dAlt = target.alt - device.alt;        // +up

  const x = width / 2 + (dAz / (fovDeg / 2)) * (width / 2);
  const y = height / 2 - (dAlt / (vfov / 2)) * (height / 2);

  const onScreen =
    Math.abs(dAz) <= fovDeg / 2 && Math.abs(dAlt) <= vfov / 2;
  return { x, y, onScreen, dAz, dAlt };
}

export function isHovering(point, centerX, centerY, thresholdPx) {
  return Math.hypot(point.x - centerX, point.y - centerY) <= thresholdPx;
}
