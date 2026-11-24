"""Figures for the redone Step 5 results (instructor feedback) and for Step 6 sensitivity.
Reads data/full/step6_*.csv (step6_sensitivity.py) and paths_full.csv. Run: python step6_figures.py"""
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from scipy.stats import binom

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "full"
OUT = ROOT.parent / "assets" / "defense-leakage"
INK, INK2, MUTED, GRID, BAND, BAND2 = "#0b0b0b", "#52514e", "#8a8984", "#e4e3df", "#e9e8e4", "#d3d2cc"
BLUE, ORANGE, GREEN, YELLOW, PURPLE = "#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#6250d6"
BG = "#fcfcfb"
plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 12, "axes.edgecolor": INK2, "axes.labelcolor": INK,
                     "xtick.color": INK2, "ytick.color": INK2, "axes.spines.top": False, "axes.spines.right": False,
                     "figure.facecolor": BG, "axes.facecolor": BG})
ORDER = ["LMT", "RTX", "NOC", "GD", "HII", "LHX", "LDOS", "BA", "TXT"]
NAMES = {"LMT": "Lockheed", "RTX": "RTX", "NOC": "Northrop", "GD": "General Dynamics", "HII": "Huntington Ingalls",
         "LHX": "L3Harris", "LDOS": "Leidos", "BA": "Boeing", "TXT": "Textron"}


def style(ax, axis="y"):
    ax.grid(axis=axis, color=GRID, lw=0.8)
    ax.set_axisbelow(True)


def window_shade(ax):
    ax.axvspan(-10.5, -0.5, color=BLUE, alpha=0.06, lw=0)
    ax.axvline(0, color=INK2, lw=1, ls="--")


# ------------------------------------------------------------------ 1. actual vs expected vs abnormal
def decomposition():
    p = pd.read_csv(DATA / "step6_deal_paths.csv")
    p["exp"] = p.raw - p.ar
    p = p.sort_values(["i", "day"])
    for c in ["raw", "exp", "ar"]:
        p["c_" + c] = p.groupby("i")[c].cumsum() * 100
    m = p.groupby("day")[["c_raw", "c_exp", "c_ar"]].mean()
    band = pd.read_csv(DATA / "step6_mean_band.csv").set_index("day") * 100
    fig, axs = plt.subplots(2, 1, figsize=(10, 10))
    ax = axs[0]
    style(ax); window_shade(ax)
    ax.plot(m.index, m.c_raw, color=INK, lw=2.4, marker="o", ms=4, label="Actual: what the stock did")
    ax.plot(m.index, m.c_exp, color=GREEN, lw=2.4, marker="o", ms=4, label="Expected: what M4 predicted from the market + peers")
    ax.fill_between(m.index, m.c_exp, m.c_raw, color=BLUE, alpha=0.18, lw=0, label="Abnormal = actual − expected")
    ax.axhline(0, color=INK2, lw=0.8)
    ax.set_title("A. Average deal: the stock rises, just less than expected", loc="left", weight="bold", fontsize=13)
    ax.set_xlabel("Trading days from announcement (0 = first day after)")
    ax.set_ylabel("Cumulative return from day −10 (%)")
    ax.legend(frameon=False, loc="upper left", fontsize=10.5)
    ax = axs[1]
    style(ax); window_shade(ax)
    ax.fill_between(band.index, band.lo, band.hi, color=BAND2, lw=0, label="95% chance range: 426 random ordinary days")
    ax.plot(m.index, m.c_ar, color=BLUE, lw=2.6, marker="o", ms=4, label="426 real deals (average)")
    ax.axhline(0, color=INK2, lw=0.8)
    ax.set_ylim(-1.2, 1.2)
    ax.set_title("B. Average abnormal return vs. the chance range", loc="left", weight="bold", fontsize=13)
    ax.set_xlabel("Trading days from announcement (0 = first day after)")
    ax.set_ylabel("Cumulative abnormal return (%)")
    ax.legend(frameon=False, loc="upper left", fontsize=10.5)
    fig.tight_layout()
    fig.savefig(OUT / "step5_decomp.png", dpi=130)
    plt.close(fig)
    return m, band


# ------------------------------------------------------------------ 2. every deal, not just the average
def deal_paths():
    p = pd.read_csv(DATA / "step6_deal_paths.csv").sort_values(["i", "day"])
    p["c"] = p.groupby("i").ar.cumsum() * 100
    d = pd.read_csv(DATA / "step6_deals.csv")
    wide = p.pivot(index="i", columns="day", values="c")
    fig, ax = plt.subplots(figsize=(15, 6.4))
    style(ax); window_shade(ax)
    for i, row in wide.iterrows():
        ax.plot(row.index, row.values, color=MUTED, lw=0.5, alpha=0.12)
    q = wide.quantile([0.1, 0.25, 0.75, 0.9])
    ax.fill_between(wide.columns, q.loc[0.1], q.loc[0.9], color=BLUE, alpha=0.10, lw=0, label="Middle 80% of deals")
    ax.fill_between(wide.columns, q.loc[0.25], q.loc[0.75], color=BLUE, alpha=0.18, lw=0, label="Middle 50% of deals")
    ax.plot(wide.columns, wide.mean(), color=BLUE, lw=2.8, label="Average (the line in chart B)")
    # standouts: lowest one-sided p for a run-up
    top = d.nsmallest(5, "p_up")
    labs = []
    for _, r in top.iterrows():
        row = wide.loc[r.name]
        ax.plot(row.index, row.values.clip(-21, 21), color=ORANGE, lw=1.8)
        y_end = float(np.clip(row.loc[10], -19, 19))
        labs.append([y_end, f"{NAMES[r.tic]} {pd.Timestamp(r.day0):%b %Y}", y_end])
    labs.sort()
    for k in range(1, len(labs)):  # spread labels so they don't overlap
        labs[k][0] = max(labs[k][0], labs[k - 1][0] + 2.2)
    for y, t, y0 in labs:
        ax.plot([10, 10.5], [y0, y], color=INK2, lw=0.7)
        ax.text(10.6, y, t, fontsize=10, color=INK, va="center")
    ax.plot([], [], color=ORANGE, lw=1.8, label="5 strongest run-ups (lowest p)")
    ax.plot([], [], color=MUTED, lw=0.8, label="One grey line per deal")
    ax.axhline(0, color=INK2, lw=0.8)
    ax.set_ylim(-20, 20)
    ax.set_xlim(-10, 14.2)
    ax.set_xticks(range(-10, 11, 2))
    ax.set_xlabel("Trading days from announcement (0 = first day after)")
    ax.set_ylabel("Cumulative abnormal return from day −10 (%)")
    ax.legend(frameon=True, facecolor=BG, edgecolor="none", framealpha=0.95, loc="lower left", fontsize=10.5, ncol=2)
    fig.tight_layout()
    fig.savefig(OUT / "step5_deal_paths.png", dpi=130)
    plt.close(fig)
    return q


# ------------------------------------------------------------------ 3. volume vs earnings (kept from the old chart 1)
def volume():
    d = pd.read_csv(DATA / "paths_full.csv")
    fig, ax = plt.subplots(figsize=(15, 4.6))
    style(ax); window_shade(ax)
    for g, c, name in [("Main: clean events (no earnings nearby)", BLUE, "426 real deals"),
                       ("Comparison: earnings releases", ORANGE, "Real earnings releases (a known market-moving event)")]:
        s = d[(d.group == g) & (d.model == "V2")].sort_values("day")
        y = s.mean_cum.diff().fillna(s.mean_cum.iloc[0])
        ax.plot(s.day, np.exp(y), color=c, lw=2.4, marker="o", ms=4, label=name)
    ax.axhline(1, color=INK2, lw=0.8)
    ax.set_xlabel("Trading days from announcement (0 = first day after)")
    ax.set_ylabel("Volume vs. normal (×)")
    ax.legend(frameon=False, loc="upper left", fontsize=10.5)
    fig.tight_layout()
    fig.savefig(OUT / "step5_volume.png", dpi=130)
    plt.close(fig)


# ------------------------------------------------------------------ 4. p-values, both ends
def pvals():
    d = pd.read_csv(DATA / "step6_deals.csv")
    n = len(d)
    bins = np.linspace(0, 1, 21)
    cnt, _ = np.histogram(d.p_up, bins=bins)
    lo, hi = binom.ppf(0.05, n, 0.05), binom.ppf(0.95, n, 0.05)
    fig, ax = plt.subplots(figsize=(15, 5.2))
    style(ax)
    cols = [ORANGE] + [BLUE] * 18 + [PURPLE]
    ax.bar(bins[:-1] + 0.025, cnt, width=0.046, color=cols, alpha=0.9)
    ax.fill_between([0, 1], lo, hi, color=BAND2, alpha=0.6, lw=0, zorder=0, label=f"90% chance range per bar ({lo:.0f}–{hi:.0f})")
    ax.axhline(n / 20, color=INK, lw=1.4, ls="--", label=f"Chance: {n/20:.1f} deals per bar")
    ax.text(0.025, cnt[0] + 1, f"{cnt[0]}", ha="center", fontsize=11, weight="bold")
    ax.text(0.975, cnt[-1] + 1, f"{cnt[-1]}", ha="center", fontsize=11, weight="bold")
    ax.annotate("Left end: run-ups\n(what a leak would fill)", (0.025, cnt[0] + 4), xytext=(0.14, 40), fontsize=11, color=INK,
                arrowprops=dict(arrowstyle="-", color=INK2, lw=0.8))
    ax.annotate("Right end: drift-downs\n(the opposite of a leak)", (0.975, cnt[-1] + 4), xytext=(0.72, 40), fontsize=11, color=INK,
                arrowprops=dict(arrowstyle="-", color=INK2, lw=0.8))
    ax.set_ylim(0, 46)
    ax.set_xlim(0, 1)
    ax.set_xlabel("Each deal's p-value for a run-up in days −10 to −1 (vs. its own firm's ordinary days, M4)")
    ax.set_ylabel("Deals")
    ax.legend(frameon=False, loc="upper center", fontsize=10.5)
    fig.tight_layout()
    fig.savefig(OUT / "step5_real_pvals.png", dpi=130)
    plt.close(fig)
    return cnt, lo, hi


# ------------------------------------------------------------------ 5. firm by firm: each firm's deals vs its ordinary days
def firm_strips():
    d = pd.read_csv(DATA / "step6_deals.csv")
    o = pd.read_csv(DATA / "step6_firm_ordinary.csv").set_index("tic")
    fr = pd.read_csv(DATA / "step45_firm_results.csv")
    fr = fr[(fr.model == "M4") & (fr.window == "pre10")].set_index("firm")
    fig, ax = plt.subplots(figsize=(15, 7.4))
    style(ax, "x")
    rng = np.random.default_rng(3)
    order = [t for t in ORDER if t in set(d.tic)]
    for k, t in enumerate(order):
        y = len(order) - 1 - k
        r = o.loc[t] * 100
        ax.plot([r.q05, r.q95], [y, y], color=BAND, lw=16, solid_capstyle="butt", zorder=1)
        ax.plot([r.q25, r.q75], [y, y], color=BAND2, lw=16, solid_capstyle="butt", zorder=1)
        g = d[d.tic == t]
        jit = rng.uniform(-0.22, 0.22, len(g))
        c = np.where(g.p_up < 0.05, ORANGE, np.where(g.p_down < 0.05, PURPLE, BLUE))
        ax.scatter(g.car_pct.clip(-22, 22), y + jit, s=22, c=c, alpha=0.75, edgecolor=BG, lw=0.6, zorder=3)
        mean = g.car_pct.mean()
        ax.plot([mean, mean], [y - 0.36, y + 0.36], color=INK, lw=2.6, zorder=4)
        f = fr.loc[t]
        ax.text(23.5, y, f"n={len(g):3d}   mean {mean:+.1f}%   firm p = {f.p_up:.2f}", va="center", fontsize=10.5, color=INK)
    ax.set_yticks(range(len(order)))
    ax.set_yticklabels([NAMES[t] for t in order[::-1]])
    ax.axvline(0, color=INK2, lw=0.8)
    ax.set_xlim(-22, 22)
    ax.set_xlabel("Abnormal return in days −10 to −1, one dot per deal (%, M4)")
    for lab, c in [("Deal: ordinary range", BLUE), ("Above firm's 95th pct (run-up)", ORANGE), ("Below firm's 5th pct (drift-down)", PURPLE)]:
        ax.scatter([], [], s=30, c=c, label=lab)
    ax.plot([], [], color=INK, lw=2.6, label="Firm's average")
    ax.plot([], [], color=BAND2, lw=10, label="Ordinary days: middle 50%")
    ax.plot([], [], color=BAND, lw=10, label="Ordinary days: middle 90%")
    ax.legend(frameon=False, loc="upper center", bbox_to_anchor=(0.5, -0.11), ncol=3, fontsize=10.5)
    fig.subplots_adjust(left=0.13, right=0.78, top=0.97, bottom=0.2)
    fig.savefig(OUT / "step5_events.png", dpi=130)
    plt.close(fig)


# ------------------------------------------------------------------ 6. Step 6: sensitivity grid
def grid():
    """Heat table: one row per variation, one column per test; cell = p-value, colored when < 0.05."""
    g = pd.read_csv(DATA / "step6_grid.csv")
    g = g[g.model != "V2"]
    gorder = list(dict.fromkeys(g.group))
    g = g.assign(_o=g.group.map(gorder.index)).sort_values("_o", kind="stable").reset_index(drop=True)
    cols = [("avg_p", "Average"), ("firm_p", "Firm-by-\nfirm"), ("out_up_p", "Outlier\ncount"), ("hc_p", "Extreme\np-value"),
            ("mix_robust_p", "Leak-share"), ("out_dn_p", "Drift-down\ncount")]
    n = len(g)
    fig, ax = plt.subplots(figsize=(9.6, 0.3 * n + 1.6))
    ax.set_xlim(-0.5, len(cols) - 0.38)
    ax.set_ylim(n - 0.5, -2.1)
    ax.axis("off")
    grp = g.group.values
    for i in range(n):
        if i > 0 and grp[i] != grp[i - 1]:
            ax.axhline(i - 0.5, color=INK2, lw=0.6, xmin=0, xmax=1)
        for j, (c, _) in enumerate(cols):
            v = g[c].iloc[i]
            up = c != "out_dn_p"
            if v < 0.01:
                fc = ORANGE if up else PURPLE
                tc = "white"
            elif v < 0.05:
                fc = "#f6b99c" if up else "#bdb5ee"
                tc = INK
            else:
                fc, tc = "#f1f0ec", MUTED
            ax.add_patch(plt.Rectangle((j - 0.47, i - 0.42), 0.94, 0.84, fc=fc, ec="none"))
            ax.text(j, i, "<0.001" if v < 0.001 else (f"{v:.3f}" if v < 0.05 else f"{v:.2f}"), ha="center", va="center", fontsize=10.5, color=tc,
                    weight="bold" if v < 0.05 else "normal")
        ax.text(-0.55, i, f"{g.variation.iloc[i].replace(' trading days', '').replace('Contract day 0', 'Day 0').replace(' (no other deal +-40 days)', '')}  ({g.n.iloc[i]})", ha="right", va="center", fontsize=11, color=INK)
    for j, (_, lab) in enumerate(cols):
        ax.text(j, -1.05, lab, ha="center", va="center", fontsize=11, weight="bold", color=INK)
    ax.text(2, -1.95, "Tests for a leak (run-up)", ha="center", fontsize=10, color=ORANGE, weight="bold")
    ax.text(5, -1.95, "Opposite tail", ha="center", fontsize=10, color=PURPLE, weight="bold")
    fig.subplots_adjust(left=0.38, right=0.995, top=0.975, bottom=0.005)
    fig.savefig(OUT / "step6_grid.png", dpi=120)
    plt.close(fig)


def drift():
    b = pd.read_csv(DATA / "step6_drift_down.csv")
    lab = {("event_type", "arms sale"): "Arms sales", ("event_type", "contract"): "Contracts",
           ("mod", "False"): "Not a contract modification", ("mod", "True"): "Contract modification",
           ("fy_end", "True"): "September (fiscal year-end)", ("fy_end", "False"): "Other months",
           ("group_firm", "big four"): "Big four", ("group_firm", "mid-cap"): "Mid-caps"}
    rows = [(lab[(s, v)], r) for s, v, r in [(r.split, r.value, r) for _, r in b.iterrows()] if (s, v) in lab]
    rows += [(f"{r.value}", r) for _, r in b[b.split == "years"].iterrows()]
    fig, ax = plt.subplots(figsize=(15, 6))
    style(ax, "x")
    y = np.arange(len(rows))[::-1]
    for yi, (name, r) in zip(y, rows):
        ratio = r.low / r.expected
        ax.barh(yi, ratio, color=PURPLE if r.low_p < 0.05 else "#a99fe6", height=0.62)
        ax.text(ratio + 0.04, yi, f"{r.low} of {r.n} deals (expected {r.expected:.1f}), p {r.low_p:.3f}", va="center", fontsize=10)
    ax.axvline(1, color=INK, lw=1.4, ls="--")
    ax.set_yticks(y)
    ax.set_yticklabels([n for n, _ in rows])
    ax.set_xlim(0, 3.6)
    ax.set_xlabel("Drift-down deals ÷ number expected by chance (1 = chance)")
    fig.tight_layout()
    fig.savefig(OUT / "step6_drift.png", dpi=130)
    plt.close(fig)


def shift():
    g = pd.read_csv(DATA / "step6_grid.csv")
    s = g[g.group == "Date (A1/A2)"].copy()
    s["k"] = s.changes.str.replace("shift ", "").astype(int)
    base = g[g.group == "Main run"].iloc[0]
    s = pd.concat([s, pd.DataFrame([dict(k=0, mean_car_pct=base.mean_car_pct, out_dn=base.out_dn, out_up=base.out_up,
                                         avg_p=base.avg_p, out_dn_p=base.out_dn_p, expected=base.expected)])]).sort_values("k")
    fig, axs = plt.subplots(2, 1, figsize=(10, 8.4))
    ax = axs[0]
    style(ax)
    ax.plot(s.k, s.mean_car_pct, color=BLUE, lw=2.4, marker="o", ms=7)
    ax.axhline(0, color=INK2, lw=0.8)
    ax.set_xlabel("Contract day 0 moved by k trading days (0 = USAspending action date)")
    ax.set_ylabel("Average abnormal return, days −10..−1 (%)")
    ax.set_title("Average run-up", loc="left", weight="bold")
    ax = axs[1]
    style(ax)
    ax.plot(s.k, s.out_dn, color=PURPLE, lw=2.4, marker="o", ms=7, label="Drift-down deals")
    ax.plot(s.k, s.out_up, color=ORANGE, lw=2.4, marker="o", ms=7, label="Run-up deals")
    ax.axhline(s.expected.iloc[0], color=INK, lw=1.2, ls="--", label="Chance")
    ax.set_xlabel("Contract day 0 moved by k trading days")
    ax.set_ylabel("Deals in the 5% tail")
    ax.set_title("Tail counts", loc="left", weight="bold")
    ax.legend(frameon=False, fontsize=10.5)
    fig.tight_layout()
    fig.savefig(OUT / "step6_shift.png", dpi=130)
    plt.close(fig)


if __name__ == "__main__":
    m, band = decomposition()
    print(m.round(3).loc[[-10, -1, 0, 5, 10]])
    print(band.round(3).loc[[-1, 0, 10]])
    print(deal_paths().round(2)[[-1, 10]])
    volume()
    print(pvals())
    firm_strips()
    grid(); drift(); shift()
