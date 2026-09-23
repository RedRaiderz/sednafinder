// Opt-in field telemetry: streams sensor + view state to Paine's collector on Solace so pointing
// errors can be measured from real iPhone data. Tailnet-only endpoint; off unless enabled in Setup.
export const ENDPOINT = 'https://solace-system.tail506734.ts.net:10000';

const tm = { on: false, frames: [], session: '', lastSample: 0, timer: 0, sent: 0, failed: 0, status: 'off' };

export function telemetryOn() { return tm.on; }
export function telemetryStatus() { return { status: tm.status, sent: tm.sent, failed: tm.failed, queued: tm.frames.length }; }

export async function startTelemetry() {
  tm.session = new Date().toISOString().replace(/[:.]/g, '-');
  tm.on = true; tm.status = 'connecting';
  try {
    const r = await fetch(ENDPOINT + '/ping', { cache: 'no-store' });
    tm.status = r.ok ? 'connected' : 'error ' + r.status;
  } catch { tm.status = 'unreachable (is Tailscale on?)'; }
  clearInterval(tm.timer);
  tm.timer = setInterval(flush, 2000);
  return tm.status;
}

export function stopTelemetry() { flush(); tm.on = false; tm.status = 'off'; clearInterval(tm.timer); }

// Called every animation frame; keeps ~5 samples/s.
export function sample(t, build) {
  if (!tm.on || t - tm.lastSample < 200) return;
  tm.lastSample = t;
  tm.frames.push({ kind: 'frame', ...build() });
  if (tm.frames.length > 3000) tm.frames.splice(0, tm.frames.length - 3000);
}

// Ground-truth mark: "the real object is in my reticle right now".
export function mark(data) { if (tm.on) { tm.frames.push({ kind: 'mark', ...data }); flush(); } }

async function flush() {
  if (!tm.frames.length) return;
  const frames = tm.frames.splice(0);
  try {
    const r = await fetch(ENDPOINT + '/t', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session: tm.session, frames }) });
    if (!r.ok) throw new Error(r.status);
    tm.sent += frames.length; tm.status = 'connected';
  } catch {
    tm.failed++; tm.status = 'unreachable (is Tailscale on?)';
    tm.frames.unshift(...frames.slice(-1500)); // keep the recent past for when the link comes back
  }
}
