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


# ════════════════════════════════════════════════════════════════════════════
# GENTRIFICATION-SIGNAL DATASETS (added 2026-10-06)
# One builder per family of candidate signals from the project notes:
# turnover, chains, rent, property value, construction, capital spending,
# schools, crime, subway, fires. Same rule as above -- profile, don't analyze.
# ════════════════════════════════════════════════════════════════════════════

STOREFRONTS = "92iy-9c3n"
STOREFRONT_STATS = "dxru-eun8"
DCWP_ISSUED = "w7w3-xahh"
DCWP_HISTORIC = "m4ph-grrm"
STREETEASY_RENT = ["https://cdn-charts.streeteasy.com/rentals/All/medianAskingRent_All.zip",
                   "https://streeteasy-market-data-download.s3.amazonaws.com/rentals/All/medianAskingRent_All.zip"]
MICHELIN_CSV = "https://raw.githubusercontent.com/ngshiheng/michelin-my-maps/main/data/michelin_my_maps.csv"
VALUATION = "8y4t-faws"
VALUATION_OLD = "yjxr-fw8i"
HOUSING_DB = "br6q-ssj3"
DOB_PERMITS_BIS = "ipu4-2q9a"
DOB_PERMITS_NOW = "rbx6-tga4"
STREET_PERMITS = "tqtj-sjs8"
CPDB = "fi59-268w"
CPDB_POINTS = "h2ic-zdws"
CPDB_POLYS = "9jkp-n57r"
CAPITAL_PLAN = "2cmn-uidm"
MTA_CAPITAL = "9hy6-8j6t"
SQR = "dnpx-dfnc"
ELA = "iebs-5yhr"
MATH = "74kb-55u9"
SCHOOL_LOCS = "wg9x-4ke6"
NYPD_HIST = "qgea-i56i"
NYPD_YTD = "5uac-w243"
MTA_STATIONS = "39hk-dx4f"
MTA_RIDERSHIP = "ak4z-sape"
MTA_ELEVATORS = "rc78-7x78"
MTA_ALERTS = "7kct-peq7"
FIRE_DISPATCH = "8m42-w767"
FIRE_CAUSES = "ii3r-svjz"


def rows_to_pairs(rows, k, v="n", cast=int):
    return [[r.get(k) or "(blank)", cast(num(r.get(v)))] for r in rows]


def build_turnover():
    print("Business turnover (storefronts + DCWP licenses) ...")
    # ── Storefront registry: one row per ground/second-floor storefront per filing year
    D = STOREFRONTS
    total = int(scalar(NYC, D, "count(*)"))
    by_year = soql(NYC, D, select="reporting_year, vacant_on_12_31 as v, vacant_6_30_or_date_sold as v2, "
                                  "count(*) as n", group="reporting_year, v, v2", order="reporting_year")
    years = {}
    for r in by_year:
        y = years.setdefault(r["reporting_year"], {"rows": 0, "vacant": 0, "occupied": 0, "blank": 0,
                                                   "vacant_codes": {}})
        n = int(r["n"])
        y["rows"] += n
        v = (r.get("v") or "").upper()
        v2 = (r.get("v2") or "").upper()
        if v in ("YES", "Y") or (not v and v2 in ("YES", "Y")):
            y["vacant"] += n
        elif v in ("NO", "N"):
            y["occupied"] += n
        else:
            y["blank"] += n
        code = r.get("v") or ("(blank; 6/30 field=" + (r.get("v2") or "blank") + ")")
        y["vacant_codes"][code] = y["vacant_codes"].get(code, 0) + n
    activity = soql(NYC, D, select="upper(primary_business_activity) as a, count(*) as n",
                    group="a", order="n desc", limit=30)
    act_by_year = soql_all(NYC, D, select="reporting_year, upper(primary_business_activity) as a, count(*) as n",
                           where="upper(primary_business_activity) in ('FOOD SERVICES','RETAIL','NO BUSINESS ACTIVITY IDENTIFIED')",
                           group="reporting_year, a")
    distinct = soql(NYC, D, select="reporting_year, count(distinct bbl) as b", group="reporting_year",
                    order="reporting_year")
    construction = soql(NYC, D, select="construction_reported as c, count(*) as n", group="c")
    # Storefront presence across filing years: how many BBLs show up in how many years.
    per_bbl = soql_all(NYC, D, select="bbl, count(distinct reporting_year) as k", group="bbl")
    presence = Counter(int(num(r["k"])) for r in per_bbl if r.get("bbl"))
    # Vacancy share by 2020 NTA for the most recent complete filing year.
    nta_v = soql_all(NYC, D, select="nta, count(*) as n, sum(case(upper(vacant_on_12_31) in ('YES','Y'),1,true,0)) as v",
                     where="reporting_year = '2024'", group="nta")
    nta_vac = {r["nta"]: [int(r["n"]), int(num(r["v"]))] for r in nta_v if r.get("nta")}
    fields = ["reporting_year", "bbl", "property_street_address_or", "unit", "vacant_on_12_31",
              "vacant_6_30_or_date_sold", "primary_business_activity", "expir_dt_of_most_recent_lease",
              "construction_reported", "sold_date", "latitude", "nta"]
    miss = missingness(NYC, D, fields, total)
    log_pull(D, "Storefronts Reported Vacant or Not", total,
             {"first": "2019 and 2020", "last": max(years)})

    # ── Storefront aggregate statistics (includes asking rent per sq ft)
    S = STOREFRONT_STATS
    agg = soql_all(NYC, S, where="upper(aggregate_level_citywide) in ('CITYWIDE','BOROUGH')")
    clean = lambda v: num(str(v).replace(",", ""), None) if v not in (None, "*", "") else None
    agg_rows = [{"year": r["reporting_year"], "level": r["aggregate_level_citywide"].upper(),
                 "id": r.get("aggregate_level_id"), "total": clean(r.get("total_storefronts")),
                 "leased": clean(r.get("storefront_leased_to_tenants")),
                 "not_leased": clean(r.get("storefront_reported_not_leased")),
                 "rent_psf_median": clean(r.get("median_monthly_rent_per_square")),
                 "years_leased_median": clean(r.get("median_years_leased")),
                 "lease_due": clean(r.get("number_whose_lease_is_due"))} for r in agg]
    tract = soql_all(NYC, S, select="reporting_year, median_monthly_rent_per_square as r, total_storefronts as t",
                     where="upper(aggregate_level_citywide) = 'CENSUS TRACT'")
    tract_years = {}
    for r in tract:
        ty = tract_years.setdefault(r["reporting_year"], {"tracts": 0, "suppressed": 0, "rents": []})
        ty["tracts"] += 1
        v = clean(r.get("r"))
        if v is None:
            ty["suppressed"] += 1
        else:
            ty["rents"].append(v)
    tract_summary = {}
    for y, t in sorted(tract_years.items()):
        rs = sorted(t["rents"])
        q = (lambda p: rs[int(p * (len(rs) - 1))] if rs else None)
        tract_summary[y] = {"tracts": t["tracts"], "suppressed": t["suppressed"],
                            "p10": q(.1), "p25": q(.25), "p50": q(.5), "p75": q(.75), "p90": q(.9)}
    log_pull(S, "Storefront Registration Statistics (Class 2 & 4)", int(scalar(NYC, S, "count(*)")))

    # ── DCWP licenses: current/recent (issued) and pre-2019 (historical)
    dc = {}
    for key, D2, date_col, cat_col, status_col, nta_col in [
        ("issued", DCWP_ISSUED, "license_creation_date", "business_category", "license_status", "nta"),
        ("historic", DCWP_HISTORIC, "license_creation_date", "business_code_description", "license_status", "nta2020"),
    ]:
        t = int(scalar(NYC, D2, "count(*)"))
        dc[key] = {
            "dataset": D2, "rows": t,
            "by_year": [[int(r["y"]), int(r["n"])] for r in soql(
                NYC, D2, select=f"date_extract_y({date_col}) as y, count(*) as n", group="y", order="y") if r.get("y")],
            "categories": [[" ".join((r.get("c") or "(blank)").split()), int(r["n"])] for r in soql(
                NYC, D2, select=f"{cat_col} as c, count(*) as n", group="c", order="n desc", limit=20)],
            "status": rows_to_pairs(soql(NYC, D2, select=f"{status_col} as s, count(*) as n", group="s",
                                         order="n desc", limit=15), "s"),
            "placeholder_1900": int(scalar(NYC, D2, "count(*)", f"{date_col} < '1901-01-01'")),
            "future_dates": int(scalar(NYC, D2, "count(*)", f"{date_col} > '2026-12-31'")),
            "nta_filled": int(scalar(NYC, D2, f"count({nta_col})")),
            "nta_col": nta_col,
        }
        log_pull(D2, f"DCWP {key} licenses", t)

    write("turnover", {
        "datasets": {"storefronts": D, "storefront_stats": S, "dcwp_issued": DCWP_ISSUED,
                     "dcwp_historic": DCWP_HISTORIC},
        "storefront_rows": total, "storefront_years": years,
        "storefront_activity": [[r.get("a") or "(blank)", int(r["n"])] for r in activity],
        "activity_by_year": [[r["reporting_year"], r["a"], int(r["n"])] for r in act_by_year],
        "distinct_bbl_by_year": [[r["reporting_year"], int(r["b"])] for r in distinct],
        "construction_codes": rows_to_pairs(construction, "c"),
        "bbl_presence": sorted([[k, v] for k, v in presence.items()]),
        "nta_vacancy_2024": nta_vac, "storefront_missing": miss,
        "storefront_sample": soql(NYC, D, select="reporting_year, bbl, property_street_address_or, unit, "
                                                 "vacant_on_12_31, primary_business_activity, "
                                                 "expir_dt_of_most_recent_lease, nta",
                                  where="reporting_year = '2024' and upper(primary_business_activity) = 'FOOD SERVICES'",
                                  order="bbl", limit=6),
        "storefront_stats": agg_rows, "tract_rent": tract_summary,
        "dcwp": dc,
    })


# Chains matched on a normalized DBA (upper-case, punctuation stripped).
# The grouping is only for display -- it's my judgment, not a city field.
CHAINS = [
    ("Fast food", "McDonald's", r"^MC ?DONALDS"), ("Fast food", "Burger King", r"^BURGER KING"),
    ("Fast food", "Wendy's", r"^WENDYS"), ("Fast food", "Popeyes", r"^POPEYES"),
    ("Fast food", "KFC", r"^(KFC|KENTUCKY FRIED)"), ("Fast food", "Taco Bell", r"^TACO BELL"),
    ("Fast food", "Subway", r"^SUBWAY( |$)"), ("Fast food", "Domino's", r"^DOMINOS"),
    ("Fast food", "Pizza Hut", r"^PIZZA HUT"), ("Fast food", "Papa John's", r"^PAPA JOHNS"),
    ("Fast food", "Little Caesars", r"^LITTLE CAESARS"), ("Fast food", "Chick-fil-A", r"^CHICK ?FIL ?A"),
    ("Fast food", "Wingstop", r"^WINGSTOP"), ("Fast food", "Five Guys", r"^FIVE GUYS"),
    ("Fast food", "Panda Express", r"^PANDA EXPRESS"), ("Fast food", "Jollibee", r"^JOLLIBEE"),
    ("Fast food", "Raising Cane's", r"^RAISING CANES"), ("Fast food", "Jersey Mike's", r"^JERSEY MIKES"),
    ("Local fried chicken", "Kennedy Fried Chicken", r"^KENNEDY FRIED"),
    ("Local fried chicken", "Crown Fried Chicken", r"^CROWN FRIED"),
    ("Local fried chicken", "Golden Krust", r"^GOLDEN KRUST"),
    ("Coffee & bakery", "Dunkin'", r"^DUNKIN"), ("Coffee & bakery", "Starbucks", r"^STARBUCKS"),
    ("Coffee & bakery", "Blank Street", r"^BLANK STREET"), ("Coffee & bakery", "Bluestone Lane", r"^BLUESTONE LANE"),
    ("Coffee & bakery", "Gregorys Coffee", r"^GREGORYS"), ("Coffee & bakery", "Joe Coffee", r"^JOE COFFEE"),
    ("Coffee & bakery", "Paris Baguette", r"^PARIS BAGUETTE"), ("Coffee & bakery", "Le Pain Quotidien", r"^LE PAIN QUOTIDIEN"),
    ("Coffee & bakery", "Pret A Manger", r"^PRET A MANGER"),
    ("Fast casual", "Chipotle", r"^CHIPOTLE"), ("Fast casual", "Sweetgreen", r"^SWEETGREEN"),
    ("Fast casual", "Just Salad", r"^JUST SALAD"), ("Fast casual", "Cava", r"^CAVA( |$)"),
    ("Fast casual", "Shake Shack", r"^SHAKE SHACK"), ("Fast casual", "Joe & The Juice", r"^JOE ?(AND )?THE JUICE"),
    ("Fast casual", "Dig", r"^DIG( INN)?$"), ("Fast casual", "Chopt", r"^CHOPT"),
    ("Fast casual", "Dos Toros", r"^DOS TOROS"), ("Fast casual", "Naya", r"^NAYA( |$)"),
    ("Fast casual", "Playa Bowls", r"^PLAYA BOWLS"), ("Fast casual", "Wonder", r"^WONDER( |$)"),
    ("Fast casual", "Xi'an Famous Foods", r"^XIAN FAMOUS"), ("Fast casual", "Van Leeuwen", r"^VAN LEEUWEN"),
    ("Bubble tea", "Gong Cha", r"^GONG CHA"), ("Bubble tea", "Kung Fu Tea", r"^KUNG FU TEA"),
]


def build_chains():
    import csv
    import io
    import re
    print("Chains + published lists ...")
    D = INSPECTIONS
    rows = soql_all(NYC, D, select="camis, max(dba) as dba, max(latitude) as lat, max(longitude) as lon, "
                                   "max(boro) as boro, min(inspection_date) as first, max(inspection_date) as last",
                    group="camis")
    norm = lambda s: re.sub(r"\s+", " ", re.sub(r"[^A-Z0-9& ]", "", (s or "").upper().replace("&", " AND "))).strip()
    compiled = [(g, label, re.compile(p)) for g, label, p in CHAINS]
    per_chain = {label: {"group": g, "n": 0, "pending": 0, "variants": Counter(), "first_years": Counter(),
                         "boro": Counter()} for g, label, _ in CHAINS}
    points = []
    for r in rows:
        name = norm(r.get("dba"))
        hit = next(((g, label) for g, label, rx in compiled if rx.search(name)), None)
        if not hit:
            continue
        g, label = hit
        c = per_chain[label]
        c["n"] += 1
        c["variants"][r.get("dba") or ""] += 1
        c["boro"][r.get("boro") or "?"] += 1
        first = r.get("first") or ""
        if first.startswith("1900"):
            c["pending"] += 1
        else:
            c["first_years"][first[:4]] += 1
        lat, lon = num(r.get("lat"), None), num(r.get("lon"), None)
        if lat and lon and abs(lat) > 1:
            points.append([round(lon, 4), round(lat, 4), label, g, first[:10]])
    chains = sorted([{"label": k, "group": v["group"], "n": v["n"], "pending": v["pending"],
                      "variants": v["variants"].most_common(8), "n_variants": len(v["variants"]),
                      "first_years": sorted(v["first_years"].items()), "boro": dict(v["boro"])}
                     for k, v in per_chain.items() if v["n"]], key=lambda x: -x["n"])
    top_names = soql(NYC, D, select="upper(dba) as d, count(distinct camis) as n", group="d",
                     order="n desc", limit=60)
    first_all = Counter((r.get("first") or "")[:4] for r in rows)

    # Published list: Michelin Guide (community-maintained scrape of guide.michelin.com)
    txt = requests.get(MICHELIN_CSV, timeout=180).text
    mich = [m for m in csv.DictReader(io.StringIO(txt)) if "New York" in (m.get("Location") or "")]
    mich_pts = [[round(num(m["Longitude"]), 4), round(num(m["Latitude"]), 4), m["Name"], m["Award"],
                 m.get("Cuisine"), m.get("Price")] for m in mich
                if in_nyc(num(m.get("Longitude")), num(m.get("Latitude")))]
    write("chains", {
        "dataset": D, "restaurants": len(rows), "chains": chains, "points": points,
        "chain_restaurants": sum(c["n"] for c in chains),
        "top_names": [[r.get("d") or "(blank)", int(r["n"])] for r in top_names],
        "first_seen_all": sorted([k, v] for k, v in first_all.items() if k),
        "michelin": {"source": MICHELIN_CSV, "rows_world": txt.count("\n"), "nyc": len(mich),
                     "awards": Counter(m["Award"] for m in mich).most_common(),
                     "fields": list(mich[0].keys()) if mich else [], "points": mich_pts},
    })


def build_rent():
    import csv
    import io
    import zipfile
    print("Rent (StreetEasy asking rent) ...")
    blob, src = None, None
    for attempt in range(3):
        for url in STREETEASY_RENT:  # CDN first, S3 bucket behind it as a fallback
            try:
                r = requests.get(url, timeout=180)
                r.raise_for_status()
                blob, src = r.content, url
                break
            except requests.RequestException as e:
                print(f"   {url}: {e!s:.80}")
        if blob:
            break
        time.sleep(10)
    z = zipfile.ZipFile(io.BytesIO(blob))
    name = next(n for n in z.namelist() if n.endswith(".csv"))
    rows = list(csv.reader(io.TextIOWrapper(z.open(name), encoding="utf-8")))
    header, body = rows[0], rows[1:]
    months = header[3:]
    areas = []
    for r in body:
        vals = [num(v, None) if v else None for v in r[3:]]
        have = [i for i, v in enumerate(vals) if v is not None]
        annual = {}
        for m, v in zip(months, vals):
            if v is not None:
                annual.setdefault(m[:4], []).append(v)
        areas.append({"name": r[0], "boro": r[1], "type": r[2], "n_months": len(have),
                      "first": months[have[0]] if have else None, "last": months[have[-1]] if have else None,
                      "annual": {y: round(sum(v) / len(v)) for y, v in annual.items()},
                      "monthly": vals if r[2] in ("city", "borough") else None})
    # How many StreetEasy neighborhood names line up with a 2020 NTA name?
    nta_names = set()
    geo = json.loads((OUT / "nta2020.json").read_text(encoding="utf-8"))
    for f in geo["features"]:
        for part in f["properties"]["name"].replace("(", "-").replace(")", "").split("-"):
            nta_names.add(part.strip().lower())
    hoods = [a for a in areas if a["type"] == "neighborhood"]
    matched = sum(1 for a in hoods if a["name"].lower() in nta_names)
    manifest["streeteasy-rent"] = {"label": "StreetEasy median asking rent (all units)", "rows": len(body),
                                   "pulled_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                                   "first": months[0], "last": months[-1]}
    write("rent", {"source": src, "months": months, "areas": areas,
                   "neighborhoods": len(hoods), "name_matches_nta": matched})


def build_values():
    print("Property values (DOF assessment roll) ...")
    D = VALUATION
    total = int(scalar(NYC, D, "count(*)"))
    yp = soql(NYC, D, select="year, period, count(*) as n", group="year, period", order="year")
    classes = {"1": "starts_with(curtaxclass, '1')", "2": "starts_with(curtaxclass, '2')",
               "4": "starts_with(curtaxclass, '4')"}
    med_new = []
    for y in sorted({r["year"] for r in yp}):
        for c, cond in classes.items():
            v = scalar(NYC, D, "median(curmkttot)", f"year = '{y}' and period = 3 and {cond} and curmkttot > 0")
            med_new.append([y, c, num(v)])
    zero_mv = int(scalar(NYC, D, "count(*)", "year = '2026' and period = 3 and (curmkttot = 0 or curmkttot is null)"))
    O = VALUATION_OLD
    total_old = int(scalar(NYC, O, "count(*)"))
    old_years = soql(NYC, O, select="year, count(*) as n", group="year", order="year")
    med_old = []
    for r in old_years:
        for c in ("1", "2", "4"):
            v = scalar(NYC, O, "median(fullval)", f"year = '{r['year']}' and starts_with(taxclass, '{c}') and fullval > 0")
            med_old.append([r["year"], c, num(v)])
    # Sales volume per NTA-year: is there enough data to compute a neighborhood
    # price change at all? (counts only -- no prices compared here)
    res_where = "sale_price > 10000 and (" + " or ".join(
        f"starts_with(building_class_category, '{p}')" for p in RESIDENTIAL_PREFIXES) + ")"
    ny = soql_all(NYC, SALES, select="nta, date_extract_y(sale_date) as y, count(*) as n",
                  where=res_where, group="nta, y")
    buckets = [(0, 10), (10, 25), (25, 50), (50, 100), (100, 250), (250, 10 ** 9)]
    by_year_bucket = {}
    for r in ny:
        if not r.get("nta"):
            continue
        n = int(r["n"])
        lab = next(f"{lo}–{hi - 1}" if hi < 10 ** 9 else f"{lo}+" for lo, hi in buckets if lo <= n < hi)
        by_year_bucket.setdefault(r["y"], Counter())[lab] += 1
    city_median = soql(NYC, SALES, select="date_extract_y(sale_date) as y, median(sale_price) as m, count(*) as n",
                       where=res_where, group="y", order="y")
    fields = [["parid / boro+block+lot", "id", "Parcel ID = BBL (+ easement). Condo units each get their own lot (1001+)."],
              ["year", "text", "Assessment-roll fiscal year (2027 = July 2026–June 2027)"],
              ["period", "number", "1 = tentative roll (January), 3 = final roll (May)"],
              ["curmkttot", "number", "Current-year <b>market value</b> estimated by DOF, total (land + building)"],
              ["curacttot", "number", "Current-year <b>actual assessed value</b>, which is capped for tax classes 1 & 2"],
              ["curtaxclass", "code", "Tax class: 1 = 1–3 family homes, 2 = apartments/co-ops/condos, 3 = utilities, 4 = commercial"],
              ["bldg_class", "code", "DOF building class (A* one-family, D* elevator apartments, K* stores…)"],
              ["yrbuilt / yralt1", "number", "Year built / first alteration year"]]
    log_pull(D, "DOF Property Valuation & Assessment (2023+ rolls)", total)
    log_pull(O, "DOF Property Valuation & Assessment (2010/11–2018/19 rolls)", total_old)
    write("values", {
        "datasets": {"new": D, "old": O, "sales": SALES}, "rows_new": total, "rows_old": total_old,
        "year_period": [[r["year"], r.get("period"), int(r["n"])] for r in yp],
        "old_years": [[r["year"], int(r["n"])] for r in old_years],
        "median_mv_new": med_new, "median_mv_old": med_old, "zero_mv_2026": zero_mv,
        "nta_year_buckets": {y: dict(c) for y, c in sorted(by_year_bucket.items())},
        "bucket_order": [f"{lo}–{hi - 1}" if hi < 10 ** 9 else f"{lo}+" for lo, hi in buckets],
        "city_median": [[int(r["y"]), num(r["m"]), int(r["n"])] for r in city_median],
        "fields": fields,
    })


def build_construction():
    print("Construction + permits ...")
    H = HOUSING_DB
    h_total = int(scalar(NYC, H, "count(*)"))
    compl = soql_all(NYC, H, select="compltyear as y, job_type as t, count(*) as n, sum(classanet) as u",
                     where="compltyear is not null", group="y, t")
    permit = soql_all(NYC, H, select="permityear as y, job_type as t, count(*) as n",
                      where="permityear is not null", group="y, t")
    status = soql(NYC, H, select="job_type as t, job_status as s, count(*) as n", group="t, s")
    big = soql(NYC, H, select="permityear as y, count(*) as n",
               where="job_type = 'New Building' and (classaprop >= 100 or floorsprop >= 15)", group="y", order="y")
    nta_units = soql_all(NYC, H, select="nta2020, sum(classanet) as u, count(*) as n",
                         where="job_status = '5. Completed Construction' and compltyear >= '2010'", group="nta2020")
    log_pull(H, "DCP Housing Database (project level)", h_total)

    B = DOB_PERMITS_BIS
    b_total = int(scalar(NYC, B, "count(*)"))
    bis = soql_all(NYC, B, select="substring(issuance_date,7,4) as y, job_type as t, count(*) as n",
                   where="issuance_date like '__/__/____'", group="y, t")
    bis += soql_all(NYC, B, select="substring(issuance_date,1,4) as y, job_type as t, count(*) as n",
                    where="issuance_date like '____-__-__'", group="y, t")
    bis_iso = int(scalar(NYC, B, "count(*)", "issuance_date like '____-__-__'"))
    bis_us = int(scalar(NYC, B, "count(*)", "issuance_date like '__/__/____'"))
    log_pull(B, "DOB Permit Issuance (legacy BIS)", b_total)

    N = DOB_PERMITS_NOW
    n_total = int(scalar(NYC, N, "count(*)"))
    now = soql_all(NYC, N, select="date_extract_y(issued_date) as y, work_type as t, count(*) as n", group="y, t")
    now_nta = int(scalar(NYC, N, "count(nta)"))
    log_pull(N, "DOB NOW: Build – Approved Permits", n_total)

    T = STREET_PERMITS
    t_total = int(scalar(NYC, T, "count(*)"))
    st_year = soql(NYC, T, select="date_extract_y(permitissuedate) as y, count(*) as n", group="y", order="y")
    st_types = soql(NYC, T, select="permittypedesc as d, count(*) as n", group="d", order="n desc", limit=15)
    log_pull(T, "DOT Street Construction Permits (2022–)", t_total)

    agg = lambda rows: [[r.get("y"), r.get("t") or "(blank)", int(num(r.get("n"))), round(num(r.get("u")))]
                        for r in rows if r.get("y")]
    write("construction", {
        "datasets": {"housing_db": H, "bis": B, "now": N, "street": T},
        "housing": {"rows": h_total, "completed": agg(compl), "permitted": agg(permit),
                    "status": [[r["t"], r["s"], int(r["n"])] for r in status],
                    "big_nb_by_permit_year": [[r["y"], int(r["n"])] for r in big if r.get("y")],
                    "nta_units": {r["nta2020"]: [round(num(r.get("u"))), int(r["n"])] for r in nta_units if r.get("nta2020")}},
        "bis": {"rows": b_total, "by_year_type": [[r["y"], r["t"], int(r["n"])] for r in bis if r.get("y")],
                "iso_dates": bis_iso, "us_dates": bis_us},
        "now": {"rows": n_total, "by_year_type": [[r.get("y"), r.get("t") or "(blank)", int(r["n"])] for r in now if r.get("y")],
                "nta_filled": now_nta},
        "street": {"rows": t_total, "by_year": [[r.get("y"), int(r["n"])] for r in st_year if r.get("y")],
                   "types": rows_to_pairs(st_types, "d")},
    })


def _centroid(geom):
    """Rough centroid (vertex mean) of any GeoJSON geometry -- for markers only."""
    pts = []
    def walk(c):
        if isinstance(c[0], (int, float)):
            pts.append(c)
        else:
            for x in c:
                walk(x)
    walk(geom["coordinates"])
    return [round(sum(p[0] for p in pts) / len(pts), 4), round(sum(p[1] for p in pts) / len(pts), 4)] if pts else None


def build_capital():
    print("Capital spending (CPDB, capital plan, MTA) ...")
    D = CPDB
    total = int(scalar(NYC, D, "count(*)"))
    by_agency = soql(NYC, D, select="magencyacro as a, max(magencyname) as name, count(*) as n, "
                                    "sum(spent_total) as spent, sum(totalplannedcommit) as planned",
                     group="a", order="spent desc", limit=20)
    by_type = soql(NYC, D, select="typecategory as t, count(*) as n, sum(spent_total) as spent", group="t")
    markers = []
    for G, kind in [(CPDB_POINTS, "point"), (CPDB_POLYS, "polygon")]:
        for r in soql_all(NYC, G, select="maprojid, magencyacro, description, spent_total, plannedcommit_total, the_geom"):
            c = _centroid(r["the_geom"]) if r.get("the_geom") else None
            if c and in_nyc(*c):
                markers.append([c[0], c[1], r.get("magencyacro"), (r.get("description") or "")[:80],
                                round(num(r.get("spent_total"))), round(num(r.get("plannedcommit_total"))), kind])
    log_pull(D, "Capital Projects Database (CPDB) – projects", total)

    P = CAPITAL_PLAN
    plan = soql(NYC, P, select="pub_date, count(*) as n, sum(year1_amt + year2_amt + year3_amt + year4_amt) as amt",
                group="pub_date", order="pub_date")
    log_pull(P, "Capital Commitment Plan (budget lines)", int(scalar(NYC, P, "count(*)")))
    write("capital", {
        "datasets": {"cpdb": D, "points": CPDB_POINTS, "polys": CPDB_POLYS, "plan": P},
        "rows": total, "version": scalar(NYC, D, "max(ccpversion)"),
        "by_agency": [[r.get("a") or "(blank)", r.get("name") or "", int(r["n"]), num(r.get("spent")),
                       num(r.get("planned"))] for r in by_agency],
        "by_type": [[r.get("t") or "(blank)", int(r["n"]), num(r.get("spent"))] for r in by_type],
        "markers": markers,
        "plan_pubs": [[r.get("pub_date"), int(r["n"]), num(r.get("amt"))] for r in plan if r.get("pub_date")],
    })


def build_schools():
    print("Schools ...")
    sqr = soql(NYC, SQR, select="school_year, report_type, count(*) as n, count(distinct dbn) as s",
               group="school_year, report_type", order="school_year")
    metrics = soql(NYC, SQR, select="count(distinct metric_display_name) as m")[0]["m"]
    top_metrics = soql(NYC, SQR, select="metric_display_name as m, count(*) as n", where="report_type = 'EMS'",
                       group="m", order="n desc", limit=12)
    log_pull(SQR, "School Quality Reports", int(scalar(NYC, SQR, "count(*)")))
    tests = {}
    for key, D, cat, p34 in [("ela", ELA, "category", "level_3_4_1"), ("math", MATH, "student_category", "pct_level_3_and_4")]:
        city = soql(NYC, D, select=f"year, {p34} as p, number_tested as t",
                    where=f"report_category = 'Citywide' and grade = 'All Grades' and {cat} = 'All Students'",
                    order="year")
        schools = soql(NYC, D, select="year, count(distinct geographic_subdivision) as s" if key == "ela"
                       else "year, count(distinct geographic_division) as s",
                       where="report_category = 'School'", group="year", order="year")
        tests[key] = {"dataset": D, "city": [[int(r["year"]), num(r["p"]), int(num(r["t"]))] for r in city],
                      "schools": [[int(r["year"]), int(r["s"])] for r in schools]}
        log_pull(D, f"{key.upper()} test results 2013–2023", int(scalar(NYC, D, "count(*)")))
    locs = soql_all(NYC, SCHOOL_LOCS, select="system_code, location_name, location_category_description, "
                                             "geographical_district_code, nta, latitude, longitude")
    pts = [[round(num(r["longitude"]), 4), round(num(r["latitude"]), 4), r.get("location_name"),
            r.get("location_category_description"), r.get("geographical_district_code"), r.get("system_code")]
           for r in locs if in_nyc(num(r.get("longitude")), num(r.get("latitude")))]
    log_pull(SCHOOL_LOCS, "2019–2020 School Locations", len(locs))
    write("schools", {
        "datasets": {"sqr": SQR, "ela": ELA, "math": MATH, "locs": SCHOOL_LOCS},
        "sqr": [[int(r["school_year"]), r["report_type"], int(r["n"]), int(r["s"])] for r in sqr],
        "sqr_metrics": int(metrics), "sqr_top_metrics": rows_to_pairs(top_metrics, "m"),
        "tests": tests, "locations": pts, "locations_total": len(locs),
        "categories": Counter(r.get("location_category_description") for r in locs).most_common(),
    })


STREET_CRIMES = ["ROBBERY", "FELONY ASSAULT", "GRAND LARCENY", "PETIT LARCENY", "BURGLARY",
                 "ASSAULT 3 & RELATED OFFENSES"]


def build_crime():
    print("Crime (NYPD complaints) ...")
    D = NYPD_HIST
    total = int(scalar(NYC, D, "count(*)"))
    ytd = int(scalar(NYC, NYPD_YTD, "count(*)"))
    ytd_last = scalar(NYC, NYPD_YTD, "max(rpt_dt)")
    by_year = soql(NYC, D, select="date_extract_y(rpt_dt) as y, count(*) as n, count(latitude) as g",
                   group="y", order="y")
    inlist = ",".join(f"'{c}'" for c in STREET_CRIMES)
    street = soql_all(NYC, D, select="date_extract_y(rpt_dt) as y, ofns_desc as o, count(*) as n",
                      where=f"ofns_desc in ({inlist})", group="y, o")
    street += soql_all(NYC, NYPD_YTD, select="date_extract_y(rpt_dt) as y, ofns_desc as o, count(*) as n",
                       where=f"ofns_desc in ({inlist})", group="y, o")
    offenses = soql(NYC, D, select="ofns_desc as o, count(*) as n", group="o", order="n desc", limit=25)
    robbery = soql(NYC, D, select="pd_desc as d, count(*) as n", where="ofns_desc = 'ROBBERY'",
                   group="d", order="n desc", limit=15)
    premises = soql(NYC, D, select="prem_typ_desc as p, count(*) as n", group="p", order="n desc", limit=15)
    law = soql(NYC, D, select="law_cat_cd as l, count(*) as n", group="l", order="n desc")
    bad_dates = int(scalar(NYC, D, "count(*)", "cmplnt_fr_dt < '2000-01-01'"))
    lag = int(scalar(NYC, D, "count(*)", "rpt_dt >= '2025-01-01' and cmplnt_fr_dt < '2024-01-01'"))
    rob_pts = soql_all(NYC, D, select="latitude, longitude",
                       where="ofns_desc = 'ROBBERY' and rpt_dt >= '2025-01-01' and latitude is not null")
    lonlat = [(num(p["longitude"]), num(p["latitude"])) for p in rob_pts]
    lonlat = [(x, y) for x, y in lonlat if in_nyc(x, y)]
    fields = ["cmplnt_num", "rpt_dt", "cmplnt_fr_dt", "ofns_desc", "pd_desc", "law_cat_cd", "crm_atpt_cptd_cd",
              "boro_nm", "addr_pct_cd", "prem_typ_desc", "loc_of_occur_desc", "latitude", "susp_age_group", "vic_age_group"]
    miss = missingness(NYC, D, fields, total)
    log_pull(D, "NYPD Complaint Data Historic", total)
    log_pull(NYPD_YTD, "NYPD Complaint Data Current (YTD)", ytd, {"last": ytd_last})
    write("crime", {
        "datasets": {"hist": D, "ytd": NYPD_YTD}, "rows": total, "ytd_rows": ytd, "ytd_last": ytd_last,
        "by_year": [[int(r["y"]), int(r["n"]), int(num(r["g"]))] for r in by_year if r.get("y")],
        "street": [[int(r["y"]), r["o"], int(r["n"])] for r in street if r.get("y")],
        "street_list": STREET_CRIMES,
        "offenses": rows_to_pairs(offenses, "o"), "robbery_types": rows_to_pairs(robbery, "d"),
        "premises": rows_to_pairs(premises, "p"), "law": rows_to_pairs(law, "l"),
        "bad_dates": bad_dates, "late_reports_2025": lag, "missing_pct": miss,
        "robbery_grid_2025": grid_bin(lonlat), "robbery_2025": len(lonlat),
    })


def build_subway():
    print("Subway (MTA) ...")
    st = soql_all(NYS, MTA_STATIONS, select="stop_name, borough, daytime_routes, structure, ada, gtfs_latitude, "
                                            "gtfs_longitude, complex_id")
    stations = [[round(num(s["gtfs_longitude"]), 4), round(num(s["gtfs_latitude"]), 4), s.get("stop_name"),
                 s.get("daytime_routes"), s.get("structure"), s.get("ada")] for s in st]
    log_pull(MTA_STATIONS, "MTA Subway Stations", len(st))
    rid = soql_all(NYS, MTA_RIDERSHIP, select="month, sum(ridership) as r, count(distinct station_complex_id) as s",
                   group="month", order="month")
    log_pull(MTA_RIDERSHIP, "MTA Subway Station Monthly Ridership", int(scalar(NYS, MTA_RIDERSHIP, "count(*)")))
    elev = soql(NYS, MTA_ELEVATORS, select="date_extract_y(month) as y, sum(scheduled_outages) as s, "
                                           "sum(unscheduled_outages) as u, count(distinct equipment_code) as e",
                group="y", order="y")
    log_pull(MTA_ELEVATORS, "Subway Elevator & Escalator Availability", int(scalar(NYS, MTA_ELEVATORS, "count(*)")))
    alerts = soql(NYS, MTA_ALERTS, select="agency as a, date_extract_y(date) as y, count(*) as n, "
                                          "sum(case(status_label like '%planned%',1,true,0)) as p",
                  group="a, y", order="y")
    subway_labels = soql(NYS, MTA_ALERTS, select="status_label as s, count(*) as n", where="agency = 'NYCT Subway'",
                         group="s", order="n desc", limit=15)
    log_pull(MTA_ALERTS, "MTA Service Alerts (2020–)", int(scalar(NYS, MTA_ALERTS, "count(*)")))
    proj = soql_all(NYS, MTA_CAPITAL)
    log_pull(MTA_CAPITAL, "MTA Capital Project Details", len(proj))
    write("subway", {
        "datasets": {"stations": MTA_STATIONS, "ridership": MTA_RIDERSHIP, "elevators": MTA_ELEVATORS,
                     "alerts": MTA_ALERTS, "capital": MTA_CAPITAL},
        "stations": stations,
        "ridership": [[r["month"][:7], num(r["r"]), int(r["s"])] for r in rid],
        "elevators": [[int(r["y"]), int(num(r["s"])), int(num(r["u"])), int(r["e"])] for r in elev],
        "alerts": [[r.get("a"), int(r["y"]), int(r["n"]), int(num(r["p"]))] for r in alerts if r.get("y")],
        "subway_labels": rows_to_pairs(subway_labels, "s"),
        "projects": [{k: p.get(k) for k in ("title", "stage", "phase", "agencies", "asset_categories", "districts",
                                            "start_date", "goal_completion_date", "estimated_actual_completion_date",
                                            "goal_project_cost", "estimated_actual_project_cost", "schedule_status",
                                            "budget_status")} for p in proj],
    })


def build_fires():
    print("Fires (FDNY) ...")
    D = FIRE_DISPATCH
    total = int(scalar(NYC, D, "count(*)"))
    by_year = soql(NYC, D, select="date_extract_y(incident_datetime) as y, incident_classification_group as g, count(*) as n",
                   group="y, g", order="y")
    classes = soql(NYC, D, select="incident_classification as c, count(*) as n",
                   where="incident_classification_group = 'Structural Fires'", group="c", order="n desc")
    boro = soql(NYC, D, select="incident_borough as b, count(*) as n",
                where="incident_classification_group = 'Structural Fires'", group="b", order="n desc")
    geo = soql(NYC, D, select="count(zipcode) as z, count(communitydistrict) as cd, count(policeprecinct) as pp, count(*) as t",
               where="incident_classification_group = 'Structural Fires'")[0]
    log_pull(D, "FDNY Fire Incident Dispatch Data", total)
    C = FIRE_CAUSES
    c_total = int(scalar(NYC, C, "count(*)"))
    c_year = soql(NYC, C, select="case_year as y, fire_code_category as c, count(*) as n", group="y, c", order="y")
    causes = soql(NYC, C, select="cause_fire_description as d, count(*) as n", group="d", order="n desc", limit=20)
    cls = soql(NYC, C, select="incident_classification as d, count(*) as n", group="d", order="n desc", limit=15)
    log_pull(C, "FDNY Bureau of Fire Investigations – Fire Causes", c_total)
    write("fires", {
        "datasets": {"dispatch": D, "causes": C}, "rows": total, "causes_rows": c_total,
        "by_year_group": [[int(r["y"]), r.get("g") or "(blank)", int(r["n"])] for r in by_year if r.get("y")],
        "structural_classes": rows_to_pairs(classes, "c"), "structural_boro": rows_to_pairs(boro, "b"),
        "structural_geo": {k: int(num(v)) for k, v in geo.items()},
        "causes_by_year": [[int(r["y"]), r.get("c") or "(blank)", int(r["n"])] for r in c_year if r.get("y")],
        "causes": rows_to_pairs(causes, "d"), "cause_classes": rows_to_pairs(cls, "d"),
    })


BUILDERS = {"nta": build_nta, "inspections": build_inspections, "sales": build_sales,
            "licenses": build_licenses, "food_access": build_food_access,
            "turnover": build_turnover, "chains": build_chains, "rent": build_rent, "values": build_values,
            "construction": build_construction, "capital": build_capital, "schools": build_schools,
            "crime": build_crime, "subway": build_subway, "fires": build_fires}


def main():
    targets = sys.argv[1:] or list(BUILDERS)
    if MANIFEST.exists():
        manifest.update(json.loads(MANIFEST.read_text(encoding="utf-8")))
    for t in targets:
        t0 = time.time()
        BUILDERS[t]()
        print(f"   ({time.time() - t0:.0f}s)")
        # Save after every builder so one failed source doesn't lose the others' records.
        MANIFEST.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        write("manifest", manifest)


if __name__ == "__main__":
    main()
