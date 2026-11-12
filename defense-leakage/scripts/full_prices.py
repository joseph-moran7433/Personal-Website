"""Full-study prices: the big four + SPY/ITA (same as CP3) plus mid-cap candidates.
Yahoo Finance via yfinance, Jan 2017 - Oct 2026 (2017 added so 2018 events get a full
estimation window). RTX starts 2020-04-03 (earlier = United Technologies).
LHX before the 2019-06-29 L3 merger is Harris Corp alone: kept, flagged in the README."""
import sys
import pandas as pd
import yfinance as yf
out = sys.argv[1]
rows = []
for t in ["LMT", "RTX", "NOC", "GD", "HII", "LHX", "LDOS", "BA", "TXT", "BAH", "KTOS", "SPY", "ITA"]:
    d = yf.Ticker(t).history(start="2017-01-01", end="2026-11-01", auto_adjust=False)
    d = d[["Open", "High", "Low", "Close", "Adj Close", "Volume"]].copy()
    d.index = d.index.tz_localize(None).date
    if t == "RTX":
        d = d[d.index >= pd.Timestamp("2020-04-03").date()]
    d["ticker"] = t
    rows.append(d)
    print(t, len(d), d.index.min(), d.index.max(), "zero-vol:", int((d.Volume == 0).sum()))
p = pd.concat(rows).rename_axis("date").reset_index()
p.to_csv(out, index=False)
print("saved", out, len(p))
