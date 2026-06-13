import { lightTimeSeconds, apparentMagnitude } from '../astronomy/photometry.js';

const AU_KM = 149597870.7;

function lightTimeText(distAU) {
  const s = lightTimeSeconds(distAU);
  const h = s / 3600;
  if (h >= 1) return `${h.toFixed(1)} light-hours`;
  return `${(s / 60).toFixed(1)} light-minutes`;
}

// Build the list of {label, value} rows for the stats panel (pure).
export function formatLiveStats(body, live) {
  const mag = apparentMagnitude(body.H, live.rHelio, live.distAU);
  const f = body.facts;
  return [
    { label: 'Distance from Earth', value:
      `${live.distAU.toFixed(1)} AU  (${(live.distAU * AU_KM).toExponential(2)} km)` },
    { label: 'Light-time', value: lightTimeText(live.distAU) },
    { label: 'Direction', value: `az ${live.az.toFixed(0)}deg, alt ${live.alt.toFixed(0)}deg` },
    { label: 'RA / Dec', value: `${live.ra.toFixed(1)}deg / ${live.dec.toFixed(1)}deg` },
    { label: 'Above horizon?', value:
      live.alt >= 0 ? `Yes (${live.alt.toFixed(0)}deg up)` : `No (${(-live.alt).toFixed(0)}deg below)` },
    { label: 'Apparent magnitude', value: `~${mag.toFixed(1)} (far too faint to see)` },
    { label: 'Diameter', value: `${f.diameterKm} km` },
    { label: 'Orbital period', value: `${f.periodYears} years` },
    { label: 'Perihelion / aphelion', value: `${f.perihelionAU} / ${f.aphelionAU} AU` },
    { label: 'Surface temp', value: `${f.surfaceTempK} K` },
    { label: 'Discovered', value: f.discovery },
    { label: 'Next perihelion', value: f.nextPerihelion },
  ];
}

// Render rows into the panel element and reveal it (DOM glue).
export function showPanel(panelEl, body, live) {
  const rows = formatLiveStats(body, live);
  panelEl.innerHTML =
    `<h2>${body.name}</h2><p class="blurb">${body.facts.blurb}</p>` +
    rows.map((r) =>
      `<div class="row"><span class="label">${r.label}</span><span>${r.value}</span></div>`
    ).join('');
  panelEl.classList.remove('hidden');
}

export function hidePanel(panelEl) { panelEl.classList.add('hidden'); }
