"""
rns_pulls.py -- raw data pulls for Part 6, the Rising Neighborhood Score (build_rising.py).

Everything is cached in .cache/models/ (gitignored) so the model script reruns in a minute.
Run it alone first (python rns_pulls.py): the 311 and NYPD pulls take a while.

  DOF annualized sales 2007-2025   one file per borough-year from nyc.gov (.xls to 2017, .xlsx after)
  ACS 5-year 2020-2023 tracts      same variables as Part 4, on 2020 tract lines
  Census 2020 -> 2010 tract file   to put the 2020-line tracts into 2010 NTAs
  DOB permits 2008-2023            BIS ipu4-2q9a (Part 5's cache to 2018 + 2019-23) and DOB NOW w9ak-ipjd
  311 noise by type 2010-2025      76ig-c548 (2010-19) + erm2-nwe9 (2020+), four complaint types
  NYPD felonies 2007-2025          qgea-i56i (Part 5's cache covers 2009-16)
  Parks properties                 enfh-gkve (for the park-walk filter)
"""

import json
from pathlib import Path

import requests

import build_explorer_data as bx
import build_models as bm
import build_signals as bs

HERE = Path(__file__).resolve().parent
DOF = HERE / ".cache" / "dof"
UA = bs.UA
SALE_YEARS = list(range(2007, 2026))
ACS_NEW = [2020, 2021, 2022, 2023]
NOISE_YEARS = list(range(2010, 2026))
CRIME_YEARS = list(range(2007, 2026))
PERMIT_NEW = list(range(2019, 2024))
NOW_YEARS = list(range(2016, 2024))
# four kinds of 311 noise: what the complaint is about, not how loud it is
NOISE_KINDS = {
    "RES": "complaint_type='Noise - Residential'",
    "COM": "complaint_type='Noise - Commercial'",
    "STR": "complaint_type='Noise - Street/Sidewalk'",
    "CON": "complaint_type='Noise' and (descriptor like '%Construction%' or descriptor like '%Jack Hammer%')",
}
REL_URL = "https://www2.census.gov/geo/docs/maps-data/data/rel2020/tract/tab20_tract20_tract10_st36.txt"


# ── DOF sales ────────────────────────────────────────────────────────
def dof_url(y, boro):
    root = "https://www.nyc.gov/assets/finance/downloads"
    P = f"{root}/pdf/rolling_sales/annualized-sales"
    if y == 2007:
        return f"{root}/excel/rolling_sales/sales_2007_{boro}.xls"
    if y == 2008:
        return f"{root}/pdf/09pdf/rolling_sales/sales_2008_{boro}.xls"
    if y == 2009:
        return f"{P}/2009_{boro}.xls"
    if y >= 2020 and boro == "statenisland":  # DOF renamed the file in 2020
        boro = "staten_island"
    return f"{P}/{y}/{y}_{boro}.{'xlsx' if y >= 2018 else 'xls'}"


def read_xlsx(path):
    """Same columns as bs.read_xls, from the .xlsx files DOF posts since 2018."""
    import openpyxl
    ws = openpyxl.load_workbook(str(path), read_only=True).worksheets[0]
    rows = ws.iter_rows(values_only=True)
    for _ in range(15):
        head = [str(c or "").upper().replace("\n", " ").replace("  ", " ").strip() for c in next(rows)]
        if any("SALE PRICE" in c for c in head):
            break
    ix = {k: next(i for i, c in enumerate(head) if c.startswith(k)) for k in
          ("BOROUGH", "BUILDING CLASS CATEGORY", "BLOCK", "LOT", "RESIDENTIAL UNITS", "SALE PRICE")}
    out = []
    for r in rows:
        try:
            out.append([str(int(float(r[ix["BOROUGH"]]))), str(r[ix["BUILDING CLASS CATEGORY"]]).strip()[:2],
                        int(float(r[ix["BLOCK"]])), int(float(r[ix["LOT"]])),
                        int(float(r[ix["RESIDENTIAL UNITS"]] or 0)), float(r[ix["SALE PRICE"]] or 0)])
        except (ValueError, TypeError):
            continue
    return out


def pull_sales():
    DOF.mkdir(parents=True, exist_ok=True)
    out = {}
    for y in SALE_YEARS:
        out[y] = []
        for boro in bs.DOF_BOROS:
            url = dof_url(y, boro)
            path = DOF / f"{y}_{boro}.{url.rsplit('.', 1)[1]}"  # cached under the old name either way
            if not path.exists():
                r = requests.get(url, headers=UA, timeout=300)
                r.raise_for_status()
                path.write_bytes(r.content)
            out[y] += read_xlsx(path) if path.suffix == ".xlsx" else bs.read_xls(path)
        print(f"   sales {y}: {len(out[y]):,} rows")
    return out


# ── ACS on 2020 lines + the 2020 -> 2010 tract file ──────────────────
def pull_acs_new(key):
    get = ",".join(v + "E" for v in bm.ACS_GET)
    out = {}
    for y in ACS_NEW:
        rows = []
        for county in bm.COUNTY_BORO:
            rows += bx.census_get(f"{y}/acs/acs5", {"get": get, "for": "tract:*", "in": f"state:36 county:{county}"}, key) or []
        out[y] = {county_tract(r["county"], r["tract"]): {k: r[k] for k in r if k.endswith("E")} for r in rows}
        print(f"   acs5 {y} (2020 lines): {len(out[y])} tracts")
    return out


def county_tract(county, tract):
    return bm.COUNTY_BORO[county] + tract


def pull_rel():
    """2020 tract -> the 2010 tract it shares the most land with (NYC only)."""
    txt = requests.get(REL_URL, timeout=300).content.decode("utf-8-sig")
    best = {}
    for line in txt.splitlines()[1:]:
        f = line.split("|")
        g20, g10, part = f[1], f[8], int(f[14] or 0)
        if g20[2:5] not in bm.COUNTY_BORO or g10[2:5] not in bm.COUNTY_BORO:
            continue
        k20, k10 = county_tract(g20[2:5], g20[5:]), county_tract(g10[2:5], g10[5:])
        if part > best.get(k20, ("", -1))[1]:
            best[k20] = (k10, part)
    print(f"   2020 -> 2010 tract matches: {len(best)}")
    return {k: v[0] for k, v in best.items()}


# ── permits ──────────────────────────────────────────────────────────
def pull_bis_new():
    out = {}
    for job, (ptype, _, _) in bs.PERMIT_TYPES.items():
        for y in PERMIT_NEW:
            rows = bx.soql_all(bx.NYC, bs.PERMITS, select="borough, gis_census_tract, count(distinct job__) as n",
                               where=f"job_type='{job}' and permit_type='{ptype}' and filing_status='INITIAL' "
                                     f"and issuance_date like '%/{y}'",
                               group="borough, gis_census_tract")
            out[f"{job}_{y}"] = rows
            print(f"   BIS {job} {y}: {sum(int(r['n']) for r in rows):,} jobs")
    return out


NOW_TYPES = {"NB": "New Building", "DM": "Full Demolition", "A1": "Alteration CO"}


def pull_dob_now():
    """DOB NOW job filings: initial filings (-I1) by the year their first permit was issued, as points."""
    out = {}
    for job, jt in NOW_TYPES.items():
        out[job] = {}
        for y in NOW_YEARS:
            rows = bx.soql_all(bx.NYC, "w9ak-ipjd", select="latitude, longitude, count(*) as n",
                               where=f"job_type='{jt}' and job_filing_number like '%-I1' and latitude is not null "
                                     f"and first_permit_date between '{y}-01-01T00:00:00' and '{y}-12-31T23:59:59'",
                               group="latitude, longitude")
            out[job][y] = [[float(r["longitude"]), float(r["latitude"]), int(r["n"])] for r in rows]
            print(f"   DOB NOW {job} {y}: {sum(r[2] for r in out[job][y]):,} jobs")
    return out


# ── 311 noise by kind, NYPD felonies, parks ──────────────────────────
QUARTERS = [("01-01", "03-31"), ("04-01", "06-30"), ("07-01", "09-30"), ("10-01", "12-31")]


def pull_noise_year(kind, y):
    """One kind-year, one quarter per query (a full year of erm2-nwe9 times out), points merged."""
    cond = NOISE_KINDS[kind]
    ds = "76ig-c548" if y <= 2019 else "erm2-nwe9"
    pts = {}
    for a, b in QUARTERS:
        rows = bx.soql_all(bx.NYC, ds, select="latitude, longitude, count(*) as n",
                           where=f"({cond}) and created_date between '{y}-{a}T00:00:00' and '{y}-{b}T23:59:59' "
                                 f"and latitude is not null", group="latitude, longitude")
        for r in rows:
            k = (float(r["longitude"]), float(r["latitude"]))
            pts[k] = pts.get(k, 0) + int(r["n"])
    out = [[x, yy, n] for (x, yy), n in pts.items()]
    print(f"   311 {kind} {y}: {sum(r[2] for r in out):,}")
    return out


def pull_noise_kinds():
    # each kind-year is its own cache file, so a timeout resumes instead of starting over
    return {kind: {y: bm.cached(f"rns_noise_{kind}_{y}", lambda k=kind, yy=y: pull_noise_year(k, yy)) for y in NOISE_YEARS}
            for kind in NOISE_KINDS}


def pull_felonies():
    old = bm.cached("nypd_felony_points_2009_2016", bs.pull_crime)
    out = {int(y): v for y, v in old.items()}
    for y in CRIME_YEARS:
        if y not in out:
            out[y] = bm.cached(f"rns_felony_{y}", lambda yy=y: bs.pull_points(
                "qgea-i56i", lambda z: f"law_cat_cd='FELONY' and cmplnt_fr_dt between '{z}-01-01T00:00:00' and '{z}-12-31T23:59:59'", [yy])[yy])
    return out


PARK_TYPES = ("Neighborhood Park", "Community Park", "Flagship Park", "Nature Area", "Waterfront Facility",
              "Recreational Field/Courts", "Playground", "Jointly Operated Playground", "Historic House Park")


def pull_parks():
    types = ",".join(f"'{t}'" for t in PARK_TYPES)
    rows = bx.soql_all(bx.NYC, "enfh-gkve", select="signname, typecategory, acres, multipolygon",
                       where=f"typecategory in ({types}) and acres >= 1 and retired='False'")
    print(f"   parks of 1+ acre: {len(rows)}")
    return rows


def all_pulls(key):
    return dict(
        sales=bm.cached("rns_sales_2007_2025", pull_sales),
        acs_new=bm.cached("rns_acs5_2020lines_2020_2023", lambda: pull_acs_new(key)),
        rel=bm.cached("rns_tract20_to_tract10", pull_rel),
        bis_old=bm.cached("dob_permits_2008_2018", bs.pull_permits),
        bis_new=bm.cached("rns_bis_permits_2019_2023", pull_bis_new),
        now=bm.cached("rns_dobnow_points_2016_2023", pull_dob_now),
        noise=bm.cached("rns_noise_kinds_2010_2025", pull_noise_kinds),
        felony=bm.cached("rns_felony_points_2007_2025", pull_felonies),
        parks=bm.cached("rns_parks", pull_parks),
    )


if __name__ == "__main__":
    all_pulls(bx.census_key())
    print("all pulls cached")
