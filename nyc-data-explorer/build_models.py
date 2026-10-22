"""
build_models.py -- real-data checks behind Part 3 (Modeling Options).

Part 3 plans two models. Joseph picked Model B (discrete-time hazard) and asked
for a deeper look plus a spatio-temporal Model C to compare against it. This
script does the parts of that we can do honestly *before* any gentrification
signal (restaurants, permits, ...) goes in:

  1. Build the outcome. Every NYC census tract (2010 boundaries), ACS 5-year
     estimates for each vintage 2010-2019 (all ten vintages use 2010 tracts, so
     no crosswalk is needed). "At risk" = bottom 40% of tract median household
     income in ACS 2010 (2006-10). "Tipped" = rent growth AND college-share
     growth since 2010 both beat the all-tract median change.
  2. Iterate on that event definition (v1 naive -> v2 persistent -> v3 strict)
     and count how many events each version leaves us.
  3. Spatial diagnostics: are tipping events clustered on the map, and is a
     tract more likely to tip once a neighbor has?
  4. Fit the two model frames with no gentrification signals -- only baseline
     conditions and each tract's own (for C, also its neighbors') change so far,
     lagged one vintage -- and compare them on held-out years. This tests the
     *frame*, not the research question.

Model B: logistic discrete-time hazard, year dummies + baseline conditions.
Model C: Model B + spatio-temporal terms: share of queen neighbors already
         tipped at t-1, and a tract random effect with an ICAR (conditional
         autoregressive) prior so neighboring tracts share information. Fit by
         penalized maximum likelihood (the posterior mode of a BYM-style model),
         precision chosen by cross-validation on the training years.

Needs requests, numpy, scipy, shapely, and the Census key.
Usage:  python build_models.py           (raw pulls cached in .cache/models/)
        MODEL_RULE=v3 python build_models.py   (sensitivity: fit on the strict definition -> models_check_v3.json)
"""

import json
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import requests
from scipy import optimize, sparse
from shapely.geometry import MultiPolygon, shape
from shapely.geometry.polygon import orient

import build_explorer_data as bx

HERE = Path(__file__).resolve().parent
CACHE = HERE / ".cache" / "models"
NYC = bx.NYC
COUNTY_BORO = {"061": "1", "005": "2", "047": "3", "081": "4", "085": "5"}
YEARS = list(range(2010, 2020))  # ACS 5-yr vintages on 2010 tract boundaries
B15002_BA = [f"B15002_{i:03d}" for i in (15, 16, 17, 18, 32, 33, 34, 35)]
ACS_GET = ["B01003_001", "B25064_001", "B19013_001", "B15002_001", "B25003_001", "B25003_003", *B15002_BA]
MIN_POP = 500
RNG = np.random.default_rng(491)
RULE = __import__("os").environ.get("MODEL_RULE", "v2")  # event definition the models are fit on


# ── 1. pulls (cached) ────────────────────────────────────────────────
def cached(name, fn):
    CACHE.mkdir(parents=True, exist_ok=True)
    p = CACHE / f"{name}.json"
    if p.exists():
        return json.loads(p.read_text(encoding="utf-8"))
    obj = fn()
    p.write_text(json.dumps(obj), encoding="utf-8")
    return obj


def pull_acs(key):
    get = ",".join(v + "E" for v in ACS_GET)
    out = {}
    for year in YEARS:
        rows = []
        for county in COUNTY_BORO:
            rows += bx.census_get(f"{year}/acs/acs5", {"get": get, "for": "tract:*", "in": f"state:36 county:{county}"}, key) or []
        out[year] = {COUNTY_BORO[r["county"]] + r["tract"]: {k: r[k] for k in r if k.endswith("E")} for r in rows}
        print(f"   acs5 {year}: {len(out[year])} tracts")
    return out


def pull_shapes():
    rows = bx.soql(NYC, "bmjq-373p", select="boroct2010, ntacode, ntaname, boroname, the_geom", limit=5000)
    print(f"   tract shapes: {len(rows)}")
    return rows


# ── 2. panel ─────────────────────────────────────────────────────────
def val(r, k):
    v = bx.num(r.get(k + "E"), None)
    return None if v is None or v < 0 else v


def indicators(r):
    ba = sum(val(r, k) or 0 for k in B15002_BA)
    tot = val(r, "B15002_001")
    hh = val(r, "B25003_001")
    return {"pop": val(r, "B01003_001"), "rent": val(r, "B25064_001"), "income": val(r, "B19013_001"),
            "ba": 100 * ba / tot if tot else None,
            "renter": 100 * val(r, "B25003_003") / hh if hh and val(r, "B25003_003") is not None else None}


def queen_neighbors(geoms, ids):
    """Tracts that share any boundary point (queen contiguity), via shapely touches/intersects."""
    from shapely.strtree import STRtree
    polys = [geoms[i].buffer(0) for i in ids]
    tree = STRtree(polys)
    nb = {i: set() for i in ids}
    for a, pa in enumerate(polys):
        for b in tree.query(pa.buffer(1e-5)):
            if b != a and pa.buffer(1e-5).intersects(polys[b]):
                nb[ids[a]].add(ids[b])
    return nb


def build_panel(acs, shapes):
    geoms = {s["boroct2010"]: shape(s["the_geom"]) for s in shapes}
    meta = {s["boroct2010"]: {"nta": s["ntacode"], "ntaname": s["ntaname"], "boro": s["boroname"]} for s in shapes}
    ind = {int(y): {t: indicators(r) for t, r in rows.items()} for y, rows in acs.items()}
    base = ind[2010]
    ids = sorted(t for t in geoms if t in base and (base[t]["pop"] or 0) >= MIN_POP
                 and all(ind[y].get(t, {}).get(k) is not None for y in YEARS for k in ("rent", "income", "ba")))
    print(f"   tracts with pop >= {MIN_POP} and complete rent/income/BA 2010-2019: {len(ids)}")
    inc0 = np.array([base[t]["income"] for t in ids])
    cut = np.quantile(inc0, 0.4)
    at_risk = {t for t, v in zip(ids, inc0) if v <= cut}
    # change since 2010 for every tract, then compare to the all-tract median change that year
    d_rent = {y: {t: ind[y][t]["rent"] / base[t]["rent"] - 1 for t in ids} for y in YEARS[1:]}
    d_ba = {y: {t: ind[y][t]["ba"] - base[t]["ba"] for t in ids} for y in YEARS[1:]}
    return ids, geoms, meta, ind, at_risk, cut, d_rent, d_ba


# ── 3. event definitions (the iteration) ────────────────────────────
def crosses(d_rent, d_ba, y, t, q):
    r = np.quantile(list(d_rent[y].values()), q)
    b = np.quantile(list(d_ba[y].values()), q)
    return d_rent[y][t] > r and d_ba[y][t] > b


def event_years(at_risk, d_rent, d_ba, rule):
    """rule: 'v1' first year both beat the median (no confirmation);
    'v2' ... and both stay above the median in the next two vintages too (confirmed);
    'v3' like v2 but entering above the 67th percentile (strict).
    v2/v3 need t+2 to confirm, so events can only be dated 2011-2017; 2018-19 are censored."""
    yrs = YEARS[1:]
    flag = {q: {y: {t: crosses(d_rent, d_ba, y, t, q) for t in at_risk} for y in yrs} for q in (0.5, 0.67)}
    ev, flips = {}, 0
    for t in at_risk:
        ev[t] = None
        for i, y in enumerate(yrs):
            later = yrs[i + 1:i + 3]
            if rule == "v1" and flag[0.5][y][t]:
                ev[t] = y
            elif rule in ("v2", "v3") and len(later) == 2 and flag[0.67 if rule == "v3" else 0.5][y][t] \
                    and all(flag[0.5][z][t] for z in later):
                ev[t] = y
            if ev[t]:
                break
        if rule == "v1" and ev[t] and not all(flag[0.5][z][t] for z in yrs if z >= ev[t]):
            flips += 1
    return ev, flips


# ── 4. spatial diagnostics ───────────────────────────────────────────
def morans_i(x, nb_idx, perms=999):
    x = np.asarray(x, float)
    z = x - x.mean()
    rows, cols = zip(*[(i, j) for i, js in enumerate(nb_idx) for j in js]) if any(nb_idx) else ([], [])
    rows, cols = np.array(rows), np.array(cols)
    w = len(rows)

    def stat(zz):
        return (len(zz) / w) * np.sum(zz[rows] * zz[cols]) / np.sum(zz * zz)
    obs = stat(z)
    sims = np.array([stat(RNG.permutation(z)) for _ in range(perms)])
    p = (1 + np.sum(sims >= obs)) / (perms + 1)
    return float(obs), float(p), float(sims.mean()), float(np.percentile(sims, 2.5)), float(np.percentile(sims, 97.5))


# ── 5. model fits ────────────────────────────────────────────────────
def pct_rank(d):
    v = np.array(list(d.values()))
    return {t: float((v < x).mean()) for t, x in d.items()}


def person_period(at_risk_ids, ev, ind, nb, d_rent, d_ba, years):
    """One row per at-risk tract-year until it tips. Every time-varying feature is from vintage t-1,
    i.e. something you could have known at the time (no hindsight-confirmed neighbor events)."""
    base = ind[2010]
    rk_r = {y: pct_rank(d_rent[y]) for y in d_rent}
    rk_b = {y: pct_rank(d_ba[y]) for y in d_ba}
    rows = []
    for t in at_risk_ids:
        for y in years:
            lag = y - 1
            ns = nb[t]
            rows.append({"tract": t, "year": y, "y": int(ev[t] == y),
                         "inc0": np.log(base[t]["income"]), "rent0": np.log(base[t]["rent"]), "ba0": base[t]["ba"],
                         "renter0": base[t]["renter"] or 0,
                         "own_rent_rk": rk_r[lag][t], "own_ba_rk": rk_b[lag][t],
                         "nb_rent_rk": float(np.mean([rk_r[lag][n] for n in ns])) if ns else 0.5,
                         "nb_ba_rk": float(np.mean([rk_b[lag][n] for n in ns])) if ns else 0.5,
                         # neighbors that were never at risk = higher-income edge next door
                         "nb_affluent": sum(1 for n in ns if n not in ev) / len(ns) if ns else 0.0,
                         "nb_tipped_hindsight": int(any(ev.get(n) is not None and ev[n] < y for n in ns))})
            if ev[t] == y:
                break
    return rows


RISK_YEARS = list(range(2012, 2018))  # need a t-1 change (2011+) and a t+2 confirmation (<= 2019)
TRAIN_YEARS, TEST_YEARS = [2012, 2013, 2014, 2015], [2016, 2017]
B_COLS = ["inc0", "rent0", "ba0", "renter0", "own_rent_rk", "own_ba_rk"]
C_COLS = B_COLS + ["nb_rent_rk", "nb_ba_rk", "nb_affluent"]


def design(rows, cols, mu=None, sd=None):
    X = np.array([[r[c] for c in cols] for r in rows], float)
    if mu is None:
        mu, sd = X.mean(0), X.std(0) + 1e-9
    X = (X - mu) / sd
    D = np.array([[1.0 if r["year"] == y else 0.0 for y in RISK_YEARS] for r in rows])  # year dummies = baseline hazard
    return np.hstack([D, X]), mu, sd


def icar_Q(ids, nb):
    idx = {t: i for i, t in enumerate(ids)}
    n = len(ids)
    W = sparse.lil_matrix((n, n))
    for t in ids:
        for m in nb[t]:
            if m in idx:
                W[idx[t], idx[m]] = 1
    W = W.tocsr()
    deg = np.asarray(W.sum(1)).ravel()
    return (sparse.diags(deg) - W).tocsr(), idx


def fit(X, y, g=None, Q=None, tau=None, ridge=1e-2):
    """Penalized logistic regression. With g/Q/tau: adds tract random effects u with an ICAR prior
    (penalty tau/2 u'Qu) plus a small iid term so it is proper; returns the posterior mode."""
    p = X.shape[1]
    nu = Q.shape[0] if Q is not None else 0
    I = sparse.identity(nu, format="csr") if nu else None

    def f(theta):
        b, u = theta[:p], theta[p:]
        eta = X @ b + (u[g] if nu else 0)
        mu = 1 / (1 + np.exp(-eta))
        ll = np.sum(y * eta - np.logaddexp(0, eta))
        K = len(RISK_YEARS)  # year dummies are not shrunk
        pen = 0.5 * ridge * np.sum(b[K:] ** 2)
        grad_eta = y - mu
        gb = X.T @ grad_eta
        gb[K:] -= ridge * b[K:]
        if nu:
            P = tau * Q + 0.1 * I
            pen += 0.5 * u @ (P @ u)
            gu = np.bincount(g, weights=grad_eta, minlength=nu) - P @ u
            return -(ll - pen), -np.concatenate([gb, gu])
        return -(ll - pen), -gb
    res = optimize.minimize(f, np.zeros(p + nu), jac=True, method="L-BFGS-B", options={"maxiter": 5000})
    return res.x[:p], res.x[p:]


def predict(X, b, u=None, g=None):
    eta = X @ b + (u[g] if u is not None else 0)
    return 1 / (1 + np.exp(-eta))


def auc(y, p):
    y, p = np.asarray(y), np.asarray(p)
    order = np.argsort(p)
    ranks = np.empty(len(p))
    ranks[order] = np.arange(1, len(p) + 1)
    n1 = y.sum()
    n0 = len(y) - n1
    return float((ranks[y == 1].sum() - n1 * (n1 + 1) / 2) / (n1 * n0))


def logloss(y, p):
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))


def main():
    t0 = time.time()
    key = bx.census_key()
    print("ACS 5-year tracts 2010-2019 + 2010 tract shapes ...")
    acs = cached("acs5_tracts_2010_2019", lambda: pull_acs(key))
    shapes = cached("tracts2010", pull_shapes)
    ids, geoms, meta, ind, at_risk, cut, d_rent, d_ba = build_panel(acs, shapes)
    print("queen neighbors ...")
    nb_all = cached("queen_nb", lambda: {k: sorted(v) for k, v in queen_neighbors(geoms, ids).items()})
    nb = {t: [n for n in nb_all.get(t, []) if n in set(ids)] for t in ids}

    out = {"built_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
           "n_tracts": len(ids), "n_at_risk": len(at_risk), "income_cut_2010": round(float(cut)),
           "definitions": {}}
    print(f"   at risk (bottom 40% income, ACS 2006-10 <= ${cut:,.0f}): {len(at_risk)}")

    evs = {}
    for rule in ("v1", "v2", "v3"):
        ev, flips = event_years(at_risk, d_rent, d_ba, rule)
        evs[rule] = ev
        by_year = {y: sum(1 for t in ev if ev[t] == y) for y in YEARS[1:]}
        n_ev = sum(by_year.values())
        # empirical hazard by year: events / still at risk
        risk, haz = len(at_risk), {}
        for y in YEARS[1:]:
            haz[y] = by_year[y] / risk if risk else 0
            risk -= by_year[y]
        out["definitions"][rule] = {"events": n_ev, "flip_back": flips, "by_year": by_year,
                                    "hazard": {y: round(h, 4) for y, h in haz.items()}}
        print(f"   {rule}: {n_ev} events, {flips} flip back later; by year {by_year}")

    # spatial clustering of v2 events among at-risk tracts
    ar = sorted(at_risk)
    pos = {t: i for i, t in enumerate(ar)}
    nb_idx = [[pos[n] for n in nb[t] if n in pos] for t in ar]
    for rule in ("v1", "v2", "v3"):
        x = [1 if evs[rule][t] else 0 for t in ar]
        I, p, e, _, _ = morans_i(x, nb_idx)
        out["definitions"][rule]["morans_i"] = {"I": round(I, 3), "p": round(p, 3), "expected": round(e, 3)}
        print(f"   Moran's I ({rule} tipped yes/no, at-risk tracts): {I:.3f} (perm p={p:.3f})")

    # empirical hazard with vs without a neighbor that already tipped (v2; hindsight-dated, descriptive only)
    ev = evs[RULE]
    # tracts that tipped in 2011 had already tipped before the first risk year: left out, not counted as survivors
    ar_model = [t for t in ar if ev[t] is None or ev[t] >= RISK_YEARS[0]]
    out["n_left_truncated"] = len(ar) - len(ar_model)
    rows_all = person_period(ar_model, ev, ind, nb, d_rent, d_ba, RISK_YEARS)
    exp = {}
    for k in (0, 1):
        rr = [r for r in rows_all if r["nb_tipped_hindsight"] == k]
        exp[k] = {"rows": len(rr), "events": sum(r["y"] for r in rr), "hazard": round(sum(r["y"] for r in rr) / len(rr), 4)}
    out["neighbor_exposure"] = exp
    print(f"   hazard | neighbor already tipped: {exp[1]}, no neighbor tipped: {exp[0]}")

    # ── model comparison: train 2012-2015, test 2016-2017 ──
    train = [r for r in rows_all if r["year"] in TRAIN_YEARS]
    test = [r for r in rows_all if r["year"] in TEST_YEARS]
    ytr = np.array([r["y"] for r in train], float)
    yte = np.array([r["y"] for r in test], float)
    Q, gidx = icar_Q(ar, nb)
    gtr = np.array([gidx[r["tract"]] for r in train])
    gte = np.array([gidx[r["tract"]] for r in test])
    K = len(RISK_YEARS)

    def carry(b, seen):
        """Year effects for years the fit never saw = mean of the seen ones (baseline hazard carried forward)."""
        b2 = b.copy()
        m = np.mean([b[RISK_YEARS.index(y)] for y in seen])
        for y in RISK_YEARS:
            if y not in seen:
                b2[RISK_YEARS.index(y)] = m
        return b2

    res = {}
    XB, mu, sd = design(train, B_COLS)
    XBt, _, _ = design(test, B_COLS, mu, sd)
    bB, _ = fit(XB, ytr)
    pB = predict(XBt, carry(bB, TRAIN_YEARS))
    res["B"] = {"auc": auc(yte, pB), "logloss": logloss(yte, pB), "coefs": dict(zip(B_COLS, map(float, bB[K:])))}

    XC, muC, sdC = design(train, C_COLS)
    XCt, _, _ = design(test, C_COLS, muC, sdC)
    # ICAR precision tau chosen by leave-one-year-out CV inside the training years
    best, cv = None, {}
    for tau in (0.3, 1, 3, 10, 30):
        lls = []
        for hold in TRAIN_YEARS[1:]:
            tr = np.array([r["year"] != hold for r in train])
            bb, uu = fit(XC[tr], ytr[tr], gtr[tr], Q, tau)
            seen = [y for y in TRAIN_YEARS if y != hold]
            lls.append(logloss(ytr[~tr], predict(XC[~tr], carry(bb, seen), uu, gtr[~tr])))
        cv[tau] = float(np.mean(lls))
        print(f"   tau={tau}: CV log-loss {cv[tau]:.4f}")
        if best is None or cv[tau] < cv[best]:
            best = tau
    bC, uC = fit(XC, ytr, gtr, Q, best)
    pC = predict(XCt, carry(bC, TRAIN_YEARS), uC, gte)
    res["C"] = {"auc": auc(yte, pC), "logloss": logloss(yte, pC), "tau": best, "cv": cv,
                "coefs": dict(zip(C_COLS, map(float, bC[K:])))}
    # C without the random effect: is it the neighbor terms or the smoothing doing the work?
    bCn, _ = fit(XC, ytr)
    pCn = predict(XCt, carry(bCn, TRAIN_YEARS))
    res["C_noRE"] = {"auc": auc(yte, pCn), "logloss": logloss(yte, pCn)}
    res["null"] = {"auc": 0.5, "logloss": logloss(yte, np.full(len(yte), ytr.mean()))}
    res["test_rows"], res["test_events"] = len(yte), int(yte.sum())
    res["train_rows"], res["train_events"] = len(ytr), int(ytr.sum())
    for k in ("B", "C_noRE", "C"):
        print(f"   {k}: test AUC {res[k]['auc']:.3f}, log-loss {res[k]['logloss']:.4f}")
    print(f"   null log-loss {res['null']['logloss']:.4f}; train {len(ytr)} rows/{int(ytr.sum())} events, "
          f"test {len(yte)}/{int(yte.sum())}")

    # tract-cluster bootstrap of the AUC gap (C - B) on the test years
    tr_te = np.array([r["tract"] for r in test])
    uniq = np.unique(tr_te)
    members = {t: np.where(tr_te == t)[0] for t in uniq}
    gaps = []
    for _ in range(2000):
        pick = np.concatenate([members[t] for t in RNG.choice(uniq, len(uniq))])
        if 0 < yte[pick].sum() < len(pick):
            gaps.append(auc(yte[pick], pC[pick]) - auc(yte[pick], pB[pick]))
    lo, hi = np.percentile(gaps, [2.5, 97.5])
    res["auc_gap"] = {"est": res["C"]["auc"] - res["B"]["auc"], "lo": float(lo), "hi": float(hi)}
    print(f"   AUC gap C-B: {res['auc_gap']['est']:.3f} (95% tract-cluster bootstrap {lo:.3f} to {hi:.3f})")

    # residual clustering under B vs C (training years): tract-level observed - expected
    resid = {"B": np.bincount(gtr, weights=ytr - predict(XB, bB), minlength=len(ar)),
             "C": np.bincount(gtr, weights=ytr - predict(XC, bC, uC, gtr), minlength=len(ar))}
    res["resid_I"] = {k: [round(v, 3) for v in morans_i(r, nb_idx)] for k, r in resid.items()}  # I, p, null mean, 2.5%, 97.5%
    print(f"   residual Moran's I  B: {res['resid_I']['B']}  C: {res['resid_I']['C']}")

    # calibration by quintile of predicted risk on the test years
    def calib(p):
        q = np.quantile(p, np.linspace(0, 1, 6))
        bins = np.clip(np.searchsorted(q, p, side="right") - 1, 0, 4)
        return [{"pred": float(p[bins == k].mean()), "obs": float(yte[bins == k].mean()), "n": int((bins == k).sum())} for k in range(5)]
    res["calib"] = {"B": calib(pB), "C": calib(pC)}

    # "watch list": the 50 riskiest at-risk tracts going into 2016 -- how many tipped in 2016-17?
    def top_hits(p, n=50):
        risk = {}
        for r, pp in zip(test, p):
            if r["year"] == TEST_YEARS[0]:
                risk[r["tract"]] = pp
        top = sorted(risk, key=lambda t: -risk[t])[:n]
        return sum(1 for t in top if ev[t] in TEST_YEARS), len(risk)
    hB, n_risk = top_hits(pB)
    hC, _ = top_hits(pC)
    n_tip = sum(1 for t in ar_model if ev[t] in TEST_YEARS)
    res["top50"] = {"B": hB, "C": hC, "random": round(50 * n_tip / n_risk, 1), "pool": n_risk, "tipped": n_tip}
    print(f"   top-50 watch list hits  B: {hB}  C: {hC}  random ~{res['top50']['random']} (of {n_tip} tipped among {n_risk})")
    out["models"] = res

    # map payload: at-risk tracts with v2 event year, plus the other tracts as context
    def rnd(c):
        return [rnd(x) for x in c] if isinstance(c[0], list) else [round(c[0], 4), round(c[1], 4)]
    feats = []
    re_map = {t: float(uC[gidx[t]]) for t in ar}
    for t in ids:
        g = geoms[t].simplify(0.0003, preserve_topology=True)
        # d3-geo wants clockwise outer rings (the opposite of RFC 7946)
        g = orient(g, -1.0) if g.geom_type == "Polygon" else MultiPolygon([orient(q, -1.0) for q in g.geoms])
        gj = g.__geo_interface__
        feats.append({"type": "Feature", "geometry": {"type": gj["type"], "coordinates": rnd(json.loads(json.dumps(gj["coordinates"])))},
                      "properties": {"t": t, "nta": meta[t]["ntaname"], "r": int(t in at_risk),
                                     "e1": evs["v1"].get(t), "e2": evs["v2"].get(t), "e3": evs["v3"].get(t),
                                     "u": round(re_map[t], 3) if t in re_map else None}})
    out["geo"] = {"type": "FeatureCollection", "features": feats}
    if RULE == "v2":
        bx.write("models_check", out)
    else:  # sensitivity rerun: model numbers only, no map
        bx.write(f"models_check_{RULE}", {k: v for k, v in out.items() if k != "geo"})
    print(f"done ({time.time() - t0:.0f}s)")


if __name__ == "__main__":
    main()
