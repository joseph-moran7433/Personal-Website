"""
build_explorer_data.py -- precompute every number, chart series, and map
layer the NYC Data Explorer page shows, straight from the live open-data
APIs, and write them as small JSON files to ../assets/nyc-explorer/.

This is a *profiling* script, not an analysis script: everything it
computes describes what a dataset contains (coverage, fields, missingness,
distributions, quality traps). Nothing here tests a hypothesis or relates
one dataset to another.

Heavy lifting happens server-side through SoQL aggregation ($select ...
$group), so no dataset is ever bulk-downloaded -- the biggest pull is one
row per restaurant for the dot map (~31K rows).

Needs only `requests` (+ stdlib). No API keys.

Usage:
    python build_explorer_data.py              # rebuild every tab
    python build_explorer_data.py sales nta    # rebuild just these tabs
"""

import json
import math
from collections import Counter
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "assets" / "nyc-explorer"
MANIFEST = HERE / "pull_manifest.json"

NYC = "https://data.cityofnewyork.us/resource"
NYS = "https://data.ny.gov/resource"

INSPECTIONS = "43nn-pn8j"
SALES = "w2pb-icbu"
NTA2020 = "9nt8-h7nd"
SLA_ACTIVE = "9s3h-dpkz"
SLA_INACTIVE = "6dg3-2z7i"
SUPPLY_GAP = "4kc9-zrs2"
FARMERS_MARKETS = "8vwk-6iz2"
SNAP_CENTERS = "tc6u-8rnp"

NYC_COUNTIES = ["New York", "Kings", "Queens", "Bronx", "Richmond"]
COUNTY_TO_BORO = {"New York": "Manhattan", "Kings": "Brooklyn", "Queens": "Queens",
                  "Bronx": "Bronx", "Richmond": "Staten Island"}

manifest = {}


# ── fetch helpers ────────────────────────────────────────────────────────────

def soql(base, dataset, **params):
    """One SoQL GET with retries. Params are passed without the leading '$'."""
    url = f"{base}/{dataset}.json"
    q = {f"${k}": v for k, v in params.items()}
    for attempt in range(5):
        try:
            r = requests.get(url, params=q, timeout=180)
            if 400 <= r.status_code < 500:  # bad query -- retrying won't help
                raise RuntimeError(f"{r.status_code} for {r.url}: {r.text[:400]}")
            r.raise_for_status()
            return r.json()
        except requests.RequestException as e:
            if attempt == 4:
                raise
            wait = 5 * (attempt + 1)
            print(f"   retry {attempt + 1} after {e!s:.80} ({wait}s)")
            time.sleep(wait)


def soql_all(base, dataset, page=50000, **params):
    """Page through a (possibly grouped) query until exhausted."""
    rows, offset = [], 0
    while True:
        chunk = soql(base, dataset, limit=page, offset=offset, **params)
        rows.extend(chunk)
        if len(chunk) < page:
            return rows
        offset += page


def scalar(base, dataset, expr, where=None):
    params = {"select": f"{expr} as v"}
    if where:
        params["where"] = where
    rows = soql(base, dataset, **params)
    return rows[0].get("v") if rows else None


def num(x, default=0):
    try:
        return float(x)
    except (TypeError, ValueError):
        return default


def log_pull(dataset, label, rows, extra=None):
    manifest[dataset] = {"label": label, "rows": rows,
                         "pulled_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                         **(extra or {})}


def write(name, obj):
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"{name}.json"
    path.write_text(json.dumps(obj, separators=(",", ":")), encoding="utf-8")
    print(f"   wrote {path.name} ({path.stat().st_size / 1024:.0f} KB)")


def missingness(base, dataset, fields, total, where=None):
    """% of rows where each field is null/blank. count(field) skips nulls."""
    sel = ",".join(f"count({f}) as {f}" for f in fields)
    params = {"select": sel}
    if where:
        params["where"] = where
    counts = soql(base, dataset, **params)[0]
    return {f: round(100 * (1 - num(counts.get(f)) / total), 2) if total else None for f in fields}


def grid_bin(points, cell=0.004):
    """Bin (lon, lat) points to a square grid so a map can show density
    without shipping every point. Returns [[lon, lat, count], ...]."""
    cells = {}
    for lon, lat in points:
        key = (math.floor(lon / cell), math.floor(lat / cell))
        cells[key] = cells.get(key, 0) + 1
    return [[round((kx + 0.5) * cell, 4), round((ky + 0.5) * cell, 4), n] for (kx, ky), n in cells.items()]


# ── geometry helpers (no shapely: plain Douglas-Peucker on rings) ───────────

def _dp(points, tol):
    if len(points) < 3:
        return points
    (x1, y1), (x2, y2) = points[0], points[-1]
    dx, dy = x2 - x1, y2 - y1
    norm = math.hypot(dx, dy) or 1e-12
    best_i, best_d = 0, -1.0
    for i in range(1, len(points) - 1):
        px, py = points[i]
        d = abs(dy * px - dx * py + x2 * y1 - y2 * x1) / norm
        if d > best_d:
            best_i, best_d = i, d
    if best_d <= tol:
        return [points[0], points[-1]]
    left = _dp(points[: best_i + 1], tol)
    right = _dp(points[best_i:], tol)
    return left[:-1] + right


def simplify_ring(ring, tol=0.0001):
    """Douglas-Peucker on a closed ring. A closed ring starts and ends on the
    same point, so the chord between them has zero length and every vertex
    would look 0 away from it -- split at the vertex farthest from the start
    and simplify the two open halves instead."""
    pts = [(round(x, 5), round(y, 5)) for x, y in ring]
    if len(pts) <= 8:
        return [list(p) for p in pts]
    x0, y0 = pts[0]
    far = max(range(1, len(pts) - 1), key=lambda i: (pts[i][0] - x0) ** 2 + (pts[i][1] - y0) ** 2)
    out = _dp(pts[: far + 1], tol)[:-1] + _dp(pts[far:], tol)
    if len(out) < 4:
        return [list(p) for p in pts]
    return [list(p) for p in out]


def ring_area_sqmi(ring):
    """Rough planar area of a lon/lat ring in square miles (fine for NYC)."""
    lat0 = math.radians(ring[0][1])
    mx, my = 69.172 * math.cos(lat0), 69.0
    s = 0.0
    for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
        s += (x1 * mx) * (y2 * my) - (x2 * mx) * (y1 * my)
    return abs(s) / 2


# ── tab builders ─────────────────────────────────────────────────────────────

NTA_TYPES = {"0": "Residential", "5": "Rikers Island", "6": "Other special-use",
             "7": "Cemetery", "8": "Airport", "9": "Park"}


def build_nta():
    print("NTA 2020 boundaries ...")
    rows = soql(NYC, NTA2020, limit=1000)
    features, total_pts, kept_pts = [], 0, 0
    for r in rows:
        geom = r["the_geom"]
        polys, area = [], 0.0
        for poly in geom["coordinates"]:
            rings = []
            for i, ring in enumerate(poly):
                total_pts += len(ring)
                s = simplify_ring(ring)
                kept_pts += len(s)
                rings.append(s)
                area += ring_area_sqmi(ring) * (1 if i == 0 else -1)
            polys.append(rings)
        features.append({
            "type": "Feature",
            "properties": {
                "code": r["nta2020"], "name": r["ntaname"], "boro": r["boroname"],
                "cdta": r.get("cdta2020"), "type": NTA_TYPES.get(r.get("ntatype"), r.get("ntatype")),
                "area_sqmi": round(area, 3),
            },
            "geometry": {"type": "MultiPolygon", "coordinates": polys},
        })
    features.sort(key=lambda f: f["properties"]["code"])
    print(f"   {len(features)} NTAs, vertices {total_pts:,} -> {kept_pts:,}")
    write("nta2020", {"type": "FeatureCollection", "features": features})

    by_type, by_boro = {}, {}
    for f in features:
        p = f["properties"]
        by_type[p["type"]] = by_type.get(p["type"], 0) + 1
        if p["type"] == "Residential":
            by_boro[p["boro"]] = by_boro.get(p["boro"], 0) + 1
    log_pull(NTA2020, "2020 Neighborhood Tabulation Areas", len(features))
    write("neighborhoods", {
        "dataset": NTA2020, "count": len(features),
        "by_type": by_type, "residential_by_boro": by_boro,
        "fields": [
            ["nta2020", "text", "2020 NTA code, e.g. BK0101 -- borough letters + CDTA digits + 2-digit sequence"],
            ["ntaname", "text", "Neighborhood name"],
            ["boroname", "text", "Borough"],
            ["ntatype", "code", "0 = residential; 5-9 = Rikers, special-use, cemetery, airport, park"],
            ["cdta2020", "text", "Community District Tabulation Area the NTA nests inside"],
            ["the_geom", "geometry", "Boundary polygon (WGS84 lon/lat)"],
        ],
    })


def build_inspections():
    print("Restaurant inspections ...")
    D = INSPECTIONS
    total = int(scalar(NYC, D, "count(*)"))
    restaurants = int(scalar(NYC, D, "count(distinct camis)"))
    placeholder = int(scalar(NYC, D, "count(*)", "inspection_date = '1900-01-01T00:00:00'"))
    placeholder_r = int(scalar(NYC, D, "count(distinct camis)", "inspection_date = '1900-01-01T00:00:00'"))
    real = "inspection_date > '1901-01-01T00:00:00'"
    first = scalar(NYC, D, "min(inspection_date)", real)
    last = scalar(NYC, D, "max(inspection_date)", real)
    inspections = int(scalar(NYC, D, "count(distinct camis || '|' || inspection_date)", real))
    nta_codes = int(scalar(NYC, D, "count(distinct nta)"))
    record_date = scalar(NYC, D, "max(record_date)")

    monthly = soql_all(NYC, D, select="date_trunc_ym(inspection_date) as m, count(*) as rows, "
                                      "count(distinct camis) as restaurants",
                       where=real, group="m", order="m")
    by_year = soql(NYC, D, select="date_extract_y(inspection_date) as y, count(*) as n",
                   where=real, group="y", order="y")
    cuisine = soql(NYC, D, select="cuisine_description, count(distinct camis) as n",
                   group="cuisine_description", order="n desc", limit=500)
    boro = soql(NYC, D, select="boro, count(distinct camis) as n", group="boro", order="n desc")
    grades = soql(NYC, D, select="grade, count(*) as n", group="grade", order="n desc")
    critical = soql(NYC, D, select="critical_flag, count(*) as n", group="critical_flag", order="n desc")
    itype = soql(NYC, D, select="inspection_type, count(*) as n", group="inspection_type",
                 order="n desc", limit=40)
    action = soql(NYC, D, select="action, count(*) as n", group="action", order="n desc")
    violations = soql(NYC, D, select="violation_code, violation_description, count(*) as n",
                      where="violation_code is not null",
                      group="violation_code, violation_description", order="n desc", limit=15)
    # Score is repeated on every violation row of an inspection, so take one
    # score per (restaurant, inspection date) before histogramming.
    scores = soql_all(NYC, D, select="camis, inspection_date, max(score) as s",
                      where=real + " and score is not null", group="camis, inspection_date")
    hist = {}
    for r in scores:
        s = int(num(r.get("s"), -1))
        if s < 0:
            continue
        b = min(s // 5 * 5, 100)
        hist[b] = hist.get(b, 0) + 1
    rows_per_inspection = round(total / inspections, 2) if inspections else None

    pts = soql_all(NYC, D, select="camis, max(latitude) as lat, max(longitude) as lon, max(boro) as boro, "
                                  "max(cuisine_description) as c",
                   group="camis")
    points, no_geo = [], 0
    for p in pts:
        lat, lon = num(p.get("lat"), None), num(p.get("lon"), None)
        if not lat or not lon or abs(lat) < 1:
            no_geo += 1
            continue
        points.append([round(lon, 4), round(lat, 4), p.get("boro") or ""])

    fields = ["dba", "boro", "building", "street", "zipcode", "phone", "cuisine_description",
              "action", "violation_code", "violation_description", "critical_flag", "score",
              "grade", "grade_date", "inspection_type", "latitude", "longitude", "nta", "bbl"]
    miss = missingness(NYC, D, fields, total)
    sample = soql(NYC, D, select="camis, dba, boro, zipcode, cuisine_description, inspection_date, "
                                 "inspection_type, violation_code, critical_flag, score, grade, nta",
                  where="inspection_date > '2026-01-01T00:00:00' and violation_code is not null",
                  order="camis", limit=6)

    log_pull(D, "DOHMH Restaurant Inspection Results", total,
             {"first": first, "last": last, "restaurants": restaurants})
    write("inspections", {
        "dataset": D, "total_rows": total, "restaurants": restaurants, "inspections": inspections,
        "rows_per_inspection": rows_per_inspection,
        "first_date": first, "last_date": last, "record_date": record_date,
        "placeholder_rows": placeholder, "placeholder_restaurants": placeholder_r,
        "nta_codes_distinct": nta_codes, "no_geo_restaurants": no_geo,
        "monthly": [[r["m"][:7], int(r["rows"]), int(r["restaurants"])] for r in monthly],
        "by_year": [[int(r["y"]), int(r["n"])] for r in by_year],
        "cuisine": [[r.get("cuisine_description") or "(blank)", int(r["n"])] for r in cuisine],
        "boro": [[r.get("boro") or "(blank)", int(r["n"])] for r in boro],
        "grades": [[r.get("grade") or "(blank)", int(r["n"])] for r in grades],
        "critical": [[r.get("critical_flag") or "(blank)", int(r["n"])] for r in critical],
        "inspection_types": [[r.get("inspection_type") or "(blank)", int(r["n"])] for r in itype],
        "actions": [[r.get("action") or "(blank)", int(r["n"])] for r in action],
        "top_violations": [[r["violation_code"], r.get("violation_description", ""), int(r["n"])]
                           for r in violations],
        "score_hist": sorted([[k, v] for k, v in hist.items()]),
        "scored_inspections": sum(hist.values()),
        "missing_pct": miss, "sample": sample,
    })
    write("inspections_points", points)


RESIDENTIAL_PREFIXES = ("01", "02", "03", "04", "09", "10", "12", "13", "15", "17")


def build_sales():
    print("Property sales ...")
    D = SALES
    total = int(scalar(NYC, D, "count(*)"))
    first = scalar(NYC, D, "min(sale_date)")
    last = scalar(NYC, D, "max(sale_date)")
    zero = int(scalar(NYC, D, "count(*)", "sale_price = 0"))
    nominal = int(scalar(NYC, D, "count(*)", "sale_price > 0 and sale_price <= 10000"))
    no_price = int(scalar(NYC, D, "count(*)", "sale_price is null"))
    median_all = scalar(NYC, D, "median(sale_price)", "sale_price > 10000")
    nta_codes = int(scalar(NYC, D, "count(distinct nta)"))

    by_year = soql(NYC, D, select="date_extract_y(sale_date) as y, count(*) as n, "
                                  "sum(case(sale_price > 10000, 1, true, 0)) as market",
                   group="y", order="y")
    monthly = soql_all(NYC, D, select="date_trunc_ym(sale_date) as m, count(*) as n",
                       where="sale_price > 10000", group="m", order="m")
    classes_raw = soql_all(NYC, D, select="building_class_category, count(*) as n",
                           group="building_class_category")
    # The same category appears with one or two spaces after the number
    # ("01 ONE FAMILY" vs "01  ONE FAMILY") -- collapse before counting.
    classes, variants = {}, {}
    for r in classes_raw:
        raw = r.get("building_class_category") or "(blank)"
        norm = " ".join(raw.split())
        classes[norm] = classes.get(norm, 0) + int(r["n"])
        variants.setdefault(norm, set()).add(raw)
    spacing_dupes = sum(1 for v in variants.values() if len(v) > 1)
    boro = soql(NYC, D, select="borough, count(*) as n", group="borough", order="borough")

    # Log-spaced price buckets, counted server-side.
    edges = [0, 1, 10_000, 100_000, 250_000, 500_000, 750_000, 1_000_000, 1_500_000,
             2_500_000, 5_000_000, 10_000_000, 50_000_000, 10 ** 13]
    price_hist = []
    for lo, hi in zip(edges, edges[1:]):
        n = int(scalar(NYC, D, "count(*)", f"sale_price >= {lo} and sale_price < {hi}"))
        price_hist.append([lo, hi, n])

    # Median price and sale count per 2020 NTA, residential market sales only.
    res_where = "sale_price > 10000 and (" + " or ".join(
        f"starts_with(building_class_category, '{p}')" for p in RESIDENTIAL_PREFIXES) + ")"
    by_nta = soql_all(NYC, D, select="nta, count(*) as n, median(sale_price) as med",
                      where=res_where, group="nta")
    nta_stats = {r["nta"]: [int(r["n"]), int(num(r.get("med")))] for r in by_nta if r.get("nta")}
    no_nta = sum(int(r["n"]) for r in by_nta if not r.get("nta"))

    # gross_square_feet is a *text* column with thousands separators ("2,400").
    sqft_blank = int(scalar(NYC, D, "count(*)", "gross_square_feet is null"))
    sqft_zero = int(scalar(NYC, D, "count(*)", "gross_square_feet = '0'"))
    sqft_missing = sqft_blank + sqft_zero
    col_types = {c["fieldName"]: c["dataTypeName"] for c in requests.get(
        f"https://data.cityofnewyork.us/api/views/{D}.json", timeout=60).json()["columns"]
        if not c["fieldName"].startswith(":@")}
    fields = ["borough", "neighborhood", "building_class_category", "address", "apartment_number",
              "zip_code", "residential_units", "commercial_units", "land_square_feet",
              "gross_square_feet", "year_built", "sale_price", "sale_date", "latitude",
              "longitude", "census_tract_2020", "nta", "bbl"]
    miss = missingness(NYC, D, fields, total)
    sample = soql(NYC, D, select="borough, neighborhood, building_class_category, address, "
                                 "zip_code, gross_square_feet, year_built, sale_price, sale_date, nta",
                  where="sale_date >= '2025-06-01T00:00:00' and sale_price > 10000",
                  order="bbl", limit=6)

    log_pull(D, "NYC Citywide Annualized Calendar Sales", total, {"first": first, "last": last})
    write("sales", {
        "dataset": D, "total_rows": total, "first_date": first, "last_date": last,
        "zero_price": zero, "nominal_price": nominal, "no_price": no_price,
        "median_market_price": num(median_all), "nta_codes_distinct": nta_codes,
        "sqft_missing_or_zero": sqft_missing, "sqft_blank": sqft_blank, "sqft_zero": sqft_zero,
        "col_types": col_types, "residential_sales_no_nta": no_nta,
        "by_year": [[int(r["y"]), int(r["n"]), int(num(r.get("market")))] for r in by_year],
        "monthly": [[r["m"][:7], int(r["n"])] for r in monthly],
        "classes": sorted([[k, v] for k, v in classes.items()], key=lambda x: -x[1]),
        "class_spacing_duplicates": spacing_dupes,
        "boro": [[r.get("borough") or "(blank)", int(r["n"])] for r in boro],
        "price_hist": price_hist, "nta": nta_stats,
        "residential_prefixes": list(RESIDENTIAL_PREFIXES),
        "missing_pct": miss, "sample": sample,
    })


def build_licenses():
    print("Liquor licenses ...")
    out = {"datasets": {"active": SLA_ACTIVE, "inactive": SLA_INACTIVE}}
    county_in = ",".join(f"'{c}'" for c in NYC_COUNTIES)
    for key, D, county, issued, desc, geo in [
        ("active", SLA_ACTIVE, "premisescounty", "originalissuedate", "description", "georeference"),
        ("inactive", SLA_INACTIVE, "premises_county", "original_issue_date", "description", "georeference"),
    ]:
        where = f"{county} in ({county_in})"
        total_all = int(scalar(NYS, D, "count(*)"))
        total = int(scalar(NYS, D, "count(*)", where))
        by_year = soql(NYS, D, select=f"date_extract_y({issued}) as y, count(*) as n",
                       where=where, group="y", order="y")
        by_type = soql(NYS, D, select=f"{desc} as d, count(*) as n", where=where,
                       group="d", order="n desc", limit=40)
        by_county = soql(NYS, D, select=f"{county} as c, count(*) as n", where=where, group="c")
        first = scalar(NYS, D, f"min({issued})", where)
        last = scalar(NYS, D, f"max({issued})", where)
        pts = soql_all(NYS, D, select=geo, where=where + f" and {geo} is not null")
        lonlat = [tuple(p[geo]["coordinates"]) for p in pts if p.get(geo)]
        lonlat = [(x, y) for x, y in lonlat if -74.3 < x < -73.6 and 40.4 < y < 41.0]
        out[key] = {
            "total_statewide": total_all, "total_nyc": total, "first_issue": first, "last_issue": last,
            "by_year": [[int(r["y"]), int(r["n"])] for r in by_year if r.get("y")],
            "by_type": [[r.get("d") or "(blank)", int(r["n"])] for r in by_type],
            "by_boro": {COUNTY_TO_BORO.get(r["c"], r["c"]): int(r["n"]) for r in by_county},
            "geocoded": len(lonlat), "grid": grid_bin(lonlat),
        }
        log_pull(D, f"NYS Liquor Authority {key} licenses", total_all,
                 {"nyc_rows": total, "first": first, "last": last})
    out["sample"] = soql(NYS, SLA_ACTIVE, select="licensepermitid, premisescounty, description, dba, "
                                                 "actualaddressofpremises, zipcode, originalissuedate, "
                                                 "expirationdate",
                         where="premisescounty = 'Kings' and originalissuedate > '2024-01-01T00:00:00'",
                         order="licensepermitid", limit=6)
    write("licenses", out)


def in_nyc(lon, lat):
    return -74.3 < lon < -73.6 and 40.4 < lat < 41.0


def coord_status(lon, lat):
    """Classify one farmers-market row's coordinates. The raw file mixes
    several distinct entry errors, and which one shows up depends on year."""
    if not lat:
        return "missing"
    if in_nyc(lon, lat):
        return "ok"
    if in_nyc(lat, lon):
        return "lat/long swapped"
    if in_nyc(-lon, lat):
        return "longitude missing minus sign"
    if abs(lon) < 1:
        return "longitude is 0"
    if lon == lat:
        return "latitude copied into longitude"
    return "other"


def build_food_access():
    print("Food access ...")
    gap = soql_all(NYC, SUPPLY_GAP, order="year, nta")
    markets = soql_all(NYC, FARMERS_MARKETS)
    snap = soql_all(NYC, SNAP_CENTERS)
    gap_by_year = {}
    for r in gap:
        gap_by_year.setdefault(r["year"], {})[r["nta"]] = {
            "name": r.get("nta_name"), "gap_lbs": round(num(r.get("supply_gap_lbs")), 0),
            "food_insecure": round(num(r.get("food_insecure_percentage")), 4),
            "unemployment": round(num(r.get("unemployment_rate")), 4),
            "vulnerable": round(num(r.get("vulnerable_population")), 4),
            "score": round(num(r.get("weighted_score")), 3), "rank": int(num(r.get("rank"))),
        }
    gap_years = sorted(gap_by_year)
    market_years = sorted({m["year"] for m in markets if m.get("year")})
    log_pull(SUPPLY_GAP, "Emergency Food Supply Gap", len(gap),
             {"first": gap_years[0], "last": gap_years[-1]})
    log_pull(FARMERS_MARKETS, "NYC Farmers Markets", len(markets),
             {"first": market_years[0], "last": market_years[-1]})
    log_pull(SNAP_CENTERS, "Directory of SNAP Centers", len(snap))
    write("food_access", {
        "datasets": {"gap": SUPPLY_GAP, "markets": FARMERS_MARKETS, "snap": SNAP_CENTERS},
        "gap": gap_by_year, "gap_fields": sorted(gap[0].keys()) if gap else [],
        # [name, borough, year, accepts_ebt, open_year_round, lon, lat]
        # Every row is kept so per-year counts stay complete; lon/lat are only
        # filled in where coord_status() says they're usable as-is.
        "markets": [[m.get("marketname"), m.get("borough"), m.get("year"), m.get("accepts_ebt"),
                     m.get("open_year_round"),
                     round(num(m.get("longitude")), 4) if st == "ok" else None,
                     round(num(m.get("latitude")), 4) if st == "ok" else None, st]
                    for m in markets
                    for st in [coord_status(num(m.get("longitude")), num(m.get("latitude")))]],
        "year_round_values": sorted(
            [[str(k), v] for k, v in Counter(m.get("open_year_round") for m in markets).items()],
            key=lambda x: -x[1]),
        "markets_no_geo": sum(1 for m in markets if not num(m.get("latitude"))),
        "market_years": market_years,
        "market_sample": markets[:5],
        "snap": [{"name": s.get("facility_name"), "boro": s.get("borough"),
                  "address": s.get("street_address"), "hours": s.get("comments"),
                  "lon": num(s.get("longitude"), None), "lat": num(s.get("latitude"), None)}
                 for s in snap],
    })


BUILDERS = {"nta": build_nta, "inspections": build_inspections, "sales": build_sales,
            "licenses": build_licenses, "food_access": build_food_access}


def main():
    targets = sys.argv[1:] or list(BUILDERS)
    if MANIFEST.exists():
        manifest.update(json.loads(MANIFEST.read_text(encoding="utf-8")))
    for t in targets:
        t0 = time.time()
        BUILDERS[t]()
        print(f"   ({time.time() - t0:.0f}s)")
    MANIFEST.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    write("manifest", manifest)


if __name__ == "__main__":
    main()
