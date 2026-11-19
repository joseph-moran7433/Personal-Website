"""Data-section figures: what the deal sample looks like before any model is run.
Reads data/full/events_full.csv, funnel.json, prices_daily.csv. Run: python step2_data_figures.py
Colors match the notes printed beside each chart on the site."""
import json
import sys
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import full_study as fs  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "full"
OUT = ROOT.parent / "assets" / "defense-leakage"
INK, INK2, GRID, SURF = "#0b0b0b", "#52514e", "#e4e3df", "#fcfcfb"
CON, ARMS, FLAG, DROP = "#2a78d6", "#eb6834", "#c9c8c2", "#e4e3df"
plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 12, "axes.edgecolor": INK2, "axes.labelcolor": INK,
                     "xtick.color": INK2, "ytick.color": INK2, "axes.spines.top": False, "axes.spines.right": False,
                     "figure.facecolor": SURF, "axes.facecolor": SURF})
ORDER = ["LMT", "RTX", "NOC", "GD", "HII", "LHX", "LDOS", "BA", "TXT", "BAH", "KTOS"]


def load():
    e = pd.read_csv(DATA / "events_full.csv", parse_dates=["announce", "day0"])
    e["year"] = e.day0.dt.year
    e["cls"] = np.where(e.earnings_near, "flag", np.where(e.event_type == "contract", "con", "arms"))
    return e


def funnel(e):
    f = json.loads((DATA / "funnel.json").read_text())
    steps = [("$100M+ DoD contract actions\n+ arms-sale notices", f["candidates_100m"]),
             ("At least 1% of the firm's\nprior-year revenue", f["size_ge_1pct"]),
             ("Same-firm deals within 10\ntrading days merged", f["after_merging_clusters"]),
             ("Enough price history\nto fit the models", f["usable_with_price_history"]),
             ("Clean: no earnings release\nin days -10 to +5", int((~e.earnings_near).sum()))]
    fig, ax = plt.subplots(figsize=(10, 4.6), dpi=150)
    y = np.arange(len(steps))[::-1]
    for yi, (lab, n) in zip(y, steps):
        last = yi == 0
        ax.barh(yi, n, color=CON if last else FLAG, height=0.62)
        ax.text(n + steps[0][1] * 0.01, yi, f"{n:,}", va="center", color=INK, fontsize=12, weight="bold" if last else "normal")
    ax.set_yticks(y)
    ax.set_yticklabels([s[0] for s in steps], fontsize=10.5)
    ax.set_xlim(0, steps[0][1] * 1.12)
    ax.set_xlabel("Events")
    ax.grid(axis="x", color=GRID)
    ax.set_axisbelow(True)
    fig.tight_layout()
    fig.savefig(OUT / "step2_funnel.png")
    plt.close(fig)


def stack(ax, df, key, cats, horizontal=False):
    base = np.zeros(len(cats))
    for cls, col in [("con", CON), ("arms", ARMS), ("flag", FLAG)]:
        v = np.array([((df[key] == c) & (df.cls == cls)).sum() for c in cats])
        if horizontal:
            ax.barh(np.arange(len(cats)), v, left=base, color=col, height=0.7, edgecolor=SURF, lw=1.5)
        else:
            ax.bar(np.arange(len(cats)), v, bottom=base, color=col, width=0.72, edgecolor=SURF, lw=1.5)
        base += v
    return base


def by_year(e):
    yrs = list(range(e.year.min(), e.year.max() + 1))
    fig, ax = plt.subplots(figsize=(10, 4.4), dpi=150)
    tot = stack(ax, e, "year", yrs)
    for i, t in enumerate(tot):
        ax.text(i, t + 0.6, f"{int(t)}", ha="center", color=INK2, fontsize=9.5)
    ax.set_xticks(range(len(yrs)))
    ax.set_xticklabels([str(y)[2:] if i else str(y) for i, y in enumerate(yrs)])
    ax.set_xlabel("Year of day 0")
    ax.set_ylabel("Deals")
    ax.grid(axis="y", color=GRID)
    ax.set_axisbelow(True)
    fig.tight_layout()
    fig.savefig(OUT / "step2_by_year.png")
    plt.close(fig)


def by_firm(e):
    firms = [t for t in ORDER if t in set(e.tic)][::-1]
    fig, ax = plt.subplots(figsize=(10, 4.6), dpi=150)
    tot = stack(ax, e, "tic", firms, horizontal=True)
    for i, t in enumerate(tot):
        ax.text(t + 0.8, i, f"{int(t)}", va="center", color=INK2, fontsize=10)
    ax.set_yticks(range(len(firms)))
    ax.set_yticklabels(firms)
    ax.axhline(len(firms) - 4.5, color=INK2, lw=0.8, ls=":")
    ax.text(tot.max() * 1.02, len(firms) - 4.35, "big four above", color=INK2, fontsize=9.5, ha="right", va="bottom")
    ax.set_xlabel("Deals")
    ax.grid(axis="x", color=GRID)
    ax.set_axisbelow(True)
    fig.tight_layout()
    fig.savefig(OUT / "step2_by_firm.png")
    plt.close(fig)


def size(e):
    fig, ax = plt.subplots(figsize=(10, 4.2), dpi=150)
    bins = np.logspace(0, np.log10(max(60, e.pct_rev.max() * 1.05)), 26)
    clean = e[~e.earnings_near]
    ax.hist([clean[clean.event_type == "contract"].pct_rev, clean[clean.event_type == "arms sale"].pct_rev], bins=bins,
            stacked=True, color=[CON, ARMS], edgecolor=SURF, lw=1.2)
    ax.set_xscale("log")
    ax.set_xticks([1, 2, 5, 10, 20, 50])
    ax.set_xticklabels(["1%", "2%", "5%", "10%", "20%", "50%"])
    ax.axvline(5, color=INK, lw=1.4, ls="--")
    ax.set_xlabel("Deal value as a share of the firm's prior-year revenue (log scale)")
    ax.set_ylabel("Clean deals")
    ax.grid(axis="y", color=GRID)
    ax.set_axisbelow(True)
    fig.tight_layout()
    fig.savefig(OUT / "step2_size.png")
    plt.close(fig)


def months(e):
    clean = e[~e.earnings_near]
    share = clean.day0.dt.month.value_counts(normalize=True).reindex(range(1, 13), fill_value=0) * 100
    fig, ax = plt.subplots(figsize=(10, 4.0), dpi=150)
    cols = ["#1c5cab" if m % 3 == 0 else "#86b6ef" for m in range(1, 13)]  # dark = quarter-end month
    ax.bar(range(1, 13), share.values, color=cols, width=0.72)
    ax.axhline(100 / 12, color=INK, lw=1.4, ls="--")
    ax.set_xticks(range(1, 13))
    ax.set_xticklabels(list("JFMAMJJASOND"))
    ax.set_ylabel("Share of clean deals (%)")
    ax.set_xlabel("Calendar month of day 0")
    ax.grid(axis="y", color=GRID)
    ax.set_axisbelow(True)
    fig.tight_layout()
    fig.savefig(OUT / "step2_months.png")
    plt.close(fig)


def anatomy(e):
    """One real deal broken into actual vs. predicted (M4) to show what an abnormal return is."""
    ret, logv, peers = fs.load_panel()
    clean = e[~e.earnings_near & (e.tic == "GD") & (e.event_type == "contract")]
    row = clean.loc[(clean.pct_rev).idxmax()]
    d0 = int(row.d0)
    s = fs.series(ret, logv, peers, row.tic, d0)
    days = fs.DAYS
    actual = ret[row.tic].iloc[d0 + days].values
    ab = s["M4"][0]
    pred = actual - ab
    fig, axs = plt.subplots(2, 1, figsize=(10, 6.2), dpi=150, sharex=True, gridspec_kw={"height_ratios": [1.5, 1]})
    for ax in axs:
        ax.axvspan(-10.5, -0.5, color=CON, alpha=0.08)
        ax.axvline(0, color=INK2, lw=1, ls="--")
        ax.grid(axis="y", color=GRID)
        ax.set_axisbelow(True)
    axs[0].plot(days, np.cumsum(actual) * 100, color=INK, lw=2, label="GD actual")
    axs[0].plot(days, np.cumsum(pred) * 100, color="#1baf7a", lw=2, label="M4 prediction")
    axs[0].set_ylabel("Cumulative return (%)")
    axs[0].text(-5.5, axs[0].get_ylim()[1] * 0.92, "leakage window", ha="center", color=INK2, fontsize=10)
    axs[1].bar(days, ab * 100, color=[CON if v >= 0 else "#86b6ef" for v in ab], width=0.75)
    axs[1].axhline(0, color=INK2, lw=0.8)
    axs[1].set_ylabel("Abnormal return (%)")
    axs[1].set_xlabel("Trading days from announcement (0 = first trading day after)")
    fig.tight_layout()
    fig.savefig(OUT / "step2_anatomy.png")
    plt.close(fig)
    pre = ab[(days >= -10) & (days <= -1)].sum() * 100
    print("anatomy:", row.tic, row.day0.date(), row.text[:80], f"pct_rev={row.pct_rev:.1f}", f"CAR-10..-1={pre:.2f}%",
          f"day0={ab[days == 0][0] * 100:.2f}%")


if __name__ == "__main__":
    ev = load()
    funnel(ev)
    by_year(ev)
    by_firm(ev)
    size(ev)
    months(ev)
    anatomy(ev)
    c = ev[~ev.earnings_near]
    print("clean", len(c), "contracts", (c.event_type == "contract").sum(), "arms", (c.event_type == "arms sale").sum(),
          "flagged", int(ev.earnings_near.sum()))
    print("quarter-end share", round((c.day0.dt.month % 3 == 0).mean() * 100, 1), "Sep share", round((c.day0.dt.month == 9).mean() * 100, 1))
    print("large >=5%", int((c.pct_rev >= 5).sum()), "median pct", round(c.pct_rev.median(), 2))
    print(c.groupby("tic").size().to_dict())
