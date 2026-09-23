"""Sedna's reflectance spectrum from public JWST data.

Data: JWST program 1272, NIRSpec IFU prism, observed 2022-09-13 (MAST level-3 s3d cube).
Extraction is our own: the archive x1d uses an aperture ~3 spaxels off Sedna's position and no
background subtraction, which inflates the spectrum past ~4.5 um. We centroid Sedna on a
1.0-2.0 um white-light image, sum a circular aperture whose radius grows with the PSF
(r = max(2.5, 1.5 * lambda/D) spaxels) and subtract the median of an annulus (r+2 .. r+6).
Reflectance = Sedna's flux / the Sun's flux at the same wavelength, normalised to 1 at 1.25 um.
Both are brought to F_nu (Jy-like) units first:  F_nu = F_lambda * lambda^2 / c.
Sun: STScI CALSPEC sun_mod_001 (model solar spectrum, 0.15-300 um), smoothed to roughly the
prism's resolution before dividing. (An earlier version used a 5772 K blackbody past 2.6 um; the
real Sun is ~18% fainter than that blackbody at 4.5-5 um relative to 2.5 um.)

Output: data/lab/sedna_spectrum.json
Run on Solace:  ~/sednalab/.venv/bin/python lab/sedna_jwst.py <out_dir> <work_dir>
"""
import json, sys, os, glob
import numpy as np
from astropy.io import fits
from astroquery.mast import Observations

out_dir = sys.argv[1] if len(sys.argv) > 1 else "."
work = sys.argv[2] if len(sys.argv) > 2 else "."
os.makedirs(work, exist_ok=True)

s3d = glob.glob(os.path.join(work, "jwst/**/*prism-clear_s3d.fits"), recursive=True)
if not s3d:
    obs = Observations.query_criteria(obs_collection="JWST", target_name="SEDNA", calib_level=3)
    p = Observations.filter_products(Observations.get_product_list(obs), productSubGroupDescription=["S3D"], calib_level=[3])
    Observations.download_products(p, download_dir=os.path.join(work, "jwst"))
    s3d = glob.glob(os.path.join(work, "jwst/**/*prism-clear_s3d.fits"), recursive=True)
cub = fits.open(s3d[0])
cube = np.array(cub["SCI"].data, float)          # MJy/sr per spaxel
cerr = np.array(cub["ERR"].data, float)
hd = cub["SCI"].header
w = hd["CRVAL3"] + (np.arange(cube.shape[0]) + 1 - hd["CRPIX3"]) * hd["CDELT3"]
pix_sr = hd["PIXAR_SR"]                            # steradians per spaxel
nz, ny, nx = cube.shape
yy, xx = np.mgrid[0:ny, 0:nx]

# Centroid on a white-light image where Sedna is brightest (1-2 um).
white = np.nansum(cube[(w > 1.0) & (w < 2.0)], axis=0)
py, px = np.unravel_index(np.nanargmax(white), white.shape)
box = (abs(yy - py) <= 3) & (abs(xx - px) <= 3) & np.isfinite(white)
wt = np.clip(white * box, 0, None)
cy, cx = (yy * wt).sum() / wt.sum(), (xx * wt).sum() / wt.sum()
rr = np.hypot(yy - cy, xx - cx)

f = np.full(nz, np.nan); e = np.full(nz, np.nan)
spax_arcsec = abs(hd["CDELT1"]) * 3600
for k in range(nz):
    lam = w[k]
    r = max(2.5, 1.5 * (lam * 1e-6 / 6.5) * 206265 / spax_arcsec)   # 1.5 x lambda/D, in spaxels
    ap, an = rr <= r, (rr > r + 2) & (rr <= r + 6)
    plane, eplane = cube[k], cerr[k]
    good_an = an & np.isfinite(plane)
    if (ap & np.isfinite(plane)).sum() < 5 or good_an.sum() < 10:
        continue
    bkg = np.nanmedian(plane[good_an])
    npx = (ap & np.isfinite(plane)).sum()
    f[k] = (np.nansum(plane[ap]) - bkg * npx) * pix_sr * 1e6           # MJy/sr * sr -> Jy
    e[k] = np.sqrt(np.nansum(eplane[ap] ** 2)) * pix_sr * 1e6
ok = np.isfinite(f) & (f > 0) & np.isfinite(e) & (w > 0.65) & (w < 5.2)
w, f, e = w[ok], f[ok], e[ok]
print("centroid", round(cx, 2), round(cy, 2), "spaxel", round(spax_arcsec, 3), "arcsec")

# --- Sun in F_nu on Sedna's grid ---
sun_path = os.path.join(work, "sun_mod_001.fits")
s = fits.open(sun_path)[1].data
sw = np.array(s["WAVELENGTH"], float) / 1e4     # A -> um
sfl = np.array(s["FLUX"], float)                # erg/s/cm2/A
c = 2.99792458e18                               # A/s
sfnu = sfl * (sw * 1e4) ** 2 / c                # erg/s/cm2/Hz (scale is irrelevant after normalising)

# Smooth to ~prism resolution: box of width lambda/R with R rising ~30 -> ~300 across the band.
def R_prism(lam):
    return np.interp(lam, [0.6, 1.2, 2.0, 3.0, 4.0, 5.3], [80, 30, 60, 120, 200, 300])

sun = np.empty_like(w)
for i, lam in enumerate(w):
    half = lam / R_prism(lam) / 2
    m = (sw > lam - half) & (sw < lam + half)
    sun[i] = np.mean(sfnu[m]) if m.any() else np.interp(lam, sw, sfnu)

refl = f / sun
norm = np.median(refl[(w > 1.2) & (w < 1.3)])
refl, rerr = refl / norm, (e / sun) / norm

# Near-IR slope (0.7-1.2 um), % per 100 nm, from a straight-line fit - comparable in spirit to MBOSS.
m = (w > 0.7) & (w < 1.2)
k, b = np.polyfit(w[m], refl[m], 1)
slope_pct_100nm = 100 * (k * 0.1) / np.interp(0.95, w, refl)

# Band markers: laboratory positions of ices reported on Sedna and similar bodies.
bands = [
    {"um": 1.67, "label": "CH4", "note": "methane ice"},
    {"um": 2.20, "label": "CH4", "note": "methane ice"},
    {"um": 2.32, "label": "CH4", "note": "methane ice"},
    {"um": 2.27, "label": "C2H6", "note": "ethane ice"},
    {"um": 3.35, "label": "C2H6", "note": "ethane ice (C-H stretch)"},
    {"um": 4.27, "label": "CO2", "note": "carbon dioxide ice"},
    {"um": 3.0,  "label": "H2O", "note": "water ice (broad)"},
]

# The archive's own 1-D spectrum, same Sun, for the before/after comparison.
archive = []
x1d = glob.glob(os.path.join(work, "jwst/**/*prism-clear_x1d.fits"), recursive=True)
if x1d:
    xd = fits.open(x1d[0])[1].data
    aw, af = np.array(xd["WAVELENGTH"], float), np.array(xd["FLUX"], float)
    ok2 = np.isfinite(af) & (af > 0) & (aw > 0.65) & (aw < 5.2)
    aw, af = aw[ok2], af[ok2]
    ar = af / np.interp(aw, w, sun)
    ar /= np.median(ar[(aw > 1.2) & (aw < 1.3)])
    st2 = max(1, len(aw) // 150)
    archive = [[round(float(a_), 4), round(float(r_), 4)] for a_, r_ in zip(aw[::st2], ar[::st2])]

# Downsample for the phone: ~300 points.
step = max(1, len(w) // 300)
pts = [[round(float(a), 4), round(float(r), 4), round(float(er), 4)] for a, r, er in zip(w[::step], refl[::step], rerr[::step])]
out = {
    "source": "JWST program 1272, NIRSpec IFU prism, 2022-09-13 (MAST s3d cube, own aperture extraction with background annulus)",
    "sun": "CALSPEC sun_mod_001 model solar spectrum, smoothed to prism resolution",
    "normalisedAt": 1.25,
    "slope07_12": round(float(slope_pct_100nm), 1),
    "points": pts,
    "archive": archive,
    "bands": bands,
    "note": "Archive x1d rises past ~4.5 um (off-centre aperture, no background); own extraction removes it.",
}
path = os.path.join(out_dir, "sedna_spectrum.json")
with open(path, "w") as fh:
    json.dump(out, fh, separators=(",", ":"))
print("wrote", path, len(pts), "points; 0.7-1.2 um slope", round(float(slope_pct_100nm), 1), "%/100nm")
