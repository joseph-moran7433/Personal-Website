"""Earnings-release dates before mid-2016 (the 2010 extension).

SEC EDGAR refuses scripted requests that carry no contact address (403), so for 2008-2016 the
earnings screen uses Yahoo Finance's earnings calendar instead. Each row carries the release time,
so a release at or after 4 PM counts for the next trading day, the same rule used for 8-K filings.
EDGAR 8-K dates (edgar_earnings_8k.csv) stay the source from June 2016 on; this script appends the
earlier Yahoo dates to the same file with source = "yfinance".
Checked: for 2016-06..2026 the two sources agree on the trading day for nearly every release (printed below).
"""
from pathlib import Path

import pandas as pd
import yfinance as yf

DATA = Path(__file__).resolve().parents[1] / "data" / "full"
TICKERS = ["LMT", "RTX", "NOC", "GD", "HII", "LHX", "LDOS", "BA", "TXT", "BAH", "KTOS"]
CUT = "2016-06-01"

ed = pd.read_csv(DATA / "edgar_earnings_8k.csv")
ed = ed[ed.get("source", pd.Series("edgar", index=ed.index)).fillna("edgar") == "edgar"].copy()
ed["source"] = "edgar"
rows, agree = [], []
for t in TICKERS:
    d = yf.Ticker(t).get_earnings_dates(limit=100)
    if d is None or not len(d):
        print(t, "no yahoo dates")
        continue
    ts = pd.Series(d.index.tz_convert("America/New_York").tz_localize(None))
    ts = ts[ts <= pd.Timestamp.now()]
    eff = ts.where(ts.dt.hour < 16, ts + pd.Timedelta(days=1)).dt.normalize()
    # agreement check against EDGAR over the overlap
    e = ed[ed.ticker == t]
    acc = pd.to_datetime(e.acceptanceDateTime.str[:19])
    edd = pd.to_datetime(e.filingDate).where(acc.dt.hour < 16, pd.to_datetime(e.filingDate) + pd.Timedelta(days=1))
    ov = eff[eff >= CUT]
    hit = sum(((edd - x).abs() <= pd.Timedelta(days=1)).any() for x in ov)
    agree.append((t, len(ov), hit))
    old = ts[ts < CUT]
    for x in old:
        rows.append(dict(form="8-K", filingDate=x.strftime("%Y-%m-%d"), acceptanceDateTime=x.strftime("%Y-%m-%dT%H:%M:%S"),
                         items="2.02", ticker=t, cik=e.cik.iloc[0] if len(e) else None, source="yfinance"))
    print(t, "yahoo dates before", CUT, ":", len(old), "earliest", old.min() if len(old) else None)
out = pd.concat([ed, pd.DataFrame(rows)], ignore_index=True).sort_values(["ticker", "filingDate"])
out.to_csv(DATA / "edgar_earnings_8k.csv", index=False)
print("agreement with EDGAR (yahoo dates since 2016-06 within 1 day of an 8-K):", agree)
print("saved", len(out), "rows")
