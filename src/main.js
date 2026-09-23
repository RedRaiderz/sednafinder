import { createModel, updateModel, enuFromAltAz, altAzFromEnu } from './sky/model.js';
import { basisFromAltAz, projScale, dot } from './sky/view.js';
import { createRenderer, drawSky } from './sky/render.js';
import { loadSatellites, satState, isSunlit } from './sky/sats.js';
import { startOrientation, getBasis, hasCompass, setTrim, getTrim, setDeclination, sensorDebug } from './sensors/orientation.js';
import { startTelemetry, stopTelemetry, telemetryOn, telemetryStatus, sample, mark } from './sensors/telemetry.js';
import magvar from '../vendor/magvar.js';
import { startCamera, stopCamera } from './sensors/camera.js';
import { getLocation, loadSavedLocation, saveLocation, PRESETS } from './sensors/location.js';
import { renderDetail, registerConstellations } from './ui/detail.js';
import { renderTonight } from './ui/tonight.js';
import { searchIndex, renderFind, renderFindList } from './ui/find.js';
import * as F from './ui/format.js';

const $ = (id) => document.getElementById(id);
const D2R = Math.PI / 180;

// ---------- persistent settings ----------
const DEFAULTS = { constellations: true, labels: true, deepSky: true, tnos: true, sats: true, grid: false, ecliptic: false,
  magLimit: 5.5, camFov: 67, red: false, trim: 0, telemetry: false };
function loadSettings() { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('sf.settings') || '{}') }; } catch { return { ...DEFAULTS }; } }
function saveSettings() { try { localStorage.setItem('sf.settings', JSON.stringify(S)); } catch { /* private mode */ } }
const S = loadSettings();

// ---------- app state ----------
const st = {
  mode: 'chart', camera: false,         // chart = drag to look; ar = follow the phone
  chart: { alt: 35, az: 180, fov: 95 },
  arFov: 62,
  live: true, fixed: new Date(), playing: false,
  loc: loadSavedLocation() || { lat: 40.4237, lon: -86.9212, label: 'no GPS yet — tap to set', approx: true },
  target: null, selected: null, tab: 'sky',
  findQuery: '', findGroup: 'all', calibrating: false, tween: null,
};
let model = null, index = null, lastSatUpdate = 0;
const hits = [];
const R = createRenderer($('sky'));
window.addEventListener('resize', () => R.resize());

// ---------- boot ----------
async function boot() {
  const [stars, constellations, dso] = await Promise.all(['stars', 'constellations', 'dso'].map((n) => fetch(`data/${n}.json`).then((r) => r.json())));
  model = createModel({ stars, constellations, dso });
  registerConstellations(model.cons);
  setTrim(S.trim);
  applyRed();
  updateWhere();
  requestAnimationFrame(frame);
  loadSatellites().then((sats) => { model.sats = sats; index = null; }).catch(() => {});
  // Refresh location quietly if the browser already has permission.
  // Once location has been granted, refresh it on every launch so the chart follows you around.
  if (st.loc.label === 'GPS') locate(false);
  else if (navigator.permissions) {
    navigator.permissions.query({ name: 'geolocation' }).then((p) => { if (p.state === 'granted') locate(false); }).catch(() => {});
  }
  try { if (localStorage.getItem('sf.introDone')) { $('intro').classList.add('gone'); } } catch { /* */ }
  if (S.telemetry) startTelemetry().then(updateMarkBtn);
}
boot();
export const APP_VERSION = '2.4.0';
window.sf = { st, S }; // handy from the console

function currentDate() { return st.live ? new Date() : st.fixed; }

// ---------- intro ----------
$('startAR').addEventListener('click', async () => { dismissIntro(); locate(true); await enterAR(true); });
$('startChart').addEventListener('click', () => { dismissIntro(); locate(true); });
function dismissIntro() { $('intro').classList.add('gone'); try { localStorage.setItem('sf.introDone', '1'); } catch { /* */ } }

async function locate(ask) {
  const loc = await getLocation(ask);
  if (loc) { st.loc = loc; saveLocation(loc); updateWhere(); if (st.tab === 'tonight' || st.tab === 'setup') openTab(st.tab); }
  else if (ask) toast('Location unavailable — using the saved place. Change it in Setup.');
}
function declination() { try { return magvar.magvar(st.loc.lat, st.loc.lon) || 0; } catch { return 0; } }
function updateWhere() {
  const l = st.loc;
  setDeclination(declination());
  $('where').textContent = `${Math.abs(l.lat).toFixed(2)}° ${l.lat >= 0 ? 'N' : 'S'}, ${Math.abs(l.lon).toFixed(2)}° ${l.lon >= 0 ? 'E' : 'W'}${l.label ? ' · ' + l.label : ''}`;
}

// ---------- AR / camera ----------
async function enterAR(withCamera) {
  const res = await startOrientation(declination());
  if (!res.ok) {
    toast(res.reason === 'denied' ? 'Motion access was denied. On iPhone: close the app, reopen it, and allow Motion & Orientation.'
      : 'This device has no motion sensors — the chart still works, drag to look around.');
    return false;
  }
  st.mode = 'ar'; st.tween = null; keepAwake(true);
  $('btnAR').classList.add('on'); $('reticle').classList.remove('hidden'); updateMarkBtn();
  setTimeout(() => { if (st.mode === 'ar' && !hasCompass()) toast('No compass reported — directions may drift. Use Setup → Calibrate.'); }, 1500);
  if (withCamera) await setCamera(true);
  return true;
}
function exitAR() {
  st.mode = 'chart'; $('btnAR').classList.remove('on'); $('reticle').classList.add('hidden'); $('aimChip').classList.add('hidden');
  const b = getBasis(); if (b) { const { alt, az } = altAzFromEnu(b.f); st.chart.alt = alt; st.chart.az = az; }
  setCamera(false); endCalibrate(); keepAwake(false); updateMarkBtn();
}
// Stop the screen dimming while you're holding the phone up to the sky.
let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && !wakeLock && navigator.wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); }
    if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch { /* not supported / not visible */ }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && st.mode === 'ar') keepAwake(true); });
async function setCamera(on) {
  if (on) {
    try { await startCamera($('cam')); st.camera = true; document.body.classList.add('camera'); $('btnCam').classList.add('on'); }
    catch { toast('Camera unavailable — showing the chart instead.'); }
  } else { stopCamera($('cam')); st.camera = false; document.body.classList.remove('camera'); $('btnCam').classList.remove('on'); }
}
$('btnAR').addEventListener('click', () => (st.mode === 'ar' ? exitAR() : enterAR(false)));
$('btnCam').addEventListener('click', async () => {
  if (st.camera) return setCamera(false);
  if (st.mode !== 'ar' && !(await enterAR(false))) return;
  setCamera(true);
});
$('btnRed').addEventListener('click', () => { S.red = !S.red; saveSettings(); applyRed(); });
function applyRed() { document.body.classList.toggle('red', S.red); $('btnRed').classList.toggle('on', S.red); }

// Vertical FOV of what's on screen when the camera feed fills it (object-fit: cover).
function cameraVFov() {
  const v = $('cam'); const vw = v.videoWidth, vh = v.videoHeight;
  if (!vw || !vh) return S.camFov;
  const W = R.W, H = R.H;
  const tLong = Math.tan((S.camFov / 2) * D2R);
  const tV = vh >= vw ? tLong : tLong * (vh / vw);       // video's own vertical half-FOV tangent
  const scale = Math.max(W / vw, H / vh);
  const visibleFrac = (H / scale) / vh;                  // fraction of video height on screen
  return 2 * Math.atan(tV * visibleFrac) / D2R;
}

// ---------- view ----------
function currentView() {
  if (st.mode === 'ar') {
    const b = getBasis();
    if (b) return { ...b, fov: st.camera ? cameraVFov() : st.arFov, proj: 'gnomonic' };
  }
  return { ...basisFromAltAz(st.chart.alt, st.chart.az), fov: st.chart.fov, proj: 'stereo' };
}

// ---------- frame ----------
let lastClock = 0, lastT = 0;
const label = (o) => o.proper || o.name || o.code || o.designation || 'target';
function frame(t) {
  requestAnimationFrame(frame);
  if (!model) return;
  const dt = lastT ? Math.min(100, t - lastT) : 16; lastT = t;
  if (st.playing) { st.fixed = new Date(+st.fixed + dt * 10); } // 10 min of sky per second
  const date = currentDate();
  updateModel(model, date, st.loc);
  updateSats(date, t);
  if (st.tween) stepTween(t);
  const view = currentView();
  drawSky(R, model, view, { ...S, camera: st.camera, target: st.target }, hits);
  if (st.mode === 'ar') { updateAim(view); sample(t, () => telemetryFrame(view)); }
  if (t - lastClock > 500) { lastClock = t; updateClock(date); }
}

function updateSats(date, t) {
  if (!model.sats.length || !S.sats) return;
  const full = t - lastSatUpdate > (st.live ? 1000 : 120);
  if (full) lastSatUpdate = t;
  for (const sat of model.sats) {
    if (!full && !sat.featured) continue;
    const s = satState(sat, date, st.loc);
    if (!s) { sat.alt = null; continue; }
    sat.alt = s.alt; sat.az = s.az; sat.enu = enuFromAltAz(s.alt, s.az);
    if (full) sat.sunlit = s.alt > -1 ? isSunlit(s.eci, date) : false;
  }
}

function updateClock(date) {
  $('whenDate').textContent = date.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
  $('whenTime').textContent = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  const tag = $('whenTag');
  if (st.live) { tag.textContent = 'LIVE'; tag.classList.remove('off'); }
  else { const m = Math.round((date - Date.now()) / 60000); tag.textContent = (m >= 0 ? '+' : '−') + fmtOffset(Math.abs(m)); tag.classList.add('off'); }
}
function fmtOffset(m) { return m >= 1440 ? `${(m / 1440).toFixed(m % 1440 ? 1 : 0)}D` : m >= 60 ? `${Math.floor(m / 60)}H${m % 60 ? String(m % 60).padStart(2, '0') : ''}` : `${m}M`; }

// ---------- field telemetry ----------
const r2 = (x) => (x == null ? null : Math.round(x * 100) / 100);
function camAltAz(view) { const { alt, az } = altAzFromEnu(view.f); return { alt: r2(alt), az: r2(az) }; }
function bodiesUp() {
  return model.solar.filter((b) => b.alt > -5).map((b) => ({ name: b.name, alt: r2(b.alt), az: r2(b.az) }));
}
function telemetryFrame(view) {
  const v = $('cam');
  return { t: Date.now(), v: APP_VERSION, mode: st.mode, camera: st.camera, cam: camAltAz(view), up: view.u.map(r2), fov: r2(view.fov),
    camFovSetting: S.camFov, screen: [R.W, R.H], video: [v.videoWidth || 0, v.videoHeight || 0],
    sensor: sensorDebug(), loc: { lat: st.loc.lat, lon: st.loc.lon, label: st.loc.label },
    aimed: aimed ? label(aimed) : null, target: st.target ? label(st.target) : null, bodies: bodiesUp() };
}
function updateMarkBtn() { $('markBtn').classList.toggle('hidden', !(telemetryOn() && st.mode === 'ar')); }
$('markBtn').addEventListener('click', () => {
  const view = currentView(); if (!model) return;
  // Nearest solar-system body to the reticle is almost certainly what the user lined up.
  let best = null, bd = Infinity;
  for (const b of model.solar) { if (b.alt < -5) continue; const d = Math.acos(Math.max(-1, Math.min(1, dot(b.enu, view.f)))) / D2R; if (d < bd) { bd = d; best = b; } }
  const cam = camAltAz(view);
  const err = best ? { name: best.name, sep: r2(bd), dAz: r2(((cam.az - best.az + 540) % 360) - 180), dAlt: r2(cam.alt - best.alt) } : null;
  mark({ t: Date.now(), cam, fov: r2(view.fov), sensor: sensorDebug(), bodies: bodiesUp(), nearest: err, frame: telemetryFrame(view) });
  if (navigator.vibrate) navigator.vibrate(20);
  toast(err ? `Marked ${err.name}: app is off by ${err.sep.toFixed(1)}° (az ${err.dAz >= 0 ? '+' : ''}${err.dAz.toFixed(1)}°, alt ${err.dAlt >= 0 ? '+' : ''}${err.dAlt.toFixed(1)}°)` : 'Marked.');
});

// ---------- AR aiming ----------
let aimed = null;
function updateAim(view) {
  // Nearest hit target to the reticle, within 44 px.
  let best = null, bd = 44;
  for (const h of hits) { const d = Math.hypot(h.x - R.W / 2, h.y - R.H / 2) - h.pri * 2; if (d < bd) { bd = d; best = h; } }
  const obj = best ? best.obj : null;
  if (obj !== aimed) {
    aimed = obj;
    const chip = $('aimChip');
    if (!obj) chip.classList.add('hidden');
    else { chip.innerHTML = `${F.esc(obj.proper || obj.name || obj.code)}<small>${obj.mag != null ? 'mag ' + obj.mag.toFixed(1) : obj.kind === 'con' ? 'constellation' : ''}</small>`; chip.classList.remove('hidden'); }
  }
  if (st.target && st.target.enu && dot(st.target.enu, view.f) > Math.cos(2 * D2R) && !st.targetHit) {
    st.targetHit = true; if (navigator.vibrate) navigator.vibrate(30); toast(`You're on ${label(st.target)}.`);
  }
}
$('aimChip').addEventListener('click', () => { if (aimed) openDetail(aimed); });

// ---------- gestures on the sky ----------
const ptrs = new Map(); let gesture = null;
const sky = $('sky');
sky.addEventListener('pointerdown', (e) => {
  sky.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  st.tween = null;
  if (ptrs.size === 1) gesture = { type: 'pan', x0: e.clientX, y0: e.clientY, t0: performance.now(), moved: 0, last: { x: e.clientX, y: e.clientY } };
  else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; gesture = { type: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), fov0: st.mode === 'ar' ? st.arFov : st.chart.fov, moved: 99 }; }
});
sky.addEventListener('pointermove', (e) => {
  if (!ptrs.has(e.pointerId) || !gesture) return;
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (gesture.type === 'pinch' && ptrs.size >= 2) {
    const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
    const fov = Math.max(8, Math.min(st.mode === 'ar' ? 90 : 150, gesture.fov0 * gesture.d0 / Math.max(d, 1)));
    if (st.mode === 'ar') { if (!st.camera) st.arFov = fov; } else st.chart.fov = fov;
  } else if (gesture.type === 'pan') {
    const dx = e.clientX - gesture.last.x, dy = e.clientY - gesture.last.y;
    gesture.last = { x: e.clientX, y: e.clientY }; gesture.moved += Math.hypot(dx, dy);
    const view = currentView(); const radPerPx = 1 / projScale(view, R.H);
    if (st.mode === 'ar') {
      if (st.calibrating) { S.trim = getTrim() - dx * radPerPx / D2R; setTrim(S.trim); }
    } else {
      st.chart.az = (st.chart.az - dx * radPerPx / D2R * 1.0 + 360) % 360;
      st.chart.alt = Math.max(-89, Math.min(89.9, st.chart.alt + dy * radPerPx / D2R));
    }
  }
});
const endPtr = (e) => {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.delete(e.pointerId);
  if (e.type === 'pointerup' && gesture && gesture.type === 'pan' && gesture.moved < 8 && performance.now() - gesture.t0 < 400) tapAt(e.clientX, e.clientY);
  if (ptrs.size === 0) gesture = null;
  else if (ptrs.size === 1) { const [p] = [...ptrs.values()]; gesture = { type: 'pan', x0: p.x, y0: p.y, t0: 0, moved: 99, last: { ...p } }; } // pinch -> keep panning with the remaining finger
};
sky.addEventListener('pointerup', endPtr); sky.addEventListener('pointercancel', endPtr);
sky.addEventListener('wheel', (e) => { e.preventDefault(); st.chart.fov = Math.max(8, Math.min(150, st.chart.fov * Math.exp(e.deltaY * 0.001))); }, { passive: false });

function tapAt(x, y) {
  if ($('sheet').classList.contains('open')) { closeSheet(); return; }
  let best = null, bd = Infinity;
  for (const h of hits) { const d = Math.hypot(h.x - x, h.y - y); if (d < h.r && d - h.pri * 3 < bd) { bd = d - h.pri * 3; best = h; } }
  if (best) openDetail(best.obj);
}

// ---------- navigation to a target ----------
function pointAt(obj) {
  st.target = obj; st.targetHit = false;
  if (st.mode === 'chart') centerOn(obj);
  else toast(`Follow the arrow to ${label(obj)}.`);
}
function centerOn(obj) {
  if (!obj.enu) return;
  const { alt, az } = altAzFromEnu(obj.enu);
  st.tween = { t0: performance.now(), from: { ...st.chart }, to: { alt: Math.max(-60, Math.min(85, alt)), az, fov: Math.min(st.chart.fov, obj.kind === 'con' ? 70 : 60) } };
}
function stepTween(t) {
  const k = Math.min(1, (t - st.tween.t0) / 700), e = 1 - Math.pow(1 - k, 3);
  const { from, to } = st.tween;
  const daz = ((to.az - from.az + 540) % 360) - 180;
  st.chart.az = (from.az + daz * e + 360) % 360; st.chart.alt = from.alt + (to.alt - from.alt) * e; st.chart.fov = from.fov + (to.fov - from.fov) * e;
  if (k >= 1) st.tween = null;
}

// ---------- sheet + tabs ----------
const sheet = $('sheet'), body = $('sheetBody');
function openSheet(html, after) { body.innerHTML = html; body.scrollTop = 0; sheet.classList.add('open'); if (after) after(body); }
function closeSheet() { sheet.classList.remove('open'); st.selected = null; setTabUI('sky'); st.tab = 'sky'; }
function setTabUI(tab) { for (const b of $('tabs').children) b.classList.toggle('on', b.dataset.tab === tab); }

function ctx() { return { model, loc: st.loc, date: currentDate() }; }
function openDetail(obj) {
  st.selected = obj; st.tab = 'detail'; setTabUI('');
  try { openSheet(renderDetail(obj, ctx())); } catch (err) { console.error(err); openSheet(`<p class="note">Couldn't compute details: ${F.esc(err.message || err)}</p>`); }
}
function openTab(tab) {
  st.tab = tab; setTabUI(tab);
  if (tab === 'sky') { closeSheet(); return; }
  if (tab === 'tonight') {
    openSheet('<p class="kicker">Working</p><h2 class="title">Tonight</h2><p class="note">Crunching the night…</p>');
    setTimeout(() => { try { const r = renderTonight(ctx()); if (st.tab === 'tonight') openSheet(r.html, r.after); } catch (err) { console.error(err); openSheet(`<p class="note">${F.esc(err.message || err)}</p>`); } }, 30);
  }
  if (tab === 'find') {
    if (!model) return;
    if (!index || index.satCount !== model.sats.length) { index = searchIndex(model); index.satCount = model.sats.length; }
    openSheet(renderFind(st), (root) => {
      const list = root.querySelector('#findList');
      const refresh = () => { list.innerHTML = renderFindList(index, st); };
      refresh();
      root.querySelector('#findInput').addEventListener('input', (e) => { st.findQuery = e.target.value; refresh(); });
      root.querySelector('#findChips').addEventListener('click', (e) => {
        const g = e.target.dataset.g; if (!g) return; st.findGroup = g;
        for (const b of e.currentTarget.children) b.classList.toggle('on', b.dataset.g === g); refresh();
      });
    });
  }
  if (tab === 'setup') openSheet(renderSetup(), wireSetup);
}
$('tabs').addEventListener('click', (e) => { const t = e.target.closest('button'); if (t) openTab(t.dataset.tab === st.tab ? 'sky' : t.dataset.tab); });

// Clicks inside the sheet: open another object, or detail actions.
body.addEventListener('click', (e) => {
  const open = e.target.closest('[data-open]');
  if (open) { const obj = findById(open.dataset.open); if (obj) openDetail(obj); return; }
  const act = e.target.closest('[data-act]');
  if (!act || !st.selected) return;
  if (act.dataset.act === 'point') { pointAt(st.selected); sheet.classList.remove('open'); setTabUI('sky'); }
  if (act.dataset.act === 'center') { if (st.mode === 'ar') exitAR(); st.target = st.selected; centerOn(st.selected); sheet.classList.remove('open'); setTabUI('sky'); }
});
function findById(id) {
  const [kind] = id.split(':');
  const pool = { sol: model.solar, tno: model.tnos, dso: model.dsos, con: model.cons, star: model.starInfo, sat: model.sats }[kind] || [];
  return pool.find((o) => o.id === id);
}

// Drag the grip down to dismiss.
let grip = null;
$('grip').addEventListener('pointerdown', (e) => { grip = { y0: e.clientY }; sheet.classList.add('dragging'); $('grip').setPointerCapture(e.pointerId); });
$('grip').addEventListener('pointermove', (e) => { if (grip) sheet.style.transform = `translateY(${Math.max(0, e.clientY - grip.y0)}px)`; });
const gripEnd = (e) => {
  if (!grip) return; sheet.classList.remove('dragging'); sheet.style.transform = '';
  if (e.type === 'pointerup' && e.clientY - grip.y0 > 80) closeSheet(); grip = null;
};
$('grip').addEventListener('pointerup', gripEnd); $('grip').addEventListener('pointercancel', gripEnd);

// ---------- setup ----------
function toggle(key, label) { return `<button class="toggle ${S[key] ? 'on' : ''}" data-key="${key}"><span>${label}</span><i></i></button>`; }
function renderSetup() {
  const l = st.loc;
  return `<p class="kicker">Preferences</p><h2 class="title">Setup</h2>
    <p class="section">Location</p>
    <p class="note" style="margin-top:6px">${F.esc(l.label || 'Custom')} · ${l.lat.toFixed(4)}, ${l.lon.toFixed(4)}</p>
    <div class="btnrow"><button class="solid" id="useGps">Use my location</button>${PRESETS.map((p, i) => `<button class="ghost" data-preset="${i}">${F.esc(p.label)}</button>`).join('')}</div>
    <div class="field"><label>Latitude<input id="latIn" inputmode="decimal" value="${l.lat.toFixed(4)}"></label><label>Longitude<input id="lonIn" inputmode="decimal" value="${l.lon.toFixed(4)}"></label></div>
    <div class="btnrow"><button class="ghost" id="setLoc">Set coordinates</button></div>
    <p class="section">On the chart</p>
    ${toggle('constellations', 'Constellations')}${toggle('labels', 'Labels')}${toggle('deepSky', 'Deep-sky objects')}
    ${toggle('tnos', 'Far-frontier worlds')}${toggle('sats', 'Satellites')}${toggle('grid', 'Alt/az grid')}${toggle('ecliptic', 'Ecliptic')}
    ${toggle('red', 'Night vision (red)')}
    <p class="section">Faintest stars · mag <span id="magV">${S.magLimit.toFixed(1)}</span></p>
    <input class="range" id="magIn" type="range" min="3" max="6.5" step="0.1" value="${S.magLimit}">
    <p class="note">City sky ≈ 3.5 · suburbs ≈ 4.5 · dark site ≈ 6.</p>
    <p class="section">Pointing mode</p>
    <div class="btnrow"><button class="ghost" id="calib">Calibrate compass</button><button class="ghost" id="calibClear">Reset (${S.trim.toFixed(1)}°)</button></div>
    <p class="section">Camera field of view · <span id="fovV">${S.camFov}</span>°</p>
    <input class="range" id="fovIn" type="range" min="45" max="90" step="1" value="${S.camFov}">
    <p class="note">If markers drift outward from what you see, lower this; if they bunch toward the centre, raise it. iPhone main camera ≈ 67.</p>
    <p class="section">Field telemetry</p>
    ${toggle('telemetry', 'Send sensor data to Solace')}
    <p class="note" id="telemV">${S.telemetry ? 'Status: ' + F.esc(telemetryStatus().status) + ' · ' + telemetryStatus().sent + ' samples sent' : 'Off. Needs Tailscale on. Streams compass/tilt/view data while pointing so the aiming can be tuned; in pointing mode, put the real Moon or a planet in the reticle and tap “I’m on it”.'}</p>
    <p class="section">About · v${APP_VERSION}</p>
    <p class="note">Positions from astronomy-engine (VSOP87 / Meeus lunar theory), stars from the HYG catalogue, deep sky from OpenNGC, satellites from CelesTrak (refreshed daily), far-frontier orbits from JPL small-body elements. Works offline after the first load, except satellite updates.</p>`;
}
function wireSetup(root) {
  root.querySelectorAll('.toggle').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.key; S[k] = !S[k]; b.classList.toggle('on', S[k]); saveSettings(); if (k === 'red') applyRed();
    if (k === 'telemetry') {
      if (S.telemetry) startTelemetry().then((s) => { updateMarkBtn(); toast('Telemetry: ' + s); if (st.tab === 'setup') openTab('setup'); });
      else { stopTelemetry(); updateMarkBtn(); openTab('setup'); }
    }
  }));
  root.querySelector('#magIn').addEventListener('input', (e) => { S.magLimit = +e.target.value; root.querySelector('#magV').textContent = S.magLimit.toFixed(1); saveSettings(); });
  root.querySelector('#fovIn').addEventListener('input', (e) => { S.camFov = +e.target.value; root.querySelector('#fovV').textContent = S.camFov; saveSettings(); });
  root.querySelector('#useGps').addEventListener('click', () => locate(true));
  root.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => {
    st.loc = { ...PRESETS[+b.dataset.preset] }; saveLocation(st.loc); updateWhere(); openTab('setup');
  }));
  root.querySelector('#setLoc').addEventListener('click', () => {
    const lat = parseFloat(root.querySelector('#latIn').value), lon = parseFloat(root.querySelector('#lonIn').value);
    if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) return toast('Latitude −90…90, longitude −180…180 (west is negative).');
    st.loc = { lat, lon, label: 'Custom' }; saveLocation(st.loc); updateWhere(); openTab('setup');
  });
  root.querySelector('#calib').addEventListener('click', async () => {
    if (st.mode !== 'ar' && !(await enterAR(true))) return;
    closeSheet(); st.calibrating = true; $('calib').classList.remove('hidden');
  });
  root.querySelector('#calibClear').addEventListener('click', () => { S.trim = 0; setTrim(0); saveSettings(); openTab('setup'); });
}
function endCalibrate() { st.calibrating = false; $('calib').classList.add('hidden'); saveSettings(); }
$('calibDone').addEventListener('click', endCalibrate);
$('calibReset').addEventListener('click', () => { S.trim = 0; setTrim(0); });

// ---------- time travel ----------
const slider = $('timeSlider');
let sliderBase = null;
$('where').addEventListener('click', (e) => { e.stopPropagation(); openTab('setup'); });
$('when').addEventListener('click', () => {
  const tb = $('timebar'); const show = tb.classList.contains('hidden');
  tb.classList.toggle('hidden', !show);
  if (show) { sliderBase = currentDate(); slider.value = 0; }
});
slider.addEventListener('input', () => {
  if (!sliderBase) sliderBase = currentDate();
  st.live = false; st.playing = false; $('timePlay').classList.remove('on');
  st.fixed = new Date(+sliderBase + slider.value * 60000);
});
$('timebar').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.step) { st.fixed = new Date(+currentDate() + +b.dataset.step * 60000); st.live = false; sliderBase = st.fixed; slider.value = 0; }
  if (b.id === 'timeNow') { st.live = true; st.playing = false; $('timePlay').classList.remove('on'); sliderBase = new Date(); slider.value = 0; }
  if (b.id === 'timePlay') { if (st.live) { st.fixed = new Date(); st.live = false; } st.playing = !st.playing; b.classList.toggle('on', st.playing); b.textContent = st.playing ? '❚❚' : '▶'; }
});

// ---------- toast ----------
let toastTimer = 0;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3200); }
