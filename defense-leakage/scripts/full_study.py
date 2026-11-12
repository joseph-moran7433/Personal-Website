"""Full-sample event study (first full run, PRELIMINARY until Step 5 scoring is agreed).

Inputs (data/full/):
  usaspending_*.csv    every DoD contract transaction of $100M+ to a study firm, with competition
                       fields (full_usaspending.py). war.gov blocks scripted reads.
  (date = USAspending action date; value = obligated dollars, not the announced ceiling)
  dsca_notices.csv     Federal Register arms-sale notices naming a study firm (full_dsca.py)
  prices_daily.csv     yfinance (full_prices.py)
  edgar_*.csv          earnings 8-K dates and 10-K revenue (full_edgar.py)

Event rules (the refinements R1-R5 from the exploration page):
  - one event per firm per announcement day (same-day awards summed)
  - size = announced value / prior fiscal-year revenue; keep >= 1%  (R5); "large" >= 5%
  - day 0 = first trading day after the announcement (war.gov posts ~5 PM ET)
  - earnings screen: an earnings day in [-10, +5] flags the event; flagged events are left
    out of the main test and reported separately (R1)
  - same-firm events whose day 0s are <= 10 trading days apart are merged; the largest stays (R4)
  - RTX events start Apr 2020 (price history); LHX events start Jul 2019 (L3 + Harris merger)

Models: M1 market-adjusted, M2 market model (SPY), M3 SPY + ITA, M4 SPY + peer index
(equal-weight daily return of the big-four primes, own firm left out) (R2). Volume V2.
Estimation window -250..-41 trading days (kept clear of the -40..+10 event window), at least 120 days.
Tests: cross-sectional t, BMP, and placebo p-value from 2,000 random sets of ordinary days with
the same firm mix (R7). Earnings releases of all study firms are run the same way as a comparison (R8).

Run:  python full_study.py
"""
import json
import re
from pathlib import Path

import numpy as np
import pandas as pd

DATA = Path(__file__).resolve().parents[1] / "data" / "full"
BIG4 = ["LMT", "RTX", "NOC", "GD"]
MID = ["HII", "LHX", "LDOS", "BA", "TXT", "BAH", "KTOS"]
FIRMS = BIG4 + MID
EST0, EST1, ESTMIN = -250, -41, 120
DAYS = np.arange(-40, 11)
WIN = {"pre40_11": (-40, -11), "pre10": (-10, -1), "pre40": (-40, -1), "day0": (0, 0), "post5": (1, 5), "post6_10": (6, 10)}
MODELS = ["M1", "M2", "M3", "M4", "V2"]
N_PLACEBO = 2000
rng = np.random.default_rng(491)
MON = {m: i + 1 for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"])}
START = {"RTX": "2020-04-03", "LHX": "2019-07-01"}


def slug_date(s):
    m = re.search(r"contracts-for-([a-z]+)-(\d{1,2})-(20\d\d)", s)
    if not m:
        return None
    mo = MON.get(m.group(1)[:3])
    try:
        return pd.Timestamp(int(m.group(3)), mo, int(m.group(2)))
    except Exception:
        return None


def load_panel():
    px = pd.read_csv(DATA / "prices_daily.csv", parse_dates=["date"])
    ret = px.pivot(index="date", columns="ticker", values="Adj Close").pct_change()
    logv = np.log(px.pivot(index="date", columns="ticker", values="Volume").astype(float) + 1)
    peers = {}
    for t in FIRMS:
        others = [b for b in BIG4 if b != t]
        peers[t] = ret[others].mean(axis=1, skipna=True)
    return ret, logv, peers


def series(ret, logv, peers, t, d0):
    """Abnormal returns over DAYS for each model, plus each model's estimation-window sd."""
    n = len(ret)
    lo, hi = max(1, d0 + DAYS[0] + EST0 + 40), d0 + EST1
    lo = max(1, d0 + EST0)
    ev = d0 + DAYS
    if hi - lo < ESTMIN or ev[-1] >= n or ev[0] < 1:
        return None
    est = slice(lo, hi + 1)
    y, m, i, p = (s.iloc[est].values for s in (ret[t], ret["SPY"], ret["ITA"], peers[t]))
    ok = np.isfinite(y) & np.isfinite(m) & np.isfinite(i) & np.isfinite(p)
    if ok.sum() < ESTMIN:
        return None
    y, m, i, p = y[ok], m[ok], i[ok], p[ok]
    ye, me, ie, pe = (s.iloc[ev].values for s in (ret[t], ret["SPY"], ret["ITA"], peers[t]))
    out = {}
    out["M1"] = (ye - me, np.std(y - m, ddof=1))
    for name, X, Xe in [("M2", [m], [me]), ("M3", [m, i], [me, ie]), ("M4", [m, p], [me, pe])]:
        A = np.column_stack([np.ones_like(y)] + X)
        b, *_ = np.linalg.lstsq(A, y, rcond=None)
        r = y - A @ b
        out[name] = (ye - np.column_stack([np.ones_like(ye)] + Xe) @ b, np.sqrt(r @ r / (len(y) - A.shape[1])))
    lv = logv[t].iloc[est].values[ok]
    ls = logv["SPY"].iloc[est].values[ok]
    dv = (lv - lv.mean()) - (ls - ls.mean())
    av = (logv[t].iloc[ev].values - lv.mean()) - (logv["SPY"].iloc[ev].values - ls.mean())
    out["V2"] = (av, np.std(dv, ddof=1))
    return out


def wsum(ar, w):
    a, b = WIN[w]
    return ar[(DAYS >= a) & (DAYS <= b)].sum()


def stats(items, model):
    res = {}
    for w, (a, b) in WIN.items():
        L = b - a + 1
        car = np.array([wsum(s[model][0], w) for s in items])
        sc = np.array([wsum(s[model][0], w) / (s[model][1] * np.sqrt(L)) for s in items])
        n = len(car)
        res[w] = dict(mean=car.mean(), cs_t=car.mean() / (car.std(ddof=1) / np.sqrt(n)) if n > 2 else np.nan,
                      bmp_t=sc.mean() / (sc.std(ddof=1) / np.sqrt(n)) if n > 2 else np.nan,
                      pos=(car > 0).mean(), n=n)
    return res


def main():
    ret, logv, peers = load_panel()
    dates = ret.index
    tday = lambda d: dates.searchsorted(pd.Timestamp(d), side="right")  # first trading day after d
    rev = pd.read_csv(DATA / "edgar_revenue.csv")
    earn = pd.read_csv(DATA / "edgar_earnings_8k.csv")
    acc = pd.to_datetime(earn.acceptanceDateTime.str[:19])
    ed = pd.to_datetime(earn.filingDate)
    ed = ed.where(acc.dt.hour < 16, ed + pd.Timedelta(days=1))
    earn["d0"] = dates.searchsorted(ed)
    E = {t: np.sort(earn[earn.ticker == t].d0.values) for t in FIRMS}

    def prior_rev(t, year):
        r = rev[(rev.ticker == t) & (rev.fy <= year - 1)].sort_values("fy")
        return float(r.revenue.iloc[-1]) if len(r) else np.nan

    # ---------- contract events (USAspending; war.gov blocks scripted reads) ----------
    tx = pd.read_csv(DATA / "usaspending_transactions.csv")
    awd = pd.read_csv(DATA / "usaspending_awards.csv")
    tx = tx.merge(awd, on="generated_internal_id", how="left")
    tx["announce"] = pd.to_datetime(tx["Action Date"])
    tx = tx.rename(columns={"ticker": "tic", "Transaction Amount": "amt"})
    for t, s in START.items():
        tx = tx[~((tx.tic == t) & (tx.announce < s))]
    COMP = {"A", "D", "F", "CDO"}  # full and open, after exclusion, simplified competition, competitive delivery order
    tx["comp"] = tx.extent_competed.isin(COMP)
    tx["sole"] = tx.extent_competed.isin({"B", "C", "G", "NDO", "E"})
    tx["mod"] = tx["Mod"].astype(str).str.strip().ne("0")
    g = tx.groupby(["tic", "announce"])
    con = g.agg(amount=("amt", "sum"), n_awards=("amt", "size"), any_comp=("comp", "max"), any_sole=("sole", "max"),
                all_mod=("mod", "min"), url=("generated_internal_id", "first")).reset_index()
    top = tx.sort_values("amt").groupby(["tic", "announce"]).last()
    top = top.assign(text=top["Transaction Description"].astype(str).str.slice(0, 300), offers=top.number_of_offers_received,
                     cn=top["Award ID"])[["text", "offers", "cn"]].reset_index()
    con = con.merge(top, on=["tic", "announce"])
    con["url"] = "https://www.usaspending.gov/award/" + con.url.astype(str)
    con["event_type"] = "contract"

    # ---------- arms-sale events ----------
    ds = pd.read_csv(DATA / "dsca_notices.csv").dropna(subset=["delivered_to_congress", "est_total_usd"])
    ds["announce"] = pd.to_datetime(ds.delivered_to_congress)
    for t, s in START.items():
        ds = ds[~((ds.ticker == t) & (ds.announce < s))]
    ds = ds[ds.announce >= "2018-01-01"]
    arms = ds.groupby(["ticker", "announce"]).agg(amount=("est_total_usd", "sum"), n_awards=("transmittal", "size"),
                                                  text=("country", lambda c: "Arms sale: " + "; ".join(sorted(set(map(str, c))))),
                                                  url=("fr_url", "first"), n_firms=("n_firms_named", "max")).reset_index()
    arms = arms.rename(columns={"ticker": "tic"})
    arms["event_type"] = "arms sale"
    ev = pd.concat([con, arms], ignore_index=True)
    ev["prior_rev"] = [prior_rev(t, d.year) for t, d in zip(ev.tic, ev.announce)]
    ev["pct_rev"] = ev.amount / ev.prior_rev * 100
    ev["d0"] = [tday(d) for d in ev.announce]
    ev = ev[ev.d0 < len(dates) - 11]
    ev["day0"] = dates[ev.d0].date
    ev["competitive"] = ev.get("any_comp", False).fillna(False).astype(bool) & ~ev.get("any_sole", False).fillna(False).astype(bool)
    offers_n = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10}
    ev["offers_n"] = ev.offers.map(lambda o: np.nan if pd.isna(o) else offers_n.get(str(o).lower(), pd.to_numeric(o, errors="coerce")))
    stage = {"candidates_100m": len(ev)}
    ev = ev[ev.pct_rev >= 1].copy()
    stage["size_ge_1pct"] = len(ev)
    ev["earnings_near"] = [bool(((E[t] - d >= -10) & (E[t] - d <= 5)).any()) for t, d in zip(ev.tic, ev.d0)]
    # merge same-firm clusters (any type) <= 10 trading days apart; keep the largest by pct_rev
    ev = ev.sort_values(["tic", "d0"])
    ev["cluster"] = (ev.groupby("tic").d0.diff().fillna(999) > 10).cumsum()
    ev["cluster_size"] = ev.groupby("cluster").d0.transform("size")
    kept = ev.sort_values("pct_rev").groupby("cluster").tail(1).sort_values(["announce", "tic"])
    stage["after_merging_clusters"] = len(kept)
    stage["earnings_flagged"] = int(kept.earnings_near.sum())

    # ---------- compute series ----------
    def attach(df):
        S = [series(ret, logv, peers, t, d) for t, d in zip(df.tic, df.d0)]
        df = df.assign(_s=S)
        return df[df._s.notna()].copy()
    kept = attach(kept)
    stage["usable_with_price_history"] = len(kept)
    kept["large"] = kept.pct_rev >= 5
    kept["group_firm"] = np.where(kept.tic.isin(BIG4), "big four", "mid-cap")
    earn_ev = earn.assign(tic=earn.ticker)[["tic", "d0", "filingDate"]].copy()
    earn_ev = earn_ev[(earn_ev.d0 > 300) & (earn_ev.d0 < len(dates) - 11)]
    for t, s in START.items():
        earn_ev = earn_ev[~((earn_ev.tic == t) & (dates[earn_ev.d0.clip(upper=len(dates) - 1)] < s))]
    earn_ev = attach(earn_ev)

    # ---------- placebo pools: ordinary days, same firm and same calendar year ----------
    # A pseudo-event day passes the same screen as a real event: no earnings release in its
    # days -10..+5, and at least 10 trading days from any kept event of that firm. Matching on
    # firm, year and quarter-end month removes the drift that differs across firms and periods (a first version
    # that pooled all years, and excluded every $100M+ candidate, gave off-center bands).
    pool = {}
    yr_of = np.array([d.year for d in dates])
    qe_of = np.array([d.month % 3 == 0 for d in dates])  # last month of a quarter (Mar/Jun/Sep/Dec)
    for t in FIRMS:
        first = dates.get_loc(ret[t].first_valid_index())
        lo = max(first + 260, dates.searchsorted(pd.Timestamp(START.get(t, "2018-01-01"))))
        cand = np.arange(lo, len(dates) - 11)
        if len(E[t]):
            dd = E[t][None, :] - cand[:, None]
            cand = cand[~((dd >= -10) & (dd <= 5)).any(axis=1)]
        k = kept[kept.tic == t].d0.values
        if len(k):
            cand = cand[np.min(np.abs(cand[:, None] - k[None, :]), axis=1) > 10]
        for y in np.unique(yr_of[cand]):
            for q in (False, True):
                cy = cand[(yr_of[cand] == y) & (qe_of[cand] == q)]
                if len(cy) < 5:
                    continue
                pick = rng.choice(cy, size=min(40, len(cy)), replace=False)
                pool[(t, int(y), q)] = [s for s in (series(ret, logv, peers, t, int(j)) for j in pick) if s is not None]
    print("placebo pools:", len(pool), "firm-years,", sum(len(v) for v in pool.values()), "ordinary days")

    def placebo(tics, years, model, w, qends):
        keys = list(zip(tics, years, qends))
        tot = np.zeros(N_PLACEBO)
        for key in set(keys):
            pl = pool.get(key) or pool.get(min((k for k in pool if k[0] == key[0] and k[2] == key[2]), key=lambda k: abs(k[1] - key[1])))
            vals = np.array([wsum(s[model][0], w) for s in pl])
            cnt = keys.count(key)
            tot += vals[rng.integers(len(vals), size=(N_PLACEBO, cnt))].sum(axis=1)
        return tot / len(keys)

    groups = {
        "Main: clean events (no earnings nearby)": kept[~kept.earnings_near],
        "Contracts, clean": kept[~kept.earnings_near & (kept.event_type == "contract")],
        "Arms sales, clean": kept[~kept.earnings_near & (kept.event_type == "arms sale")],
        "Large (5%+ of revenue), clean": kept[~kept.earnings_near & kept.large],
        "Competitive contracts, clean": kept[~kept.earnings_near & (kept.event_type == "contract") & kept.competitive],
        "Big four, clean": kept[~kept.earnings_near & (kept.group_firm == "big four")],
        "Mid-caps, clean": kept[~kept.earnings_near & (kept.group_firm == "mid-cap")],
        "Flagged: earnings nearby": kept[kept.earnings_near],
        "Comparison: earnings releases": earn_ev,
    }
    rows, paths = [], []
    for gname, df in groups.items():
        items = list(df._s)
        if len(items) < 3:
            continue
        tics = df.tic.values
        years = [dates[d].year for d in df.d0.values]
        qends = [dates[d].month % 3 == 0 for d in df.d0.values]
        for model in MODELS:
            st = stats(items, model)
            for w in WIN:
                d = placebo(tics, years, model, w, qends)
                mval = st[w]["mean"]
                p = min(1.0, 2 * min((d >= mval).mean(), (d <= mval).mean()))
                rows.append(dict(group=gname, model=model, window=w, n=st[w]["n"], mean=mval, cs_t=st[w]["cs_t"], bmp_t=st[w]["bmp_t"],
                                 share_pos=st[w]["pos"], placebo_p=p, placebo_lo=np.percentile(d, 5), placebo_hi=np.percentile(d, 95)))
        for model in ["M4", "V2"]:
            cum = np.mean([np.cumsum(s[model][0][DAYS >= -10]) for s in items], axis=0)
            absar = np.mean([np.abs(s[model][0][DAYS >= -10]) for s in items], axis=0)
            for j, day in enumerate(DAYS[DAYS >= -10]):
                paths.append(dict(group=gname, model=model, day=int(day), mean_cum=float(cum[j]), mean_abs=float(absar[j])))
        # anomalous days (|AR| > 2 sd, M4) in -10..-1 and day 0
        z = np.array([s["M4"][0] / s["M4"][1] for s in items])
        rows.append(dict(group=gname, model="M4", window="anomalous_pre10_pct", n=len(items),
                         mean=float((np.abs(z[:, (DAYS >= -10) & (DAYS <= -1)]) > 2).mean() * 100)))
        rows.append(dict(group=gname, model="M4", window="anomalous_day0_pct", n=len(items),
                         mean=float((np.abs(z[:, DAYS == 0]) > 2).mean() * 100)))
    # random ordinary days anomaly baseline
    allpool = [s for v in pool.values() for s in v]
    z = np.array([s["M4"][0] / s["M4"][1] for s in allpool])
    rows.append(dict(group="Baseline: ordinary days", model="M4", window="anomalous_pre10_pct", n=len(allpool),
                     mean=float((np.abs(z[:, (DAYS >= -10) & (DAYS <= -1)]) > 2).mean() * 100)))
    rows.append(dict(group="Baseline: ordinary days", model="M4", window="anomalous_day0_pct", n=len(allpool),
                     mean=float((np.abs(z[:, DAYS == 0]) > 2).mean() * 100)))
    res = pd.DataFrame(rows)

    # ---------- event-level output ----------
    for model in ["M2", "M4"]:
        for w in WIN:
            kept[f"{model}_{w}_pct"] = [wsum(s[model][0], w) * 100 for s in kept._s]
    kept["V2_day0"] = [wsum(s["V2"][0], "day0") for s in kept._s]
    out_ev = kept.drop(columns=["_s"]).copy()
    out_ev["announce"] = out_ev.announce.dt.date
    out_ev.to_csv(DATA / "events_full.csv", index=False)
    res.to_csv(DATA / "results_full.csv", index=False)
    pd.DataFrame(paths).to_csv(DATA / "paths_full.csv", index=False)

    comp = kept[kept.event_type == "contract"]
    funnel = dict(stage, contract_events=int((kept.event_type == "contract").sum()), arms_events=int((kept.event_type == "arms sale").sum()),
                  competitive_contracts=int(comp.competitive.sum()), competitive_with_offers=int(comp.offers_n.notna().sum()),
                  offers_median=float(comp.offers_n.median()) if comp.offers_n.notna().any() else None,
                  earnings_comparison_events=len(earn_ev))
    (DATA / "funnel.json").write_text(json.dumps(funnel, indent=1))
    print(json.dumps(funnel, indent=1))

    show = res[res.model.isin(["M2", "M4", "V2"]) & res.window.isin(["pre10", "pre40", "day0", "post5"])]
    sc = np.where(show.model == "V2", 1, 100)
    show = show.assign(mean=show["mean"] * sc, placebo_lo=show.placebo_lo * sc, placebo_hi=show.placebo_hi * sc)
    with pd.option_context("display.width", 250, "display.max_rows", 400):
        print(show.round(3).to_string(index=False))
        print(res[res.window.str.startswith("anomalous")].round(2).to_string(index=False))


if __name__ == "__main__":
    main()
