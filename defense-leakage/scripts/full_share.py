"""Share of DoD contract obligations won by the study firms, by fiscal year (USAspending).
Answers the instructor question "which companies can be traded": how much of the money the
public firms in this study cover. Recipient matching is by name search, so subsidiaries with
other names are missed (the shares are a floor).
Writes data/full/dod_share_by_year.csv"""
import json
import time
import urllib.request
from pathlib import Path

import pandas as pd

FIRMS = {
    "LMT": ["Lockheed Martin", "Sikorsky"],
    "RTX": ["Raytheon", "RTX", "Pratt & Whitney", "Collins Aerospace"],
    "NOC": ["Northrop Grumman"],
    "GD": ["General Dynamics", "Electric Boat", "Bath Iron Works", "National Steel and Shipbuilding", "Gulfstream Aerospace"],
    "HII": ["Huntington Ingalls"], "LHX": ["L3Harris", "L3 Technologies", "Harris Corporation"], "LDOS": ["Leidos"],
    "BA": ["Boeing"], "TXT": ["Textron", "Bell Textron", "Bell Helicopter"], "BAH": ["Booz Allen"], "KTOS": ["Kratos"],
}  # same names as full_usaspending.py

OUT = Path(__file__).resolve().parents[1] / "data" / "full" / "dod_share_by_year.csv"
URL = "https://api.usaspending.gov/api/v2/search/spending_over_time/"


def by_year(extra):
    f = {"award_type_codes": ["A", "B", "C", "D"],
         "agencies": [{"type": "awarding", "tier": "toptier", "name": "Department of Defense"}],
         "time_period": [{"start_date": "2017-10-01", "end_date": "2026-09-30"}]}
    f.update(extra)
    body = {"group": "fiscal_year", "filters": f}
    for k in range(4):
        try:
            req = urllib.request.Request(URL, json.dumps(body).encode(), {"Content-Type": "application/json"})
            r = json.load(urllib.request.urlopen(req, timeout=120))
            return {int(x["time_period"]["fiscal_year"]): x["aggregated_amount"] for x in r["results"]}
        except Exception as e:
            err = e
            time.sleep(3 + 3 * k)
    raise err


rows = {"all_dod": by_year({})}
for t, names in FIRMS.items():
    rows[t] = by_year({"recipient_search_text": names})
    print(t, round(sum(rows[t].values()) / 1e9, 1))
df = pd.DataFrame(rows).sort_index()
df.index.name = "fiscal_year"
firms = list(FIRMS)
df["study_firms"] = df[firms].sum(axis=1)
df["study_share_pct"] = df.study_firms / df.all_dod * 100
df["big4_share_pct"] = df[["LMT", "RTX", "NOC", "GD"]].sum(axis=1) / df.all_dod * 100
df.to_csv(OUT)
print((df[["all_dod", "study_firms"]] / 1e9).round(1).join(df[["study_share_pct", "big4_share_pct"]].round(1)))
