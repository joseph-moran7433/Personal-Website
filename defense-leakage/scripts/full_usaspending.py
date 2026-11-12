"""Full-study contract events from USAspending (public API built for scripted use).

war.gov blocks automated reads (403 Access Denied after ~130 pages on 2026-11-12), so contract
events now come from USAspending. Limits, carried into the write-up:
  - date = USAspending action date, not the war.gov post date (6 of 12 sample awards matched
    exactly; one was posted 5 days after the action date)
  - value = dollars obligated in that action, not the announced ceiling (A8)
For every DoD contract transaction of $100M+ to a study firm, Jan 2018 - Oct 2026, it keeps the
transaction, then looks up each award's competition fields (extent competed, offers received).

Writes data/full/usaspending_transactions.csv and data/full/usaspending_awards.csv
"""
import json
import re
import time
import urllib.request
from pathlib import Path

import pandas as pd

OUT = Path(__file__).resolve().parents[1] / "data" / "full"
URL = "https://api.usaspending.gov/api/v2/search/spending_by_transaction/"
AWARD = "https://api.usaspending.gov/api/v2/awards/{}/"
FIRMS = {
    "LMT": ["Lockheed Martin", "Sikorsky"],
    "RTX": ["Raytheon", "RTX", "Pratt & Whitney", "Pratt and Whitney", "Collins Aerospace"],
    "NOC": ["Northrop Grumman"],
    "GD": ["General Dynamics", "Electric Boat", "Bath Iron Works", "National Steel and Shipbuilding", "Gulfstream Aerospace"],
    "HII": ["Huntington Ingalls"],
    "LHX": ["L3Harris", "L3 Technologies", "Harris Corporation"],
    "LDOS": ["Leidos"],
    "BA": ["Boeing"],
    "TXT": ["Textron", "Bell Textron", "Bell Helicopter"],
    "BAH": ["Booz Allen"],
    "KTOS": ["Kratos"],
}
FIELDS = ["Award ID", "Recipient Name", "Action Date", "Transaction Amount", "Mod", "Transaction Description",
          "Awarding Sub Agency", "generated_internal_id"]


def post(body):
    for k in range(4):
        try:
            req = urllib.request.Request(URL, json.dumps(body).encode(), {"Content-Type": "application/json"})
            return json.load(urllib.request.urlopen(req, timeout=120))
        except Exception as e:
            time.sleep(2 + 3 * k)
            err = e
    raise err


def get(url):
    for k in range(4):
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(url), timeout=60))
        except Exception as e:
            time.sleep(2 + 3 * k)
            err = e
    raise err


rows = []
for tic, names in FIRMS.items():
    for name in names:
        page = 1
        while True:
            body = {"filters": {"recipient_search_text": [name], "award_type_codes": ["A", "B", "C", "D"],
                                "agencies": [{"type": "awarding", "tier": "toptier", "name": "Department of Defense"}],
                                "time_period": [{"start_date": "2018-01-01", "end_date": "2026-10-31"}]},
                    "fields": FIELDS, "limit": 100, "page": page, "sort": "Transaction Amount", "order": "desc"}
            res = post(body)
            got = res.get("results", [])
            for r in got:
                r["ticker"], r["search_name"] = tic, name
            rows += got
            small = not got or got[-1]["Transaction Amount"] < 1e8
            if small or not res["page_metadata"].get("hasNext"):
                break
            page += 1
            time.sleep(0.3)
        print(tic, name, "pages", page)
tx = pd.DataFrame(rows)
tx = tx[tx["Transaction Amount"] >= 1e8].drop_duplicates(["generated_internal_id", "Mod", "Action Date", "Transaction Amount"])
# keep rows whose recipient really is the firm (search text can match inside other names)
pat = {t: re.compile("|".join(re.escape(n) for n in ns), re.I) for t, ns in FIRMS.items()}
tx = tx[[bool(pat[t].search(str(n))) for t, n in zip(tx.ticker, tx["Recipient Name"])]]
tx.to_csv(OUT / "usaspending_transactions.csv", index=False)
print("transactions >= $100M:", len(tx), tx.groupby("ticker").size().to_dict())

aw = []
ids = tx.generated_internal_id.unique()
for i, gid in enumerate(ids):
    try:
        a = get(AWARD.format(gid))
        c = a.get("latest_transaction_contract_data") or {}
        aw.append({"generated_internal_id": gid, "extent_competed": c.get("extent_competed"),
                   "extent_competed_description": c.get("extent_competed_description"),
                   "number_of_offers_received": c.get("number_of_offers_received"),
                   "solicitation_procedures_description": c.get("solicitation_procedures_description"),
                   "type_of_contract_pricing_description": c.get("type_of_contract_pricing_description"),
                   "parent_recipient": (a.get("recipient") or {}).get("parent_recipient_name"),
                   "award_total_obligation": a.get("total_obligation"),
                   "base_and_all_options": a.get("base_and_all_options_value")})
    except Exception as e:
        aw.append({"generated_internal_id": gid, "error": str(e)[:80]})
    time.sleep(0.12)
    if i % 200 == 0:
        print("awards", i, "/", len(ids))
pd.DataFrame(aw).to_csv(OUT / "usaspending_awards.csv", index=False)
print("done", len(aw))
