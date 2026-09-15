"""
manifest.py -- shared pull-log helper for the Unrest Signal Lab scripts.

Public repo, no raw ACLED/GDELT content -- just rows/bytes/dates, so it's
safe to commit. Every pull script reads this before pulling (to see
cumulative usage against the free-tier budget) and appends to it after.
"""
import json
from pathlib import Path

MANIFEST_PATH = Path(__file__).resolve().parent / "data" / "pull_manifest.json"
MONTHLY_QUOTA_BYTES = 1024**4  # 1 TB BigQuery Sandbox free tier


def load_manifest():
    if not MANIFEST_PATH.exists():
        return {"_note": "", "entries": [],
                "cumulative_bytes_by_source": {"ACLED": 0, "GDELT_GKG": 0, "GDELT_EVENTS": 0},
                "cumulative_gdelt_gb_of_monthly_quota_pct": 0.0}
    return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))


def append_entry(script, source, description, rows, byte_count, matching_method_version=None, date_str=None):
    from datetime import date as _date
    manifest = load_manifest()
    seq = (manifest["entries"][-1]["sequence"] + 1) if manifest["entries"] else 1
    manifest["entries"].append({
        "sequence": seq,
        "date": date_str or _date.today().isoformat(),
        "script": script,
        "source": source,
        "description": description,
        "rows": rows,
        "bytes": byte_count,
        "matching_method_version": matching_method_version,
    })
    manifest["cumulative_bytes_by_source"][source] = manifest["cumulative_bytes_by_source"].get(source, 0) + byte_count
    gdelt_total = manifest["cumulative_bytes_by_source"].get("GDELT_GKG", 0) + manifest["cumulative_bytes_by_source"].get("GDELT_EVENTS", 0)
    manifest["cumulative_gdelt_gb_of_monthly_quota_pct"] = round(gdelt_total / MONTHLY_QUOTA_BYTES * 100, 2)
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"[manifest] logged: {source} +{byte_count/1024**3:.3f} GB -- "
          f"cumulative GDELT usage now {manifest['cumulative_gdelt_gb_of_monthly_quota_pct']}% of monthly free tier")
    return manifest
