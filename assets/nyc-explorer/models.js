/* ═══════════════════════════════════════════════════════════════
   NYC DATA EXPLORER -- Part 3: Modeling Options
   A planning page, not a results page. It explains two models that
   could fit the data profiled in Parts 1-2, what each needs, and why.
   Every chart here is an ILLUSTRATIVE shape drawn by hand, not fit to
   any NYC data.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  const C = { blue: '#0039a6', red: '#ee352e', green: '#00933c', orange: '#ff6319', purple: '#b933ad', gray: '#808183', ink: '#1b1d22' };
  const W = 560, H = 250, M = { l: 46, r: 16, t: 16, b: 38 };
  const iw = W - M.l - M.r, ih = H - M.t - M.b;
  const sx = (v, lo, hi) => M.l + (iw * (v - lo)) / (hi - lo);
  const sy = (v, lo, hi) => M.t + ih - (ih * (v - lo)) / (hi - lo);

  function frame(xTicks, yTicks, xLab, yLab, ylo, yhi, xlo, xhi) {
    let s = '';
    yTicks.forEach(([v, t]) => {
      const y = sy(v, ylo, yhi);
      s += `<line x1="${M.l}" x2="${W - M.r}" y1="${y}" y2="${y}" stroke="rgba(27,29,34,0.08)"/><text x="${M.l - 6}" y="${y + 4}" text-anchor="end">${t}</text>`;
    });
    xTicks.forEach(([v, t]) => {
      s += `<text x="${sx(v, xlo, xhi)}" y="${H - M.b + 16}" text-anchor="middle">${t}</text>`;
    });
    s += `<line x1="${M.l}" x2="${W - M.r}" y1="${M.t + ih}" y2="${M.t + ih}" stroke="rgba(27,29,34,0.25)"/>`;
    s += `<text x="${M.l + iw / 2}" y="${H - 4}" text-anchor="middle" style="fill:#5d616b">${xLab}</text>`;
    s += `<text transform="translate(12,${M.t + ih / 2}) rotate(-90)" text-anchor="middle" style="fill:#5d616b">${yLab}</text>`;
    return s;
  }
  const svg = (inner, w = W, h = H) => `<div class="nyc-chart"><svg viewBox="0 0 ${w} ${h}" role="img">${inner}</svg></div>`;
  const legend = (items) => `<div class="nyc-legend">${items.map(([c, l, dash]) => `<span><i style="background:${c};${dash ? 'opacity:.5' : ''}"></i>${l}</span>`).join('')}</div>`;
  const illus = '<div class="mdl-illus">Illustrative shape only — not fit to NYC data</div>';

  // ── Model A charts ─────────────────────────────────────────────
  // A1: why fixed effects -- three neighborhoods at different levels, same trend
  function chartFE() {
    const yrs = [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024];
    const nb = [
      { c: C.orange, base: 2.6, slope: 0.16, l: 'Neighborhood A (gentrifying)' },
      { c: C.blue, base: 1.9, slope: 0.05, l: 'Neighborhood B' },
      { c: C.green, base: 1.3, slope: 0.04, l: 'Neighborhood C' },
    ];
    let s = frame(yrs.filter((y) => y % 2 === 0).map((y) => [y, y]), [[1, '$1.0k'], [2, '$2.0k'], [3, '$3.0k'], [4, '$4.0k']], 'year', 'median rent', 0.8, 4.2, 2016, 2024);
    nb.forEach((n) => {
      const pts = yrs.map((y, i) => `${sx(y, 2016, 2024)},${sy(n.base + n.slope * i + (i === 4 ? -0.05 : 0), 0.8, 4.2)}`);
      s += `<polyline points="${pts.join(' ')}" fill="none" stroke="${n.c}" stroke-width="2.5"/>`;
    });
    s += `<text x="${sx(2016.2, 2016, 2024)}" y="${sy(3.95, 0.8, 4.2)}" style="fill:#1b1d22;font-weight:600">Levels differ for reasons we can't measure.</text>`;
    s += `<text x="${sx(2016.2, 2016, 2024)}" y="${sy(3.7, 0.8, 4.2)}" style="fill:#5d616b">Fixed effects ignore the level and model the change.</text>`;
    return svg(s) + legend(nb.map((n) => [n.c, n.l]));
  }
  // A2: lag coefficient plot
  function chartLags() {
    const lags = [
      { k: 0, b: 0.2, lo: -0.4, hi: 0.8 }, { k: 1, b: 0.9, lo: 0.4, hi: 1.4 }, { k: 2, b: 1.3, lo: 0.7, hi: 1.9 },
      { k: 3, b: 0.8, lo: 0.1, hi: 1.5 }, { k: 4, b: 0.3, lo: -0.5, hi: 1.1 },
    ];
    let s = frame(lags.map((d) => [d.k, d.k === 0 ? 'same yr' : `${d.k} yr${d.k > 1 ? 's' : ''} before`]),
      [[-0.5, '−0.5'], [0, '0'], [0.5, '0.5'], [1, '1.0'], [1.5, '1.5'], [2, '2.0']], 'how many years the signal came before the rent change', 'effect on rent growth (pts)', -0.7, 2.1, -0.5, 4.5);
    s += `<line x1="${M.l}" x2="${W - M.r}" y1="${sy(0, -0.7, 2.1)}" y2="${sy(0, -0.7, 2.1)}" stroke="#1b1d22" stroke-dasharray="4 3"/>`;
    lags.forEach((d) => {
      const x = sx(d.k, -0.5, 4.5);
      const sig = d.lo > 0;
      s += `<line x1="${x}" x2="${x}" y1="${sy(d.lo, -0.7, 2.1)}" y2="${sy(d.hi, -0.7, 2.1)}" stroke="${sig ? C.blue : C.gray}" stroke-width="2"/>`;
      s += `<circle cx="${x}" cy="${sy(d.b, -0.7, 2.1)}" r="6" fill="${sig ? C.blue : C.gray}"/>`;
    });
    s += `<text x="${sx(2, -0.5, 4.5) + 12}" y="${sy(1.75, -0.7, 2.1)}" style="fill:#1b1d22;font-weight:600">peak = the "early warning" lead time</text>`;
    return svg(s) + legend([[C.blue, 'interval clears zero → signal leads rent'], [C.gray, 'interval crosses zero → no evidence']]);
  }

  // ── Model B charts ─────────────────────────────────────────────
  // B1: survival curves for two groups
  function chartSurvival() {
    const yrs = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    const hi = [1, 0.95, 0.87, 0.77, 0.66, 0.57, 0.5, 0.44, 0.4];
    const lo = [1, 0.99, 0.97, 0.95, 0.92, 0.9, 0.88, 0.86, 0.84];
    const step = (arr) => {
      let p = `M${sx(0, 0, 8)},${sy(arr[0], 0.3, 1.02)}`;
      for (let i = 1; i < arr.length; i++) p += ` H${sx(i, 0, 8)} V${sy(arr[i], 0.3, 1.02)}`;
      return p;
    };
    let s = frame(yrs.map((y) => [y, 2016 + y]), [[0.4, '40%'], [0.6, '60%'], [0.8, '80%'], [1, '100%']], 'year', 'share NOT yet gentrified', 0.3, 1.02, 0, 8);
    s += `<path d="${step(lo)}" fill="none" stroke="${C.blue}" stroke-width="2.5"/>`;
    s += `<path d="${step(hi)}" fill="none" stroke="${C.orange}" stroke-width="2.5"/>`;
    s += `<text x="${sx(5.2, 0, 8)}" y="${sy(0.62, 0.3, 1.02)}" style="fill:${C.orange};font-weight:600">high restaurant turnover</text>`;
    s += `<text x="${sx(5.2, 0, 8)}" y="${sy(0.94, 0.3, 1.02)}" style="fill:${C.blue};font-weight:600">low restaurant turnover</text>`;
    return svg(s);
  }
  // B2: hazard by year
  function chartHazard() {
    const hz = [0.01, 0.03, 0.06, 0.1, 0.12, 0.11, 0.09, 0.07];
    let s = frame(hz.map((_, i) => [i + 1, 2017 + i]), [[0, '0%'], [0.05, '5%'], [0.1, '10%'], [0.15, '15%']], 'year', 'P(tips this year | not yet)', 0, 0.15, 0.3, 8.7);
    const bw = iw / 10;
    hz.forEach((h, i) => {
      const x = sx(i + 1, 0.3, 8.7);
      s += `<rect x="${x - bw / 2}" y="${sy(h, 0, 0.15)}" width="${bw}" height="${sy(0, 0, 0.15) - sy(h, 0, 0.15)}" fill="${C.purple}" rx="2"/>`;
    });
    return svg(s);
  }

  // ── shared diagrams ────────────────────────────────────────────
  function timelineA() {
    const w = 640, h = 150;
    const xs = [70, 200, 330, 460, 590];
    const lab = ['t−3', 't−2', 't−1', 't', 't+1'];
    let s = `<line x1="40" x2="620" y1="80" y2="80" stroke="#9a9ea8" stroke-width="2"/>`;
    xs.forEach((x, i) => { s += `<circle cx="${x}" cy="80" r="5" fill="#1b1d22"/><text x="${x}" y="104" text-anchor="middle" style="font-family:monospace">${lab[i]}</text>`; });
    [[70, 'permits filed'], [200, 'chain opens / turnover'], [330, 'sale prices jump']].forEach(([x, t], i) => {
      s += `<rect x="${x - 58}" y="${18 + (i % 2) * 0}" width="116" height="30" rx="6" fill="rgba(0,57,166,0.09)" stroke="${C.blue}"/><text x="${x}" y="38" text-anchor="middle" style="fill:${C.blue};font-weight:600">${t}</text>`;
      s += `<path d="M${x},50 Q${(x + 460) / 2},${130 + i * 6} 452,86" fill="none" stroke="${C.blue}" stroke-dasharray="4 3" marker-end="url(#mdl-arrow)"/>`;
    });
    s += `<rect x="402" y="18" width="116" height="30" rx="6" fill="rgba(255,99,25,0.12)" stroke="${C.orange}"/><text x="460" y="38" text-anchor="middle" style="fill:${C.orange};font-weight:700">rent growth (Y)</text>`;
    s += `<text x="40" y="140" style="fill:#5d616b">Signals are measured BEFORE the outcome year, so the model can only use what you'd have known at the time.</text>`;
    return `<div class="nyc-chart"><svg viewBox="0 0 ${w} ${h}"><defs><marker id="mdl-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="${C.blue}"/></marker></defs>${s}</svg></div>`;
  }

  function personPeriod() {
    const rows = [
      ['Bushwick (N)', 2016, 'no', 0.08, 'yes', 0], ['Bushwick (N)', 2017, 'no', 0.11, 'yes', 0], ['Bushwick (N)', 2018, 'no', 0.14, 'yes', 1],
      ['East NY', 2016, 'no', 0.04, 'no', 0], ['East NY', 2017, 'no', 0.05, 'no', 0], ['East NY', '…', '', '', '', ''],
    ];
    return `<div class="nyc-table-wrap"><table class="nyc-table"><thead><tr><th>neighborhood</th><th>year</th><th>already gentrified?</th><th>turnover rate (t−1)</th><th>chain opened (t−1)</th><th>Y = tipped this year</th></tr></thead><tbody>
      ${rows.map((r) => `<tr>${r.map((v, i) => `<td class="${i === 5 ? 'num' : i === 0 ? '' : 'mono'}"${i === 5 && v === 1 ? ' style="color:#ee352e;font-weight:700"' : ''}>${v}</td>`).join('')}</tr>`).join('')}
      </tbody></table></div><p class="mdl-cap">One row per neighborhood per year it's still "at risk." Bushwick-North leaves the table after the year it tips (Y=1). Values are made up to show the shape.</p>`;
  }

  const vars = (rows) => `<div class="mdl-vars">${rows.map(([role, name, src, note]) => `<div class="mdl-var mdl-${role}"><div class="mdl-var-role">${role === 'y' ? 'outcome' : role === 'x' ? 'signal' : 'control'}</div><div class="mdl-var-name">${name}</div><div class="mdl-var-src">${src}</div>${note ? `<div class="mdl-var-note">${note}</div>` : ''}</div>`).join('')}</div>`;

  const needs = (items) => `<ul class="mdl-needs">${items.map(([ok, t]) => `<li class="${ok}"><span>${ok === 'have' ? '✓' : ok === 'partial' ? '◐' : '✗'}</span>${t}</li>`).join('')}</ul>`;

  function steps(list) {
    return `<ol class="mdl-steps">${list.map(([h, b]) => `<li><b>${h}</b><span>${b}</span></li>`).join('')}</ol>`;
  }

  window.nycRenderModels = function (main) {
    main.innerHTML = `
    <header class="nyc-hero">
      <div class="nyc-eyebrow">Part 3 · Modeling Options · nothing fit yet</div>
      <h1 class="nyc-title">How could we model gentrification?</h1>
      <p class="nyc-lede">Parts 1–2 described the data. This page plans the modeling step: two models that fit how our data is shaped (neighborhoods observed year after year), what each one needs, and how to read it. <strong>No model has been run.</strong> Every chart below is a hand-drawn example of what the output would look like.</p>
    </header>

    <div class="mdl-compare">
      <div class="mdl-card a"><div class="mdl-tag">Model A</div><h2>Panel regression with fixed effects &amp; lags</h2><p class="mdl-q">“<b>How much</b> do early signals predict a neighborhood's rent growth a few years later?”</p><div class="mdl-chips"><span>continuous outcome</span><span>neighborhood × year</span><span>lead time</span></div></div>
      <div class="mdl-card b"><div class="mdl-tag">Model B</div><h2>Discrete-time hazard (survival) model</h2><p class="mdl-q">“<b>When</b> does a neighborhood tip into gentrifying, and which signals speed that up?”</p><div class="mdl-chips"><span>yes/no event</span><span>timing</span><span>only at-risk areas</span></div></div>
    </div>

    <section class="nyc-panel">
      <div class="nyc-kicker">Why these two</div>
      <h2>Our data is a panel: the same neighborhoods, measured every year</h2>
      <p>Property sales (2016–2025), ACS rent and income (2009–2024), permits, crime, and capital spending can all be rolled up to <strong>neighborhood (NTA) × year</strong>. That shape asks for a time-series panel model rather than a one-shot snapshot. The two models below treat the outcome in the two ways it can be defined: as a <strong>number</strong> (how fast rent rose) or as an <strong>event</strong> (the year a place crossed a gentrification line).</p>
    </section>

    <!-- ═════════ MODEL A ═════════ -->
    <h2 class="mdl-section a">Model A · Panel regression with fixed effects and lagged signals</h2>

    <section class="nyc-panel">
      <div class="nyc-kicker">The idea in one equation</div>
      <div class="mdl-eq">RentGrowth<sub>n,t</sub> = <span class="x">β<sub>1</sub>·Signal<sub>n,t−1</sub> + β<sub>2</sub>·Signal<sub>n,t−2</sub> + …</span> + <span class="c">γ·Controls<sub>n,t</sub></span> + <span class="fe">α<sub>n</sub></span> + <span class="fe">δ<sub>t</sub></span> + ε<sub>n,t</sub></div>
      <div class="mdl-eq-key">
        <span><i class="x"></i><b>β</b> — what we want: how much a signal 1, 2, 3 years ago moves rent growth now</span>
        <span><i class="fe"></i><b>α<sub>n</sub></b> neighborhood effect: absorbs everything fixed about a place (location, housing stock, reputation)</span>
        <span><i class="fe"></i><b>δ<sub>t</sub></b> year effect: absorbs citywide shocks (COVID, interest rates, 421-a)</span>
        <span><i class="c"></i><b>γ</b> controls: things that change over time we want held constant</span>
      </div>
      ${timelineA()}
    </section>

    <div class="nyc-row">
      <section class="nyc-panel"><div class="nyc-kicker">How it works</div><h2>Compare each neighborhood to itself</h2>
        ${chartFE()}${illus}
        <p class="mdl-cap">Fixed effects mean Bushwick is compared to Bushwick's own past, not to the Upper East Side. The question becomes: <em>in years after a signal spiked, did rent grow faster than this place usually does, beyond what the whole city did that year?</em></p>
      </section>
      <section class="nyc-panel"><div class="nyc-kicker">What the output looks like</div><h2>One estimate per lag</h2>
        ${chartLags()}${illus}
        <p class="mdl-cap">Each dot is a β. If dots 1–3 years back clear zero, the signal leads rent — that's the "early warning." If only the same-year dot is positive, the signal is just moving <em>with</em> gentrification, not ahead of it.</p>
      </section>
    </div>

    <section class="nyc-panel">
      <div class="nyc-kicker">Variables</div><h2>What goes in</h2>
      ${vars([
        ['y', 'Rent growth vs. city', 'ACS 5-yr tract median rent → NTA', 'or property-value % change vs. city (DOF sales)'],
        ['x', 'Restaurant turnover rate', 'DOHMH inspections / licenses', 'closures ÷ active, per year'],
        ['x', 'Chain / fast-food entry', 'Chains & Lists tab', 'count of new chain openings'],
        ['x', 'Renovation &amp; new-building permits', 'DOB permits', 'per 1,000 units'],
        ['x', 'Sale price change vs. city', 'DOF rolling sales', 'median $/sale, relative'],
        ['x', 'Capital &amp; subway investment', 'Capital Spending, Subway tabs', '$ committed nearby'],
        ['c', 'Crime rate', 'NYPD complaints', 'felonies per 1,000'],
        ['c', 'Baseline income / renter share', 'ACS', 'held at start year'],
      ])}
    </section>

    <div class="nyc-row">
      <section class="nyc-panel"><div class="nyc-kicker">Steps</div><h2>How we'd build it</h2>
        ${steps([
          ['Pick the unit', 'NTA 2020 × year (~195 residential NTAs). Crosswalk 2010-NTA inspection codes and tracts to it.'],
          ['Build the outcome', 'Rent growth relative to city median each year.'],
          ['Lag the signals', 'Shift each signal 1, 2, 3 years back so only "known before" values predict.'],
          ['Fit with two-way FE', 'OLS with neighborhood + year dummies; cluster standard errors by neighborhood.'],
          ['Read the lags', 'Plot β by lag; test out-of-sample on the last 2 years.'],
        ])}
      </section>
      <section class="nyc-panel"><div class="nyc-kicker">What we need · do we have it?</div><h2>Fit with our data</h2>
        ${needs([
          ['have', 'Same neighborhoods measured over many years (sales 2016–25, ACS 2009–24)'],
          ['have', 'A continuous outcome — rent and sale prices exist every year'],
          ['partial', 'Restaurant signals with history: DOHMH keeps only ~3 years, so lags of 2–3 yrs leave very few usable years. The 2017 snapshot and liquor licenses can stretch this.'],
          ['partial', 'Consistent geography: NTA 2010 vs 2020 and the 2022 PUMA redraw need crosswalks'],
          ['partial', 'ACS 5-yr estimates overlap (2019 and 2020 share 4 of 5 years), which smooths changes — use non-overlapping windows or sales data for annual change'],
        ])}
      </section>
    </div>

    <div class="nyc-note"><b>Why it fits:</b> it uses the panel shape directly, removes the "rich areas are just different" problem with fixed effects, and answers the lead-time question from Part 1's idea list. <b>Watch for:</b> reverse timing (rent rising draws chains in), and few years of restaurant history.</div>

    <!-- ═════════ MODEL B ═════════ -->
    <h2 class="mdl-section b">Model B · Discrete-time hazard (survival) model</h2>

    <section class="nyc-panel">
      <div class="nyc-kicker">The idea in one equation</div>
      <div class="mdl-eq">log( h<sub>n,t</sub> ⁄ (1 − h<sub>n,t</sub>) ) = <span class="fe">α<sub>t</sub></span> + <span class="x">β·Signals<sub>n,t−1</sub></span> + <span class="c">γ·Baseline<sub>n</sub></span></div>
      <div class="mdl-eq-key">
        <span><i class="fe"></i><b>h<sub>n,t</sub></b> hazard: chance neighborhood <i>n</i> tips in year <i>t</i>, given it hasn't yet</span>
        <span><i class="fe"></i><b>α<sub>t</sub></b> baseline hazard: how risky each year is citywide</span>
        <span><i class="x"></i><b>e<sup>β</sup></b> odds ratio: "high turnover multiplies the yearly odds of tipping by 1.8×"</span>
        <span><i class="c"></i><b>γ</b> starting conditions: income, renter share, distance to an already-gentrified area</span>
      </div>
      <p>It's a logistic regression run on a special table: one row per neighborhood per year <em>while it is still at risk</em>. Once a place tips, it leaves the table.</p>
      ${personPeriod()}
    </section>

    <div class="nyc-row">
      <section class="nyc-panel"><div class="nyc-kicker">Output 1 · survival curve</div><h2>Who stays un-gentrified longer?</h2>
        ${chartSurvival()}${illus}
        <p class="mdl-cap">Start with every low-income neighborhood at 100%. Each year some tip. If the high-turnover group drops faster, turnover is an early signal.</p>
      </section>
      <section class="nyc-panel"><div class="nyc-kicker">Output 2 · hazard by year</div><h2>When is risk highest?</h2>
        ${chartHazard()}${illus}
        <p class="mdl-cap">The yearly α<sub>t</sub>: the citywide chance an at-risk neighborhood tips that year. Shows booms and pauses (e.g., a COVID dip).</p>
      </section>
    </div>

    <section class="nyc-panel">
      <div class="nyc-kicker">Variables</div><h2>What goes in</h2>
      ${vars([
        ['y', 'Tipped this year (0/1)', 'built from ACS + sales', 'first year a low-income area\'s rent growth AND college-share growth beat the city median (Furman-style)'],
        ['x', 'Restaurant turnover (t−1)', 'DOHMH / licenses', ''],
        ['x', 'Chain or "list" restaurant opened (t−1)', 'Chains & Lists', 'yes/no'],
        ['x', 'Permit surge (t−1)', 'DOB permits', 'above own 3-yr average'],
        ['x', 'Next to a gentrified area', 'NTA boundaries', 'spatial spillover'],
        ['c', 'Baseline income, renter %, rent level', 'ACS start year', 'defines who is "at risk"'],
      ])}
    </section>

    <div class="nyc-row">
      <section class="nyc-panel"><div class="nyc-kicker">Steps</div><h2>How we'd build it</h2>
        ${steps([
          ['Define "at risk"', 'Neighborhoods in the bottom 40% of income at the start year (the Furman rule used in Part 2).'],
          ['Define the event', 'The first year it crosses the gentrification line. Decide this rule before looking at signals.'],
          ['Make the person-period table', 'One row per at-risk neighborhood-year; drop rows after the event.'],
          ['Fit a logistic regression', 'Year dummies + lagged signals; report odds ratios.'],
          ['Draw survival curves', 'Compare groups (high vs low signal); check with a held-out set of years.'],
        ])}
      </section>
      <section class="nyc-panel"><div class="nyc-kicker">What we need · do we have it?</div><h2>Fit with our data</h2>
        ${needs([
          ['have', 'A low-income starting group (ACS income by tract)'],
          ['have', 'Annual data to date an event (sales, ACS)'],
          ['partial', 'Enough events: maybe 15–40 neighborhoods tip in our window — fine for 2–4 signals, not 10'],
          ['partial', 'Same restaurant-history limit as Model A'],
          ['need', 'An agreed event definition — the result depends heavily on where the line is drawn; must be fixed up front'],
        ])}
      </section>
    </div>

    <div class="nyc-note"><b>Why it fits:</b> gentrification is usually described as something a place <em>goes through</em>, and this model matches that — it answers "when" and handles neighborhoods that haven't tipped yet (censoring) instead of throwing them out. <b>Watch for:</b> a fuzzy event definition and a small number of events.</div>

    <!-- ═════════ COMPARE ═════════ -->
    <section class="nyc-panel">
      <div class="nyc-kicker">Side by side</div><h2>Which to use when</h2>
      <div class="nyc-table-wrap"><table class="nyc-table"><thead><tr><th></th><th>Model A · FE panel</th><th>Model B · hazard</th></tr></thead><tbody>
        <tr><td class="muted">Outcome</td><td>rent growth (a number)</td><td>tipped yes/no (an event)</td></tr>
        <tr><td class="muted">Answers</td><td>how much, and how far ahead</td><td>when, and how much more likely</td></tr>
        <tr><td class="muted">Rows</td><td>every neighborhood-year</td><td>only at-risk neighborhood-years</td></tr>
        <tr><td class="muted">Key output</td><td>β by lag (lead-time plot)</td><td>odds ratios + survival curves</td></tr>
        <tr><td class="muted">Biggest risk</td><td>reverse timing</td><td>event definition, few events</td></tr>
      </tbody></table></div>
      <p class="mdl-cap" style="margin-top:.75rem">They complement each other: run A to find which signals lead rent and by how much, then use those signals in B to predict which low-income neighborhoods are next.</p>
    </section>

    <section class="nyc-panel">
      <div class="nyc-kicker">Also considered</div><h2>Other options, briefly</h2>
      <div class="mdl-alt">
        <div><b>Event study / diff-in-diff</b><span>Treat a single shock (new subway station, rezoning) as the "treatment" and compare before/after vs. similar areas. Good for one signal, not many.</span></div>
        <div><b>Spatial lag model</b><span>Adds neighbors' values — gentrification spreads block to block (Williamsburg → Bushwick). Could be an add-on to A.</span></div>
        <div><b>Random forest / gradient boosting</b><span>Better pure prediction, harder to explain, and needs more events than we likely have.</span></div>
        <div><b>Synthetic control</b><span>Build a "fake Bushwick" from other areas to show what would have happened. Great for a case study, one place at a time.</span></div>
      </div>
    </section>`;
  };
})();
