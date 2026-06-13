// Resolve the observer's location. Tries GPS; falls back to a manual prompt.
// Returns { lat, lon } in degrees (lon east-positive).
export async function getLocation() {
  if (navigator.geolocation) {
    try {
      const pos = await new Promise((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false, timeout: 8000, maximumAge: 600000,
        })
      );
      return { lat: pos.coords.latitude, lon: pos.coords.longitude };
    } catch {
      /* fall through to manual */
    }
  }
  return manualLocation();
}

function manualLocation() {
  const raw = window.prompt(
    'Location unavailable. Enter "latitude, longitude" (e.g. 47.6, -122.3):',
    '0, 0'
  );
  const [lat, lon] = (raw || '0,0').split(',').map((s) => parseFloat(s.trim()));
  return { lat: Number.isFinite(lat) ? lat : 0, lon: Number.isFinite(lon) ? lon : 0 };
}
