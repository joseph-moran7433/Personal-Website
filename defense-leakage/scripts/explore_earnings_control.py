"""Earnings releases as a comparison (positive control) for the contract / arms-sale events.

Earnings are known to move prices, so the same machinery should find a large day-0 move there.
If it does, a quiet result on contracts means the method can see, not that it is blind.

Same market model (M2) and market-adjusted volume (V2) as Step 4. Earnings day 0 = the 8-K
(Item 2.02) filing day if accepted before 4 PM ET, else the next trading day.

Also counts "anomalous days": days whose abnormal return is beyond 2 residual sd (about 5% of
ordinary days if returns were normal), in days -10..-1, for sample events, earnings and random days.

Run after explore_full.py:  python explore_earnings_control.py
Adds keys to data/sample/exploration.json.
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
import step4_candidate_models as s4  # noqa: E402

DATA = Path(__file__).resolve().parents[1] / "data" / "sample"
FIRMS = ["LMT", "RTX", "NOC", "GD"]
rng = np.random.default_rng(4912)


def main():
    ret, logv = s4.load_panel()
    dates = ret.index
    earn = pd.read_csv(DATA / "edgar_earnings_8k.csv")
    acc = pd.to_datetime(earn.acceptanceDateTime.str[:19])
    eday = pd.to_datetime(earn.filingDate)
    eday = eday.where(acc.dt.hour < 16, eday + pd.Timedelta(days=1))
    earn["d0"] = dates.searchsorted(eday)
    ev = pd.read_csv(DATA / "events_sample.csv", parse_dates=["day0"])
    ev["d0"] = dates.get_indexer(ev.day0)

    def collect(pairs):
        out = []
        for tic, d0 in pairs:
            if d0 >= len(dates) - 6:
                continue
            s = s4.event_series(ret, logv, tic, int(d0))
            if s is not None:
                out.append((tic, int(d0), s["M2 market model"], s["V2 log volume mkt-adj"]))
        return out

    groups = {
        "Contract and arms-sale events": collect(zip(ev.ticker, ev.d0)),
        "Earnings releases": collect(zip(earn.ticker, earn.d0)),
    }
    # random ordinary days, >= 20 trading days from any sample event or earnings day
    rand = []
    for tic in FIRMS:
        busy = np.concatenate([ev[ev.ticker == tic].d0.values, earn[earn.ticker == tic].d0.values])
        first = dates.get_loc(ret[tic].first_valid_index())
        cand = np.arange(max(first + 251, 260), len(dates) - 6)
        cand = cand[np.array([np.min(np.abs(busy - c)) > 20 for c in cand])]
        rand += [(tic, c) for c in rng.choice(cand, 300, replace=False)]
    groups["Random ordinary days"] = collect(rand)

    summary, paths = [], []
    for g, items in groups.items():
        car = np.array([np.cumsum(m[0]) for _, _, m, _ in items]) * 100
        ar = np.array([m[0] for _, _, m, _ in items]) * 100
        sig = np.array([m[1] for _, _, m, _ in items]) * 100
        av = np.array([v[0] for _, _, _, v in items])
        z = ar / sig[:, None]
        summary.append({
            "group": g, "n": int(len(items)), "n_volume": int(np.isfinite(av[:, 10]).sum()),
            "mean_car_pre_pct": float(ar[:, :10].sum(1).mean()),
            "mean_abs_car_pre_pct": float(np.abs(ar[:, :10].sum(1)).mean()),
            "mean_abs_ar_day0_pct": float(np.abs(ar[:, 10]).mean()),
            "mean_abvol_day0": float(np.nanmean(av[:, 10])),
            "mean_abvol_pre": float(np.nanmean(av[:, :10])),
            "pct_anomalous_days_pre": float((np.abs(z[:, :10]) > 2).mean() * 100),
            "pct_anomalous_day0": float((np.abs(z[:, 10]) > 2).mean() * 100),
        })
        for j, day in enumerate(s4.PATH):
            paths.append({"group": g, "day": day, "mean_abs_ar_pct": float(np.abs(ar[:, j]).mean()),
                          "mean_abvol": float(np.nanmean(av[:, j]))})

    out = json.loads((DATA / "exploration.json").read_text())
    out["control_summary"] = summary
    out["control_paths"] = paths
    (DATA / "exploration.json").write_text(json.dumps(out, separators=(",", ":")))
    print(pd.DataFrame(summary).round(3).to_string(index=False))


if __name__ == "__main__":
    main()
