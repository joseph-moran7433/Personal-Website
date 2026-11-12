"""Step 4 (rough): run every candidate model on the 15-event sample, side by side.

PRELIMINARY. 15 events is a sample for checking the machinery, not for conclusions.

Return models (abnormal return AR = actual - expected):
  M0  raw return (no adjustment)                      -> baseline
  M1  market-adjusted: r - r_SPY                      -> simple baseline, no estimation
  M2  market model: OLS of r on r_SPY                 -> standard event-study model (MacKinlay 1997)
  M3  two-factor: OLS of r on r_SPY and r_ITA         -> industry control (ITA holds these firms, see notes)
Volume models (abnormal log volume):
  V1  mean-adjusted log volume (Campbell & Wasley 1996 style)
  V2  market-adjusted: V1 for the stock minus V1 for SPY on the same day

Tests per window: cross-sectional t, BMP standardized t (Boehmer, Musumeci, Poulsen 1991),
and a placebo test: the same statistic recomputed on random non-event dates for the same firms
(2,000 draws), giving an empirical p-value that does not assume normality.

Estimation window: trading days -250..-31 before day 0, minimum 120 days (early 2018 events
have short histories because prices start 2018-01-02).

Run:  python step4_candidate_models.py
Writes: data/sample/step4_event_level.csv, data/sample/step4_summary.csv,
        data/sample/step4_daily_paths.csv, ../assets/defense-leakage/step4_paths.png
"""
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "sample"
FIG_DIR = ROOT.parent / "assets" / "defense-leakage"

EST_START, EST_END, EST_MIN = -250, -31, 120
PATH = list(range(-10, 6))
WINDOWS = {"pre [-10,-1]": (-10, -1), "day 0": (0, 0), "post [+1,+5]": (1, 5)}
N_PLACEBO = 2000
SEED = 491


def load_panel():
    px = pd.read_csv(DATA / "prices_daily.csv", parse_dates=["date"])
    ret = px.pivot(index="date", columns="ticker", values="Adj Close").pct_change()
    vol = px.pivot(index="date", columns="ticker", values="Volume").astype(float)
    logv = np.log(vol + 1.0)
    return ret, logv


def event_series(ret, logv, tic, d0_idx):
    """Return dict model -> (AR over PATH, residual std over estimation window), or None."""
    dates = ret.index
    lo, hi = d0_idx + EST_START, d0_idx + EST_END
    if hi < 1:
        return None
    lo = max(lo, 1)
    est = slice(lo, hi + 1)
    ev = [d0_idx + k for k in PATH]
    if ev[-1] >= len(dates):
        return None
    y = ret[tic].iloc[est]
    m = ret["SPY"].iloc[est]
    i = ret["ITA"].iloc[est]
    ok = y.notna() & m.notna() & i.notna()
    if ok.sum() < EST_MIN:
        return None
    y, m, i = y[ok].values, m[ok].values, i[ok].values
    ye, me, ie = (ret[c].iloc[ev].values for c in (tic, "SPY", "ITA"))
    out = {}
    # M0 raw
    out["M0 raw"] = (ye, np.std(y, ddof=1))
    # M1 market-adjusted
    out["M1 market-adj"] = (ye - me, np.std(y - m, ddof=1))
    # M2 market model
    X = np.column_stack([np.ones_like(m), m])
    b, *_ = np.linalg.lstsq(X, y, rcond=None)
    res = y - X @ b
    out["M2 market model"] = (ye - (b[0] + b[1] * me), np.sqrt(res @ res / (len(y) - 2)))
    # M3 two-factor
    X3 = np.column_stack([np.ones_like(m), m, i])
    b3, *_ = np.linalg.lstsq(X3, y, rcond=None)
    res3 = y - X3 @ b3
    out["M3 SPY+ITA"] = (ye - (b3[0] + b3[1] * me + b3[2] * ie), np.sqrt(res3 @ res3 / (len(y) - 3)))
    # V1 / V2 log volume
    lv = logv[tic].iloc[est].values
    ls = logv["SPY"].iloc[est].values
    av = logv[tic].iloc[ev].values - lv.mean()
    out["V1 log volume"] = (av, np.std(lv, ddof=1))
    avs = logv["SPY"].iloc[ev].values - ls.mean()
    d = (lv - lv.mean()) - (ls - ls.mean())
    out["V2 log volume mkt-adj"] = (av - avs, np.std(d, ddof=1))
    return out


def window_stats(rows):
    """rows: list of (AR path array, sigma). Returns per-window (mean CAR, CS t, BMP t)."""
    res = {}
    for w, (a, b) in WINDOWS.items():
        idx = [PATH.index(k) for k in range(a, b + 1)]
        L = len(idx)
        car = np.array([r[0][idx].sum() for r in rows])
        scar = np.array([r[0][idx].sum() / (r[1] * np.sqrt(L)) for r in rows])
        n = len(car)
        cs_t = car.mean() / (car.std(ddof=1) / np.sqrt(n))
        bmp_t = scar.mean() / (scar.std(ddof=1) / np.sqrt(n))
        res[w] = (car.mean(), cs_t, bmp_t, (car > 0).mean())
    return res


def main():
    ret, logv = load_panel()
    ev = pd.read_csv(DATA / "events_sample.csv", parse_dates=["day0"])
    dates = ret.index
    rng = np.random.default_rng(SEED)

    per_model = {}
    event_rows = []
    for _, e in ev.iterrows():
        d0_idx = dates.get_indexer([e["day0"]])[0]
        s = event_series(ret, logv, e["ticker"], d0_idx)
        if s is None:
            print("skip (short history)", e["ticker"], e["day0"].date())
            continue
        for mname, (ar, sig) in s.items():
            per_model.setdefault(mname, []).append((ar, sig))
            r = {"model": mname, "ticker": e["ticker"], "day0": e["day0"].date(),
                 "event_type": e["event_type"], "description": e["description"]}
            for w, (a, b) in WINDOWS.items():
                r[w] = ar[[PATH.index(k) for k in range(a, b + 1)]].sum()
            event_rows.append(r)
    n_events = len(per_model["M2 market model"])
    print("events used:", n_events)

    # Placebo: for each event, swap in a random day0 for the same ticker that is
    # at least 20 trading days from every sample event for that ticker.
    ev_idx = {}
    for _, e in ev.iterrows():
        ev_idx.setdefault(e["ticker"], []).append(dates.get_indexer([e["day0"]])[0])
    valid = {}
    for tic, idxs in ev_idx.items():
        first = ret[tic].first_valid_index()
        start = dates.get_loc(first) - EST_START + 1  # room for estimation window
        cand = np.arange(max(start, 260), len(dates) - 6)
        mask = np.ones(len(cand), bool)
        for j in idxs:
            mask &= np.abs(cand - j) > 20
        valid[tic] = cand[mask]

    used = [(e["ticker"]) for _, e in ev.iterrows()
            if event_series(ret, logv, e["ticker"], dates.get_indexer([e["day0"]])[0]) is not None]
    # precompute series for a sampled pool of placebo dates per ticker (fast)
    pool = {}
    for tic in set(used):
        pick = rng.choice(valid[tic], size=min(400, len(valid[tic])), replace=False)
        pool[tic] = [event_series(ret, logv, tic, j) for j in pick]
        pool[tic] = [p for p in pool[tic] if p is not None]

    summary = []
    placebo_paths = {}
    for mname, rows in per_model.items():
        actual = window_stats(rows)
        draws = {w: [] for w in WINDOWS}
        cpaths = []
        for _ in range(N_PLACEBO):
            prow = []
            for tic in used:
                p = pool[tic][rng.integers(len(pool[tic]))]
                prow.append(p[mname])
            st = window_stats(prow)
            for w in WINDOWS:
                draws[w].append(st[w][0])
            cpaths.append(np.mean([np.cumsum(r[0]) for r in prow], axis=0))
        placebo_paths[mname] = np.percentile(np.array(cpaths), [5, 95], axis=0)
        for w in WINDOWS:
            m, cs_t, bmp_t, pos = actual[w]
            d = np.array(draws[w])
            p_two = 2 * min((d >= m).mean(), (d <= m).mean())
            summary.append({"model": mname, "window": w, "n": len(rows),
                            "mean_CAR": m, "cs_t": cs_t, "bmp_t": bmp_t,
                            "share_positive": pos, "placebo_p_two_sided": min(p_two, 1.0),
                            "placebo_5pct": np.percentile(d, 5), "placebo_95pct": np.percentile(d, 95)})

    summ = pd.DataFrame(summary)
    pd.DataFrame(event_rows).to_csv(DATA / "step4_event_level.csv", index=False, float_format="%.5f")
    summ.to_csv(DATA / "step4_summary.csv", index=False, float_format="%.4f")
    paths = []
    for mname, rows in per_model.items():
        cm = np.mean([np.cumsum(r[0]) for r in rows], axis=0)
        for k, day in enumerate(PATH):
            paths.append({"model": mname, "day": day, "mean_cum": cm[k],
                          "placebo_5": placebo_paths[mname][0][k],
                          "placebo_95": placebo_paths[mname][1][k]})
    pd.DataFrame(paths).to_csv(DATA / "step4_daily_paths.csv", index=False, float_format="%.5f")
    with pd.option_context("display.width", 200, "display.max_columns", 20):
        print(summ.round(4).to_string(index=False))
    plot(pd.DataFrame(paths), n_events)


def plot(paths, n):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    FIG_DIR.mkdir(parents=True, exist_ok=True)
    fig, axes = plt.subplots(1, 2, figsize=(11, 4), dpi=150)
    for ax, mname, ylab, scale in [
        (axes[0], "M2 market model", "Mean cumulative abnormal return (%)", 100),
        (axes[1], "V2 log volume mkt-adj", "Mean cumulative abnormal log volume", 1)]:
        p = paths[paths.model == mname]
        ax.fill_between(p.day, p.placebo_5 * scale, p.placebo_95 * scale, color="#c9c4b5",
                        alpha=0.6, label="90% band, random non-event dates")
        ax.plot(p.day, p.mean_cum * scale, color="#8a6d1d", lw=2.2, marker="o", ms=3.5,
                label=f"Sample events (n={n})")
        ax.axvline(-0.5, color="#555", ls="--", lw=1)
        ax.axhline(0, color="#999", lw=0.8)
        ax.axvspan(-10.5, -0.5, color="#8a6d1d", alpha=0.05)
        ax.set_xlabel("Trading day relative to day 0 (first day after announcement)")
        ax.set_ylabel(ylab)
        ax.set_title(mname + " (PRELIMINARY)", fontsize=10)
        ax.spines[["top", "right"]].set_visible(False)
        ax.legend(fontsize=7.5, frameon=False, loc="upper left")
    fig.tight_layout()
    fig.savefig(FIG_DIR / "step4_paths.png")
    print("wrote", FIG_DIR / "step4_paths.png")


if __name__ == "__main__":
    main()
