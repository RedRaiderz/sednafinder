// "Lab" sheet: a pointer to the separate Sedna Lab project (Reddest Worlds). The analysis and its
// pipeline live in the sednalab repo; this app stays a sky viewer.
export const LAB_URL = 'https://claude.ai/artifact/CFqjMTjRaKiCon1AfUDXcD';

export async function renderLab() {
  return `<p class="kicker">Sedna Lab</p><h2 class="title">Reddest Worlds</h2>
    <p class="subtitle">Every public JWST spectrum of a Kuiper-belt object or centaur, re-processed from the raw data and ranked by colour.</p>
    <div class="row"><span class="k">Sedna, JWST infrared redness</span><span class="v">#11 of 99</span></div>
    <div class="row"><span class="k">Most reliably red, visible light</span><span class="v">5145 Pholus</span></div>
    <div class="row"><span class="k">Ground vs JWST redness agree</span><span class="v">r = 0.80</span></div>
    <div class="actions"><a class="solid" href="${LAB_URL}" target="_blank" rel="noopener" style="text-decoration:none;display:inline-block">Open Reddest Worlds</a></div>
    <p class="note">Opens the full site: rankings by colour, every spectrum, the four spectral families, and the archive background fix.</p>`;
}
