// "Find" sheet: search every object, grouped by kind.
import * as F from './format.js';

const GROUPS = [
  ['all', 'All'], ['solar', 'Solar system'], ['far', 'Far frontier'], ['stars', 'Stars'], ['dso', 'Deep sky'], ['con', 'Constellations'], ['sat', 'Satellites'],
];

export function searchIndex(model) {
  const items = [];
  for (const b of model.solar) items.push({ obj: b, g: 'solar', name: b.name, sub: b.kind === 'planet' ? 'Planet' : b.kind === 'moon' ? 'Moon' : 'Star', keys: b.name });
  for (const t of model.tnos) items.push({ obj: t, g: 'far', name: t.name, sub: `Dwarf planet · ${t.el.designation}`, keys: `${t.name} ${t.el.designation}` });
  for (const s of model.starInfo) if (s.proper || s.mag < 3.5) items.push({ obj: s, g: 'stars', name: s.proper || s.designation, sub: `${s.proper ? s.designation + ' · ' : ''}mag ${s.mag.toFixed(1)}`, keys: `${s.proper} ${s.proper === 'Polaris' ? 'north star pole star' : ''} ${s.designation} ${s.hip ? 'hip ' + s.hip : ''}` });
  for (const d of model.dsos) items.push({ obj: d, g: 'dso', name: d.name ? `${d.code} · ${d.name}` : d.code, sub: `${d.type}${d.ngc ? ' · ' + d.ngc : ''}`, keys: `${d.code} ${d.name} ${d.ngc} ${d.type}` });
  for (const c of model.cons) items.push({ obj: c, g: 'con', name: c.name, sub: c.meaning, keys: `${c.name} ${c.meaning} ${c.abbr}` });
  for (const s of model.sats) items.push({ obj: s, g: 'sat', name: s.name, sub: `Satellite · NORAD ${s.norad}`, keys: `${s.name} ${s.fullName} ${s.norad}` });
  for (const it of items) it.k = it.keys.toLowerCase();
  return items;
}

export function renderFind(state) {
  return `<p class="kicker">Search</p><h2 class="title">Find</h2>
    <input class="search" id="findInput" type="search" placeholder="Saturn, Vega, M31, Orion, ISS…" autocomplete="off" autocorrect="off" spellcheck="false" value="${F.esc(state.findQuery)}" />
    <div class="chips" id="findChips">${GROUPS.map(([k, n]) => `<button data-g="${k}" class="${state.findGroup === k ? 'on' : ''}">${n}</button>`).join('')}</div>
    <div id="findList"></div>`;
}

export function renderFindList(index, state) {
  const q = state.findQuery.trim().toLowerCase();
  let list = index.filter((it) => (state.findGroup === 'all' || it.g === state.findGroup) && (!q || it.k.includes(q)));
  if (q) list.sort((a, b) => (b.name.toLowerCase().startsWith(q) - a.name.toLowerCase().startsWith(q)));
  else if (state.findGroup === 'all') list = list.filter((it) => it.g !== 'sat' || it.obj.featured).filter((it) => it.g !== 'stars' || it.obj.mag < 1.6).filter((it) => it.g !== 'dso' || it.obj.mag < 5);
  // Up-first so the list is useful right now.
  list.sort((a, b) => ((b.obj.alt ?? altOf(b.obj)) > 0) - ((a.obj.alt ?? altOf(a.obj)) > 0));
  return list.slice(0, 120).map((it) => {
    const alt = it.obj.alt ?? altOf(it.obj);
    const up = alt > 0;
    return `<button class="item" data-open="${it.obj.id}"><span class="n">${F.esc(it.name)}</span><span class="d">${F.esc(it.sub)}</span><span class="m ${up ? 'up' : ''}"><b>${up ? F.deg(alt) : 'below'}</b>${up ? F.compass(it.obj.az ?? azOf(it.obj)) : 'horizon'}</span></button>`;
  }).join('') || '<p class="note">Nothing matches.</p>';
}

function altOf(o) { const v = o.enu; return v ? Math.asin(Math.max(-1, Math.min(1, v[2]))) * 180 / Math.PI : -90; }
function azOf(o) { const v = o.enu; return v ? (Math.atan2(v[0], v[1]) * 180 / Math.PI + 360) % 360 : 0; }
