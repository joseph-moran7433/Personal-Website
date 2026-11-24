# Step 6: sensitivity (2026-11-23)

Scripts: `scripts/step6_sensitivity.py` (44 one-change runs + figure data), `scripts/step6_crash_check.py`
(what drives each flag), `scripts/step6_figures.py` (redone Step 5 charts + Step 6 charts).
Outputs: `data/full/step6_*.csv`, `step6_summary.json`, logs `step6_log.txt`, `step6_crash_log.txt`.
Small change to `full_study.py`: size cut-off is now `PCT_MIN` (default 1, same as before).

## Verdict being tested
No run-up in days −10..−1 on average, at any one firm, or in a group of deals (M4, 426 clean deals).

## Method
One change per run; same calibration as Step 5 (null = ordinary days of the same firm and quarter-end
status, 1,000 simulated studies; 5,000 in one check). Six columns: Average (Stouffer z), Firm-by-firm
(max over firms), Outlier count (binomial, up), Extreme p-value (higher criticism), Leak-share (two-group
mixture, tail-safe null density: 0.98 KDE + 0.02 Student-t(3)), Drift-down count (binomial, down).

Two fixes made during this step, both found by the checks themselves:
1. Shifting day 0 earlier slid earnings releases into the window. The earnings screen is now re-applied
   around the shifted day 0.
2. The original leak-share test flagged (p 0.001) on days −5..−1 because Boeing 2020-03-31 (+27%) sits
   past the edge of the ordinary-day density (f0 ≈ 1e-7), so one deal drove the likelihood ratio. The
   tail-safe version fixes this; both versions are in `step6_grid.csv` (`mix_p`, `mix_robust_p`).

## Results (44 price runs + V2)
- Average and firm-by-firm: never below 0.05 (lowest 0.39 and 0.12, both in the no-screen run).
- Outlier count (up): flags only with the earnings screen removed (56 vs 29.4, p < 0.001), which shows the screen is required.
- Extreme p-value: flags in 13 runs; leak-share (tail-safe) in 3. `step6_crash_check.py` re-runs each with
  Feb–Apr 2020 removed (8 deals): all flags disappear except day 0 −1 (HC 0.004; GD 2025-03-12,
  GD 2018-03-13, HII 2016-11-23) and day 0 −2 (HC 0.043). Competitive leak-share flag (0.026) survives the
  crash removal but goes to 1.00 without the single Nov 2016 post-election HII deal.
- 16 up-flag cells (excluding no-screen) out of ~220 p-values; about 11 expected by chance if independent.
- Drift-down (bottom-5% count): p < 0.05 in 23 of 44 runs. Lives in contract modifications (23/231,
  p 0.001), not new awards (8/195) or arms sales (5/110). Not September, not one period. Shrinks as contract
  day 0 moves later; at chance by +5.
- Textron: volume signal 0.010 → 0.055 without 2011 (max-firm 0.11 → 0.35). Day-0 M4 firm p 0.043 all years,
  0.011 in 2018+ (max-firm 0.049). Price before deals below normal in every version.

## Press check (five strongest run-ups + Textron 2011)
| Deal | CAR −10..−1 | Public in window | Verdict |
|---|---|---|---|
| HII 2016-11-23 | +12.0% | Post-election rally; HII +17.6% in 4 days (GovCon Wire, Nov 15 2016) | explained |
| BA 2020-03-31 | +16.2% | COVID crash/rebound | explained |
| LMT 2020-04-01 | +7.6% | same | explained |
| LMT 2023-02-08 Poland HIMARS | +6.9% | earnings 2023-01-24 = day −11; sale first reported Feb 7 (Bloomberg), same day as notice | earnings drift likely; drops under −20..+5 screen |
| GD 2025-03-12 | +7.1% | early-Mar 2025 US defense rebound, Citi buy note Mar 5 (Insider Monkey) | partly explained, open |
| TXT 2011-09-21 | +11.1% | nothing found | open |

## Assumptions
A1 date: shifts −2..+5, new vs mod → no run-up; drift-down in mods (dating limit). A2: +1 → same.
A3: 0.5% (rebuilt 522), 2%, 5%, 1–2% → same; ≥5% average p 0.90. A4: M1–M3, est −160 / −500 → same.
A5: −3, −5, −20, −40, −40..−11 → same. A6: wider screen same; no screen flags (screen required).
A7: isolated deals (71) → same. A8: only bracketed by size cut-offs; war.gov re-rank not possible.
A9: competitive flag = one election deal. Drop-one-firm: HC flags from crash deals only.

## Decision
Verdict holds. Limits carried to Step 7: USAspending action dates (A1, A8), drift-down in modifications
unexplained, GD 2025-03 and TXT 2011 open, losing bidders not yet added.

## Feedback folded into the Step 5 results (site)
- Abnormal return explained as actual − expected: average deal stock +0.29% by day −1 vs +0.54% expected (step5_decomp.png panel A).
- Range of the average curve: 95% chance band from 2,000 sets of 426 ordinary days (panel B).
- Tight y-scale: every deal's path on a ±20% scale with 50/80% bands (step5_deal_paths.png).
- Deal-level view leads, average second; five strongest run-ups labeled.
- p-values: both ends shown with per-bar chance range; right end (drift-down) is the extreme side.
- Firm-by-firm: per-firm dots on the firm's own ordinary-day range (step5_events.png) + 3-step explanation in Step 4.
