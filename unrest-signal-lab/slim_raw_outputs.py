"""
slim_raw_outputs.py -- one-time migration: pi_gdelt_raw_pull.py's first
version stored every one of GKG's 27 / Events' 61 fields per matched row,
most of them (Themes, V2Themes, GCAM, Persons, Organizations, full
actor/geo blocks, ...) never read anywhere downstream. That grew to
1.7GB/673MB in under 24 hours of running -- big enough to OOM-kill git's
pack-objects locally and, more importantly, to exceed GitHub's 100MB
per-file push limit outright, which is why 140+ days of real progress
sat un-pushed on the Pi.

This splits whatever is in the old combined gdelt_gkg_raw.json /
gdelt_events_raw.json (if they still exist) into the new per-day,
minimal-field layout (data/gdelt_raw_gkg/{day}.json,
data/gdelt_raw_events/{day}.json) that the current pi_gdelt_raw_pull.py
writes directly -- same fields it now matches with
(GKG_KEEP_FIELDS/EVENTS_KEEP_FIELDS), regrouped by the row's own
DATE/SQLDATE. Safe to run once after an old-format pull; a no-op if the
old combined files are already gone.
"""
import json
from collections import defaultdict
from pathlib import Path

DATA = Path(__file__).resolve().parent / "data"

GKG_KEEP_FIELDS = ["GKGRECORDID", "DATE", "V2Tone", "_acled_event_id"]
EVENTS_KEEP_FIELDS = ["GLOBALEVENTID", "SQLDATE", "GoldsteinScale", "QuadClass", "_acled_event_id"]


def migrate(old_path, out_dir, keep_fields, day_field, day_field_len):
    if not old_path.exists():
        print(f"{old_path.name}: not present, nothing to migrate.")
        return
    rows = json.loads(old_path.read_text(encoding="utf-8"))
    before = old_path.stat().st_size
    by_day = defaultdict(list)
    for r in rows:
        day_int = int(str(r[day_field])[:day_field_len])
        by_day[day_int].append({k: r.get(k, "") for k in keep_fields})

    out_dir.mkdir(parents=True, exist_ok=True)
    for day_int, day_rows in by_day.items():
        (out_dir / f"{day_int}.json").write_text(json.dumps(day_rows, indent=2), encoding="utf-8")

    old_path.unlink()
    print(f"{old_path.name}: {len(rows)} rows, {before / 1024**2:.1f}MB -> "
          f"{len(by_day)} per-day files in {out_dir.name}/")


def main():
    migrate(DATA / "gdelt_gkg_raw.json", DATA / "gdelt_raw_gkg", GKG_KEEP_FIELDS, "DATE", 8)
    migrate(DATA / "gdelt_events_raw.json", DATA / "gdelt_raw_events", EVENTS_KEEP_FIELDS, "SQLDATE", 8)


if __name__ == "__main__":
    main()
