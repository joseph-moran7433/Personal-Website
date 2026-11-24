"""Figures that separate the method check (test studies) from the real-deal findings. paths() and pvals() are
superseded by scripts/step6_figures.py (the site uses those versions); running this file overwrites step5_real_pvals.png.
Reads step45/paths CSVs. Run: python step5_story_figures.py"""
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from matplotlib.patches import FancyBboxPatch

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "full"
OUT = ROOT.parent / "assets" / "defense-leakage"
INK, INK2, GRID = "#0b0b0b", "#52514e", "#e4e3df"
TEST, REAL, EARN = "#8a8984", "#2a78d6", "#eb6834"
plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 12, "axes.edgecolor": INK2, "axes.labelcolor": INK,
                     "xtick.color": INK2, "ytick.color": INK2, "axes.spines.top": False, "axes.spines.right": False,
                     "figure.facecolor": "#fcfcfb", "axes.facecolor": "#fcfcfb"})


def flow():  # replaced on the site by an HTML three-step strip; kept for the record
    fig, ax = plt.subplots(figsize=(12, 3.3))
    ax.set_xlim(0, 12); ax.set_ylim(0, 3.3); ax.axis("off")
    boxes = [
        (0.1, REAL, "1. REAL DATA", "Fit M1-M4, V2 on each\nfirm's real prices\n(days -250 to -41)"),
        (4.1, TEST, "2. METHOD CHECK", "Test studies: real no-deal days\n+ a known run-up added.\nWhich model catches it?"),
        (8.1, REAL, "3. REAL DATA: FINDINGS", "Picked models (M4; T1, T2, T5)\nrun on the 262 real deals"),
    ]
    for x, c, title, body in boxes:
        ax.add_patch(FancyBboxPatch((x, 0.35), 3.7, 2.5, boxstyle="round,pad=0.02,rounding_size=0.15",
                                    fc=c, ec="none", alpha=0.14))
        ax.add_patch(FancyBboxPatch((x, 2.25), 3.7, 0.6, boxstyle="round,pad=0.02,rounding_size=0.15", fc=c, ec="none"))
        ax.text(x + 1.85, 2.55, title, ha="center", va="center", color="white", weight="bold", fontsize=12.5)
        ax.text(x + 1.85, 1.3, body, ha="center", va="center", color=INK, fontsize=11.5, linespacing=1.4)
    for x in (3.85, 7.85):
        ax.annotate("", xy=(x + 0.22, 1.55), xytext=(x - 0.02, 1.55),
                    arrowprops=dict(arrowstyle="-|>", color=INK2, lw=2, mutation_scale=18))
    ax.text(6, 0.08, "Step 2 only picks the model. Every finding comes from step 3.", ha="center", color=INK2, fontsize=11)
    fig.tight_layout(); fig.savefig(OUT / "step5_flow.png", dpi=150); plt.close(fig)


def paths():
    d = pd.read_csv(DATA / "paths_full.csv")
    fig, axes = plt.subplots(2, 1, figsize=(10, 7.4))
    for ax, model, lab in [(axes[0], "M4", "Cumulative abnormal return (%)"), (axes[1], "V2", "Abnormal log volume")]:
        for g, c, name in [("Main: clean events (no earnings nearby)", REAL, "Real deals"),
                           ("Comparison: earnings releases", EARN, "Real earnings releases")]:
            s = d[(d.group == g) & (d.model == model)].sort_values("day")
            y = s.mean_cum * 100 if model == "M4" else s.mean_cum.diff().fillna(s.mean_cum.iloc[0])  # V2: daily value
            ax.plot(s.day, y, color=c, lw=2.4, marker="o", ms=3.5, label=name)
        ax.axvline(0, color=INK2, lw=1, ls="--"); ax.axhline(0, color=INK2, lw=0.8)
        ax.axvspan(-10, -0.5, color=REAL, alpha=0.06)
        ax.text(-5.25, ax.get_ylim()[1] * 0.92, "before the news", ha="center", color=INK2, fontsize=10.5)
        ax.set_xlabel("Trading days from announcement (0 = first day after)"); ax.set_ylabel(lab)
        ax.grid(axis="y", color=GRID); ax.set_axisbelow(True)
    axes[0].set_title("Price (M4)", loc="left", weight="bold"); axes[1].set_title("Trading volume (V2)", loc="left", weight="bold")
    axes[0].legend(frameon=False, loc="lower left")
    fig.tight_layout(); fig.savefig(OUT / "step5_real_paths.png", dpi=150); plt.close(fig)


def pvals():
    e = pd.read_csv(DATA / "step45_event_pvalues.csv")
    e = e[(e.model == "M4") & (e.window == "pre10")]
    n = len(e)
    fig, ax = plt.subplots(figsize=(10, 4.4))
    bins = np.linspace(0, 1, 21)
    ax.hist(e.p_up, bins=bins, color=REAL, alpha=0.85, edgecolor="#fcfcfb", label=f"{n} real deals")
    ax.axhline(n / 20, color=INK, lw=1.6, ls="--", label=f"Chance: {n/20:.1f} per bar")
    ax.set_xlabel("Each real deal's p-value: run-up in days -10 to -1 vs. that firm's ordinary days (M4)")
    ax.set_ylabel("Deals"); ax.set_xlim(0, 1)
    ax.grid(axis="y", color=GRID); ax.set_axisbelow(True); ax.set_ylim(0, max(n / 20 * 1.9, ax.get_ylim()[1]))
    fig.tight_layout(); fig.savefig(OUT / "step5_real_pvals.png", dpi=150); plt.close(fig)


if __name__ == "__main__":
    paths(); pvals()
