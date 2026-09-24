"""
estimate_phase2_pull_cost.py -- Phase 2, pre-flight cost check.

Dry-run ONLY (zero cost, zero bytes billed) against every unique
pre-event window the new 2021-2025 sample needs, for both the GKG pull
and the Events-table pull, using the exact same batched query-building
functions the real pull scripts use. Prints total estimated bytes so a
real decision about window size / scope can be made BEFORE spending any
quota, given the account is already at ~64% of the monthly free tier.
"""
import json
from pathlib import Path

import inspect_gdelt as gkg
import inspect_gdelt_events as ev
from google.cloud import bigquery

HERE = Path(__file__).resolve().parent


def estimate(label, events, build_query_fn, fields_or_none, rows_per_event, client):
    windows = gkg.group_events_by_window(events)
    total_bytes = 0
    per_window = []
    for (window_start, window_end), window_events in sorted(windows.items()):
        patterns = bigquery.ArrayQueryParameter("patterns", "STRUCT", [
            bigquery.StructQueryParameter(
                None,
                bigquery.ScalarQueryParameter("event_id", "STRING", e["event_id_cnty"]),
                bigquery.ScalarQueryParameter(
                    "pattern", "STRING",
                    gkg.LOCATION_COUNTRY_REGEX_TEMPLATE.format(location=__import__("re").escape(e["location"]))
                    if fields_or_none else f"%{e['location']}%",
                ),
            )
            for e in window_events
        ])
        params = [
            bigquery.ScalarQueryParameter("start_date", "STRING", window_start.strftime("%Y-%m-%d")),
            bigquery.ScalarQueryParameter("end_date", "STRING", window_end.strftime("%Y-%m-%d")),
            bigquery.ScalarQueryParameter("date_start_int", "INT64",
                int(window_start.strftime("%Y%m%d") + ("000000" if fields_or_none else ""))),
            bigquery.ScalarQueryParameter("date_end_int", "INT64",
                int(window_end.strftime("%Y%m%d") + ("235959" if fields_or_none else ""))),
            patterns,
        ]
        query = build_query_fn(fields_or_none, rows_per_event) if fields_or_none else ev.QUERY_TEMPLATE
        dry_config = bigquery.QueryJobConfig(query_parameters=params, dry_run=True, use_query_cache=False)
        job = client.query(query, job_config=dry_config)
        b = job.total_bytes_processed
        total_bytes += b
        per_window.append((window_start.date(), len(window_events), b))

    print(f"\n=== {label}: {len(events)} events -> {len(windows)} unique windows ===")
    print(f"Total estimated: {total_bytes / 1024**3:.2f} GB "
          f"({total_bytes / 1024**2 / len(events):.1f} MB/event average)")
    worst = sorted(per_window, key=lambda t: -t[2])[:5]
    print("Most expensive windows:")
    for d, n, b in worst:
        print(f"  {d} ({n} events batched): {b/1024**2:.1f} MB")
    return total_bytes


def main():
    events = json.loads((HERE / "data" / "acled_sample_2021_2025.json").read_text(encoding="utf-8"))
    client = gkg.make_client()

    events_bytes = estimate("EVENTS TABLE (Goldstein/QuadClass)", events, None, None, ev.ROWS_PER_EVENT, client)
    gkg_bytes = estimate("GKG (V2Tone/V2Themes)", events, gkg.build_query, gkg.BASE_FIELDS, gkg.ROWS_PER_EVENT, client)

    print(f"\n=== TOTAL if both run at current settings: {(events_bytes + gkg_bytes) / 1024**3:.2f} GB ===")
    print("(Zero bytes actually billed by this script -- dry runs only.)")


if __name__ == "__main__":
    main()
