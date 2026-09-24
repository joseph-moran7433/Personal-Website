"""
expand_acled_sample_2021_2025.py -- Phase 2, Step 1.

Pulls a new stratified sample of ACLED US protest/riot events from
2021-01-01 through 2025-12-31, extending the original 2020-only 100-event
sample with ~125 more events spanning later years -- the whole point being
a training set that isn't confined to one single, unusually turbulent year.

Reuses inspect_acled.py's fetch_pool()/stratified_sample()/tag_metro()
completely unchanged -- only this module's DATE_START/DATE_END are
monkey-patched for this one pull's date range, so the original 2020 pull
logic is never touched (same minimal-diff approach expand_acled_sample.py
already used for the Phase 0 Extension).

Writes:
  data/acled_sample_2021_2025.json  -- the new ~125 events
  data/acled_sample_225.json        -- combined 100 (2020) + new (2021-2025)
"""
import json
import sys
from pathlib import Path

import inspect_acled as base

HERE = Path(__file__).resolve().parent

NEW_SAMPLE_SIZE = 125
DATE_START_NEW = "2021-01-01"
DATE_END_NEW = "2025-12-31"


def main():
    original_path = HERE / "data" / "acled_sample_100.json"
    if not original_path.exists():
        print("No original acled_sample_100.json found -- run Phase 0/1 scripts first.", file=sys.stderr)
        sys.exit(1)
    original_100 = json.loads(original_path.read_text(encoding="utf-8"))
    original_ids = {e["event_id_cnty"] for e in original_100}

    email = base.os.environ.get("ACLED_EMAIL")
    password = base.os.environ.get("ACLED_PASSWORD")
    if not email or not password:
        print("Missing ACLED_EMAIL / ACLED_PASSWORD -- check unrest-signal-lab/.env", file=sys.stderr)
        sys.exit(1)

    base.DATE_START = DATE_START_NEW
    base.DATE_END = DATE_END_NEW

    token = base.get_access_token(email, password)
    pool, pool_bytes = base.fetch_pool(token)

    cache = base.load_cache()
    new_in_pool = sum(1 for r in pool if r.get("event_id_cnty") not in cache["events"])
    for r in pool:
        cache["events"][r["event_id_cnty"]] = r

    remaining_pool = [r for r in pool if r["event_id_cnty"] not in original_ids]
    print(f"[expand 2021-2025] pool: {len(pool)} rows ({new_in_pool} new to cache), "
          f"{len(remaining_pool)} remaining after excluding the original 100")

    new_sample = base.stratified_sample(remaining_pool, NEW_SAMPLE_SIZE, seed=base.RANDOM_SEED + 2)
    new_sample = [base.tag_metro(r) for r in new_sample]

    for eid in {r["event_id_cnty"] for r in new_sample} - set(cache["sampled_event_ids"]):
        cache["sampled_event_ids"].append(eid)
    base.save_cache(cache)

    sub_counts = {}
    year_counts = {}
    for r in new_sample:
        sub_counts[r["sub_event_type"]] = sub_counts.get(r["sub_event_type"], 0) + 1
        year_counts[r["year"]] = year_counts.get(r["year"], 0) + 1
    print(f"[expand 2021-2025] new {len(new_sample)} sub_event_type breakdown: {sub_counts}")
    print(f"[expand 2021-2025] new {len(new_sample)} year breakdown: {year_counts}")

    new_path = HERE / "data" / "acled_sample_2021_2025.json"
    new_path.write_text(json.dumps(new_sample, indent=2), encoding="utf-8")
    print(f"[expand 2021-2025] wrote {new_path}")

    combined = original_100 + new_sample
    combined_path = HERE / "data" / "acled_sample_225.json"
    combined_path.write_text(json.dumps(combined, indent=2), encoding="utf-8")
    print(f"[expand 2021-2025] wrote {combined_path} ({len(combined)} events total)")

    base.pull_manifest.append_entry(
        script="expand_acled_sample_2021_2025.py", source="ACLED",
        description=f"Drew {len(new_sample)} new events from 2021-01-01..2025-12-31 "
                    f"(excluding the original 100 2020 events) for the Phase 2 expansion.",
        rows=len(pool), byte_count=pool_bytes,
    )


if __name__ == "__main__":
    main()
