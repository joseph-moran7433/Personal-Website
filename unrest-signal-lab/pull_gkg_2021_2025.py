"""
pull_gkg_2021_2025.py -- Phase 2, GKG pull driver for the 2021-2025 expansion.

Zero-cost dry-run pre-check (estimate_phase2_pull_cost.py) found GDELT's
per-event GKG cost has grown substantially since 2020: at inspect_gdelt.py's
default 3 GB per-window gate, only 3/125 new events would get ANY GKG
coverage at all (63/66 windows now individually exceed 3 GB -- GDELT's
global daily article volume is itself higher in 2021-2025 than in 2020,
a real, worth-reporting time-varying data characteristic, not a bug).

Rather than either (a) blowing ~232 GB on full coverage or (b) accepting
2.4% coverage from the unmodified default gate, this driver temporarily
raises the per-window gate to 6 GB and adds a hard 80 GB cumulative cap
for THIS RUN ONLY (inspect_gdelt.py's own defaults are untouched for any
future run) -- chosen from a chronological-order simulation
(data/_gkg_2021_2025_dryrun_costs.json) showing that combination covers
78/125 events (62%) for ~78 GB, leaving the account at roughly 71% of
the monthly 1 TB free tier afterward instead of risking ~88%+.

Coverage from this run is NOT random -- events later in the pull skip
once the cumulative cap is hit, so whichever chronological/date-order
events happen to fall within budget get real GKG features; the rest
fall back to the pipeline's existing missing-match handling
(had_gkg_match=False), exactly as an ungated pull already does for
events GDELT simply has no coverage for.
"""
import inspect_gdelt as gkg

gkg.PER_QUERY_BYTES_WARN = 6 * 1024**3
gkg.CUMULATIVE_BYTES_ABORT = 80 * 1024**3

if __name__ == "__main__":
    import sys
    sys.argv = [sys.argv[0], "data/acled_sample_2021_2025.json", "data/gdelt_sample_2021_2025.json"]
    gkg.main()
