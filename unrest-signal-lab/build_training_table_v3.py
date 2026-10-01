"""
build_training_table_v3.py -- rebuilds the training table on the full
505-event ACLED set (data/acled_sample_full.json), combining every GKG/
Events source available right now:
  1. The original BigQuery pulls (same files v2 used) -- full coverage
     for the original 255 events.
  2. Whatever pi_gdelt_raw_pull.py has finished so far on the Pi
     (data/gdelt_raw_gkg/*.json, data/gdelt_raw_events/*.json) -- partial,
     growing coverage for the full 505-event set, currently however many
     of the 992 unique pre-event days are done (check with
     pi_gdelt_raw_pull.py --status).

This is an honest snapshot, not a final table: most of the 250 new
2022-2026 events will show zero GDELT signal until the Pi backfill
reaches their pre-event windows (it processes days oldest-first, so the
newest events are matched last). Rerun this script again later as the
Pi finishes more days -- it always reads whatever is on disk right now.

Reuses every v2 technique unchanged (sequence-anchoring, haversine
geo-filter, severity label) with one addition: raw-pull rows arrive
already geo-matched (pi_gdelt_raw_pull.py did that filtering itself,
then dropped the location fields to keep file sizes small), so they
skip the geo-distance re-check that BigQuery rows still need and go
straight to the date-window + cap check.
"""
import json
from collections import defaultdict
from pathlib import Path

import build_training_table_v2 as v2

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"


def load_raw_pull_dir(dirname):
    d = DATA / dirname
    if not d.exists():
        return []
    rows = []
    for f in d.glob("*.json"):
        rows.extend(json.loads(f.read_text(encoding="utf-8")))
    return rows


def build():
    acled = json.loads((DATA / "acled_sample_full.json").read_text(encoding="utf-8"))

    gkg = (v2.load_json("gdelt_sample_100.json") + v2.load_json("gdelt_sample_2021_2025.json")
           + v2.load_json("gdelt_sample_2021_2025_part2.json") + v2.load_json("gdelt_gkg_missing_2024.json")
           + v2.load_json("gdelt_gkg_missing_2023.json") + load_raw_pull_dir("gdelt_raw_gkg"))
    events_tbl = (v2.load_json("gdelt_events_sample.json") + v2.load_json("gdelt_events_sample_2021_2025.json")
                  + v2.load_json("gdelt_events_backfill.json") + v2.load_json("gdelt_events_missing_fill_2026.json")
                  + load_raw_pull_dir("gdelt_raw_events"))

    seq_start, sequences_formed, events_reanchored = v2.assign_sequences(acled)

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
        acled_state_abbr = v2.STATE_NAME_TO_ABBR.get(event.get("admin1", ""))

        seq_anchor = seq_start[eid]
        window_end = seq_anchor - v2.timedelta(days=1)
        window_start = window_end - v2.timedelta(days=v2.PRE_EVENT_WINDOW_DAYS - 1)
        window_start_int = int(window_start.strftime("%Y%m%d"))
        window_end_int = int(window_end.strftime("%Y%m%d"))

        kept_gkg = []
        for r in gkg_by_event.get(eid, []):
            geo_stats["gkg_rows_seen"] += 1
            row_date_int = int(str(r["DATE"])[:8])
            if not (window_start_int <= row_date_int <= window_end_int):
                geo_stats["gkg_rows_dropped_sequence"] += 1
                continue
            if "V2Locations" in r:
                hits = v2.matching_location_distances(r["V2Locations"], event["location"], acled_lat, acled_lon)
                best_dist = hits[0][0] if hits else None
                if best_dist is not None and best_dist <= v2.GEO_DISTANCE_LIMIT_MILES:
                    geo_stats["gkg_rows_kept"] += 1
                    kept_gkg.append(r)
                else:
                    geo_stats["gkg_rows_dropped_geo"] += 1
            else:
                # Already geo-matched by pi_gdelt_raw_pull.py before the
                # location fields were dropped to keep files small.
                geo_stats["gkg_rows_kept"] += 1
                kept_gkg.append(r)

        kept_events = []
        for r in events_by_event.get(eid, []):
            geo_stats["events_rows_seen"] += 1
            row_date_int = int(str(r["SQLDATE"])[:8])
            if not (window_start_int <= row_date_int <= window_end_int):
                geo_stats["events_rows_dropped_sequence"] += 1
                continue
            if "ActionGeo_Lat" in r:
                lat, lon = r.get("ActionGeo_Lat"), r.get("ActionGeo_Long")
                if lat is not None and lon is not None:
                    is_ok = v2.haversine_miles(acled_lat, acled_lon, float(lat), float(lon)) <= v2.GEO_DISTANCE_LIMIT_MILES
                else:
                    row_state = (r.get("ActionGeo_ADM1Code") or "")[-2:]
                    is_ok = acled_state_abbr is None or row_state == acled_state_abbr
                if is_ok:
                    geo_stats["events_rows_kept"] += 1
                    kept_events.append(r)
                else:
                    geo_stats["events_rows_dropped_state"] += 1
            else:
                geo_stats["events_rows_kept"] += 1
                kept_events.append(r)

        raw_gkg_row_count = len(gkg_by_event.get(eid, []))
        tone_fields = [r["V2Tone"].split(",") for r in kept_gkg if r.get("V2Tone")]
        tone_cols = list(zip(*tone_fields)) if tone_fields else [[]] * 7
        avg_tone = v2.mean([float(x) for x in tone_cols[0]]) if tone_cols[0] else None
        tone_pos = v2.mean([float(x) for x in tone_cols[1]]) if tone_cols[0] else None
        tone_neg = v2.mean([float(x) for x in tone_cols[2]]) if tone_cols[0] else None
        tone_polarity = v2.mean([float(x) for x in tone_cols[3]]) if tone_cols[0] else None
        tone_activity = v2.mean([float(x) for x in tone_cols[4]]) if tone_cols[0] else None
        tone_selfgroup = v2.mean([float(x) for x in tone_cols[5]]) if tone_cols[0] else None
        tone_wordcount = v2.mean([float(x) for x in tone_cols[6]]) if tone_cols[0] else None

        kept_events_sorted = sorted(kept_events, key=lambda r: int(r["SQLDATE"]))
        goldstein_trend = None
        if len(kept_events_sorted) >= 4:
            mid = len(kept_events_sorted) // 2
            first_half = v2.mean([float(r["GoldsteinScale"]) for r in kept_events_sorted[:mid]])
            second_half = v2.mean([float(r["GoldsteinScale"]) for r in kept_events_sorted[mid:]])
            if first_half is not None and second_half is not None:
                goldstein_trend = second_half - first_half

        quad_counts = {1: 0, 2: 0, 3: 0, 4: 0}
        for r in kept_events:
            try:
                qc = int(r.get("QuadClass"))
            except (TypeError, ValueError):
                continue
            if qc in quad_counts:
                quad_counts[qc] += 1
        conflict_total = quad_counts[3] + quad_counts[4]
        quad_class_ratio = (quad_counts[4] / conflict_total) if conflict_total else None

        rows_out.append({
            "event_id": eid,
            "event_date": event["event_date"],
            "year": event["year"],
            "in_sequence": seq_anchor != v2.datetime.strptime(event["event_date"], "%Y-%m-%d"),
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
            "volume_right_censored": raw_gkg_row_count >= v2.GKG_ROWS_PER_EVENT_CAP,
            "had_gkg_match": len(kept_gkg) > 0,
            "had_events_match": len(kept_events) > 0,
            "matching_method_version": "v4_bigquery_plus_rawfile",
        })

    return rows_out, geo_stats, sequences_formed, events_reanchored


def main():
    rows, geo_stats, sequences_formed, events_reanchored = build()

    print(f"[build v3] {len(rows)} events written to the combined training table.")
    print(f"[build v3] Sequence detection: {sequences_formed} sequences formed, "
          f"{events_reanchored}/{len(rows)} events ({events_reanchored/len(rows)*100:.1f}%) re-anchored.")
    print(f"[build v3] GKG rows: {geo_stats['gkg_rows_seen']} seen -> {geo_stats['gkg_rows_kept']} kept, "
          f"{geo_stats['gkg_rows_dropped_geo']} dropped for geo-distance, "
          f"{geo_stats['gkg_rows_dropped_sequence']} dropped for the window cutoff.")
    print(f"[build v3] Events-table rows: {geo_stats['events_rows_seen']} seen -> {geo_stats['events_rows_kept']} kept, "
          f"{geo_stats['events_rows_dropped_state']} dropped for wrong state/distance, "
          f"{geo_stats['events_rows_dropped_sequence']} dropped for the window cutoff.")

    had_gkg = sum(1 for r in rows if r["had_gkg_match"])
    had_events = sum(1 for r in rows if r["had_events_match"])
    by_year = defaultdict(lambda: [0, 0])
    for r in rows:
        by_year[r["year"]][0] += 1
        if r["had_gkg_match"]:
            by_year[r["year"]][1] += 1
    print(f"\n[build v3] Coverage: {had_gkg}/{len(rows)} events retain a GKG match, {had_events}/{len(rows)} retain an Events match.")
    print("[build v3] GKG coverage by year:")
    for y in sorted(by_year):
        n, hit = by_year[y]
        print(f"    {y}: {hit}/{n} ({hit/n*100:.1f}%)")

    out_path = DATA / "training_table_v3.csv"
    v2.write_csv(rows, out_path)
    print(f"\n[build v3] wrote {out_path}")


if __name__ == "__main__":
    main()
