"""
build_training_table.py -- Phase 1, Step 1: clean the Phase 0 pulls into
one row per ACLED event, ready for modeling.

Uses ONLY data already pulled and cached under data/ -- no ACLED or
BigQuery calls happen here, on purpose (Phase 0's quota is already at
~64% of the monthly free tier).

Advisor question #2 answered here: for every GDELT GKG match, this
parses the matched V2Locations entry's own lat/long and computes its
haversine distance from the ACLED event's lat/long (already on every
ACLED record). Rows farther than GEO_DISTANCE_LIMIT_MILES from the real
event are dropped before any feature is averaged -- this is the concrete
fix for the Portland ME/OR-style same-name-different-state errors Phase
0 flagged but never actually filtered out.

The GDELT Events table pull never selected ActionGeo_Lat/ActionGeo_Long
(only ActionGeo_FullName/CountryCode/ADM1Code), so the same lat/long
check isn't possible there with data already on hand -- this is flagged
below as a concrete fix for inspect_gdelt_events.py's FIELDS list in a
future pull, not silently ignored. In the meantime, Events-table rows
are cross-checked at the coarser state (ADM1) level instead.
"""
import json
import math
import re
from pathlib import Path
from datetime import datetime

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"

GEO_DISTANCE_LIMIT_MILES = 50.0
GKG_ROWS_PER_EVENT_CAP = 25  # ROWS_PER_EVENT in inspect_gdelt.py -- hitting this means
                             # the row count is right-censored, not a true volume count.

STATE_NAME_TO_ABBR = {
    "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR", "California": "CA",
    "Colorado": "CO", "Connecticut": "CT", "Delaware": "DE", "Florida": "FL", "Georgia": "GA",
    "Hawaii": "HI", "Idaho": "ID", "Illinois": "IL", "Indiana": "IN", "Iowa": "IA",
    "Kansas": "KS", "Kentucky": "KY", "Louisiana": "LA", "Maine": "ME", "Maryland": "MD",
    "Massachusetts": "MA", "Michigan": "MI", "Minnesota": "MN", "Mississippi": "MS",
    "Missouri": "MO", "Montana": "MT", "Nebraska": "NE", "Nevada": "NV",
    "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
    "North Carolina": "NC", "North Dakota": "ND", "Ohio": "OH", "Oklahoma": "OK",
    "Oregon": "OR", "Pennsylvania": "PA", "Rhode Island": "RI", "South Carolina": "SC",
    "South Dakota": "SD", "Tennessee": "TN", "Texas": "TX", "Utah": "UT", "Vermont": "VT",
    "Virginia": "VA", "Washington": "WA", "West Virginia": "WV", "Wisconsin": "WI",
    "Wyoming": "WY", "District of Columbia": "DC",
}


def haversine_miles(lat1, lon1, lat2, lon2):
    r = 3958.8  # earth radius, miles
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def matching_location_distances(v2locations, location_text, acled_lat, acled_lon):
    """Every V2Locations entry whose FullName contains location_text AND is
    tagged #US# (the same condition inspect_gdelt.py's pull-time regex used),
    with its own lat/long parsed out and compared to the real ACLED lat/long.
    Returns a list of (distance_miles, entry_fullname) tuples, closest first.
    """
    escaped = re.escape(location_text)
    hits = []
    for entry in v2locations.split(";"):
        fields = entry.split("#")
        if len(fields) < 9:
            continue
        full_name, country_code = fields[1], fields[2]
        if country_code != "US" or not re.search(escaped, full_name):
            continue
        try:
            lat, lon = float(fields[5]), float(fields[6])
        except ValueError:
            continue
        dist = haversine_miles(acled_lat, acled_lon, lat, lon)
        hits.append((dist, full_name))
    hits.sort(key=lambda t: t[0])
    return hits


def load_json(name):
    path = DATA / name
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else []


def mean(xs):
    xs = [x for x in xs if x is not None]
    return sum(xs) / len(xs) if xs else None


def build():
    acled = load_json("acled_sample_100.json")
    gkg = load_json("gdelt_sample_100.json")
    events_tbl = load_json("gdelt_events_sample.json")

    gkg_by_event = {}
    for r in gkg:
        gkg_by_event.setdefault(r["_acled_event_id"], []).append(r)
    events_by_event = {}
    for r in events_tbl:
        events_by_event.setdefault(r["_acled_event_id"], []).append(r)

    rows_out = []
    geo_stats = {"gkg_rows_seen": 0, "gkg_rows_kept": 0, "gkg_rows_dropped_geo": 0,
                 "events_rows_seen": 0, "events_rows_kept": 0, "events_rows_dropped_state": 0}
    dropped_examples = []

    for event in acled:
        eid = event["event_id_cnty"]
        acled_lat, acled_lon = float(event["latitude"]), float(event["longitude"])
        acled_state_abbr = STATE_NAME_TO_ABBR.get(event.get("admin1", ""))

        kept_gkg = []
        for r in gkg_by_event.get(eid, []):
            geo_stats["gkg_rows_seen"] += 1
            hits = matching_location_distances(r["V2Locations"], event["location"], acled_lat, acled_lon)
            best_dist = hits[0][0] if hits else None
            if best_dist is not None and best_dist <= GEO_DISTANCE_LIMIT_MILES:
                geo_stats["gkg_rows_kept"] += 1
                kept_gkg.append(r)
            else:
                geo_stats["gkg_rows_dropped_geo"] += 1
                if len(dropped_examples) < 8 and best_dist is not None and eid not in {e["event_id"] for e in dropped_examples}:
                    dropped_examples.append({
                        "event_id": eid, "acled_location": f"{event['location']}, {event.get('admin1')}",
                        "matched_fullname": hits[0][1], "distance_miles": round(best_dist, 1),
                    })

        kept_events = []
        for r in events_by_event.get(eid, []):
            geo_stats["events_rows_seen"] += 1
            lat, lon = r.get("ActionGeo_Lat"), r.get("ActionGeo_Long")
            if lat is not None and lon is not None:
                # Future pulls include ActionGeo_Lat/Long (see inspect_gdelt_events.py) --
                # use the same precise haversine check GKG rows get instead of the coarser
                # state-level proxy below.
                is_ok = haversine_miles(acled_lat, acled_lon, float(lat), float(lon)) <= GEO_DISTANCE_LIMIT_MILES
            else:
                row_state = (r.get("ActionGeo_ADM1Code") or "")[-2:]
                is_ok = acled_state_abbr is None or row_state == acled_state_abbr
            if is_ok:
                geo_stats["events_rows_kept"] += 1
                kept_events.append(r)
            else:
                geo_stats["events_rows_dropped_state"] += 1

        raw_gkg_row_count = len(gkg_by_event.get(eid, []))
        tone_fields = [r["V2Tone"].split(",") for r in kept_gkg if r.get("V2Tone")]
        tone_cols = list(zip(*tone_fields)) if tone_fields else [[]] * 7
        avg_tone = mean([float(x) for x in tone_cols[0]]) if tone_cols[0] else None
        tone_pos = mean([float(x) for x in tone_cols[1]]) if tone_cols[0] else None
        tone_neg = mean([float(x) for x in tone_cols[2]]) if tone_cols[0] else None
        tone_polarity = mean([float(x) for x in tone_cols[3]]) if tone_cols[0] else None
        tone_activity = mean([float(x) for x in tone_cols[4]]) if tone_cols[0] else None
        tone_selfgroup = mean([float(x) for x in tone_cols[5]]) if tone_cols[0] else None
        tone_wordcount = mean([float(x) for x in tone_cols[6]]) if tone_cols[0] else None

        kept_events_sorted = sorted(kept_events, key=lambda r: r["SQLDATE"])
        goldstein_trend = None
        if len(kept_events_sorted) >= 4:
            mid = len(kept_events_sorted) // 2
            first_half = mean([r["GoldsteinScale"] for r in kept_events_sorted[:mid]])
            second_half = mean([r["GoldsteinScale"] for r in kept_events_sorted[mid:]])
            if first_half is not None and second_half is not None:
                goldstein_trend = second_half - first_half

        quad_counts = {1: 0, 2: 0, 3: 0, 4: 0}
        for r in kept_events:
            qc = r.get("QuadClass")
            if qc in quad_counts:
                quad_counts[qc] += 1
        conflict_total = quad_counts[3] + quad_counts[4]
        quad_class_ratio = (quad_counts[4] / conflict_total) if conflict_total else None

        rows_out.append({
            "event_id": eid,
            "event_date": event["event_date"],
            "label_sub_event_type": event["sub_event_type"],
            "label_escalated": 0 if event["sub_event_type"] == "Peaceful protest" else 1,
            "fatalities": event.get("fatalities", 0),
            "avg_tone": avg_tone,
            "tone_positive_score": tone_pos,
            "tone_negative_score": tone_neg,
            "tone_polarity": tone_polarity,
            "tone_activity_density": tone_activity,
            "tone_self_group_density": tone_selfgroup,
            "tone_word_count": tone_wordcount,
            "goldstein_trend": goldstein_trend,
            "quad_class_ratio": quad_class_ratio,
            "volume_mention_spike": len(kept_gkg),
            "volume_right_censored": raw_gkg_row_count >= GKG_ROWS_PER_EVENT_CAP,
            "had_gkg_match": len(kept_gkg) > 0,
            "had_events_match": len(kept_events) > 0,
            "matching_method_version": "v2_country_theme_filtered+geo_distance_v1",
        })

    return rows_out, geo_stats, dropped_examples


def write_csv(rows, out_path):
    if not rows:
        return
    fieldnames = list(rows[0].keys())
    import csv
    with out_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def main():
    rows, geo_stats, dropped_examples = build()

    print(f"[build] {len(rows)} events written to the training table.")
    print(f"[build] GKG rows: {geo_stats['gkg_rows_seen']} seen -> "
          f"{geo_stats['gkg_rows_kept']} kept, {geo_stats['gkg_rows_dropped_geo']} dropped "
          f"for being >{GEO_DISTANCE_LIMIT_MILES:.0f} mi from the real ACLED event "
          f"({geo_stats['gkg_rows_dropped_geo'] / max(geo_stats['gkg_rows_seen'], 1) * 100:.1f}%).")
    print(f"[build] Events-table rows: {geo_stats['events_rows_seen']} seen -> "
          f"{geo_stats['events_rows_kept']} kept, {geo_stats['events_rows_dropped_state']} dropped "
          f"for landing in the wrong state (ADM1 code mismatch) "
          f"({geo_stats['events_rows_dropped_state'] / max(geo_stats['events_rows_seen'], 1) * 100:.1f}%). "
          f"NOTE: this table never pulled ActionGeo_Lat/ActionGeo_Long, so this is a coarser "
          f"state-level check, not the same haversine distance used for GKG.")
    print()
    print("[build] Example geo-mismatches caught and dropped (previously silent):")
    for ex in dropped_examples:
        print(f"  - {ex['event_id']} ({ex['acled_location']}) matched to "
              f"'{ex['matched_fullname']}' -- {ex['distance_miles']} mi away")

    had_gkg = sum(1 for r in rows if r["had_gkg_match"])
    had_events = sum(1 for r in rows if r["had_events_match"])
    print()
    print(f"[build] Coverage after geo-filtering: {had_gkg}/{len(rows)} events retain a GKG match, "
          f"{had_events}/{len(rows)} retain an Events-table match.")

    out_path = DATA / "training_table.csv"
    write_csv(rows, out_path)
    print(f"[build] wrote {out_path}")


if __name__ == "__main__":
    main()
