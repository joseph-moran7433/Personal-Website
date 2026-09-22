"""
inspect_gdelt_events.py -- Phase 0/1 pull from gdeltv2.events_partitioned,
a SEPARATE table from the GKG table inspect_gdelt.py queries. GKG has no
Goldstein Scale or QuadClass fields; those live only here.

Phase 1 rewrite (matching_method_version "v3_batched_window"), same two
fixes as inspect_gdelt.py and for the same reason -- see that file's
docstring for the full BigQuery-billing explanation:
  1. Events sharing an event_date (identical pre-event window) are
     batched into one query via UNNEST(@patterns), instead of one query
     per event re-scanning the same day's partitions repeatedly.
  2. A window whose dry-run estimate exceeds PER_QUERY_BYTES_WARN is
     skipped by default, not just flagged.

Also fixes a real gap the Phase 1 geo-distance check surfaced: the prior
version never selected ActionGeo_Lat/ActionGeo_Long, so
build_training_table.py could only cross-check this table's rows at the
coarse state (ADM1) level, not the same haversine-distance check GKG
rows get. These two float columns are cheap (structured, typed, no text
blob) -- added below so the NEXT pull can support the precise check.
"""
import argparse
import json
import sys
from pathlib import Path

from google.cloud import bigquery

import inspect_gdelt as gkg  # reuse make_client(), PRE_EVENT_WINDOW_DAYS, group_events_by_window()
import manifest as pull_manifest

HERE = Path(__file__).resolve().parent

TABLE = "gdelt-bq.gdeltv2.events_partitioned"
ROWS_PER_EVENT = 50  # events rows are much smaller/cheaper than GKG rows

PER_QUERY_BYTES_WARN = 1 * 1024**3
CUMULATIVE_BYTES_ABORT = 100 * 1024**3

FIELDS = [
    "GLOBALEVENTID", "SQLDATE", "EventCode", "QuadClass", "GoldsteinScale",
    "ActionGeo_FullName", "ActionGeo_CountryCode", "ActionGeo_ADM1Code",
    "ActionGeo_Lat", "ActionGeo_Long",
    "NumMentions", "NumArticles", "AvgTone",
]

MATCHING_METHOD_VERSION = "v3_batched_window"

QUERY_TEMPLATE = f"""
WITH matched AS (
  SELECT {", ".join(FIELDS)}, item.event_id AS _match_event_id
  FROM `{TABLE}`, UNNEST(@patterns) AS item
  WHERE _PARTITIONTIME >= TIMESTAMP(@start_date)
    AND _PARTITIONTIME <= TIMESTAMP(@end_date)
    AND SQLDATE >= @date_start_int
    AND SQLDATE <= @date_end_int
    AND ActionGeo_CountryCode = 'US'
    AND ActionGeo_FullName LIKE item.pattern
)
SELECT * EXCEPT(rn) FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY _match_event_id ORDER BY SQLDATE) AS rn
  FROM matched
)
WHERE rn <= {ROWS_PER_EVENT}
"""


def run_one_window(client, window_start, window_end, events, cumulative_bytes, force_expensive):
    # Keyed on each event's own ACLED id, not location text -- see
    # inspect_gdelt.py's build_query() docstring for why pattern text alone
    # is unsafe as a join/partition key (two events can share a place name).
    event_by_id = {e["event_id_cnty"]: e for e in events}
    patterns = bigquery.ArrayQueryParameter("patterns", "STRUCT", [
        bigquery.StructQueryParameter(
            None,
            bigquery.ScalarQueryParameter("event_id", "STRING", e["event_id_cnty"]),
            bigquery.ScalarQueryParameter("pattern", "STRING", f"%{e['location']}%"),
        )
        for e in events
    ])
    params = [
        bigquery.ScalarQueryParameter("start_date", "STRING", window_start.strftime("%Y-%m-%d")),
        bigquery.ScalarQueryParameter("end_date", "STRING", window_end.strftime("%Y-%m-%d")),
        bigquery.ScalarQueryParameter("date_start_int", "INT64", int(window_start.strftime("%Y%m%d"))),
        bigquery.ScalarQueryParameter("date_end_int", "INT64", int(window_end.strftime("%Y%m%d"))),
        patterns,
    ]

    label = f"{window_start.date()}..{window_end.date()} ({len(events)} events batched)"

    dry_config = bigquery.QueryJobConfig(query_parameters=params, dry_run=True, use_query_cache=False)
    dry_job = client.query(QUERY_TEMPLATE, job_config=dry_config)
    estimated_bytes = dry_job.total_bytes_processed

    if cumulative_bytes + estimated_bytes > CUMULATIVE_BYTES_ABORT:
        print(f"[EVENTS] ABORT before window {label}: cumulative bytes would hit "
              f"{(cumulative_bytes + estimated_bytes) / 1024**3:.2f} GB, over the "
              f"{CUMULATIVE_BYTES_ABORT / 1024**3:.0f} GB safety cap. Stopping run.")
        return None, cumulative_bytes, True

    if estimated_bytes > PER_QUERY_BYTES_WARN and not force_expensive:
        print(f"[EVENTS] SKIPPED window {label}: estimated {estimated_bytes / 1024**3:.2f} GB "
              f"exceeds the {PER_QUERY_BYTES_WARN / 1024**3:.0f} GB per-query warn threshold. "
              f"Re-run with --force-expensive to pull it anyway.")
        return [], cumulative_bytes, False

    flag = " ** OVER PER-QUERY WARN THRESHOLD -- forced **" if estimated_bytes > PER_QUERY_BYTES_WARN else ""
    print(f"[EVENTS] window {label}: estimated {estimated_bytes / 1024**2:.1f} MB{flag}")

    real_config = bigquery.QueryJobConfig(query_parameters=params, use_query_cache=False)
    job = client.query(QUERY_TEMPLATE, job_config=real_config)
    rows = [dict(r) for r in job.result()]
    actual_bytes = job.total_bytes_processed

    print(f"[EVENTS]   -> actual: {actual_bytes / 1024**2:.1f} MB scanned, {len(rows)} rows returned "
          f"across {len(events)} events.")

    for r in rows:
        event = event_by_id.get(r.pop("_match_event_id"))
        if event is None:
            continue
        r["_acled_event_id"] = event["event_id_cnty"]
        r["_acled_location"] = event["location"]

    return rows, cumulative_bytes + actual_bytes, False


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("sample_path", nargs="?", default=str(HERE / "data" / "acled_sample_100.json"))
    parser.add_argument("out_path", nargs="?", default=str(HERE / "data" / "gdelt_events_sample.json"))
    parser.add_argument("--force-expensive", action="store_true")
    args = parser.parse_args()

    sample_path = Path(args.sample_path)
    out_path = Path(args.out_path)
    if not sample_path.exists():
        print(f"No ACLED sample found at {sample_path}.", file=sys.stderr)
        sys.exit(1)
    events = json.loads(sample_path.read_text(encoding="utf-8"))

    prior = pull_manifest.load_manifest()
    print(f"[EVENTS] manifest check: cumulative GDELT usage so far is "
          f"{prior.get('cumulative_gdelt_gb_of_monthly_quota_pct', 0)}% of the monthly free tier "
          f"before this run starts.")

    windows = gkg.group_events_by_window(events)
    print(f"[EVENTS] {len(events)} events collapse to {len(windows)} unique pre-event windows.")

    client = gkg.make_client()

    all_rows = []
    cumulative_bytes = 0
    windows_with_hits = 0
    aborted = False

    for (window_start, window_end), window_events in sorted(windows.items()):
        rows, cumulative_bytes, aborted = run_one_window(
            client, window_start, window_end, window_events, cumulative_bytes, args.force_expensive
        )
        if aborted:
            break
        if rows:
            windows_with_hits += 1
            all_rows.extend(rows)

    events_with_hits = len({r["_acled_event_id"] for r in all_rows})
    print()
    print(f"[EVENTS] TOTAL: {len(all_rows)} rows across {events_with_hits}/{len(events)} events "
          f"({windows_with_hits}/{len(windows)} windows had hits), "
          f"{cumulative_bytes / 1024**3:.3f} GB scanned"
          f"{' (run aborted early by safety cap)' if aborted else ''}")

    out_path.write_text(json.dumps(all_rows, indent=2), encoding="utf-8")
    print(f"[EVENTS] wrote {out_path}")

    pull_manifest.append_entry(
        script="inspect_gdelt_events.py", source="GDELT_EVENTS",
        description=f"Batched-window Events-table pull (Goldstein Scale + QuadClass + Lat/Long) "
                    f"across {events_with_hits}/{len(events)} events "
                    f"({len(windows)} unique windows queried instead of {len(events)} per-event queries)"
                    f"{' (run aborted early by safety cap)' if aborted else ''}.",
        rows=len(all_rows), byte_count=cumulative_bytes,
        matching_method_version=MATCHING_METHOD_VERSION,
    )


if __name__ == "__main__":
    main()
