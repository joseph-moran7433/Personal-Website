"""
inspect_acled.py -- Phase 0 data inspection for the Unrest Signal Lab.

Pulls a small, stratified sample of U.S. protest/riot events from the
ACLED API (2020-present) to answer the Phase 0 feasibility and
geospatial-accuracy questions. This is a one-shot manual inspection
script, not a pipeline -- rerun by hand, never on a schedule.

Credentials: reads ACLED_EMAIL / ACLED_PASSWORD from a local .env file
next to this script (gitignored, never committed).
"""
import json
import os
import random
import sys
from datetime import date
from pathlib import Path

import requests
from dotenv import load_dotenv

import manifest as pull_manifest

HERE = Path(__file__).resolve().parent
load_dotenv(HERE / ".env")

# Private cache (gitignored, never in the public repo -- unlike data/acled_sample.json,
# this can accumulate raw ACLED content across many runs without republishing it).
# Keyed by event_id_cnty so repeat pulls can tell genuinely-new events from ones
# already seen, without needing ACLED to support an incremental "since" filter.
CACHE_PATH = HERE / ".cache" / "acled_events.json"

TOKEN_URL = "https://acleddata.com/oauth/token"
API_URL = "https://acleddata.com/api/acled/read"

SAMPLE_SIZE = 50
DATE_START = "2020-01-01"
DATE_END = date.today().isoformat()
POOL_LIMIT = 500  # hard cap on rows pulled from ACLED in one call -- this is
                   # a bounded pool to stratify-sample from, never the full
                   # history for this query (which runs into the thousands)
RANDOM_SEED = 42

FIELDS = [
    "event_id_cnty", "event_date", "year", "event_type", "sub_event_type",
    "actor1", "country", "admin1", "admin2", "location",
    "latitude", "longitude", "geo_precision", "source", "source_scale",
    "notes", "fatalities", "tags",
]

# ACLED has no population field, so this hand-picked list of large-city
# location names is only a rough proxy used to stratify the sample --
# not a claim about actual metro-area boundaries.
MAJOR_METROS = {
    "New York", "Los Angeles", "Chicago", "Houston", "Phoenix",
    "Philadelphia", "San Antonio", "San Diego", "Dallas", "Austin",
    "Jacksonville", "San Jose", "Fort Worth", "Columbus", "Charlotte",
    "San Francisco", "Indianapolis", "Seattle", "Denver", "Washington",
    "Boston", "Nashville", "Portland", "Las Vegas", "Detroit",
    "Memphis", "Louisville", "Baltimore", "Milwaukee", "Albuquerque",
    "Atlanta", "Miami", "Minneapolis", "New Orleans", "Cleveland",
    "Tampa", "Pittsburgh", "St. Louis", "Cincinnati", "Orlando",
}


def get_access_token(email, password):
    resp = requests.post(
        TOKEN_URL,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        data={
            "username": email,
            "password": password,
            "grant_type": "password",
            "client_id": "acled",
            "scope": "authenticated",
        },
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


def fetch_pool(token):
    # ACLED's documented "field=A:OR:field=B" syntax does not behave as an
    # OR for event_type -- confirmed by direct testing that it silently
    # drops whichever clause comes first and returns only the last one
    # (event_type=Protests:OR:event_type=Riots came back 100% Riots;
    # swapping the order came back 100% Protests). So each event_type is
    # pulled with its own separate, single-value-filtered call instead of
    # trusting that OR syntax -- still scoped, still capped, still logged.
    rows = []
    total_bytes = 0
    per_type_limit = POOL_LIMIT // 2
    for event_type in ("Protests", "Riots"):
        params = {
            "_format": "json",
            "country": "United States",
            "event_type": event_type,
            "event_date": f"{DATE_START}|{DATE_END}",
            "event_date_where": "BETWEEN",
            "fields": "|".join(FIELDS),
            "limit": per_type_limit,
        }
        resp = requests.get(
            API_URL,
            params=params,
            headers={"Authorization": f"Bearer {token}"},
            timeout=60,
        )
        resp.raise_for_status()
        payload = resp.json()
        type_rows = payload.get("data", [])
        byte_count = len(resp.content)
        print(f"[ACLED] pool pull ({event_type}): {len(type_rows)} rows, {byte_count:,} bytes "
              f"(capped at limit={per_type_limit}, date range {DATE_START}..{DATE_END}) "
              f"-- NOT the full history for this query")
        rows.extend(type_rows)
        total_bytes += byte_count
    return rows, total_bytes


def stratified_sample(rows, n, seed=RANDOM_SEED):
    by_state = {}
    for r in rows:
        by_state.setdefault(r.get("admin1", "UNKNOWN"), []).append(r)

    rng = random.Random(seed)
    for bucket in by_state.values():
        rng.shuffle(bucket)

    states = list(by_state.keys())
    rng.shuffle(states)

    sample = []
    i = 0
    safety_valve = n * 20
    while len(sample) < n and i < safety_valve:
        state = states[i % len(states)]
        bucket = by_state[state]
        if bucket:
            sample.append(bucket.pop())
        i += 1
        if all(not b for b in by_state.values()):
            break
    return sample[:n]


def tag_metro(row):
    row["_city_size_bucket"] = "major_metro" if row.get("location") in MAJOR_METROS else "smaller_town"
    return row


def load_cache():
    if not CACHE_PATH.exists():
        return {"events": {}, "sampled_event_ids": []}
    return json.loads(CACHE_PATH.read_text(encoding="utf-8"))


def save_cache(cache):
    CACHE_PATH.parent.mkdir(exist_ok=True)
    CACHE_PATH.write_text(json.dumps(cache, indent=2), encoding="utf-8")


def main():
    email = os.environ.get("ACLED_EMAIL")
    password = os.environ.get("ACLED_PASSWORD")
    if not email or not password:
        print("Missing ACLED_EMAIL / ACLED_PASSWORD -- check unrest-signal-lab/.env", file=sys.stderr)
        sys.exit(1)

    prior = pull_manifest.load_manifest()
    print(f"[ACLED] manifest check: {len(prior['entries'])} prior pulls logged before this run starts.")

    token = get_access_token(email, password)
    pool, pool_bytes = fetch_pool(token)
    if not pool:
        print("ACLED returned zero rows for this query -- feasibility check fails.", file=sys.stderr)
        sys.exit(1)

    cache = load_cache()
    new_count = sum(1 for r in pool if r.get("event_id_cnty") not in cache["events"])
    for r in pool:
        cache["events"][r["event_id_cnty"]] = r
    print(f"[ACLED] cache: {new_count} genuinely new events, {len(pool) - new_count} already known "
          f"-- {len(cache['events'])} total events cached at {CACHE_PATH}")

    sample = stratified_sample(pool, SAMPLE_SIZE)
    sample = [tag_metro(r) for r in sample]

    for eid in {r["event_id_cnty"] for r in sample} - set(cache["sampled_event_ids"]):
        cache["sampled_event_ids"].append(eid)
    save_cache(cache)

    states_covered = sorted({r.get("admin1", "UNKNOWN") for r in sample})
    metros = sum(1 for r in sample if r["_city_size_bucket"] == "major_metro")

    print(f"[ACLED] stratified sample: {len(sample)} events across {len(states_covered)} states "
          f"({metros} major-metro, {len(sample) - metros} smaller-town)")
    print(f"[ACLED] states covered: {', '.join(states_covered)}")

    out_path = HERE / "data" / "acled_sample.json"
    out_path.parent.mkdir(exist_ok=True)
    out_path.write_text(json.dumps(sample, indent=2), encoding="utf-8")
    print(f"[ACLED] wrote {out_path}")

    pull_manifest.append_entry(
        script="inspect_acled.py", source="ACLED",
        description=f"Pool pull ({new_count} new events, {len(pool) - new_count} already cached), "
                    f"stratified sample of {len(sample)} events written to data/acled_sample.json.",
        rows=len(pool), byte_count=pool_bytes,
    )


if __name__ == "__main__":
    main()
