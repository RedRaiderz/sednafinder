"""Survey: every public JWST NIRSpec prism IFU cube of a Kuiper-belt object or centaur.

For each target: download the level-3 s3d cube (+ archive x1d), extract our own spectrum
(centroid near the archive's position, PSF-scaled aperture, annulus background), divide by the
Sun (CALSPEC sun_mod_001, smoothed to prism resolution), and measure:
  slope      near-IR spectral slope 0.7-1.2 um, % per 100 nm (normalised at 0.95 um)
  d23        band depth near 2.3 um (CH4 / C2H6 / CH-bearing organics)
  r30        reflectance at 3.0 um relative to 2.5 um (water ice / organics trough; lower = deeper)
  dco2       band depth of CO2 ice at 4.27 um
  art        archive-vs-own shape mismatch: (archive/own at 4.6-5.1 um) / (same at 1.2-1.3 um) - 1  (0 = agree)
  offset     distance in spaxels between the archive's extraction centre and our centroid
Band depth D = 1 - R_band / R_continuum, continuum = straight line between the two shoulders.

Output: <out>/survey.json  (+ per-target reflectance in <out>/spectra/)
Run on Solace:  ~/sednalab/.venv/bin/python survey.py out .   [--workers 8]
"""
import json, os, sys, glob, re, traceback
from multiprocessing import Pool
import numpy as np
from astropy.io import fits
from astroquery.mast import Observations

OUT = sys.argv[1] if len(sys.argv) > 1 else "out"
WORK = sys.argv[2] if len(sys.argv) > 2 else "."
WORKERS = int(sys.argv[sys.argv.index("--workers") + 1]) if "--workers" in sys.argv else 8
# Outer-solar-system programs (moons, comets, Trojans, near-Earth objects excluded).
PROGRAMS = ["1191", "1231", "1254", "1272", "1273", "1444", "2418", "2550", "2869", "3991", "4665", "5940"]
SKIP_TARGET = re.compile(r"OFFSET|BKG|SKY|COPY", re.I)

os.makedirs(os.path.join(OUT, "spectra"), exist_ok=True)
DL = os.path.join(WORK, "survey_dl")

# ---------- Sun ----------
s = fits.open(os.path.join(WORK, "sun_mod_001.fits"))[1].data
SW = np.array(s["WAVELENGTH"], float) / 1e4
SF = np.array(s["FLUX"], float) * (SW * 1e4) ** 2 / 2.99792458e18


def R_prism(lam):
    return np.interp(lam, [0.6, 1.2, 2.0, 3.0, 4.0, 5.3], [80, 30, 60, 120, 200, 300])


def sun_on(w):
    out = np.empty_like(w)
    for i, lam in enumerate(w):
        h = lam / R_prism(lam) / 2
        m = (SW > lam - h) & (SW < lam + h)
        out[i] = SF[m].mean() if m.any() else np.interp(lam, SW, SF)
    return out


# ---------- extraction ----------
def extract(cube_path, hint=None):
    c = fits.open(cube_path)
    cube = np.array(c["SCI"].data, float)
    err = np.array(c["ERR"].data, float)
    hd = c["SCI"].header
    w = hd["CRVAL3"] + (np.arange(cube.shape[0]) + 1 - hd["CRPIX3"]) * hd["CDELT3"]
    pix_sr = hd.get("PIXAR_SR") or (abs(hd["CDELT1"]) * np.pi / 180) ** 2
    nz, ny, nx = cube.shape
    yy, xx = np.mgrid[0:ny, 0:nx]
    white = np.nansum(cube[(w > 1.0) & (w < 2.0)], axis=0)
    hx, hy = hint if hint else (nx / 2 - 0.5, ny / 2 - 0.5)
    near = np.hypot(yy - hy, xx - hx) <= 8
    wl = np.where(near & np.isfinite(white), white, -np.inf)
    py, px = np.unravel_index(np.argmax(wl), wl.shape)
    box = (abs(yy - py) <= 3) & (abs(xx - px) <= 3) & np.isfinite(white)
    wt = np.clip(np.where(box, white, 0), 0, None)
    if wt.sum() <= 0:
        return None
    cy, cx = (yy * wt).sum() / wt.sum(), (xx * wt).sum() / wt.sum()
    rr = np.hypot(yy - cy, xx - cx)
    spax = abs(hd["CDELT1"]) * 3600
    f = np.full(nz, np.nan); e = np.full(nz, np.nan)
    for k in range(nz):
        r = max(2.5, 1.5 * (w[k] * 1e-6 / 6.5) * 206265 / spax)
        ap, an = rr <= r, (rr > r + 2) & (rr <= r + 6)
        pl = cube[k]
        ga = an & np.isfinite(pl); gp = ap & np.isfinite(pl)
        if gp.sum() < 5 or ga.sum() < 10:
            continue
        f[k] = (np.nansum(pl[gp]) - np.nanmedian(pl[ga]) * gp.sum()) * pix_sr * 1e6   # MJy/sr * sr -> Jy
        e[k] = np.sqrt(np.nansum(err[k][gp] ** 2)) * pix_sr * 1e6
    return w, f, e, (cx, cy)


def band_depth(w, r, band, left, right):
    def med(lo, hi):
        m = (w > lo) & (w < hi) & np.isfinite(r)
        return (np.median(w[m]), np.median(r[m])) if m.sum() >= 2 else (None, None)
    (wl, rl), (wr, rr_), (wb, rb) = med(*left), med(*right), med(*band)
    if None in (wl, wr, wb) or rl is None:
        return None
    cont = rl + (rr_ - rl) * (wb - wl) / (wr - wl)
    return float(1 - rb / cont) if cont > 0 else None


def reflect(w, f, e, sun):
    ok = np.isfinite(f) & (f > 0) & (w > 0.65) & (w < 5.2)
    w, f, e, sun = w[ok], f[ok], e[ok], sun[ok]
    r = f / sun
    n = np.median(r[(w > 1.2) & (w < 1.3)])
    return w, r / n, e / sun / n


def process(item):
    name, cube_path, x1d_path = item
    try:
        hint = None; arch = None
        if x1d_path:
            xh = fits.open(x1d_path)
            ex, ey = xh[1].header.get("EXTR_X"), xh[1].header.get("EXTR_Y")
            if ex is not None and ey is not None:
                hint = (float(ex), float(ey))
            arch = (np.array(xh[1].data["WAVELENGTH"], float), np.array(xh[1].data["FLUX"], float))
        res = extract(cube_path, hint)
        if res is None:
            return {"name": name, "error": "no source"}
        w, f, e, (cx, cy) = res
        sun = sun_on(w)
        w2, r, re_ = reflect(w, f, e, sun)
        snr = float(np.nanmedian((f / e)[(w > 1.0) & (w < 2.0)]))
        m = (w2 > 0.7) & (w2 < 1.2)
        k, _ = np.polyfit(w2[m], r[m], 1)
        slope = float(100 * k * 0.1 / np.interp(0.95, w2, r))
        d23 = band_depth(w2, r, (2.28, 2.36), (2.10, 2.18), (2.45, 2.55))
        r30 = float(np.median(r[(w2 > 2.95) & (w2 < 3.05)]) / np.median(r[(w2 > 2.45) & (w2 < 2.55)]))
        dco2 = band_depth(w2, r, (4.25, 4.29), (4.14, 4.21), (4.33, 4.40))
        art = None; offset = None
        if arch is not None:
            aw, af = arch
            okk = np.isfinite(af) & (af > 0)
            own_at = np.interp(aw[okk], w[np.isfinite(f)], f[np.isfinite(f)])
            ratio = af[okk] / own_at
            mm = (aw[okk] > 4.6) & (aw[okk] < 5.1); mn = (aw[okk] > 1.2) & (aw[okk] < 1.3)
            if mm.sum() > 5 and mn.sum() > 2:
                art = float(np.median(ratio[mm]) / np.median(ratio[mn]) - 1)   # shape mismatch, scale-free
            if hint:
                offset = float(np.hypot(hint[0] - cx, hint[1] - cy))
        step = max(1, len(w2) // 250)
        safe = re.sub(r"[^A-Za-z0-9_-]", "_", name)
        with open(os.path.join(OUT, "spectra", safe + ".json"), "w") as fh:
            json.dump([[round(float(a), 4), round(float(b), 4)] for a, b in zip(w2[::step], r[::step])], fh)
        return {"name": name, "file": os.path.basename(cube_path), "snr": round(snr, 1), "slope": round(slope, 1),
                "d23": None if d23 is None else round(d23, 3), "r30": round(r30, 3),
                "dco2": None if dco2 is None else round(dco2, 3),
                "art": None if art is None else round(art, 3), "offset": None if offset is None else round(offset, 2),
                "centroid": [round(cx, 2), round(cy, 2)], "spectrum": safe + ".json"}
    except Exception as ex:
        return {"name": name, "error": f"{type(ex).__name__}: {ex}", "trace": traceback.format_exc()[-400:]}


def main():
    obs = Observations.query_criteria(obs_collection="JWST", instrument_name="NIRSPEC/IFU", filters="CLEAR;PRISM",
                                      calib_level=3, dataproduct_type="cube", proposal_id=PROGRAMS)
    obs = obs[[not SKIP_TARGET.search(str(t)) for t in obs["target_name"]]]
    print("observations:", len(obs), "targets:", len(set(obs["target_name"])), flush=True)
    items = []
    for row in obs:
        name = str(row["target_name"]); prog = str(row["proposal_id"])
        prods = Observations.get_product_list(row)
        prods = Observations.filter_products(prods, calib_level=[3], productSubGroupDescription=["S3D", "X1D"])
        if len(prods) == 0:
            continue
        man = Observations.download_products(prods, download_dir=DL)
        paths = [str(p) for p in man["Local Path"] if str(p).endswith(".fits")]
        cubes = [p for p in paths if p.endswith("_s3d.fits")]
        x1ds = [p for p in paths if p.endswith("_x1d.fits")]
        for cp in cubes:
            stem = cp[:-9]
            x1 = next((x for x in x1ds if x.startswith(stem)), None)
            items.append((f"{name}|{prog}", cp, x1))
        print("downloaded", name, prog, len(cubes), "cube(s)", flush=True)
    print("processing", len(items), "cubes with", WORKERS, "workers", flush=True)
    with Pool(WORKERS) as pool:
        results = pool.map(process, items)
    # keep the best-S/N cube per target
    best = {}
    for r in results:
        key = r["name"].split("|")[0]
        if "error" in r:
            best.setdefault(key, r); continue
        if key not in best or "error" in best[key] or r["snr"] > best[key]["snr"]:
            best[key] = r
    out = {"programs": PROGRAMS, "cubes": len(items), "targets": sorted(best.values(), key=lambda r: -(r.get("slope") or -99))}
    with open(os.path.join(OUT, "survey.json"), "w") as fh:
        json.dump(out, fh, indent=1)
    ok = [r for r in best.values() if "error" not in r]
    print("done:", len(ok), "ok,", len(best) - len(ok), "failed", flush=True)


if __name__ == "__main__":
    main()
