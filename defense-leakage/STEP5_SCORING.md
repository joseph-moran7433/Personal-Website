# Steps 4 (final) and 5: models broken out and scored — 2026-11-17

Script: `scripts/step45_models.py` (reuses the events and placebo pools from `full_study.py`), figures
`scripts/step45_figures.py`. Outputs in `data/full/step45_*.csv`, log `data/full/step45_log.txt`.
Sample: 262 clean deals (no earnings in days −10..+5), 9 firms, 2018–2026. **PRELIMINARY until Step 6.**

## Why this step changed (instructor notes, built in)

| Note | What changed |
|---|---|
| The mean can wash out a few deals with unexplained trading | Every deal gets its own p-value against its firm's ordinary days; three tests (T3–T5) look at the tail, not the average |
| It could happen at particular companies, not all | Each firm is tested on its own (T2), paying for 9 tests with a max-over-firms null; shrinkage estimate per firm |
| Break out the models | Two layers kept separate: normal-return model (M1–M4, V2) and detection model (T1–T5) |

## Layer 1 — normal-return models (estimation days −250..−41)

| | Abnormal return | Note |
|---|---|---|
| M1 | r − r_SPY | baseline |
| M2 | r − (α + β r_SPY) | standard market model |
| M3 | r − (α + β r_SPY + γ r_ITA) | ITA contains the firm |
| M4 | r − (α + β r_SPY + γ r_peers) | peers = other big-four primes, own firm excluded |
| V2 | (ln v − mean) − (ln v_SPY − mean) | volume |

## Layer 2 — detection tests (one-sided, up)

- **T1 pooled mean**: Σz / √n, z = event SCAR standardized by its firm × quarter-end null.
- **T2 firm by firm**: max over firms of Σ_f z / √n_f; null = same max on ordinary-day studies.
- **T3 tail count**: # deals with per-event p < 0.05 (p from 190–360 ordinary days of the same firm and quarter-end flag).
- **T4 higher criticism** (Donoho & Jin 2004): max over the lower half of sorted p of √n (i/n − p₍ᵢ₎)/√(p₍ᵢ₎(1−p₍ᵢ₎)).
- **T5 two-group mixture**: z ~ (1−π) f₀ + π f₀(· − μ), f₀ = KDE of ordinary-day z; grid MLE over π ∈ [0, .6], μ ∈ [.5, 6]; LR vs π = 0.

All cut-offs: 95th percentile of 2,000 simulated studies drawn from ordinary days with the real firm × quarter-end mix.

## Scoring (600 simulated studies per cell, M4 unless noted, days −10..−1)

| Planted leak | T1 | T2 | T3 | T4 | T5 |
|---|---|---|---|---|---|
| every deal +0.5% | .83 | .37 | .47 | .82 | .76 |
| 10% of deals +5% | .79 | .50 | .87 | .92 | .93 |
| one firm, all deals +3% | .48 | .87 | .43 | .57 | .56 |
| one firm, 30% of deals +6% | .31 | .58 | .38 | .43 | .45 |
| none (false alarms) | .06 | .04 | .07 | .08 | .08 |

| Model | sd 10-day CAR (ordinary days) | 10% deals +5% (T5) | one firm +4% (T2) |
|---|---|---|---|
| M1 | 5.42% | .57 | .92 |
| M2 | 5.31% | .67 | .91 |
| M3 | 4.62% | .87 | .94 |
| M4 | 4.65% | .91 | .97 |

**Picks:** M4 main price model (M1 baseline), V2 volume. Report T1 + T2 + T5 together (each wins a different
leak pattern), T3 as the plain-language count. T4/T5 false-alarm rate 7.7–8% in the 600-sim check (vs. 5% target;
Monte Carlo error ≈ ±1.8 pts at 95%), so borderline T4/T5 p-values get a Step 6 recheck with more simulations.

## Real-data results (M4 / V2, days −10..−1)

| Test | Price p | Volume p |
|---|---|---|
| T1 | 0.90 (z −1.32) | 0.70 |
| T2 | 0.80 (top RTX z 0.97) | 0.68 (top LHX) |
| T3 | 17 vs 13.1 expected, 0.09 | 16, 0.15 |
| T4 | 0.16 | 0.53 |
| T5 | π̂ = 0.02, 0.35 | 0.26 |

- No pattern on average, by firm, or in a few deals. Ruled out at ≥80% power: +0.5% on every deal; +5% on ≥8% of deals; +3% on every deal of one firm.
- Tail deals: none survives BH (min q 0.46). Largest run-up BA 2020-03-31 (+16.2%) and LMT 2020-04-01 (tied lowest p with LMT 2023-02-08 Poland) are in the March 2020 crash. One deal extreme in both price and volume: LMT 2018-09-26 F-35 LRIP 11 definitization (0.66 expected) → press check.
- Textron day 0: firm p 0.006 (M2), 0.008 (M3), 0.011 (M4); max-firm T2 p 0.051 (M4). Pre-window below normal (p_down 0.004). Step 6.
- M2 days −40..−1: 24 tail deals vs 13.1 (T3 p < 0.001, HC p 0.002) but T1 p 0.46; 12 of 24 in 2022–23; M4 → 9 tail deals. Sector rally.
- Arms sales days −40..−1: M4 4 of 89 tail (4.45 expected), V2 3.
- Earnings method check (full run): 59% of earnings day 0s anomalous vs 4.2% of ordinary days.

## Step 6 list
A1/A2: were USAspending actions publicly announced, and action date vs war.gov post, size cutoff, estimation window, drop Mar–Apr 2020,
Textron, press check on flagged deals, more sims for T4/T5 size, losing bidders.
