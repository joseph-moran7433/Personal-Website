# NYC Data Explorer — data build

Precomputes everything the **NYC Data Explorer** page (Projects → NYC Data Explorer on the site) shows.

```
pip install requests
python build_explorer_data.py              # rebuild every tab
python build_explorer_data.py sales nta    # rebuild only some tabs
```

- Queries NYC Open Data and data.ny.gov directly via SoQL and lets the server do the counting. No API keys, nothing bulk-downloaded.
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

Known gap: Census ACS (rent paid, income, demographics) needs a free key from api.census.gov/data/key_signup.html.

This is profiling only: coverage, fields, missingness, distributions and data-quality traps. No analysis.
To add a tab, write a `build_<name>()` here, register it in `BUILDERS`, and add a render function + entry in `TABS` in `explorer.js`.
