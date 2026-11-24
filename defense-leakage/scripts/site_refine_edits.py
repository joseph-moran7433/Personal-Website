"""Readability pass on the defense card in index.html (after Step 6).

apply(text) -> text. Each replacement must match exactly once.
Run: python site_refine_edits.py <path-to-index.html>
"""
import sys

H = '<p style="font-size:0.72rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--faint);margin:1.2rem 0 0.3rem">'


def sub(t, old, new):
    n = t.count(old)
    assert n == 1, (n, old[:80])
    return t.replace(old, new)


REPL = [
    # summary: answer first, then the route through the page
    ('summary: "Steps 1&ndash;6 are done: the question, a sample of 426 deals at 9 public defense firms (2010&ndash;2026), background research, the candidate models broken out one by one, a scoring run that picks between them, and a sensitivity step that changes one input or assumption at a time and re-runs every test. Every number below comes from a script and a source I can point to.",',
     'summary: "<strong>Short answer: no run-up.</strong> Across 426 large DoD contracts and arms sales at 9 public defense firms (2010&ndash;2026), the stock does not beat its expected path in the two trading weeks before the news: not on average, not at any one company, and not in a small group of deals. That still holds when each input or assumption is changed one at a time. The page follows the study in order: the question (Step 1), the data (Step 2), how the news travels (Step 3), the models (Step 4), a method check and the real results (Step 5), and the stress test (Step 6). Every number comes from a script and a source I can point to.",'),
    # key terms under the status table
    ('''            <tr><td>7. Presentation</td><td>Not started</td></tr>
          </table>`,''',
     '''            <tr><td>7. Presentation</td><td>Not started</td></tr>
          </table>
          ''' + H + '''Six terms used on every chart below</p>
          <div class="dl-asm-std">
            <div><b>Day 0.</b> The first trading day a deal is public. Days &minus;10 to &minus;1 are the two trading weeks before it, where a leak would show.</div>
            <div><b>Expected return.</b> What the stock should have done that day, given the market and the other big defense primes (model M4, Step 4).</div>
            <div><b>Abnormal return.</b> Actual minus expected. Positive = the stock beat its peers. Added up over days &minus;10 to &minus;1 it is the deal's <em>run-up</em>.</div>
            <div><b>Ordinary days.</b> Random dates for the same firm with no deal. They are the yardstick for &ldquo;normal&rdquo; in every test.</div>
            <div><b>p-value.</b> Share of ordinary days with a run-up at least this big. Under 0.05 = an unusual run-up; near 1 = an unusual drop.</div>
            <div><b>Drift-down.</b> The mirror image of a leak: more deals than chance falling into their firm's bottom 5% before the news.</div>
          </div>`,'''),
    # labels: step numbers on every tab
    ('label: "The Question",', 'label: "Step 1: Question",'),
    ('label: "Data Sources",', 'label: "Step 2: Sources",'),
    ('label: "Data: The Deals",', 'label: "Step 2: The Deals",'),
    ('label: "Announcement Check",', 'label: "Step 2: Date Check",'),
    # assumption cards: planned check -> what Step 6 found
    ('<div><small>Step 6 check</small>Match a sample of deals to their war.gov post and re-run; trade-press search on every flagged deal.</div>',
     '<div><small>Step 6 result</small>war.gov blocks scripts, so every contract date was moved &minus;2 to +5 days instead, and every standout deal was checked in the press. No run-up in any version.</div>'),
    ('<div><small>Step 6 check</small>Re-run at 0.5%, 2% and 5%. A real leak should get stronger as deals get bigger.</div>',
     '<div><small>Step 6 result</small>Re-run at 0.5%, 2% and 5%. A real leak should grow with deal size; no cut-off shows a run-up.</div>'),
    ('<div><small>Built in</small>Three shapes are tested (every deal, one firm, a few deals), and arms sales are also tested over &minus;40 to &minus;1.</div>',
     '<div><small>Built in + Step 6</small>Three shapes are tested (every deal, one firm, a few deals), arms sales also over &minus;40 to &minus;1, and Step 6 tries &minus;3, &minus;5, &minus;20 and &minus;40. Same answer.</div>'),
    ('<div><small>Step 6 check</small>Re-rank the matched sample by announced value and compare.</div>',
     '<div><small>Step 6 result</small>Only partly tested: size cut-offs from 0.5% to 5% give the same answer, but re-ranking by announced value needs war.gov.</div>'),
    ('<div><small>Step 6 check</small>Re-run on competitive awards only, and on first-time awards vs. modifications.</div>',
     '<div><small>Step 6 result</small>Competitive awards alone (69) and new awards vs. modifications: no run-up. The one competitive flag is a single post-election deal.</div>'),
    ('The other five can change the answer, so each gets its own check in Step 6.',
     'The other five can change the answer, so each was re-tested in Step 6; the result is on each card.'),
    # announcement check: stale plan
    ('The announced value will define "large." (3) One SPY-6 award was posted 5 days after its USAspending action date, a direct challenge to A1.',
     'So a deal\'s dollar size is uncertain (A8). (3) One SPY-6 award was posted 5 days after its USAspending action date, a direct challenge to A1; Step 6 answers it by moving every contract date &minus;2 to +5 days.'),
    # Step 4: drift-down count introduced where the tests are
    ('All are one-sided: a leaked win pushes the price up. Colors match the method-check chart below.</p>',
     'All are one-sided: a leaked win pushes the price up. Colors match the method-check chart below. The results also report the mirror image, a <strong>drift-down count</strong> (deals in their firm\'s bottom 5%), so an unusual move the other way isn\'t missed.</p>'),
    ('Without this, 1 in 2 studies would show some firm at p &lt; 0.05 by chance.',
     'Without this, about 1 in 3 studies would show some firm at p &lt; 0.05 by luck alone (1 &minus; 0.95<sup>9</sup> = 37%).'),
    # Step 5 results: deal paths now sits in the by-deal block below chart 1
    ('<span><b>Blue line:</b> the average (chart B above).</span>', '<span><b>Blue line:</b> the average (chart 1B).</span>'),
    # Step 5 table: tie the borderline and leak-share numbers to Step 6
    ('<tr><td>Outlier count</td><td>25 deals vs. 21 by chance, p 0.15</td>',
     '<tr><td>Outlier count</td><td>25 deals vs. 21 by chance, p 0.15 (exact binomial 0.23)</td>'),
    ('<tr><td>Extreme p-value test</td><td>p 0.052, borderline</td>',
     '<tr><td>Extreme p-value test</td><td>p 0.052, borderline; 0.37 without the 8 COVID-crash deals (Step 6)</td>'),
    ('<tr><td>Leak-share test</td><td>Best fit: 2% of deals, p 0.47</td>',
     '<tr><td>Leak-share test</td><td>Best fit: 2% of deals, p 0.47; tail-safe version 0%, p 1.00 (Step 6)</td>'),
    # Step 6 crash table: clearer numbers
    ('<tr><td>Main run</td><td>Extreme p-value</td><td>0.04&ndash;0.07</td>',
     '<tr><td>Main run</td><td>Extreme p-value</td><td>0.04&ndash;0.07 (varies by simulation draw)</td>'),
    ('<td>0.02&ndash;0.05</td><td>0.25 (BA, GD shown)</td>',
     '<td>0.02&ndash;0.05</td><td>about 0.25 (checked on the BA and GD drops)</td>'),
    # Step 6 sub-headers
    ('''Each run below changes one input or assumption, re-runs all five tests plus the drift-down count with the same calibration, and is compared to that verdict.</div>''',
     '''Each run below changes one input or assumption, re-runs all five tests plus the drift-down count with the same calibration, and is compared to that verdict. The section goes: the 44 runs at a glance, what drives the few flags, the standout deals in the press, the date and drift-down questions, Textron, and every assumption scored.</div>
          ''' + H + '''1 &middot; The 44 runs at a glance</p>'''),
    ('<p><strong>What drives the flags.</strong> Each flagged run,',
     H + '2 &middot; What drives the few flags</p>\n          <p>Each flagged run,'),
    ('<p><strong>Press check on the standout deals</strong> (the five strongest run-ups, plus the Textron deal behind its volume signal):</p>',
     H + '3 &middot; The standout deals, checked in the press</p>\n          <p>The five strongest run-ups, plus the Textron deal behind its volume signal:</p>'),
    ('<div class="dl-fig"><img src="assets/defense-leakage/step6_shift.png"',
     H + '4 &middot; Two loose ends: the date, and the drift-down</p>\n          <div class="dl-fig"><img src="assets/defense-leakage/step6_shift.png"'),
    ('<p><strong>Textron, checked three ways</strong> (firm p-value, then p after paying for 9 firms):</p>',
     H + '5 &middot; Textron, checked three ways</p>\n          <p>Each cell: Textron\'s own p-value &rarr; the p-value after paying for looking at 9 firms.</p>'),
    ('<p><strong>Each Step 1 assumption, tested:</strong></p>',
     H + '6 &middot; Every Step 1 assumption, scored</p>'),
    ('reflection: `Progress snapshot as of Nov. 23, 2026.', 'reflection: `Progress snapshot as of Nov. 24, 2026.'),
]


def reorder_step5(t):
    """Put the Step 5 results in question order: scorecard, average, company, deal, volume."""
    start = t.index('<div class="dl-callout" style="--c:#2a78d6"><strong>REAL DATA: the findings.</strong>')
    end = t.index('<p><strong>What the 426 real deals show:</strong></p>', start)
    block = t[start:end]
    lines = block.split('\n')
    callout = lines[0]

    def fig(name):
        hits = [l for l in lines if f'assets/defense-leakage/{name}.png' in l]
        assert len(hits) == 1, name
        return hits[0].strip()

    ti = next(i for i, l in enumerate(lines) if '<table class="dl-table">' in l)
    tj = next(i for i in range(ti, len(lines)) if '</table>' in lines[i])
    table = '\n'.join(lines[ti:tj + 1])
    ind = '          '
    new = '\n'.join([
        callout,
        ind + '<p><strong>The scorecard first,</strong> then one chart for each way of asking. Every p-value compares the real deals with ordinary days; under 0.05 would mean a run-up.</p>',
        ind + table.strip(),
        ind + H + '1 &middot; On average</p>',
        ind + fig('step5_decomp'),
        ind + H + '2 &middot; By company</p>',
        ind + fig('step5_events'),
        ind + fig('step5_firms'),
        ind + H + '3 &middot; By deal</p>',
        ind + fig('step5_deal_paths'),
        ind + fig('step5_real_pvals'),
        ind + H + '4 &middot; Trading volume</p>',
        ind + fig('step5_volume'),
        ind,
    ])
    return t[:start] + new + t[end:]


def apply(t):
    for old, new in REPL:
        t = sub(t, old, new)
    # decomp note refers to its panels as A/B; make them 1A/1B to match the deal-paths note
    t = sub(t, '<h4>How to read it</h4><div class="dl-key"><i class="line" style="background:#0b0b0b"></i><span><b>Black (A):</b>',
            '<h4>How to read it (1A top, 1B bottom)</h4><div class="dl-key"><i class="line" style="background:#0b0b0b"></i><span><b>Black (A):</b>')
    return reorder_step5(t)


if __name__ == "__main__":
    p = sys.argv[1]
    s = open(p, encoding="utf-8").read()
    out = apply(s)
    open(p, "w", encoding="utf-8", newline="").write(out)
    print("ok", len(s), "->", len(out))
