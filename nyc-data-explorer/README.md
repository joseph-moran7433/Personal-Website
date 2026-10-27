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
