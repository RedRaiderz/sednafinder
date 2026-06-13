import { startCamera } from './sensors/camera.js';
import { startOrientation, getAim } from './sensors/orientation.js';
import { getLocation } from './sensors/location.js';
import { julianDate } from './astronomy/time.js';
import { equatorialFromBody, localSiderealTime, raDecToAltAz } from './astronomy/coords.js';
import { heliocentricEcliptic } from './astronomy/orbit.js';
import { projectToScreen, isHovering } from './render/projection.js';
import { BODIES, EARTH } from './data/bodies.js';
import { showPanel, hidePanel } from './ui/panel.js';

const FOV = 60;            // approximate camera horizontal FOV (deg)
const HOVER_PX = 40;

const video = document.getElementById('cam');
const canvas = document.getElementById('overlay');
const ctx = canvas.getContext('2d');
const panel = document.getElementById('panel');
const startBtn = document.getElementById('start');

let location = { lat: 0, lon: 0 };
let hoveredName = null;

function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
window.addEventListener('resize', resize);

startBtn.addEventListener('click', async () => {
  try {
    await startCamera(video);
    await startOrientation();
    location = await getLocation();
    resize();
    startBtn.style.display = 'none';
    requestAnimationFrame(loop);
  } catch (err) { startBtn.textContent = 'Setup failed — see console'; console.error(err); }
});

// Compute every body's current alt/az + live stats.
function computeBodies() {
  const jd = julianDate(new Date());
  const lst = localSiderealTime(jd, location.lon);
  return BODIES.map((body) => {
    const { ra, dec, distAU } = equatorialFromBody(body, EARTH, jd);
    const { alt, az } = raDecToAltAz(ra, dec, lst, location.lat);
    const h = heliocentricEcliptic(body, jd);
    const rHelio = Math.hypot(h.x, h.y, h.z);
    return { body, live: { ra, dec, distAU, alt, az, rHelio } };
  });
}

function loop() {
  const aim = getAim();
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  let newHover = null;
  for (const { body, live } of computeBodies()) {
    const p = projectToScreen({ az: aim.az, alt: aim.alt }, { az: live.az, alt: live.alt }, FOV, W, H);
    if (p.onScreen) {
      drawMarker(p.x, p.y, body.name);
      if (isHovering({ x: p.x, y: p.y }, W / 2, H / 2, HOVER_PX)) {
        newHover = { body, live };
      }
    } else {
      drawChevron(p.dAz, p.dAlt, body.name, W, H);
    }
  }

  if (newHover && newHover.body.name !== hoveredName) {
    hoveredName = newHover.body.name;
    showPanel(panel, newHover.body, newHover.live);
  } else if (!newHover && hoveredName) {
    hoveredName = null;
    hidePanel(panel);
  }
  requestAnimationFrame(loop);
}

function drawMarker(x, y, name) {
  ctx.beginPath(); ctx.arc(x, y, 10, 0, 2 * Math.PI);
  ctx.strokeStyle = '#ffd75e'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#ffd75e'; ctx.font = '14px system-ui';
  ctx.fillText(name, x + 14, y + 4);
}

function drawChevron(dAz, dAlt, name, W, H) {
  // Point an arrow from center toward the off-screen target.
  const ang = Math.atan2(-dAlt, dAz); // screen: +x right, +y down
  const r = Math.min(W, H) * 0.4;
  const x = W / 2 + Math.cos(ang) * r, y = H / 2 + Math.sin(ang) * r;
  ctx.fillStyle = 'rgba(255,215,94,0.8)'; ctx.font = '12px system-ui';
  ctx.fillText('› ' + name, x - 20, y);
}
