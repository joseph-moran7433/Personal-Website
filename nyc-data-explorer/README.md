# NYC Data Explorer — data build

Precomputes everything the **NYC Data Explorer** page (Projects → NYC Data Explorer on the site) shows.

```
pip install requests
python build_explorer_data.py              # rebuild every tab
python build_explorer_data.py sales nta    # rebuild only some tabs
```

- Queries NYC Open Data and data.ny.gov directly via SoQL and lets the server do the counting. Nothing bulk-downloaded; only `acs` needs a key.
- Writes small JSON files to `../assets/nyc-explorer/`, which `assets/nyc-explorer/explorer.js` renders with D3.
- `pull_manifest.json` records every dataset ID, row count, coverage dates and pull timestamp.

Builders: `nta` (2020 NTA boundaries, simplified), `inspections` (DOHMH `43nn-pn8j`), `sales` (DOF `w2pb-icbu`),
`licenses` (NYS SLA `9s3h-dpkz` + `6dg3-2z7i`), `food_access` (`4kc9-zrs2`, `8vwk-6iz2`, `tc6u-8rnp`).

Gentrification-signal builders (added 2026-10-06, one per idea family on the **Question Map** tab):
`turnover` (storefront registry `92iy-9c3n`, storefront stats `dxru-eun8`, DCWP licenses `w7w3-xahh` + `m4ph-grrm`),
`chains` (chain names matched in inspections + Michelin list from github.com/ngshiheng/michelin-my-maps),
`rent` (StreetEasy median asking rent, public download), `values` (DOF assessment rolls `8y4t-faws` + `yjxr-fw8i`, sales volume per NTA-year),
`construction` (Housing DB `br6q-ssj3`, DOB permits BIS `ipu4-2q9a` + DOB NOW `rbx6-tga4`, DOT street permits `tqtj-sjs8`),
`capital` (CPDB `fi59-268w` + geometries, Capital Commitment Plan `2cmn-uidm`), `schools` (`dnpx-dfnc`, `iebs-5yhr`, `74kb-55u9`, `wg9x-4ke6`),
`crime` (NYPD `qgea-i56i` + `5uac-w243`), `subway` (MTA `39hk-dx4f`, `ak4z-sape`, `rc78-7x78`, `7kct-peq7`, `9hy6-8j6t`),
`fires` (FDNY `8m42-w767`, `ii3r-svjz`). `values` and `fires` are slow (server-side medians / 12M-row group-bys): ~5 min each.

`acs` (Census ACS 5-yr tract + 1-yr borough: median gross/contract rent, household income, tenure, shown on the Rent tab)
is the only builder that needs a key. It reads `CENSUS_API_KEY` or the gitignored `nyc-data-explorer/.census_key`.
Free keys: api.census.gov/data/key_signup.html. Not pulled yet from ACS: education, race, age.

This is profiling only: coverage, fields, missingness, distributions and data-quality traps. No analysis.
To add a tab, write a `build_<name>()` here, register it in `BUILDERS`, and add a render function + entry in `TABS` in `explorer.js`.

## Case study: Bushwick (`build_case_study.py`)

`python build_case_study.py` (needs `xlrd` and the Census key) writes `case_bushwick.json` + `case_bushwick_tracts.json`
for the **Case Study: Bushwick** tile (opens the explorer overlay in case mode, no tab bar). One neighborhood that Furman
and the Comptroller call gentrifying, lined up across ACS 1-year PUMA (2005–2024; PUMA codes 04002 → 04304 in 2022),
ACS 5-year tracts (2006–10 / 2011–15 / 2020–24), StreetEasy, Housing DB (CD 304), DOF sales (2007–2015 from DOF's
yearly .xls files, cached in `.cache/dof/`, 2016+ from `w2pb-icbu`), and NYPD precinct 83. Comparisons: Williamsburg
(CD 1 / pct 90), East New York (CD 5 / pct 75), Brooklyn, NYC. Still descriptive; the page ends with time-series notes.

## Part 4 first test run (`build_models.py`)

`python build_models.py` (needs `numpy`, `scipy`, `shapely` and the Census key) writes `models_check.json` for the
**Part 4: First Test Run** page (Part 3: Modeling Options is the plan and uses no data). It builds Model B's outcome on real data: ACS 5-year vintages 2010–2019 for every NYC
tract (all on 2010 tract lines, shapes from `bmjq-373p`), "at risk" = bottom 40% of 2006–10 income, "tipped" = rent
growth and college-share growth since 2010 both above the all-tract median (v1 naive / v2 confirmed two vintages later /
v3 strict). It then test-fits Model B (discrete-time hazard) and Model C (B + neighbor lags + ICAR spatial random effect,
penalized likelihood) on 2012–15 and scores both on 2016–17. No gentrification signals go in: it tests the model frames,
not the research question. `MODEL_RULE=v3 python build_models.py` reruns the comparison on the strict definition
(`models_check_v3.json`). Raw pulls are cached in `.cache/models/`.

## Part 5 first spatio-temporal model (`build_signals.py`)

`python build_signals.py` (same needs as Part 4; reuses its cached ACS pulls) writes `models_signals.json` for the
**Part 5: First Spatio-Temporal Model** page. It adds the first real signals: DOB permit jobs per tract-year from BIS
`ipu4-2q9a` (A1 major alterations, NB new buildings, DM demolitions; per 1,000 households, lagged one year; BIS writes
tract 702.01 as `70201`), and compares exactly two models, B and C (C adds neighbors' change and permits plus the ICAR
place effect). Then: a one-change-at-a-time sensitivity analysis (event rule, at-risk cutoff, neighbor definition,
signal lag/window/scale, test years, spatial prior), a 30-draw ACS margin-of-error Monte Carlo (MOEs cached in
`.cache/models/acs5_moe_2010_2019.json`), and "if I had done it differently" counterfactuals (hindsight leak, in-sample
grading, v1 events, B alone). Restaurant signals are not in: DOHMH keeps ~3 years and SLA resets issue dates on renewal.

## Part 6 Rising Neighborhood Score (`rns_pulls.py` + `build_rising.py`)

Implements `MA491/rising-neighborhood-score-change-log.md`. `python rns_pulls.py` (slow; everything cached in
`.cache/models/rns_*.json`) then `python build_rising.py` writes `rising_score.json` for the
**Part 6: Rising Neighborhood Score** page (`assets/nyc-explorer/models6.js`).

- **Question:** for an officer on PCS orders, which neighborhoods are good places to live and likely to see home
  values beat the city's over a 3-year tour?
- **Outcome (continuous):** `y = log(P[t+3]/P[t]) - same for the city`, log points. `P` = median price per unit of
  1-3 family homes, sales >= $10k, pooled over two calendar years (s-1, s), 20+ sales required. DOF annualized
  sales 2007-2025 (`.xls` to 2017, `.xlsx` after; Staten Island is `staten_island` from 2020).
- **Unit:** 2010 NTAs (parks/cemeteries/airports dropped). 2020+ ACS releases are moved to 2010 tracts with the
  Census `tab20_tract20_tract10_st36` relationship file (largest land overlap).
- **Timing:** inputs close by t-2 (signals t-3..t-2, ACS release ending t-2, momentum `P[t-5] -> P[t-2]`); the outcome
  starts from sales in t-1, t. No sale or survey year is shared.
- **Models:** B = linear regression with start-year intercepts + levels + momentum + signals (ridge picked on
  validation); C = B + neighbors' momentum + Gap (hottest neighbor - own) + ICAR place effect (penalized least
  squares). Intervals clustered by NTA.
- **Test:** rolling origin, start year t scored by a model trained on t' <= t-3. Choices (ridge, tau, permits
  combined vs separate, noise split vs total, noise shape) on 2017-18; reported on 2019-22.
- **Score:** percentile rank (0-100) of Model C's prediction for start year 2025, 80% range from held-out errors.
  Livability filters (commute, felony trend, park access, price cap, noise caps) are applied on the page, not in the model.
- Extra pulls: DOB BIS `ipu4-2q9a` 2019-23 + DOB NOW `w9ak-ipjd` (NB / Full Demolition / Alteration CO), 311 noise by
  kind from `76ig-c548` + `erm2-nwe9`, NYPD felonies 2007-2025, NYC Parks `enfh-gkve` (1+ acre).
- **Two checks (`build_checks.py` -> `rising_checks.json`, ~1 min, reuses the cache):** (1) Model C's top-20 hits vs
  random picks (exact hypergeometric null per test year, convolved; NTA-cluster bootstrap of excess hits and return;
  top 5..50). (2) Why 2021-22 fades: leave-one-out "hindsight" fit per start year vs the rolling model, sales-bootstrap
  share of each year's spread that is real, and each input's Spearman with the outcome by start year.
- **Pages:** Part 6 opens to the **Rising Neighborhood Finder** (`rising_tool.js`, route `__rising`); the top-right
  button goes to the full analysis (`models6.js`, route `__rising_analysis`, section 9 = the two checks).
