"""
build_training_table_v2.py -- Phase 2: combine the 2020 sample (100
events) with the 2021-2024 expansion (155 events, of which 30 were a
targeted backfill correcting a self-caught sampling gap -- see
backfill_peaceful_2022_2024.py) into one 255-event training table.

Reuses every Phase 1 technique unchanged (imported directly, not
copy-pasted): the haversine lat/long geo-distance filter, the ACLED
severity-cutoff label, the missingness flags. Adds two things Phase 1
did not have:

1. Sequence-anchored pre-event windows (mentor note: avoid using GDELT
   coverage of an earlier, correlated protest as if it were independent
   "ambient" signal for a later one in the same wave). Events in the
   same admin1 (state) within SEQUENCE_GAP_DAYS of a neighboring event
   are chained into one sequence; every event in a sequence uses the
   SEQUENCE'S earliest date, not its own, as the pre-event window
   anchor. This is a pure re-filter of rows already pulled by date --
   no new BigQuery cost. A later event in a wave that would otherwise
   "see" real news about an earlier, already-labeled event in the same
   wave now doesn't get that shortcut.

2. An `era` feature (the event's year) exposed as an explicit model
   input, so a model CAN learn a time-varying baseline instead of
   silently absorbing 2020-only patterns as if they were universal
   (mentor note: time-varying parameters).

GKG coverage is intentionally partial for 2021-2024 (real BigQuery cost
constraints, documented on the page) -- had_gkg_match distinguishes
"no coverage attempted/found" from "coverage found," same as Phase 1.
"""
import csv
import json
import math
import re
from collections import defaultdict
from pathlib import Path
from datetime import datetime, timedelta

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"

GEO_DISTANCE_LIMIT_MILES = 50.0
GKG_ROWS_PER_EVENT_CAP = 25
SEQUENCE_GAP_DAYS = 5
PRE_EVENT_WINDOW_DAYS = 7

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
    r = 3958.8
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def matching_location_distances(v2locations, location_text, acled_lat, acled_lon):
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
        hits.append((haversine_miles(acled_lat, acled_lon, lat, lon), full_name))
    hits.sort(key=lambda t: t[0])
    return hits


def load_json(name):
    path = DATA / name
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else []


def mean(xs):
    xs = [x for x in xs if x is not None]
    return sum(xs) / len(xs) if xs else None


def assign_sequences(events):
    """Group events by admin1, chain consecutive events within
    SEQUENCE_GAP_DAYS of each other into one sequence, return
    {event_id_cnty: sequence_start_date} for every event."""
    by_state = defaultdict(list)
    for e in events:
        by_state[e.get("admin1", "UNKNOWN")].append(e)

    seq_start = {}
    sequences_formed = 0
    events_reanchored = 0
    for state, state_events in by_state.items():
        state_events.sort(key=lambda e: e["event_date"])
        current_start = None
        last_date = None
        for e in state_events:
            d = datetime.strptime(e["event_date"], "%Y-%m-%d")
            if current_start is None or (d - last_date).days > SEQUENCE_GAP_DAYS:
                current_start = d
                sequences_formed += 1
            else:
                events_reanchored += 1
            seq_start[e["event_id_cnty"]] = current_start
            last_date = d
    return seq_start, sequences_formed, events_reanchored


def build():
    acled = load_json("acled_sample_255.json")
    gkg = (load_json("gdelt_sample_100.json") + load_json("gdelt_sample_2021_2025.json") + load_json("gdelt_sample_2021_2025_part2.json")
           + load_json("gdelt_gkg_missing_2024.json") + load_json("gdelt_gkg_missing_2023.json"))
    events_tbl = (load_json("gdelt_events_sample.json") + load_json("gdelt_events_sample_2021_2025.json") + load_json("gdelt_events_backfill.json")
                  + load_json("gdelt_events_missing_fill_2026.json"))

    seq_start, sequences_formed, events_reanchored = assign_sequences(acled)

    gkg_by_event = defaultdict(list)
    for r in gkg:
        gkg_by_event[r["_acled_event_id"]].append(r)
    events_by_event = defaultdict(list)
    for r in events_tbl:
        events_by_event[r["_acled_event_id"]].append(r)

    rows_out = []
    geo_stats = {"gkg_rows_seen": 0, "gkg_rows_kept": 0, "gkg_rows_dropped_geo": 0, "gkg_rows_dropped_sequence": 0,
                 "events_rows_seen": 0, "events_rows_kept": 0, "events_rows_dropped_state": 0, "events_rows_dropped_sequence": 0}

    for event in acled:
        eid = event["event_id_cnty"]
        acled_lat, acled_lon = float(event["latitude"]), float(event["longitude"])
        acled_state_abbr = STATE_NAME_TO_ABBR.get(event.get("admin1", ""))

        seq_anchor = seq_start[eid]
        window_end = seq_anchor - timedelta(days=1)
        window_start = window_end - timedelta(days=PRE_EVENT_WINDOW_DAYS - 1)
        window_start_int = int(window_start.strftime("%Y%m%d"))
        window_end_int = int(window_end.strftime("%Y%m%d"))

        kept_gkg = []
        for r in gkg_by_event.get(eid, []):
            geo_stats["gkg_rows_seen"] += 1
            row_date_int = int(str(r["DATE"])[:8])
            if not (window_start_int <= row_date_int <= window_end_int):
                geo_stats["gkg_rows_dropped_sequence"] += 1
                continue
            hits = matching_location_distances(r["V2Locations"], event["location"], acled_lat, acled_lon)
            best_dist = hits[0][0] if hits else None
            if best_dist is not None and best_dist <= GEO_DISTANCE_LIMIT_MILES:
                geo_stats["gkg_rows_kept"] += 1
                kept_gkg.append(r)
            else:
                geo_stats["gkg_rows_dropped_geo"] += 1

        kept_events = []
        for r in events_by_event.get(eid, []):
            geo_stats["events_rows_seen"] += 1
            row_date_int = int(str(r["SQLDATE"])[:8])
            if not (window_start_int <= row_date_int <= window_end_int):
                geo_stats["events_rows_dropped_sequence"] += 1
                continue
            lat, lon = r.get("ActionGeo_Lat"), r.get("ActionGeo_Long")
            if lat is not None and lon is not None:
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
            "year": event["year"],
            "in_sequence": seq_anchor != datetime.strptime(event["event_date"], "%Y-%m-%d"),
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
            "matching_method_version": "v3_sequence_anchored_geo_distance",
        })

    return rows_out, geo_stats, sequences_formed, events_reanchored


def write_csv(rows, out_path):
    if not rows:
        return
    fieldnames = list(rows[0].keys())
    with out_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def main():
    rows, geo_stats, sequences_formed, events_reanchored = build()

    print(f"[build v2] {len(rows)} events written to the combined training table.")
    print(f"[build v2] Sequence detection: {sequences_formed} sequences formed across all states, "
          f"{events_reanchored}/{len(rows)} events ({events_reanchored/len(rows)*100:.1f}%) had their "
          f"pre-event window re-anchored to an earlier, correlated event's date instead of their own.")
    print(f"[build v2] GKG rows: {geo_stats['gkg_rows_seen']} seen -> {geo_stats['gkg_rows_kept']} kept, "
          f"{geo_stats['gkg_rows_dropped_geo']} dropped for geo-distance, "
          f"{geo_stats['gkg_rows_dropped_sequence']} dropped for falling after the sequence-anchored cutoff.")
    print(f"[build v2] Events-table rows: {geo_stats['events_rows_seen']} seen -> {geo_stats['events_rows_kept']} kept, "
          f"{geo_stats['events_rows_dropped_state']} dropped for wrong state/distance, "
          f"{geo_stats['events_rows_dropped_sequence']} dropped for the sequence cutoff.")

    had_gkg = sum(1 for r in rows if r["had_gkg_match"])
    had_events = sum(1 for r in rows if r["had_events_match"])
    by_year = defaultdict(lambda: [0, 0])
    for r in rows:
        by_year[r["year"]][0] += 1
        if r["had_gkg_match"]:
            by_year[r["year"]][1] += 1
    print(f"\n[build v2] Coverage: {had_gkg}/{len(rows)} events retain a GKG match, {had_events}/{len(rows)} retain an Events match.")
    print("[build v2] GKG coverage by year (time-varying sparsity):")
    for y in sorted(by_year):
        n, hit = by_year[y]
        print(f"    {y}: {hit}/{n} ({hit/n*100:.1f}%)")

    out_path = DATA / "training_table_v2.csv"
    write_csv(rows, out_path)
    print(f"\n[build v2] wrote {out_path}")


if __name__ == "__main__":
    main()
