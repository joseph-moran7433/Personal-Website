"""
build_signals.py -- Part 5: the first spatio-temporal model with real signals.

Part 4 (build_models.py) tested the two model frames on the outcome alone. This
script puts the first real gentrification signals in and compares exactly two
models on them:

  Model B  discrete-time hazard: year dummies + baseline + own change + own signals (t-1)
  Model C  spatio-temporal hazard: B + neighbors' change and signals (t-1)
           + ICAR tract random effect (penalized likelihood = posterior mode)

Signals (DOB permit issuance, BIS `ipu4-2q9a`, counted as distinct jobs per tract-year,
per 1,000 households in 2006-10):
  A1  major alteration (change of use / occupancy: the "renovation" signal)
  NB  new building
  DM  full demolition
Restaurant history is NOT in: DOHMH keeps ~3 years and the SLA liquor data resets issue
dates on renewal, so neither reaches back to 2010-16 (see the page for the gap).

Then three robustness passes:
  1. Sensitivity: change one analysis choice at a time, refit both models, record
     what moves (events, signal odds ratios, held-out AUC, clustered errors).
  2. Data noise: re-draw every ACS estimate inside its own margin of error
     (correlated across overlapping 5-year vintages), rebuild the outcome, refit.
  3. "If I had done it differently": counterfactual choices that would have
     changed the answer (hindsight leak, no held-out years, v1 events, B alone).

Needs requests, numpy, scipy, shapely and the Census key. Reuses build_models.py.
Usage:  python build_signals.py      (writes ../assets/nyc-explorer/models_signals.json)
"""

import json
import time
from datetime import datetime, timezone

import numpy as np

import build_explorer_data as bx
import build_models as bm

PERMITS = "ipu4-2q9a"
BORO = {"MANHATTAN": "1", "BRONX": "2", "BROOKLYN": "3", "QUEENS": "4", "STATEN ISLAND": "5"}
SIGNALS = {"A1": ("AL", "Renovation permits", "major alterations (change of use)"),
           "NB": ("NB", "New-building permits", "new buildings"),
           "DM": ("DM", "Demolition permits", "full demolitions")}
SIG_YEARS = list(range(2008, 2019))
RNG = np.random.default_rng(4915)
K = len(bm.RISK_YEARS)


# ── 1. signal pulls ──────────────────────────────────────────────────
def tract_code(boro, s, valid):
    """BIS writes tract 702.01 as '70201' and tract 616 as '616'. Try the
    likely reading first, then the other, and keep whichever is a real 2010 tract."""
    if not boro or not s or not s.isdigit():
        return None
    a = boro + (s.zfill(4) + "00" if len(s) <= 4 else s.zfill(6))
    b = boro + s.zfill(6)
    return a if a in valid else b if b in valid else None


def pull_permits():
    out = {}
    for job, (ptype, _, _) in SIGNALS.items():
        for y in SIG_YEARS:
            rows = bx.soql_all(bx.NYC, PERMITS, select="borough, gis_census_tract, count(distinct job__) as n",
                               where=f"job_type='{job}' and permit_type='{ptype}' and filing_status='INITIAL' "
                                     f"and issuance_date like '%/{y}'",
                               group="borough, gis_census_tract")
            out[f"{job}_{y}"] = rows
            print(f"   permits {job} {y}: {sum(int(r['n']) for r in rows):,} jobs in {len(rows)} tracts")
    return out


def pull_moe(key):
    """Margins of error for the outcome's two inputs (median rent, BA share)."""
    get = ",".join(["B25064_001M", "B15002_001E", "B15002_001M"] + [v + s for v in bm.B15002_BA for s in ("E", "M")])
    out = {}
    for y in bm.YEARS:
        rows = []
        for county in bm.COUNTY_BORO:
            rows += bx.census_get(f"{y}/acs/acs5", {"get": get, "for": "tract:*", "in": f"state:36 county:{county}"}, key) or []
        out[y] = {bm.COUNTY_BORO[r["county"]] + r["tract"]: {k: r[k] for k in r if k[-1] in "EM"} for r in rows}
        print(f"   acs5 MOE {y}: {len(out[y])} tracts")
    return out


# ── 2. panel pieces that the sensitivity runs vary ───────────────────
def changes(ind, ids):
    base = ind[2010]
    d_rent = {y: {t: ind[y][t]["rent"] / base[t]["rent"] - 1 for t in ids} for y in bm.YEARS[1:]}
    d_ba = {y: {t: ind[y][t]["ba"] - base[t]["ba"] for t in ids} for y in bm.YEARS[1:]}
    return d_rent, d_ba


def at_risk_set(ind, ids, q):
    inc0 = np.array([ind[2010][t]["income"] for t in ids])
    cut = np.quantile(inc0, q)
    return {t for t, v in zip(ids, inc0) if v <= cut}, float(cut)


def knn_neighbors(geoms, ids, k=6):
    pts = np.array([[geoms[t].centroid.x, geoms[t].centroid.y * 1.0] for t in ids])
    pts[:, 0] *= np.cos(np.radians(40.7))  # degrees of longitude are shorter at NYC's latitude
    nb = {}
    for i, t in enumerate(ids):
        d = np.hypot(*(pts - pts[i]).T)
        nb[t] = [ids[j] for j in np.argsort(d)[1:k + 1]]
    return nb


def signal_table(permits, ids, hh, scale="rate"):
    """{job: {year: {tract: value}}} -- log(1 + permits per 1,000 households), or log(1 + count)."""
    valid = set(ids)
    raw = {job: {y: {t: 0 for t in ids} for y in SIG_YEARS} for job in SIGNALS}
    matched = total = 0
    for key, rows in permits.items():
        job, y = key.split("_")
        for r in rows:
            n = int(r["n"])
            total += n
            t = tract_code(BORO.get(r.get("borough")), r.get("gis_census_tract"), valid)
            if t:
                raw[job][int(y)][t] += n
                matched += n
    tab = {job: {y: {t: float(np.log1p(1000 * c / hh[t] if scale == "rate" else c)) for t, c in v.items()}
                 for y, v in raw[job].items()} for job in SIGNALS}
    return tab, raw, matched / total


def add_signals(rows, sig, nb, lag=1, window=1):
    """Signal at t-lag (or the mean of t-lag .. t-lag-window+1), own and neighbors' mean."""
    for r in rows:
        yrs = [r["year"] - lag - k for k in range(window)]
        for job in SIGNALS:
            r[f"s_{job}"] = float(np.mean([sig[job][y][r["tract"]] for y in yrs]))
            ns = nb[r["tract"]]
            r[f"n_{job}"] = float(np.mean([sig[job][y][n] for y in yrs for n in ns])) if ns else 0.0
    return rows


S_OWN = [f"s_{j}" for j in SIGNALS]
S_NB = [f"n_{j}" for j in SIGNALS]
B_COLS = bm.B_COLS + S_OWN
C_COLS = bm.C_COLS + S_OWN + S_NB


# ── 3. fitting helpers ───────────────────────────────────────────────
def hessian_se(X, y, b, u=None, g=None, Q=None, tau=None, ridge=1e-2):
    """SEs of b from the inverse Hessian of the penalized log-likelihood at the mode
    (for C this is the Laplace approximation, integrating over the tract effects u)."""
    eta = X @ b + (u[g] if u is not None else 0)
    mu = 1 / (1 + np.exp(-eta))
    w = mu * (1 - mu)
    p = X.shape[1]
    Hbb = X.T @ (X * w[:, None]) + np.diag([1e-6] * K + [ridge] * (p - K))  # jitter: a held-out year's dummy column is all zero
    if u is None:
        return np.sqrt(np.diag(np.linalg.inv(Hbb)))
    nu = Q.shape[0]
    G = np.zeros((len(y), nu))
    G[np.arange(len(y)), g] = 1
    Hbu = X.T @ (G * w[:, None])
    Huu = np.diag(np.bincount(g, weights=w, minlength=nu)) + tau * Q.toarray() + 0.1 * np.eye(nu)
    H = np.block([[Hbb, Hbu], [Hbu.T, Huu]])
    return np.sqrt(np.diag(np.linalg.inv(H))[:p])


def carry(b, seen):
    b2 = b.copy()
    m = np.mean([b[bm.RISK_YEARS.index(y)] for y in seen])
    for y in bm.RISK_YEARS:
        if y not in seen:
            b2[bm.RISK_YEARS.index(y)] = m
    return b2


def run(cfg, P, tau=None, full=False):
    """Build the outcome + person-period rows for one configuration, fit B and C on the
    training years, score on the test years. cfg keys: rule, q, nb, lag, window, scale,
    train, test, tau_mult, ind (optional noisy indicators)."""
    ind = cfg.get("ind", P["ind"])
    ids = P["ids"]
    nb = P["nb_knn"] if cfg["nb"] == "knn" else P["nb"]
    at_risk, cut = at_risk_set(ind, ids, cfg["q"])
    d_rent, d_ba = changes(ind, ids)
    ev, flips = bm.event_years(at_risk, d_rent, d_ba, cfg["rule"])
    ar = sorted(at_risk)
    ar_model = [t for t in ar if ev[t] is None or ev[t] >= bm.RISK_YEARS[0]]
    rows = bm.person_period(ar_model, ev, ind, nb, d_rent, d_ba, bm.RISK_YEARS)
    sig = P["sig_rate"] if cfg["scale"] == "rate" else P["sig_count"]
    add_signals(rows, sig, nb, cfg["lag"], cfg["window"])
    train = [r for r in rows if r["year"] in cfg["train"]]
    test = [r for r in rows if r["year"] in cfg["test"]]
    ytr = np.array([r["y"] for r in train], float)
    yte = np.array([r["y"] for r in test], float)
    Q, gidx = bm.icar_Q(ar, nb)
    gtr = np.array([gidx[r["tract"]] for r in train])
    gte = np.array([gidx[r["tract"]] for r in test])

    out = {"n_at_risk": len(ar), "income_cut": round(cut), "events": sum(1 for t in ar if ev[t]),
           "events_model": sum(1 for t in ar_model if ev[t]), "flip_back": flips,
           "train_events": int(ytr.sum()), "test_events": int(yte.sum()), "test_rows": len(yte)}
    fits = {}
    for name, cols, re in (("B", B_COLS, False), ("C", C_COLS, True)):
        X, mu, sd = bm.design(train, cols)
        Xt, _, _ = bm.design(test, cols, mu, sd)
        if re:
            t_ = tau * cfg.get("tau_mult", 1)
            b, u = bm.fit(X, ytr, gtr, Q, t_)
            p_te = bm.predict(Xt, carry(b, cfg["train"]), u, gte)
            p_tr = bm.predict(X, b, u, gtr)
            se = hessian_se(X, ytr, b, u, gtr, Q, t_)
        else:
            b, u = bm.fit(X, ytr)
            p_te = bm.predict(Xt, carry(b, cfg["train"]))
            p_tr = bm.predict(X, b)
            se = hessian_se(X, ytr, b)
        coefs = {c: {"b": float(b[K + i]), "se": float(se[K + i])} for i, c in enumerate(cols)}
        fits[name] = {"auc": bm.auc(yte, p_te), "auc_train": bm.auc(ytr, p_tr), "logloss": bm.logloss(yte, p_te),
                      "coefs": coefs, "_p": p_te, "_ptr": p_tr, "_b": b, "_u": u, "_mu": mu, "_sd": sd}
    out["B"] = {k: v for k, v in fits["B"].items() if not k.startswith("_")}
    out["C"] = {k: v for k, v in fits["C"].items() if not k.startswith("_")}

    pos = {t: i for i, t in enumerate(ar)}
    nb_idx = [[pos[n] for n in nb[t] if n in pos] for t in ar]
    for name in ("B", "C"):
        resid = np.bincount(gtr, weights=ytr - fits[name]["_ptr"], minlength=len(ar))
        I, p, _, lo, hi = bm.morans_i(resid, nb_idx, perms=999 if full else 199)
        out[name]["resid_I"] = [round(I, 3), round(p, 3), round(lo, 3), round(hi, 3)]
    if full:
        out["_ctx"] = dict(ar=ar, ar_model=ar_model, ev=ev, rows=rows, train=train, test=test, ytr=ytr, yte=yte,
                           gtr=gtr, gte=gte, Q=Q, gidx=gidx, nb=nb, nb_idx=nb_idx, fits=fits, sig=sig)
    return out


def odds(c):
    return {"or": round(float(np.exp(c["b"])), 3), "lo": round(float(np.exp(c["b"] - 1.96 * c["se"])), 3),
            "hi": round(float(np.exp(c["b"] + 1.96 * c["se"])), 3), "z": round(c["b"] / c["se"], 2)}


def slim(r):
    """What the page needs from one sensitivity run."""
    return {"n_at_risk": r["n_at_risk"], "events": r["events"], "test_events": r["test_events"],
            **{m: {"auc": round(r[m]["auc"], 3), "resid_I": r[m]["resid_I"],
                   "sig": {s: odds(r[m]["coefs"][s]) for s in S_OWN},
                   **({"nbsig": {s: odds(r[m]["coefs"][s]) for s in S_NB}} if m == "C" else {})} for m in ("B", "C")}}


# ── 4. main ──────────────────────────────────────────────────────────
def main():
    t0 = time.time()
    key = bx.census_key()
    print("cached ACS + shapes + neighbors (from build_models.py) ...")
    acs = bm.cached("acs5_tracts_2010_2019", lambda: bm.pull_acs(key))
    shapes = bm.cached("tracts2010", bm.pull_shapes)
    ids, geoms, meta, ind, _, _, _, _ = bm.build_panel(acs, shapes)
    nb_all = bm.cached("queen_nb", lambda: {k: sorted(v) for k, v in bm.queen_neighbors(geoms, ids).items()})
    idset = set(ids)
    nb = {t: [n for n in nb_all.get(t, []) if n in idset] for t in ids}
    nb_knn = knn_neighbors(geoms, ids)
    hh = {t: max(bm.val(acs["2010"][t], "B25003_001") or 1, 1) for t in ids}

    print("DOB permits by tract-year ...")
    permits = bm.cached("dob_permits_2008_2018", pull_permits)
    sig_rate, raw, match = signal_table(permits, ids, hh, "rate")
    sig_count, _, _ = signal_table(permits, ids, hh, "count")
    print(f"   {100 * match:.1f}% of permit jobs matched to a modeled 2010 tract")
    print("ACS margins of error ...")
    moe = bm.cached("acs5_moe_2010_2019", lambda: pull_moe(key))

    P = dict(ind=ind, ids=ids, nb=nb, nb_knn=nb_knn, sig_rate=sig_rate, sig_count=sig_count)
    BASE = dict(rule="v2", q=0.4, nb="queen", lag=1, window=1, scale="rate",
                train=bm.TRAIN_YEARS, test=bm.TEST_YEARS)

    # ── main fit; tau by leave-one-year-out CV inside the training years (as in Part 4)
    print("main fit: picking tau ...")
    cv = {}
    for tau in (0.3, 1, 3, 10, 30):
        lls = []
        for hold in bm.TRAIN_YEARS[1:]:
            cfg = dict(BASE, train=[y for y in bm.TRAIN_YEARS if y != hold], test=[hold])
            r = run(cfg, P, tau)
            lls.append(r["C"]["logloss"])
        cv[tau] = float(np.mean(lls))
        print(f"   tau={tau}: CV log-loss {cv[tau]:.4f}")
    tau = min(cv, key=cv.get)
    main_ = run(BASE, P, tau, full=True)
    ctx = main_.pop("_ctx")
    fits, yte, test = ctx["fits"], ctx["yte"], ctx["test"]
    for m in ("B", "C"):
        print(f"   {m}: AUC {main_[m]['auc']:.3f}  " + "  ".join(f"{s} OR {odds(main_[m]['coefs'][s])['or']}" for s in S_OWN))

    # same two models without the permit signals (Part 4's frames) on the same rows: what did signals add?
    nosig = {}
    for m, cols, re in (("B", bm.B_COLS, False), ("C", bm.C_COLS, True)):
        X, mu, sd = bm.design(ctx["train"], cols)
        Xt, _, _ = bm.design(test, cols, mu, sd)
        b, u = bm.fit(X, ctx["ytr"], ctx["gtr"], ctx["Q"], tau) if re else bm.fit(X, ctx["ytr"])
        p = bm.predict(Xt, carry(b, bm.TRAIN_YEARS), u if re else None, ctx["gte"] if re else None)
        nosig[m] = {"auc": round(bm.auc(yte, p), 3), "logloss": round(bm.logloss(yte, p), 4), "_p": p}

    # tract-cluster bootstrap: C - B with signals, and signals vs no signals within each model
    tr_te = np.array([r["tract"] for r in test])
    uniq = np.unique(tr_te)
    members = {t: np.where(tr_te == t)[0] for t in uniq}
    gaps = {"C_minus_B": [], "B_signal_gain": [], "C_signal_gain": []}
    for _ in range(2000):
        pick = np.concatenate([members[t] for t in RNG.choice(uniq, len(uniq))])
        yy = yte[pick]
        if 0 < yy.sum() < len(pick):
            a = {k: bm.auc(yy, v[pick]) for k, v in (("B", fits["B"]["_p"]), ("C", fits["C"]["_p"]),
                                                       ("B0", nosig["B"]["_p"]), ("C0", nosig["C"]["_p"]))}
            gaps["C_minus_B"].append(a["C"] - a["B"])
            gaps["B_signal_gain"].append(a["B"] - a["B0"])
            gaps["C_signal_gain"].append(a["C"] - a["C0"])
    gap_ci = {k: {"lo": round(float(np.percentile(v, 2.5)), 3), "hi": round(float(np.percentile(v, 97.5)), 3)}
              for k, v in gaps.items()}
    gap_ci["C_minus_B"]["est"] = round(main_["C"]["auc"] - main_["B"]["auc"], 3)
    gap_ci["B_signal_gain"]["est"] = round(main_["B"]["auc"] - nosig["B"]["auc"], 3)
    gap_ci["C_signal_gain"]["est"] = round(main_["C"]["auc"] - nosig["C"]["auc"], 3)
    print(f"   gaps: {gap_ci}")

    # watch list (top 50 going into the first test year)
    ev = ctx["ev"]

    def top_hits(p, n=50):
        risk = {r["tract"]: pp for r, pp in zip(test, p) if r["year"] == bm.TEST_YEARS[0]}
        top = sorted(risk, key=lambda t: -risk[t])[:n]
        return sum(1 for t in top if ev[t] in bm.TEST_YEARS), len(risk)
    hB, pool = top_hits(fits["B"]["_p"])
    hC, _ = top_hits(fits["C"]["_p"])
    n_tip = sum(1 for t in ctx["ar_model"] if ev[t] in bm.TEST_YEARS)
    top50 = {"B": hB, "C": hC, "random": round(50 * n_tip / pool, 1), "pool": pool, "tipped": n_tip}

    # ── descriptive: do permits rise BEFORE a tract tips? (event-time means, v2)
    ar = ctx["ar"]
    ev_time = {}
    for job in SIGNALS:
        rel = {k: [] for k in range(-4, 2)}
        for t in ar:
            if ev[t] and ev[t] >= 2012:
                for k in rel:
                    y = ev[t] + k
                    if y in raw[job]:
                        rel[k].append(1000 * raw[job][y][t] / hh[t])
        never = [t for t in ar if not ev[t]]
        base_ = float(np.mean([1000 * raw[job][y][t] / hh[t] for t in never for y in range(2009, 2018)]))
        ev_time[job] = {"rel": {k: round(float(np.mean(v)), 3) for k, v in rel.items()},
                        "n": {k: len(v) for k, v in rel.items()}, "never": round(base_, 3)}

    # ── "what changes impact other aspects": a +1 SD shock to one tract's signal, read through C
    C_ = fits["C"]
    cols = C_COLS
    h0 = float(np.mean(ctx["ytr"]))
    eta0 = float(np.log(h0 / (1 - h0)))
    ripple = {}
    for job in SIGNALS:
        b_own = C_["_b"][K + cols.index(f"s_{job}")]
        b_nb = C_["_b"][K + cols.index(f"n_{job}")]
        # a +1 SD jump in one tract moves each neighbor's neighbor-mean by 1 SD(own)/n_neighbors; express in n_ SD units
        sd_own, sd_nb = C_["_sd"][cols.index(f"s_{job}")], C_["_sd"][cols.index(f"n_{job}")]
        n_nb = float(np.median([len(ctx["nb"][t]) for t in ar]))
        d_nb = b_nb * (sd_own / n_nb) / sd_nb
        bB = fits["B"]["_b"][K + B_COLS.index(f"s_{job}")]
        sig_p = lambda e: 1 / (1 + np.exp(-e))
        ripple[job] = {"base": round(h0, 4), "own_B": round(float(sig_p(eta0 + bB)), 4),
                       "own_C": round(float(sig_p(eta0 + b_own)), 4), "each_nb_C": round(float(sig_p(eta0 + d_nb)), 4),
                       "n_nb": n_nb}

    # ── sensitivity: one change at a time
    print("sensitivity runs ...")
    SCEN = [
        ("base", "Baseline (as fit above)", {}),
        ("v1", "Event: v1 naive (first crossing)", {"rule": "v1"}),
        ("v3", "Event: v3 strict (top third)", {"rule": "v3"}),
        ("q30", "At risk: bottom 30% income", {"q": 0.3}),
        ("q50", "At risk: bottom 50% income", {"q": 0.5}),
        ("knn", "Neighbors: 6 nearest, not touching", {"nb": "knn"}),
        ("lag2", "Signal lag: 2 years, not 1", {"lag": 2}),
        ("win2", "Signal: 2-year average", {"window": 2}),
        ("count", "Signal: raw count, not per household", {"scale": "count"}),
        ("split", "Test years 2015–17 (train 2012–14)", {"train": [2012, 2013, 2014], "test": [2015, 2016, 2017]}),
        ("tau_lo", f"Spatial prior weaker (τ ÷ 3)", {"tau_mult": 1 / 3}),
        ("tau_hi", f"Spatial prior stronger (τ × 3)", {"tau_mult": 3}),
    ]
    sens = []
    for k, lab, ch in SCEN:
        r = main_ if k == "base" else run(dict(BASE, **ch), P, tau)
        sens.append({"key": k, "label": lab, **slim(r)})
        print(f"   {k:7s} events {r['events']:4d}  AUC B {r['B']['auc']:.3f} C {r['C']['auc']:.3f}  "
              f"A1 OR B {odds(r['B']['coefs']['s_A1'])['or']} C {odds(r['C']['coefs']['s_A1'])['or']}")

    # ── data noise: redraw rent and BA share inside their ACS margins of error
    print("data-noise Monte Carlo ...")
    rho, R = 0.8, 30  # adjacent 5-yr vintages share 4 of 5 survey years -> strongly correlated errors

    def ba_se(y, t):
        m = moe[str(y)].get(t)
        if not m:
            return 0.0
        den = bm.val(m, "B15002_001") or 0
        num_ = sum(bm.val(m, v) or 0 for v in bm.B15002_BA)
        if not den:
            return 0.0
        moe_num = np.sqrt(sum((bx.num(m.get(v + "M"), 0) or 0) ** 2 for v in bm.B15002_BA))
        moe_den = bx.num(m.get("B15002_001M"), 0) or 0
        p = num_ / den
        inside = moe_num ** 2 - p ** 2 * moe_den ** 2
        if inside < 0:
            inside = moe_num ** 2 + p ** 2 * moe_den ** 2
        return 100 * np.sqrt(inside) / den / 1.645

    def rent_se(y, t):
        m = moe[str(y)].get(t)
        v = bx.num(m.get("B25064_001M"), -1) if m else -1
        return v / 1.645 if v and v > 0 else 0.0
    se_r = {y: {t: rent_se(y, t) for t in ids} for y in bm.YEARS}
    se_b = {y: {t: ba_se(y, t) for t in ids} for y in bm.YEARS}
    med_rel = float(np.median([se_r[y][t] / ind[y][t]["rent"] for y in bm.YEARS for t in ids if ind[y][t]["rent"]]))
    med_ba = float(np.median([se_b[y][t] for y in bm.YEARS for t in ids]))
    print(f"   median SE: rent {100 * med_rel:.1f}% of the estimate, BA share {med_ba:.1f} pts")
    base_ev = ctx["ev"]
    mc = []
    for rep in range(R):
        zr = {t: 0.0 for t in ids}
        zb = {t: 0.0 for t in ids}
        noisy = {}
        for y in bm.YEARS:
            e_r, e_b = RNG.standard_normal(len(ids)), RNG.standard_normal(len(ids))
            noisy[y] = {}
            for i, t in enumerate(ids):
                zr[t] = rho * zr[t] + np.sqrt(1 - rho ** 2) * e_r[i] if y > 2010 else e_r[i]
                zb[t] = rho * zb[t] + np.sqrt(1 - rho ** 2) * e_b[i] if y > 2010 else e_b[i]
                d = dict(ind[y][t])
                d["rent"] = max(50.0, d["rent"] + zr[t] * se_r[y][t])
                d["ba"] = min(100.0, max(0.0, d["ba"] + zb[t] * se_b[y][t]))
                noisy[y][t] = d
        r = run(dict(BASE, ind=noisy), P, tau)
        at_r, _ = at_risk_set(noisy, ids, 0.4)
        d_rent, d_ba = changes(noisy, ids)
        ev_n, _ = bm.event_years(at_r, d_rent, d_ba, "v2")
        same = set(ctx["ar"]) & at_r
        changed = sum(1 for t in same if bool(ev_n[t]) != bool(base_ev[t]))
        mc.append({"events": r["events"], "status_changed": changed, "n_compared": len(same),
                   "auc_B": round(r["B"]["auc"], 3), "auc_C": round(r["C"]["auc"], 3),
                   **{f"{m}_{s}": odds(r[m]["coefs"][s])["or"] for m in ("B", "C") for s in S_OWN},
                   "I_B": r["B"]["resid_I"][0], "pI_B": r["B"]["resid_I"][1],
                   "I_C": r["C"]["resid_I"][0], "pI_C": r["C"]["resid_I"][1]})
        print(f"   rep {rep + 1:2d}: events {r['events']}, {changed} tracts flip status, AUC B {mc[-1]['auc_B']} C {mc[-1]['auc_C']}")

    # ── "if I had done it differently": counterfactuals that change the answer
    print("counterfactuals ...")
    cf = {}
    # (a) hindsight leak: let C see neighbors' *confirmed* events (needs data from t+2)
    leak_cols = C_COLS + ["nb_tipped_hindsight"]
    X, mu, sd = bm.design(ctx["train"], leak_cols)
    Xt, _, _ = bm.design(test, leak_cols, mu, sd)
    b, u = bm.fit(X, ctx["ytr"], ctx["gtr"], ctx["Q"], tau)
    cf["leak"] = {"auc": round(bm.auc(yte, bm.predict(Xt, carry(b, bm.TRAIN_YEARS), u, ctx["gte"])), 3)}
    # (b) graded on the years it trained on
    cf["insample"] = {m: round(main_[m]["auc_train"], 3) for m in ("B", "C")}
    # (c) v1 events / (d) B alone -> its confidence intervals vs C's
    cf["v1"] = next(s for s in sens if s["key"] == "v1")
    cf["width"] = {s: {m: round(float(np.log(odds(main_[m]["coefs"][s])["hi"] / odds(main_[m]["coefs"][s])["lo"])), 3)
                       for m in ("B", "C")} for s in S_OWN}

    # map payload: per-tract renovation-permit rate 2011-16 (geometry comes from models_check.json)
    map_rate = {t: round(1000 * sum(raw["A1"][y][t] for y in range(2011, 2017)) / hh[t], 1) for t in ids}

    out = {
        "built_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "signals": {j: {"label": SIGNALS[j][1], "what": SIGNALS[j][2],
                        "total": {y: sum(raw[j][y].values()) for y in SIG_YEARS}} for j in SIGNALS},
        "permit_match": round(match, 4), "tau": tau, "cv": cv,
        "main": {k: v for k, v in main_.items() if k not in ("B", "C")},
        "models": {m: {"auc": round(main_[m]["auc"], 3), "auc_nosig": nosig[m]["auc"],
                       "logloss": round(main_[m]["logloss"], 4), "logloss_nosig": nosig[m]["logloss"],
                       "resid_I": main_[m]["resid_I"],
                       "coefs": {c: {**odds(v), "b": round(v["b"], 4), "se": round(v["se"], 4)} for c, v in main_[m]["coefs"].items()}}
                   for m in ("B", "C")},
        "gaps": gap_ci, "top50": top50, "event_time": ev_time, "ripple": ripple,
        "sensitivity": sens,
        "noise": {"reps": mc, "rho": rho, "median_rent_se_pct": round(100 * med_rel, 1), "median_ba_se_pts": round(med_ba, 1),
                  "base_events": main_["events"]},
        "counterfactual": cf, "map_A1": map_rate,
    }
    bx.write("models_signals", out)
    print(f"done ({time.time() - t0:.0f}s)")


if __name__ == "__main__":
    main()
