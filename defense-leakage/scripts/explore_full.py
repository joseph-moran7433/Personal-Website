"""Full data exploration for the defense leakage project (Step 2 revisit, after Steps 3-4).

Pulls two new inputs from SEC EDGAR (no key; sec.gov asks for a contact in the User-Agent):
  - earnings-release dates: 8-K filings with Item 2.02 ("Results of Operations")
  - annual revenue from XBRL company facts (10-K, full fiscal year)
Then builds every table the exploration page draws and writes them to one JSON file.

Run:  python explore_full.py
Writes: data/sample/edgar_earnings_8k.csv, data/sample/edgar_revenue.csv,
        data/sample/exploration.json
"""
import json
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
import requests

sys.path.insert(0, str(Path(__file__).parent))
import step4_candidate_models as s4  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "sample"
UA = {"User-Agent": "Joseph Moran jwmoran7@optonline.net"}
CIK = {"LMT": 936468, "NOC": 1133421, "GD": 40533, "RTX": 101829}
FIRMS = ["LMT", "RTX", "NOC", "GD"]
rng = np.random.default_rng(491)


def get(url):
    for _ in range(3):
        r = requests.get(url, headers=UA, timeout=30)
        if r.ok:
            time.sleep(0.15)
            return r.json()
        time.sleep(1)
    r.raise_for_status()


# ---------- EDGAR ----------
def earnings_dates():
    rows = []
    for t, c in CIK.items():
        s = get(f"https://data.sec.gov/submissions/CIK{c:010d}.json")
        blocks = [s["filings"]["recent"]] + [get("https://data.sec.gov/submissions/" + f["name"])
                                              for f in s["filings"]["files"]]
        for b in blocks:
            df = pd.DataFrame({k: b[k] for k in ("form", "filingDate", "acceptanceDateTime", "items")})
            df = df[(df.form == "8-K") & df["items"].str.contains("2.02", regex=False)]
            df["ticker"] = t
            rows.append(df)
    e = pd.concat(rows).drop_duplicates(["ticker", "filingDate"])
    e = e[e.filingDate >= "2017-01-01"].sort_values(["ticker", "filingDate"])
    e.to_csv(DATA / "edgar_earnings_8k.csv", index=False)
    return e


def revenue():
    rows = []
    for t, c in CIK.items():
        f = get(f"https://data.sec.gov/api/xbrl/companyfacts/CIK{c:010d}.json")["facts"]["us-gaap"]
        for tag in ("Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet"):
            for u in f.get(tag, {}).get("units", {}).get("USD", []):
                if u.get("form") == "10-K" and u.get("fp") == "FY" and "start" in u:
                    d = (pd.Timestamp(u["end"]) - pd.Timestamp(u["start"])).days
                    if 350 <= d <= 380:
                        rows.append({"ticker": t, "tag": tag, "fy_end": u["end"], "revenue": u["val"],
                                     "filed": u["filed"]})
    r = pd.DataFrame(rows)
    # one value per firm-year: the latest filing (restated if restated)
    r = r.sort_values("filed").groupby(["ticker", "fy_end"]).last().reset_index()
    r["fy"] = pd.to_datetime(r.fy_end).dt.year
    r = r.groupby(["ticker", "fy"]).last().reset_index()
    r.to_csv(DATA / "edgar_revenue.csv", index=False)
    return r


# ---------- main ----------
def main():
    earn = earnings_dates()
    rev = revenue()
    print("earnings 8-Ks:", earn.groupby("ticker").size().to_dict())
    print(rev.pivot(index="fy", columns="ticker", values="revenue").div(1e9).round(1).tail(10))

    px = pd.read_csv(DATA / "prices_daily.csv", parse_dates=["date"])
    ret, logv = s4.load_panel()
    dates = ret.index
    out = {}

    # earnings trading day (before 4 PM ET acceptance -> same day, else next day)
    acc = pd.to_datetime(earn.acceptanceDateTime.str[:19])
    eday = pd.to_datetime(earn.filingDate)
    eday = eday.where(acc.dt.hour < 16, eday + pd.Timedelta(days=1))
    earn = earn.assign(eday_idx=dates.searchsorted(eday))

    # 1. indexed monthly prices (100 = Apr 2020, RTX's first month)
    adj = px.pivot(index="date", columns="ticker", values="Adj Close")
    m = adj.resample("ME").last()
    base = m.loc["2020-04-30"]
    idx = (m / base * 100).stack().reset_index()
    idx.columns = ["month", "ticker", "index"]
    idx["month"] = idx.month.dt.strftime("%Y-%m")
    out["price_index"] = idx.round(2).to_dict("records")

    # 2. per-stock stats
    stats = []
    common = ret.loc["2020-04-06":].dropna()
    for t in FIRMS + ["ITA", "SPY"]:
        r = ret[t].dropna()
        z = (r - r.mean()) / r.std()
        lv = logv[t].loc[r.index]
        X = np.column_stack([np.ones(len(common)), common["SPY"]])
        b = np.linalg.lstsq(X, common[t], rcond=None)[0]
        stats.append({
            "ticker": t, "first_day": str(r.index[0].date()), "trading_days": int(len(r)),
            "ann_vol_pct": float(r.std() * np.sqrt(252) * 100),
            "daily_sd_pct": float(r.std() * 100),
            "beta_spy": float(b[1]),
            "corr_spy": float(common[t].corr(common["SPY"])),
            "corr_ita": float(common[t].corr(common["ITA"])),
            "excess_kurtosis": float(r.kurt()),
            "pct_days_beyond_3sd": float((z.abs() > 3).mean() * 100),
            "acf1_return": float(r.autocorr(1)),
            "acf1_logvol": float(lv.autocorr(1)),
            "median_volume_m": float(px[px.ticker == t].Volume.median() / 1e6),
        })
    out["stock_stats"] = stats

    # 3. correlation matrix (common period from Apr 2020)
    cm = common[FIRMS + ["ITA", "SPY"]].corr()
    out["corr"] = [{"a": a, "b": b, "corr": round(float(cm.loc[a, b]), 3)} for a in cm.index for b in cm.columns]

    # 4. monthly median volume, indexed to 2018 (RTX to its first 12 months)
    vol = px.pivot(index="date", columns="ticker", values="Volume")
    vm = vol.resample("ME").median()
    vrows = []
    for t in FIRMS + ["SPY"]:
        s = vm[t].dropna()
        s = s / s.iloc[:12].mean() * 100
        vrows += [{"month": d.strftime("%Y-%m"), "ticker": t, "vol_index": round(float(v), 1)} for d, v in s.items()]
    out["volume_index"] = vrows

    # 5. return histogram (pooled standardized daily returns, 4 firms) vs normal
    zs = np.concatenate([((ret[t] - ret[t].mean()) / ret[t].std()).dropna().values for t in FIRMS])
    edges = np.arange(-6, 6.01, 0.5)
    h, _ = np.histogram(np.clip(zs, -5.999, 5.999), bins=edges)
    from scipy.stats import norm
    out["ret_hist"] = [{"lo": float(edges[i]), "hi": float(edges[i + 1]), "share_pct": float(h[i] / len(zs) * 100),
                        "normal_pct": float((norm.cdf(edges[i + 1]) - norm.cdf(edges[i])) * 100)}
                       for i in range(len(h))]

    # 6. events with size, earnings proximity, M2/V2 windows
    ev = pd.read_csv(DATA / "events_sample.csv", parse_dates=["day0", "announce_date"])
    erows, paths, vpaths = [], [], []
    for k, e in ev.iterrows():
        t = e.ticker
        d0 = dates.get_indexer([e.day0])[0]
        prior_fy = e.announce_date.year - 1
        rv = rev[(rev.ticker == t) & (rev.fy == prior_fy)].revenue
        rv = float(rv.iloc[0]) if len(rv) else None
        ei = earn[earn.ticker == t].eday_idx.values
        gap = ei - d0
        near = gap[np.argmin(np.abs(gap))]
        in_window = bool(((gap >= -10) & (gap <= 5)).any())
        s = s4.event_series(ret, logv, t, d0)
        row = {"event_id": f"{t} {e.day0.date()}", "ticker": t, "type": e.event_type,
               "announce_date": str(e.announce_date.date()), "day0": str(e.day0.date()),
               "weekday": e.announce_date.day_name(), "description": e.description,
               "announced_bn": float(e.announced_value_usd / 1e9),
               "obligated_bn": None if pd.isna(e.usaspending_obligated_usd) else float(e.usaspending_obligated_usd / 1e9),
               "prior_fy_revenue_bn": None if rv is None else rv / 1e9,
               "pct_of_revenue": None if rv is None else float(e.announced_value_usd / rv * 100),
               "nearest_earnings_days": int(near), "earnings_in_window": in_window,
               "used_in_models": s is not None}
        if s is not None:
            ar, sig = s["M2 market model"]
            av, vsig = s["V2 log volume mkt-adj"]
            row.update({"car_pre_pct": float(ar[:10].sum() * 100), "ar_day0_pct": float(ar[10] * 100),
                        "car_post_pct": float(ar[11:].sum() * 100), "abvol_day0": float(av[10]),
                        "sigma_daily_pct": float(sig * 100)})
            c = np.cumsum(ar)
            for j, day in enumerate(s4.PATH):
                paths.append({"event_id": row["event_id"], "ticker": t, "day": day,
                              "car_pct": round(float(c[j] * 100), 3), "abvol": round(float(av[j]), 3)})
        erows.append(row)
    out["events"] = erows
    out["event_paths"] = paths

    # 7. one worked example: LMT F-35 Lot 16 (day 0 = 2023-01-03)
    t, d0 = "LMT", dates.get_indexer([pd.Timestamp("2023-01-03")])[0]
    est = slice(d0 + s4.EST_START, d0 + s4.EST_END + 1)
    y, mk = ret[t].iloc[est], ret["SPY"].iloc[est]
    b = np.polyfit(mk.values, y.values, 1)
    out["example_fit"] = [{"date": str(d.date()), "spy_pct": round(float(a * 100), 3), "lmt_pct": round(float(v * 100), 3)}
                          for d, a, v in zip(y.index, mk.values, y.values)]
    resid = y.values - np.polyval(b, mk.values)
    out["example_meta"] = [{"alpha_pct": float(b[1] * 100), "beta": float(b[0]),
                            "resid_sd_pct": float(resid.std(ddof=2) * 100),
                            "est_start": str(y.index[0].date()), "est_end": str(y.index[-1].date()),
                            "est_days": int(len(y)), "r2": float(np.corrcoef(mk, y)[0, 1] ** 2)}]
    ex = []
    car = 0
    for day in s4.PATH:
        i = d0 + day
        a, mm = ret[t].iloc[i], ret["SPY"].iloc[i]
        expct = b[1] + b[0] * mm
        car += a - expct
        ex.append({"day": day, "date": str(dates[i].date()), "actual_pct": float(a * 100),
                   "expected_pct": float(expct * 100), "ar_pct": float((a - expct) * 100), "car_pct": float(car * 100)})
    out["example_path"] = ex

    # 8. placebo distribution for the pre-window mean CAR (M2), and power
    used = [e for e in erows if e["used_in_models"]]
    valid = {}
    for tic in FIRMS:
        idxs = [dates.get_indexer([pd.Timestamp(e["day0"])])[0] for e in erows if e["ticker"] == tic]
        first = dates.get_loc(ret[tic].first_valid_index())
        cand = np.arange(max(first + 251, 260), len(dates) - 6)
        mask = np.ones(len(cand), bool)
        for j in idxs:
            mask &= np.abs(cand - j) > 20
        valid[tic] = cand[mask]
    pool = {}
    for tic in FIRMS:
        pick = rng.choice(valid[tic], size=min(500, len(valid[tic])), replace=False)
        pool[tic] = [x for x in (s4.event_series(ret, logv, tic, j) for j in pick) if x is not None]
    single_pre = np.array([p["M2 market model"][0][:10].sum() for tic in FIRMS for p in pool[tic]])
    single_d0 = np.array([p["M2 market model"][0][10] for tic in FIRMS for p in pool[tic]])
    draws = []
    for _ in range(4000):
        draws.append(np.mean([pool[e["ticker"]][rng.integers(len(pool[e["ticker"]]))]["M2 market model"][0][:10].sum()
                              for e in used]))
    draws = np.array(draws) * 100
    actual = float(np.mean([e["car_pre_pct"] for e in used]))
    edges = np.linspace(-4, 4, 33)
    hh, _ = np.histogram(np.clip(draws, -3.999, 3.999), bins=edges)
    out["placebo_hist"] = [{"lo": float(edges[i]), "hi": float(edges[i + 1]), "count": int(hh[i])} for i in range(len(hh))]
    out["placebo_meta"] = [{"actual_mean_car_pre_pct": actual, "draws": int(len(draws)),
                            "share_at_or_above": float((draws >= actual).mean() * 100),
                            "p_two_sided": float(min(1, 2 * min((draws >= actual).mean(), (draws <= actual).mean()))),
                            "n_events": len(used)}]
    # power: smallest true average CAR detectable with 80% power at 5% two-sided
    sd_pre, sd_d0 = single_pre.std() * 100, single_d0.std() * 100
    out["power"] = [{"n_events": n, "mde_pre_pct": float(2.80 * sd_pre / np.sqrt(n)),
                     "mde_day0_pct": float(2.80 * sd_d0 / np.sqrt(n))} for n in (5, 10, 14, 25, 50, 75, 100, 150, 200, 300, 400)]
    out["power_meta"] = [{"sd_single_car_pre_pct": float(sd_pre), "sd_single_day0_pct": float(sd_d0)}]

    # 9. how often big deals land: gaps between $500M+ USAspending actions (top 100 per firm)
    u = pd.read_csv(DATA / "usaspending_candidates_raw.csv", parse_dates=["Action Date"])
    u = u[u["Action Date"] >= "2018-01-01"]
    grows = []
    for tic in FIRMS:
        d = np.sort(dates.searchsorted(u[u.ticker == tic]["Action Date"].drop_duplicates()))
        g = np.diff(d)
        crowd = np.array([((np.abs(d - x) <= 10) & (d != x)).any() for x in d])
        grows.append({"ticker": tic, "action_days": int(len(d)), "median_gap_trading_days": float(np.median(g)),
                      "pct_with_another_within_10": float(crowd.mean() * 100),
                      "first": str(u[u.ticker == tic]["Action Date"].min().date()),
                      "last": str(u[u.ticker == tic]["Action Date"].max().date())})
    out["deal_crowding"] = grows
    u["year"] = u["Action Date"].dt.year
    out["deals_by_year"] = (u.groupby(["ticker", "year"]).size().rename("actions").reset_index().to_dict("records"))

    # 10. arms sale notices naming each firm, by year
    dsc = pd.read_csv(DATA / "dsca_candidates_fedreg.csv", parse_dates=["fr_publication_date"])
    dsc["year"] = dsc.fr_publication_date.dt.year
    out["dsca_by_year"] = (dsc.groupby(["ticker", "year"]).agg(notices=("transmittal", "count"),
                                                               median_value_m=("est_total_usd", lambda v: float(np.nanmedian(v) / 1e6)))
                           .reset_index().to_dict("records"))

    # 11. earnings proximity on ordinary days: share of random 16-day windows that contain an earnings day
    share = {}
    for tic in FIRMS:
        ei = earn[earn.ticker == tic].eday_idx.values
        c = valid[tic]
        share[tic] = float(np.mean([((ei - x >= -10) & (ei - x <= 5)).any() for x in c]) * 100)
    out["earnings_count"] = [{"ticker": k, "filings": int(v)} for k, v in earn.groupby("ticker").size().items()]
    out["earnings_base_rate"] = [{"ticker": k, "pct_windows_with_earnings": v} for k, v in share.items()]

    # 12. model summary from step 4
    out["model_summary"] = pd.read_csv(DATA / "step4_summary.csv").to_dict("records")

    def clean(o):
        if isinstance(o, float) and (np.isnan(o) or np.isinf(o)):
            return None
        if isinstance(o, (np.integer,)):
            return int(o)
        if isinstance(o, (np.floating,)):
            return float(o)
        if isinstance(o, (np.bool_,)):
            return bool(o)
        if isinstance(o, dict):
            return {k: clean(v) for k, v in o.items()}
        if isinstance(o, list):
            return [clean(v) for v in o]
        return o

    out = clean(out)
    (DATA / "exploration.json").write_text(json.dumps(out, separators=(",", ":")))
    print("wrote exploration.json", round((DATA / "exploration.json").stat().st_size / 1024), "KB")
    for k in ("stock_stats", "deal_crowding", "earnings_base_rate", "placebo_meta", "power_meta", "example_meta"):
        print(k); print(pd.DataFrame(out[k]).round(3).to_string(index=False))
    print(pd.DataFrame(out["events"])[["event_id", "announced_bn", "prior_fy_revenue_bn", "pct_of_revenue",
                                       "nearest_earnings_days", "earnings_in_window", "car_pre_pct", "ar_day0_pct",
                                       "abvol_day0"]].round(2).to_string(index=False))
    print(pd.DataFrame(out["power"]).round(2).to_string(index=False))


if __name__ == "__main__":
    main()
