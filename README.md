# SednaFinder

A field chart for the whole sky that runs in the browser and installs to a phone's home screen.
Point the phone up and it overlays what's there; or drag the chart around by hand.

**Live:** https://redraiderz.github.io/sednafinder/

- **Sky** — ~5,000 stars (to mag 6), 88 constellations, 110 Messier + showpiece deep-sky objects, Sun / Moon (with phase) / planets, the ISS and ~150 bright satellites live, and seven far-frontier dwarf planets led by Sedna. Stereographic chart for browsing, camera-matched gnomonic view for pointing.
- **Tap anything** — magnitude, distance, light-time, rise / highest / set for the current pass, RA/Dec and alt/az, physical facts, satellite passes.
- **Tonight** — twilight timeline, Moon phase and moonless-dark hours, which planets are up in the dark and when they're best, visible ISS passes, deep-sky picks, far-frontier positions, and the next year's events (eclipses, oppositions, elongations, meteor showers, equinoxes).
- **Find** — search every object; "Point me there" puts an arrow on screen until you're on it.
- **Time travel** — tap the clock: scrub ±12 h, step by hours/days, or play the sky forward.
- **Night vision**, compass trim calibration, camera FOV calibration, layer toggles, magnitude limit. Works offline after first load.

## Getting it on the iPhone
Open the live link in **Safari** → Share → **Add to Home Screen**. Launch it from the icon, tap *Point at the sky*, and allow Motion, Camera and Location.

## Dev
No build step. `python -m http.server` in the repo root and open it (sensors need HTTPS on a phone — use the Pages URL).
`node --test` runs the astronomy/projection tests. `node tools/build-data.mjs` rebuilds `data/*.json` from raw catalogues placed in `tools/raw/` (HYG v4.1 CSV, Stellarium modern `index.json`, OpenNGC `NGC.csv` + `addendum.csv`).

Credits: [astronomy-engine](https://github.com/cosinekitty/astronomy) (MIT), [satellite.js](https://github.com/shashwatak/satellite-js) (MIT), HYG database (CC BY-SA), Stellarium sky cultures, OpenNGC (CC BY-SA), CelesTrak TLEs, JPL SBDB elements.
