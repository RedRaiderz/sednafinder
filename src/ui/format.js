// Small formatting helpers shared by the sheets.
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const DIRS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
export const compass = (az) => DIRS[Math.round(((az % 360) + 360) % 360 / 22.5) % 16];

export function time(d) {
  if (!d) return '—';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(' ', ' ');
}
export function dayTime(d, ref = new Date()) {
  if (!d) return '—';
  const sameDay = d.toDateString() === ref.toDateString();
  const tomorrow = new Date(+ref + 86400000).toDateString() === d.toDateString();
  const day = sameDay ? '' : tomorrow ? 'tmrw ' : d.toLocaleDateString([], { weekday: 'short' }) + ' ';
  return day + time(d);
}
export function date(d) { return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }); }
export function dateLong(d) { return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }); }

export function ra(deg) {
  const h = ((deg % 360) + 360) % 360 / 15; const hh = Math.floor(h); const m = (h - hh) * 60; const mm = Math.floor(m); const ss = Math.round((m - mm) * 60);
  return `${hh}h ${String(mm).padStart(2, '0')}m ${String(ss % 60).padStart(2, '0')}s`;
}
export function dec(deg) {
  const s = deg < 0 ? '−' : '+'; const a = Math.abs(deg); const d = Math.floor(a); const m = Math.round((a - d) * 60);
  return `${s}${d}° ${String(m % 60).padStart(2, '0')}′`;
}
export const deg = (x, p = 0) => `${x.toFixed(p)}°`;
export const num = (x) => Math.round(x).toLocaleString();

export function dist(au) {
  const km = au * 149597870.7;
  if (au < 0.01) return `${num(km)} km`;
  if (au < 100) return `${au.toFixed(au < 1 ? 3 : 2)} AU`;
  return `${au.toFixed(0)} AU`;
}
export function lightTime(au) {
  const s = au * 499.004784;
  if (s < 90) return `${s.toFixed(1)} light-seconds`;
  if (s < 5400) return `${(s / 60).toFixed(1)} light-minutes`;
  return `${(s / 3600).toFixed(1)} light-hours`;
}
export function ly(x) {
  if (!x) return '—';
  return x < 100 ? `${x.toFixed(1)} ly` : `${num(x)} ly`;
}
export function angSize(degVal) {
  if (degVal >= 1) return `${degVal.toFixed(2)}°`;
  const am = degVal * 60; if (am >= 1) return `${am.toFixed(1)}′`;
  return `${(am * 60).toFixed(1)}″`;
}

// What it takes to see something of magnitude m.
export function visibilityClass(m) {
  if (m == null) return 'unknown';
  if (m < 1) return 'Obvious to the eye';
  if (m < 4.5) return 'Naked eye';
  if (m < 6.5) return 'Naked eye, dark sky';
  if (m < 9.5) return 'Binoculars';
  if (m < 13.5) return 'Small telescope';
  if (m < 17) return 'Large telescope';
  return 'Beyond amateur telescopes';
}

// Relative time from now: "in 2h 10m" / "40m ago".
export function rel(d, now = new Date()) {
  const m = Math.round((d - now) / 60000); const a = Math.abs(m);
  const t = a >= 1440 ? `${Math.round(a / 1440)}d` : a >= 60 ? `${Math.floor(a / 60)}h ${a % 60}m` : `${a}m`;
  return m >= 0 ? `in ${t}` : `${t} ago`;
}

export function row(k, v) { return `<div class="row"><span class="k">${esc(k)}</span><span class="v">${v}</span></div>`; }
