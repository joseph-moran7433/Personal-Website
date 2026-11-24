# Do Defense Stocks Move Before the Deal? (MA491 project three)

Progress files for an event study of LMT, RTX, NOC and GD around DoD contract awards and arms sale
notifications. Steps 1-3 have rough versions; Step 4 candidate models have one PRELIMINARY run on the 14 usable sample events.

- `STEP3_RESEARCH.md`: announcement process, prior studies, and what they change.
- `STEP4_MODELS.md`: the rough Step 4 run on 14 sample events.
- `STEP5_SCORING.md`: final Step 4 models (two layers, broken out) and Step 5 scoring on the 262-deal full sample.

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

- `step45_models.py` (Steps 4-5): per-event p-values against each firm's ordinary days, five detection tests (pooled mean, firm by firm, tail count, higher criticism, two-group mixture), and scoring by planted run-ups. Writes `data/full/step45_*.csv`. `step45_figures.py` draws `../assets/defense-leakage/step5_*.png`. Takes about 7 minutes.

## 2010 extension (2026-11-18)
Study period pushed back from 2018 to **Jan 2010 - Oct 2026** (same firms, same >=1% of revenue rule). Clean deals 262 -> 426 (588 before the earnings screen). The 2018-only outputs are kept in `data/full_2018/` for comparison.
- `full_prices.py`: prices from 2008-01 (2008-09 only fit the models for 2010 deals).
- `full_usaspending.py`: transactions from 2010-01. Leidos was named Science Applications International (SAIC) before its Sep 2013 split; that name counts only before the split (after it, SAIC is a different stock).
- `full_study.py`: `STUDY_START = 2010-01-01`. LHX before the 2019-06-29 merger is Harris Corp (same stock and SEC filer), so only Harris-named awards and notices count before then; L3 was a different stock. RTX still starts Apr 2020.
- `full_dsca.py`: notices from 2009-06. Pre-2017 titles read "36(b)(1) Arms Sales Notification" (36(b)(5)(C) upgrade notices left out), dates are written "25 July 2013" or "11 Apr 14", and the date and contractor sit in separate blocks with the same transmittal number, which are now joined. 99.8% of notices have a delivered date. Notice texts are cached in `data/full/fr_cache/` (not committed); the script backs off on HTTP 429.
- `full_earnings_yf.py`: SEC EDGAR refuses scripted requests without a contact address, so earnings dates **before June 2016** come from Yahoo Finance's earnings calendar (release time included; 4 PM or later counts for the next trading day). Agreement with EDGAR 8-Ks from 2016 on: 460 of 462 releases on the same trading day. `full_edgar.py` now reads its User-Agent from the `SEC_UA` environment variable. 10-K revenue was not re-pulled: the saved file already covers 2007-2009 onward for every firm except Booz Allen (2017 on).
- `step2_data_figures.py`: data-section figures (`step2_funnel/by_year/by_firm/size/months/anatomy.png`).
- Test names on the site are plain words: T1 = average test, T2 = firm-by-firm test, T3 = outlier count, T4 = extreme p-value test (higher criticism), T5 = leak-share test (two-group mixture). The CSVs keep the T1-T5 column names.

## Step 6: sensitivity (2026-11-23)
- `step6_sensitivity.py`: 44 one-change re-runs of the five tests plus the drift-down count (model, window, contract day-0 shift with the earnings screen re-applied, new awards vs modifications, size cut-off incl. a rebuilt 0.5% sample, competitive vs sole-source, period, isolated deals, earnings screen, calibration, drop one firm, estimation window). Also writes the data for the redone Step 5 charts. About 14 minutes. `full_study.PCT_MIN` sets the size cut-off.
- `step6_crash_check.py`: re-runs each flagged run with Feb-Apr 2020 removed and lists the deals with the smallest p (`python step6_crash_check.py competitive` for the competitive-contract follow-up).
- `step6_figures.py`: `step5_decomp/deal_paths/volume/real_pvals/events.png` and `step6_grid/shift/drift.png`.
- `site_step6_edits.py`: the index.html edits for this step (applied to the working copy and to the committed copy).
- Notes and results: `STEP6_SENSITIVITY.md`.
