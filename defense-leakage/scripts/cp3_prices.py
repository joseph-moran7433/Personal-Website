"""CP3 sample pull: daily prices/volume for 6 tickers, Jan 2018 - Oct 2026 (last full month).
Source: Yahoo Finance via yfinance. Raw (unadjusted) Close plus Adj Close kept.
RTX truncated to 2020-04-03 onward (pre-merger series is United Technologies)."""
import yfinance as yf, pandas as pd, sys
out = sys.argv[1]
rows = []
for t in ["LMT", "RTX", "NOC", "GD", "SPY", "ITA"]:
    d = yf.Ticker(t).history(start="2018-01-01", end="2026-11-01", auto_adjust=False)
    d = d[["Open", "High", "Low", "Close", "Adj Close", "Volume"]].copy()
    d.index = d.index.tz_localize(None).date
    if t == "RTX":
        d = d[d.index >= pd.Timestamp("2020-04-03").date()]
    d["ticker"] = t
    rows.append(d)
    print(t, len(d), d.index.min(), d.index.max(), "zero-volume days:", int((d.Volume == 0).sum()), "NaN rows:", int(d.isna().any(axis=1).sum()))
p = pd.concat(rows).rename_axis("date").reset_index()
p.to_csv(out, index=False)
print("saved", out, len(p))
