"""
pull_gkg_remaining.py -- Phase 2, second GKG pull driver.

Covers the 104 expansion events (74 from the original 125 that fell
outside the first run's 80 GB cap, plus the 30 backfilled peaceful
events) that still have no GKG coverage. Dry-run pre-check
(data/_gkg_uncovered_dryrun.json) found no individual window over 8 GB,
so the gate is raised to 8 GB (from 6 GB in the first run) and the
cumulative cap raised to 170 GB -- explicitly authorized as a larger
spend this round, chosen to land cumulative usage around 89% of the
monthly 1 TB free tier, keeping roughly 10% (~100 GB) as a genuine
safety buffer rather than draining to zero.
"""
import inspect_gdelt as gkg

gkg.PER_QUERY_BYTES_WARN = 8 * 1024**3
gkg.CUMULATIVE_BYTES_ABORT = 170 * 1024**3

if __name__ == "__main__":
    import sys
    sys.argv = [sys.argv[0], "data/acled_uncovered_for_gkg.json", "data/gdelt_sample_2021_2025_part2.json"]
    gkg.main()
