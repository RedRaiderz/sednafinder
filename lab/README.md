# SednaFinder Lab

Hobby analysis on public astronomy data. Runs on Solace, writes small JSON files to `data/lab/`,
which the app's **Lab** tab displays.

| Script | Data | Output |
|---|---|---|
| `reddest.py` | MBOSS-2 colour compilation (Hainaut et al. 2012, VizieR J/A+A/546/A115) | `reddest.json`: 417 bodies ranked by spectral slope; "solid" = ≥3 measurements with a real error bar, ranked by S − err |
| `sedna_jwst.py` | JWST program 1272 NIRSpec IFU prism cube (MAST) + CALSPEC `sun_mod_001` | `sedna_spectrum.json`: reflectance 0.65–5.2 µm from our own aperture extraction |

## Run (on Solace)

```sh
cd ~/sednalab                      # venv lives here: .venv (numpy, scipy, astropy, astroquery)
.venv/bin/python reddest.py out
.venv/bin/python sedna_jwst.py out .   # needs sun_mod_001.fits in . (curl from archive.stsci.edu calspec)
# then copy out/*.json into the repo's data/lab/
```

## Findings so far (2026-09-22)

- Among the 152 well-measured bodies, **5145 Pholus** is the most reliably red (S = 48.3 ± 1.9 %/100 nm, 41 epochs).
  The single highest value, 1995 DB2 (54.3), rests on 2 measurements with no error estimate.
- **Sedna**: S = 31.0 ± 2.5, rank 17 of 152 solid (50 of 417 overall).
- The archive's automatic Sedna spectrum (x1d) rises steeply past 4.5 µm. Cause: its extraction aperture sits ~3 spaxels
  from Sedna's centroid (22.2, 26.2) and no background is subtracted. Re-extracting from the cube with a centred,
  PSF-scaled aperture and an annulus background gives a flat continuum there; below 4 µm the two agree.

## Open questions (the part to work through by hand)

1. Derive S from two colours yourself for Sedna (B−V, V−R in MBOSS) and check it against the catalogue's 31.
2. Why does the near-IR slope (0.7–1.2 µm, ~10 %/100 nm) come out lower than the visible slope (~31)?
3. Identify which dips in the spectrum are real ice bands: compare positions with lab spectra of CH₄, C₂H₆, CO₂, H₂O.
4. Compare our spectrum with the published analysis of the same data (Emery et al. 2024, JWST spectra of Sedna, Gonggong, Quaoar).
