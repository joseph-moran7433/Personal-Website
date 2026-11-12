# Do Defense Stocks Move Before the Deal? (MA491 project three)

Progress files for an event study of LMT, RTX, NOC and GD around DoD contract awards and arms sale
notifications. Steps 1-3 have rough versions; Step 4 candidate models have one PRELIMINARY run on the 14 usable sample events.

- `STEP3_RESEARCH.md`: announcement process, prior studies, and what they change.
- `STEP4_MODELS.md`: the six candidate models, rough results, and the picks for Step 5.

## data/sample/
- `prices_daily.csv`: Yahoo Finance via yfinance, daily OHLC, Adj Close, Volume; LMT, NOC, GD, SPY, ITA from 2018-01-02, RTX from 2020-04-03 (earlier RTX history is United Technologies). Through 2026-10-30.
- `events_sample.csv`: 15 sample events. 12 DoD contracts confirmed on war.gov by contract number; 3 arms sales dated from the Federal Register "Date Report Delivered to Congress" (dsca.mil post time not yet confirmed). `day0` = next trading day after the announcement.
- `usaspending_candidates_raw.csv`: USAspending transactions of $500M+ obligated, top 100 per firm (each firm hit the 100-row limit).
- `dsca_candidates_fedreg.csv`: Federal Register arms sales notices naming one of the four firms as principal contractor.

## scripts/
`cp3_prices.py`, `cp3_usaspending_candidates.py`, `cp3_dsca_candidates.py`, `cp3_events.py`, `cp3_dsca_events.py`, `step4_candidate_models.py` (writes `data/sample/step4_*.csv` and `../assets/defense-leakage/step4_paths.png`). None need an API key. war.gov blocks scripts, so the contract matches were read in a browser; the values are copied into `cp3_events.py` with their page URLs.

## data/full/ and the full-sample run (2026-11-12, PRELIMINARY)
- **war.gov blocked scripted reads** (403 Access Denied after about 130 pages), so contract events now come from the USAspending API: `full_usaspending.py` (every DoD contract transaction of $100M+ to a study firm, plus each award's competition fields). Limits: the date is the USAspending action date, not the war.gov post date, and the value is obligated dollars, not the announced ceiling.
- `full_dsca.py`: every Federal Register arms-sale notice naming a study firm; day 0 follows the "Date Report Delivered to Congress".
- `full_prices.py`: yfinance, 2017-2026, big four + HII, LHX, LDOS, BA, TXT, BAH, KTOS + SPY, ITA. LHX before Jul 2019 is Harris alone (LHX events start Jul 2019).
- `full_edgar.py`: earnings 8-K dates and 10-K revenue for all study firms. Some firm-years lack a 10-K revenue tag; the latest earlier year is used.
- `full_share.py`: share of DoD contract dollars won by the study firms per fiscal year (`dod_share_by_year.csv`).
- `full_study.py`: builds events (>=1% of prior-year revenue, earnings within days -10..+5 flagged, same-firm events <=10 trading days apart merged), runs models M1, M2, M3, M4 (SPY + peer index of the other big-four primes) and V2 over days -40..+10, with placebo tests matched on firm, year and quarter-end month. Outputs: `events_full.csv`, `results_full.csv`, `paths_full.csv`, `funnel.json`.
- `step4_wide_window.py`: the 14-event sample rerun over days -40..+10.
