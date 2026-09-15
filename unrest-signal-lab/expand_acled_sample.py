"""
expand_acled_sample.py -- Phase 0 Extension, Part 3.1/3.2.

Reuses the original 50 ACLED events from data/acled_sample.json (no
re-pull) and draws 50 NEW events from the private cache's pool, using
the same stratified_sample() approach already in inspect_acled.py --
imported and reused, not duplicated, per the minimal-diff directive.
Confirmed with the user: the new 50 should match the natural ~34%/66%
Peaceful/Riot split already observed, not a forced ratio.

Writes:
  data/acled_sample_new50.json  -- just the 50 new events
  data/acled_sample_100.json    -- combined 100 (original 50 + new 50)
"""
import json
import sys
from pathlib import Path

import inspect_acled as base

HERE = Path(__file__).resolve().parent


def main():
    original_path = HERE / "data" / "acled_sample.json"
    if not original_path.exists():
        print("No original acled_sample.json found -- run inspect_acled.py first.", file=sys.stderr)
        sys.exit(1)
    original_50 = json.loads(original_path.read_text(encoding="utf-8"))
    original_ids = {e["event_id_cnty"] for e in original_50}

    email = base.os.environ.get("ACLED_EMAIL")
    password = base.os.environ.get("ACLED_PASSWORD")
    if not email or not password:
        print("Missing ACLED_EMAIL / ACLED_PASSWORD -- check unrest-signal-lab/.env", file=sys.stderr)
        sys.exit(1)

    token = base.get_access_token(email, password)
    pool, pool_bytes = base.fetch_pool(token)

    cache = base.load_cache()
    new_in_pool = sum(1 for r in pool if r.get("event_id_cnty") not in cache["events"])
    for r in pool:
        cache["events"][r["event_id_cnty"]] = r

    # Exclude the original 50 so the new sample is genuinely additional,
    # then reuse the exact same stratified_sample() logic unmodified.
    remaining_pool = [r for r in pool if r["event_id_cnty"] not in original_ids]
    print(f"[expand] pool: {len(pool)} rows ({new_in_pool} new to cache), "
          f"{len(remaining_pool)} remaining after excluding the original 50")

    new_50 = base.stratified_sample(remaining_pool, base.SAMPLE_SIZE, seed=base.RANDOM_SEED + 1)
    new_50 = [base.tag_metro(r) for r in new_50]

    for eid in {r["event_id_cnty"] for r in new_50} - set(cache["sampled_event_ids"]):
        cache["sampled_event_ids"].append(eid)
    base.save_cache(cache)

    sub_counts = {}
    for r in new_50:
        sub_counts[r["sub_event_type"]] = sub_counts.get(r["sub_event_type"], 0) + 1
    print(f"[expand] new 50 sub_event_type breakdown: {sub_counts}")

    new_path = HERE / "data" / "acled_sample_new50.json"
    new_path.write_text(json.dumps(new_50, indent=2), encoding="utf-8")
    print(f"[expand] wrote {new_path}")

    combined = original_50 + new_50
    combined_path = HERE / "data" / "acled_sample_100.json"
    combined_path.write_text(json.dumps(combined, indent=2), encoding="utf-8")
    print(f"[expand] wrote {combined_path} ({len(combined)} events total)")

    base.pull_manifest.append_entry(
        script="expand_acled_sample.py", source="ACLED",
        description=f"Drew {len(new_50)} new events from the pool (excluding the original 50) "
                    f"to build the 100-event set for the Phase 0 Extension.",
        rows=len(pool), byte_count=pool_bytes,
    )


if __name__ == "__main__":
    main()
