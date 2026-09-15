"""
inspect_gdelt.py -- Phase 0 data inspection for the Unrest Signal Lab.

For each ACLED event in data/acled_sample.json, runs one narrow BigQuery
query against GDELT's GKG 2.0 table, scoped to that event's location and
a 7-day pre-event date window only. Every query is dry-run first to
estimate bytes scanned, and the run aborts if cumulative bytes crosses
a hard safety cap -- this is a one-shot manual inspection script, not a
pipeline, and must never touch a full day's global GDELT file.

Credentials: reads GCP_PROJECT_ID / GOOGLE_APPLICATION_CREDENTIALS from
a local .env file next to this script (gitignored, never committed).

Confirmed table (verified against GDELT's own docs + BigQuery's own
schema API, not guessed): gdelt-bq.gdeltv2.gkg_partitioned, partitioned
on _PARTITIONTIME. Partition pruning requires filtering on BOTH
_PARTITIONTIME and the DATE column together.
"""
import json
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

from dotenv import load_dotenv
from google.cloud import bigquery

HERE = Path(__file__).resolve().parent
load_dotenv(HERE / ".env")

TABLE = "gdelt-bq.gdeltv2.gkg_partitioned"
PRE_EVENT_WINDOW_DAYS = 7
ROWS_PER_EVENT = 25

# Safety caps -- this is a hard stop, not a suggestion. BigQuery Sandbox's
# free tier is 1 TB/month; we stay far under that on purpose.
PER_QUERY_BYTES_WARN = 3 * 1024**3        # 3 GB -- flagged per-event
CUMULATIVE_BYTES_ABORT = 100 * 1024**3    # 100 GB -- run stops entirely (measured full-sample cost: ~64 GB)

FIELDS = ["GKGRECORDID", "DATE", "SourceCommonName", "DocumentIdentifier", "V2Locations"]

QUERY_TEMPLATE = f"""
SELECT {", ".join(FIELDS)}
FROM `{TABLE}`
WHERE _PARTITIONTIME >= TIMESTAMP(@start_date)
  AND _PARTITIONTIME <= TIMESTAMP(@end_date)
  AND DATE >= @date_start_int
  AND DATE <= @date_end_int
  AND V2Locations LIKE @location_pattern
LIMIT {ROWS_PER_EVENT}
"""


def make_client():
    project = os.environ.get("GCP_PROJECT_ID")
    creds_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if not project or not creds_path:
        print("Missing GCP_PROJECT_ID / GOOGLE_APPLICATION_CREDENTIALS -- check unrest-signal-lab/.env", file=sys.stderr)
        sys.exit(1)
    # Resolve relative to this script, not the caller's cwd.
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str((HERE / creds_path).resolve())
    return bigquery.Client(project=project)


def build_job_params(event):
    event_date = datetime.strptime(event["event_date"], "%Y-%m-%d")
    window_end = event_date - timedelta(days=1)
    window_start = window_end - timedelta(days=PRE_EVENT_WINDOW_DAYS - 1)

    return [
        bigquery.ScalarQueryParameter("start_date", "STRING", window_start.strftime("%Y-%m-%d")),
        bigquery.ScalarQueryParameter("end_date", "STRING", window_end.strftime("%Y-%m-%d")),
        bigquery.ScalarQueryParameter("date_start_int", "INT64", int(window_start.strftime("%Y%m%d") + "000000")),
        bigquery.ScalarQueryParameter("date_end_int", "INT64", int(window_end.strftime("%Y%m%d") + "235959")),
        bigquery.ScalarQueryParameter("location_pattern", "STRING", f"%{event['location']}%"),
    ], window_start, window_end


def run_one_event(client, event, cumulative_bytes):
    params, window_start, window_end = build_job_params(event)

    # Dry run first -- free, doesn't touch quota, gives us the bytes
    # estimate before we commit to actually scanning anything.
    dry_config = bigquery.QueryJobConfig(query_parameters=params, dry_run=True, use_query_cache=False)
    dry_job = client.query(QUERY_TEMPLATE, job_config=dry_config)
    estimated_bytes = dry_job.total_bytes_processed

    if cumulative_bytes + estimated_bytes > CUMULATIVE_BYTES_ABORT:
        print(f"[GDELT] ABORT before {event['event_id_cnty']}: cumulative bytes would hit "
              f"{(cumulative_bytes + estimated_bytes) / 1024**3:.2f} GB, over the "
              f"{CUMULATIVE_BYTES_ABORT / 1024**3:.0f} GB safety cap. Stopping run.")
        return None, cumulative_bytes, True

    flag = " ** OVER PER-QUERY WARN THRESHOLD **" if estimated_bytes > PER_QUERY_BYTES_WARN else ""
    print(f"[GDELT] {event['event_id_cnty']} ({event['location']}, {window_start.date()}..{window_end.date()}): "
          f"estimated {estimated_bytes / 1024**2:.1f} MB{flag}")

    real_config = bigquery.QueryJobConfig(query_parameters=params, use_query_cache=False)
    job = client.query(QUERY_TEMPLATE, job_config=real_config)
    rows = [dict(r) for r in job.result()]
    actual_bytes = job.total_bytes_processed

    print(f"[GDELT]   -> actual: {actual_bytes / 1024**2:.1f} MB scanned, {len(rows)} rows returned")

    for r in rows:
        r["_acled_event_id"] = event["event_id_cnty"]
        r["_acled_location"] = event["location"]
        r["_acled_admin1"] = event.get("admin1")

    return rows, cumulative_bytes + actual_bytes, False


def main():
    sample_path = HERE / "data" / "acled_sample.json"
    if not sample_path.exists():
        print("No ACLED sample found -- run inspect_acled.py first.", file=sys.stderr)
        sys.exit(1)
    events = json.loads(sample_path.read_text(encoding="utf-8"))

    client = make_client()

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
    print(f"[GDELT] TOTAL: {len(all_rows)} rows across {events_with_hits}/{len(events)} events, "
          f"{cumulative_bytes / 1024**3:.3f} GB scanned"
          f"{' (run aborted early by safety cap)' if aborted else ''}")

    if not all_rows:
        print("GDELT returned zero rows for the whole sample -- feasibility check fails.", file=sys.stderr)
        sys.exit(1)

    out_path = HERE / "data" / "gdelt_sample.json"
    out_path.write_text(json.dumps(all_rows, indent=2), encoding="utf-8")
    print(f"[GDELT] wrote {out_path}")


if __name__ == "__main__":
    main()
