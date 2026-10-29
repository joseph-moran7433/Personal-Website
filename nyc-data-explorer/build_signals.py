"""
build_signals.py -- Part 5: the first spatio-temporal model, with many signals.

Part 4 (build_models.py) tested the two model frames on the outcome alone. This
script puts real gentrification signals in from five city sources and compares
exactly two models on them:

  Model B  discrete-time hazard: year dummies (baseline yearly risk) + starting
           point + own change so far + own signals (t-1)
  Model C  spatio-temporal hazard: B + neighbors' change and signals (t-1)
           + ICAR tract random effect (penalized likelihood = posterior mode)

Signals (all measured the year BEFORE the year being predicted, except subway access):
  Construction   DOB permit issuance (BIS ipu4-2q9a): renovation (A1), new building (NB),
                 demolition (DM) jobs per 1,000 households
  Housing market DOF annualized sales: residential sales per 1,000 households, and
                 growth in the median price per unit of 1-3 family homes vs 2009-10
  Safety         NYPD complaints (qgea-i56i): change in the felony rate since 2009
  Street life    311 (76ig-c548): noise complaints per 1,000 residents, relative to the city that year
  Transit        MTA stations (39hk-dx4f): distance from the tract center to the nearest station
Restaurant history is NOT in: DOHMH keeps ~3 years and the SLA liquor data resets issue
dates on renewal, so neither reaches back to 2010-16 (see the page for the gap).

The page also explains where every model input comes from, so this script exports a
variable dictionary, each input's distribution, the baseline yearly risk, and worked
examples (one tract-year, raw value -> model value -> contribution to the odds).

Then three robustness passes:
  1. Sensitivity: change one analysis choice at a time (incl. dropping each signal
     group), refit both models, record what moves.
  2. Data noise: re-draw every ACS estimate inside its own margin of error
     (correlated across overlapping 5-year vintages), rebuild the outcome, refit.
  3. "If I had done it differently": counterfactual choices that would have
     changed the answer (hindsight leak, no held-out years, v1 events, B alone).

Needs requests, numpy, scipy, shapely, xlrd (sales pull only) and the Census key. Reuses build_models.py.
Usage:  python build_signals.py      (writes ../assets/nyc-explorer/models_signals.json)
"""

import json
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import requests
from shapely import points as shp_points
from shapely.strtree import STRtree

import build_explorer_data as bx
import build_models as bm

HERE = Path(__file__).resolve().parent
PERMITS = "ipu4-2q9a"
BORO = {"MANHATTAN": "1", "BRONX": "2", "BROOKLYN": "3", "QUEENS": "4", "STATEN ISLAND": "5"}
PERMIT_TYPES = {"A1": ("AL", "Renovation permits", "major alterations (change of use)"),
                "NB": ("NB", "New-building permits", "new buildings"),
                "DM": ("DM", "Demolition permits", "full demolitions")}
SIG_YEARS = list(range(2008, 2019))
SALE_YEARS = list(range(2009, 2017))
NOISE_YEARS = list(range(2010, 2017))
NOISE_TYPES = ("Noise - Residential", "Noise - Street/Sidewalk", "Noise - Commercial")
RNG = np.random.default_rng(4915)
K = len(bm.RISK_YEARS)

# every signal: group, short label, what it is. Time-varying ones get a neighbor version in C.
SIGNALS = {
    "A1": ("construction", "Renovation permits"),
    "NB": ("construction", "New-building permits"),
    "DM": ("construction", "Demolition permits"),
    "SALES": ("market", "Home sales"),
    "PRICE": ("market", "Home price growth"),
    "CRIME": ("safety", "Felony change"),
    "NOISE": ("street", "Noise complaints"),
    "SUBWAY": ("transit", "Subway distance"),
}
STATIC = {"SUBWAY"}
GROUPS = {"construction": "Construction (DOB)", "market": "Housing market (DOF)", "safety": "Safety (NYPD)",
          "street": "Street life (311)", "transit": "Transit (MTA)"}
S_OWN = [f"s_{j}" for j in SIGNALS]
S_NB = [f"n_{j}" for j in SIGNALS if j not in STATIC]
B_COLS = bm.B_COLS + S_OWN
C_COLS = bm.C_COLS + S_OWN + S_NB

# ── where every model input comes from (shown on the page as-is) ──────
SRC = {
    "acs": ("Census ACS 5-year", "api.census.gov acs/acs5", "https://www.census.gov/programs-surveys/acs"),
    "dob": ("NYC Dept. of Buildings", "ipu4-2q9a", "https://data.cityofnewyork.us/d/ipu4-2q9a"),
    "dof": ("NYC Dept. of Finance", "annualized sales .xls + PLUTO 64uk-42ks", "https://www.nyc.gov/site/finance/property/property-annualized-sales-update.page"),
    "nypd": ("NYPD", "qgea-i56i", "https://data.cityofnewyork.us/d/qgea-i56i"),
    "311": ("NYC 311", "76ig-c548", "https://data.cityofnewyork.us/d/76ig-c548"),
    "mta": ("MTA", "39hk-dx4f", "https://data.ny.gov/d/39hk-dx4f"),
    "derived": ("Built from the inputs above", "", ""),
}
VARS = [
    # (key, family, label, source, raw fields, steps, timing)
    ("alpha", "base", "Baseline yearly risk α_t", "derived", "the outcome itself (who tipped which year)",
     ["One intercept per year 2012–15, fit by the model (year dummies).",
      "It is the log-odds of tipping that year for a tract with every other input at the at-risk average.",
      "The test years 2016–17 were never seen, so they get the average of the 2012–15 intercepts."],
     "the year being predicted"),
    ("inc0", "start", "Starting income", "acs", "B19013_001 median household income",
     ["ACS 2006–10 median household income for the tract.", "Natural log (a $10k gap matters more at $25k than at $90k)."],
     "fixed: 2006–10"),
    ("rent0", "start", "Starting rent", "acs", "B25064_001 median gross rent",
     ["ACS 2006–10 median gross rent.", "Natural log."], "fixed: 2006–10"),
    ("ba0", "start", "Starting college share", "acs", "B15002 bachelor's+ (8 cells) ÷ B15002_001 adults 25+",
     ["Add up the men and women 25+ with a bachelor's, master's, professional or doctorate.",
      "Divide by all adults 25+. Percent."], "fixed: 2006–10"),
    ("renter0", "start", "Starting renter share", "acs", "B25003_003 renter households ÷ B25003_001 households",
     ["Renter-occupied households ÷ all occupied households. Percent."], "fixed: 2006–10"),
    ("own_rent_rk", "own", "Own rent change so far", "acs", "B25064_001 in vintage t−1 vs 2010",
     ["Rent growth since 2010: rent(t−1) ÷ rent(2010) − 1.",
      "Rank it against all 2,000+ NYC tracts that year: 0 = slowest, 1 = fastest."], "vintage t−1"),
    ("own_ba_rk", "own", "Own college-share change so far", "acs", "B15002 in vintage t−1 vs 2010",
     ["College share(t−1) − college share(2010), in points.", "Rank against all NYC tracts that year (0–1)."], "vintage t−1"),
    ("s_A1", "signal", "Renovation permits", "dob", "job_type = A1, permit_type = AL, filing_status = INITIAL",
     ["Count distinct permit jobs issued in the tract that year (each job counted once).",
      "Divide by the tract's 2006–10 households, × 1,000.", "log(1 + rate) so a few busy tracts don't dominate."],
     "year t−1"),
    ("s_NB", "signal", "New-building permits", "dob", "job_type = NB, permit_type = NB, filing_status = INITIAL",
     ["Count distinct new-building jobs issued that year.", "Per 1,000 households, then log(1 + rate)."], "year t−1"),
    ("s_DM", "signal", "Demolition permits", "dob", "job_type = DM, permit_type = DM, filing_status = INITIAL",
     ["Count distinct full-demolition jobs issued that year.", "Per 1,000 households, then log(1 + rate)."], "year t−1"),
    ("s_SALES", "signal", "Home sales", "dof", "sale price, building class, borough-block-lot",
     ["Keep residential sales ≥ $10,000 (drops $0 family transfers).",
      "Place each sale in a tract by its tax lot (PLUTO), or its block if the lot is new.",
      "Count per 1,000 households, then log(1 + rate)."], "year t−1"),
    ("s_PRICE", "signal", "Home price growth", "dof", "sale price ÷ residential units, 1–3 family homes",
     ["Price per unit for every 1–3 family sale ≥ $10,000.",
      "Median over the two years ending t−1, and over 2009–10 (the base).",
      "Growth = log(median now ÷ median base). Needs 5+ sales in each; otherwise uses the neighborhood (NTA)."],
     "years t−2 to t−1"),
    ("s_CRIME", "signal", "Felony change", "nypd", "law_cat_cd = FELONY, complaint date, latitude/longitude",
     ["Place each felony complaint in a tract by its coordinates.",
      "Felonies per 1,000 residents in t−1 and in 2009.",
      "Change = log((rate t−1 + 1) ÷ (rate 2009 + 1)). Negative = crime fell."], "year t−1 vs 2009"),
    ("s_NOISE", "signal", "Noise complaints", "311", "complaint_type = Noise - Residential / Street/Sidewalk / Commercial",
     ["Place each noise complaint in a tract by its coordinates.",
      "Complaints per 1,000 residents.",
      "Relative to the city that year: log((tract + 1) ÷ (city + 1)). 311 use grew citywide, this removes that."],
     "year t−1"),
    ("s_SUBWAY", "signal", "Subway distance", "mta", "station latitude/longitude",
     ["Distance in km from the tract's center to the nearest subway (or SIR) station.",
      "Fixed over time: almost no stations opened 2010–17."], "fixed"),
    ("nb_rent_rk", "nb", "Neighbors' rent change", "derived", "own rent-change rank of each touching tract",
     ["Neighbors = tracts that share a border or corner (queen contiguity).", "Average their rent-change ranks (t−1)."],
     "vintage t−1"),
    ("nb_ba_rk", "nb", "Neighbors' college change", "derived", "own college-change rank of each touching tract",
     ["Average the neighbors' college-change ranks (t−1)."], "vintage t−1"),
    ("nb_affluent", "nb", "Affluent edge next door", "derived", "which neighbors were not low-income in 2006–10",
     ["Share of neighbors that were never at risk (not in the bottom 40% of income)."], "fixed: 2006–10"),
    *[(f"n_{j}", "nbsig", f"Neighbors' {SIGNALS[j][1].lower()}", "derived", f"s_{j} of each touching tract",
       [f"Average the neighbors' {SIGNALS[j][1].lower()} value (same units as the tract's own)."], "year t−1")
      for j in SIGNALS if j not in STATIC],
    ("u", "place", "Place effect u_i", "derived", "fit by the model",
     ["One number per tract: how much more (or less) likely it tips than its inputs say.",
      "The ICAR prior pulls each tract's u toward its neighbors' average, with strength τ (picked by cross-validation).",
      "Captures what we didn't measure but is shared locally (a new park, a school, a reputation)."], "fixed"),
]
FAMILY = {"base": "Baseline yearly risk", "start": "Starting point (2006–10)", "own": "Own change so far",
          "signal": "Signals", "nb": "Neighbors' change (C only)", "nbsig": "Neighbors' signals (C only)",
          "place": "Place effect (C only)"}


# ── 1. signal pulls (all cached in .cache/models/) ───────────────────
def tract_code(boro, s, valid):
    """BIS writes tract 702.01 as '70201' and tract 616 as '616'. Try the
    likely reading first, then the other, and keep whichever is a real 2010 tract."""
    if not boro or not s or not s.isdigit():
        return None
    a = boro + (s.zfill(4) + "00" if len(s) <= 4 else s.zfill(6))
    b = boro + s.zfill(6)
    return a if a in valid else b if b in valid else None


def pull_permits():
    out = {}
    for job, (ptype, _, _) in PERMIT_TYPES.items():
        for y in SIG_YEARS:
            rows = bx.soql_all(bx.NYC, PERMITS, select="borough, gis_census_tract, count(distinct job__) as n",
                               where=f"job_type='{job}' and permit_type='{ptype}' and filing_status='INITIAL' "
                                     f"and issuance_date like '%/{y}'",
                               group="borough, gis_census_tract")
            out[f"{job}_{y}"] = rows
            print(f"   permits {job} {y}: {sum(int(r['n']) for r in rows):,} jobs in {len(rows)} tracts")
    return out


def pull_moe(key):
    """Margins of error for the outcome's two inputs (median rent, BA share)."""
    get = ",".join(["B25064_001M", "B15002_001E", "B15002_001M"] + [v + s for v in bm.B15002_BA for s in ("E", "M")])
    out = {}
    for y in bm.YEARS:
        rows = []
        for county in bm.COUNTY_BORO:
            rows += bx.census_get(f"{y}/acs/acs5", {"get": get, "for": "tract:*", "in": f"state:36 county:{county}"}, key) or []
        out[y] = {bm.COUNTY_BORO[r["county"]] + r["tract"]: {k: r[k] for k in r if k[-1] in "EM"} for r in rows}
        print(f"   acs5 MOE {y}: {len(out[y])} tracts")
    return out


UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Safari/537.36"}
DOF_BOROS = ("manhattan", "bronx", "brooklyn", "queens", "statenisland")


def read_xls(path):
    import xlrd
    s = xlrd.open_workbook(str(path)).sheet_by_index(0)
    h = next(i for i in range(12) if any("SALE PRICE" in str(c.value).upper().replace("\n", " ") for c in s.row(i)))
    cols = [str(c.value).upper().replace("\n", " ").strip() for c in s.row(h)]
    ix = {k: next(i for i, c in enumerate(cols) if c.startswith(k)) for k in
          ("BOROUGH", "BUILDING CLASS CATEGORY", "BLOCK", "LOT", "RESIDENTIAL UNITS", "SALE PRICE")}
    out = []
    for r in range(h + 1, s.nrows):
        row = s.row(r)
        try:
            out.append([str(int(float(row[ix["BOROUGH"]].value))), str(row[ix["BUILDING CLASS CATEGORY"]].value).strip()[:2],
                        int(float(row[ix["BLOCK"]].value)), int(float(row[ix["LOT"]].value)),
                        int(float(row[ix["RESIDENTIAL UNITS"]].value or 0)), float(row[ix["SALE PRICE"]].value or 0)])
        except (ValueError, TypeError):
            continue
    return out


def pull_sales():
    """DOF annualized sales, one .xls per borough-year (nyc.gov wants a browser User-Agent)."""
    P = "https://www.nyc.gov/assets/finance/downloads/pdf/rolling_sales/annualized-sales"
    dof = HERE / ".cache" / "dof"
    dof.mkdir(parents=True, exist_ok=True)
    out = {}
    for y in SALE_YEARS:
        out[y] = []
        for boro in DOF_BOROS:
            path = dof / f"{y}_{boro}.xls"
            if not path.exists():
                url = f"{P}/2009_{boro}.xls" if y == 2009 else f"{P}/{y}/{y}_{boro}.xls"
                r = requests.get(url, headers=UA, timeout=180)
                r.raise_for_status()
                path.write_bytes(r.content)
            out[y] += read_xls(path)
        print(f"   sales {y}: {len(out[y]):,} rows")
    return out


def pull_pluto():
    rows = bx.soql_all(bx.NYC, "64uk-42ks", select="bbl, ct2010, borocode", where="ct2010 is not null")
    out = {}
    for r in rows:
        try:
            ct = r["ct2010"].split(".")
            out[str(int(float(r["bbl"])))] = r["borocode"] + ct[0].zfill(4) + (ct[1] if len(ct) > 1 else "00").ljust(2, "0")
        except (KeyError, ValueError):
            continue
    return out


def pull_points(dataset, where_fn, years):
    """Counts per (lon, lat) point per year -- small enough to place in tracts locally."""
    out = {}
    for y in years:
        rows = bx.soql_all(bx.NYC, dataset, select="latitude, longitude, count(*) as n",
                           where=where_fn(y) + " and latitude is not null", group="latitude, longitude")
        out[y] = [[float(r["longitude"]), float(r["latitude"]), int(r["n"])] for r in rows]
        print(f"   {dataset} {y}: {sum(r[2] for r in out[y]):,} at {len(rows):,} points")
    return out


def pull_crime():
    return pull_points("qgea-i56i", lambda y: f"law_cat_cd='FELONY' and cmplnt_fr_dt between '{y}-01-01T00:00:00' and '{y}-12-31T23:59:59'",
                       SALE_YEARS)


def pull_noise():
    types = ",".join(f"'{t}'" for t in NOISE_TYPES)
    return pull_points("76ig-c548", lambda y: f"complaint_type in ({types}) and created_date between '{y}-01-01T00:00:00' and '{y}-12-31T23:59:59'",
                       NOISE_YEARS)


# ── 2. panel pieces that the sensitivity runs vary ───────────────────
def changes(ind, ids):
    base = ind[2010]
    d_rent = {y: {t: ind[y][t]["rent"] / base[t]["rent"] - 1 for t in ids} for y in bm.YEARS[1:]}
    d_ba = {y: {t: ind[y][t]["ba"] - base[t]["ba"] for t in ids} for y in bm.YEARS[1:]}
    return d_rent, d_ba


def at_risk_set(ind, ids, q):
    inc0 = np.array([ind[2010][t]["income"] for t in ids])
    cut = np.quantile(inc0, q)
    return {t for t, v in zip(ids, inc0) if v <= cut}, float(cut)


def knn_neighbors(geoms, ids, k=6):
    pts = np.array([[geoms[t].centroid.x, geoms[t].centroid.y * 1.0] for t in ids])
    pts[:, 0] *= np.cos(np.radians(40.7))  # degrees of longitude are shorter at NYC's latitude
    nb = {}
    for i, t in enumerate(ids):
        d = np.hypot(*(pts - pts[i]).T)
        nb[t] = [ids[j] for j in np.argsort(d)[1:k + 1]]
    return nb


def permit_table(permits, ids, hh, scale="rate"):
    """{job: {year: {tract: value}}} -- log(1 + permits per 1,000 households), or log(1 + count)."""
    valid = set(ids)
    raw = {job: {y: {t: 0 for t in ids} for y in SIG_YEARS} for job in PERMIT_TYPES}
    matched = total = 0
    for key, rows in permits.items():
        job, y = key.split("_")
        for r in rows:
            n = int(r["n"])
            total += n
            t = tract_code(BORO.get(r.get("borough")), r.get("gis_census_tract"), valid)
            if t:
                raw[job][int(y)][t] += n
                matched += n
    tab = {job: {y: {t: float(np.log1p(1000 * c / hh[t] if scale == "rate" else c)) for t, c in v.items()}
                 for y, v in raw[job].items()} for job in PERMIT_TYPES}
    return tab, raw, matched / total


RES_CLASSES = ("01", "02", "03", "07", "08", "09", "10", "12", "13", "14", "15", "17")


def sales_signals(sales, pluto, ids, hh, nta_of):
    """Arm's-length residential sales per 1,000 households, and growth in median price
    per unit of 1-3 family homes (pooled over 2 years) vs 2009-10; tract -> NTA fallback."""
    valid = set(ids)
    block_tract = {}
    for bbl, t in pluto.items():
        block_tract.setdefault(bbl[:6], {}).setdefault(t, 0)
        block_tract[bbl[:6]][t] += 1
    block_tract = {b: max(v, key=v.get) for b, v in block_tract.items()}
    cnt = {y: {t: 0 for t in ids} for y in SALE_YEARS}
    ppu = {y: {} for y in SALE_YEARS}
    placed = total = 0
    for y, rows in sales.items():
        y = int(y)
        for boro, cat, block, lot, units, price in rows:
            if price < 10000 or cat not in RES_CLASSES:
                continue
            total += 1
            bbl = f"{boro}{block:05d}{lot:04d}"
            t = pluto.get(bbl) or block_tract.get(bbl[:6])
            if t not in valid:
                continue
            placed += 1
            cnt[y][t] += 1
            if cat in ("01", "02", "03") and units >= 1:
                ppu[y].setdefault(t, []).append(price / units)
    rate = {y: {t: float(np.log1p(1000 * cnt[y][t] / hh[t])) for t in ids} for y in cnt}

    def pooled(yrs, key):
        vals = {}
        for y in yrs:
            for t, v in ppu[y].items():
                vals.setdefault(key(t), []).extend(v)
        return vals
    base_t, base_n = pooled([2009, 2010], lambda t: t), pooled([2009, 2010], lambda t: nta_of[t])
    growth, src, fallback = {}, {}, 0
    for y in range(2010, 2017):
        cur_t, cur_n = pooled([y - 1, y], lambda t: t), pooled([y - 1, y], lambda t: nta_of[t])
        growth[y], src[y] = {}, {}
        for t in ids:
            if len(cur_t.get(t, [])) >= 5 and len(base_t.get(t, [])) >= 5:
                growth[y][t] = float(np.log(np.median(cur_t[t]) / np.median(base_t[t])))
                src[y][t] = ("tract", float(np.median(base_t[t])), float(np.median(cur_t[t])), len(cur_t[t]))
            elif len(cur_n.get(nta_of[t], [])) >= 5 and len(base_n.get(nta_of[t], [])) >= 5:
                growth[y][t] = float(np.log(np.median(cur_n[nta_of[t]]) / np.median(base_n[nta_of[t]])))
                src[y][t] = ("neighborhood", float(np.median(base_n[nta_of[t]])), float(np.median(cur_n[nta_of[t]])), len(cur_n[nta_of[t]]))
                fallback += 1
            else:
                growth[y][t] = 0.0
                src[y][t] = ("none", None, None, 0)
    growth[2009] = {t: 0.0 for t in ids}
    return rate, growth, src, placed / total, fallback / (len(ids) * 7), cnt


def points_in_tracts(pts_by_year, geoms, ids):
    """{year: {tract: count}} for point data; also the share of points that landed in a modeled tract."""
    tree = STRtree([geoms[t] for t in ids])
    cnt, hit, tot = {}, 0, 0
    for y, pts in pts_by_year.items():
        arr = np.array(pts)
        hit_pt, hit_poly = tree.query(shp_points(arr[:, 0], arr[:, 1]), predicate="within")
        c = np.bincount(hit_poly, weights=arr[hit_pt, 2], minlength=len(ids))
        cnt[int(y)] = {t: float(c[i]) for i, t in enumerate(ids)}
        hit += arr[hit_pt, 2].sum()
        tot += arr[:, 2].sum()
    return cnt, hit / tot


def crime_signal(cnt, ids, pop):
    rate = {y: {t: 1000 * cnt[y][t] / max(pop[t], 1) for t in ids} for y in cnt}
    # change in the felony rate since 2009 (log ratio; +1 per 1,000 keeps empty tracts finite)
    chg = {y: {t: float(np.log((rate[y][t] + 1) / (rate[2009][t] + 1))) for t in ids} for y in rate}
    return chg, rate


def noise_signal(cnt, ids, pop):
    rate = {y: {t: 1000 * cnt[y][t] / max(pop[t], 1) for t in ids} for y in cnt}
    city = {y: 1000 * sum(cnt[y].values()) / sum(pop[t] for t in ids) for y in cnt}
    rel = {y: {t: float(np.log((rate[y][t] + 1) / (city[y] + 1))) for t in ids} for y in cnt}
    return rel, rate, city


def subway_signal(geoms, ids):
    st = json.loads((HERE.parent / "assets" / "nyc-explorer" / "subway.json").read_text(encoding="utf-8"))["stations"]
    sp = np.array([[s[0], s[1]] for s in st])
    kx = 111.32 * np.cos(np.radians(40.7))
    out = {}
    for t in ids:
        c = geoms[t].centroid
        out[t] = float(np.min(np.hypot((sp[:, 0] - c.x) * kx, (sp[:, 1] - c.y) * 110.57)))
    return out, len(st)


def add_signals(rows, sig, nb, lag=1, window=1):
    """Signal at t-lag (or the mean of t-lag .. t-lag-window+1), own and neighbors' mean."""
    for r in rows:
        yrs = [r["year"] - lag - k for k in range(window)]
        for j in SIGNALS:
            r[f"s_{j}"] = float(np.mean([sig[j][y][r["tract"]] for y in yrs]))
            if j not in STATIC:
                ns = nb[r["tract"]]
                r[f"n_{j}"] = float(np.mean([sig[j][y][n] for y in yrs for n in ns])) if ns else 0.0
    return rows


# ── 3. fitting helpers ───────────────────────────────────────────────
def hessian_se(X, y, b, u=None, g=None, Q=None, tau=None, ridge=1e-2):
    """SEs of b from the inverse Hessian of the penalized log-likelihood at the mode
    (for C this is the Laplace approximation, integrating over the tract effects u)."""
    eta = X @ b + (u[g] if u is not None else 0)
    mu = 1 / (1 + np.exp(-eta))
    w = mu * (1 - mu)
    p = X.shape[1]
    Hbb = X.T @ (X * w[:, None]) + np.diag([1e-6] * K + [ridge] * (p - K))  # jitter: a held-out year's dummy column is all zero
    if u is None:
        return np.sqrt(np.diag(np.linalg.inv(Hbb)))
    nu = Q.shape[0]
    G = np.zeros((len(y), nu))
    G[np.arange(len(y)), g] = 1
    Hbu = X.T @ (G * w[:, None])
    Huu = np.diag(np.bincount(g, weights=w, minlength=nu)) + tau * Q.toarray() + 0.1 * np.eye(nu)
    H = np.block([[Hbb, Hbu], [Hbu.T, Huu]])
    return np.sqrt(np.diag(np.linalg.inv(H))[:p])


def carry(b, seen):
    b2 = b.copy()
    m = np.mean([b[bm.RISK_YEARS.index(y)] for y in seen])
    for y in bm.RISK_YEARS:
        if y not in seen:
            b2[bm.RISK_YEARS.index(y)] = m
    return b2


def cols_for(cfg):
    """Model columns after dropping any signals this configuration leaves out."""
    keep = [j for j in SIGNALS if j not in cfg.get("drop", ())]
    own = [f"s_{j}" for j in keep]
    nbs = [f"n_{j}" for j in keep if j not in STATIC]
    return bm.B_COLS + own, bm.C_COLS + own + nbs


def run(cfg, P, tau=None, full=False):
    """Build the outcome + person-period rows for one configuration, fit B and C on the
    training years, score on the test years. cfg keys: rule, q, nb, lag, window, scale,
    train, test, tau_mult, drop, ridge ({model: penalty}), ind (optional noisy indicators)."""
    ind = cfg.get("ind", P["ind"])
    ids = P["ids"]
    nb = P["nb_knn"] if cfg["nb"] == "knn" else P["nb"]
    at_risk, cut = at_risk_set(ind, ids, cfg["q"])
    d_rent, d_ba = changes(ind, ids)
    ev, flips = bm.event_years(at_risk, d_rent, d_ba, cfg["rule"])
    ar = sorted(at_risk)
    ar_model = [t for t in ar if ev[t] is None or ev[t] >= bm.RISK_YEARS[0]]
    rows = bm.person_period(ar_model, ev, ind, nb, d_rent, d_ba, bm.RISK_YEARS)
    sig = P["sig_count"] if cfg["scale"] == "count" else P["sig"]
    add_signals(rows, sig, nb, cfg["lag"], cfg["window"])
    train = [r for r in rows if r["year"] in cfg["train"]]
    test = [r for r in rows if r["year"] in cfg["test"]]
    ytr = np.array([r["y"] for r in train], float)
    yte = np.array([r["y"] for r in test], float)
    Q, gidx = bm.icar_Q(ar, nb)
    gtr = np.array([gidx[r["tract"]] for r in train])
    gte = np.array([gidx[r["tract"]] for r in test])
    b_cols, c_cols = cols_for(cfg)

    out = {"n_at_risk": len(ar), "income_cut": round(cut), "events": sum(1 for t in ar if ev[t]),
           "events_model": sum(1 for t in ar_model if ev[t]), "flip_back": flips,
           "train_events": int(ytr.sum()), "test_events": int(yte.sum()), "test_rows": len(yte),
           "train_rows": len(ytr)}
    fits = {}
    for name, cols, re in (("B", b_cols, False), ("C", c_cols, True)):
        X, mu, sd = bm.design(train, cols)
        Xt, _, _ = bm.design(test, cols, mu, sd)
        rd = cfg.get("ridge", {}).get(name, 1e-2)  # penalty on every coefficient except the year dummies
        if re:
            t_ = tau * cfg.get("tau_mult", 1)
            b, u = bm.fit(X, ytr, gtr, Q, t_, ridge=rd)
            p_te = bm.predict(Xt, carry(b, cfg["train"]), u, gte)
            p_tr = bm.predict(X, b, u, gtr)
            se = hessian_se(X, ytr, b, u, gtr, Q, t_, ridge=rd)
        else:
            b, u = bm.fit(X, ytr, ridge=rd)
            p_te = bm.predict(Xt, carry(b, cfg["train"]))
            p_tr = bm.predict(X, b)
            se = hessian_se(X, ytr, b, ridge=rd)
        coefs = {c: {"b": float(b[K + i]), "se": float(se[K + i])} for i, c in enumerate(cols)}
        fits[name] = {"auc": bm.auc(yte, p_te), "auc_train": bm.auc(ytr, p_tr), "logloss": bm.logloss(yte, p_te),
                      "coefs": coefs, "_p": p_te, "_ptr": p_tr, "_b": b, "_u": u, "_mu": mu, "_sd": sd,
                      "_cols": cols, "_X": X, "_Xt": Xt, "_se": se}
    out["B"] = {k: v for k, v in fits["B"].items() if not k.startswith("_")}
    out["C"] = {k: v for k, v in fits["C"].items() if not k.startswith("_")}

    pos = {t: i for i, t in enumerate(ar)}
    nb_idx = [[pos[n] for n in nb[t] if n in pos] for t in ar]
    for name in ("B", "C"):
        resid = np.bincount(gtr, weights=ytr - fits[name]["_ptr"], minlength=len(ar))
        I, p, _, lo, hi = bm.morans_i(resid, nb_idx, perms=999 if full else 199)
        out[name]["resid_I"] = [round(I, 3), round(p, 3), round(lo, 3), round(hi, 3)]
    if full:
        out["_ctx"] = dict(ar=ar, ar_model=ar_model, ev=ev, rows=rows, train=train, test=test, ytr=ytr, yte=yte,
                           gtr=gtr, gte=gte, Q=Q, gidx=gidx, nb=nb, nb_idx=nb_idx, fits=fits, sig=sig)
    return out


def odds(c):
    return {"or": round(float(np.exp(c["b"])), 3), "lo": round(float(np.exp(c["b"] - 1.96 * c["se"])), 3),
            "hi": round(float(np.exp(c["b"] + 1.96 * c["se"])), 3), "z": round(c["b"] / c["se"], 2)}


def slim(r):
    """What the page needs from one sensitivity run."""
    return {"n_at_risk": r["n_at_risk"], "events": r["events"], "test_events": r["test_events"],
            **{m: {"auc": round(r[m]["auc"], 3), "resid_I": r[m]["resid_I"],
                   "sig": {s: odds(r[m]["coefs"][s]) for s in S_OWN if s in r[m]["coefs"]},
                   **({"nbsig": {s: odds(r[m]["coefs"][s]) for s in S_NB if s in r[m]["coefs"]}} if m == "C" else {})}
               for m in ("B", "C")}}


def sigmoid(e):
    return 1 / (1 + np.exp(-e))


# ── 4. main ──────────────────────────────────────────────────────────
def main():
    t0 = time.time()
    key = bx.census_key()
    print("cached ACS + shapes + neighbors (from build_models.py) ...")
    acs = bm.cached("acs5_tracts_2010_2019", lambda: bm.pull_acs(key))
    shapes = bm.cached("tracts2010", bm.pull_shapes)
    ids, geoms, meta, ind, _, _, _, _ = bm.build_panel(acs, shapes)
    nb_all = bm.cached("queen_nb", lambda: {k: sorted(v) for k, v in bm.queen_neighbors(geoms, ids).items()})
    idset = set(ids)
    nb = {t: [n for n in nb_all.get(t, []) if n in idset] for t in ids}
    nb_knn = knn_neighbors(geoms, ids)
    hh = {t: max(bm.val(acs["2010"][t], "B25003_001") or 1, 1) for t in ids}
    pop = {t: ind[2010][t]["pop"] for t in ids}
    nta_of = {t: meta[t]["nta"] for t in ids}

    print("signals ...")
    permits = bm.cached("dob_permits_2008_2018", pull_permits)
    p_rate, p_raw, permit_match = permit_table(permits, ids, hh, "rate")
    p_count, _, _ = permit_table(permits, ids, hh, "count")
    sales = bm.cached("dof_sales_2009_2016", pull_sales)
    pluto = bm.cached("pluto_bbl_tract2010", pull_pluto)
    s_rate, s_growth, s_src, sale_match, price_fallback, sale_cnt = sales_signals(sales, pluto, ids, hh, nta_of)
    crime_cnt, crime_match = points_in_tracts(bm.cached("nypd_felony_points_2009_2016", pull_crime), geoms, ids)
    c_chg, c_rate = crime_signal(crime_cnt, ids, pop)
    noise_cnt, noise_match = points_in_tracts(bm.cached("nyc311_noise_points_2010_2016", pull_noise), geoms, ids)
    n_rel, n_rate, n_city = noise_signal(noise_cnt, ids, pop)
    sub_km, n_stations = subway_signal(geoms, ids)
    sub = {y: sub_km for y in SIG_YEARS}
    print(f"   matched to a modeled tract: permits {100 * permit_match:.1f}%, sales {100 * sale_match:.1f}%, "
          f"felonies {100 * crime_match:.1f}%, noise {100 * noise_match:.1f}%; price from NTA fallback {100 * price_fallback:.1f}%")
    sig = {"A1": p_rate["A1"], "NB": p_rate["NB"], "DM": p_rate["DM"], "SALES": s_rate, "PRICE": s_growth,
           "CRIME": c_chg, "NOISE": n_rel, "SUBWAY": sub}
    # the "raw count" sensitivity only changes how the permits and sales are scaled
    sig_count = dict(sig, A1=p_count["A1"], NB=p_count["NB"], DM=p_count["DM"],
                     SALES={y: {t: float(np.log1p(sale_cnt[y][t])) for t in ids} for y in sale_cnt})
    # human-scale versions for the page (event-time profiles, totals, worked examples)
    human = {j: {y: {t: 1000 * p_raw[j][y][t] / hh[t] for t in ids} for y in SIG_YEARS} for j in PERMIT_TYPES}
    human["SALES"] = {y: {t: 1000 * sale_cnt[y][t] / hh[t] for t in ids} for y in SALE_YEARS}
    human["PRICE"] = {y: {t: 100 * (np.exp(s_growth[y][t]) - 1) for t in ids} for y in range(2010, 2017)}
    human["CRIME"] = c_rate
    human["NOISE"] = n_rate
    totals = {j: {y: sum(p_raw[j][y].values()) for y in SIG_YEARS} for j in PERMIT_TYPES}
    totals["SALES"] = {y: sum(sale_cnt[y].values()) for y in SALE_YEARS}
    totals["CRIME"] = {y: round(sum(crime_cnt[y].values())) for y in crime_cnt}
    totals["NOISE"] = {y: round(sum(noise_cnt[y].values())) for y in noise_cnt}

    print("ACS margins of error ...")
    moe = bm.cached("acs5_moe_2010_2019", lambda: pull_moe(key))

    P = dict(ind=ind, ids=ids, nb=nb, nb_knn=nb_knn, sig=sig, sig_count=sig_count)
    BASE = dict(rule="v2", q=0.4, nb="queen", lag=1, window=1, scale="rate",
                train=bm.TRAIN_YEARS, test=bm.TEST_YEARS)

    # ── main fit; tau by leave-one-year-out CV inside the training years (as in Part 4)
    print("main fit: picking tau ...")
    cv = {}
    for tau in (0.3, 1, 3, 10, 30):
        lls = []
        for hold in bm.TRAIN_YEARS[1:]:
            cfg = dict(BASE, train=[y for y in bm.TRAIN_YEARS if y != hold], test=[hold])
            lls.append(run(cfg, P, tau)["C"]["logloss"])
        cv[tau] = float(np.mean(lls))
        print(f"   tau={tau}: CV log-loss {cv[tau]:.4f}")
    tau = min(cv, key=cv.get)
    main_ = run(BASE, P, tau, full=True)
    ctx = main_.pop("_ctx")
    fits, yte, test, train = ctx["fits"], ctx["yte"], ctx["test"], ctx["train"]
    for m in ("B", "C"):
        print(f"   {m}: AUC {main_[m]['auc']:.3f}  " + "  ".join(f"{s[2:]} {odds(main_[m]['coefs'][s])['or']}" for s in S_OWN))

    # 30 coefficients on ~200 training events can overfit. Same leave-one-year-out CV as tau, now for a
    # ridge penalty on every non-year coefficient (signals shrink toward "no effect"). Reported, not used in the main fit.
    print("ridge penalty by CV ...")
    ridge_cv = {"B": {}, "C": {}}
    for rd in (0.01, 3, 10, 30, 100, 300):
        lls = {"B": [], "C": []}
        for hold in bm.TRAIN_YEARS[1:]:
            r = run(dict(BASE, ridge={"B": rd, "C": rd}, train=[y for y in bm.TRAIN_YEARS if y != hold], test=[hold]), P, tau)
            for m in ("B", "C"):
                lls[m].append(r[m]["logloss"])
        for m in ("B", "C"):
            ridge_cv[m][rd] = float(np.mean(lls[m]))
        print(f"   ridge={rd}: CV log-loss B {ridge_cv['B'][rd]:.4f} C {ridge_cv['C'][rd]:.4f}")
    ridge_pick = {m: min(ridge_cv[m], key=ridge_cv[m].get) for m in ("B", "C")}
    print(f"   picked {ridge_pick}")

    # same two models without any signals (Part 4's frames) and with permits only (the first Part 5)
    def refit(cols_b, cols_c):
        out_ = {}
        for m, cols, re in (("B", cols_b, False), ("C", cols_c, True)):
            X, mu, sd = bm.design(train, cols)
            Xt, _, _ = bm.design(test, cols, mu, sd)
            b, u = bm.fit(X, ctx["ytr"], ctx["gtr"], ctx["Q"], tau) if re else bm.fit(X, ctx["ytr"])
            p = bm.predict(Xt, carry(b, bm.TRAIN_YEARS), u if re else None, ctx["gte"] if re else None)
            out_[m] = {"auc": round(bm.auc(yte, p), 3), "logloss": round(bm.logloss(yte, p), 4), "_p": p}
        return out_
    nosig = refit(bm.B_COLS, bm.C_COLS)
    permits_only = refit(*cols_for({"drop": [j for j in SIGNALS if j not in PERMIT_TYPES]}))

    # tract-cluster bootstrap: C - B, and all signals vs none within each model
    tr_te = np.array([r["tract"] for r in test])
    uniq = np.unique(tr_te)
    members = {t: np.where(tr_te == t)[0] for t in uniq}
    gaps = {"C_minus_B": [], "B_signal_gain": [], "C_signal_gain": []}
    for _ in range(2000):
        pick = np.concatenate([members[t] for t in RNG.choice(uniq, len(uniq))])
        yy = yte[pick]
        if 0 < yy.sum() < len(pick):
            a = {k: bm.auc(yy, v[pick]) for k, v in (("B", fits["B"]["_p"]), ("C", fits["C"]["_p"]),
                                                       ("B0", nosig["B"]["_p"]), ("C0", nosig["C"]["_p"]))}
            gaps["C_minus_B"].append(a["C"] - a["B"])
            gaps["B_signal_gain"].append(a["B"] - a["B0"])
            gaps["C_signal_gain"].append(a["C"] - a["C0"])
    gap_ci = {k: {"lo": round(float(np.percentile(v, 2.5)), 3), "hi": round(float(np.percentile(v, 97.5)), 3)}
              for k, v in gaps.items()}
    gap_ci["C_minus_B"]["est"] = round(main_["C"]["auc"] - main_["B"]["auc"], 3)
    gap_ci["B_signal_gain"]["est"] = round(main_["B"]["auc"] - nosig["B"]["auc"], 3)
    gap_ci["C_signal_gain"]["est"] = round(main_["C"]["auc"] - nosig["C"]["auc"], 3)
    print(f"   gaps: {gap_ci}")

    # watch list (top 50 going into the first test year)
    ev = ctx["ev"]

    def top_hits(p, n=50):
        risk = {r["tract"]: pp for r, pp in zip(test, p) if r["year"] == bm.TEST_YEARS[0]}
        top = sorted(risk, key=lambda t: -risk[t])[:n]
        return sum(1 for t in top if ev[t] in bm.TEST_YEARS), len(risk)
    hB, pool = top_hits(fits["B"]["_p"])
    hC, _ = top_hits(fits["C"]["_p"])
    n_tip = sum(1 for t in ctx["ar_model"] if ev[t] in bm.TEST_YEARS)
    top50 = {"B": hB, "C": hC, "random": round(50 * n_tip / pool, 1), "pool": pool, "tipped": n_tip}

    # ── where each variable comes from: distributions + coefficients
    ar = ctx["ar"]
    all_rows = ctx["rows"]
    var_out = []
    for key_, fam, label, src, fields, steps, timing in VARS:
        d = {"key": key_, "family": fam, "label": label, "source": src, "fields": fields, "steps": steps, "timing": timing}
        if key_ in all_rows[0]:
            v = np.array([r[key_] for r in all_rows], float)
            d["dist"] = {"q": [round(float(x), 3) for x in np.percentile(v, [5, 25, 50, 75, 95])],
                         "mean": round(float(v.mean()), 3), "sd": round(float(v.std()), 3)}
            lo, hi = np.percentile(v, [1, 99])
            h, e = np.histogram(np.clip(v, lo, hi), bins=24, range=(lo, hi) if hi > lo else None)
            d["hist"] = {"n": h.tolist(), "lo": round(float(e[0]), 3), "hi": round(float(e[-1]), 3)}
            for m in ("B", "C"):
                if key_ in fits[m]["_cols"]:
                    d[m] = {**odds(main_[m]["coefs"][key_]), "b": round(main_[m]["coefs"][key_]["b"], 4)}
        var_out.append(d)
    names = [c for c in C_COLS]
    Xc = np.array([[r[c] for c in names] for r in train], float)
    corr = np.corrcoef(Xc, rowvar=False)
    sig_names = S_OWN
    corr_sig = [[round(float(corr[names.index(a), names.index(b)]), 2) for b in sig_names] for a in sig_names]

    # ── baseline yearly risk: what happened each year vs the fitted alpha_t
    base_risk = []
    for y in bm.RISK_YEARS:
        rows_y = [r for r in all_rows if r["year"] == y]
        e_y = sum(r["y"] for r in rows_y)
        item = {"year": y, "at_risk": len(rows_y), "events": e_y, "rate": round(e_y / len(rows_y), 4),
                "test": y in bm.TEST_YEARS}
        for m in ("B", "C"):
            bb = carry(fits[m]["_b"], bm.TRAIN_YEARS)
            a = float(bb[bm.RISK_YEARS.index(y)])
            item[m] = {"alpha": round(a, 3), "p": round(float(sigmoid(a)), 4)}
        base_risk.append(item)

    # ── worked examples: one tract-year each, raw value -> model value -> contribution
    def describe(j, t, y):
        """Plain-language raw value behind signal j for tract t in signal year y."""
        if j in PERMIT_TYPES:
            return f"{p_raw[j][y][t]} jobs ÷ {round(hh[t]):,} households × 1,000 = {human[j][y][t]:.1f} per 1,000"
        if j == "SALES":
            return f"{sale_cnt[y][t]} sales ÷ {round(hh[t]):,} households × 1,000 = {human['SALES'][y][t]:.1f} per 1,000"
        if j == "PRICE":
            kind, b0, b1, n = s_src[y][t]
            if kind == "none":
                return "too few 1–3 family sales in the tract and neighborhood: set to 0 (no change)"
            return f"{kind} median ${b0:,.0f} per unit (2009–10) → ${b1:,.0f} ({y - 1}–{str(y)[2:]}, {n} sales) = {100 * (b1 / b0 - 1):+.0f}%"
        if j == "CRIME":
            return f"{round(crime_cnt[2009][t])} felonies in 2009 → {round(crime_cnt[y][t])} in {y}; {c_rate[2009][t]:.1f} → {c_rate[y][t]:.1f} per 1,000 residents"
        if j == "NOISE":
            return f"{round(noise_cnt[y][t])} complaints = {n_rate[y][t]:.1f} per 1,000 residents (city: {n_city[y]:.1f})"
        if j == "SUBWAY":
            return f"{sub_km[t]:.2f} km to the nearest station"

    def describe_base(c, t, r, y):
        b0 = ind[2010][t]
        lag = y - 1
        if c == "inc0":
            return f"${b0['income']:,.0f} median household income → log = {r[c]:.2f}"
        if c == "rent0":
            return f"${b0['rent']:,.0f} median rent → log = {r[c]:.2f}"
        if c == "ba0":
            return f"{b0['ba']:.1f}% of adults 25+ have a bachelor's or more"
        if c == "renter0":
            return f"{r[c]:.1f}% of households rent"
        if c == "own_rent_rk":
            return f"rent ${b0['rent']:,.0f} (2010) → ${ind[lag][t]['rent']:,.0f} ({lag}) = {100 * (ind[lag][t]['rent'] / b0['rent'] - 1):+.0f}%; faster than {100 * r[c]:.0f}% of NYC tracts"
        if c == "own_ba_rk":
            return f"college share {b0['ba']:.1f}% → {ind[lag][t]['ba']:.1f}% ({ind[lag][t]['ba'] - b0['ba']:+.1f} pts); faster than {100 * r[c]:.0f}% of NYC tracts"
        if c == "nb_rent_rk":
            return f"average rank of {len(ctx['nb'][t])} neighbors = {r[c]:.2f}"
        if c == "nb_ba_rk":
            return f"average rank of {len(ctx['nb'][t])} neighbors = {r[c]:.2f}"
        if c == "nb_affluent":
            return f"{round(r[c] * len(ctx['nb'][t]))} of {len(ctx['nb'][t])} neighbors were not low-income"
        if c.startswith("n_"):
            return f"average over {len(ctx['nb'][t])} neighbors"
        return ""

    test_y0 = [i for i, r in enumerate(test) if r["year"] == bm.TEST_YEARS[0]]
    want = ["Bushwick South", "Bushwick North", "Central Harlem North-Polo Grounds", "Mott Haven-Port Morris",
            "Sunset Park West", "Crown Heights North", "Washington Heights South", "Jamaica",
            "Bedford", "Stuyvesant Heights", "East Harlem North", "Longwood"]
    picks, used_nta = [], set()
    pC = fits["C"]["_p"]
    # one example per wanted neighborhood: the tract C ranks highest there in the first test year
    for nm in want:
        cand = [i for i in test_y0 if meta[test[i]["tract"]]["ntaname"] == nm]
        if cand and nm not in used_nta:
            picks.append(max(cand, key=lambda i: pC[i]))
            used_nta.add(nm)
    # plus the city's highest- and lowest-risk at-risk tract that year, by C
    picks += [max(test_y0, key=lambda i: pC[i]), min(test_y0, key=lambda i: pC[i])]
    examples = []
    seen_t = set()
    for i in picks:
        r = test[i]
        t, y = r["tract"], r["year"]
        if t in seen_t:
            continue
        seen_t.add(t)
        ex = {"tract": t, "nta": meta[t]["ntaname"], "boro": meta[t]["boro"], "year": y,
              "tipped": ev[t], "models": {}}
        terms = {}
        for c in C_COLS:
            sj = c[2:] if c.startswith("s_") else None
            sy = y - 1
            terms[c] = {"value": round(float(r[c]), 4),
                        "raw": describe(sj, t, sy) if sj else describe_base(c, t, r, y)}
        for m in ("B", "C"):
            F = fits[m]
            bb = carry(F["_b"], bm.TRAIN_YEARS)
            a = float(bb[bm.RISK_YEARS.index(y)])
            contrib = []
            for k_, c in enumerate(F["_cols"]):
                z = (r[c] - F["_mu"][k_]) / F["_sd"][k_]
                contrib.append({"col": c, "z": round(float(z), 3), "b": round(float(F["_b"][K + k_]), 4),
                                "add": round(float(F["_b"][K + k_] * z), 4)})
            u = float(F["_u"][ctx["gidx"][t]]) if m == "C" else 0.0
            eta = a + sum(x["add"] for x in contrib) + u
            ex["models"][m] = {"alpha": round(a, 4), "u": round(u, 4), "contrib": contrib,
                               "eta": round(eta, 4), "p": round(float(sigmoid(eta)), 4),
                               "p_model": round(float(fits[m]["_p"][i]), 4)}
        ex["terms"] = terms
        examples.append(ex)
    print(f"   worked examples: {len(examples)} tracts")

    # ── descriptive: do signals rise BEFORE a tract tips? (event-time means, v2, human units)
    ev_time = {}
    never = [t for t in ar if not ev[t]]
    for j, tab in human.items():
        rel = {}
        for k in range(-4, 2):
            v = [tab[ev[t] + k][t] for t in ar if ev[t] and ev[t] >= 2012 and (ev[t] + k) in tab]
            rel[k] = {"mean": round(float(np.mean(v)), 3) if v else None, "n": len(v)}
        nv = [tab[y][t] for t in never for y in tab if 2010 <= y <= 2016]
        ev_time[j] = {"rel": rel, "never": round(float(np.mean(nv)), 3)}
    sub_tip = [sub_km[t] for t in ar if ev[t]]
    sub_never = [sub_km[t] for t in never]
    ev_time["SUBWAY"] = {"tipped": round(float(np.median(sub_tip)), 3), "never": round(float(np.median(sub_never)), 3)}

    # ── "what changes impact other aspects": a +1 SD shock to one tract's signal, read through C
    C_ = fits["C"]
    h0 = float(np.mean(ctx["ytr"]))
    eta0 = float(np.log(h0 / (1 - h0)))
    ripple = {}
    for j in SIGNALS:
        if j in STATIC:
            continue
        b_own = C_["_b"][K + C_["_cols"].index(f"s_{j}")]
        b_nb = C_["_b"][K + C_["_cols"].index(f"n_{j}")]
        # a +1 SD jump in one tract moves each neighbor's neighbor-mean by 1 SD(own)/n_neighbors; express in n_ SD units
        sd_own, sd_nb = C_["_sd"][C_["_cols"].index(f"s_{j}")], C_["_sd"][C_["_cols"].index(f"n_{j}")]
        n_nb = float(np.median([len(ctx["nb"][t]) for t in ar]))
        d_nb = b_nb * (sd_own / n_nb) / sd_nb
        bB = fits["B"]["_b"][K + fits["B"]["_cols"].index(f"s_{j}")]
        ripple[j] = {"base": round(h0, 4), "own_B": round(float(sigmoid(eta0 + bB)), 4),
                     "own_C": round(float(sigmoid(eta0 + b_own)), 4), "each_nb_C": round(float(sigmoid(eta0 + d_nb)), 4),
                     "n_nb": n_nb}

    # ── sensitivity: one change at a time
    print("sensitivity runs ...")
    by_group = {g: [j for j in SIGNALS if SIGNALS[j][0] == g] for g in GROUPS}
    SCEN = [
        ("base", "Baseline (as fit above)", {}),
        ("v1", "Event: v1 naive (first crossing)", {"rule": "v1"}),
        ("v3", "Event: v3 strict (top third)", {"rule": "v3"}),
        ("q30", "At risk: bottom 30% income", {"q": 0.3}),
        ("q50", "At risk: bottom 50% income", {"q": 0.5}),
        ("knn", "Neighbors: 6 nearest, not touching", {"nb": "knn"}),
        ("lag2", "Signal lag: 2 years, not 1", {"lag": 2}),
        ("count", "Permits + sales: raw count, not per household", {"scale": "count"}),
        ("split", "Test years 2015–17 (train 2012–14)", {"train": [2012, 2013, 2014], "test": [2015, 2016, 2017]}),
        ("tau_lo", "Spatial prior weaker (τ ÷ 3)", {"tau_mult": 1 / 3}),
        ("tau_hi", "Spatial prior stronger (τ × 3)", {"tau_mult": 3}),
        *[(f"drop_{g}", f"Drop {GROUPS[g]}", {"drop": by_group[g]}) for g in GROUPS],
        ("permits_only", "Permits only (the first version of Part 5)", {"drop": [j for j in SIGNALS if j not in PERMIT_TYPES]}),
        ("ridge", f"Shrink effects (ridge by CV: B {ridge_pick['B']:g}, C {ridge_pick['C']:g})", {"ridge": ridge_pick}),
    ]
    sens = []
    for k, lab, ch in SCEN:
        r = main_ if k == "base" else run(dict(BASE, **ch), P, tau)
        sens.append({"key": k, "label": lab, **slim(r)})
        print(f"   {k:13s} events {r['events']:4d}  AUC B {r['B']['auc']:.3f} C {r['C']['auc']:.3f}")

    # ── data noise: redraw rent and BA share inside their ACS margins of error
    print("data-noise Monte Carlo ...")
    rho, R = 0.8, 30  # adjacent 5-yr vintages share 4 of 5 survey years -> strongly correlated errors

    def ba_se(y, t):
        m = moe[str(y)].get(t)
        if not m:
            return 0.0
        den = bm.val(m, "B15002_001") or 0
        num_ = sum(bm.val(m, v) or 0 for v in bm.B15002_BA)
        if not den:
            return 0.0
        moe_num = np.sqrt(sum((bx.num(m.get(v + "M"), 0) or 0) ** 2 for v in bm.B15002_BA))
        moe_den = bx.num(m.get("B15002_001M"), 0) or 0
        p = num_ / den
        inside = moe_num ** 2 - p ** 2 * moe_den ** 2
        if inside < 0:
            inside = moe_num ** 2 + p ** 2 * moe_den ** 2
        return 100 * np.sqrt(inside) / den / 1.645

    def rent_se(y, t):
        m = moe[str(y)].get(t)
        v = bx.num(m.get("B25064_001M"), -1) if m else -1
        return v / 1.645 if v and v > 0 else 0.0
    se_r = {y: {t: rent_se(y, t) for t in ids} for y in bm.YEARS}
    se_b = {y: {t: ba_se(y, t) for t in ids} for y in bm.YEARS}
    med_rel = float(np.median([se_r[y][t] / ind[y][t]["rent"] for y in bm.YEARS for t in ids if ind[y][t]["rent"]]))
    med_ba = float(np.median([se_b[y][t] for y in bm.YEARS for t in ids]))
    print(f"   median SE: rent {100 * med_rel:.1f}% of the estimate, BA share {med_ba:.1f} pts")
    base_ev = ctx["ev"]
    mc = []
    for rep in range(R):
        zr = {t: 0.0 for t in ids}
        zb = {t: 0.0 for t in ids}
        noisy = {}
        for y in bm.YEARS:
            e_r, e_b = RNG.standard_normal(len(ids)), RNG.standard_normal(len(ids))
            noisy[y] = {}
            for i, t in enumerate(ids):
                zr[t] = rho * zr[t] + np.sqrt(1 - rho ** 2) * e_r[i] if y > 2010 else e_r[i]
                zb[t] = rho * zb[t] + np.sqrt(1 - rho ** 2) * e_b[i] if y > 2010 else e_b[i]
                d = dict(ind[y][t])
                d["rent"] = max(50.0, d["rent"] + zr[t] * se_r[y][t])
                d["ba"] = min(100.0, max(0.0, d["ba"] + zb[t] * se_b[y][t]))
                noisy[y][t] = d
        r = run(dict(BASE, ind=noisy), P, tau)
        at_r, _ = at_risk_set(noisy, ids, 0.4)
        d_rent, d_ba = changes(noisy, ids)
        ev_n, _ = bm.event_years(at_r, d_rent, d_ba, "v2")
        same = set(ctx["ar"]) & at_r
        changed = sum(1 for t in same if bool(ev_n[t]) != bool(base_ev[t]))
        mc.append({"events": r["events"], "status_changed": changed, "n_compared": len(same),
                   "auc_B": round(r["B"]["auc"], 3), "auc_C": round(r["C"]["auc"], 3),
                   **{f"{m}_{s}": odds(r[m]["coefs"][s])["or"] for m in ("B", "C") for s in S_OWN},
                   **{f"{m}_{s}_clear": int(odds(r[m]["coefs"][s])["lo"] > 1 or odds(r[m]["coefs"][s])["hi"] < 1)
                      for m in ("B", "C") for s in S_OWN},
                   "I_B": r["B"]["resid_I"][0], "pI_B": r["B"]["resid_I"][1],
                   "I_C": r["C"]["resid_I"][0], "pI_C": r["C"]["resid_I"][1]})
        print(f"   rep {rep + 1:2d}: events {r['events']}, {changed} tracts flip status, AUC B {mc[-1]['auc_B']} C {mc[-1]['auc_C']}")

    # ── "if I had done it differently": counterfactuals that change the answer
    print("counterfactuals ...")
    cf = {}
    # (a) hindsight leak: let C see neighbors' *confirmed* events (needs data from t+2)
    leak_cols = C_COLS + ["nb_tipped_hindsight"]
    X, mu, sd = bm.design(train, leak_cols)
    Xt, _, _ = bm.design(test, leak_cols, mu, sd)
    b, u = bm.fit(X, ctx["ytr"], ctx["gtr"], ctx["Q"], tau)
    cf["leak"] = {"auc": round(bm.auc(yte, bm.predict(Xt, carry(b, bm.TRAIN_YEARS), u, ctx["gte"])), 3)}
    # (b) graded on the years it trained on
    cf["insample"] = {m: round(main_[m]["auc_train"], 3) for m in ("B", "C")}
    # (c) v1 events / (d) B alone -> its confidence intervals vs C's
    cf["v1"] = next(s for s in sens if s["key"] == "v1")
    cf["width"] = {s: {m: round(float(np.log(odds(main_[m]["coefs"][s])["hi"] / odds(main_[m]["coefs"][s])["lo"])), 3)
                       for m in ("B", "C")} for s in S_OWN}
    cf["permits_only"] = {m: permits_only[m]["auc"] for m in ("B", "C")}

    # map payloads: per-tract averages 2011-16 of a few signals (geometry comes from models_check.json)
    maps = {
        "A1": {t: round(float(np.mean([human["A1"][y][t] for y in range(2011, 2017)])), 2) for t in ids},
        "SALES": {t: round(float(np.mean([human["SALES"][y][t] for y in range(2011, 2017)])), 1) for t in ids},
        "PRICE": {t: round(human["PRICE"][2016][t], 1) for t in ids},
        "CRIME": {t: round(100 * (np.exp(c_chg[2016][t]) - 1), 1) for t in ids},
        "NOISE": {t: round(float(np.mean([n_rate[y][t] for y in range(2011, 2017)])), 1) for t in ids},
        "SUBWAY": {t: round(sub_km[t], 2) for t in ids},
    }

    out = {
        "built_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "signals": {j: {"group": SIGNALS[j][0], "label": SIGNALS[j][1], "static": j in STATIC,
                        "total": totals.get(j)} for j in SIGNALS},
        "groups": GROUPS, "families": FAMILY, "sources": {k: list(v) for k, v in SRC.items()},
        "variables": var_out, "corr_signals": {"names": S_OWN, "r": corr_sig},
        "match": {"permits": round(permit_match, 4), "sales": round(sale_match, 4), "crime": round(crime_match, 4),
                  "noise": round(noise_match, 4), "price_fallback": round(price_fallback, 4), "stations": n_stations},
        "noise_city": {y: round(v, 2) for y, v in n_city.items()},
        "tau": tau, "cv": cv, "ridge_cv": ridge_cv, "ridge_pick": ridge_pick,
        "main": {k: v for k, v in main_.items() if k not in ("B", "C")},
        "models": {m: {"auc": round(main_[m]["auc"], 3), "auc_nosig": nosig[m]["auc"], "auc_permits": permits_only[m]["auc"],
                       "logloss": round(main_[m]["logloss"], 4), "logloss_nosig": nosig[m]["logloss"],
                       "resid_I": main_[m]["resid_I"], "n_terms": len(fits[m]["_cols"]) + K,
                       "coefs": {c: {**odds(v), "b": round(v["b"], 4), "se": round(v["se"], 4)} for c, v in main_[m]["coefs"].items()}}
                   for m in ("B", "C")},
        "baseline_risk": base_risk, "examples": examples,
        "gaps": gap_ci, "top50": top50, "event_time": ev_time, "ripple": ripple,
        "sensitivity": sens,
        "noise": {"reps": mc, "rho": rho, "median_rent_se_pct": round(100 * med_rel, 1), "median_ba_se_pts": round(med_ba, 1),
                  "base_events": main_["events"]},
        "counterfactual": cf, "maps": maps,
    }
    bx.write("models_signals", out)
    print(f"done ({time.time() - t0:.0f}s)")


if __name__ == "__main__":
    main()
