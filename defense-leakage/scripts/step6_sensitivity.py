"""Step 6: sensitivity. How much do the inputs, the data and the Step 1 assumptions move the verdict?

The verdict being stress-tested (Steps 4-5): no pre-announcement run-up on average, at any one firm,
or in a small group of deals (model M4, days -10..-1, clean deals).

Every variation changes ONE thing from the main run and re-runs the same tests with the same
calibration (null = ordinary days of the same firm and quarter-end status):
  Average     pooled Stouffer z (one-sided up; the down side is also reported)
  Firm        max over firms of the firm's Stouffer z, judged against the max on ordinary days
  Outlier up  deals above their firm's 95th percentile vs 5% chance (binomial)
  Outlier dn  deals below their firm's 5th percentile vs 5% chance (the "drift down" finding)
  Extreme p   higher criticism on the one-sided p-values
  Leak share  two-group mixture likelihood ratio

Also writes the data behind the redone Step 5 figures (deal paths, chance bands, firm detail).

Run: python step6_sensitivity.py      (about 15-25 min)
Outputs: data/full/step6_*.csv, step6_summary.json, step6_log.txt (stdout)
"""
import json
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import binom, t as t_dist

sys.path.insert(0, str(Path(__file__).resolve().parent))
import full_study as fs  # noqa: E402
import step45_models as sm  # noqa: E402

DATA = Path(__file__).resolve().parents[1] / "data" / "full"
fs.WIN.update({"pre3": (-3, -1), "pre5": (-5, -1), "pre20": (-20, -1)})
WINS = ["pre10", "pre3", "pre5", "pre20", "pre40", "pre40_11", "day0"]
MODELS = ["M1", "M2", "M3", "M4", "V2"]
S_SIM = 1000
rng = np.random.default_rng(20261123)
TESTS = ["avg", "firm", "out_up", "out_dn", "hc", "mix"]


def build_nulls(pool, by_qe=True):
    groups = {}
    for (t, y, q), items in pool.items():
        groups.setdefault((t, q if by_qe else None), []).extend(items)
    nulls = {}
    for g, items in groups.items():
        for m in MODELS:
            for w in WINS:
                xs = np.array([sm.item_xs(s, m, w) for s in items])
                nulls[(g, m, w)] = dict(x=xs[:, 0], sd=xs[:, 1], xs_sorted=np.sort(xs[:, 0]),
                                        mu=xs[:, 0].mean(), sdx=xs[:, 0].std(ddof=1))
    return nulls


_det_cache = {}


def detector(nulls, m, w, tag):
    k = (tag, m, w)
    if k not in _det_cache:
        zn = np.concatenate([(nb["x"] - nb["mu"]) / nb["sdx"] for (g, mm, ww), nb in nulls.items() if mm == m and ww == w])
        _det_cache[k] = sm.Detector(zn)
        rob = sm.Detector(zn)
        # tail-safe version: 2% of the null density is a Student-t(3), so one deal far outside the
        # ordinary-day range (e.g. the March 2020 crash) cannot by itself drive the likelihood ratio
        rob.dens = 0.98 * rob.dens + 0.02 * t_dist.pdf(rob.grid, 3) * zn.std()
        _det_cache[k + ("robust",)] = rob
    return _det_cache[k]


def evaluate(ev, nulls, m="M4", w="pre10", by_qe=True, tag="base", S=S_SIM, return_event=False):
    """Run the six tests on the deals in ev. Returns a dict of statistics and p-values."""
    n = len(ev)
    keys = [(t, q if by_qe else None) for t, q in zip(ev.tic, ev.qe)]
    firms = sorted(set(ev.tic))
    fidx = ev.tic.map({f: i for i, f in enumerate(firms)}).values
    nF = len(firms)
    det = detector(nulls, m, w, tag)
    gsets = {g: np.array([k == g for k in keys]) for g in set(keys)}

    def to_ZP(X):
        Z, P, Pl = np.zeros_like(X), np.zeros_like(X), np.zeros_like(X)
        for g, cols in gsets.items():
            nb = nulls[(g, m, w)]
            Z[:, cols] = (X[:, cols] - nb["mu"]) / nb["sdx"]
            P[:, cols] = sm.upper_p(X[:, cols], nb["xs_sorted"])
            Pl[:, cols] = sm.lower_p(X[:, cols], nb["xs_sorted"])
        return Z, P, Pl

    Xn = np.zeros((S, n))
    for g, cols in gsets.items():
        nb = nulls[(g, m, w)]
        Xn[:, cols] = nb["x"][rng.integers(len(nb["x"]), size=(S, cols.sum()))]
    Zn, Pn, Pln = to_ZP(Xn)
    sn = det.stats(Zn, Pn, fidx, nF)
    x = np.array([sm.item_xs(s, m, w)[0] for s in ev._s])
    Z, P, Pl = to_ZP(x[None, :])
    s = det.stats(Z, P, fidx, nF)
    pu = lambda t: float((1 + (sn[t] >= s[t][0]).sum()) / (1 + S))
    out = dict(n=n, n_firms=nF, model=m, window=w)
    out["avg_z"] = float(s["T1"][0])
    out["avg_p"] = pu("T1")
    out["avg_p_down"] = float((1 + (sn["T1"] <= s["T1"][0]).sum()) / (1 + S))
    out["firm_top"] = firms[int(np.argmax(s["_firmz"][0]))]
    out["firm_z"] = float(s["T2"][0])
    out["firm_p"] = pu("T2")
    out["out_up"] = int((P[0] < 0.05).sum())
    out["out_dn"] = int((Pl[0] < 0.05).sum())
    out["expected"] = 0.05 * n
    out["out_up_p"] = float(binom.sf(out["out_up"] - 1, n, 0.05))
    out["out_dn_p"] = float(binom.sf(out["out_dn"] - 1, n, 0.05))
    out["hc_p"] = pu("T4")
    out["mix_pi"] = float(s["_pi"][0])
    out["mix_p"] = pu("T5")
    rob = _det_cache[(tag, m, w, "robust")]
    lr_n, _, _ = rob.mixture(Zn)
    lr_r, pi_r, _ = rob.mixture(Z)
    out["mix_robust_pi"] = float(pi_r[0])
    out["mix_robust_p"] = float((1 + (lr_n >= lr_r[0]).sum()) / (1 + S))
    cars = np.array([fs.wsum(sv[m][0], w) for sv in ev._s])
    out["mean_car_pct"] = float(cars.mean() * (1 if m == "V2" else 100))
    if return_event:
        return out, dict(Z=Z[0], P=P[0], Pl=Pl[0], cars=cars, null_T1=sn["T1"], null_firmz=sn["_firmz"], firms=firms,
                         real_firmz=s["_firmz"][0])
    return out


def prep(st):
    kept, dates = st["kept"], st["dates"]
    kept = kept.copy()
    kept["qe"] = [dates[d].month % 3 == 0 for d in kept.d0]
    kept["year"] = [dates[d].year for d in kept.d0]
    kept["month"] = [dates[d].month for d in kept.d0]
    return kept


def main():
    t0 = time.time()
    ret, logv, peers = fs.load_panel()
    st = fs.main(return_state=True)
    kept, pool, dates = prep(st), st["pool"], st["dates"]
    E = st["E"]
    ev = kept[~kept.earnings_near].reset_index(drop=True)
    print("clean deals", len(ev))
    nulls = build_nulls(pool)
    rows = []

    def add(group, name, changes, sub, **kw):
        if len(sub) < 15:
            print("skip", name, len(sub))
            return
        r = evaluate(sub.reset_index(drop=True), kw.pop("nulls", nulls), **kw)
        r.update(group=group, variation=name, changes=changes)
        rows.append(r)
        print(f"{time.time()-t0:6.0f}s {group:22s} {name:34s} n={r['n']:3d} avg p={r['avg_p']:.3f} firm p={r['firm_p']:.3f} "
              f"up {r['out_up']}/{r['expected']:.1f} p={r['out_up_p']:.3f} dn {r['out_dn']} p={r['out_dn_p']:.3f} "
              f"hc p={r['hc_p']:.3f} mix p={r['mix_p']:.3f} robust {r['mix_robust_p']:.3f}", flush=True)

    add("Main run", "Main: M4, days -10 to -1", "-", ev)
    # ---- normal-return model
    for m, lab in [("M1", "M1 market-adjusted"), ("M2", "M2 market model"), ("M3", "M3 + ITA"), ("V2", "V2 volume")]:
        add("Normal-return model", lab, f"model {m}", ev, m=m)
    # ---- window (A5)
    for w, lab in [("pre3", "Days -3 to -1"), ("pre5", "Days -5 to -1"), ("pre20", "Days -20 to -1"),
                   ("pre40", "Days -40 to -1"), ("pre40_11", "Days -40 to -11")]:
        add("Window (A5)", lab, f"window {w}", ev, w=w)
    # ---- date (A1/A2): USAspending action date vs public post; shift contract day 0
    con = ev.event_type.values == "contract"
    for k in [-2, -1, 1, 2, 3, 5]:
        sub = ev.copy()
        S_new = [fs.series(ret, logv, peers, t, int(d + k)) if c else s for t, d, c, s in zip(sub.tic, sub.d0, con, sub._s)]
        sub["_s"] = S_new
        # re-apply the earnings screen around the shifted day 0 (otherwise earnings slide into the window)
        dd = sub.d0 + np.where(con, k, 0)
        clash = np.array([bool(((E[t] - d >= -10) & (E[t] - d <= 5)).any()) for t, d in zip(sub.tic, dd)])
        sub = sub[sub._s.notna() & ~clash]
        add("Date (A1/A2)", f"Contract day 0 shifted {k:+d} trading days", f"shift {k}", sub)
    # ---- was it public (A1): base awards vs modifications
    add("Announced? (A1)", "Contracts: new awards only", "no modifications", ev[con & ~ev.all_mod.fillna(True).astype(bool)])
    add("Announced? (A1)", "Contracts: modifications only", "modifications", ev[con & ev.all_mod.fillna(True).astype(bool)])
    add("Announced? (A1)", "Contracts only", "contracts", ev[con])
    add("Announced? (A1)", "Arms sales only", "arms sales", ev[~con])
    # ---- size (A3, A8)
    for c in [2, 5]:
        add("Size cut-off (A3)", f"Deals >= {c}% of revenue", f"size>={c}", ev[ev.pct_rev >= c])
    add("Size cut-off (A3)", "Deals 1-2% of revenue", "size 1-2", ev[ev.pct_rev < 2])
    # ---- surprise (A9)
    add("Surprise (A9)", "Competitive contracts", "competitive", ev[con & ev.competitive])
    add("Surprise (A9)", "Sole-source / follow-on contracts", "sole/follow-on", ev[con & ~ev.competitive])
    # ---- period
    add("Period", "2010-2017", "years<=2017", ev[ev.year <= 2017])
    add("Period", "2018-2026", "years>=2018", ev[ev.year >= 2018])
    crash = (ev.year == 2020) & ev.month.isin([2, 3, 4])
    add("Period", "Drop Feb-Apr 2020 (COVID crash)", "drop crash", ev[~crash])
    elect = (ev.year == 2016) & ev.month.isin([11, 12])
    add("Period", "Drop crash + Nov-Dec 2016 rally", "drop crash+election", ev[~crash & ~elect])
    # ---- independence (A7): no other kept deal of the same firm within 40 trading days, cluster of 1
    iso = []
    for i, r in ev.iterrows():
        others = kept[(kept.tic == r.tic) & (kept.d0 != r.d0)].d0.values
        iso.append(r.cluster_size == 1 and (len(others) == 0 or np.min(np.abs(others - r.d0)) > 40))
    iso = np.array(iso)
    add("Independence (A7)", "Isolated deals only (no other deal +-40 days)", "isolated", ev[iso])
    # ---- earnings screen (A6)
    wide = np.array([bool(((E[t] - d >= -20) & (E[t] - d <= 5)).any()) for t, d in zip(ev.tic, ev.d0)])
    add("Earnings screen (A6)", "Wider screen: no earnings in -20..+5", "screen -20..+5", ev[~wide])
    add("Earnings screen (A6)", "No screen (earnings deals put back)", "no screen", kept.reset_index(drop=True))
    # ---- calibration
    nulls_f = build_nulls(pool, by_qe=False)
    add("Calibration", "Ordinary days matched on firm only", "no quarter-end match", ev, nulls=nulls_f, by_qe=False, tag="firmonly")
    add("Calibration", "5,000 simulated studies (vs 1,000)", "S=5000", ev, S=5000)
    # ---- drop one firm
    for f in sorted(set(ev.tic)):
        add("Drop one firm", f"Without {f}", f"drop {f}", ev[ev.tic != f])
    pd.DataFrame(rows).to_csv(DATA / "step6_grid.csv", index=False)

    # ---- inputs that rebuild the sample: size >= 0.5%, estimation window
    def rerun(name, group, changes, **setattrs):
        old = {k: getattr(fs, k) for k in setattrs}
        for k, v in setattrs.items():
            setattr(fs, k, v)
        try:
            st2 = fs.main(return_state=True)
            k2 = prep(st2)
            e2 = k2[~k2.earnings_near].reset_index(drop=True)
            nl = build_nulls(st2["pool"])
            add(group, name, changes, e2, nulls=nl, tag=changes)
        finally:
            for k, v in old.items():
                setattr(fs, k, v)
    rerun("Deals >= 0.5% of revenue (rebuilt)", "Size cut-off (A3)", "size>=0.5", PCT_MIN=0.5)
    rerun("Estimation days -160 to -41", "Estimation window", "est -160", EST0=-160, ESTMIN=100)
    rerun("Estimation days -500 to -41", "Estimation window", "est -500", EST0=-500)
    grid = pd.DataFrame(rows)
    grid.to_csv(DATA / "step6_grid.csv", index=False)

    # ================================================================ drift-down: where are the lower-tail deals?
    _, det_ev = evaluate(ev, nulls, return_event=True)
    ev2 = ev.drop(columns=["_s"]).assign(car_pct=det_ev["cars"] * 100, z=det_ev["Z"], p_up=det_ev["P"], p_down=det_ev["Pl"])
    ev2["mod"] = ev2.all_mod.fillna(False).astype(bool) & (ev2.event_type == "contract")
    ev2["fy_end"] = ev2.month == 9
    ev2["low"], ev2["high"] = ev2.p_down < 0.05, ev2.p_up < 0.05
    by = []
    for col, labs in [("event_type", None), ("mod", None), ("fy_end", None), ("qe", None), ("group_firm", None), ("tic", None)]:
        for v, g in ev2.groupby(col):
            by.append(dict(split=col, value=str(v), n=len(g), low=int(g.low.sum()), high=int(g.high.sum()),
                           expected=0.05 * len(g), low_p=float(binom.sf(g.low.sum() - 1, len(g), 0.05)),
                           mean_car_pct=float(g.car_pct.mean())))
    for y0, y1 in [(2010, 2013), (2014, 2017), (2018, 2021), (2022, 2026)]:
        g = ev2[(ev2.year >= y0) & (ev2.year <= y1)]
        by.append(dict(split="years", value=f"{y0}-{y1}", n=len(g), low=int(g.low.sum()), high=int(g.high.sum()),
                       expected=0.05 * len(g), low_p=float(binom.sf(g.low.sum() - 1, len(g), 0.05)), mean_car_pct=float(g.car_pct.mean())))
    pd.DataFrame(by).to_csv(DATA / "step6_drift_down.csv", index=False)
    ev2.to_csv(DATA / "step6_deals.csv", index=False)

    # ================================================================ Textron across the variations
    tx = []
    for m in ["M2", "M3", "M4"]:
        for w in ["day0", "pre10"]:
            for name, sub in [("all", ev), ("no 2011", ev[ev.year != 2011]), ("2018+", ev[ev.year >= 2018])]:
                r, d = evaluate(sub.reset_index(drop=True), nulls, m=m, w=w, return_event=True)
                fi = d["firms"].index("TXT")
                z = d["real_firmz"][fi]
                tx.append(dict(model=m, window=w, sample=name, txt_z=float(z),
                               txt_p_up=float((1 + (d["null_firmz"][:, fi] >= z).sum()) / (1 + S_SIM)),
                               txt_p_down=float((1 + (d["null_firmz"][:, fi] <= z).sum()) / (1 + S_SIM)), max_firm_p=r["firm_p"], top=r["firm_top"]))
    for w in ["pre10", "day0"]:
        for name, sub in [("all", ev), ("no 2011", ev[ev.year != 2011])]:
            r, d = evaluate(sub.reset_index(drop=True), nulls, m="V2", w=w, return_event=True)
            fi = d["firms"].index("TXT")
            z = d["real_firmz"][fi]
            tx.append(dict(model="V2", window=w, sample=name, txt_z=float(z),
                           txt_p_up=float((1 + (d["null_firmz"][:, fi] >= z).sum()) / (1 + S_SIM)),
                           txt_p_down=float((1 + (d["null_firmz"][:, fi] <= z).sum()) / (1 + S_SIM)), max_firm_p=r["firm_p"], top=r["firm_top"]))
    pd.DataFrame(tx).to_csv(DATA / "step6_textron.csv", index=False)

    # ================================================================ figure data for the redone Step 5 charts
    DAYS = fs.DAYS
    keep = (DAYS >= -10) & (DAYS <= 10)
    pr = []
    for i, r in ev.iterrows():
        raw = ret[r.tic].values[r.d0 + DAYS]
        ar = r._s["M4"][0]
        for d, a, b in zip(DAYS[keep], ar[keep], raw[keep]):
            pr.append(dict(i=i, tic=r.tic, day0=r.day0, day=int(d), ar=a, raw=b))
    pr = pd.DataFrame(pr)
    pr.to_csv(DATA / "step6_deal_paths.csv", index=False)
    # chance band for the AVERAGE cumulative path: 2,000 sets of ordinary days, same firm x quarter-end mix
    groups = {}
    for (t, y, q), items in pool.items():
        groups.setdefault((t, q), []).extend(items)
    keys = list(zip(ev.tic, ev.qe))
    B = 2000
    tot = np.zeros((B, keep.sum()))
    for g in set(keys):
        cnt = keys.count(g)
        arr = np.array([np.cumsum(s["M4"][0][keep]) for s in groups[g]])
        tot += arr[rng.integers(len(arr), size=(B, cnt))].sum(axis=1)
    tot /= len(keys)
    band = pd.DataFrame(dict(day=DAYS[keep], lo=np.quantile(tot, 0.025, axis=0), hi=np.quantile(tot, 0.975, axis=0),
                             lo90=np.quantile(tot, 0.05, axis=0), hi90=np.quantile(tot, 0.95, axis=0)))
    band.to_csv(DATA / "step6_mean_band.csv", index=False)
    # firm detail: each firm's ordinary-day 10-day CAR quantiles (M4)
    fd = []
    for f in sorted(set(ev.tic)):
        c = np.concatenate([[fs.wsum(s["M4"][0], "pre10") for s in groups[(f, q)]] for q in (False, True) if (f, q) in groups])
        fd.append(dict(tic=f, n_ord=len(c), q05=np.quantile(c, .05), q25=np.quantile(c, .25), q50=np.quantile(c, .5),
                       q75=np.quantile(c, .75), q95=np.quantile(c, .95)))
    pd.DataFrame(fd).to_csv(DATA / "step6_firm_ordinary.csv", index=False)

    # ================================================================ summary
    head = grid[grid.variation != "Main: M4, days -10 to -1"]
    price = head[head.model != "V2"]
    summ = dict(
        n_variations=len(grid),
        any_up_flag_005=int(((grid[["avg_p", "firm_p", "mix_p"]] < 0.05).any(axis=1)).sum()),
        up_flags=grid[(grid[["avg_p", "firm_p", "mix_p", "out_up_p", "hc_p"]] < 0.05).any(axis=1)][["variation", "avg_p", "firm_p", "out_up_p", "hc_p", "mix_p"]].to_dict("records"),
        down_flags=int((price.out_dn_p < 0.05).sum()), n_price_variations=len(price),
        minutes=(time.time() - t0) / 60)
    (DATA / "step6_summary.json").write_text(json.dumps(summ, indent=1, default=str))
    with pd.option_context("display.width", 260, "display.max_rows", 200, "display.max_columns", 30):
        print(grid[["group", "variation", "n", "mean_car_pct", "avg_p", "avg_p_down", "firm_top", "firm_p", "out_up", "expected",
                    "out_up_p", "out_dn", "out_dn_p", "hc_p", "mix_pi", "mix_p"]].round(3).to_string(index=False))
        print(pd.DataFrame(by).round(3).to_string(index=False))
        print(pd.DataFrame(tx).round(3).to_string(index=False))
    print(json.dumps(summ, indent=1, default=str))


if __name__ == "__main__":
    main()
