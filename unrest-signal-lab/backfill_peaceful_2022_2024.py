"""
backfill_peaceful_2022_2024.py -- Phase 2, Step 1b: fix a self-caught
sampling bias before it ever reaches a model.

expand_acled_sample_2021_2025.py's single 2021-2025 "Protests" pull hit
its 250-row cap entirely within 2021 and never reached 2022 onward --
confirmed here by re-querying each year separately and finding EVERY
single year 2021-2024 independently exhausts a fresh 250-row cap on its
own. ACLED has far more peaceful protests than riots in this window;
the original pull's per-type cap silently produced a sample with ZERO
peaceful protests in 2022 or 2023 -- not because ACLED stopped reporting
them, but because this pipeline's own query never got that far. This is
close kin to the mentor note about checking whether peaceful protests
are under-represented -- the mechanism just turned out to be pull design,
not ACLED's own reporting behavior.

Pulls a small, separately-capped peaceful-protest pool for 2022, 2023,
and 2024 individually (so each year gets its own uncapped-by-the-others
250-row pool), draws 10 new peaceful events per year (30 total,
excluding anything already cached), and appends them to the 2021-2025
expansion. ACLED calls are near-zero cost; this backfill does NOT touch
BigQuery.

Writes:
  data/acled_backfill_peaceful.json     -- the 30 new peaceful events
  data/acled_sample_2021_2025_v2.json   -- 125 original expansion + 30 backfill = 155
  data/acled_sample_255.json            -- combined 100 (2020) + 155 (2021-2025 v2) = 255
"""
import json
import sys
from pathlib import Path

import inspect_acled as base

HERE = Path(__file__).resolve().parent
PER_YEAR_SAMPLE = 10
YEARS = [("2022-01-01", "2022-12-31"), ("2023-01-01", "2023-12-31"), ("2024-01-01", "2024-12-31")]


def main():
    original_100 = json.loads((HERE / "data" / "acled_sample_100.json").read_text(encoding="utf-8"))
    expansion_125 = json.loads((HERE / "data" / "acled_sample_2021_2025.json").read_text(encoding="utf-8"))
    known_ids = {e["event_id_cnty"] for e in original_100} | {e["event_id_cnty"] for e in expansion_125}

    email = base.os.environ.get("ACLED_EMAIL")
    password = base.os.environ.get("ACLED_PASSWORD")
    token = base.get_access_token(email, password)

    backfill = []
    total_bytes = 0
    for start, end in YEARS:
        base.DATE_START, base.DATE_END = start, end
        import requests
        params = {
            "_format": "json", "country": "United States", "event_type": "Protests",
            "event_date": f"{start}|{end}", "event_date_where": "BETWEEN",
            "fields": "|".join(base.FIELDS), "limit": 250,
        }
        resp = requests.get(base.API_URL, params=params, headers={"Authorization": f"Bearer {token}"}, timeout=60)
        rows = resp.json().get("data", [])
        total_bytes += len(resp.content)
        pool = [r for r in rows if r["event_id_cnty"] not in known_ids]
        sample = base.stratified_sample(pool, PER_YEAR_SAMPLE, seed=base.RANDOM_SEED + 10 + int(start[:4]))
        sample = [base.tag_metro(r) for r in sample]
        print(f"[backfill] {start[:4]}: pool {len(rows)} rows -> {len(pool)} new -> sampled {len(sample)}")
        backfill.extend(sample)
        known_ids |= {r["event_id_cnty"] for r in sample}

    (HERE / "data" / "acled_backfill_peaceful.json").write_text(json.dumps(backfill, indent=2), encoding="utf-8")
    print(f"[backfill] wrote data/acled_backfill_peaceful.json ({len(backfill)} events)")

    expansion_v2 = expansion_125 + backfill
    (HERE / "data" / "acled_sample_2021_2025_v2.json").write_text(json.dumps(expansion_v2, indent=2), encoding="utf-8")
    print(f"[backfill] wrote data/acled_sample_2021_2025_v2.json ({len(expansion_v2)} events)")

    combined = original_100 + expansion_v2
    (HERE / "data" / "acled_sample_255.json").write_text(json.dumps(combined, indent=2), encoding="utf-8")
    print(f"[backfill] wrote data/acled_sample_255.json ({len(combined)} events)")

    base.pull_manifest.append_entry(
        script="backfill_peaceful_2022_2024.py", source="ACLED",
        description=f"Corrected a self-caught sampling gap: the original 2021-2025 pull's 250-row "
                    f"per-type cap left zero peaceful protests for 2022/2023. Backfilled {len(backfill)} "
                    f"peaceful protests (10/year, 2022-2024) from separately-capped per-year pools.",
        rows=sum(1 for _ in YEARS) * 250, byte_count=total_bytes,
    )


if __name__ == "__main__":
    main()
