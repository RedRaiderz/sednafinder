"""Reddest measured outer-solar-system bodies, from the MBOSS-2 colour compilation.

Source: Hainaut, Boehnhardt & Protopapa 2012, A&A 546, A115 (VizieR J/A+A/546/A115).
The number ranked is the spectral gradient S in % per 100 nm: how much more light the surface
reflects at longer wavelengths, per 100 nm, relative to its reflectance in the visible.
    S = (dR/dlambda) / R  * 100%  (per 100 nm)
where R(lambda) is reflectance = (object flux / solar flux), normalised. From two broadband colours
    R2/R1 = 10^(-0.4 * [(m1 - m2)_object - (m1 - m2)_sun])
and the slope follows from a straight-line fit of R against filter wavelength.

Output: data/lab/reddest.json
Run on Solace:  ~/sednalab/.venv/bin/python lab/reddest.py <out_dir>
"""
import json, sys, math, re
import numpy as np
from astroquery.vizier import Vizier

Vizier.ROW_LIMIT = -1
t = Vizier.get_catalogs("J/A+A/546/A115")[0]

rows = []
for r in t:
    g = float(r["Grad"]) if r["Grad"] is not np.ma.masked else math.nan
    if not math.isfinite(g):
        continue
    e = float(r["e_Grad"]) if r["e_Grad"] is not np.ma.masked else 0.0
    n = int(r["NEp"]) if r["NEp"] is not np.ma.masked else 0
    name = str(r["Name"]).replace("-", " ", 1) if str(r["Name"])[0].isdigit() else str(r["Name"])
    name = re.sub(r"\b(\d{4})([A-Z]{2}\d*)\b", r"\1 \2", name)   # 1995DB2 -> 1995 DB2
    rows.append({
        "name": name, "cls": str(r["Class"]), "S": round(g, 2), "err": round(e, 2), "epochs": n,
        # "solid" = several independent measurements with a real error bar
        "solid": bool(n >= 3 and e > 0),
    })

rows.sort(key=lambda x: -x["S"])
for i, x in enumerate(rows):
    x["rank"] = i + 1
# Ranking by the conservative end of the error bar (S - err), solid measurements only.
solid = sorted([x for x in rows if x["solid"]], key=lambda x: -(x["S"] - x["err"]))
for i, x in enumerate(solid):
    x["solidRank"] = i + 1

out = {
    "source": "MBOSS-2: Hainaut, Boehnhardt & Protopapa 2012, A&A 546, A115",
    "unit": "% per 100 nm",
    "count": len(rows),
    "solidCount": len(solid),
    "rows": rows,
}
path = (sys.argv[1] if len(sys.argv) > 1 else ".") + "/reddest.json"
with open(path, "w") as f:
    json.dump(out, f, separators=(",", ":"))
print("wrote", path, len(rows), "objects;", len(solid), "solid")
for x in solid[:5]:
    print(x["solidRank"], x["name"], x["S"], "+/-", x["err"], x["epochs"], "epochs")
