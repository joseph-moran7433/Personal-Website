"""Applies the Step 6 + feedback edits to the defense-leakage card in index.html.
Usage: python site_step6_edits.py <path to index.html>   (run on the working copy and on HEAD's copy)
Every replacement must match exactly once, or nothing is written."""
import sys

path = sys.argv[1]
s = open(path, encoding="utf8").read()
E = []


def rep(old, new):
    E.append((old, new))


# ---------------------------------------------------------------- card header
rep("""Tested three ways: on average, company by company, and deal by deal. Steps 1&ndash;5 done on 426 deals across 9 firms (2010&ndash;2026); sensitivity checks next.",""",
    """Tested three ways: on average, company by company, and deal by deal. Steps 1&ndash;6 done on 426 deals across 9 firms (2010&ndash;2026): no run-up found, and the verdict holds under 44 one-change sensitivity runs.",""")
rep("""summary: "Steps 1&ndash;5 are done: the question, a sample of 426 deals at 9 public defense firms (2010&ndash;2026), background research, the candidate models broken out one by one, and a scoring run that picks between them. Results stay labeled preliminary until Step 6 (sensitivity) is done. Every number below comes from a script and a source I can point to.",""",
    """summary: "Steps 1&ndash;6 are done: the question, a sample of 426 deals at 9 public defense firms (2010&ndash;2026), background research, the candidate models broken out one by one, a scoring run that picks between them, and a sensitivity step that changes one input or assumption at a time and re-runs every test. Every number below comes from a script and a source I can point to.",""")
rep("""heading: "Step 5 of 7: scoring done, sensitivity next",""", """heading: "Step 6 of 7: sensitivity done, presentation next",""")
rep("""            <tr><td>5. Scoring</td><td>Done: planted run-ups decide the models (PRELIMINARY results)</td></tr>
            <tr><td>6&ndash;7. Sensitivity, presentation</td><td>Not started</td></tr>""",
    """            <tr><td>5. Scoring</td><td>Done: planted run-ups decide the models</td></tr>
            <tr><td>6. Sensitivity</td><td>Done: 44 one-change re-runs plus a press check on the standout deals; verdict holds</td></tr>
            <tr><td>7. Presentation</td><td>Not started</td></tr>""")
rep("""            { num: "0 of 9", label: "firms with a pre-announcement run-up" },
            { num: "4 vs. 1", label: "deals extreme in both price and volume vs. chance (2 are Textron, checked in Step 6)" }""",
    """            { num: "0 of 9", label: "firms with a pre-announcement run-up" },
            { num: "0 of 44", label: "sensitivity runs where the average or firm-by-firm test finds a run-up" },
            { num: "4 of 5", label: "strongest single-deal run-ups traced to public news (election, COVID crash, earnings)" }""")

# ---------------------------------------------------------------- Step 4: what an abnormal return is, how the firm test works
rep("""          </table>
          <p><strong>Layer 2: how the abnormal moves become a verdict.</strong>""",
    """          </table>
          <div class="dl-callout" style="--c:#1baf7a"><strong>Reading an abnormal return.</strong> It is <em>actual minus expected</em>, not the price change. A negative abnormal return doesn't mean the stock fell: if the market and the other primes point to +0.5% and the firm gains +0.3%, its abnormal return is &minus;0.2%. The firm still went up, just by less than its peers. A leak would show as the firm beating its expected path before the news.</div>
          <p><strong>Layer 2: how the abnormal moves become a verdict.</strong>""")
rep("""<div class="dl-test" style="--c:#eb6834"><b>Firm-by-firm test</b>Does any one company run up? Scores each firm on its own deals, then judges the highest of the 9 against the highest of 9 on ordinary days, so testing 9 firms is paid for (max-statistic test).<em>Catches: a leak at one company.</em></div>""",
    """<div class="dl-test" style="--c:#eb6834"><b>Firm-by-firm test</b>Does any one company run up? No company is picked in advance. Every firm is scored on its own deals against its own ordinary days, then the top firm of the 9 is judged against the top of 9 on ordinary days, so looking at 9 firms is paid for (max-statistic test).<em>Catches: a leak at one company.</em></div>""")
rep("""          <p style="font-size:0.85rem">Each deal's own p-value compares its run-up to the same firm's ordinary days with the same year and quarter-end timing.""",
    """          <p><strong>How the firm-by-firm test works</strong></p>
          <div class="dl-steps">
            <div class="dl-step"><span class="n">Step 1</span><b>Score every deal against its own firm</b>Each deal's run-up is divided by the spread of that firm's ordinary-day run-ups, so a +5% move counts for more at Lockheed (quiet stock) than at Boeing (noisy stock).</div>
            <div class="dl-step"><span class="n">Step 2</span><b>Score every firm</b>Firm score = sum of its deals' scores &divide; &radic;(number of deals). Each of the 9 firms gets its own p-value (shown per firm in the results).</div>
            <div class="dl-step"><span class="n">Step 3</span><b>Pay for looking at 9</b>The verdict is the top firm's score, compared to the top score of 9 firms in studies built only from ordinary days. Without this, 1 in 2 studies would show some firm at p &lt; 0.05 by chance.</div>
          </div>
          <p style="font-size:0.85rem">Each deal's own p-value compares its run-up to the same firm's ordinary days with the same year and quarter-end timing.""")

# ---------------------------------------------------------------- Step 5 results: lead with the deal-level view
OLD_RES_START = """          heading: "The 426 real deals: on average, by company, by deal (PRELIMINARY)","""
rep(OLD_RES_START, """          heading: "The 426 real deals: on average, by company, by deal",""")
a = s.index("""<div class="dl-fig"><img src="assets/defense-leakage/step5_real_paths.png\"""")
b = s.index("""          <table class="dl-table">
            <tr><th>Test (days &minus;10 to &minus;1)</th>""")
OLD_FIGS = s[a:b]
NEW_FIGS = """<div class="dl-fig"><img src="assets/defense-leakage/step5_decomp.png" alt="Left: average actual vs expected cumulative return for the 426 deals. Right: average abnormal return inside the chance range of random ordinary days"><div class="dl-notes"><h4>How to read it</h4><div class="dl-key"><i class="line" style="background:#0b0b0b"></i><span><b>Black (A):</b> what the average deal's stock actually did, from day &minus;10.</span></div><div class="dl-key"><i class="line" style="background:#1baf7a"></i><span><b>Green (A):</b> what M4 expected from the market and the other primes on the same days.</span></div><div class="dl-key"><i class="" style="background:rgba(42,120,214,0.3)"></i><span><b>Blue gap (A):</b> abnormal return = actual &minus; expected.</span></div><div class="dl-key"><i class="line" style="background:#2a78d6"></i><span><b>Blue line (B):</b> that gap over time, the average of 426 deals.</span></div><div class="dl-key"><i class="" style="background:#d3d2cc"></i><span><b>Grey band (B):</b> where the average of 426 random ordinary days lands 95% of the time (same firm and quarter-end mix).</span></div><div class="dl-take"><b>What it tells us:</b> The stocks do go up before the news (+0.29% by day &minus;1), but the market and peers went up more (+0.54% expected), so the abnormal return is &minus;0.25%: slightly worse than peers, not a fall. B's scale is &plusmn;1% because an average of 426 deals barely moves; the band shows chance alone moves it about &plusmn;0.3%. The line stays inside the band, touching its lower edge on day &minus;1.</div></div></div>
          <div class="dl-fig"><img src="assets/defense-leakage/step5_deal_paths.png" alt="Every deal's cumulative abnormal return, days -10 to +10, with the middle 50% and 80% shaded, the average, and the five strongest run-ups labeled"><div class="dl-notes"><h4>Every deal, not just the average</h4><div class="dl-key"><i class="line" style="background:#8a8984"></i><span><b>Grey lines:</b> one per deal, cumulative abnormal return (M4).</span></div><div class="dl-key"><i class="" style="background:rgba(42,120,214,0.3)"></i><span><b>Blue bands:</b> middle 50% (darker) and 80% of deals each day.</span></div><div class="dl-key"><i class="line" style="background:#2a78d6"></i><span><b>Blue line:</b> the average (chart B above).</span></div><div class="dl-key"><i class="line" style="background:#eb6834"></i><span><b>Orange:</b> the five deals with the strongest run-up for their firm.</span></div><div class="dl-take"><b>What it tells us:</b> On a &plusmn;20% scale the average is flat while single deals swing a lot: by day &minus;1 the middle 80% runs from &minus;4.4% to +3.8%. A few leaked deals could hide inside the average, which is why the verdict also uses the deal-level and firm-level tests. Four of the five orange deals line up with public news (Step 6 press check).</div></div></div>
          <div class="dl-fig"><img src="assets/defense-leakage/step5_real_pvals.png" alt="Histogram of real deals' one-sided p-values with the chance range per bar; the left bar is inside the range, the right bar is above it"><div class="dl-notes"><h4>How to read it</h4><div class="dl-key"><i class="" style="background:#eb6834"></i><span><b>Left bar:</b> deals with p &lt; 0.05, a run-up in their firm's top 5%. A leak would make this bar tall.</span></div><div class="dl-key"><i class="" style="background:#6250d6"></i><span><b>Right bar:</b> deals with p &gt; 0.95, a drop in their firm's bottom 5%.</span></div><div class="dl-key"><i class="" style="background:#d3d2cc"></i><span><b>Grey band:</b> 90% chance range for any one bar (14&ndash;29). Dashed = 21.3, the chance count.</span></div><div class="dl-take"><b>What it tells us:</b> The p-value is one-sided: small = big run-up, near 1 = big drop. The left bar holds 25, inside chance (binomial p = 0.23), and none survives a false-discovery correction. The extreme end is the <em>right</em> side: 32 deals, above the range (bottom-5% count 31 vs. 21.3, p = 0.025). That is a drift down, the opposite of a leak; Step 6 traces it to contract modifications.</div></div></div>
          <div class="dl-fig"><img src="assets/defense-leakage/step5_events.png" alt="Each firm's deals as dots on its own ordinary-day range, with the firm average and firm p-value"><div class="dl-notes"><h4>Firm by firm</h4><div class="dl-key"><i class="dot" style="background:#2a78d6"></i><span><b>Dot:</b> one deal's abnormal return, days &minus;10 to &minus;1.</span></div><div class="dl-key"><i class="dot" style="background:#eb6834"></i><span><b>Orange:</b> above that firm's 95th percentile. <b>Purple:</b> below its 5th.</span></div><div class="dl-key"><i class="" style="background:#d3d2cc"></i><span><b>Grey bars:</b> the firm's ordinary days, middle 50% (dark) and 90% (light).</span></div><div class="dl-key"><i class="line" style="background:#0b0b0b"></i><span><b>Black tick:</b> the firm's average. Right: deals, average, firm p-value.</span></div><div class="dl-take"><b>What it tells us:</b> Each firm is judged only against its own ordinary days, so the same +5% is a top-5% move at Lockheed but ordinary at Boeing. No firm's average sits above its normal range: the lowest firm p is 0.24 (RTX). Judged as the top of 9 firms, the best one has p = 0.91. Textron and Leidos sit lowest, with negative averages.</div></div></div>
          <div class="dl-fig"><img src="assets/defense-leakage/step5_firms.png" alt="Each firm's z-score against its ordinary-day range, for price before the deal, volume before the deal, and price on day 0"><div class="dl-notes"><h4>Three windows per firm</h4><div class="dl-key"><i class="" style="background:#d9d8d3"></i><span><b>Grey bar:</b> middle 90% of that firm's score on ordinary days.</span></div><div class="dl-key"><i class="dot" style="background:#2a78d6"></i><span><b>Blue dot:</b> the firm's score on its own deals, inside the normal range.</span></div><div class="dl-key"><i class="dot" style="background:#eb6834"></i><span><b>Orange dot:</b> outside it (p &lt; 0.05 one way). n = the firm's clean deals.</span></div><div class="dl-take"><b>What it tells us:</b> No firm runs up before its deals (left). Boeing and Textron run <em>below</em> normal. Textron stands out twice: high volume before its deals (middle, p = 0.015) and a +0.4% day-0 move (right, p = 0.03). Paying for testing 9 firms, neither clears 5% (p = 0.10 and 0.22); Step 6 shows both rest on a few deals.</div></div></div>
          <div class="dl-fig"><img src="assets/defense-leakage/step5_volume.png" alt="Average trading volume relative to normal for the real deals and for real earnings releases, days -10 to +10"><div class="dl-notes"><h4>Volume vs. a known event</h4><div class="dl-key"><i class="line" style="background:#2a78d6"></i><span><b>Blue:</b> 426 real deals, volume vs. normal (V2; 1&times; = normal).</span></div><div class="dl-key"><i class="line" style="background:#eb6834"></i><span><b>Orange:</b> real earnings releases, a public announcement the market clearly reacts to.</span></div><div class="dl-take"><b>What it tells us:</b> Earnings volume jumps to about 2.4&times; normal on day 0, so the setup can see a reaction when there is one. The deals stay near 1&times; before and on day 0.</div></div></div>
"""
E.append((OLD_FIGS, NEW_FIGS))

a = s.index("""          <p><strong>What the 426 real deals show:</strong></p>""")
b = s.index("""          <p style="font-size:0.85rem">Outputs: <code>defense-leakage/data/full/step45_*.csv</code>""")
OLD_FIND = s[a:b]
NEW_FIND = """          <p><strong>What the 426 real deals show:</strong></p>
          <p>(1) <strong>No leakage pattern on average, at any one company, or in a small group of deals.</strong> These tests would have caught, at least 80% of the time, a 0.5% run-up on every deal, a 5% run-up on about 6% of deals (about 25), or a 2% run-up on every deal of one company. Rarer leaks, one or two deals, can't be ruled out with public price data.</p>
          <p>(2) <strong>The standout deals have public explanations.</strong> The five strongest run-ups are the Nov 2016 post-election shipbuilder rally (HII), the March 2020 crash and rebound (Boeing, Lockheed), a Lockheed arms sale whose window starts the day after an earnings release, and an early-2025 General Dynamics move during a defense-stock rebound. Details in the Step 6 press check.</p>
          <p>(3) <strong>Textron is the one company worth a second look, and it doesn't hold up.</strong> Its high volume before deals rests on one 2011 deal, and its day-0 reaction (+0.4%, p = 0.03; across firms p = 0.22) is a public reaction after the news, not leakage.</p>
          <p>(4) <strong>The extreme side is the down side.</strong> 31 deals sit in the bottom 5% of their firm's ordinary days vs. 21 by chance (p = 0.025), the opposite of leakage. Step 6 finds it in contract modifications.</p>
          <p>(5) <strong>The peer index matters.</strong> Under M2 over days &minus;40 to &minus;1, 29 deals are in the tail vs. 21 by chance (p = 0.03), while the average says nothing. Under M4, which removes moves shared by the other primes, they drop to 19 (p = 0.63): a sector-wide move, not leakage, the same trap Alexander (1993) found.</p>
          <p>(6) <strong>Arms sales over the committee-review window</strong> (&minus;40 to &minus;1, from Step 3): 7 of 110 deals in the tail vs. 5.5 by chance (p = 0.31).</p>
          <p>(7) <strong>More years, same verdict.</strong> 2018&ndash;2026 alone (262 deals) and 2010&ndash;2026 (426) both find no run-up at the 5% level; the larger sample tightens the detection limits (a leak on 6% of deals is now caught, vs. about 8%).</p>
"""
E.append((OLD_FIND, NEW_FIND))

# ---------------------------------------------------------------- Step 6 section (inserted after Step 5 results)
a = s.index("""          <p style="font-size:0.85rem">Outputs: <code>defense-leakage/data/full/step45_*.csv</code>""")
b = s.index("""reflection: `Progress snapshot as of Nov. 18, 2026.""", a)
OLD_TAIL = s[a:b]
assert OLD_TAIL.count("`\n        }\n      ],") == 1, "tail shape changed"
STEP6 = """
        },
        {
          label: "Step 6: Sensitivity",
          heading: "Change one thing, re-run everything, see if the verdict moves",
          body: `<div class="dl-callout" style="--c:#2a78d6"><strong>REAL DATA.</strong> The verdict being tested: <em>no run-up before the news on average, at any one firm, or in a group of deals</em> (M4, days &minus;10 to &minus;1). Each run below changes one input or assumption, re-runs all five tests plus the drift-down count with the same calibration, and is compared to that verdict.</div>
          <div class="dl-fig"><img src="assets/defense-leakage/step6_grid.png" alt="Table of p-values: 44 sensitivity runs by 6 tests, colored where p is below 0.05"><div class="dl-notes"><h4>How to read it</h4><div class="dl-key"><i class="" style="background:#f1f0ec"></i><span><b>Grey cell:</b> p &ge; 0.05, nothing flagged.</span></div><div class="dl-key"><i class="" style="background:#f6b99c"></i><span><b>Light orange:</b> run-up flagged at p 0.01&ndash;0.05. <b>Dark orange:</b> p &lt; 0.01.</span></div><div class="dl-key"><i class="" style="background:#bdb5ee"></i><span><b>Purple:</b> more deals in the bottom 5% than chance (the drift-down).</span></div><div class="dl-key"><i class="" style="background:#52514e"></i><span><b>Rows:</b> one change from the main run (top row), grouped by what changed; n = deals used.</span></div><div class="dl-take"><b>What it tells us:</b> The average and firm-by-firm tests never flag a run-up in any of the 44 runs (lowest p 0.39 and 0.12). The outlier count flags only when deals with earnings nearby are put back, which shows the earnings screen is doing its job. The flags that remain sit in the extreme p-value test, which reacts to the 2&ndash;3 most extreme deals; the table below finds them.</div></div></div>
          <p style="font-size:0.85rem">Outlier count here uses the exact binomial p (main run 0.23; the simulation version in Step 5 gives 0.15). Leak-share uses a tail-safe null density (2% Student-t), because the original version let one March 2020 deal far outside the ordinary-day range drive the result on its own. Script: <code>defense-leakage/scripts/step6_sensitivity.py</code>.</p>
          <p><strong>What drives the flags.</strong> Each flagged run, re-run with only the 8 deals from Feb&ndash;Apr 2020 (the COVID crash) removed:</p>
          <table class="dl-table">
            <tr><th>Run</th><th>Flagged test</th><th>As run</th><th>Feb&ndash;Apr 2020 removed</th><th>Deals with the smallest p</th></tr>
            <tr><td>Main run</td><td>Extreme p-value</td><td>0.04&ndash;0.07</td><td>0.38</td><td>HII Nov 2016, LMT Feb 2023, LMT Apr 2020</td></tr>
            <tr><td>Days &minus;5 to &minus;1</td><td>Leak-share</td><td>0.045</td><td>1.00</td><td>Boeing Mar 2020 (+27%)</td></tr>
            <tr><td>Day 0 moved +2 / +5</td><td>Extreme p-value</td><td>0.03 / 0.006</td><td>0.80 / 0.28</td><td>Boeing Mar 2020</td></tr>
            <tr><td>Deals &ge; 5% of revenue</td><td>Extreme p-value</td><td>0.007</td><td>0.29</td><td>LMT Apr 2020</td></tr>
            <tr><td>Without one firm (7 runs)</td><td>Extreme p-value</td><td>0.02&ndash;0.05</td><td>0.25 (BA, GD shown)</td><td>LMT Apr 2020</td></tr>
            <tr><td>Day 0 moved &minus;2</td><td>Extreme p-value</td><td>&lt;0.001</td><td>0.043</td><td>GD Mar 2025, HII Nov 2016</td></tr>
            <tr><td>Day 0 moved &minus;1</td><td>Extreme p-value</td><td>&lt;0.001</td><td>0.004</td><td>GD Mar 2025, GD Mar 2018, HII Nov 2016</td></tr>
            <tr><td>Competitive contracts</td><td>Leak-share</td><td>0.026</td><td>0.025; <strong>1.00</strong> without Nov 2016</td><td>HII Nov 2016 (+12%)</td></tr>
          </table>
          <p>Every flag but one disappears once the crash deals (or, for competitive contracts, the one post-election deal) are out. The exception, day 0 moved one day earlier, rests on three deals, two of them General Dynamics. None of these flags shows up in the average or firm-by-firm tests.</p>
          <p><strong>Press check on the standout deals</strong> (the five strongest run-ups, plus the Textron deal behind its volume signal):</p>
          <table class="dl-table">
            <tr><th>Deal</th><th>Run-up, days &minus;10 to &minus;1</th><th>What was public in the window</th><th>Verdict</th></tr>
            <tr><td>HII, DDG long-lead funding, day 0 Nov 23, 2016</td><td>+12.0%</td><td>Window = Nov 9&ndash;22, right after the election. HII gained 17.6% in four days on the 350-ship Navy pledge (<a href="https://govconwire.com/2016/11/november-15-market-close-govcon-index-post-election-gain-streak-ends-with-1-decline-us-stocks-advance/" target="_blank" rel="noopener">GovCon Wire</a>)</td><td>Explained: public news</td></tr>
            <tr><td>Boeing, F/A-18 Lot 11, day 0 Mar 31, 2020</td><td>+16.2%</td><td>COVID crash and rebound; Boeing's stock moved tens of percent in days</td><td>Explained: market crash</td></tr>
            <tr><td>Lockheed, F-35 LRIP 14, day 0 Apr 1, 2020</td><td>+7.6%</td><td>Same crash-and-rebound window</td><td>Explained: market crash</td></tr>
            <tr><td>Lockheed, Poland HIMARS arms sale, day 0 Feb 8, 2023</td><td>+6.9%</td><td>Lockheed's earnings release was Jan 24, day &minus;11, one day outside the screen. The sale itself was first reported the day Congress was notified (<a href="https://www.bloomberg.com/news/articles/2023-02-07/us-to-sell-poland-10-billion-in-himars-ammunition" target="_blank" rel="noopener">Bloomberg, Feb 7</a>), not before</td><td>Likely earnings drift; drops out under the &minus;20..+5 screen</td></tr>
            <tr><td>General Dynamics, $1B Virginia-class long-lead, day 0 Mar 12, 2025</td><td>+7.1%</td><td>US defense stocks rebounded in early March 2025 after a February sell-off; a Mar 5 Citi note told clients to buy US defense names (<a href="https://www.insidermonkey.com/blog/why-general-dynamics-corporation-gd-is-gaining-this-week-2-1479243/" target="_blank" rel="noopener">Insider Monkey</a>). GD rose more than the peer index</td><td>Partly explained; open</td></tr>
            <tr><td>Textron, TCDL kits, day 0 Sep 21, 2011</td><td>+11.1%, high volume</td><td>No trade-press coverage found</td><td>Open; one deal</td></tr>
          </table>
          <div class="dl-fig"><img src="assets/defense-leakage/step6_shift.png" alt="Average run-up and tail counts as each contract's day 0 is moved from 2 days earlier to 5 days later"><div class="dl-notes"><h4>A1/A2: what if the date is off?</h4><div class="dl-key"><i class="line" style="background:#2a78d6"></i><span><b>Left:</b> average abnormal return in days &minus;10 to &minus;1 after moving every contract's day 0 by k trading days.</span></div><div class="dl-key"><i class="line" style="background:#6250d6"></i><span><b>Purple:</b> drift-down deals. <b>Orange:</b> run-up deals. Dashed = chance.</span></div><div class="dl-take"><b>What it tells us:</b> war.gov blocks scripted reads, so instead of matching each post, every contract's day 0 is moved from &minus;2 to +5 days (the announcement check found lags of 0&ndash;5 days), with the earnings screen re-applied. The average never becomes a run-up (&minus;0.25% to +0.08%) and the run-up count stays at chance. The drift-down excess shrinks as day 0 moves later and is gone by +5.</div></div></div>
          <div class="dl-fig"><img src="assets/defense-leakage/step6_drift.png" alt="Drift-down deals as a multiple of chance, split by deal type, modification, month, firm group and period"><div class="dl-notes"><h4>Where the drift-down lives</h4><div class="dl-key"><i class="" style="background:#6250d6"></i><span><b>Dark bar:</b> more drift-down deals than chance at p &lt; 0.05.</span></div><div class="dl-key"><i class="" style="background:#a99fe6"></i><span><b>Light bar:</b> not significant.</span></div><div class="dl-key"><i class="dash" style="background:#0b0b0b"></i><span><b>Dashed line:</b> 1 = exactly what chance gives.</span></div><div class="dl-take"><b>What it tells us:</b> The drift-down is in contract <em>modifications</em> (23 of 231, twice chance, p = 0.001), not new awards (8 of 195) or arms sales (5 of 110). It isn't tied to September fiscal year-end, one firm group, or one period. A modification's USAspending date is a bookkeeping date, not a press release, so this points to a dating limit in the data (A1), not to trading. It is the opposite sign of a leak and doesn't change the verdict.</div></div></div>
          <p><strong>Textron, checked three ways</strong> (firm p-value, then p after paying for 9 firms):</p>
          <table class="dl-table">
            <tr><th>Textron signal</th><th>All years</th><th>Without the 2011 deals</th><th>2018&ndash;2026 only</th></tr>
            <tr><td>Volume before deals (V2)</td><td>0.010 &rarr; 0.11</td><td>0.055 &rarr; 0.35</td><td>&ndash;</td></tr>
            <tr><td>Day-0 price, M4</td><td>0.043 &rarr; 0.23</td><td>0.042 &rarr; 0.28</td><td>0.011 &rarr; 0.049</td></tr>
            <tr><td>Day-0 price, M3</td><td>0.016 &rarr; 0.09</td><td>0.012 &rarr; 0.11</td><td>0.017 &rarr; 0.06</td></tr>
            <tr><td>Price before deals, M4</td><td colspan="3">Below normal in every version (lower-side p 0.005&ndash;0.03)</td></tr>
          </table>
          <p>The volume signal rests on 2011. The day-0 move is a reaction after the news is public, which is the market working, not leakage. It clears 5% only in 2018&ndash;2026, and only barely.</p>
          <p><strong>Each Step 1 assumption, tested:</strong></p>
          <table class="dl-table">
            <tr><th>Assumption</th><th>What was changed</th><th>Result</th><th>Moves the verdict?</th></tr>
            <tr><td>A1 announcement date is the first public date</td><td>Contract day 0 moved &minus;2 to +5; new awards vs. modifications; contracts vs. arms sales</td><td>No run-up in any version; drift-down sits in modifications</td><td class="dl-win">No (dating limit noted)</td></tr>
            <tr><td>A2 posts after the close</td><td>Day 0 one day later</td><td>Same verdict</td><td class="dl-win">No</td></tr>
            <tr><td>A3 size &ge; 1% of revenue</td><td>&ge; 0.5% (rebuilt, 522 deals), &ge; 2%, &ge; 5%, 1&ndash;2% only</td><td>No run-up; a real leak should grow with size, and the &ge; 5% deals have average p 0.90</td><td class="dl-win">No</td></tr>
            <tr><td>A4 normal-return model</td><td>M1, M2, M3; estimation days &minus;160 or &minus;500 to &minus;41</td><td>Same verdict in all 5</td><td class="dl-win">No</td></tr>
            <tr><td>A5 window &minus;10 to &minus;1</td><td>&minus;3, &minus;5, &minus;20, &minus;40 to &minus;1; &minus;40 to &minus;11</td><td>One leak-share flag (&minus;5), from Boeing Mar 2020</td><td class="dl-win">No</td></tr>
            <tr><td>A6 earnings screen</td><td>Wider (&minus;20 to +5); none</td><td>Wider: same. None: every tail test flags</td><td class="dl-win">No; the screen is required</td></tr>
            <tr><td>A7 independent deals</td><td>Only deals with no other same-firm deal within 40 days (71)</td><td>Same verdict</td><td class="dl-win">No</td></tr>
            <tr><td>A8 dollar value is real</td><td>Size cut-off bracketed from 0.5% to 5%</td><td>Same verdict; re-ranking by announced value needs war.gov, which blocks scripts</td><td>Partly tested</td></tr>
            <tr><td>A9 deal is a surprise</td><td>Competitive (69) vs. sole-source / follow-on (247)</td><td>Competitive leak-share flag = one post-election deal; gone without it</td><td class="dl-win">No</td></tr>
            <tr><td>A10 / sample</td><td>Each firm dropped in turn; 2010&ndash;17 vs. 2018&ndash;26; crash and election months dropped</td><td>Extreme p-value flags in 7 drop-one runs, all from the crash deals</td><td class="dl-win">No</td></tr>
            <tr><td>Calibration</td><td>Ordinary days matched on firm only; 5,000 simulations</td><td>Same verdict; extreme p-value test sits at 0.04&ndash;0.07 across runs</td><td class="dl-win">No</td></tr>
          </table>
          <div class="dl-callout" style="--c:#2c7986"><strong>Decision: the verdict holds.</strong> In 44 one-change runs, no test finds a run-up on average or at any one firm. Every deal-level flag traces to a few deals with public explanations (the 2016 election, the 2020 crash, an earnings release). Expect some flags by chance anyway: 44 runs &times; 5 tests is about 220 p-values, so roughly 11 fall below 0.05 with no effect at all (fewer, since the runs overlap); 16 did, and each one traces to those same few deals. <strong>Still can't be ruled out:</strong> a leak on one or two deals, a leak that moves every prime at once (M4 removes it), or trading in options. <strong>Limits carried to Step 7:</strong> contract dates are USAspending action dates (A1, A8), and the drift-down in modifications has no confirmed cause.</div>
          <p style="font-size:0.85rem">Outputs: <code>defense-leakage/data/full/step6_*.csv</code>; follow-up on the flags: <code>scripts/step6_crash_check.py</code>; figures: <code>scripts/step6_figures.py</code>. Full notes: <code>defense-leakage/STEP6_SENSITIVITY.md</code>.</p>`
        }
      ],
      """
NEW_TAIL = OLD_TAIL.replace("`\n        }\n      ],\n      ", "`" + STEP6)
E.append((OLD_TAIL, NEW_TAIL))
rep("""figures: <code>scripts/step45_figures.py</code>, <code>scripts/step5_story_figures.py</code>.</p>""",
    """figures: <code>scripts/step45_figures.py</code>, <code>scripts/step6_figures.py</code>.</p>""")

a = s.index("""reflection: `Progress snapshot as of Nov. 18, 2026.""")
b = s.index("`", a + len("reflection: `"))
E.append((s[a:b + 1], """reflection: `Progress snapshot as of Nov. 23, 2026. Next, Step 7 (present and defend): one page that states the answer to the question as asked, walks through the evidence in order (average, firm, deal), and lists what public price data can and can't rule out. Open items to carry there: the USAspending dating limit on contract modifications, the General Dynamics March 2025 and Textron 2011 deals, and the losing bidders on competitive awards.`"""))

for old, new in E:
    c = s.count(old)
    if c != 1:
        raise SystemExit(f"match count {c} for: {old[:90]!r}")
    s = s.replace(old, new)
open(path, "w", encoding="utf8", newline="").write(s)
print("ok", len(E), "edits")
