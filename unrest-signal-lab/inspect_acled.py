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

HERE = Path(__file__).resolve().parent
load_dotenv(HERE / ".env")

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
    params = {
        "_format": "json",
        "country": "United States",
        "event_type": "Protests:OR:event_type=Riots",
        "event_date": f"{DATE_START}|{DATE_END}",
        "event_date_where": "BETWEEN",
        "fields": "|".join(FIELDS),
        "limit": POOL_LIMIT,
    }
    resp = requests.get(
        API_URL,
        params=params,
        headers={"Authorization": f"Bearer {token}"},
        timeout=60,
    )
    resp.raise_for_status()
    payload = resp.json()
    rows = payload.get("data", [])
    byte_count = len(resp.content)
    print(f"[ACLED] pool pull: {len(rows)} rows, {byte_count:,} bytes "
          f"(capped at limit={POOL_LIMIT}, date range {DATE_START}..{DATE_END}) "
          f"-- NOT the full history for this query")
    return rows


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


def main():
    email = os.environ.get("ACLED_EMAIL")
    password = os.environ.get("ACLED_PASSWORD")
    if not email or not password:
        print("Missing ACLED_EMAIL / ACLED_PASSWORD -- check unrest-signal-lab/.env", file=sys.stderr)
        sys.exit(1)

    token = get_access_token(email, password)
    pool = fetch_pool(token)
    if not pool:
        print("ACLED returned zero rows for this query -- feasibility check fails.", file=sys.stderr)
        sys.exit(1)

    sample = stratified_sample(pool, SAMPLE_SIZE)
    sample = [tag_metro(r) for r in sample]

    states_covered = sorted({r.get("admin1", "UNKNOWN") for r in sample})
    metros = sum(1 for r in sample if r["_city_size_bucket"] == "major_metro")

    print(f"[ACLED] stratified sample: {len(sample)} events across {len(states_covered)} states "
          f"({metros} major-metro, {len(sample) - metros} smaller-town)")
    print(f"[ACLED] states covered: {', '.join(states_covered)}")

    out_path = HERE / "data" / "acled_sample.json"
    out_path.parent.mkdir(exist_ok=True)
    out_path.write_text(json.dumps(sample, indent=2), encoding="utf-8")
    print(f"[ACLED] wrote {out_path}")


if __name__ == "__main__":
    main()
