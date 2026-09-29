"""
expand_acled_2022_2026.py -- doubling pass: pull new ACLED US protest/riot
events for 2022-01-01 through today, on top of the existing 255-event
table (2020-2021 heavy, 2022-2024 thin, nothing past 2024).

Why period-by-period instead of one 2022-today call: a single pooled
call (like the original Phase 2 pull) draws from whatever order ACLED
returns rows in, which skews toward whichever sub-range has the most
raw events -- exactly how 2022-2024 ended up thin the first time. Five
separate pools (2022, 2023, 2024, 2025, 2026-partial), each stratified
and sampled independently, guarantees every calendar year actually gets
new events instead of being crowded out.

Reuses inspect_acled.py's auth/fetch/sample/tag functions unchanged,
same event_type-OR-bug workaround (two separate single-value calls).

Writes:
  data/acled_sample_2022_2026.json  -- the new events, this pull only
  data/acled_sample_full.json       -- combined master (255 + new)
"""
import json
import sys
from datetime import date
from pathlib import Path

import inspect_acled as base

HERE = Path(__file__).resolve().parent

PER_PERIOD_TARGET = 50
PER_PERIOD_POOL_LIMIT = 300  # 150/type, well above target for most periods
PERIODS = [
    ("2022-01-01", "2022-12-31"),
    ("2023-01-01", "2023-12-31"),
    ("2024-01-01", "2024-12-31"),
    ("2025-01-01", "2025-12-31"),
    ("2026-01-01", date.today().isoformat()),
]


def main():
    base_path = HERE / "data" / "acled_sample_255.json"
    if not base_path.exists():
        print("No data/acled_sample_255.json found -- run the earlier phases first.", file=sys.stderr)
        sys.exit(1)
    existing = json.loads(base_path.read_text(encoding="utf-8"))
    known_ids = {e["event_id_cnty"] for e in existing}
    print(f"[expand 2022-2026] starting from {len(existing)} known events")

    email = base.os.environ.get("ACLED_EMAIL")
    password = base.os.environ.get("ACLED_PASSWORD")
    if not email or not password:
        print("Missing ACLED_EMAIL / ACLED_PASSWORD -- check unrest-signal-lab/.env", file=sys.stderr)
        sys.exit(1)
    token = base.get_access_token(email, password)

    cache = base.load_cache()
    all_new = []
    total_pool_rows = 0
    total_pool_bytes = 0

    for period_idx, (start, end) in enumerate(PERIODS):
        base.DATE_START = start
        base.DATE_END = end
        base.POOL_LIMIT = PER_PERIOD_POOL_LIMIT
        pool, pool_bytes = base.fetch_pool(token)
        total_pool_rows += len(pool)
        total_pool_bytes += pool_bytes

        for r in pool:
            cache["events"][r["event_id_cnty"]] = r

        remaining = [r for r in pool if r["event_id_cnty"] not in known_ids]
        sample = base.stratified_sample(remaining, PER_PERIOD_TARGET, seed=base.RANDOM_SEED + 10 + period_idx)
        sample = [base.tag_metro(r) for r in sample]

        known_ids |= {r["event_id_cnty"] for r in sample}
        all_new.extend(sample)

        sub_counts = {}
        for r in sample:
            sub_counts[r["sub_event_type"]] = sub_counts.get(r["sub_event_type"], 0) + 1
        print(f"[expand 2022-2026] {start}..{end}: pool={len(pool)}, "
              f"sampled {len(sample)}/{PER_PERIOD_TARGET} requested, breakdown={sub_counts}")

    for eid in {r["event_id_cnty"] for r in all_new} - set(cache["sampled_event_ids"]):
        cache["sampled_event_ids"].append(eid)
    base.save_cache(cache)

    year_counts = {}
    for r in all_new:
        year_counts[r["year"]] = year_counts.get(r["year"], 0) + 1
    print(f"\n[expand 2022-2026] total new events: {len(all_new)}")
    print(f"[expand 2022-2026] year breakdown: {dict(sorted(year_counts.items()))}")

    new_path = HERE / "data" / "acled_sample_2022_2026.json"
    new_path.write_text(json.dumps(all_new, indent=2), encoding="utf-8")
    print(f"[expand 2022-2026] wrote {new_path}")

    combined = existing + all_new
    combined_path = HERE / "data" / "acled_sample_full.json"
    combined_path.write_text(json.dumps(combined, indent=2), encoding="utf-8")
    print(f"[expand 2022-2026] wrote {combined_path} ({len(combined)} events total, "
          f"{len(combined) / len(existing):.2f}x the starting {len(existing)})")

    base.pull_manifest.append_entry(
        script="expand_acled_2022_2026.py", source="ACLED",
        description=f"Drew {len(all_new)} new events across 5 periods (2022-01-01..{date.today().isoformat()}), "
                    f"stratified per-period to avoid the original pull's date-order skew. "
                    f"data/acled_sample_full.json now has {len(combined)} events total.",
        rows=total_pool_rows, byte_count=total_pool_bytes,
    )


if __name__ == "__main__":
    main()
