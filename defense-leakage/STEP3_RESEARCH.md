# Step 3: Research (context, history, literature) — rough version, 2026-11-12

Purpose: what is already known, how the announcement process actually works, and what that
changes in Steps 1, 4 and 6. Each item lists its source. Items marked *(abstract only)* were
checked from an abstract or catalog page, not the full paper; read before quoting numbers.

## 1. How the information flows (context)

| Channel | What happens | Source | Leak window it implies |
|---|---|---|---|
| DoD contract announcements | Awards of $9M+ posted daily on war.gov ~5:00 PM ET; Congress notified concurrently, not earlier | DFARS 205.303 (checked CP2); RSS pubDates (CP2) | Award decision → 5 PM post: days to weeks inside the contracting office and the firm |
| Army rule | AFARS 5105.303 bars releasing the awardee, even to a Member, before public release | AFARS 5105.303 (CP2) | Formally closed channel; tests whether it holds |
| Firm-side knowledge | The winning firm is told at or before award; firm insiders, suppliers, bankers know | General; Meulbroek (1992) shows illegal insider trades move prices | Same as above |
| Arms sales: informal ("tiered") review | State gives SFRC/HFAC a preliminary notice **20–40 days before** formal notification; members can place holds | CRS RL31675, *Arms Sales: Congressional Review Process* | **Weeks before** our day 0. A −10..−1 window may be too short for DSCA events |
| Arms sales: formal 36(b) notification | Formal notice to Congress, then 30-day review (15 for NATO+ partners); DSCA posts press release | AECA §36(b); CRS RL31675 | Our current DSCA day 0 |
| Trade press / partner governments | Large programs (F-35 lots, Virginia blocks, foreign F-16 deals) are often reported before the post | A1 (Step 1); to verify per event | Can make day 0 "old news" |

Key finding: **for arms sales, the government's own process creates a known 20–40 day pre-notice
to a small group of people.** That is a defined leak channel with a defined window, which is
exactly what an event study can test. It also means the DSCA leg needs a longer pre-window
(e.g. −40..−1) or a second event date (informal notice, if any date for it is public — likely not).

## 2. What the literature found (history)

| Study | What it did | Finding | What it means here |
|---|---|---|---|
| Alexander (1993), NPS master's thesis, *Insider information trading analysis of Defense companies prior to major contract awards* | 4 defense firms, 30 days before major awards | No abnormal returns at 2 of 4; at the other 2 the run-up traced to an earnings surprise and a sector rally, not the award *(catalog summary)* | Closest prior work, and it is ours 30 years earlier. Confounding (A6) and sector moves (ITA) are the main traps |
| Palkar, Larson & Larson (2012), *Applied Financial Economics* 22(2) | Military contract awards around 9/11 | Positive abnormal returns on announcement day, windows −1..+1 *(abstract only)* | Suggests day 0 does react — on samples that include smaller firms |
| Larson & Picou, *Journal of Public Procurement* | 329 contract awards, Mikkelson–Partch method | Reaction exists; larger for foreign-government contracts; smaller firms react more *(abstract only)* | The big 4 are the hardest case. Supports adding mid-caps (already planned) |
| Meulbroek (1992), *J. Finance* 47(5) | SEC illegal insider trading cases | Prices move on the days insiders trade; much pre-announcement abnormal volume traces to insiders | Leakage, if present, should show in both return **and** volume — supports testing both |
| Keown & Pinkerton (1981) | Merger targets | Classic pre-announcement run-up | Shape to look for: run-up, then small day-0 move |
| Ziobrowski et al. (2004) vs. Eggers & Hainmueller (2013) | Congressional trading | Senate portfolios beat market 1993–98 vs. no evidence of informed trading 2004–08 | Congressional advantage is contested; we should not assume the informal-review channel leaks |
| MacKinlay (1997), Brown & Warner (1985) | Event-study method | Market model with daily data is standard and well powered | M2 is the default model |
| Boehmer, Musumeci & Poulsen (1991) | Test stat | Standardized test robust to event-induced variance | BMP test included |
| Kolari & Pynnönen (2010), *RFS* 23(11) | Clustered events | Even small cross-correlation (~0.05) badly over-rejects when event dates cluster | Our firms share a sector and windows overlap (A7). Use KP adjustment or placebo dates |
| Campbell & Wasley (1996), *RQFA* 6(3) | Abnormal volume | Log volume, mean-adjusted; nonparametric tests more powerful | V1/V2 volume models; placebo test |

## 3. What this changes (feeds back to Steps 1, 4, 6 — not applied yet)

1. **A9 is a live risk.** Literature finds day-0 reactions, but in broad samples. For four mega-caps
   a $2B award is <3% of revenue. Step 4's rough run already shows ~0 day-0 return. Size relative
   to revenue (A3) and mid-caps matter more than expected.
2. **Split the DSCA leg's pre-window** to cover the 20–40 day informal review (candidate: −40..−1
   alongside −10..−1). This is a question refinement — flagged for when we revisit Step 1.
3. **Clustered/overlapping events (A7)** are the main statistical trap. Placebo dates (random
   non-event days, same firms) are the baseline test; KP adjustment as a check.
4. **Sector moves.** Alexander (1993) found sector rallies explained two "run-ups". ITA controls for
   this, but ITA holds LMT/RTX/NOC/GD, so M3 partly removes the effect we are testing for.
5. **Confounders (A6):** earnings dates must be pulled and screened before Step 5 (Alexander's other trap).
