"""
build_case_study.py -- one neighborhood, many datasets, every year we have.

Case study: Bushwick, Brooklyn (Community District 4). The NYU Furman Center's
2016 gentrification report lists Bushwick among the city's 15 "gentrifying"
sub-borough areas (low-income in 1990, above-median rent growth 1990-2014).
This script lines up what each open dataset recorded there, year by year,
next to comparison areas, and writes ../assets/nyc-explorer/case_bushwick*.json
for the "Case Study: Bushwick" page.

Still descriptive: it shows what changed and when. No models, no tests.

Comparison areas (same geography types, so the lines are like-for-like):
  * Williamsburg/Greenpoint (CD 1) -- the next-door area Furman ranks #1 for
    rent growth, i.e. the neighbor that changed first.
  * East New York (CD 5) -- also low-income in 1990 but NOT on Furman's
    gentrifying list: a "didn't gentrify (by that definition)" reference.
  * Brooklyn and NYC overall.

Needs `requests` + `xlrd` (old DOF sales files are .xls) and the Census key
(CENSUS_API_KEY or nyc-data-explorer/.census_key).

Usage:  python build_case_study.py
"""

import csv
import io
import statistics
import time
import zipfile
from datetime import datetime, timezone
from pathlib import Path

import requests

import build_explorer_data as bx  # shared fetch helpers + output dir

HERE = Path(__file__).resolve().parent
CACHE = HERE / ".cache" / "dof"
NYC = bx.NYC
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Safari/537.36"}

# ACS 1-year PUMA codes. PUMAs were redrawn for the 2022 vintage, so each area has two codes.
AREAS = {
    "Bushwick":       {"puma_old": "04002", "puma_new": "04304", "cd": "304", "pct": 83, "se": "Bushwick"},
    "Williamsburg":   {"puma_old": "04001", "puma_new": "04301", "cd": "301", "pct": 90, "se": "Williamsburg"},
    "East New York":  {"puma_old": "04008", "puma_new": "04305", "cd": "305", "pct": 75, "se": "East New York"},
}
BUSHWICK_NTAS = ("BK0401", "BK0402")

# ACS variables. Sums are built from these parts in derive().
B15002_BA = [f"B15002_{i:03d}" for i in (15, 16, 17, 18, 32, 33, 34, 35)]   # bachelor's or higher, 25+
B01001_2034 = [f"B01001_{i:03d}" for i in (8, 9, 10, 11, 12, 32, 33, 34, 35, 36)]  # ages 20-34
ACS_GET = ["B01003_001", "B25064_001", "B19013_001", "B25077_001", "B15002_001", "B03002_001", "B03002_003",
           "B03002_004", "B03002_012", "B01001_001", "B25003_001", "B25003_003", "B17001_001", "B17001_002",
           *B15002_BA, *B01001_2034]


def acs_val(x):
    v = bx.num(x, None)
    return None if v is None or v < 0 else v


def derive(r):
    """Raw ACS row -> the handful of indicators the page shows."""
    g = lambda k: acs_val(r.get(k + "E"))
    share = lambda part, whole: round(100 * part / whole, 1) if part is not None and whole else None
    ba = sum(g(k) or 0 for k in B15002_BA)
    young = sum(g(k) or 0 for k in B01001_2034)
    return {
        "pop": g("B01003_001"), "rent": g("B25064_001"), "income": g("B19013_001"), "home_value": g("B25077_001"),
        "ba_pct": share(ba, g("B15002_001")), "white_pct": share(g("B03002_003"), g("B03002_001")),
        "black_pct": share(g("B03002_004"), g("B03002_001")), "hisp_pct": share(g("B03002_012"), g("B03002_001")),
        "age2034_pct": share(young, g("B01001_001")), "renter_pct": share(g("B25003_003"), g("B25003_001")),
        "poverty_pct": share(g("B17001_002"), g("B17001_001")),
    }


def build_acs1(key):
    print("ACS 1-year (PUMAs, Brooklyn, NYC) ...")
    get = ",".join(v + "E" for v in ACS_GET)
    out = {name: {} for name in [*AREAS, "Brooklyn", "NYC"]}
    for year in range(2005, datetime.now().year):
        geo_rows = []
        for name, a in AREAS.items():
            code = a["puma_new"] if year >= 2022 else a["puma_old"]
            rows = bx.census_get(f"{year}/acs/acs1", {"get": get, "for": f"public use microdata area:{code}",
                                                      "in": "state:36"}, key)
            if rows:
                geo_rows.append((name, rows[0]))
        bk = bx.census_get(f"{year}/acs/acs1", {"get": get, "for": "county:047", "in": "state:36"}, key)
        ny = bx.census_get(f"{year}/acs/acs1", {"get": get, "for": "place:51000", "in": "state:36"}, key)
        if bk:
            geo_rows.append(("Brooklyn", bk[0]))
        if ny:
            geo_rows.append(("NYC", ny[0]))
        for name, r in geo_rows:
            out[name][year] = derive(r)
        print(f"   {year}: {len(geo_rows)} areas" + ("" if geo_rows else " (not released)"))
    return out


def build_all_pumas(key):
    """Every NYC PUMA in 2012 and 2019 (same 2010-era boundaries both years) so the page can
    place Bushwick against the published gentrification definitions (Furman / Comptroller style)."""
    print("ACS 1-year, all NYC PUMAs (2012, 2019) ...")
    get = "NAME," + ",".join(v + "E" for v in ACS_GET)
    out = {}
    for year in (2012, 2019):
        rows = bx.census_get(f"{year}/acs/acs1", {"get": get, "for": "public use microdata area:*", "in": "state:36"}, key) or []
        out[year] = {r["public use microdata area"]: {"name": r["NAME"].split("--")[-1].replace(" PUMA, New York", "").replace(" PUMA; New York", ""),
                                                      "cd": r["NAME"].split("--")[0].replace("NYC-", ""), **derive(r)}
                     for r in rows if r["NAME"].startswith("NYC-")}
        print(f"   {year}: {len(out[year])} NYC PUMAs")
    return out


def build_tracts(key):
    """5-year ACS for Bushwick's 29 tracts in three non-overlapping windows, plus tract shapes."""
    print("ACS 5-year tracts + shapes ...")
    shapes = bx.soql(NYC, "63ge-mke6", select="ct2020, nta2020, ntaname, the_geom",
                     where=f"nta2020 in ({','.join(repr(n) for n in BUSHWICK_NTAS)})", limit=100)
    ids = {s["ct2020"] for s in shapes}
    get = ",".join(v + "E" for v in ACS_GET)
    vintages = {}
    for year in (2010, 2015, 2024):  # 2006-10, 2011-15, 2020-24
        rows = bx.census_get(f"{year}/acs/acs5", {"get": get, "for": "tract:*", "in": "state:36 county:047"}, key) or []
        vintages[year] = {r["tract"]: derive(r) for r in rows if r["tract"] in ids}
        print(f"   acs5 {year}: {len(vintages[year])}/{len(ids)} tracts")

    def rnd(c):  # round coordinates to ~1 m to keep the file small
        return [rnd(x) for x in c] if isinstance(c[0], list) else [round(c[0], 5), round(c[1], 5)]
    feats = [{"type": "Feature", "properties": {"tract": s["ct2020"], "nta": s["nta2020"], "ntaname": s["ntaname"]},
              "geometry": {"type": s["the_geom"]["type"], "coordinates": rnd(s["the_geom"]["coordinates"])}}
             for s in shapes]
    return {"windows": {2010: "2006–2010", 2015: "2011–2015", 2024: "2020–2024"}, "values": vintages,
            "geo": {"type": "FeatureCollection", "features": feats}}


def build_streeteasy():
    print("StreetEasy asking rent ...")
    blob = None
    for url in bx.STREETEASY_RENT:
        try:
            r = requests.get(url, timeout=180)
            r.raise_for_status()
            blob = r.content
            break
        except requests.RequestException as e:
            print(f"   {url}: {e!s:.80}")
    z = zipfile.ZipFile(io.BytesIO(blob))
    rows = list(csv.reader(io.TextIOWrapper(z.open(next(n for n in z.namelist() if n.endswith(".csv"))), encoding="utf-8")))
    months = rows[0][3:]
    want = {a["se"]: n for n, a in AREAS.items()} | {"Brooklyn": "Brooklyn", "NYC": "NYC"}
    series = {}
    for r in rows[1:]:
        if r[0] in want:
            series[want[r[0]]] = [bx.num(v, None) if v else None for v in r[3:]]
    return {"months": months, "series": series}


def build_crime():
    print("NYPD complaints (precincts 83 / 90 / 75 + city) ...")
    groups = ["ROBBERY", "FELONY ASSAULT", "BURGLARY", "GRAND LARCENY", "DANGEROUS DRUGS"]
    inlist = ",".join(f"'{g}'" for g in groups)
    pcts = ",".join(str(a["pct"]) for a in AREAS.values())
    by_pct = bx.soql_all(NYC, bx.NYPD_HIST, select="addr_pct_cd as p, date_extract_y(rpt_dt) as y, ofns_desc as o, count(*) as n",
                         where=f"addr_pct_cd in ({pcts}) and ofns_desc in ({inlist})", group="p, y, o")
    tot_pct = bx.soql_all(NYC, bx.NYPD_HIST, select="addr_pct_cd as p, date_extract_y(rpt_dt) as y, count(*) as n",
                          where=f"addr_pct_cd in ({pcts})", group="p, y")
    city = bx.soql_all(NYC, bx.NYPD_HIST, select="date_extract_y(rpt_dt) as y, ofns_desc as o, count(*) as n",
                       where=f"ofns_desc in ({inlist})", group="y, o")
    city_tot = bx.soql(NYC, bx.NYPD_HIST, select="date_extract_y(rpt_dt) as y, count(*) as n", group="y", order="y")
    pct_name = {a["pct"]: n for n, a in AREAS.items()}
    out = {n: {"total": {}, **{g: {} for g in groups}} for n in [*AREAS, "NYC"]}
    for r in by_pct:
        out[pct_name[int(bx.num(r["p"]))]][r["o"]][int(r["y"])] = int(r["n"])
    for r in tot_pct:
        out[pct_name[int(bx.num(r["p"]))]]["total"][int(r["y"])] = int(r["n"])
    for r in city:
        out["NYC"][r["o"]][int(r["y"])] = int(r["n"])
    for r in city_tot:
        out["NYC"]["total"][int(r["y"])] = int(r["n"])
    return {"groups": ["total", *groups], "series": out, "precincts": {n: a["pct"] for n, a in AREAS.items()}}


def build_housing():
    print("Housing Database (new buildings, CD 304 / 301 / 305 + city) ...")
    out = {}
    for name, a in [*AREAS.items(), ("NYC", None)]:
        where = "job_type = 'New Building'" + (f" and commntydst = '{a['cd']}'" if a else "")
        permitted = bx.soql_all(NYC, "br6q-ssj3", select="permityear as y, sum(classanet) as u, count(*) as n", where=where, group="y")
        completed = bx.soql_all(NYC, "br6q-ssj3", select="compltyear as y, sum(classanet) as u", where=where + " and compltyear is not null", group="y")
        out[name] = {"permitted_units": {int(r["y"]): int(bx.num(r["u"])) for r in permitted if r.get("y")},
                     "permitted_jobs": {int(r["y"]): int(bx.num(r["n"])) for r in permitted if r.get("y")},
                     "completed_units": {int(r["y"]): int(bx.num(r["u"])) for r in completed if r.get("y")}}
    alts = bx.soql_all(NYC, "br6q-ssj3", select="permityear as y, count(*) as n",
                       where="job_type = 'Alteration' and commntydst = '304'", group="y")
    out["Bushwick"]["alteration_jobs"] = {int(r["y"]): int(r["n"]) for r in alts if r.get("y")}
    return out


def dof_old_year(year):
    """Brooklyn annualized sales .xls for 2007-2015 -> list of (neighborhood, class category, price)."""
    import xlrd
    P = "https://www.nyc.gov/assets/finance/downloads"
    url = {2007: f"{P}/excel/rolling_sales/sales_2007_brooklyn.xls",
           2008: f"{P}/pdf/09pdf/rolling_sales/sales_2008_brooklyn.xls",
           2009: f"{P}/pdf/rolling_sales/annualized-sales/2009_brooklyn.xls"}.get(
        year, f"{P}/pdf/rolling_sales/annualized-sales/{year}/{year}_brooklyn.xls")
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / f"{year}_brooklyn.xls"
    if not path.exists():
        r = requests.get(url, headers=UA, timeout=180)
        r.raise_for_status()
        if r.content[:9].lower().startswith(b"<!doctype"):
            raise RuntimeError(f"DOF {year}: got an HTML page, not a spreadsheet")
        path.write_bytes(r.content)
    s = xlrd.open_workbook(str(path)).sheet_by_index(0)
    h = next(i for i in range(12) if any("SALE PRICE" in str(c.value).upper().replace("\n", " ") for c in s.row(i)))
    cols = [str(c.value).upper().replace("\n", " ").strip() for c in s.row(h)]
    ni, ci, pi = cols.index("NEIGHBORHOOD"), cols.index("BUILDING CLASS CATEGORY"), cols.index("SALE PRICE")
    return [(str(s.cell_value(i, ni)).strip().upper(), str(s.cell_value(i, ci)).strip(), bx.num(s.cell_value(i, pi)))
            for i in range(h + 1, s.nrows)]


def build_sales():
    """Median price of 1-3 family homes (the typical Bushwick building), market sales only (> $10K)."""
    print("DOF sales 2007-2025 (Bushwick vs. Brooklyn) ...")
    fam = ("01", "02", "03")
    out = {"Bushwick": {}, "Brooklyn": {}}
    for year in range(2007, 2016):
        rows = dof_old_year(year)
        for name, keep in (("Bushwick", lambda n: n == "BUSHWICK"), ("Brooklyn", lambda n: True)):
            prices = sorted(p for n, c, p in rows if keep(n) and c[:2] in fam and p > 10000)
            allr = [1 for n, c, p in rows if keep(n)]
            out[name][year] = {"median": statistics.median(prices) if prices else None, "n": len(prices),
                               "all_rows": len(allr), "zero_price": sum(1 for n, c, p in rows if keep(n) and p <= 10000)}
        print(f"   {year}: Bushwick {out['Bushwick'][year]['n']} 1–3 family market sales")
    fam_where = "(building_class_category like '01%' or building_class_category like '02%' or building_class_category like '03%') and sale_price > 10000"
    for name, extra in (("Bushwick", " and neighborhood = 'BUSHWICK'"), ("Brooklyn", "")):
        for year in range(2016, 2026):
            w = f"borough = '3' and sale_date between '{year}-01-01' and '{year}-12-31T23:59:59'"
            med = bx.soql(NYC, bx.SALES, select="median(sale_price) as m, count(*) as n", where=w + extra + " and " + fam_where)
            allr = bx.scalar(NYC, bx.SALES, "count(*)", w + extra)
            zero = bx.scalar(NYC, bx.SALES, "count(*)", w + extra + " and sale_price <= 10000")
            out[name][year] = {"median": bx.num(med[0].get("m"), None) if med else None, "n": int(bx.num(med[0].get("n"))) if med else 0,
                               "all_rows": int(bx.num(allr)), "zero_price": int(bx.num(zero))}
    return out


def main():
    key = bx.census_key()
    t0 = time.time()
    data = {
        "built_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "areas": {n: {k: v for k, v in a.items() if k != "se"} for n, a in AREAS.items()},
        "acs1": build_acs1(key),
        "pumas": build_all_pumas(key),
        "streeteasy": build_streeteasy(),
        "crime": build_crime(),
        "housing": build_housing(),
        "sales": build_sales(),
    }
    tracts = build_tracts(key)
    bx.write("case_bushwick", data)
    bx.write("case_bushwick_tracts", tracts)
    print(f"done ({time.time() - t0:.0f}s)")


if __name__ == "__main__":
    main()
