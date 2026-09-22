"""
inspect_gdelt.py -- Phase 0/1 data pull for the Unrest Signal Lab.

Phase 1 rewrite (matching_method_version "v3_batched_window"): fixes the
root cause an advisor flagged after Phase 0 -- 100 rows/10 columns should
never cost hundreds of GB, and it didn't need to.

Why the old (v1/v2) per-event queries cost so much: BigQuery bills for
every value of every SELECTed column read out of the partitions the
WHERE clause's partition-time filter keeps -- a REGEXP_CONTAINS or LIKE
filter on a non-partitioning column (V2Locations, V2Themes) does NOT
reduce bytes billed, only rows returned. Querying the GKG table's 7-day
window means BigQuery reads V2Locations/V2Tone/V2Themes/DocumentIdentifier/
SourceCommonName for EVERY article on Earth in those 7 days, then
filters down to ~25 rows after the fact. Confirmed against
data/pull_manifest.json: a 15-event ad hoc pull that added two more wide
text columns (V2Persons/V2Organizations) alone cost 74.5 GB -- ~5 GB/event
just from column width, not row count.

On top of that, issuing one query PER EVENT re-scans the same global
daily partitions every time two events share or overlap a pre-event
window. Checked against the cached 100-event sample
(data/acled_sample_100.json): 100 events collapse to just 38 distinct
event_dates, i.e. the same identical 7-day window is often shared by
several events -- a 100-query run was rescanning some days' full global
GKG data 2-5x over for nothing.

Fixes in this version, before a single new byte is ever pulled again:
  1. Events sharing the same event_date (and therefore the exact same
     pre-event window) are now batched into ONE query per unique window,
     using UNNEST(@patterns) to test every event's location pattern
     against each scanned row in a single pass -- this does not increase
     bytes billed (billing is by column bytes read from the base table,
     not by the query's intermediate row count), it just stops paying
     for the same partitions N times.
  2. DocumentIdentifier and SourceCommonName are dropped from the
     default field list -- they were only ever needed for the one-off
     Q4 publisher-frequency analysis, not for any v1 model feature. Pass
     --with-source-fields to add them back for that specific analysis.
  3. PER_QUERY_BYTES_WARN is now an actual gate, not just a printed flag:
     a window whose dry-run estimate exceeds it is SKIPPED by default
     (logged, not silently dropped) unless --force-expensive is passed.
     This is the concrete "catch it before spending" the per-event
     safety cap alone didn't provide.

Credentials: reads GCP_PROJECT_ID / GOOGLE_APPLICATION_CREDENTIALS from
a local .env file next to this script (gitignored, never committed).

Confirmed table: gdelt-bq.gdeltv2.gkg_partitioned, partitioned on
_PARTITIONTIME. Partition pruning requires filtering on BOTH
_PARTITIONTIME and the DATE column together.
"""
import argparse
import json
import os
import re
import sys
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path

from dotenv import load_dotenv
from google.cloud import bigquery

import manifest as pull_manifest

HERE = Path(__file__).resolve().parent
load_dotenv(HERE / ".env")

TABLE = "gdelt-bq.gdeltv2.gkg_partitioned"
PRE_EVENT_WINDOW_DAYS = 7
ROWS_PER_EVENT = 25

# Safety caps -- hard stops, not suggestions. BigQuery Sandbox's free tier
# is 1 TB/month; we stay far under that on purpose.
PER_QUERY_BYTES_WARN = 3 * 1024**3        # 3 GB -- a window over this is SKIPPED by default (see --force-expensive).
CUMULATIVE_BYTES_ABORT = 500 * 1024**3    # 500 GB -- run stops entirely.

# v1/v2 explicitly excluded GCAM -- confirmed present in the table schema at
# zero cost, but one event's GCAM column alone dry-ran at 22.8 GB (~17x
# every other column in the row combined). DO NOT add "GCAM" here.
BASE_FIELDS = ["GKGRECORDID", "DATE", "V2Locations", "V2Tone", "V2Themes"]
SOURCE_FIELDS = ["SourceCommonName", "DocumentIdentifier"]  # opt-in via --with-source-fields

MATCHING_METHOD_VERSION = "v3_batched_window"

# A match requires the location text to appear in a V2Locations entry
# immediately followed by "#US#" in that SAME entry -- not just present
# anywhere in the row (which is how v1 matched "Durham" to "Sedgefield,
# Durham, United Kingdom"). This alone does NOT catch same-name,
# different-US-state errors (Portland ME vs OR, Gainesville GA vs FL) --
# see build_training_table.py's haversine-distance pass for that fix,
# applied post-pull against cached lat/long already in V2Locations at
# zero additional query cost.
LOCATION_COUNTRY_REGEX_TEMPLATE = r"#{location}[^#]*#US#"

RELEVANCE_THEMES = [
    "PROTEST", "VIOLENT_UNREST", "STRIKE", "UNREST_POLICEBRUTALITY",
    "UNREST_STONETHROWING", "UNREST_STONING", "UNREST_MOLOTOVCOCKTAIL",
    "VANDALIZE", "CURFEW",
]
THEME_FILTER_CLAUSE = " OR ".join(f"V2Themes LIKE '%{t}%'" for t in RELEVANCE_THEMES)


def make_client():
    project = os.environ.get("GCP_PROJECT_ID")
    creds_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if not project or not creds_path:
        print("Missing GCP_PROJECT_ID / GOOGLE_APPLICATION_CREDENTIALS -- check unrest-signal-lab/.env", file=sys.stderr)
        sys.exit(1)
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str((HERE / creds_path).resolve())
    return bigquery.Client(project=project)


def event_window(event):
    event_date = datetime.strptime(event["event_date"], "%Y-%m-%d")
    window_end = event_date - timedelta(days=1)
    window_start = window_end - timedelta(days=PRE_EVENT_WINDOW_DAYS - 1)
    return window_start, window_end


def group_events_by_window(events):
    """Events sharing an event_date share the exact same pre-event window --
    group them so each unique window is scanned exactly once, however many
    events fall in it, instead of once per event."""
    groups = defaultdict(list)
    for event in events:
        window_start, window_end = event_window(event)
        groups[(window_start, window_end)].append(event)
    return groups


def build_query(fields, rows_per_event):
    # Partition/key on the event's own ACLED id (item.event_id), never on the
    # location pattern text -- two events in the same window CAN share a
    # location name (e.g. two different "Portland" protests), which would
    # silently merge their row budgets and misattribute rows if pattern text
    # were used as the join/partition key instead.
    theme_clause = THEME_FILTER_CLAUSE
    return f"""
    WITH matched AS (
      SELECT {", ".join(fields)}, item.event_id AS _match_event_id
      FROM `{TABLE}`, UNNEST(@patterns) AS item
      WHERE _PARTITIONTIME >= TIMESTAMP(@start_date)
        AND _PARTITIONTIME <= TIMESTAMP(@end_date)
        AND DATE >= @date_start_int
        AND DATE <= @date_end_int
        AND REGEXP_CONTAINS(V2Locations, item.pattern)
        AND ({theme_clause})
    )
    SELECT * EXCEPT(rn) FROM (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY _match_event_id ORDER BY DATE) AS rn
      FROM matched
    )
    WHERE rn <= {rows_per_event}
    """


def run_one_window(client, window_start, window_end, events, fields, cumulative_bytes, force_expensive):
    event_by_id = {e["event_id_cnty"]: e for e in events}
    patterns = bigquery.ArrayQueryParameter("patterns", "STRUCT", [
        bigquery.StructQueryParameter(
            None,
            bigquery.ScalarQueryParameter("event_id", "STRING", e["event_id_cnty"]),
            bigquery.ScalarQueryParameter("pattern", "STRING", LOCATION_COUNTRY_REGEX_TEMPLATE.format(location=re.escape(e["location"]))),
        )
        for e in events
    ])
    query = build_query(fields, ROWS_PER_EVENT)
    params = [
        bigquery.ScalarQueryParameter("start_date", "STRING", window_start.strftime("%Y-%m-%d")),
        bigquery.ScalarQueryParameter("end_date", "STRING", window_end.strftime("%Y-%m-%d")),
        bigquery.ScalarQueryParameter("date_start_int", "INT64", int(window_start.strftime("%Y%m%d") + "000000")),
        bigquery.ScalarQueryParameter("date_end_int", "INT64", int(window_end.strftime("%Y%m%d") + "235959")),
        patterns,
    ]

    dry_config = bigquery.QueryJobConfig(query_parameters=params, dry_run=True, use_query_cache=False)
    dry_job = client.query(query, job_config=dry_config)
    estimated_bytes = dry_job.total_bytes_processed

    label = f"{window_start.date()}..{window_end.date()} ({len(events)} events batched)"

    if cumulative_bytes + estimated_bytes > CUMULATIVE_BYTES_ABORT:
        print(f"[GDELT] ABORT before window {label}: cumulative bytes would hit "
              f"{(cumulative_bytes + estimated_bytes) / 1024**3:.2f} GB, over the "
              f"{CUMULATIVE_BYTES_ABORT / 1024**3:.0f} GB safety cap. Stopping run.")
        return None, cumulative_bytes, True

    if estimated_bytes > PER_QUERY_BYTES_WARN and not force_expensive:
        print(f"[GDELT] SKIPPED window {label}: estimated {estimated_bytes / 1024**3:.2f} GB "
              f"exceeds the {PER_QUERY_BYTES_WARN / 1024**3:.0f} GB per-query warn threshold. "
              f"Re-run with --force-expensive to pull it anyway.")
        return [], cumulative_bytes, False

    flag = " ** OVER PER-QUERY WARN THRESHOLD -- forced **" if estimated_bytes > PER_QUERY_BYTES_WARN else ""
    print(f"[GDELT] window {label}: estimated {estimated_bytes / 1024**2:.1f} MB{flag}")

    real_config = bigquery.QueryJobConfig(query_parameters=params, use_query_cache=False)
    job = client.query(query, job_config=real_config)
    rows = [dict(r) for r in job.result()]
    actual_bytes = job.total_bytes_processed

    print(f"[GDELT]   -> actual: {actual_bytes / 1024**2:.1f} MB scanned, {len(rows)} rows returned "
          f"across {len(events)} events (was {len(events)} separate ~{actual_bytes / 1024**2 / max(len(events),1):.0f} MB "
          f"scans before batching -- now one shared scan).")

    for r in rows:
        event = event_by_id.get(r.pop("_match_event_id"))
        if event is None:
            continue
        r["_acled_event_id"] = event["event_id_cnty"]
        r["_acled_location"] = event["location"]
        r["_acled_admin1"] = event.get("admin1")
        r["matching_method_version"] = MATCHING_METHOD_VERSION

    return rows, cumulative_bytes + actual_bytes, False


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("sample_path", nargs="?", default=str(HERE / "data" / "acled_sample.json"))
    parser.add_argument("out_path", nargs="?", default=str(HERE / "data" / "gdelt_sample.json"))
    parser.add_argument("--with-source-fields", action="store_true",
                         help="Add back SourceCommonName/DocumentIdentifier (needed only for publisher-frequency analysis).")
    parser.add_argument("--force-expensive", action="store_true",
                         help="Pull windows even if their dry-run estimate exceeds PER_QUERY_BYTES_WARN.")
    args = parser.parse_args()

    sample_path = Path(args.sample_path)
    out_path = Path(args.out_path)
    if not sample_path.exists():
        print("No ACLED sample found -- run inspect_acled.py first.", file=sys.stderr)
        sys.exit(1)
    events = json.loads(sample_path.read_text(encoding="utf-8"))
    fields = BASE_FIELDS + (SOURCE_FIELDS if args.with_source_fields else [])

    prior = pull_manifest.load_manifest()
    print(f"[GDELT] manifest check: cumulative GDELT usage so far is "
          f"{prior.get('cumulative_gdelt_gb_of_monthly_quota_pct', 0)}% of the monthly free tier "
          f"before this run starts.")

    windows = group_events_by_window(events)
    print(f"[GDELT] {len(events)} events collapse to {len(windows)} unique pre-event windows "
          f"-- batching cuts the number of full-partition scans by {len(events) / len(windows):.1f}x.")

    client = make_client()

    all_rows = []
    cumulative_bytes = 0
    windows_with_hits = 0
    aborted = False

    for (window_start, window_end), window_events in sorted(windows.items()):
        rows, cumulative_bytes, aborted = run_one_window(
            client, window_start, window_end, window_events, fields, cumulative_bytes, args.force_expensive
        )
        if aborted:
            break
        if rows:
            windows_with_hits += 1
            all_rows.extend(rows)

    events_with_hits = len({r["_acled_event_id"] for r in all_rows})
    print()
    print(f"[GDELT] TOTAL: {len(all_rows)} rows across {events_with_hits}/{len(events)} events "
          f"({windows_with_hits}/{len(windows)} windows had hits), "
          f"{cumulative_bytes / 1024**3:.3f} GB scanned"
          f"{' (run aborted early by safety cap)' if aborted else ''}")

    if not all_rows:
        print("GDELT returned zero rows for the whole sample -- feasibility check fails.", file=sys.stderr)
        sys.exit(1)

    out_path.write_text(json.dumps(all_rows, indent=2), encoding="utf-8")
    print(f"[GDELT] wrote {out_path}")

    pull_manifest.append_entry(
        script="inspect_gdelt.py", source="GDELT_GKG",
        description=f"Batched-window GKG pull across {events_with_hits}/{len(events)} events "
                    f"({len(windows)} unique windows queried instead of {len(events)} per-event queries)"
                    f"{' (run aborted early by safety cap)' if aborted else ''}.",
        rows=len(all_rows), byte_count=cumulative_bytes,
        matching_method_version=MATCHING_METHOD_VERSION,
    )


if __name__ == "__main__":
    main()
