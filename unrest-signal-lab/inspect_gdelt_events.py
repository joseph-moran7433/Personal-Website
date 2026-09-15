"""
inspect_gdelt_events.py -- Phase 0 Extension, Part 2.

New pull from gdeltv2.events_partitioned -- a SEPARATE table from the
GKG table inspect_gdelt.py queries. GKG has no Goldstein Scale or
QuadClass fields; those live only here. Same pre-event-window,
dry-run-first, safety-cap pattern as inspect_gdelt.py, reused via
import rather than duplicated.

Confirmed table + schema directly against BigQuery (not guessed):
gdelt-bq.gdeltv2.events_partitioned, DAY-partitioned on _PARTITIONTIME.
Unlike GKG, this table has real structured geo columns
(ActionGeo_CountryCode, ActionGeo_FullName) instead of a single blob
field, so country filtering here is an exact column match, not a regex.
"""
import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

from google.cloud import bigquery

import inspect_gdelt as gkg  # reuse make_client(), PRE_EVENT_WINDOW_DAYS, safety-cap pattern
import manifest as pull_manifest

HERE = Path(__file__).resolve().parent

TABLE = "gdelt-bq.gdeltv2.events_partitioned"
ROWS_PER_EVENT = 50  # events rows are much smaller/cheaper than GKG rows

PER_QUERY_BYTES_WARN = 1 * 1024**3
CUMULATIVE_BYTES_ABORT = 100 * 1024**3

FIELDS = [
    "GLOBALEVENTID", "SQLDATE", "EventCode", "QuadClass", "GoldsteinScale",
    "ActionGeo_FullName", "ActionGeo_CountryCode", "ActionGeo_ADM1Code",
    "NumMentions", "NumArticles", "AvgTone",
]

QUERY_TEMPLATE = f"""
SELECT {", ".join(FIELDS)}
FROM `{TABLE}`
WHERE _PARTITIONTIME >= TIMESTAMP(@start_date)
  AND _PARTITIONTIME <= TIMESTAMP(@end_date)
  AND SQLDATE >= @date_start_int
  AND SQLDATE <= @date_end_int
  AND ActionGeo_CountryCode = 'US'
  AND ActionGeo_FullName LIKE @location_pattern
LIMIT {ROWS_PER_EVENT}
"""


def build_job_params(event):
    event_date = datetime.strptime(event["event_date"], "%Y-%m-%d")
    window_end = event_date - timedelta(days=1)
    window_start = window_end - timedelta(days=gkg.PRE_EVENT_WINDOW_DAYS - 1)

    return [
        bigquery.ScalarQueryParameter("start_date", "STRING", window_start.strftime("%Y-%m-%d")),
        bigquery.ScalarQueryParameter("end_date", "STRING", window_end.strftime("%Y-%m-%d")),
        bigquery.ScalarQueryParameter("date_start_int", "INT64", int(window_start.strftime("%Y%m%d"))),
        bigquery.ScalarQueryParameter("date_end_int", "INT64", int(window_end.strftime("%Y%m%d"))),
        bigquery.ScalarQueryParameter("location_pattern", "STRING", f"%{event['location']}%"),
    ], window_start, window_end


def run_one_event(client, event, cumulative_bytes):
    params, window_start, window_end = build_job_params(event)

    dry_config = bigquery.QueryJobConfig(query_parameters=params, dry_run=True, use_query_cache=False)
    dry_job = client.query(QUERY_TEMPLATE, job_config=dry_config)
    estimated_bytes = dry_job.total_bytes_processed

    if cumulative_bytes + estimated_bytes > CUMULATIVE_BYTES_ABORT:
        print(f"[EVENTS] ABORT before {event['event_id_cnty']}: cumulative bytes would hit "
              f"{(cumulative_bytes + estimated_bytes) / 1024**3:.2f} GB, over the "
              f"{CUMULATIVE_BYTES_ABORT / 1024**3:.0f} GB safety cap. Stopping run.")
        return None, cumulative_bytes, True

    flag = " ** OVER PER-QUERY WARN THRESHOLD **" if estimated_bytes > PER_QUERY_BYTES_WARN else ""
    print(f"[EVENTS] {event['event_id_cnty']} ({event['location']}, {window_start.date()}..{window_end.date()}): "
          f"estimated {estimated_bytes / 1024**2:.1f} MB{flag}")

    real_config = bigquery.QueryJobConfig(query_parameters=params, use_query_cache=False)
    job = client.query(QUERY_TEMPLATE, job_config=real_config)
    rows = [dict(r) for r in job.result()]
    actual_bytes = job.total_bytes_processed

    print(f"[EVENTS]   -> actual: {actual_bytes / 1024**2:.1f} MB scanned, {len(rows)} rows returned")

    for r in rows:
        r["_acled_event_id"] = event["event_id_cnty"]
        r["_acled_location"] = event["location"]

    return rows, cumulative_bytes + actual_bytes, False


def main():
    sample_path = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / "data" / "acled_sample_100.json"
    out_path = Path(sys.argv[2]) if len(sys.argv) > 2 else HERE / "data" / "gdelt_events_sample.json"
    if not sample_path.exists():
        print(f"No ACLED sample found at {sample_path}.", file=sys.stderr)
        sys.exit(1)
    events = json.loads(sample_path.read_text(encoding="utf-8"))

    prior = pull_manifest.load_manifest()
    print(f"[EVENTS] manifest check: cumulative GDELT usage so far is "
          f"{prior.get('cumulative_gdelt_gb_of_monthly_quota_pct', 0)}% of the monthly free tier "
          f"before this run starts.")

    client = gkg.make_client()

    all_rows = []
    cumulative_bytes = 0
    events_with_hits = 0
    aborted = False

    for event in events:
        rows, cumulative_bytes, aborted = run_one_event(client, event, cumulative_bytes)
        if aborted:
            break
        if rows:
            events_with_hits += 1
            all_rows.extend(rows)

    print()
    print(f"[EVENTS] TOTAL: {len(all_rows)} rows across {events_with_hits}/{len(events)} events, "
          f"{cumulative_bytes / 1024**3:.3f} GB scanned"
          f"{' (run aborted early by safety cap)' if aborted else ''}")

    out_path.write_text(json.dumps(all_rows, indent=2), encoding="utf-8")
    print(f"[EVENTS] wrote {out_path}")

    pull_manifest.append_entry(
        script="inspect_gdelt_events.py", source="GDELT_EVENTS",
        description=f"Events table pull (Goldstein Scale + QuadClass) across {events_with_hits}/{len(events)} events"
                    f"{' (run aborted early by safety cap)' if aborted else ''}.",
        rows=len(all_rows), byte_count=cumulative_bytes,
        matching_method_version="v2_country_theme_filtered",
    )


if __name__ == "__main__":
    main()
