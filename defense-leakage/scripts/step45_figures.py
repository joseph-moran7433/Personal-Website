"""Figures for Step 4-5 from the CSVs written by step45_models.py. Run: python step45_figures.py"""
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "full"
OUT = ROOT.parent / "assets" / "defense-leakage"
INK, INK2, GRID, BAND = "#0b0b0b", "#52514e", "#e4e3df", "#d9d8d3"
TEST_COL = {"T1": "#2a78d6", "T2": "#eb6834", "T3": "#1baf7a", "T4": "#eda100", "T5": "#6250d6"}
TEST_LAB = {"T1": "T1 pooled mean", "T2": "T2 firm by firm", "T3": "T3 tail count", "T4": "T4 higher criticism", "T5": "T5 two-group mixture"}
plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 12, "axes.edgecolor": INK2, "axes.labelcolor": INK,
                     "xtick.color": INK2, "ytick.color": INK2, "axes.spines.top": False, "axes.spines.right": False,
                     "figure.facecolor": "#fcfcfb", "axes.facecolor": "#fcfcfb"})


def style(ax):
    ax.grid(axis="y", color=GRID, lw=0.8)
    ax.set_axisbelow(True)


def power():
    c = pd.read_csv(DATA / "step45_power_curve.csv")
    f = pd.read_csv(DATA / "step45_power_curve_firm.csv")
    fig, axs = plt.subplots(1, 2, figsize=(16.5, 6), dpi=100)
    for ax, df, x, xl, title in [(axs[0], c, c.frac * 100, "Share of events with a planted 5% run-up (days -10 to -1)",
                                  "A few events leak (any firm)"),
                                 (axs[1], f, f.delta, "Planted run-up on every event of ONE firm (%)", "One company leaks, the rest don't")]:
        style(ax)
        for t in TEST_COL:
            ax.plot(x, df[t] * 100, color=TEST_COL[t], lw=2, marker="o", ms=6, label=TEST_LAB[t])
        ax.axhline(80, color=INK2, lw=1, ls="--")
        ax.axhline(5, color=INK2, lw=1, ls=":")
        ax.text(x.min(), 81.5, "80% = good power", ha="left", color=INK2, fontsize=10)
        ax.text(x.max(), 1.5, "5% = false-alarm rate", ha="right", color=INK2, fontsize=10)
        ax.set_ylim(0, 102)
        ax.set_xlabel(xl)
        ax.set_ylabel("Studies where the test flags leakage (%)")
        ax.set_title(title, loc="left", fontsize=14, color=INK)
    axs[0].legend(frameon=False, loc="lower right", fontsize=10.5, bbox_to_anchor=(1.0, 0.12))
    fig.tight_layout()
    fig.savefig(OUT / "step5_power.png")
    plt.close(fig)


def firms():
    f = pd.read_csv(DATA / "step45_firm_results.csv")
    panels = [("M4", "pre10", "Price, days -10 to -1 (leakage window)"), ("V2", "pre10", "Volume, days -10 to -1"),
              ("M4", "day0", "Price, day 0 (public reaction)")]
    fig, axs = plt.subplots(1, 3, figsize=(16.5, 6), dpi=100, sharey=True)
    order = ["LMT", "RTX", "NOC", "GD", "HII", "LHX", "LDOS", "BA", "TXT"]
    for ax, (m, w, title) in zip(axs, panels):
        g = f[(f.model == m) & (f.window == w)].set_index("firm").loc[order]
        y = np.arange(len(order))[::-1]
        ax.grid(axis="x", color=GRID, lw=0.8)
        ax.set_axisbelow(True)
        for yi, (_, r) in zip(y, g.iterrows()):
            ax.plot([r.null_lo, r.null_hi], [yi, yi], color=BAND, lw=9, solid_capstyle="round")
            hit = r.p_up < 0.05 or r.p_down < 0.05
            ax.plot(r.z, yi, "o", ms=10, color="#eb6834" if hit else "#2a78d6", mec="#fcfcfb", mew=2)
            ax.text(3.6, yi, f"n={r.n}", va="center", ha="right", color=INK2, fontsize=10)
        ax.axvline(0, color=INK2, lw=1)
        ax.set_xlim(-3.6, 3.6)
        ax.set_yticks(y)
        ax.set_yticklabels(order)
        ax.set_xlabel("Firm z-score (events of that firm only)")
        ax.set_title(title, loc="left", fontsize=13, color=INK)
    fig.text(0.01, 0.005, "Grey bar = middle 90% of the same firm's score on ordinary days.  Orange = outside it (p < 0.05 one direction).  "
             "Model M4 (SPY + peer index) for price, V2 for volume.", fontsize=10.5, color=INK2)
    fig.tight_layout(rect=(0, 0.04, 1, 1))
    fig.savefig(OUT / "step5_firms.png")
    plt.close(fig)


def events():
    e = pd.read_csv(DATA / "step45_event_pvalues.csv")
    e = e[(e.model == "M4") & (e.window == "pre10")].copy()
    order = ["LMT", "RTX", "NOC", "GD", "HII", "LHX", "LDOS", "BA", "TXT"]
    fig, ax = plt.subplots(figsize=(16.5, 6), dpi=100)
    style(ax)
    rng = np.random.default_rng(1)
    e["x"] = e.tic.map({t: i for i, t in enumerate(order)}) + rng.uniform(-0.22, 0.22, len(e))
    hit = e.p_up < 0.05
    ax.scatter(e.x[~hit], e.car[~hit] * 100, s=40, color="#86b6ef", edgecolor="#fcfcfb", lw=1, zorder=2)
    ax.scatter(e.x[hit], e.car[hit] * 100, s=60, color="#eb6834", edgecolor="#fcfcfb", lw=1.2, zorder=3)
    labels = {("LMT", "2020-04-01"): (0.45, 10.8, "LMT 2020-04-01 (March 2020 crash)"),
              ("BA", "2020-03-31"): (-1.9, 15.5, "BA 2020-03-31 (March 2020 crash)"),
              ("LMT", "2023-02-08"): (-0.3, 14.5, "LMT 2023-02-08 (Poland arms sale)")}
    for (t, d), (dx, ty, lab) in labels.items():
        r = e[(e.tic == t) & (e.day0 == d)].iloc[0]
        ax.annotate(lab, (r.x, r.car * 100), xytext=(r.x + dx, ty), fontsize=10, color=INK,
                    arrowprops=dict(arrowstyle="-", color=INK2, lw=0.8))
    ax.axhline(0, color=INK2, lw=1)
    ax.set_xticks(range(len(order)))
    ax.set_xticklabels([f"{t}\n{(e.tic == t).sum()} events" for t in order])
    ax.set_ylabel("Abnormal return, days -10 to -1 (%)")
    n_hit, n = int((e.p_up < 0.05).sum()), len(e)
    ax.set_title(f"Every event on its own: {n_hit} of {n} beat their firm's ordinary-day 95th percentile (chance alone: {0.05 * n:.0f})",
                 loc="left", fontsize=14, color=INK)
    fig.text(0.01, 0.01, "Orange = event above its own firm's 95th percentile on ordinary days (same quarter-end timing). "
             "Model M4. None survives a false-discovery correction (lowest q = 0.46).", fontsize=10.5, color=INK2)
    fig.tight_layout(rect=(0, 0.04, 1, 1))
    fig.savefig(OUT / "step5_events.png")
    plt.close(fig)


if __name__ == "__main__":
    power()
    firms()
    events()
