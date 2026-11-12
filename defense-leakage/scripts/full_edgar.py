"""Full-study EDGAR pull: earnings-release dates (8-K Item 2.02) and 10-K annual revenue
for every study ticker. CIKs come from SEC's own company_tickers.json.
Writes data/full/edgar_earnings_8k.csv, data/full/edgar_revenue.csv."""
import sys
import time
from pathlib import Path

import pandas as pd
import requests

OUT = Path(__file__).resolve().parents[1] / "data" / "full"
UA = {"User-Agent": "Joseph Moran jwmoran7@optonline.net"}
TICKERS = ["LMT", "RTX", "NOC", "GD", "HII", "LHX", "LDOS", "BA", "TXT", "BAH", "KTOS"]


def get(url):
    for _ in range(3):
        r = requests.get(url, headers=UA, timeout=30)
        if r.ok:
            time.sleep(0.15)
            return r.json()
        time.sleep(1)
    r.raise_for_status()


tick = {v["ticker"]: int(v["cik_str"]) for v in get("https://www.sec.gov/files/company_tickers.json").values()}
earn, rev = [], []
for t in TICKERS:
    c = tick[t]
    s = get(f"https://data.sec.gov/submissions/CIK{c:010d}.json")
    for b in [s["filings"]["recent"]] + [get("https://data.sec.gov/submissions/" + f["name"]) for f in s["filings"]["files"]]:
        df = pd.DataFrame({k: b[k] for k in ("form", "filingDate", "acceptanceDateTime", "items")})
        df = df[(df.form == "8-K") & df["items"].str.contains("2.02", regex=False)].assign(ticker=t, cik=c)
        earn.append(df)
    f = get(f"https://data.sec.gov/api/xbrl/companyfacts/CIK{c:010d}.json")["facts"]["us-gaap"]
    for tag in ("Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet"):
        for u in f.get(tag, {}).get("units", {}).get("USD", []):
            if u.get("form") == "10-K" and u.get("fp") == "FY" and "start" in u:
                d = (pd.Timestamp(u["end"]) - pd.Timestamp(u["start"])).days
                if 350 <= d <= 380:
                    rev.append({"ticker": t, "tag": tag, "fy_end": u["end"], "revenue": u["val"], "filed": u["filed"]})
    print(t, c, s["name"])
e = pd.concat(earn).drop_duplicates(["ticker", "filingDate"])
e = e[e.filingDate >= "2016-06-01"].sort_values(["ticker", "filingDate"])
e.to_csv(OUT / "edgar_earnings_8k.csv", index=False)
r = pd.DataFrame(rev).sort_values("filed").groupby(["ticker", "fy_end"]).last().reset_index()
r["fy"] = pd.to_datetime(r.fy_end).dt.year
r = r.groupby(["ticker", "fy"]).last().reset_index()
r.to_csv(OUT / "edgar_revenue.csv", index=False)
print(e.groupby("ticker").size().to_dict())
print(r.pivot(index="fy", columns="ticker", values="revenue").div(1e9).round(1).loc[2016:])
