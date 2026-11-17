"""Step 4 (final candidate models) and Step 5 (scoring) on the full sample.

Built to answer three instructor notes:
  1. "The mean might wash out the few where there is unexplainable trading."
     -> besides the pooled mean, every event gets its own p-value against its own firm's ordinary
        days, and three tests look at the tail of those p-values instead of the average.
  2. "It could happen for particular companies and not all companies."
     -> every firm is tested on its own, with a max-over-firms test that controls for testing 11 firms,
        and a shrinkage estimate of each firm's effect.
  3. "Break out the models."
     -> two layers, kept separate: the NORMAL-RETURN model (M1-M4, V2) says what a day should have
        looked like; the DETECTION model (T1-T5) says how the abnormal moves are added up into a verdict.

Detection models (all one-sided: leakage of a win = abnormal moves UP before day 0):
  T1 pooled mean       average standardized CAR over all events (the old test)
  T2 firm by firm      each firm's own average; verdict = the largest firm z, judged against the
                       largest firm z on ordinary days (so testing 11 firms is paid for)
  T3 tail count        how many events beat their firm's own 95th percentile (expect 5%)
  T4 higher criticism  Donoho-Jin test built for "a few events carry a signal, the rest are null"
  T5 two-group mixture each event is either ordinary or shifted up by mu; fits the share pi and mu
                       by maximum likelihood; verdict = likelihood ratio vs pi = 0

Every test's 5% cut-off comes from 2,000 simulated studies built only from ordinary days with the
real firm and quarter-end mix (no normality assumed). Scoring = plant run-ups into ordinary days
and count how often each test catches them.

Inputs: same as full_study.py (events, placebo pools). Run: python step45_models.py
Outputs: data/full/step45_*.csv, step45_summary.json, assets/defense-leakage/step5_*.png
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import gaussian_kde, binom

sys.path.insert(0, str(Path(__file__).resolve().parent))
import full_study as fs  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "full"
ASSETS = ROOT.parent / "assets" / "defense-leakage"
RET_MODELS = ["M1", "M2", "M3", "M4"]
ALL_MODELS = RET_MODELS + ["V2"]
WINDOWS = ["pre10", "pre40", "day0", "post5"]
N_NULL, N_POW = 2000, 600
rng = np.random.default_rng(20261117)
PI_GRID = np.arange(0.0, 0.61, 0.02)
MU_GRID = np.arange(0.5, 6.01, 0.25)


def L(w):
    a, b = fs.WIN[w]
    return b - a + 1


def item_xs(s, m, w):
    """standardized CAR and the estimation sd for one series dict"""
    car = fs.wsum(s[m][0], w)
    return car / (s[m][1] * np.sqrt(L(w))), s[m][1]


# ---------------------------------------------------------------- null pools by firm x quarter-end
def build_nulls(pool):
    groups = {}
    for (t, y, q), items in pool.items():
        groups.setdefault((t, q), []).extend(items)
    nulls = {}
    for g, items in groups.items():
        for m in ALL_MODELS:
            for w in WINDOWS:
                xs = np.array([item_xs(s, m, w) for s in items])
                nulls[(g, m, w)] = dict(x=xs[:, 0], sd=xs[:, 1], xs_sorted=np.sort(xs[:, 0]),
                                        mu=xs[:, 0].mean(), sdx=xs[:, 0].std(ddof=1))
    return nulls


def upper_p(x, null_sorted):
    n = len(null_sorted)
    return (1 + n - np.searchsorted(null_sorted, x, side="left")) / (n + 1)


def lower_p(x, null_sorted):
    n = len(null_sorted)
    return (1 + np.searchsorted(null_sorted, x, side="right")) / (n + 1)


# ---------------------------------------------------------------- detection statistics
class Detector:
    """Holds the null density for T5 and computes T1-T5 for a matrix of studies (S x n)."""

    def __init__(self, z_null):
        kde = gaussian_kde(z_null)
        self.grid = np.arange(-12, 25, 0.02)
        dens = kde(self.grid)
        self.dens = np.maximum(dens, 1e-7)

    def f0(self, z):
        return np.interp(z, self.grid, self.dens, left=1e-7, right=1e-7)

    def mixture(self, Z):
        """returns LR, pi_hat, mu_hat for each row of Z"""
        S, n = Z.shape
        lf0 = np.log(self.f0(Z))
        ratio = np.stack([self.f0(Z - mu) for mu in MU_GRID], axis=2) / np.exp(lf0)[..., None]  # S x n x M
        best = np.full(S, 0.0)
        bpi, bmu = np.zeros(S), np.zeros(S)
        for pi in PI_GRID[1:]:
            ll = np.log1p(pi * (ratio - 1)).sum(axis=1)  # S x M  (loglik minus null loglik)
            j = ll.argmax(axis=1)
            v = ll[np.arange(S), j]
            better = v > best
            best[better], bpi[better], bmu[better] = v[better], pi, MU_GRID[j[better]]
        return 2 * best, bpi, bmu

    def stats(self, Z, P, firm_idx, n_firms):
        S, n = Z.shape
        out = {}
        out["T1"] = Z.sum(axis=1) / np.sqrt(n)
        fz = np.full((S, n_firms), -np.inf)
        for f in range(n_firms):
            cols = firm_idx == f
            if cols.sum():
                fz[:, f] = Z[:, cols].sum(axis=1) / np.sqrt(cols.sum())
        out["T2"] = fz.max(axis=1)
        out["T3"] = (P < 0.05).sum(axis=1).astype(float)
        Ps = np.sort(P, axis=1)[:, : n // 2]
        i = np.arange(1, n // 2 + 1)
        hc = np.sqrt(n) * (i / n - Ps) / np.sqrt(Ps * (1 - Ps))
        out["T4"] = hc.max(axis=1)
        lr, pi, mu = self.mixture(Z)
        out["T5"], out["_pi"], out["_mu"], out["_firmz"] = lr, pi, mu, fz
        return out


TESTS = {"T1": "Pooled mean", "T2": "Firm by firm (max firm)", "T3": "Tail count", "T4": "Higher criticism", "T5": "Two-group mixture"}


def main():
    st = fs.main(return_state=True)
    kept, pool, dates = st["kept"], st["pool"], st["dates"]
    ev = kept[~kept.earnings_near].copy().reset_index(drop=True)
    ev["qe"] = [dates[d].month % 3 == 0 for d in ev.d0]
    firms = [f for f in fs.FIRMS if (ev.tic == f).any()]
    fidx = ev.tic.map({f: i for i, f in enumerate(firms)}).values
    nF = len(firms)
    nulls = build_nulls(pool)
    keys = list(zip(ev.tic, ev.qe))
    n = len(ev)
    print("clean events:", n, "firms:", firms)

    # null groups for drawing simulated studies with the real (firm, quarter-end) mix
    def draw(m, w, S):
        X, SD, MU0, SD0 = np.zeros((S, n)), np.zeros((S, n)), np.zeros(n), np.zeros(n)
        for g in set(keys):
            cols = np.array([k == g for k in keys])
            nb = nulls[(g, m, w)]
            idx = rng.integers(len(nb["x"]), size=(S, cols.sum()))
            X[:, cols], SD[:, cols] = nb["x"][idx], nb["sd"][idx]
            MU0[cols], SD0[cols] = nb["mu"], nb["sdx"]
        return X, SD, MU0, SD0

    def to_ZP(X, m, w):
        Z, P = np.zeros_like(X), np.zeros_like(X)
        for g in set(keys):
            cols = np.array([k == g for k in keys])
            nb = nulls[(g, m, w)]
            Z[:, cols] = (X[:, cols] - nb["mu"]) / nb["sdx"]
            P[:, cols] = upper_p(X[:, cols], nb["xs_sorted"])
        return Z, P

    # one null density for T5 per model/window: all ordinary days, standardized within their group
    detectors, crit, null_stats = {}, {}, {}
    for m in ALL_MODELS:
        for w in WINDOWS:
            zn = np.concatenate([(nb["x"] - nb["mu"]) / nb["sdx"] for (g, mm, ww), nb in nulls.items() if mm == m and ww == w])
            det = Detector(zn)
            X, SD, _, _ = draw(m, w, N_NULL)
            Z, P = to_ZP(X, m, w)
            s = det.stats(Z, P, fidx, nF)
            detectors[(m, w)] = det
            null_stats[(m, w)] = s
            crit[(m, w)] = {t: np.quantile(s[t], 0.95) for t in TESTS}
            # per-firm null for firm-level p values
    print("null calibration done")

    # ------------------------------------------------------------ real data
    real_rows, firm_rows, event_rows = [], [], []
    for m in ALL_MODELS:
        for w in WINDOWS:
            x = np.array([item_xs(s, m, w)[0] for s in ev._s])
            Z, P = to_ZP(x[None, :], m, w)
            Plow = np.array([lower_p(x[i], nulls[(keys[i], m, w)]["xs_sorted"]) for i in range(n)])
            s = detectors[(m, w)].stats(Z, P, fidx, nF)
            ns = null_stats[(m, w)]
            row = dict(model=m, window=w, n=n)
            for t in TESTS:
                row[t] = float(s[t][0])
                row[t + "_p"] = float((1 + (ns[t] >= s[t][0]).sum()) / (1 + len(ns[t])))
            row["T1_lower_p"] = float((1 + (ns["T1"] <= s["T1"][0]).sum()) / (1 + len(ns["T1"])))
            row["n_tail_up"] = int((P[0] < 0.05).sum())
            row["n_tail_down"] = int((Plow < 0.05).sum())
            row["expected_tail"] = 0.05 * n
            row["binom_up_p"] = float(binom.sf(row["n_tail_up"] - 1, n, 0.05))
            row["binom_down_p"] = float(binom.sf(row["n_tail_down"] - 1, n, 0.05))
            row["pi_hat"], row["mu_hat"] = float(s["_pi"][0]), float(s["_mu"][0])
            pi0 = min(1.0, (P[0] > 0.5).mean() / 0.5)
            row["storey_leaky_share"] = 1 - pi0
            # BH q values
            order = np.argsort(P[0])
            q = np.minimum.accumulate((P[0][order] * n / np.arange(1, n + 1))[::-1])[::-1]
            qv = np.empty(n)
            qv[order] = np.minimum(q, 1)
            row["bh_discoveries_q10"] = int((qv < 0.10).sum())
            real_rows.append(row)
            # firm level
            fz = s["_firmz"][0]
            nfz = ns["_firmz"]
            for f, name in enumerate(firms):
                cols = fidx == f
                car = np.array([fs.wsum(sv[m][0], w) for sv in ev._s[cols]])
                firm_rows.append(dict(model=m, window=w, firm=name, n=int(cols.sum()), mean_car=float(car.mean()),
                                      z=float(fz[f]), p_up=float((1 + (nfz[:, f] >= fz[f]).sum()) / (1 + len(nfz))),
                                      p_down=float((1 + (nfz[:, f] <= fz[f]).sum()) / (1 + len(nfz))),
                                      null_lo=float(np.quantile(nfz[:, f], 0.05)), null_hi=float(np.quantile(nfz[:, f], 0.95)),
                                      n_tail_up=int((P[0][cols] < 0.05).sum()), n_tail_down=int((Plow[cols] < 0.05).sum())))
            if w in ("pre10", "pre40") and m in ("M4", "M2", "V2"):
                for i in range(n):
                    event_rows.append(dict(model=m, window=w, tic=ev.tic[i], day0=ev.day0[i], event_type=ev.event_type[i],
                                           pct_rev=ev.pct_rev[i], text=str(ev.text[i])[:120], url=ev.url[i],
                                           car=fs.wsum(ev._s[i][m][0], w), z=Z[0, i], p_up=P[0, i], p_down=Plow[i], q_up=qv[i]))
    real = pd.DataFrame(real_rows)
    firm = pd.DataFrame(firm_rows)
    evt = pd.DataFrame(event_rows)
    # firm shrinkage (empirical Bayes, normal-normal on firm z): z_f ~ N(theta_f, 1), theta_f ~ N(0, tau2)
    firm["z_shrunk"] = np.nan
    for (m, w), g in firm.groupby(["model", "window"]):
        tau2 = max(0.0, (g.z ** 2).mean() - 1)
        firm.loc[g.index, "z_shrunk"] = g.z * tau2 / (tau2 + 1)
        firm.loc[g.index, "tau2"] = tau2
    real.to_csv(DATA / "step45_real_results.csv", index=False)
    firm.to_csv(DATA / "step45_firm_results.csv", index=False)
    evt.to_csv(DATA / "step45_event_pvalues.csv", index=False)

    # arms sales over -40..-1 (the tiered-review window from Step 3), per-event screen only
    arms = ev.event_type.values == "arms sale"
    arms_rows = []
    for m in ["M4", "V2"]:
        x = np.array([item_xs(s, m, "pre40")[0] for s in ev._s])
        _, P = to_ZP(x[None, :], m, "pre40")
        pa = P[0][arms]
        arms_rows.append(dict(model=m, n=int(arms.sum()), n_tail_up=int((pa < 0.05).sum()), expected=0.05 * arms.sum(),
                              binom_p=float(binom.sf((pa < 0.05).sum() - 1, arms.sum(), 0.05))))
    pd.DataFrame(arms_rows).to_csv(DATA / "step45_arms_pre40.csv", index=False)

    # ------------------------------------------------------------ Step 5: scoring by planted run-ups
    def scenario_power(m, w, kind, delta, frac=None, S=N_POW):
        X, SD, _, _ = draw(m, w, S)
        add = delta / (SD * np.sqrt(L(w))) if m != "V2" else delta / (SD * np.sqrt(L(w)))
        if kind == "all":
            mask = np.ones_like(X, bool)
        elif kind == "share":
            mask = rng.random(X.shape) < frac
        elif kind == "firm":
            pick = rng.integers(nF, size=S)
            mask = fidx[None, :] == pick[:, None]
        elif kind == "firm_share":
            pick = rng.integers(nF, size=S)
            mask = (fidx[None, :] == pick[:, None]) & (rng.random(X.shape) < frac)
        X = X + add * mask
        Z, P = to_ZP(X, m, w)
        s = detectors[(m, w)].stats(Z, P, fidx, nF)
        out = {t: float((s[t] > crit[(m, w)][t]).mean()) for t in TESTS}
        out["pi_hat_mean"] = float(s["_pi"].mean())
        return out

    ret_scen = [("all", 0.5, None), ("all", 1.0, None), ("share", 5.0, 0.05), ("share", 5.0, 0.10), ("share", 5.0, 0.20),
                ("firm", 2.0, None), ("firm", 4.0, None), ("firm_share", 6.0, 0.30)]
    vol_scen = [("all", 0.5, None), ("all", 1.0, None), ("share", 4.0, 0.05), ("share", 4.0, 0.10), ("share", 4.0, 0.20),
                ("firm", 2.0, None), ("firm", 4.0, None), ("firm_share", 6.0, 0.30)]
    score_rows = []
    for m in ALL_MODELS:
        for kind, d, fr in (vol_scen if m == "V2" else ret_scen):
            delta = d if m == "V2" else d / 100
            r = scenario_power(m, "pre10", kind, delta, fr)
            score_rows.append(dict(model=m, scenario=kind, delta=d, frac=fr, **r))
        # size check: false alarm rate on a fresh null draw
        r = scenario_power(m, "pre10", "all", 0.0)
        score_rows.append(dict(model=m, scenario="none (false alarms)", delta=0, frac=None, **r))
    score = pd.DataFrame(score_rows)
    score.to_csv(DATA / "step45_scoring.csv", index=False)

    # power curve vs share of events leaking (5% run-up), main model M4
    curve = []
    for fr in [0.0, 0.02, 0.04, 0.06, 0.08, 0.10, 0.15, 0.20, 0.30]:
        r = scenario_power("M4", "pre10", "share", 0.05, fr) if fr > 0 else scenario_power("M4", "pre10", "all", 0.0)
        curve.append(dict(frac=fr, **r))
    curve = pd.DataFrame(curve)
    curve.to_csv(DATA / "step45_power_curve.csv", index=False)
    curve_f = []
    for d in [0.0, 1.0, 2.0, 3.0, 4.0, 6.0]:
        r = scenario_power("M4", "pre10", "firm", d / 100)
        curve_f.append(dict(delta=d, **r))
    curve_f = pd.DataFrame(curve_f)
    curve_f.to_csv(DATA / "step45_power_curve_firm.csv", index=False)

    # model noise (what the normal-return model leaves unexplained on ordinary days)
    noise = []
    for m in ALL_MODELS:
        cars = np.concatenate([[fs.wsum(s[m][0], "pre10") for s in items] for items in pool.values()])
        noise.append(dict(model=m, sd_car_pre10=float(cars.std(ddof=1)), mean_car_pre10=float(cars.mean()), n=len(cars)))
    noise = pd.DataFrame(noise)
    noise.to_csv(DATA / "step45_model_noise.csv", index=False)

    summary = dict(n_events=n, firms=firms, n_by_firm={f: int((ev.tic == f).sum()) for f in firms},
                   n_arms=int(arms.sum()), n_null_sims=N_NULL, n_power_sims=N_POW)
    (DATA / "step45_summary.json").write_text(json.dumps(summary, indent=1))

    with pd.option_context("display.width", 250, "display.max_rows", 500, "display.max_columns", 40):
        print(real[real.window.isin(["pre10", "pre40", "day0"])].round(3).to_string(index=False))
        print(firm[(firm.model.isin(["M4", "V2"])) & (firm.window == "pre10")].round(3).to_string(index=False))
        print(score.round(3).to_string(index=False))
        print(curve.round(3).to_string(index=False))
        print(curve_f.round(3).to_string(index=False))
        print(noise.round(4).to_string(index=False))
        print(pd.DataFrame(arms_rows))
        e = evt[(evt.model == "M4") & (evt.window == "pre10")].sort_values("p_up").head(15)
        print(e.round(4).to_string(index=False))
        e = evt[(evt.model == "V2") & (evt.window == "pre10")].sort_values("p_up").head(10)
        print(e.round(4).to_string(index=False))


if __name__ == "__main__":
    main()
