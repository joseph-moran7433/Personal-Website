"""CP3: candidate large DoD contract actions (>= $500M obligated) for the 4 firms, from USAspending.
Candidates only: announcement date and announced value must be confirmed on war.gov."""
import json, sys, urllib.request, pandas as pd
URL = "https://api.usaspending.gov/api/v2/search/spending_by_transaction/"
firms = {"LMT": "Lockheed Martin", "RTX": "Raytheon", "NOC": "Northrop Grumman", "GD": "General Dynamics"}
fields = ["Award ID", "Recipient Name", "Action Date", "Transaction Amount", "Mod", "Transaction Description", "Awarding Sub Agency", "generated_internal_id"]
rows = []
for tic, name in firms.items():
    body = {"filters": {"keywords": [name], "award_type_codes": ["A", "B", "C", "D"],
            "agencies": [{"type": "awarding", "tier": "toptier", "name": "Department of Defense"}],
            "time_period": [{"start_date": "2018-01-01", "end_date": "2026-10-31"}],
            "award_amounts": [{"lower_bound": 500000000}]},
            "fields": fields, "limit": 100, "page": 1, "sort": "Transaction Amount", "order": "desc"}
    req = urllib.request.Request(URL, json.dumps(body).encode(), {"Content-Type": "application/json"})
    res = json.load(urllib.request.urlopen(req, timeout=120))
    for r in res["results"]:
        r["ticker"] = tic; rows.append(r)
    print(tic, len(res["results"]), "hasNext", res["page_metadata"].get("hasNext"))
df = pd.DataFrame(rows)
df.to_csv(sys.argv[1], index=False)
print(df[["ticker","Recipient Name","Action Date","Transaction Amount","Mod"]].sort_values("Transaction Amount", ascending=False).head(25).to_string())
