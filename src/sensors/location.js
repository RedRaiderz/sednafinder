// Observer location: GPS when allowed, otherwise the last saved place or a preset.
// { lat, lon } in degrees, longitude east-positive.
export const PRESETS = [
  { lat: 33.749, lon: -84.388, label: 'Atlanta' },
  { lat: 40.4237, lon: -86.9212, label: 'West Lafayette' },
];

export async function getLocation(ask = true) {
  if (!navigator.geolocation) return null;
  try {
    const pos = await new Promise((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: false, timeout: ask ? 12000 : 6000, maximumAge: 10 * 60000,
      })
    );
    return { lat: pos.coords.latitude, lon: pos.coords.longitude, elev: pos.coords.altitude || 0, label: 'GPS' };
  } catch {
    return null;
  }
}

export function loadSavedLocation() {
  try { const l = JSON.parse(localStorage.getItem('sf.loc') || 'null'); return l && Number.isFinite(l.lat) ? l : null; } catch { return null; }
}
export function saveLocation(loc) {
  try { localStorage.setItem('sf.loc', JSON.stringify(loc)); } catch { /* storage blocked */ }
}
