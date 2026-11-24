"""Step 6 follow-up: are the extreme p-value / leak-share flags in step6_grid.csv driven by a few crash-period deals?

For every variation that flagged in step6_sensitivity.py, re-run it with the Feb-Apr 2020 deals removed
(the only change), and list the three deals with the smallest run-up p-value.
Run: python step6_crash_check.py   Output: data/full/step6_crash_check.csv
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import full_study as fs  # noqa: E402
import step6_sensitivity as s6  # noqa: E402


def main():
    ret, logv, peers = fs.load_panel()
    st = fs.main(return_state=True)
    kept = s6.prep(st)
    E = st["E"]
    ev = kept[~kept.earnings_near].reset_index(drop=True)
    nulls = s6.build_nulls(st["pool"])
    con = ev.event_type.values == "contract"

    def shifted(k):
        sub = ev.copy()
        sub["_s"] = [fs.series(ret, logv, peers, t, int(d + k)) if c else s for t, d, c, s in zip(sub.tic, sub.d0, con, sub._s)]
        dd = sub.d0 + np.where(con, k, 0)
        clash = np.array([bool(((E[t] - d >= -10) & (E[t] - d <= 5)).any()) for t, d in zip(sub.tic, dd)])
        return sub[sub._s.notna() & ~clash]

    cases = [("Main: M4, days -10 to -1", ev, {}), ("Days -5 to -1", ev, dict(w="pre5")),
             ("Contract day 0 shifted -2", shifted(-2), {}), ("Contract day 0 shifted -1", shifted(-1), {}),
             ("Contract day 0 shifted +2", shifted(2), {}), ("Contract day 0 shifted +5", shifted(5), {}),
             ("Deals >= 5% of revenue", ev[ev.pct_rev >= 5], {}), ("Competitive contracts", ev[con & ev.competitive], {}),
             ("Without BA", ev[ev.tic != "BA"], {}), ("Without GD", ev[ev.tic != "GD"], {})]
    rows = []
    for name, sub, kw in cases:
        crash = ((sub.year == 2020) & sub.month.isin([2, 3, 4])).values
        for label, s in [("as run", sub), ("Feb-Apr 2020 removed", sub[~crash])]:
            s = s.reset_index(drop=True)
            r, d = s6.evaluate(s, nulls, return_event=True, **kw)
            o = np.argsort(d["P"])[:3]
            top = "; ".join(f"{s.tic[i]} {s.day0[i]} ({d['cars'][i]*100:+.1f}%)" for i in o)
            rows.append(dict(variation=name, sample=label, n=r["n"], hc_p=r["hc_p"], mix_p=r["mix_p"], mix_robust_p=r["mix_robust_p"],
                             avg_p=r["avg_p"], firm_p=r["firm_p"], out_up_p=r["out_up_p"], smallest_p_deals=top))
            print(f"{name:30s} {label:22s} n={r['n']} hc {r['hc_p']:.3f} mix {r['mix_p']:.3f} robust {r['mix_robust_p']:.3f}  {top}", flush=True)
    pd.DataFrame(rows).to_csv(s6.DATA / "step6_crash_check.csv", index=False)


if __name__ == "__main__" and len(sys.argv) == 1:
    main()


def competitive_followup():
    """Competitive-contract leak-share flag: re-run without the Nov-Dec 2016 post-election deals."""
    st = fs.main(return_state=True)
    kept = s6.prep(st)
    ev = kept[~kept.earnings_near].reset_index(drop=True)
    nulls = s6.build_nulls(st["pool"])
    comp = ev[(ev.event_type == "contract") & ev.competitive]
    elect = (comp.year == 2016) & comp.month.isin([11, 12])
    for label, s in [("competitive, as run", comp), ("competitive, Nov-Dec 2016 removed", comp[~elect])]:
        r = s6.evaluate(s.reset_index(drop=True), nulls)
        print(f"{label:36s} n={r['n']} avg {r['avg_p']:.3f} hc {r['hc_p']:.3f} mix {r['mix_p']:.3f} robust {r['mix_robust_p']:.3f} pi {r['mix_robust_pi']:.2f}")


if __name__ == "__main__" and len(sys.argv) > 1 and sys.argv[1] == "competitive":
    competitive_followup()
