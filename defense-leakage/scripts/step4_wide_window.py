"""Step 4 models on the 14 sample events with a wide window, days -40..+10.
The estimation window moves back to -250..-41 so it never overlaps the event window.
PRELIMINARY: same 14 events as step4_candidate_models.py."""
import numpy as np
import pandas as pd
import step4_candidate_models as s4

s4.PATH = list(range(-40, 11))
s4.EST_END = -41
WIN = {"[-40,-11]": (-40, -11), "[-10,-1]": (-10, -1), "[-40,-1]": (-40, -1), "day 0": (0, 0), "[+1,+5]": (1, 5), "[+6,+10]": (6, 10)}
rng = np.random.default_rng(491)
ret, logv = s4.load_panel()
dates = ret.index
ev = pd.read_csv(s4.DATA / "events_sample.csv", parse_dates=["day0"])
items, tics = [], []
for _, e in ev.iterrows():
    s = s4.event_series(ret, logv, e.ticker, dates.get_indexer([e.day0])[0])
    if s is not None:
        items.append(s); tics.append(e.ticker)
print("events:", len(items))
P = np.array(s4.PATH)
def car(ar, w):
    a, b = WIN[w]; return ar[(P >= a) & (P <= b)].sum()
# placebo pool: ordinary days >= 50 trading days from any sample event of that firm
pool = {}
for t in set(tics):
    idx = [dates.get_indexer([d])[0] for d in ev[ev.ticker == t].day0]
    first = dates.get_loc(ret[t].first_valid_index())
    cand = np.arange(first + 260, len(dates) - 11)
    cand = cand[np.min(np.abs(cand[:, None] - np.array(idx)[None, :]), axis=1) > 50]
    pool[t] = [x for x in (s4.event_series(ret, logv, t, int(j)) for j in rng.choice(cand, 300, replace=False)) if x is not None]
rows = []
for m in ["M1 market-adj", "M2 market model", "M3 SPY+ITA", "V2 log volume mkt-adj"]:
    for w in WIN:
        x = np.array([car(s[m][0], w) for s in items])
        draws = np.array([np.mean([car(pool[t][rng.integers(len(pool[t]))][m][0], w) for t in tics]) for _ in range(2000)])
        p = min(1, 2 * min((draws >= x.mean()).mean(), (draws <= x.mean()).mean()))
        sc = 100 if not m.startswith("V") else 1
        rows.append({"model": m, "window": w, "mean": x.mean() * sc, "median": np.median(x) * sc,
                     "share_pos": (x > 0).mean(), "placebo_p": p,
                     "band90": f"{np.percentile(draws,5)*sc:+.2f} to {np.percentile(draws,95)*sc:+.2f}"})
r = pd.DataFrame(rows)
print(r.round(3).to_string(index=False))
cm = np.mean([np.cumsum(s["M2 market model"][0]) for s in items], axis=0) * 100
print("M2 mean cumulative AR by day:")
print(" ".join(f"{d}:{v:+.2f}" for d, v in zip(P, cm) if d % 5 == 0 or d in (-1, 0, 1)))
