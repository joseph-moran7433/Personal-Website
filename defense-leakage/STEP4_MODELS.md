# Step 4: Candidate models — rough version, 2026-11-12

All models were run on the 15-event sample (14 usable: RTX 2020-06-29 dropped, since RTX history
starts 2020-04-03 and there are not 120 estimation days). Script: `scripts/step4_candidate_models.py`.
Outputs: `data/sample/step4_summary.csv`, `step4_event_level.csv`, `step4_daily_paths.csv`,
`assets/defense-leakage/step4_paths.png`. **PRELIMINARY: 14 events checks the machinery, not the answer.**

## Candidate models

| ID | Model | Why it's a candidate | Weakness |
|---|---|---|---|
| M0 | Raw return | Baseline: "did the stock go up?" | Mixes in the whole market |
| M1 | Market-adjusted (r − r_SPY) | Simple baseline, no estimation; good when beta ≈ 1 | Defense betas are < 1 |
| M2 | Market model (OLS on SPY, days −250..−31) | Standard event-study model (MacKinlay 1997) | Misses sector-wide news |
| M3 | SPY + ITA two-factor | Removes sector rallies (Alexander 1993 trap) | ITA holds these firms, so it partly absorbs a real leak |
| V1 | Mean-adjusted log volume | Campbell & Wasley (1996) | Volume trends over time bias it |
| V2 | V1 minus SPY's V1 | Removes market-wide volume swings | — |
| — | *Not run yet:* Fama–French 3/5 factor + momentum; KP-adjusted BMP; calendar-time portfolio; cross-sectional regression of CAR on size/revenue and surprise | Listed for Step 5 comparison | Need more events |

Tests on each window (−10..−1, day 0, +1..+5): cross-sectional t, BMP standardized t, and a
**placebo test** — the same statistic on 2,000 random sets of non-event days (same firms, ≥20 days
from any sample event). The placebo p-value assumes no normality and handles volume autocorrelation.

## Rough results (14 events)

| Model | Mean CAR −10..−1 | placebo p | Day 0 | placebo p | +1..+5 | placebo p |
|---|---|---|---|---|---|---|
| M0 raw | +1.54% | 0.51 | −0.03% | 0.83 | +1.80% | 0.12 |
| M1 mkt-adj | +0.97% | 0.49 | −0.42% | 0.34 | +1.72% | 0.07 |
| M2 market model | +0.94% | 0.47 | −0.20% | 0.63 | +1.64% | 0.07 |
| M3 SPY+ITA | +0.75% | 0.52 | −0.16% | 0.57 | +1.01% | 0.21 |
| V1 log vol | −1.10 | 0.25 | +0.03 | 0.72 | −0.51 | 0.33 |
| V2 log vol mkt-adj | +0.99 | 0.28 | +0.26 | 0.054 | +0.46 | 0.42 |

(Volume = cumulative abnormal log volume; +0.26 on day 0 ≈ 30% above normal.)

## What the rough run shows

1. **No pre-announcement signal in 14 events under any model** (all placebo p ≈ 0.25–0.5).
2. **Day 0 return ≈ 0** under every model — A9 risk from Step 3 shows up. Day-0 *volume* is
   high (V2, p = 0.054), so traders notice the news even if price doesn't move.
3. **Parametric tests can mislead.** V1's pre-window t = −2.5 looks "significant", but the
   placebo p is 0.25: volume is autocorrelated and trends, so the t-test over-rejects. Placebo
   is the honest baseline; V2 fixes most of the trend. Lesson for Step 5 scoring.
4. **Model choice moves the pre-window estimate by about half** (raw +1.5% → SPY+ITA +0.75%),
   mostly from the market/sector trend. Model choice matters more than it seems — a Step 6 item.

## Recommended going into Step 5 (decisions taken per Joseph's "do what's recommended")

- Primary return model: **M2 market model**. M1 as baseline; M3 as sector check.
- Primary volume model: **V2** (market-adjusted log volume).
- Primary test: **placebo dates**; BMP and KP-adjusted BMP reported beside it.
- Before scoring: grow the event set (all war.gov awards above the size cutoff + all DSCA notices
  naming the 4 firms), add mid-caps, and screen earnings dates (A6).
