"""
build_checks.py -- Part 6, the two checks before calling the Rising Neighborhood Score finished.

  Check 1  Is "the top 20 beat the city 48 of 80 times" more than luck?
           - exact null: picking 20 NTAs at random each test year (hypergeometric per year, convolved over years)
           - NTA-cluster bootstrap of the excess hits and the excess 3-year return of the top 20
           - the same for every top-N from 5 to 50, and for each model on the ladder
  Check 2  Why does the ranking fade to ~0 for the 2021-22 start years?
           - hindsight ceiling: refit the model on each start year's own outcomes. If even hindsight can't rank
             a year, the inputs lost their information; if hindsight can but the rolling model can't, the
             relationships changed (a regime shift).
           - sales noise: resample each NTA's sales, rebuild y, and measure how much of each year's spread is noise
           - which input-outcome links flipped, start year by start year (Spearman)
           - the benchmark: share of NTAs that beat the citywide median each year

Reuses build_rising.py's cached pulls and model code, and the spec it picked (rising_score.json "spec").
Usage:  python build_checks.py      Writes ../assets/nyc-explorer/rising_checks.json
"""

import json
import time
from datetime import datetime, timezone

import numpy as np
from scipy import stats

import build_explorer_data as bx
import build_models as bm
import build_rising as br
import build_signals as bs
import rns_pulls as rp

OUT = br.HERE.parent / "assets" / "nyc-explorer" / "rising_checks.json"
RNG = np.random.default_rng(6492)
N_TOP = 20
TOPS = [5, 10, 15, 20, 25, 30, 40, 50]
NBOOT = 2000
NNOISE = 40
LINKS = ["PRICE0", "INC", "BA", "RENTER", "MOM", "GAP", "NBMOM", "CRIME_LVL", "NOISE", "CONSTR", "SALES"]


def setup():
    key = bx.census_key()
    P_ = rp.all_pulls(key)
    G = br.geography()
    A = br.acs_by_nta(G, bm.cached("acs5_tracts_2010_2019", lambda: bm.pull_acs(key)), P_["acs_new"], P_["rel"])
    fam, condo, vol, _ = br.place_sales(G, P_["sales"], bm.cached("pluto_bbl_tract2010", bs.pull_pluto))
    permits, noise, felony = br.signal_tables(G, A, P_)
    geo, _, _ = br.static_geo(G, A)
    D = dict(fam=fam, condo=condo, vol={y: {n: float(v) for n, v in d.items()} for y, d in vol.items()}, A=A,
             permits=permits, noise=noise, felony=felony, geo=geo, nb_knn=None)
    Q, idx = br.icar_Q(G, G["nb"])
    return G, D, {"Q": Q, "idx": idx}


def null_pmf(year_sets, n_top):
    """Distribution of total hits when n_top NTAs are drawn at random each year: convolve per-year hypergeometrics."""
    pmf = np.array([1.0])
    for N, K in year_sets:
        pmf = np.convolve(pmf, stats.hypergeom(N, K, n_top).pmf(np.arange(n_top + 1)))
    return pmf


def top_check(pairs, n_top, years, boot=True):
    """Hits, the random-pick null, and an NTA-cluster bootstrap of the excess."""
    by_t = {t: [(r["nta"], r["y"], p) for r, p in pairs if r["t"] == t] for t in years}
    hits, exp_, ret, ret_all, per = 0, 0.0, [], [], []
    for t in years:
        rows = by_t[t]
        y = np.array([v for _, v, _ in rows])
        p = np.array([q for _, _, q in rows])
        top = np.argsort(-p)[:n_top]
        h, K = int((y[top] > 0).sum()), int((y > 0).sum())
        e = n_top * K / len(y)
        hits += h
        exp_ += e
        ret.append(y[top].mean())
        ret_all.append(y.mean())
        per.append({"t": t, "n": len(y), "beat_all": K, "hits": h, "expected": br.rd(e, 1),
                    "p": br.rd(float(stats.hypergeom(len(y), K, n_top).sf(h - 1)), 4),
                    "top_ret": br.rd(float(y[top].mean()), 2), "all_ret": br.rd(float(y.mean()), 2)})
    pmf = null_pmf([(d["n"], d["beat_all"]) for d in per], n_top)
    cdf = np.cumsum(pmf)
    out = {"n_top": n_top, "hits": hits, "of": n_top * len(years), "expected": br.rd(exp_, 1),
           "p": br.rd(float(pmf[hits:].sum()), 5),
           "null_lo": int(np.searchsorted(cdf, 0.025)), "null_hi": int(np.searchsorted(cdf, 0.975)),
           "excess_ret": br.rd(float(np.mean(ret) - np.mean(ret_all)), 2), "per_year": per,
           "null_pmf": [br.rd(float(v), 5) for v in pmf]}
    if not boot:
        return out
    # resample NTAs (an NTA keeps all its years together), re-pick the top n in each year from the resample
    ntas = sorted({n for rows in by_t.values() for n, _, _ in rows})
    look = {t: {n: (v, q) for n, v, q in rows} for t, rows in by_t.items()}
    ex_h, ex_r = [], []
    for _ in range(NBOOT):
        pick = RNG.choice(ntas, len(ntas))
        h_, e_, r_ = 0, 0.0, []
        for t in years:
            vals = np.array([look[t][n] for n in pick if n in look[t]])
            y, p = vals[:, 0], vals[:, 1]
            top = np.argsort(-p)[:n_top]
            h_ += (y[top] > 0).sum()
            e_ += n_top * (y > 0).mean()
            r_.append(y[top].mean() - y.mean())
        ex_h.append(h_ - e_)
        ex_r.append(np.mean(r_))
    out["excess_hits"] = [br.rd(hits - exp_, 1), br.rd(np.percentile(ex_h, 2.5), 1), br.rd(np.percentile(ex_h, 97.5), 1)]
    out["excess_ret_ci"] = [out["excess_ret"], br.rd(np.percentile(ex_r, 2.5), 2), br.rd(np.percentile(ex_r, 97.5), 2)]
    return out


def spearman(a, b):
    if len(a) < 5 or np.std(a) == 0 or np.std(b) == 0:
        return None
    return float(stats.spearmanr(a, b).statistic)


def main():
    import sys
    sys.stdout.reconfigure(encoding="utf-8")
    t0 = time.time()
    built = json.loads(br.OUT.read_text(encoding="utf-8"))
    SPEC = built["spec"]
    specs = {m: {**SPEC, "model": m} for m in ("B1", "B", "C")}
    print("setup (cached pulls) ...")
    G, D, ctx = setup()
    rows, _, _ = br.build_rows(G, D, {})
    lab = [r for r in rows if r["y"] is not None]
    all_years = sorted({r["t"] for r in lab})
    print(f"   {len(lab)} labelled rows, start years {all_years[0]}-{all_years[-1]}")

    # ── check 1: top-N vs random picks ──
    print("check 1: rolling predictions ...")
    roll = {m: br.rolling(rows, s, ctx, br.TEST_YEARS) for m, s in specs.items()}
    roll["persist"] = br.persistence(rows, br.TEST_YEARS)
    main_ = {m: top_check(v, N_TOP, br.TEST_YEARS) for m, v in roll.items()}
    for m, c in main_.items():
        print(f"   {m:8s} top-20 {c['hits']}/{c['of']} vs random {c['expected']} (95% {c['null_lo']}-{c['null_hi']}), "
              f"p {c['p']}, excess hits {c['excess_hits']}, excess return {c['excess_ret_ci']}")
    curve = {m: [top_check(roll[m], k, br.TEST_YEARS, boot=(k in (10, 20, 40))) for k in TOPS] for m in ("C", "B1")}
    for c in curve["C"]:
        print(f"   C top-{c['n_top']:2d}: {c['hits']}/{c['of']} vs {c['expected']}  p {c['p']}  excess return {c['excess_ret']}")
    # same rule on the validation years too (choices were tuned there, so this is labelled as such on the page)
    roll_all = br.rolling(rows, specs["C"], ctx, br.VAL_YEARS + br.TEST_YEARS)
    all6 = top_check(roll_all, N_TOP, br.VAL_YEARS + br.TEST_YEARS)
    print(f"   C 2017-22 (incl. validation years): {all6['hits']}/{all6['of']} vs {all6['expected']}, p {all6['p']}")

    # ── check 2: why the fade ──
    print("check 2: hindsight ceiling ...")
    hind, roll_rho = [], {}
    rC = br.rolling(rows, specs["C"], ctx, [t for t in all_years if t - br.HOLD >= all_years[0]])
    for t in sorted({r["t"] for r, _ in rC}):
        ps = [(r["y"], p) for r, p in rC if r["t"] == t]
        roll_rho[t] = spearman([a for a, _ in ps], [b for _, b in ps])
    for t in all_years:
        yr = [r for r in lab if r["t"] == t]
        # hindsight: Model B's inputs, fit on this year's own outcomes, with leave-one-out predictions
        F, _, _ = br.features(yr, specs["B"])
        y = np.array([r["y"] for r in yr])
        X = np.column_stack([np.ones(len(y)), F])
        lam = np.diag([0.0] + [SPEC["ridge"] * len(y) / len(lab)] * F.shape[1])
        Hi = np.linalg.inv(X.T @ X + lam)
        H = X @ Hi @ X.T
        fit_ = H @ y
        loo = y - (y - fit_) / (1 - np.diag(H))
        hind.append({"t": t, "n": len(y), "sd": br.rd(float(y.std()), 2), "mean": br.rd(float(y.mean()), 2),
                     "beat": br.rd(float((y > 0).mean()), 3),
                     "hind_rho": br.rd(spearman(y, loo)), "roll_rho": br.rd(roll_rho.get(t))})
        print(f"   {t}: sd {y.std():5.2f}  hindsight(LOO) rho {hind[-1]['hind_rho']}  rolling rho {hind[-1]['roll_rho']}")

    print("check 2: links by start year ...")
    links = {c: [br.rd(spearman([r[c] for r in lab if r["t"] == t], [r["y"] for r in lab if r["t"] == t])) for t in all_years] for c in LINKS}
    for c, v in links.items():
        print(f"   {c:10s} {v}")

    print(f"check 2: sales noise ({NNOISE} resamples) ...")
    base_y = {(r["nta"], r["t"]): r["y"] for r in lab}
    draws = {k: [] for k in base_y}
    for d in range(NNOISE):
        fb = {y: {n: (v[RNG.integers(0, len(v), len(v))] if len(v) else v) for n, v in yy.items()} for y, yy in D["fam"].items()}
        rws, _, _ = br.build_rows(G, D, {"fam": fb})
        for r in rws:
            k = (r["nta"], r["t"])
            if r["y"] is not None and k in draws:
                draws[k].append(r["y"])
        if (d + 1) % 10 == 0:
            print(f"   draw {d + 1}/{NNOISE}")
    noise = []
    for t in all_years:
        ks = [k for k in base_y if k[1] == t and len(draws[k]) >= NNOISE // 2]
        nv = float(np.mean([np.var(draws[k]) for k in ks]))
        tv = float(np.var([base_y[k] for k in ks]))
        rel = max(0.0, 1 - nv / tv)
        noise.append({"t": t, "noise_sd": br.rd(np.sqrt(nv), 2), "total_sd": br.rd(np.sqrt(tv), 2), "reliability": br.rd(rel, 3)})
        print(f"   {t}: noise sd {np.sqrt(nv):.2f} of total {np.sqrt(tv):.2f}  -> reliability {rel:.2f}")

    out = {"meta": {"built": datetime.now(timezone.utc).isoformat(timespec="seconds"), "n_top": N_TOP, "test_years": br.TEST_YEARS,
                    "val_years": br.VAL_YEARS, "nboot": NBOOT, "nnoise": NNOISE, "spec": SPEC},
           "check1": {"models": main_, "curve": curve, "all6": all6},
           "check2": {"years": hind, "links": {"cols": LINKS, "years": all_years, "rho": links}, "noise": noise}}
    OUT.write_text(json.dumps(br.clean(out), separators=(",", ":"), allow_nan=False), encoding="utf-8")
    print(f"wrote {OUT.name} in {(time.time() - t0) / 60:.1f} min")


if __name__ == "__main__":
    main()
