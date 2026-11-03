"""
build_rising.py -- Part 6: the Rising Neighborhood Score.

Implements every item in MA491/rising-neighborhood-score-change-log.md. The project now asks:
for an officer on PCS orders to NYC, which neighborhoods are good places to live AND likely to
see home values beat the city's over a 3-year tour?

  Outcome   y = log(P[t+3] / P[t]) - the same for the whole city, in log points (~%).
            P[s] = median sale price per unit of 1-3 family homes, sales >= $10k, pooled over
            the two calendar years s-1 and s, and only where the area has MIN_SALES+ sales.
            Continuous: no tipping label, no at-risk set, no hazard rows.
  Unit      2010 Neighborhood Tabulation Areas (NTAs), the lines Part 4-5's tracts nest in.
  Timing    the price the outcome starts from is built from sales in t-1 and t. Every input closes by
            t-2 (signals: mean of t-3 and t-2; ACS: the 5-year release ending t-2; own momentum:
            P[t-5] -> P[t-2]). No input shares a single sale or survey year with the outcome.
  Model B   linear regression: start-year intercepts + starting levels + momentum + signals.
  Model C   B + neighbors' momentum (average) + the Gap (hottest neighbor minus own) + an ICAR
            place effect u (penalized least squares = posterior mode of the Gaussian CAR model).
  Score     the predicted 3-year appreciation vs the city, ranked 0-100 across NTAs that year.
  Test      rolling origin: to score start year t, train only on start years whose 3-year
            outcome was finished by t (t' <= t-3). Choices are made on 2017-18, reported on 2019-22.

Livability filters (commute, crime, parks, price cap, noise caps) are NOT model inputs; the page
applies them after scoring: Score -> Rank -> Filter.

Needs numpy, scipy, shapely, xlrd, openpyxl and the Census key. Pulls live in rns_pulls.py.
Usage:  python rns_pulls.py   (first, slow)   then   python build_rising.py
Writes ../assets/nyc-explorer/rising_score.json
"""

import json
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from scipy import sparse, stats
from shapely import points as shp_points
from shapely.affinity import scale
from shapely.geometry import MultiPolygon, mapping, shape
from shapely.geometry.polygon import orient
from shapely.ops import unary_union
from shapely.strtree import STRtree

import build_explorer_data as bx
import build_models as bm
import build_signals as bs
import rns_pulls as rp

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "assets" / "nyc-explorer" / "rising_score.json"
RNG = np.random.default_rng(6491)

HOLD = 3
MIN_SALES = 20
FIRST_T = 2013          # first start year with a 3-year momentum window that closes by t-2 (needs 2007 sales)
NOW_T = 2025            # "buy now": base price from 2024-25 sales, inputs through 2023
VAL_YEARS = [2017, 2018]
TEST_YEARS = [2019, 2020, 2021, 2022]
FAMILY = ("01", "02", "03")
CONDO = ("04", "12", "13")
KINDS = list(rp.NOISE_KINDS)
KIND_LABEL = {"RES": "Residential / party", "COM": "Bars, clubs, music (commercial)",
              "STR": "Street / sidewalk", "CON": "Construction (after-hours, jackhammering)"}
FILTER_YEARS = [2024, 2025]       # "now" for the livability filters
CRIME_BASE_YEARS = [2021, 2022]   # crime trend for the filter: 2024-25 vs 2021-22
WORKPLACES = [  # duty stations an officer is likely to be assigned to in NYC
    ("Fort Hamilton (Brooklyn)", 40.6086, -74.0335),
    ("Fort Totten (Queens)", 40.7920, -73.7770),
    ("Coast Guard Sector NY, Fort Wadsworth (Staten Island)", 40.6060, -74.0560),
    ("USACE New York District, 26 Federal Plaza (Manhattan)", 40.7154, -74.0040),
    ("Brooklyn Navy Yard", 40.7003, -73.9712),
]

# ── variable dictionary: every model input, where it comes from, how it is built ──
SRC = {
    "dof": ("NYC Dept. of Finance", "annualized sales 2007–2025 + PLUTO 64uk-42ks", "https://www.nyc.gov/site/finance/property/property-annualized-sales-update.page"),
    "acs": ("Census ACS 5-year", "api.census.gov acs/acs5", "https://www.census.gov/programs-surveys/acs"),
    "dob": ("NYC Dept. of Buildings", "BIS ipu4-2q9a + DOB NOW w9ak-ipjd", "https://data.cityofnewyork.us/d/ipu4-2q9a"),
    "nypd": ("NYPD", "qgea-i56i", "https://data.cityofnewyork.us/d/qgea-i56i"),
    "311": ("NYC 311", "76ig-c548 (2010–19) + erm2-nwe9 (2020+)", "https://data.cityofnewyork.us/d/erm2-nwe9"),
    "mta": ("MTA", "39hk-dx4f", "https://data.ny.gov/d/39hk-dx4f"),
    "derived": ("Built from the inputs above", "", ""),
}
VARS = [
    # key, family, label, source, raw fields, steps, timing, display unit
    ("alpha", "base", "Start-year intercept a_t", "derived", "the outcome itself",
     ["One intercept per start year, fit by the model. It absorbs anything that moved every neighborhood that year.",
      "A start year the model has not seen gets the average of the intercepts it has seen.",
      "It shifts every neighborhood equally, so it never changes the ranking."], "start year t", ""),
    ("PRICE0", "start", "Starting price vs the city", "dof", "sale price ÷ residential units, 1–3 family homes",
     ["Median price per unit of 1–3 family sales ≥ $10,000 in years t−3 and t−2.",
      "Divide by the same median for the whole city, then take the log (×100).",
      "0 = priced like the city; +50 ≈ 65% above it."], "sales in t−3, t−2", "log pts vs city"),
    ("INC", "start", "Median household income", "acs", "B19013_001",
     ["Each tract's median household income from the 5-year release ending t−2.",
      "NTA value = household-weighted average of its tracts' medians.", "Natural log."], "ACS release ending t−2", "$"),
    ("RENT", "start", "Median gross rent", "acs", "B25064_001",
     ["Each tract's median gross rent, release ending t−2.", "NTA value = renter-household-weighted average.", "Natural log."],
     "ACS release ending t−2", "$ / month"),
    ("BA", "start", "College share", "acs", "B15002 bachelor's+ (8 cells) ÷ B15002_001",
     ["Adults 25+ with a bachelor's or higher ÷ all adults 25+, summed over the NTA's tracts. Percent."],
     "ACS release ending t−2", "%"),
    ("RENTER", "start", "Renter share", "acs", "B25003_003 ÷ B25003_001",
     ["Renter households ÷ all households, summed over the NTA's tracts. Percent."], "ACS release ending t−2", "%"),
    ("MOM", "own", "Own momentum (3-yr price change vs city)", "dof", "same prices as the outcome",
     ["log(P[t−2] ÷ P[t−5]) minus the same for the city, ×100.",
      "P[t−2] uses sales in t−3 and t−2; P[t−5] uses t−6 and t−5. No sale is shared with the outcome."],
     "sales t−6 … t−2", "log pts vs city"),
    ("CONSTR", "signal", "Construction activity (new buildings + demolitions)", "dob", "BIS NB + DM jobs; DOB NOW New Building + Full Demolition",
     ["Count new-building and full-demolition jobs by the year their first permit was issued (BIS and DOB NOW combined).",
      "Average of t−3 and t−2, per 1,000 households, then log(1 + rate)."], "years t−3, t−2", "jobs / 1,000 hh / yr"),
    ("NB", "signal", "New-building permits", "dob", "BIS NB; DOB NOW New Building",
     ["Same as construction activity, new buildings only."], "years t−3, t−2", "jobs / 1,000 hh / yr"),
    ("DM", "signal", "Demolition permits", "dob", "BIS DM; DOB NOW Full Demolition",
     ["Same as construction activity, demolitions only."], "years t−3, t−2", "jobs / 1,000 hh / yr"),
    ("A1", "signal", "Renovation permits", "dob", "BIS A1; DOB NOW Alteration CO",
     ["Major alterations that change use or occupancy. Per 1,000 households, log(1 + rate)."], "years t−3, t−2", "jobs / 1,000 hh / yr"),
    ("SALES", "signal", "Home sales volume", "dof", "every residential sale ≥ $10,000",
     ["Count residential sales (all types), average of t−3 and t−2, per 1,000 households, log(1 + rate)."],
     "years t−3, t−2", "sales / 1,000 hh / yr"),
    ("CRIME_LVL", "signal", "Felony rate vs the city", "nypd", "law_cat_cd = FELONY, coordinates",
     ["Felonies placed in the NTA by coordinates, t−3 and t−2.",
      "log((felonies + 1) ÷ (what the city rate would give this many residents + 1)). 0 = the city rate."],
     "years t−3, t−2", "× city rate"),
    ("CRIME_CHG", "signal", "Felony change vs the city", "nypd", "same",
     ["Felony rate in t−3…t−2 vs t−6…t−5 (non-overlapping), as a log ratio, minus the city's own change."],
     "t−6 … t−2", "log pts vs city"),
    *[(f"NOISE_{k}", "noise", f"Noise: {KIND_LABEL[k].lower()}", "311", rp.NOISE_KINDS[k].replace("complaint_type=", "complaint_type = "),
       ["311 complaints of this kind placed in the NTA by coordinates, t−3 and t−2.",
        "log((complaints + 1) ÷ (city rate × residents + 1)): 0 = the city rate, +0.69 = 2× the city.",
        "Complaints, not decibels: they measure how often residents call, not how loud it is."],
       "years t−3, t−2", "× city rate") for k in KINDS],
    ("NOISE", "noise", "Noise: all four kinds combined", "311", "the four kinds above, summed",
     ["Same steps on the total. Used only to test split vs combined."], "years t−3, t−2", "× city rate"),
    ("SUBWAY", "signal", "Distance to the subway", "mta", "station latitude / longitude",
     ["Each tract's center to the nearest station, km; NTA = population-weighted average. Fixed over time."], "fixed", "km"),
    ("NBMOM", "nb", "Neighbors' momentum (average)", "derived", "MOM of every touching NTA",
     ["Neighbors = NTAs sharing a border or corner (queen contiguity). Islands get their nearest NTA.",
      "Average MOM over neighbors that pass the minimum-sales rule."], "sales t−6 … t−2", "log pts vs city"),
    ("GAP", "nb", "Gap: hottest neighbor minus this one", "derived", "MOM of every touching NTA",
     ["Take the highest MOM among qualifying neighbors and subtract this NTA's own MOM.",
      "Large Gap = the area next door is surging and this one hasn't yet (the edge of a hot area)."],
     "sales t−6 … t−2", "log pts"),
    ("u", "place", "Place effect u_i", "derived", "fit by the model",
     ["One number per NTA: how much faster (or slower) its prices beat the city than its inputs say.",
      "A Leroux CAR prior (a proper ICAR) pulls each u toward its neighbors' average AND toward 0; τ and the mix ρ are picked on the validation years.",
      "A correction for what isn't measured but is shared locally; the Gap is how the model sees a hot side."], "fixed", "log pts"),
]
FAMILIES = {"base": "Start-year intercept", "start": "Starting levels", "own": "Own momentum", "signal": "Signals",
            "noise": "311 noise (by kind)", "nb": "Neighbors (C only)", "place": "Place effect (C only)"}
START = ["PRICE0", "INC", "RENT", "BA", "RENTER"]


# ── 1. geography: 2010 NTAs built from 2010 tracts ───────────────────
def geography():
    shapes = bm.cached("tracts2010", bm.pull_shapes)
    geoms_t = {s["boroct2010"]: shape(s["the_geom"]).buffer(0) for s in shapes}
    nta_of = {s["boroct2010"]: s["ntacode"] for s in shapes}
    name = {s["ntacode"]: s["ntaname"] for s in shapes}
    boro = {s["ntacode"]: s["boroname"] for s in shapes}
    # park-cemetery-etc. (xx99) and airports (QN98) have almost no homes
    ntas = sorted(n for n in set(nta_of.values()) if not n.endswith(("99", "98")))
    geom = {n: unary_union([g for t, g in geoms_t.items() if nta_of[t] == n]) for n in ntas}
    nb = {k: sorted(v) for k, v in bm.queen_neighbors(geom, ntas).items()}
    cen = {n: geom[n].centroid for n in ntas}
    for n in ntas:  # islands (City Island, Roosevelt Island, ...) borrow their nearest NTA so every area has a neighbor
        if not nb[n]:
            near = min((m for m in ntas if m != n), key=lambda m: cen[n].distance(cen[m]))
            nb[n], nb[near] = [near], sorted(set(nb[near]) | {n})
    print(f"   {len(ntas)} residential NTAs from {len(geoms_t)} tracts")
    return dict(geoms_t=geoms_t, nta_of=nta_of, name=name, boro=boro, ntas=ntas, geom=geom, nb=nb)


def to_nta(G, counts_by_tract):
    out = {n: 0.0 for n in G["ntas"]}
    for t, c in counts_by_tract.items():
        n = G["nta_of"].get(t)
        if n in out:
            out[n] += c
    return out


def points_in_nta(G, pts_by_year):
    ntas = G["ntas"]
    tree = STRtree([G["geom"][n] for n in ntas])
    cnt = {}
    for y, pts in pts_by_year.items():
        if not pts:
            cnt[int(y)] = {n: 0.0 for n in ntas}
            continue
        arr = np.array(pts)
        hp, hpoly = tree.query(shp_points(arr[:, 0], arr[:, 1]), predicate="within")
        c = np.bincount(hpoly, weights=arr[hp, 2], minlength=len(ntas))
        cnt[int(y)] = {n: float(c[i]) for i, n in enumerate(ntas)}
    return cnt


# ── 2. ACS by NTA, 2010-2023 (2020+ releases moved onto 2010 lines) ──
def acs_by_nta(G, acs_old, acs_new, rel):
    out = {}
    for y in range(2010, 2024):
        raw = acs_old[str(y)] if y < 2020 else acs_new[str(y)]
        acc = {n: np.zeros(9) for n in G["ntas"]}
        for t, r in raw.items():
            t10 = t if y < 2020 else rel.get(t)
            n = G["nta_of"].get(t10)
            if n not in acc:
                continue
            pop, hh, ren = bm.val(r, "B01003_001") or 0, bm.val(r, "B25003_001") or 0, bm.val(r, "B25003_003") or 0
            adults, ba = bm.val(r, "B15002_001") or 0, sum(bm.val(r, k) or 0 for k in bm.B15002_BA)
            inc, rent = bm.val(r, "B19013_001"), bm.val(r, "B25064_001")
            acc[n] += [pop, hh, ren, adults, ba, (inc or 0) * hh, hh if inc else 0, (rent or 0) * ren, ren if rent else 0]
        out[y] = {n: {"pop": a[0], "hh": a[1], "renter": 100 * a[2] / a[1] if a[1] else None, "ba": 100 * a[4] / a[3] if a[3] else None,
                      "income": a[5] / a[6] if a[6] else None, "rent": a[7] / a[8] if a[8] else None} for n, a in acc.items()}
    return out


# ── 3. sales -> NTA-year price lists ─────────────────────────────────
def place_sales(G, sales, pluto):
    block_tract = {}
    for bbl, t in pluto.items():
        block_tract.setdefault(bbl[:6], {}).setdefault(t, 0)
        block_tract[bbl[:6]][t] += 1
    block_tract = {b: max(v, key=v.get) for b, v in block_tract.items()}
    ntas = set(G["ntas"])
    fam = {y: {n: [] for n in ntas} for y in rp.SALE_YEARS}
    condo = {y: {n: [] for n in ntas} for y in rp.SALE_YEARS}
    vol = {y: {n: 0 for n in ntas} for y in rp.SALE_YEARS}
    placed = total = 0
    for y, rows in sales.items():
        y = int(y)
        for b, cat, block, lot, units, price in rows:
            if price < 10000 or cat not in bs.RES_CLASSES:
                continue
            total += 1
            bbl = f"{b}{block:05d}{lot:04d}"
            n = G["nta_of"].get(pluto.get(bbl) or block_tract.get(bbl[:6]))
            if n not in ntas:
                continue
            placed += 1
            vol[y][n] += 1
            if cat in FAMILY and units >= 1:
                fam[y][n].append(price / units)
            elif cat in CONDO:
                condo[y][n].append(price)  # condo sales are one unit each
    to_arr = lambda d: {y: {n: np.array(v) for n, v in yy.items()} for y, yy in d.items()}
    print(f"   residential sales >= $10k placed in an NTA: {placed:,} of {total:,} ({100 * placed / total:.1f}%)")
    return to_arr(fam), to_arr(condo), vol, placed / total


def prices(ppu, min_sales, pool=2):
    """P[s][n] = (median, count) over sale years s-pool+1..s; city[s] = citywide median."""
    P, city = {}, {}
    for s in range(rp.SALE_YEARS[0] + pool - 1, rp.SALE_YEARS[-1] + 1):
        yrs = range(s - pool + 1, s + 1)
        P[s] = {}
        allv = []
        for n in ppu[s]:
            v = np.concatenate([ppu[y][n] for y in yrs])
            allv.append(v)
            P[s][n] = (float(np.median(v)) if len(v) >= min_sales else None, len(v))
        city[s] = float(np.median(np.concatenate(allv)))
    return P, city


def rel_change(P, city, n, a, b):
    if a not in P or b not in P:
        return None
    pa, pb = P[a][n][0], P[b][n][0]
    if pa is None or pb is None:
        return None
    return 100 * (np.log(pb / pa) - np.log(city[b] / city[a]))


# ── 4. signal tables by NTA-year ─────────────────────────────────────
def signal_tables(G, A, P_):
    valid_t = set(G["nta_of"])
    permits = {j: {y: {n: 0.0 for n in G["ntas"]} for y in range(2008, 2024)} for j in ("NB", "DM", "A1")}
    for src in (P_["bis_old"], P_["bis_new"]):
        for key, rows in src.items():
            job, y = key.split("_")
            y = int(y)
            if y not in permits["NB"]:
                continue
            for r in rows:
                t = bs.tract_code(bs.BORO.get(r.get("borough")), r.get("gis_census_tract"), valid_t)
                n = G["nta_of"].get(t)
                if n in permits[job][y]:
                    permits[job][y][n] += int(r["n"])
    for job, by_year in P_["now"].items():
        cnt = points_in_nta(G, by_year)
        for y, d in cnt.items():
            for n, c in d.items():
                permits[job][y][n] += c
    noise = {k: points_in_nta(G, P_["noise"][k]) for k in KINDS}
    noise["ALL"] = {y: {n: sum(noise[k][y][n] for k in KINDS) for n in G["ntas"]} for y in noise["RES"]}
    felony = points_in_nta(G, P_["felony"])
    return permits, noise, felony


def pop_for(A, y):
    return A[min(max(y, 2010), 2023)]


def static_geo(G, A):
    """Population-weighted centers, subway distance, park access (tract centers, 2010 population)."""
    st = json.loads((HERE.parent / "assets" / "nyc-explorer" / "subway.json").read_text(encoding="utf-8"))["stations"]
    sp = np.array([[s[0], s[1]] for s in st])
    kx, ky = 111.32 * np.cos(np.radians(40.7)), 110.57
    acs10 = bm.cached("acs5_tracts_2010_2019", lambda: None)["2010"]
    # work in a local km plane so shapely distances come out in km
    km = lambda g: scale(g, xfact=kx, yfact=ky, origin=(0, 0))
    parks = [km(shape(p["multipolygon"]).buffer(0)) for p in bm.cached("rns_parks", rp.pull_parks) if p.get("multipolygon")]
    ptree = STRtree(parks)
    out = {}
    for n in G["ntas"]:
        ts = [t for t in G["geoms_t"] if G["nta_of"][t] == n]
        w, xs, ys, sub, near = [], [], [], [], []
        for t in ts:
            c = G["geoms_t"][t].centroid
            pop = bm.val(acs10.get(t, {}), "B01003_001") or 0
            w.append(pop)
            xs.append(c.x)
            ys.append(c.y)
            sub.append(float(np.min(np.hypot((sp[:, 0] - c.x) * kx, (sp[:, 1] - c.y) * ky))))
            ck = km(c)
            near.append(1000 * parks[ptree.nearest(ck)].distance(ck))  # meters to the nearest 1+ acre park (0 if inside)
        w = np.array(w, float)
        if w.sum() == 0:
            w = np.ones(len(ts))
        near = np.array(near)
        out[n] = {"lon": float(np.average(xs, weights=w)), "lat": float(np.average(ys, weights=w)),
                  "subway_km": float(np.average(sub, weights=w)), "park_m": float(np.average(near, weights=w)),
                  "park_400": float(np.average(near <= 400, weights=w))}
    return out, len(st), len(parks)


# ── 5. rows: one per NTA per start year ──────────────────────────────
def build_rows(G, D, cfg):
    """cfg: min_sales, hold, shared (momentum shares the outcome's base window), condos, nb ('queen'|'knn'),
    gap ('max'|'second'|'share'), window (signal years: 2 = t-3..t-2, 1 = t-2 only), fam (optional bootstrap)."""
    ppu = D["fam"] if cfg.get("fam") is None else cfg["fam"]
    if cfg.get("condos"):
        ppu = {y: {n: np.concatenate([ppu[y][n], D["condo"][y][n]]) for n in ppu[y]} for y in ppu}
    P, city = prices(ppu, cfg.get("min_sales", MIN_SALES))
    hold = cfg.get("hold", HOLD)
    nb = D["nb_knn"] if cfg.get("nb") == "knn" else G["nb"]
    A, permits, noise, felony, geo = D["A"], D["permits"], D["noise"], D["felony"], D["geo"]
    rows = []
    city_rate = {}  # (table, year) -> citywide events per resident

    def per_res(tab, name, yy):
        if (name, yy) not in city_rate:
            city_rate[(name, yy)] = sum(tab[yy].values()) / sum(pop_for(A, yy)[m]["pop"] for m in G["ntas"])
        return city_rate[(name, yy)]
    for t in range(FIRST_T, NOW_T + 1):
        m_end = t if cfg.get("shared") else t - 2     # shared: momentum ends at the outcome's base price
        W = [t - 3, t - 2] if cfg.get("window", 2) == 2 else [t - 2]
        W0 = [y - 3 for y in W]
        acs = A[t - 2]
        mom = {n: rel_change(P, city, n, m_end - 3, m_end) for n in G["ntas"]}
        for n in G["ntas"]:
            if mom[n] is None or any(acs[n][k] is None for k in ("income", "rent", "ba", "renter")):
                continue
            y = rel_change(P, city, n, t, t + hold) if t + hold <= rp.SALE_YEARS[-1] else None
            if y is None and t != NOW_T:
                continue
            hh = max(acs[n]["hh"], 1)
            pops = [max(pop_for(A, yy)[n]["pop"], 1) for yy in W]
            per1k = lambda tab: float(np.mean([1000 * tab[yy][n] / hh for yy in W]))

            def vs_city(tab, name, yrs):
                """log((events + 1) / (events the city rate predicts for this many residents + 1))"""
                c = sum(tab[yy][n] for yy in yrs)
                exp_ = sum(pop_for(A, yy)[n]["pop"] * per_res(tab, name, yy) for yy in yrs)
                return float(np.log((c + 1) / (exp_ + 1)))
            qual = [(m, mom[m]) for m in nb[n] if mom.get(m) is not None]
            nbv = sorted([v for _, v in qual], reverse=True)
            if cfg.get("gap", "max") == "max":
                gap = nbv[0] - mom[n] if nbv else 0.0
            elif cfg["gap"] == "second":
                gap = (nbv[1] if len(nbv) > 1 else nbv[0]) - mom[n] if nbv else 0.0
            else:
                gap = 100 * float(np.mean([v > 100 * np.log(1.05) for v in nbv])) if nbv else 0.0
            hot = max(qual, key=lambda q: q[1])[0] if qual else None
            r = {"nta": n, "t": t, "y": y,
                 "PRICE0": 100 * float(np.log(P[t - 2][n][0] / city[t - 2])) if P[t - 2][n][0] else None,
                 "INC": float(np.log(acs[n]["income"])), "RENT": float(np.log(acs[n]["rent"])),
                 "BA": acs[n]["ba"], "RENTER": acs[n]["renter"], "MOM": mom[n],
                 "NB": float(np.log1p(per1k(permits["NB"]))), "DM": float(np.log1p(per1k(permits["DM"]))),
                 "A1": float(np.log1p(per1k(permits["A1"]))),
                 "CONSTR": float(np.log1p(per1k(permits["NB"]) + per1k(permits["DM"]))),
                 "SALES": float(np.log1p(per1k(D["vol"]))),
                 "CRIME_LVL": vs_city(felony, "fel", W),
                 "CRIME_CHG": 100 * (vs_city(felony, "fel", W) - vs_city(felony, "fel", W0)),
                 **{f"NOISE_{k}": vs_city(noise[k], k, W) for k in KINDS},
                 "NOISE": vs_city(noise["ALL"], "ALL", W),
                 "SUBWAY": geo[n]["subway_km"],
                 "NBMOM": float(np.mean(nbv)) if nbv else mom[n], "GAP": gap, "hot": hot, "n_nb": len(nbv),
                 "price_now": P[t][n][0], "n_sales": P[t][n][1]}
            if r["PRICE0"] is None:
                continue
            rows.append(r)
    return rows, P, city


# ── 6. design, fit, predict ──────────────────────────────────────────
def rcs_basis(x, knots):
    """Restricted cubic spline (Harrell): linear beyond the outer knots. Returns the nonlinear columns."""
    k = knots
    K = len(k)
    pos = lambda v: np.maximum(v, 0) ** 3
    cols = []
    for j in range(K - 2):
        f = pos(x - k[j]) - pos(x - k[K - 2]) * (k[K - 1] - k[j]) / (k[K - 1] - k[K - 2]) \
            + pos(x - k[K - 1]) * (k[K - 2] - k[j]) / (k[K - 1] - k[K - 2])
        cols.append(f / (k[K - 1] - k[0]) ** 2)
    return cols


def columns(spec):
    """Model inputs for a spec: model in B1 / B / C1 / C; constr combined|separate; noise split|combined."""
    cols = START + ["MOM"]
    if spec["model"] == "B1":
        return cols, []
    cols += (["CONSTR"] if spec.get("constr", "combined") == "combined" else ["NB", "DM"]) + ["A1", "SALES", "CRIME_LVL", "CRIME_CHG"]
    noise = [f"NOISE_{k}" for k in KINDS] if spec.get("noise", "split") == "split" else ["NOISE"]
    cols += noise + ["SUBWAY"]
    if spec["model"] in ("C1", "C"):
        cols += ["NBMOM", "GAP"]
    return cols, noise


def features(rows, spec, st=None):
    cols, noise = columns(spec)
    form = spec.get("form", "linear")
    raw = {c: np.array([r[c] for r in rows], float) for c in cols}
    fit_ = st is None
    if fit_:
        st = {"knots": {}, "mu": {}, "sd": {}}
    names, mats = [], []
    for c in cols:
        x = raw[c]
        parts = [(c, x)]
        if c in noise and form != "linear":
            if form == "sq":
                if fit_:
                    st["mu"][c + "_c"] = float(x.mean())
                parts.append((c + "^2", (x - st["mu"][c + "_c"]) ** 2))
            elif form == "bins":
                ratio = np.exp(x)
                parts = [(f"{c}[1-2x]", ((ratio >= 1) & (ratio < 2)).astype(float)),
                         (f"{c}[2-3x]", ((ratio >= 2) & (ratio < 3)).astype(float)),
                         (f"{c}[3x+]", (ratio >= 3).astype(float))]
            elif form == "spline":
                if fit_:
                    st["knots"][c] = [float(v) for v in np.percentile(x, [5, 35, 65, 95])]
                parts += [(f"{c}~s{i + 1}", b) for i, b in enumerate(rcs_basis(x, np.array(st["knots"][c])))]
        for nm, v in parts:
            if fit_:
                st["mu"][nm], st["sd"][nm] = float(v.mean()), float(v.std() + 1e-9)
            names.append(nm)
            mats.append((v - st["mu"][nm]) / st["sd"][nm])
    return np.column_stack(mats), names, st


def icar_Q(G, nb):
    idx = {n: i for i, n in enumerate(G["ntas"])}
    W = sparse.lil_matrix((len(idx), len(idx)))
    for n in G["ntas"]:
        for m in nb[n]:
            if m in idx:
                W[idx[n], idx[m]] = W[idx[m], idx[n]] = 1
    W = W.tocsr()
    return (sparse.diags(np.asarray(W.sum(1)).ravel()) - W).toarray(), idx


def fit(rows, spec, ctx):
    years = sorted({r["t"] for r in rows})
    F, names, st = features(rows, spec)
    y = np.array([r["y"] for r in rows], float)
    Y = np.array([[1.0 if r["t"] == yr else 0.0 for yr in years] for r in rows])
    blocks, pen = [Y, F], [np.zeros(len(years)), np.full(F.shape[1], spec.get("ridge", 0.0))]
    spatial = spec["model"] == "C"
    if spatial:
        Q, idx = ctx["Q"], ctx["idx"]
        Gm = np.zeros((len(rows), len(idx)))
        Gm[np.arange(len(rows)), [idx[r["nta"]] for r in rows]] = 1
        blocks.append(Gm)
    A = np.hstack(blocks)
    Pm = np.diag(np.concatenate(pen))
    if spatial:
        k0 = len(years) + F.shape[1]
        Pm = np.pad(Pm, ((0, len(idx)), (0, len(idx))))
        # Leroux CAR: rho * ICAR + (1 - rho) * iid. Pure ICAR (rho = 1) leaves borough-wide patterns in u unpenalized
        rho = spec.get("rho", 0.9)
        Pm[k0:, k0:] = spec["tau"] * (rho * Q + (1 - rho) * np.eye(len(idx))) + 1e-4 * np.eye(len(idx))
    H = A.T @ A + Pm + 1e-8 * np.eye(A.shape[1])
    theta = np.linalg.solve(H, A.T @ y)
    resid = y - A @ theta
    m = {"spec": spec, "years": years, "st": st, "names": names, "a": theta[:len(years)],
         "b": theta[len(years):len(years) + F.shape[1]],
         "u": theta[len(years) + F.shape[1]:] if spatial else None, "resid": resid, "y": y}
    if ctx.get("se"):
        # cluster-robust (by NTA) sandwich: consecutive start years share sale years, so rows of one NTA are not independent
        Hi = np.linalg.inv(H)
        groups = {}
        for i, r in enumerate(rows):
            groups.setdefault(r["nta"], []).append(i)
        meat = np.zeros((A.shape[1], A.shape[1]))
        for ix in groups.values():
            s = A[ix].T @ resid[ix]
            meat += np.outer(s, s)
        g = len(groups)
        V = Hi @ meat @ Hi * g / (g - 1)
        m["se"] = np.sqrt(np.diag(V))[len(years):len(years) + F.shape[1]]
    return m


def predict(m, rows, ctx):
    F, _, _ = features(rows, m["spec"], m["st"])
    a_mean = float(np.mean(m["a"]))
    ay = {yr: a for yr, a in zip(m["years"], m["a"])}
    p = np.array([ay.get(r["t"], a_mean) for r in rows]) + F @ m["b"]
    if m["u"] is not None:
        p = p + np.array([m["u"][ctx["idx"][r["nta"]]] for r in rows])
    return p


def rolling(rows, spec, ctx, years, hold=HOLD):
    """Score each year t with a model trained only on start years whose outcome was known by t."""
    lab = [r for r in rows if r["y"] is not None]
    out = []
    for t in years:
        tr = [r for r in lab if r["t"] <= t - hold]
        te = [r for r in lab if r["t"] == t]
        if not tr or not te:
            continue
        m = fit(tr, spec, ctx)
        for r, p in zip(te, predict(m, te, ctx)):
            out.append((r, float(p)))
    return out


def metrics(pairs, n_top=20):
    if not pairs:
        return None
    y = np.array([r["y"] for r, _ in pairs])
    p = np.array([q for _, q in pairs])
    yrs = sorted({r["t"] for r, _ in pairs})
    per = []
    for t in yrs:
        ix = [i for i, (r, _) in enumerate(pairs) if r["t"] == t]
        yy, pp = y[ix], p[ix]
        top = np.argsort(-pp)[:n_top]
        per.append({"t": t, "n": len(ix), "rmse": float(np.sqrt(np.mean((yy - pp) ** 2))), "mae": float(np.mean(np.abs(yy - pp))),
                    "rho": float(stats.spearmanr(yy, pp).statistic), "top_beat": int((yy[top] > 0).sum()),
                    "top_mean": float(yy[top].mean()), "all_mean": float(yy.mean()), "all_beat": float((yy > 0).mean())})
    # within-year RMSE: remove each start year's average miss (the citywide level nobody can know in advance)
    e = y - p
    tt = np.array([r["t"] for r, _ in pairs])
    ew = np.concatenate([e[tt == t] - e[tt == t].mean() for t in yrs])
    return {"rmse": float(np.sqrt(np.mean(e ** 2))), "rmse_within": float(np.sqrt(np.mean(ew ** 2))), "mae": float(np.mean(np.abs(y - p))),
            "bias": float(e.mean()),
            "rho": float(np.mean([d["rho"] for d in per])), "top_beat": int(sum(d["top_beat"] for d in per)),
            "top_n": n_top * len(per), "top_mean": float(np.mean([d["top_mean"] for d in per])),
            "all_mean": float(np.mean([d["all_mean"] for d in per])),
            "random_beat": float(sum(d["all_beat"] * n_top for d in per)), "per_year": per}


def persistence(rows, years):
    return [(r, r["MOM"]) for r in rows if r["y"] is not None and r["t"] in years]


def zero_pred(rows, years):
    return [(r, 0.0) for r in rows if r["y"] is not None and r["t"] in years]


def resid_moran(pairs, G, nb):
    acc = {}
    for r, p in pairs:
        acc.setdefault(r["nta"], []).append(r["y"] - p)
    ids = sorted(acc)
    pos = {n: i for i, n in enumerate(ids)}
    x = [float(np.mean(acc[n])) for n in ids]
    nb_idx = [[pos[m] for m in nb[n] if m in pos] for n in ids]
    I, p, _, lo, hi = bm.morans_i(x, nb_idx, perms=999)
    return [round(I, 3), round(p, 3), round(lo, 3), round(hi, 3)]


def vif(rows, cols):
    X = np.array([[r[c] for c in cols] for r in rows], float)
    X = (X - X.mean(0)) / X.std(0)
    out = {}
    for j, c in enumerate(cols):
        o = np.delete(X, j, axis=1)
        o1 = np.column_stack([np.ones(len(X)), o])
        beta, *_ = np.linalg.lstsq(o1, X[:, j], rcond=None)
        r2 = 1 - np.sum((X[:, j] - o1 @ beta) ** 2) / np.sum((X[:, j] - X[:, j].mean()) ** 2)
        out[c] = round(float(1 / max(1 - r2, 1e-9)), 2)
    return out


def rd(x, k=3):
    return None if x is None or not np.isfinite(x) else round(float(x), k)


def clean(o):
    """NaN/inf -> null so the browser's JSON.parse accepts the file."""
    if isinstance(o, dict):
        return {k: clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [clean(v) for v in o]
    if isinstance(o, (float, np.floating)):
        return None if not np.isfinite(o) else float(o)
    if isinstance(o, np.integer):
        return int(o)
    return o


def slim_metrics(m):
    if m is None:
        return None
    return {k: (rd(v) if isinstance(v, float) else v) for k, v in m.items() if k != "per_year"} | \
           {"per_year": [{k: (rd(v) if isinstance(v, float) else v) for k, v in d.items()} for d in m["per_year"]]}


# ── 7. main ──────────────────────────────────────────────────────────
def main():
    import sys
    sys.stdout.reconfigure(encoding="utf-8")
    t0 = time.time()
    key = bx.census_key()
    print("pulls (cached) ...")
    P_ = rp.all_pulls(key)
    print("geography ...")
    G = geography()
    nb_knn = bs.knn_neighbors(G["geom"], G["ntas"])
    print("ACS by NTA ...")
    A = acs_by_nta(G, bm.cached("acs5_tracts_2010_2019", lambda: bm.pull_acs(key)), P_["acs_new"], P_["rel"])
    print("sales ...")
    fam, condo, vol, sale_match = place_sales(G, P_["sales"], bm.cached("pluto_bbl_tract2010", bs.pull_pluto))
    vol_tab = {y: {n: float(v) for n, v in d.items()} for y, d in vol.items()}
    print("signals ...")
    permits, noise, felony = signal_tables(G, A, P_)
    geo, n_stations, n_parks = static_geo(G, A)
    D = dict(fam=fam, condo=condo, vol=vol_tab, A=A, permits=permits, noise=noise, felony=felony, geo=geo, nb_knn=nb_knn)
    Q, idx = icar_Q(G, G["nb"])
    ctx = {"Q": Q, "idx": idx}
    Qk, _ = icar_Q(G, nb_knn)
    ctx_knn = {"Q": Qk, "idx": idx}

    rows, P, city = build_rows(G, D, {})
    lab = [r for r in rows if r["y"] is not None]
    now = [r for r in rows if r["t"] == NOW_T]
    print(f"   rows: {len(lab)} labelled NTA-years ({FIRST_T}-{max(r['t'] for r in lab)}), {len(now)} NTAs scored for {NOW_T}")

    # ── choices made on the validation years (2017-18), never on the test years
    print("validation: ridge, tau, then each design choice ...")
    base = {"constr": "combined", "noise": "split", "form": "linear"}

    def val(spec):
        return metrics(rolling(rows, spec, ctx, VAL_YEARS))
    ridge_cv = {lam: val({**base, "model": "B", "ridge": lam})["rmse"] for lam in (0, 30, 100, 300, 1000, 3000, 10000, 30000)}
    ridge = min(ridge_cv, key=ridge_cv.get)
    tau_cv = {(tau, rho): val({**base, "model": "C", "ridge": ridge, "tau": tau, "rho": rho})["rmse"]
              for tau in (1, 3, 10, 30, 100, 300, 1000, 3000) for rho in (0.5, 0.9, 0.99)}
    tau, rho_car = min(tau_cv, key=tau_cv.get)
    print(f"   ridge {ridge} ({ridge_cv}), tau {tau}, rho {rho_car}")

    def pick(options, key_):
        """Lowest validation RMSE for Model C; a more complex option must win by > 0.5% to replace the simpler one."""
        res = {}
        for opt in options:
            spec = {**base, key_: opt, "ridge": ridge, "tau": tau, "rho": rho_car}
            res[opt] = {m: slim_metrics(val({**spec, "model": m})) for m in ("B", "C")}
        best = options[0]
        for opt in options[1:]:
            if res[opt]["C"]["rmse"] < res[best]["C"]["rmse"] * 0.995:
                best = opt
        return best, res

    # construction: combined vs separate, plus sign stability across growing training windows
    constr_pick, constr_res = pick(["combined", "separate"], "constr")
    signs = {"combined": {"CONSTR": []}, "separate": {"NB": [], "DM": []}}
    for t in range(2017, 2023):
        tr = [r for r in lab if r["t"] <= t - HOLD]
        for opt, cs in signs.items():
            m = fit(tr, {**base, "constr": opt, "model": "C", "ridge": ridge, "tau": tau, "rho": rho_car}, ctx)
            for c in cs:
                cs[c].append(rd(m["b"][m["names"].index(c)], 2))
    base["constr"] = constr_pick
    noise_pick, noise_res = pick(["combined", "split"], "noise")
    base["noise"] = noise_pick
    form_pick, form_res = pick(["linear", "sq", "bins", "spline"], "form")
    base["form"] = form_pick
    print(f"   construction {constr_pick}, noise {noise_pick}, noise shape {form_pick}")
    vif_cols = START + ["MOM", "NB", "DM", "A1", "SALES", "CRIME_LVL", "CRIME_CHG"] + [f"NOISE_{k}" for k in KINDS] + ["SUBWAY", "NBMOM", "GAP"]
    vifs = {"separate": vif(lab, vif_cols), "combined": vif(lab, [c if c != "NB" else "CONSTR" for c in vif_cols if c != "DM"])}
    corr_nb_dm = rd(np.corrcoef([r["NB"] for r in lab], [r["DM"] for r in lab])[0, 1])

    SPEC = {**base, "ridge": ridge, "tau": tau, "rho": rho_car}
    specs = {"B1": {**SPEC, "model": "B1"}, "B": {**SPEC, "model": "B"}, "C1": {**SPEC, "model": "C1"}, "C": {**SPEC, "model": "C"}}

    # ── held-out test 2019-22: the ladder from "start simple" to the full spatial model
    print("test years 2019-22 ...")
    roll = {k: rolling(rows, s, ctx, TEST_YEARS) for k, s in specs.items()}
    ladder = {k: slim_metrics(metrics(v)) for k, v in roll.items()}
    ladder["persist"] = slim_metrics(metrics(persistence(rows, TEST_YEARS)))
    ladder["zero"] = slim_metrics(metrics(zero_pred(rows, TEST_YEARS)))
    moran = {k: resid_moran(roll[k], G, G["nb"]) for k in ("B", "C")}
    for k in ("persist", "B1", "B", "C1", "C"):
        L = ladder[k]
        print(f"   {k:8s} RMSE {L['rmse']:.2f} within {L['rmse_within']:.2f} bias {L['bias']:+.2f}  rho {L['rho']:.3f}  top-20 beat {L['top_beat']}/{L['top_n']}  mean {L['top_mean']:+.1f}")
    print(f"   Moran's I of test residuals: B {moran['B']}, C {moran['C']}")
    # paired bootstrap over NTAs: C - B in Spearman and RMSE
    pairsB, pairsC = {(r["nta"], r["t"]): p for r, p in roll["B"]}, {(r["nta"], r["t"]): p for r, p in roll["C"]}
    keys = sorted(set(pairsB) & set(pairsC))
    yv = {k_: next(r["y"] for r, _ in roll["C"] if (r["nta"], r["t"]) == k_) for k_ in keys}
    ntas_te = sorted({k_[0] for k_ in keys})
    by_nta = {n: [k_ for k_ in keys if k_[0] == n] for n in ntas_te}
    d_rho, d_rmse = [], []
    for _ in range(1000):
        pk = [k_ for n in RNG.choice(ntas_te, len(ntas_te)) for k_ in by_nta[n]]
        rb = np.mean([stats.spearmanr([yv[k_] for k_ in pk if k_[1] == t], [pairsB[k_] for k_ in pk if k_[1] == t]).statistic for t in TEST_YEARS])
        rc = np.mean([stats.spearmanr([yv[k_] for k_ in pk if k_[1] == t], [pairsC[k_] for k_ in pk if k_[1] == t]).statistic for t in TEST_YEARS])
        eb = np.sqrt(np.mean([(yv[k_] - pairsB[k_]) ** 2 for k_ in pk]))
        ec = np.sqrt(np.mean([(yv[k_] - pairsC[k_]) ** 2 for k_ in pk]))
        d_rho.append(rc - rb)
        d_rmse.append(ec - eb)
    gap_ci = {"rho": [rd(ladder["C"]["rho"] - ladder["B"]["rho"]), rd(np.percentile(d_rho, 2.5)), rd(np.percentile(d_rho, 97.5))],
              "rmse": [rd(ladder["C"]["rmse"] - ladder["B"]["rmse"]), rd(np.percentile(d_rmse, 2.5)), rd(np.percentile(d_rmse, 97.5))]}
    print(f"   C - B: rho {gap_ci['rho']}, RMSE {gap_ci['rmse']}")

    # ── final fits on every finished start year (2013-22), with cluster-robust intervals
    print("final fits + current scores ...")
    ctx_se = {**ctx, "se": True}
    final = {k: fit(lab, specs[k], ctx_se) for k in ("B", "C")}

    def coef_table(m):
        return {nm: {"b": rd(b), "se": rd(s), "lo": rd(b - 1.96 * s), "hi": rd(b + 1.96 * s)} for nm, b, s in zip(m["names"], m["b"], m["se"])}
    coefs = {k: coef_table(final[k]) for k in ("B", "C")}
    year_fx = {k: [{"t": t, "a": rd(a, 2)} for t, a in zip(final[k]["years"], final[k]["a"])] for k in ("B", "C")}

    # prediction interval from how far off Model C was on the held-out years (80%: 10th-90th pct of errors)
    errs = np.array([r["y"] - p for r, p in roll["C"]])
    q10, q90 = (float(v) for v in np.percentile(errs, [10, 90]))
    cover = float(np.mean((errs >= q10) & (errs <= q90)))
    predB, predC = predict(final["B"], now, ctx), predict(final["C"], now, ctx)
    order = np.argsort(np.argsort(predC))
    scores = {r["nta"]: round(100 * o / (len(now) - 1)) for r, o in zip(now, order)}

    # livability filters, measured now (2024-25), not model inputs
    def rate_now(tab, n, yrs):
        return 1000 * sum(tab[y][n] for y in yrs) / len(yrs) / max(A[2023][n]["pop"], 1)

    def city_rate(tab, yrs):
        return 1000 * sum(sum(tab[y].values()) for y in yrs) / len(yrs) / sum(A[2023][m]["pop"] for m in G["ntas"])
    fel_now, fel_then = city_rate(felony, FILTER_YEARS), city_rate(felony, CRIME_BASE_YEARS)
    nta_out = []
    for n in G["ntas"]:
        r = next((x for x in now if x["nta"] == n), None)
        f_now, f_then = rate_now(felony, n, FILTER_YEARS), rate_now(felony, n, CRIME_BASE_YEARS)
        d = {"code": n, "name": G["name"][n], "boro": G["boro"][n], "lat": rd(geo[n]["lat"], 4), "lon": rd(geo[n]["lon"], 4),
             "subway_km": rd(geo[n]["subway_km"], 2), "park_m": round(geo[n]["park_m"]), "park_400": rd(geo[n]["park_400"], 2),
             "felony_now": rd(f_now, 1), "felony_chg": rd(100 * (f_now / f_then - 1) if f_then else None, 1),
             "noise": {k: rd(rate_now(noise[k], n, FILTER_YEARS) / city_rate(noise[k], FILTER_YEARS), 2) for k in KINDS},
             "pop": round(A[2023][n]["pop"]), "income": round(A[2023][n]["income"] or 0), "price_now": None, "scored": r is not None}
        if r is not None:
            i = now.index(r)
            d.update({"score": scores[n], "predC": rd(predC[i], 1), "predB": rd(predB[i], 1),
                      "pctC": rd(100 * (np.exp(predC[i] / 100) - 1), 1),
                      "lo": rd(100 * (np.exp((predC[i] + q10) / 100) - 1), 1), "hi": rd(100 * (np.exp((predC[i] + q90) / 100) - 1), 1),
                      "mom": rd(r["MOM"], 1), "gap": rd(r["GAP"], 1), "hot": r["hot"], "hot_name": G["name"].get(r["hot"]),
                      "price_now": round(r["price_now"]) if r["price_now"] else None, "n_sales": r["n_sales"],
                      "u": rd(final["C"]["u"][idx[n]], 2)})
        else:
            pn = P[NOW_T][n]
            d.update({"n_sales": pn[1]})
        nta_out.append(d)
    print(f"   scored {len(now)} NTAs; 80% band = prediction {q10:+.1f} to {q90:+.1f} log pts (held-out coverage {cover:.2f})")

    # noise shape: each kind's effect on the prediction across its observed range (Model C final fit)
    curves = {}
    mC = final["C"]
    for k in [f"NOISE_{k_}" for k_ in KINDS] if base["noise"] == "split" else ["NOISE"]:
        xs = np.array([r[k] for r in lab])
        grid = np.linspace(np.percentile(xs, 2), np.percentile(xs, 98), 41)
        fake = [{**{c: float(np.mean([r[c] for r in lab])) for c in columns(specs["C"])[0]}, k: g, "t": 2099, "nta": G["ntas"][0], "y": 0} for g in grid]
        F, names, _ = features(fake, specs["C"], mC["st"])
        use = [i for i, nm in enumerate(names) if nm == k or nm.startswith(k + "[") or nm.startswith(k + "~") or nm == k + "^2"]
        eff = F[:, use] @ mC["b"][use]
        eff = eff - eff[np.argmin(np.abs(grid))]  # 0 at the city rate
        pk = int(np.argmax(eff))
        curves[k] = {"x": [rd(np.exp(g), 3) for g in grid], "eff": [rd(e, 2) for e in eff],
                     "peak": rd(np.exp(grid[pk]), 2) if 0 < pk < len(grid) - 1 else None,
                     "share_above_peak": rd(np.mean(xs > grid[pk]), 3) if 0 < pk < len(grid) - 1 else None}

    # ── Gap: does the edge of a hot area matter beyond the neighbor average? + its robustness checks
    gap_runs = {}
    for g in ("max", "second", "share"):
        rws = rows if g == "max" else build_rows(G, D, {"gap": g})[0]
        lb = [r for r in rws if r["y"] is not None]
        mfit = fit(lb, specs["C"], ctx_se)
        i = mfit["names"].index("GAP")
        gap_runs[g] = {"b": rd(mfit["b"][i]), "lo": rd(mfit["b"][i] - 1.96 * mfit["se"][i]), "hi": rd(mfit["b"][i] + 1.96 * mfit["se"][i]),
                       "test": slim_metrics(metrics(rolling(rws, specs["C"], ctx, TEST_YEARS)))}
    nogap = {**specs["C"]}
    gap_runs["none"] = {"test": slim_metrics(metrics(rolling([{**r, "GAP": 0.0} for r in rows], nogap, ctx, TEST_YEARS)))}
    # gap groups: realized outcome by Gap quintile (raw pattern, before any model)
    gq = np.percentile([r["GAP"] for r in lab], [20, 40, 60, 80])
    gap_bins = []
    for i in range(5):
        lo_, hi_ = (gq[i - 1] if i else -1e9), (gq[i] if i < 4 else 1e9)
        ys = [r["y"] for r in lab if lo_ <= r["GAP"] < hi_]
        gap_bins.append({"lo": rd(lo_ if i else min(r["GAP"] for r in lab), 1), "hi": rd(hi_ if i < 4 else max(r["GAP"] for r in lab), 1),
                         "mean": rd(np.mean(ys), 2), "se": rd(np.std(ys) / np.sqrt(len(ys)), 2), "n": len(ys)})

    # ── sensitivity: one choice at a time
    print("sensitivity ...")
    SENS = [("base", "Baseline (as built)", {}, None),
            ("min10", "Minimum sales 10 per window", {"min_sales": 10}, None),
            ("min40", "Minimum sales 40 per window", {"min_sales": 40}, None),
            ("hold2", "Hold period 2 years", {"hold": 2}, None),
            ("hold5", "Hold period 5 years", {"hold": 5}, None),
            ("shared", "Momentum ends at the outcome's base price (overlap)", {"shared": True}, None),
            ("condos", "Price includes condos", {"condos": True}, None),
            ("knn", "Neighbors = 6 nearest NTAs", {"nb": "knn"}, "knn"),
            ("gap2", "Gap uses the 2nd-hottest neighbor", {"gap": "second"}, None),
            ("gapshare", "Gap → share of neighbors beating the city by 5%+", {"gap": "share"}, None),
            ("w1", "Signals from t−2 only (1 year)", {"window": 1}, None),
            ("noridge", "No ridge shrinkage", {}, "noridge"),
            ("linear", "Noise effect straight-line", {}, "linear")]
    sens = []
    track = ["MOM", "GAP", "NBMOM", "PRICE0", "CONSTR" if base["constr"] == "combined" else "NB", "SALES", "CRIME_CHG"]
    if base["form"] == "linear":
        SENS = [x for x in SENS if x[0] != "linear"]
    for key_, label, cfg, special in SENS:
        rws = rows if not cfg else build_rows(G, D, cfg)[0]
        hold = cfg.get("hold", HOLD)
        cx = ctx_knn if special == "knn" else ctx
        sp = {k: dict(v) for k, v in specs.items()}
        if special == "noridge":
            for v in sp.values():
                v["ridge"] = 0.0
        if special == "linear":
            for v in sp.values():
                v["form"] = "linear"
        yrs = [t for t in TEST_YEARS if t + hold <= rp.SALE_YEARS[-1]]
        res = {"key": key_, "label": label, "rows": sum(1 for r in rws if r["y"] is not None), "test_years": yrs}
        lbr = [r for r in rws if r["y"] is not None]
        for m in ("B", "C"):
            met = metrics(rolling(rws, sp[m], cx, yrs, hold))
            mf = fit(lbr, sp[m], {**cx, "se": True})
            res[m] = {"rmse": rd(met["rmse"]), "rmse_within": rd(met["rmse_within"]), "rho": rd(met["rho"]), "top_beat": met["top_beat"], "top_n": met["top_n"],
                      "top_mean": rd(met["top_mean"], 2), "all_mean": rd(met["all_mean"], 2),
                      "coef": {c: {"b": rd(mf["b"][mf["names"].index(c)]), "lo": rd(mf["b"][mf["names"].index(c)] - 1.96 * mf["se"][mf["names"].index(c)]),
                                   "hi": rd(mf["b"][mf["names"].index(c)] + 1.96 * mf["se"][mf["names"].index(c)])}
                               for c in track if c in mf["names"]}}
        res["persist"] = {"rho": rd(metrics(persistence(rws, yrs))["rho"])}
        sens.append(res)
        print(f"   {label:52s} C rho {res['C']['rho']}  B rho {res['B']['rho']}  rows {res['rows']}")

    # ── data noise: resample the sales themselves (bootstrap within each NTA-year), rebuild everything, refit
    print("sales bootstrap ...")
    NDRAW = 30
    base_top = {r["nta"] for r, _ in sorted(zip(now, predC), key=lambda z: -z[1])[:20]}
    draws, score_draws = [], {n: [] for n in scores}
    sign_flip = []
    base_y = {(r["nta"], r["t"]): r["y"] for r in lab}
    for d in range(NDRAW):
        fb = {y: {n: (v[RNG.integers(0, len(v), len(v))] if len(v) else v) for n, v in yy.items()} for y, yy in fam.items()}
        rws, _, _ = build_rows(G, D, {"fam": fb})
        lb = [r for r in rws if r["y"] is not None]
        nw = [r for r in rws if r["t"] == NOW_T]
        mC_ = fit(lb, specs["C"], ctx)
        pc_ = predict(mC_, nw, ctx)
        o = np.argsort(np.argsort(pc_))
        sc = {r["nta"]: 100 * oo / (len(nw) - 1) for r, oo in zip(nw, o)}
        for n in score_draws:
            if n in sc:
                score_draws[n].append(sc[n])
        top = {r["nta"] for r, _ in sorted(zip(nw, pc_), key=lambda z: -z[1])[:20]}
        flips = sum(1 for r in lb if (r["nta"], r["t"]) in base_y and np.sign(r["y"]) != np.sign(base_y[(r["nta"], r["t"])]))
        sign_flip.append(flips / len(lb))
        tm = metrics(rolling(rws, specs["C"], ctx, TEST_YEARS))
        tb = metrics(rolling(rws, specs["B"], ctx, TEST_YEARS))
        gi = mC_["names"].index("GAP")
        draws.append({"top_overlap": len(top & base_top), "rhoC": rd(tm["rho"]), "rhoB": rd(tb["rho"]),
                      "gap_b": rd(mC_["b"][gi]), "mom_b": rd(mC_["b"][mC_["names"].index("MOM")])})
        print(f"   draw {d + 1}/{NDRAW}: top-20 overlap {draws[-1]['top_overlap']}, rho C {draws[-1]['rhoC']}")
    score_sd = {n: rd(np.std(v), 1) for n, v in score_draws.items() if v}

    # ── if I had done it differently
    print("counterfactuals ...")
    insample = {}
    for m in ("B", "C"):
        te = [r for r in lab if r["t"] in TEST_YEARS]
        insample[m] = slim_metrics(metrics(list(zip(te, predict(final[m], te, ctx)))))
    perm = RNG.permutation(len(lab))
    cut_ = int(0.75 * len(lab))
    tr_r, te_r = [lab[i] for i in perm[:cut_]], [lab[i] for i in perm[cut_:]]
    randsplit = {m: slim_metrics(metrics(list(zip(te_r, predict(fit(tr_r, specs[m], ctx), te_r, ctx))))) for m in ("B", "C")}

    # ── worked example: Bushwick South, scored now
    ex_code = "BK78"
    ex = next((r for r in now if r["nta"] == ex_code), now[0])
    F, names, _ = features([ex], specs["C"], mC["st"])
    contrib = [{"col": nm, "z": rd(F[0, i], 2), "b": rd(mC["b"][i], 2), "c": rd(F[0, i] * mC["b"][i], 2)} for i, nm in enumerate(names)]
    example = {"code": ex["nta"], "name": G["name"][ex["nta"]], "raw": {c: rd(ex[c], 3) for c in columns(specs["C"])[0]},
               "a": rd(np.mean(mC["a"]), 2), "u": rd(mC["u"][idx[ex["nta"]]], 2), "contrib": contrib,
               "pred": rd(float(predC[now.index(ex)]), 2), "score": scores[ex["nta"]], "hot_name": G["name"].get(ex["hot"]),
               "history": [{"t": r["t"], "y": rd(r["y"], 1), "p": rd(p, 1)} for r, p in roll["C"] if r["nta"] == ex["nta"]]}

    # ── variables: distributions on the labelled rows + coefficients
    var_out = []
    for k_, fam_, label, src, fields, steps, timing, unit in VARS:
        d = {"key": k_, "family": fam_, "label": label, "source": src, "fields": fields, "steps": steps, "timing": timing, "unit": unit}
        if lab and k_ in lab[0]:
            v = np.array([r[k_] for r in lab], float)
            disp = np.exp(v) if k_ in ("INC", "RENT") or k_.startswith("NOISE") or k_ == "CRIME_LVL" else \
                np.expm1(v) if k_ in ("CONSTR", "NB", "DM", "A1", "SALES") else v
            d["dist"] = {"q": [rd(x, 2) for x in np.percentile(disp, [5, 25, 50, 75, 95])]}
            lo, hi = np.percentile(disp, [1, 99])
            h, e = np.histogram(np.clip(disp, lo, hi), bins=24, range=(lo, hi) if hi > lo else None)
            d["hist"] = {"n": h.tolist(), "lo": rd(e[0], 2), "hi": rd(e[-1], 2)}
            for m in ("B", "C"):
                if k_ in coefs[m]:
                    d[m] = coefs[m][k_]
        var_out.append(d)

    # ── descriptive pieces for the outcome section
    years_P = sorted(P)
    price_series = {"years": years_P, "city": [round(city[s]) for s in years_P],
                    "nta": {n: [round(P[s][n][0]) if P[s][n][0] else None for s in years_P] for n in G["ntas"]}}
    coverage = [{"s": s, "n": sum(1 for n in G["ntas"] if P[s][n][0] is not None)} for s in years_P]
    ys = np.array([r["y"] for r in lab])
    yh, ye = np.histogram(np.clip(ys, -60, 60), bins=30, range=(-60, 60))
    by_t = [{"t": t, "n": sum(1 for r in lab if r["t"] == t), "mean": rd(np.mean([r["y"] for r in lab if r["t"] == t]), 2),
             "sd": rd(np.std([r["y"] for r in lab if r["t"] == t]), 2)} for t in sorted({r["t"] for r in lab})]
    scatter = {m: [[rd(r["y"], 1), rd(p, 1), r["t"]] for r, p in roll[m]] for m in ("B", "C")}
    covered_boro = {}
    for n in G["ntas"]:
        b = G["boro"][n]
        covered_boro.setdefault(b, [0, 0])
        covered_boro[b][1] += 1
        covered_boro[b][0] += any(x["nta"] == n for x in now)

    def d3_shape(g):
        g = g.simplify(0.0004, preserve_topology=True)
        polys = [g] if g.geom_type == "Polygon" else [q for q in g.geoms if q.geom_type == "Polygon"]
        g = MultiPolygon([orient(q, -1.0) for q in polys])  # d3-geo wants clockwise outer rings
        return json.loads(json.dumps(mapping(g)), parse_float=lambda s: round(float(s), 4))
    geo_out = {"type": "FeatureCollection",
               "features": [{"type": "Feature", "properties": {"code": n}, "geometry": d3_shape(G["geom"][n])} for n in G["ntas"]]}

    out = {
        "meta": {"built": datetime.now(timezone.utc).isoformat(timespec="seconds"), "hold": HOLD, "min_sales": MIN_SALES,
                 "first_t": FIRST_T, "last_t": max(r["t"] for r in lab), "now_t": NOW_T, "val_years": VAL_YEARS, "test_years": TEST_YEARS,
                 "n_ntas": len(G["ntas"]), "n_rows": len(lab), "n_now": len(now), "sale_years": [rp.SALE_YEARS[0], rp.SALE_YEARS[-1]],
                 "sale_match": rd(sale_match), "n_stations": n_stations, "n_parks": n_parks, "kinds": KIND_LABEL,
                 "n_sales_fam": int(sum(len(v) for yy in fam.values() for v in yy.values())), "covered_boro": covered_boro,
                 "filter_years": FILTER_YEARS, "crime_base_years": CRIME_BASE_YEARS, "felony_city_chg": rd(100 * (fel_now / fel_then - 1), 1)},
        "sources": SRC, "families": FAMILIES, "variables": var_out,
        "choices": {"ridge": {"cv": {str(k): rd(v) for k, v in ridge_cv.items()}, "pick": ridge},
                    "tau": {"cv": [{"tau": k[0], "rho": k[1], "rmse": rd(v)} for k, v in tau_cv.items()], "pick": tau, "rho": rho_car},
                    "constr": {"pick": constr_pick, "res": constr_res, "signs": signs, "corr_nb_dm": corr_nb_dm, "sign_years": list(range(2017, 2023))},
                    "noise": {"pick": noise_pick, "res": noise_res},
                    "form": {"pick": form_pick, "res": form_res},
                    "vif": vifs},
        "spec": SPEC,
        "ladder": ladder, "moran": moran, "gap_ci": gap_ci,
        "coefs": coefs, "year_fx": year_fx,
        "band": {"q10": rd(q10, 2), "q90": rd(q90, 2), "coverage": rd(cover)},
        "ntas": nta_out, "workplaces": [{"name": w[0], "lat": w[1], "lon": w[2]} for w in WORKPLACES],
        "curves": curves, "gap": {"runs": gap_runs, "bins": gap_bins},
        "sensitivity": sens,
        "bootstrap": {"draws": draws, "score_sd": score_sd, "sign_flip": [rd(x) for x in sign_flip],
                      "median_score_sd": rd(np.median(list(score_sd.values())), 1)},
        "counterfactual": {"insample": insample, "randsplit": randsplit},
        "example": example,
        "outcome": {"hist": {"n": yh.tolist(), "lo": -60, "hi": 60}, "by_t": by_t, "mean": rd(ys.mean(), 2), "sd": rd(ys.std(), 2),
                    "share_pos": rd(np.mean(ys > 0))},
        "price_series": price_series, "coverage": coverage, "scatter": scatter,
        "geo": geo_out,
    }
    OUT.write_text(json.dumps(clean(out), separators=(",", ":"), allow_nan=False, default=lambda o: o.item() if hasattr(o, "item") else str(o)), encoding="utf-8")
    print(f"wrote {OUT.name} ({OUT.stat().st_size / 1e6:.2f} MB) in {(time.time() - t0) / 60:.1f} min")


if __name__ == "__main__":
    main()
