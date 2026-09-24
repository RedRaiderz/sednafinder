// "Lab" sheet: the switch over to SednaLab, the separate experiments site. This app stays the sky
// viewer; the analysis, simulations and their pipeline live in the sednalab repo.
export const LAB_URL = 'https://claude.ai/artifact/65svqNMTcngr6T4jkuJfvP';

export async function renderLab() {
  return `<div class="app-switch" role="group" aria-label="Switch app">
      <span class="on">SednaFinder</span><a href="${LAB_URL}" target="_blank" rel="noopener">SednaLab ↗</a>
    </div>
    <p class="kicker">SednaLab</p><h2 class="title">The experiments</h2>
    <p class="subtitle">Independent hobby tests on public telescope data, computed on Solace. Its own site, with its own red.</p>
    <div class="row"><span class="k">Reddest Worlds</span><span class="v">complete · Sedna #11 of 99</span></div>
    <div class="row"><span class="k">Sedna's orbit</span><span class="v">next · simulation queued</span></div>
    <div class="actions"><a class="solid" href="${LAB_URL}" target="_blank" rel="noopener" style="text-decoration:none;display:inline-block">Open SednaLab</a></div>`;
}
