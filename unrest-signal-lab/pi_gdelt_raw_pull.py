"""
pi_gdelt_raw_pull.py -- fetches GDELT GKG + Events coverage directly from
GDELT's own raw 15-minute export files (data.gdeltproject.org/gdeltv2/),
instead of BigQuery -- no query-scan cost, no monthly quota (BigQuery's
free tier is already at ~97% for this project this month; see
data/pull_manifest.json), just bandwidth and time.

Built to run unattended and either in short bursts (cron, the same
pattern Morning-Text already uses on this Pi) or as one long-running
process working through many days back to back: each day's 192 files
(96 GKG + 96 Events) download concurrently (ThreadPoolExecutor, measured
~7.6MB/s aggregate at 5 threads from this Pi -- DOWNLOAD_WORKERS=12
leaves comfortable margin), matching rows get appended to
data/gdelt_gkg_raw.json / data/gdelt_events_raw.json, and the day is
checkpointed in data/pi_raw_progress.json before moving on. Safe to
kill at any point -- a day is only checkpointed once fully processed,
so an interrupted run just repeats that one day next time; nothing
downstream is double-counted or half-written.

Reuses the exact sequence-anchoring and geo-matching logic already in
build_training_table_v2.py (imported, not copied) so raw-file matches
land in identically-defined pre-event windows as the existing BigQuery
pulls -- this is additive coverage for the same table, not a second,
possibly-inconsistent method.

Usage (cron-friendly):
    python pi_gdelt_raw_pull.py             # process 1 more day, exit
    python pi_gdelt_raw_pull.py --days 5    # process up to 5 days, exit
    python pi_gdelt_raw_pull.py --status    # print progress, do nothing

For a full-dataset sprint (all years, one long-running process instead
of many short cron ticks):
    nohup .venv/bin/python pi_gdelt_raw_pull.py --days 99999 --push --workers 12 >> .cache/pi_raw_pull.log 2>&1 &

For steady background collection instead (cron, one day per tick):
    */15 * * * * cd /home/pi/unrest-signal-lab && .venv/bin/python pi_gdelt_raw_pull.py --push >> .cache/pi_raw_pull.log 2>&1
"""
import argparse
import io
import json
import subprocess
import threading
import time
import zipfile
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from pathlib import Path

import requests

import build_training_table_v2 as btt  # reuse assign_sequences / haversine / matching_location_distances / STATE_NAME_TO_ABBR

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
PROGRESS_PATH = DATA / "pi_raw_progress.json"
GKG_OUT_PATH = DATA / "gdelt_gkg_raw.json"
EVENTS_OUT_PATH = DATA / "gdelt_events_raw.json"

BASE_URL = "https://data.gdeltproject.org/gdeltv2"
REQUEST_TIMEOUT = 30
DOWNLOAD_WORKERS = 12  # measured ~7.6MB/s aggregate at 5 concurrent threads from the Pi -- comfortable margin under 12
GEO_DISTANCE_LIMIT_MILES = btt.GEO_DISTANCE_LIMIT_MILES
_progress_lock = threading.Lock()

# Confirmed 2026-09-29 against a live file pull -- column order matches the
# raw files exactly (GKGRECORDID.. Extras / GLOBALEVENTID.. SOURCEURL).
GKG_FIELDS = [
    "GKGRECORDID", "DATE", "SourceCollectionIdentifier", "SourceCommonName", "DocumentIdentifier",
    "Counts", "V2Counts", "Themes", "V2Themes", "Locations", "V2Locations", "Persons", "V2Persons",
    "Organizations", "V2Organizations", "V2Tone", "Dates", "GCAM", "SharingImage", "RelatedImages",
    "SocialImageEmbeds", "SocialVideoEmbeds", "Quotations", "AllNames", "Amounts", "TranslationInfo", "Extras",
]
EVENTS_FIELDS = [
    "GLOBALEVENTID", "SQLDATE", "MonthYear", "Year", "FractionDate",
    "Actor1Code", "Actor1Name", "Actor1CountryCode", "Actor1KnownGroupCode", "Actor1EthnicCode",
    "Actor1Religion1Code", "Actor1Religion2Code", "Actor1Type1Code", "Actor1Type2Code", "Actor1Type3Code",
    "Actor2Code", "Actor2Name", "Actor2CountryCode", "Actor2KnownGroupCode", "Actor2EthnicCode",
    "Actor2Religion1Code", "Actor2Religion2Code", "Actor2Type1Code", "Actor2Type2Code", "Actor2Type3Code",
    "IsRootEvent", "EventCode", "EventBaseCode", "EventRootCode", "QuadClass", "GoldsteinScale",
    "NumMentions", "NumSources", "NumArticles", "AvgTone",
    "Actor1Geo_Type", "Actor1Geo_FullName", "Actor1Geo_CountryCode", "Actor1Geo_ADM1Code", "Actor1Geo_ADM2Code",
    "Actor1Geo_Lat", "Actor1Geo_Long", "Actor1Geo_FeatureID",
    "Actor2Geo_Type", "Actor2Geo_FullName", "Actor2Geo_CountryCode", "Actor2Geo_ADM1Code", "Actor2Geo_ADM2Code",
    "Actor2Geo_Lat", "Actor2Geo_Long", "Actor2Geo_FeatureID",
    "ActionGeo_Type", "ActionGeo_FullName", "ActionGeo_CountryCode", "ActionGeo_ADM1Code", "ActionGeo_ADM2Code",
    "ActionGeo_Lat", "ActionGeo_Long", "ActionGeo_FeatureID", "DATEADDED", "SOURCEURL",
]


def load_events():
    path = DATA / "acled_sample_full.json"
    if not path.exists():
        path = DATA / "acled_sample_255.json"
    return json.loads(path.read_text(encoding="utf-8"))


def compute_needed_days(events, years=None):
    """Same sequence-anchoring + 7-day pre-event window build_training_table_v2
    uses, returning {day_int: [event dicts whose window includes this day]}.

    Sequence anchoring always runs on the FULL event list passed in (even
    when `years` narrows the output) -- a late-2021 event within 5 days of
    an early-2022 event still needs to anchor that 2022 event's window
    correctly, the same way build_training_table_v2.py treats the whole
    table together. `years`, if given, only filters which events' windows
    end up in the returned day map, not how anchors are computed."""
    seq_start, _, _ = btt.assign_sequences(events)
    by_day = defaultdict(list)
    for e in events:
        if years and e["year"] not in years:
            continue
        anchor = seq_start[e["event_id_cnty"]]
        window_end = anchor - timedelta(days=1)
        window_start = window_end - timedelta(days=btt.PRE_EVENT_WINDOW_DAYS - 1)
        d = window_start
        while d <= window_end:
            by_day[int(d.strftime("%Y%m%d"))].append(e)
            d += timedelta(days=1)
    return by_day


def load_progress():
    if PROGRESS_PATH.exists():
        return json.loads(PROGRESS_PATH.read_text(encoding="utf-8"))
    return {"done_days": [], "gkg_matched": 0, "events_matched": 0, "files_downloaded": 0,
            "files_missing_404": 0, "bytes_downloaded": 0}


def save_progress(p):
    PROGRESS_PATH.write_text(json.dumps(p, indent=2), encoding="utf-8")


def append_rows(path, rows):
    if not rows:
        return
    existing = json.loads(path.read_text(encoding="utf-8")) if path.exists() else []
    existing.extend(rows)
    path.write_text(json.dumps(existing, indent=2), encoding="utf-8")


def download_and_parse(url, field_names, progress):
    resp = None
    for attempt in range(3):
        try:
            resp = requests.get(url, timeout=REQUEST_TIMEOUT)
            if resp.status_code == 404:
                with _progress_lock:
                    progress["files_missing_404"] += 1
                return []  # some 15-min slots are genuinely missing in GDELT's own history
            resp.raise_for_status()
            break
        except requests.RequestException:
            if attempt == 2:
                return []
            time.sleep(2 * (attempt + 1))
    with _progress_lock:
        progress["files_downloaded"] += 1
        progress["bytes_downloaded"] += len(resp.content)
    try:
        with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
            raw = zf.read(zf.namelist()[0]).decode("utf-8", errors="replace")
    except zipfile.BadZipFile:
        return []
    rows = []
    for line in raw.splitlines():
        if not line:
            continue
        fields = line.split("\t")
        rows.append({name: (fields[i] if i < len(fields) else "") for i, name in enumerate(field_names)})
    return rows


def match_gkg_rows(raw_rows, day_events):
    matched = []
    for r in raw_rows:
        if not r.get("V2Locations"):
            continue
        for e in day_events:
            hits = btt.matching_location_distances(r["V2Locations"], e["location"], float(e["latitude"]), float(e["longitude"]))
            if hits and hits[0][0] <= GEO_DISTANCE_LIMIT_MILES:
                out = dict(r)
                out["_acled_event_id"] = e["event_id_cnty"]
                matched.append(out)
    return matched


def match_events_rows(raw_rows, day_events):
    # Mirrors build_training_table_v2.py's per-event Events-table matching
    # exactly: lat/long haversine when present, state-code fallback when not.
    event_meta = [{
        "id": e["event_id_cnty"], "lat": float(e["latitude"]), "lon": float(e["longitude"]),
        "state_abbr": btt.STATE_NAME_TO_ABBR.get(e.get("admin1", "")),
    } for e in day_events]
    matched = []
    for r in raw_rows:
        lat, lon = r.get("ActionGeo_Lat"), r.get("ActionGeo_Long")
        row_state = (r.get("ActionGeo_ADM1Code") or "")[-2:]
        for m in event_meta:
            if lat and lon:
                try:
                    is_ok = btt.haversine_miles(m["lat"], m["lon"], float(lat), float(lon)) <= GEO_DISTANCE_LIMIT_MILES
                except ValueError:
                    is_ok = False
            else:
                is_ok = m["state_abbr"] is None or row_state == m["state_abbr"]
            if is_ok:
                out = dict(r)
                out["_acled_event_id"] = m["id"]
                matched.append(out)
    return matched


def process_day(day_int, day_events, progress, workers=DOWNLOAD_WORKERS):
    d = datetime.strptime(str(day_int), "%Y%m%d")
    slots = [d + timedelta(minutes=15 * i) for i in range(96)]

    tasks = []
    for slot in slots:
        ts = slot.strftime("%Y%m%d%H%M%S")
        tasks.append(("gkg", f"{BASE_URL}/{ts}.gkg.csv.zip"))
        tasks.append(("events", f"{BASE_URL}/{ts}.export.CSV.zip"))

    def fetch(task):
        kind, url = task
        fields = GKG_FIELDS if kind == "gkg" else EVENTS_FIELDS
        return kind, download_and_parse(url, fields, progress)

    day_gkg, day_events_matched = [], []
    with ThreadPoolExecutor(max_workers=workers) as pool:
        for kind, rows in pool.map(fetch, tasks):
            if kind == "gkg":
                day_gkg.extend(match_gkg_rows(rows, day_events))
            else:
                day_events_matched.extend(match_events_rows(rows, day_events))
    return day_gkg, day_events_matched


def git_commit_and_push(day_int):
    # Mirrors the Morning-Text Pi's own pattern (local cron job -> commit ->
    # push), so progress reaches GitHub without anyone watching this run.
    # Never raises -- a failed push just means next run's commit carries
    # this one's changes too; the local files are never at risk.
    try:
        subprocess.run(["git", "add", "data/gdelt_gkg_raw.json", "data/gdelt_events_raw.json", "data/pi_raw_progress.json"],
                        cwd=HERE, check=True, capture_output=True)
        result = subprocess.run(["git", "commit", "-m", f"pi_gdelt_raw_pull: day {day_int}"],
                                 cwd=HERE, capture_output=True, text=True)
        if result.returncode != 0 and "nothing to commit" not in result.stdout:
            print(f"[pi-raw] git commit warning: {result.stdout.strip()} {result.stderr.strip()}")
            return
        subprocess.run(["git", "push"], cwd=HERE, check=True, capture_output=True, timeout=60)
        print(f"[pi-raw] pushed day {day_int} to GitHub")
    except Exception as exc:
        print(f"[pi-raw] git push skipped (will retry on next run): {exc}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=1, help="how many unique days to process this run")
    parser.add_argument("--status", action="store_true", help="print progress and exit")
    parser.add_argument("--years", type=str, default="", help="comma-separated years to restrict to, e.g. 2022,2023,2024 (default: all years in the event file)")
    parser.add_argument("--push", action="store_true", help="git commit + push after each day (for unattended cron use)")
    parser.add_argument("--workers", type=int, default=DOWNLOAD_WORKERS, help="concurrent file downloads per day")
    args = parser.parse_args()
    years = {int(y) for y in args.years.split(",") if y.strip()} or None

    events = load_events()
    needed = compute_needed_days(events, years=years)
    progress = load_progress()
    done = set(progress["done_days"])
    remaining_days = sorted(d for d in needed if d not in done)

    if args.status:
        print(f"[pi-raw] {len(done)}/{len(needed)} unique pre-event days processed, "
              f"{len(remaining_days)} remaining. {progress['gkg_matched']} GKG rows / "
              f"{progress['events_matched']} Events rows matched so far. "
              f"{progress['files_downloaded']} files downloaded ({progress['files_missing_404']} genuinely missing), "
              f"{progress['bytes_downloaded'] / 1024**3:.2f} GB total.")
        return

    if not remaining_days:
        print("[pi-raw] all pre-event days already processed -- nothing to do.")
        return

    for day_int in remaining_days[:args.days]:
        day_events = needed[day_int]
        print(f"[pi-raw] processing {day_int} ({len(day_events)} events share this pre-event day)...")
        t0 = time.time()
        day_gkg, day_events_matched = process_day(day_int, day_events, progress, workers=args.workers)
        elapsed = time.time() - t0
        append_rows(GKG_OUT_PATH, day_gkg)
        append_rows(EVENTS_OUT_PATH, day_events_matched)
        progress["gkg_matched"] += len(day_gkg)
        progress["events_matched"] += len(day_events_matched)
        progress["done_days"].append(day_int)
        save_progress(progress)
        left = len(needed) - len(progress["done_days"])
        eta_hr = left * elapsed / 3600
        print(f"[pi-raw] {day_int} done in {elapsed:.1f}s: +{len(day_gkg)} GKG rows, +{len(day_events_matched)} Events rows. "
              f"({len(progress['done_days'])}/{len(needed)} days total, {left} left, ETA ~{eta_hr:.1f}h at this rate)")
        if args.push:
            git_commit_and_push(day_int)


if __name__ == "__main__":
    main()
