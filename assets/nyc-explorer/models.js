/* ═══════════════════════════════════════════════════════════════
   NYC DATA EXPLORER -- Part 3: Modeling Options
   Model A is planned only; its charts are ILLUSTRATIVE shapes drawn by
   hand. Model B (chosen) and the spatio-temporal Model C are test-fit on
   real ACS tract data by nyc-data-explorer/build_models.py, with no
   gentrification signals in them yet; those charts read models_check*.json.
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

  function steps(list) {
    return `<ol class="mdl-steps">${list.map(([h, b]) => `<li><b>${h}</b><span>${b}</span></li>`).join('')}</ol>`;
  }

  // ── Real-data charts (models_check.json, built by nyc-data-explorer/build_models.py) ──
  const real = '<div class="mdl-real">Real data · ACS 5-year, NYC census tracts (2010 lines), 2010–2019</div>';
  const B_COL = C.purple, C_COL = '#00add0', NULL_COL = C.gray;
  const f2 = (v) => v.toFixed(2), f3 = (v) => v.toFixed(3), pc = (v) => (100 * v).toFixed(1) + '%';
  const tipAttr = (h) => ` data-tip="${String(h).replace(/"/g, '&quot;')}"`;

  // B-1: how many events each version of the definition produces, and how many flip back
  function chartDefs(D) {
    const w = 560, h = 190, l = 150, r = 70, top = 12, rowH = 52;
    const n = D.n_at_risk;
    const x = (v) => l + ((w - l - r) * v) / n;
    const rows = [
      ['v1', 'v1 · naive', 'beat the median once'],
      ['v2', 'v2 · confirmed', '…and holds 2 vintages'],
      ['v3', 'v3 · strict', 'top third, then holds'],
    ];
    let s = '';
    [0, 200, 400, 600, 800].forEach((v) => {
      s += `<line x1="${x(v)}" x2="${x(v)}" y1="${top}" y2="${top + rowH * 3 - 10}" stroke="rgba(27,29,34,0.07)"/><text x="${x(v)}" y="${top + rowH * 3 + 4}" text-anchor="middle">${v}</text>`;
    });
    rows.forEach(([k, lab, sub], i) => {
      const d = D.definitions[k], y = top + i * rowH;
      const keep = d.events - d.flip_back;
      s += `<text x="0" y="${y + 15}" style="fill:#1b1d22;font-weight:700">${lab}</text><text x="0" y="${y + 29}" style="font-size:10px">${sub}</text>`;
      s += `<rect x="${l}" y="${y + 4}" width="${x(keep) - l}" height="26" rx="3" fill="${B_COL}"${tipAttr(`<b>${lab}</b><br>${d.events} of ${n} at-risk tracts “tip”${d.flip_back ? `<br>${d.flip_back} of them later fall back below the line` : ''}`)}/>`;
      if (d.flip_back) s += `<rect x="${x(keep) + 2}" y="${y + 4}" width="${x(d.events) - x(keep) - 2}" height="26" rx="3" fill="url(#mdl-hatch)" stroke="${C.red}" stroke-width="1"${tipAttr(`${d.flip_back} “events” that later undo themselves: survey noise, not gentrification`)}/>`;
      s += `<text x="${x(d.events) + 6}" y="${y + 22}" class="bar-label" style="font-weight:700">${d.events}</text>`;
    });
    s += `<text x="${l + (w - l - r) / 2}" y="${h - 2}" text-anchor="middle" style="fill:#5d616b">at-risk tracts that “tip” (of ${n})</text>`;
    return `<div class="nyc-chart"><svg viewBox="0 0 ${w} ${h}"><defs><pattern id="mdl-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="rgba(238,53,46,0.10)"/><line x1="0" y1="0" x2="0" y2="6" stroke="${C.red}" stroke-width="2"/></pattern></defs>${s}</svg></div>` +
      legend([[B_COL, 'event that holds'], [C.red, 'event that later flips back (noise)']]);
  }

  // B-2: real survival curves under each definition
  function chartSurvReal(D) {
    const n = D.n_at_risk, yrs = d3.range(2010, 2020);
    const lines = [['v1', NULL_COL, 'v1 naive', '6 3'], ['v2', B_COL, 'v2 confirmed', ''], ['v3', C.ink, 'v3 strict', '']];
    let s = frame(yrs.filter((y) => y % 2 === 0 || y === 2019).map((y) => [y, y]), [[0.2, '20%'], [0.4, '40%'], [0.6, '60%'], [0.8, '80%'], [1, '100%']], 'ACS 5-year vintage', 'share NOT yet tipped', 0.2, 1.02, 2010, 2019);
    lines.forEach(([k, col, lab, dash]) => {
      const by = D.definitions[k].by_year, last = k === 'v1' ? 2019 : 2017;
      let S = 1, p = `M${sx(2010, 2010, 2019)},${sy(1, 0.2, 1.02)}`;
      for (let y = 2011; y <= last; y++) { S -= by[y] / n; p += ` H${sx(y, 2010, 2019)} V${sy(S, 0.2, 1.02)}`; }
      s += `<path d="${p}" fill="none" stroke="${col}" stroke-width="2.5" ${dash ? `stroke-dasharray="${dash}"` : ''}/>`;
      const end = last === 2019;  // v1 runs to the right edge: label it inside, under the line
      s += `<text x="${sx(last, 2010, 2019) + (end ? -2 : 4)}" y="${sy(S, 0.2, 1.02) + (end ? 16 : 4)}" text-anchor="${end ? 'end' : 'start'}" style="fill:#1b1d22;font-weight:600">${lab} · ${pc(S)}</text>`;
    });
    const x0 = sx(2017, 2010, 2019), x1 = sx(2019, 2010, 2019);
    s += `<rect x="${x0}" y="${M.t}" width="${x1 - x0}" height="${ih}" fill="rgba(128,129,131,0.08)"/><text x="${(x0 + x1) / 2}" y="${M.t + 12}" text-anchor="middle" style="font-size:10px">can't confirm yet</text>`;
    return svg(s) + legend(lines.map(([, c, l]) => [c, l]));
  }

  // B-3: real baseline hazard (v2)
  function chartHazReal(D) {
    const hz = D.definitions.v2.hazard, yrs = d3.range(2011, 2018);
    let s = frame(yrs.map((y) => [y, y]), [[0, '0%'], [0.04, '4%'], [0.08, '8%'], [0.12, '12%']], 'year it tipped (v2)', 'P(tips this year | not yet)', 0, 0.14, 2010.4, 2017.6);
    const bw = iw / 11;
    yrs.forEach((y) => {
      const x = sx(y, 2010.4, 2017.6), v = hz[y], first = y === 2011;
      s += `<rect x="${x - bw / 2}" y="${sy(v, 0, 0.14)}" width="${bw}" height="${sy(0, 0, 0.14) - sy(v, 0, 0.14)}" fill="${first ? 'url(#mdl-hatch2)' : B_COL}" stroke="${first ? NULL_COL : 'none'}" rx="3"${tipAttr(`<b>${y}</b>: ${pc(v)} of still-at-risk tracts tipped${first ? '<br>first look: mostly change that happened before 2010' : ''}`)}/>`;
      s += `<text x="${x}" y="${sy(v, 0, 0.14) - 5}" text-anchor="middle" class="bar-label">${pc(v)}</text>`;
    });
    s += `<text x="${sx(2011, 2010.4, 2017.6) + bw / 2 + 6}" y="${sy(0.125, 0, 0.14)}" style="font-size:10px">← already tipped at start: left out of the model</text>`;
    return `<div class="nyc-chart"><svg viewBox="0 0 ${W} ${H}"><defs><pattern id="mdl-hatch2" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="rgba(128,129,131,0.12)"/><line x1="0" y1="0" x2="0" y2="6" stroke="${NULL_COL}" stroke-width="2"/></pattern></defs>${s}</svg></div>`;
  }

  // maps
  const MW = 600, MH = 600;
  function tractMap(D, fill, tipFn, extra = '') {
    const geo = D.geo;
    const proj = d3.geoMercator().fitExtent([[4, 4], [MW - 4, MH - 4]], geo);
    const path = d3.geoPath(proj);
    const paths = geo.features.map((f) => `<path d="${path(f)}" fill="${fill(f.properties)}" stroke="#fff" stroke-width="0.25"${tipAttr(tipFn(f.properties))}/>`).join('');
    return `<div class="nyc-chart mdl-map"><svg viewBox="0 0 ${MW} ${MH}">${paths}${extra}</svg></div>`;
  }
  const NOT_RISK = '#efeee9', RISK_NO = '#c9cad0';
  function mapEvents(D) {
    const col = d3.scaleSequential((t) => d3.interpolatePurples(0.35 + 0.6 * t)).domain([2017, 2011]);
    const m = tractMap(D, (p) => (!p.r ? NOT_RISK : p.e2 ? col(p.e2) : RISK_NO),
      (p) => `<b>${p.nta}</b> · tract ${p.t}<br>${!p.r ? 'not low-income in 2006–10 (not at risk)' : p.e2 ? `tipped in <b>${p.e2}</b> (v2)` : 'at risk, did not tip by 2017'}`);
    return m + legend([[col(2011), 'tipped early (2011)'], [col(2017), 'tipped late (2017)'], [RISK_NO, 'at risk, did not tip'], [NOT_RISK, 'not at risk']]);
  }
  const div = d3.scaleLinear().domain([-0.8, 0, 0.8]).range([C.blue, '#ecebe6', C.red]).clamp(true);
  function mapU(D) {
    return tractMap(D, (p) => (p.u == null ? '#f7f7f4' : div(p.u * 0.55)),
      (p) => (p.u == null ? `<b>${p.nta}</b><br>not in the model` : `<b>${p.nta}</b><br>place effect u = ${p.u > 0 ? '+' : ''}${f2(p.u)} (log-odds)<br>${p.u > 0 ? 'riskier' : 'safer'} than its numbers alone say`)) +
      legend([[C.red, 'C learned: riskier than the numbers say'], [C.blue, 'safer than the numbers say'], ['#ecebe6', 'no adjustment']]);
  }

  // H-0: is there clustering left in each model's errors? observed Moran's I vs its permutation null
  function chartResidI(M_, M3) {
    const rows = [['Model B · v2', M_.resid_I.B, B_COL], ['Model C · v2', M_.resid_I.C, C_COL], ['Model B · v3', M3.resid_I.B, B_COL], ['Model C · v3', M3.resid_I.C, C_COL]];
    const w = 560, h = 200, l = 110, r = 30, top = 12, rh = 36, lo = -0.06, hi = 0.1;
    const x = (v) => l + ((w - l - r) * (v - lo)) / (hi - lo);
    let s = '';
    [-0.05, 0, 0.05, 0.1].forEach((v) => { s += `<line x1="${x(v)}" x2="${x(v)}" y1="${top}" y2="${top + rh * 4}" stroke="${v === 0 ? 'rgba(27,29,34,0.3)' : 'rgba(27,29,34,0.07)'}"/><text x="${x(v)}" y="${top + rh * 4 + 14}" text-anchor="middle">${v.toFixed(2)}</text>`; });
    rows.forEach(([lab, [I, p, , q0, q1], col], i) => {
      const y = top + i * rh + rh / 2, sig = p < 0.05;
      s += `<text x="0" y="${y + 4}" style="fill:#1b1d22;font-weight:600">${lab}</text>`;
      s += `<rect x="${x(q0)}" y="${y - 9}" width="${x(q1) - x(q0)}" height="18" rx="3" fill="rgba(128,129,131,0.18)"/>`;
      s += `<circle cx="${x(I)}" cy="${y}" r="7" fill="${col}" stroke="#fff" stroke-width="2"${tipAttr(`<b>${lab}</b><br>Moran's I of errors = ${I}<br>chance range: ${q0.toFixed(3)} to ${q1.toFixed(3)}<br>permutation p = ${p}`)}/>`;
      s += `<text x="${x(I) + 12}" y="${y + 4}" class="bar-label" style="font-weight:${sig ? 700 : 400}">${I} ${sig ? '· clustered' : '· random'}</text>`;
    });
    s += `<text x="${l + (w - l - r) / 2}" y="${h - 2}" text-anchor="middle" style="fill:#5d616b">Moran's I of each tract's error (tipped − predicted), 2012–15</text>`;
    return `<div class="nyc-chart"><svg viewBox="0 0 ${w} ${h}">${s}</svg></div>` + legend([['rgba(128,129,131,0.35)', 'range chance alone gives (999 shuffles)'], [B_COL, 'Model B'], [C_COL, 'Model C']]);
  }
  // H-1: held-out scores
  function chartScores(M_) {
    const rows = [['Null · base rate only', M_.null, NULL_COL], ['Model B · hazard', M_.B, B_COL],
      ['C without place effect', M_.C_noRE, '#7fd3e6'], ['Model C · spatio-temporal', M_.C, C_COL]];
    const w = 560, h = 200, l = 170, r = 40, top = 14, rh = 36;
    const x = (v) => l + ((w - l - r) * (v - 0.5)) / 0.4;
    let s = '';
    [0.5, 0.6, 0.7, 0.8, 0.9].forEach((v) => { s += `<line x1="${x(v)}" x2="${x(v)}" y1="${top}" y2="${top + rh * 4}" stroke="rgba(27,29,34,0.07)"/><text x="${x(v)}" y="${top + rh * 4 + 14}" text-anchor="middle">${v.toFixed(1)}</text>`; });
    rows.forEach(([lab, m, col], i) => {
      const y = top + i * rh + rh / 2;
      s += `<text x="0" y="${y + 4}" style="fill:#1b1d22;font-weight:${i === 3 || i === 1 ? 700 : 400}">${lab}</text>`;
      s += `<line x1="${x(0.5)}" x2="${x(m.auc)}" y1="${y}" y2="${y}" stroke="${col}" stroke-width="2"/>`;
      s += `<circle cx="${x(m.auc)}" cy="${y}" r="7" fill="${col}" stroke="#fff" stroke-width="2"${tipAttr(`<b>${lab}</b><br>AUC ${f3(m.auc)}<br>log-loss ${f3(m.logloss)}`)}/>`;
      s += `<text x="${x(m.auc) + 12}" y="${y + 4}" class="bar-label">${f3(m.auc)}</text>`;
    });
    s += `<text x="${l + (w - l - r) / 2}" y="${h - 2}" text-anchor="middle" style="fill:#5d616b">AUC on held-out years 2016–17 (0.5 = coin flip)</text>`;
    return `<div class="nyc-chart"><svg viewBox="0 0 ${w} ${h}">${s}</svg></div>`;
  }
  // H-2: calibration
  function chartCalib(M_) {
    const hi = 0.17;
    let s = frame([[0, '0%'], [0.05, '5%'], [0.1, '10%'], [0.15, '15%']], [[0, '0%'], [0.05, '5%'], [0.1, '10%'], [0.15, '15%']], 'predicted chance of tipping', 'observed share that tipped', 0, hi, 0, hi);
    s += `<line x1="${sx(0, 0, hi)}" y1="${sy(0, 0, hi)}" x2="${sx(hi, 0, hi)}" y2="${sy(hi, 0, hi)}" stroke="#1b1d22" stroke-dasharray="4 3"/><text x="${sx(0.118, 0, hi)}" y="${sy(0.128, 0, hi)}" style="font-size:10px" transform="rotate(-24 ${sx(0.118, 0, hi)} ${sy(0.128, 0, hi)})">perfect calibration</text>`;
    [['B', B_COL], ['C', C_COL]].forEach(([k, col]) => {
      const pts = M_.calib[k];
      s += `<polyline points="${pts.map((p) => `${sx(p.pred, 0, hi)},${sy(p.obs, 0, hi)}`).join(' ')}" fill="none" stroke="${col}" stroke-width="2"/>`;
      pts.forEach((p, i) => { s += `<circle cx="${sx(p.pred, 0, hi)}" cy="${sy(p.obs, 0, hi)}" r="6" fill="${col}" stroke="#fff" stroke-width="2"${tipAttr(`<b>Model ${k}</b>, risk group ${i + 1} of 5 (${p.n} tract-years)<br>predicted ${pc(p.pred)} · observed ${pc(p.obs)}`)}/>`; });
    });
    return svg(s) + legend([[B_COL, 'Model B'], [C_COL, 'Model C']]);
  }
  // H-3: watch list
  function chartWatch(M_) {
    const t = M_.top50, rows = [['Random 50 tracts', t.random, NULL_COL], ['Model B’s top 50', t.B, B_COL], ['Model C’s top 50', t.C, C_COL]];
    const w = 560, h = 150, l = 140, r = 50, rh = 38, x = (v) => l + ((w - l - r) * v) / 20;
    let s = '';
    rows.forEach(([lab, v, col], i) => {
      const y = 8 + i * rh;
      s += `<text x="0" y="${y + 19}" style="fill:#1b1d22;font-weight:600">${lab}</text><rect x="${l}" y="${y + 4}" width="${x(v) - l}" height="24" rx="3" fill="${col}"${tipAttr(`${lab}: ${v} of 50 tipped in 2016–17`)}/><text x="${x(v) + 6}" y="${y + 21}" class="bar-label" style="font-weight:700">${v}</text>`;
    });
    s += `<text x="${l + (w - l - r) / 2}" y="${h - 4}" text-anchor="middle" style="fill:#5d616b">of 50 flagged tracts, how many tipped in 2016–17 (${t.tipped} tipped among ${t.pool} at risk)</text>`;
    return `<div class="nyc-chart"><svg viewBox="0 0 ${w} ${h}">${s}</svg></div>`;
  }
  // C diagram: B sees independent tracts, C sees a network
  function diagramBC() {
    const w = 640, h = 190, pts = [];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) pts.push([c * 46 + (r % 2) * 23, r * 38]);
    const hot = new Set([6, 7, 11, 12]), next = new Set([2, 8, 13, 16, 17]);
    const panel = (ox, links, title, sub) => {
      let s = `<text x="${ox}" y="16" style="fill:#1b1d22;font-weight:700">${title}</text><text x="${ox}" y="31" style="font-size:10px">${sub}</text>`;
      if (links) pts.forEach((a, i) => pts.forEach((b, j) => {
        if (j > i && Math.hypot(a[0] - b[0], a[1] - b[1]) < 50) s += `<line x1="${ox + 20 + a[0]}" y1="${52 + a[1]}" x2="${ox + 20 + b[0]}" y2="${52 + b[1]}" stroke="${hot.has(i) || hot.has(j) ? C_COL : '#d4d5da'}" stroke-width="${hot.has(i) || hot.has(j) ? 2 : 1}"/>`;
      }));
      pts.forEach((p, i) => { s += `<circle cx="${ox + 20 + p[0]}" cy="${52 + p[1]}" r="8" fill="${hot.has(i) ? C.red : links && next.has(i) ? '#f6b3ae' : '#e4e4de'}" stroke="#fff" stroke-width="2"/>`; });
      return s;
    };
    const s = panel(0, false, 'Model B', 'each tract on its own; the map is invisible') + panel(330, true, 'Model C', 'neighbors are linked; risk spreads along the links');
    return `<div class="nyc-chart"><svg viewBox="0 0 ${w} ${h}">${s}</svg></div>` +
      legend([[C.red, 'tract that tipped last year'], ['#f6b3ae', 'its neighbors: C raises their risk'], ['#e4e4de', 'other at-risk tracts']]);
  }

  const proscons = (pros, cons) => `<div class="mdl-pc"><div class="pro"><b>Pros</b><ul>${pros.map((p) => `<li>${p}</li>`).join('')}</ul></div><div class="con"><b>Cons</b><ul>${cons.map((p) => `<li>${p}</li>`).join('')}</ul></div></div>`;

  // ── Illustrative charts for the planning page (Part 3) ─────────
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
  // C1: hazard vs. how many neighbors already changed -- B can't see it, C can
  function chartSpill() {
    let s = frame([[0, '0%'], [0.25, '25%'], [0.5, '50%'], [0.75, '75%'], [1, '100%']], [[0, '0%'], [0.05, '5%'], [0.1, '10%'], [0.15, '15%']], "share of neighbors that changed last year", 'P(tips this year)', 0, 0.16, 0, 1);
    s += `<line x1="${sx(0, 0, 1)}" x2="${sx(1, 0, 1)}" y1="${sy(0.05, 0, 0.16)}" y2="${sy(0.05, 0, 0.16)}" stroke="${B_COL}" stroke-width="2.5"/>`;
    const pts = d3.range(0, 1.01, 0.05).map((v) => `${sx(v, 0, 1)},${sy(0.025 + 0.11 * v * v + 0.02 * v, 0, 0.16)}`);
    s += `<polyline points="${pts.join(' ')}" fill="none" stroke="${C_COL}" stroke-width="2.5"/>`;
    s += `<text x="${sx(0.62, 0, 1)}" y="${sy(0.04, 0, 0.16)}" style="fill:${B_COL};font-weight:600">Model B: same risk everywhere</text>`;
    s += `<text x="${sx(0.45, 0, 1)}" y="${sy(0.12, 0, 0.16)}" style="fill:${C_COL};font-weight:600">Model C: risk rises next to change</text>`;
    return svg(s) + legend([[B_COL, 'Model B'], [C_COL, 'Model C']]);
  }
  // C2: the same clustered signal, read by each model
  function chartCI() {
    const rows = [['Model B', 1.8, 1.35, 2.4, B_COL], ['Model C', 1.2, 0.8, 1.75, C_COL]];
    const w = 560, h = 150, l = 90, r = 30, top = 18, rh = 44;
    const x = (v) => l + ((w - l - r) * (v - 0.5)) / 2.2;
    let s = '';
    [0.5, 1, 1.5, 2, 2.5].forEach((v) => { s += `<line x1="${x(v)}" x2="${x(v)}" y1="${top}" y2="${top + rh * 2}" stroke="${v === 1 ? '#1b1d22' : 'rgba(27,29,34,0.07)'}" ${v === 1 ? 'stroke-dasharray="4 3"' : ''}/><text x="${x(v)}" y="${top + rh * 2 + 14}" text-anchor="middle">${v.toFixed(1)}×</text>`; });
    rows.forEach(([lab, b, lo, hi, col], i) => {
      const y = top + i * rh + rh / 2;
      s += `<text x="0" y="${y + 4}" style="fill:#1b1d22;font-weight:700">${lab}</text>`;
      s += `<line x1="${x(lo)}" x2="${x(hi)}" y1="${y}" y2="${y}" stroke="${col}" stroke-width="3"/><circle cx="${x(b)}" cy="${y}" r="7" fill="${col}" stroke="#fff" stroke-width="2"/>`;
      s += `<text x="${x(hi) + 8}" y="${y + 4}" class="bar-label">${lo > 1 ? 'looks real' : 'crosses 1: no evidence'}</text>`;
    });
    s += `<text x="${l + (w - l - r) / 2}" y="${h - 2}" text-anchor="middle" style="fill:#5d616b">odds ratio for "a chain opened nearby last year" (1× = no effect)</text>`;
    return `<div class="nyc-chart"><svg viewBox="0 0 ${w} ${h}">${s}</svg></div>`;
  }

  const vars = (rows) => `<div class="mdl-vars">${rows.map(([role, name, src, note]) => `<div class="mdl-var mdl-${role}"><div class="mdl-var-role">${{ y: 'outcome', x: 'signal', c: 'control', s: 'spatial' }[role]}</div><div class="mdl-var-name">${name}</div><div class="mdl-var-src">${src}</div>${note ? `<div class="mdl-var-note">${note}</div>` : ''}</div>`).join('')}</div>`;
  const needs = (items) => `<ul class="mdl-needs">${items.map(([ok, t]) => `<li class="${ok}"><span>${ok === 'have' ? '✓' : ok === 'partial' ? '◐' : '✗'}</span>${t}</li>`).join('')}</ul>`;

  // ═══ Part 3: the plan (no data) ═══════════════════════════════
  window.nycRenderModels = function (main) {
    main.innerHTML = `
    <header class="nyc-hero">
      <div class="nyc-eyebrow">Part 3 · Modeling Options · nothing fit yet</div>
      <h1 class="nyc-title">How could we model gentrification?</h1>
      <p class="nyc-lede">Parts 1–2 described the data. This page plans the modeling step: three models that fit how our data is shaped (places observed year after year), what each needs, and how to read it. Model B was picked, so it gets the most detail. Model C is a <strong>spatio-temporal</strong> version of B. <strong>No model has been run on this page.</strong> Every chart is a hand-drawn example of what the output would look like. The first test run is in <a href="#" onclick="openNycModelsTest();return false;">Part 4</a>.</p>
    </header>

    <div class="mdl-compare three">
      <div class="mdl-card a"><div class="mdl-tag">Model A</div><h2>Panel regression with fixed effects &amp; lags</h2><p class="mdl-q">“<b>How much</b> do early signals predict a neighborhood's rent growth a few years later?”</p><div class="mdl-chips"><span>continuous outcome</span><span>place × year</span><span>lead time</span></div></div>
      <div class="mdl-card b"><div class="mdl-tag">Model B · chosen</div><h2>Discrete-time hazard (survival) model</h2><p class="mdl-q">“<b>When</b> does a neighborhood tip into gentrifying, and which signals speed that up?”</p><div class="mdl-chips"><span>yes/no event</span><span>timing</span><span>only at-risk areas</span></div></div>
      <div class="mdl-card c"><div class="mdl-tag">Model C · new</div><h2>Spatio-temporal hazard model</h2><p class="mdl-q">“Same question as B, but does it <b>spread from next door</b>?”</p><div class="mdl-chips"><span>B + neighbors</span><span>spatial random effect</span><span>diffusion</span></div></div>
    </div>

    <section class="nyc-panel">
      <div class="nyc-kicker">Why these models</div>
      <h2>Our data is a panel: the same places, measured every year</h2>
      <p>Property sales (2016–2025), ACS rent and income (2009–2024), permits, crime and capital spending can all be rolled up to <strong>place × year</strong>. That shape calls for a time-series panel model. Model A treats the outcome as a <strong>number</strong> (how fast rent rose). Model B treats it as an <strong>event</strong> (the year a place crossed a gentrification line). Model C keeps B's event and adds <strong>space</strong>: places next to each other are not independent.</p>
    </section>

    <!-- ═════════ MODEL A ═════════ -->
    <h2 class="mdl-section a">Model A · Panel regression with fixed effects and lagged signals</h2>

    <section class="nyc-panel">
      <div class="nyc-kicker">The idea in one equation</div>
      <div class="mdl-eq">RentGrowth<sub>n,t</sub> = <span class="x">β<sub>1</sub>·Signal<sub>n,t−1</sub> + β<sub>2</sub>·Signal<sub>n,t−2</sub> + …</span> + <span class="c">γ·Controls<sub>n,t</sub></span> + <span class="fe">α<sub>n</sub></span> + <span class="fe">δ<sub>t</sub></span> + ε<sub>n,t</sub></div>
      <div class="mdl-eq-key">
        <span><i class="x"></i><b>β</b>: what we want. How much a signal 1, 2 or 3 years ago moves rent growth now</span>
        <span><i class="fe"></i><b>α<sub>n</sub></b> neighborhood effect: absorbs everything fixed about a place (location, housing stock, reputation)</span>
        <span><i class="fe"></i><b>δ<sub>t</sub></b> year effect: absorbs citywide shocks (COVID, interest rates, 421-a)</span>
        <span><i class="c"></i><b>γ</b> controls: things that change over time we want held constant</span>
      </div>
      ${timelineA()}
    </section>

    <div class="nyc-row">
      <section class="nyc-panel"><div class="nyc-kicker">How it works</div><h2>Compare each neighborhood to itself</h2>
        ${chartFE()}${illus}
        <p class="mdl-cap">Fixed effects compare Bushwick to Bushwick's own past, not to the Upper East Side. The question becomes: <em>in years after a signal spiked, did rent grow faster than this place usually does, beyond what the whole city did that year?</em></p>
      </section>
      <section class="nyc-panel"><div class="nyc-kicker">What the output looks like</div><h2>One estimate per lag</h2>
        ${chartLags()}${illus}
        <p class="mdl-cap">Each dot is a β. If the dots 1–3 years back clear zero, the signal leads rent. That is the "early warning." If only the same-year dot is positive, the signal moves <em>with</em> gentrification, not ahead of it.</p>
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
          ['have', 'A continuous outcome: rent and sale prices exist every year'],
          ['partial', 'Restaurant signals with history: DOHMH keeps only ~3 years, so lags of 2–3 yrs leave very few usable years. The 2017 snapshot and liquor licenses can stretch this.'],
          ['partial', 'Consistent geography: NTA 2010 vs 2020 and the 2022 PUMA redraw need crosswalks'],
          ['partial', 'ACS 5-yr estimates overlap (2019 and 2020 share 4 of 5 years), which smooths changes. Use non-overlapping windows or sales data for annual change'],
        ])}
      </section>
    </div>

    <div class="nyc-note"><b>Why it fits:</b> it uses the panel shape directly, and fixed effects remove the "rich areas are just different" problem. <b>Watch for:</b> reverse timing (rising rent draws chains in) and only a few years of restaurant history.</div>

    <!-- ═════════ MODEL B ═════════ -->
    <h2 class="mdl-section b">Model B · Discrete-time hazard (survival) model</h2>

    <section class="nyc-panel">
      <div class="nyc-kicker">The idea in one equation</div>
      <div class="mdl-eq">log( h<sub>n,t</sub> ⁄ (1 − h<sub>n,t</sub>) ) = <span class="fe">α<sub>t</sub></span> + <span class="x">β·Signals<sub>n,t−1</sub></span> + <span class="c">γ·Baseline<sub>n</sub></span></div>
      <div class="mdl-eq-key">
        <span><i class="fe"></i><b>h<sub>n,t</sub></b> hazard: chance place <i>n</i> tips in year <i>t</i>, given it hasn't yet</span>
        <span><i class="fe"></i><b>α<sub>t</sub></b> baseline hazard: how risky each year is citywide</span>
        <span><i class="x"></i><b>e<sup>β</sup></b> odds ratio: "high turnover multiplies the yearly odds of tipping by 1.8×"</span>
        <span><i class="c"></i><b>γ</b> starting conditions: income, rent, college share, renter share</span>
      </div>
      <p>It is a logistic regression run on a special table: one row per place per year <em>while it is still at risk</em>. Once a place tips, it leaves the table.</p>
      ${personPeriod()}
    </section>

    <div class="nyc-row">
      <section class="nyc-panel"><div class="nyc-kicker">Output 1 · survival curve</div><h2>Who stays un-gentrified longer?</h2>
        ${chartSurvival()}${illus}
        <p class="mdl-cap">Start with every low-income place at 100%. Each year some tip. If the high-turnover group drops faster, turnover is an early signal.</p>
      </section>
      <section class="nyc-panel"><div class="nyc-kicker">Output 2 · hazard by year</div><h2>When is risk highest?</h2>
        ${chartHazard()}${illus}
        <p class="mdl-cap">The yearly α<sub>t</sub>: the citywide chance an at-risk place tips that year. Shows booms and pauses (e.g., a COVID dip).</p>
      </section>
    </div>

    <section class="nyc-panel">
      <div class="nyc-kicker">Variables</div><h2>What goes in</h2>
      ${vars([
        ['y', 'Tipped this year (0/1)', 'built from ACS + sales', 'first year a low-income area\'s rent growth AND college-share growth beat the city median (Furman-style)'],
        ['x', 'Restaurant turnover (t−1)', 'DOHMH / licenses', ''],
        ['x', 'Chain or "list" restaurant opened (t−1)', 'Chains & Lists', 'yes/no'],
        ['x', 'Permit surge (t−1)', 'DOB permits', 'above own 3-yr average'],
        ['c', 'Baseline income, renter %, rent level', 'ACS start year', 'defines who is "at risk"'],
      ])}
    </section>

    <section class="nyc-panel">
      <div class="nyc-kicker">B in depth · decisions to make before fitting</div><h2>Six choices that decide what B finds</h2>
      <div class="mdl-iter">
        <div><span class="mdl-iter-was">NTA (~195 areas)</span><span class="mdl-iter-now">Census tracts (~2,100)</span><span>About 10× more places and events. Restaurant inspections carry tract IDs, so the signals can follow.</span></div>
        <div><span class="mdl-iter-was">First crossing</span><span class="mdl-iter-now">Crossing that holds</span><span>ACS estimates are noisy. A tract can cross the line one year and fall back the next. Require it to still hold a couple of releases later, and fix the rule before looking at signals.</span></div>
        <div><span class="mdl-iter-was">Everyone low-income at start</span><span class="mdl-iter-now">Drop already-tipped places</span><span>Places that changed before the window starts (left truncation) can't tell us what came first.</span></div>
        <div><span class="mdl-iter-was">Recent years as events</span><span class="mdl-iter-now">Treat them as censored</span><span>If confirming an event needs later data, the last years can't be confirmed yet. They stay "not yet," not "never."</span></div>
        <div><span class="mdl-iter-was">Any lagged value</span><span class="mdl-iter-now">Only what was known at t−1</span><span>No input may use data published after the year being predicted, including neighbors' later-confirmed events.</span></div>
        <div><span class="mdl-iter-was">Mixed tract lines</span><span class="mdl-iter-now">One set of lines</span><span>ACS 2010–2019 all use 2010 tracts. Going past 2019 needs a 2010→2020 crosswalk.</span></div>
      </div>
    </section>

    <div class="nyc-row">
      <section class="nyc-panel"><div class="nyc-kicker">Steps</div><h2>How we'd build it</h2>
        ${steps([
          ['Define "at risk"', 'Tracts in the bottom 40% of income at the start year (the Furman rule used in Part 2).'],
          ['Define the event', 'The first year it crosses the gentrification line and stays there. Decide this rule before looking at signals.'],
          ['Make the person-period table', 'One row per at-risk tract-year; drop rows after the event.'],
          ['Fit a logistic regression', 'Year dummies + lagged signals; report odds ratios.'],
          ['Draw survival curves', 'Compare groups (high vs low signal); check with held-out years.'],
        ])}
      </section>
      <section class="nyc-panel"><div class="nyc-kicker">What we need · do we have it?</div><h2>Fit with our data</h2>
        ${needs([
          ['have', 'A low-income starting group (ACS income by tract)'],
          ['have', 'Annual data to date an event (sales, ACS)'],
          ['partial', 'Enough events for 2–4 signals at NTA level; tracts give many more'],
          ['partial', 'Same restaurant-history limit as Model A'],
          ['need', 'An agreed event definition. The result depends heavily on where the line is drawn, so it must be fixed up front'],
        ])}
      </section>
    </div>

    <div class="nyc-note"><b>Why it fits:</b> gentrification is usually described as something a place <em>goes through</em>, and this model matches that. It answers "when" and keeps places that haven't tipped yet (censoring) instead of throwing them out. <b>Watch for:</b> a fuzzy event definition, and places next to each other that aren't really independent (Model C).</div>

    <!-- ═════════ MODEL C ═════════ -->
    <h2 class="mdl-section c">Model C · Spatio-temporal hazard model</h2>

    <section class="nyc-panel">
      <div class="nyc-kicker">Is there a better model for space + time?</div>
      <h2>Yes: keep B, add the map</h2>
      <p>Gentrification diffuses. Williamsburg changed, then Bushwick did. Model B can't see that, for two reasons: (1) it has no term for what is happening <em>next door</em>, and (2) it treats every place as an independent draw, so if neighbors share unmeasured causes its standard errors come out <strong>too small</strong>. The standard fix in epidemiology and criminology, where things also spread place to place, is a <strong>Bayesian spatio-temporal hazard model</strong> with a conditional-autoregressive (CAR/BYM) random effect.</p>
      <div class="mdl-eq">logit h<sub>n,t</sub> = <span class="fe">α<sub>t</sub></span> + <span class="x">β·X<sub>n,t−1</sub></span> + <span class="sp">ρ·(W X)<sub>n,t−1</sub></span> + <span class="c">γ·Baseline<sub>n</sub></span> + <span class="sp">u<sub>n</sub></span>,&nbsp;&nbsp; u ~ ICAR(τ)</div>
      <div class="mdl-eq-key">
        <span><i class="fe"></i><b>α<sub>t</sub>, β, γ</b>: same as Model B</span>
        <span><i class="sp"></i><b>(W X)<sub>n,t−1</sub></b> spillover: the average of the neighbors' values last year (W = which tracts touch)</span>
        <span><i class="sp"></i><b>u<sub>n</sub></b> place effect: unmeasured risk, pulled toward the neighbors' average</span>
        <span><i class="sp"></i><b>τ</b> how strongly neighbors' u are tied together (chosen by cross-validation)</span>
      </div>
      ${diagramBC()}
    </section>

    <div class="nyc-row">
      <section class="nyc-panel"><div class="nyc-kicker">What C adds</div><h2>Two spatial pieces</h2>
        ${steps([
          ['Spillover term (W X)', "Neighbors' signals and change last year. Lets risk rise when the tract next door is changing."],
          ['Affluent edge', 'Share of neighbors that were never low-income. Change often spreads out from wealthier areas.'],
          ['Place effect u (ICAR)', "Soaks up clustered risk the variables miss. Each tract's u is pulled toward its neighbors', so tracts with few events borrow strength from next door."],
          ['How to fit it', 'R-INLA or Stan for the full Bayesian model. A penalized-likelihood version in Python is a fast first pass.'],
        ])}
      </section>
      <section class="nyc-panel"><div class="nyc-kicker">What the output looks like</div><h2>Risk that rises next to change</h2>
        ${chartSpill()}${illus}
        <p class="mdl-cap">B gives a tract the same risk whether or not the tracts around it are changing. C lets risk climb with the share of neighbors that already changed. The steepness of that climb is ρ.</p>
      </section>
    </div>

    <section class="nyc-panel">
      <div class="nyc-kicker">Variables</div><h2>What C adds to B's list</h2>
      ${vars([
        ['s', "Neighbors' rent &amp; education change (t−1)", 'ACS, averaged over touching tracts', 'the spillover term'],
        ['s', "Neighbors' signals (t−1)", 'same sources as B', 'e.g. chain openings next door'],
        ['s', 'Affluent edge', 'ACS start year', 'share of neighbors never low-income'],
        ['s', 'Neighbor map W', 'tract boundaries (bmjq-373p)', 'which tracts touch (queen contiguity)'],
      ])}
    </section>

    <!-- ═════════ B vs C ═════════ -->
    <h2 class="mdl-section bc">Model B vs Model C</h2>

    <div class="nyc-row">
      <section class="nyc-panel"><div class="nyc-kicker">Why it matters</div><h2>The same signal, read by each model</h2>
        ${chartCI()}${illus}
        <p class="mdl-cap">Chain openings cluster in the same parts of the city that gentrify. B can mistake "located in a changing area" for "predicts change" and report a confident effect. C has already accounted for the area, so only the part that really leads gentrification remains. A signal that shrinks from B to C was riding on location.</p>
      </section>
      <section class="nyc-panel"><div class="nyc-kicker">How we'll judge them</div><h2>The test plan</h2>
        ${steps([
          ['Hold out the last years', 'Train on early years, score on later years neither model has seen.'],
          ['Ranking (AUC)', 'Do the tracts each model calls riskiest actually tip more often?'],
          ['Calibration', 'When a model says 10%, do about 10% tip?'],
          ['Leftover clustering', "Moran's I on each model's errors. If B's errors cluster, its p-values are too small."],
          ['A watch list', 'Of the top 50 flagged tracts, how many tipped?'],
          ['A second definition', 'Repeat under a stricter event rule to see what holds.'],
        ])}
        <p class="mdl-cap">Part 4 runs this test on the outcome alone, before any signal goes in.</p>
      </section>
    </div>

    <section class="nyc-panel">
      <div class="nyc-kicker">Pros and cons</div><h2>B or C?</h2>
      <div class="nyc-row tight">
        <div><div class="mdl-maphead" style="--c:${B_COL}">Model B · discrete-time hazard</div>${proscons([
          'Simple: a logistic regression anyone can check, with odds ratios that are easy to explain',
          'Fits with standard tools (statsmodels, R glm)',
          'A clean baseline for C to beat',
        ], [
          "Ignores the map: it can't see spread from next door",
          'If errors cluster, its standard errors and p-values are too small',
          'A signal that only <em>looks</em> predictive because it is spatially clustered could pass falsely',
        ])}</div>
        <div><div class="mdl-maphead" style="--c:${C_COL}">Model C · spatio-temporal hazard</div>${proscons([
          'Matches how gentrification moves: outward from neighbors',
          'Accounts for clustering, so tests of each signal are honest',
          'Neighbors share strength, which helps tracts with few events',
          'Same equation as B plus terms, so results compare directly',
        ], [
          'Harder to explain (“ICAR random effect”) and to fit (R-INLA or Stan)',
          'Needs a neighbor map, so the tract lines must be fixed (2010 vs 2020 crosswalk)',
          "The spillover term can mean “spread” or just “shared cause nearby.” It doesn't prove contagion",
        ])}</div>
      </div>
      <div class="nyc-note" style="margin-top:1rem"><b>Plan:</b> fit both. Use C as the main model and B as the readable baseline. Compare each signal's effect across the two.</div>
    </section>

    <!-- ═════════ COMPARE ═════════ -->
    <section class="nyc-panel">
      <div class="nyc-kicker">Side by side</div><h2>All three</h2>
      <div class="nyc-table-wrap"><table class="nyc-table"><thead><tr><th></th><th>Model A · FE panel</th><th>Model B · hazard</th><th>Model C · spatio-temporal</th></tr></thead><tbody>
        <tr><td class="muted">Outcome</td><td>rent growth (a number)</td><td>tipped yes/no (an event)</td><td>tipped yes/no (an event)</td></tr>
        <tr><td class="muted">Answers</td><td>how much, how far ahead</td><td>when, how much more likely</td><td>when, how likely, and does it spread</td></tr>
        <tr><td class="muted">Places linked?</td><td>no (fixed effects only)</td><td>no</td><td>yes: neighbor terms + ICAR effect</td></tr>
        <tr><td class="muted">Key output</td><td>β by lag</td><td>odds ratios, survival curves</td><td>odds ratios, spillover, risk map</td></tr>
        <tr><td class="muted">Biggest risk</td><td>reverse timing</td><td>event definition, clustered errors</td><td>harder to fit and explain</td></tr>
      </tbody></table></div>
    </section>

    <section class="nyc-panel">
      <div class="nyc-kicker">Also considered for space + time</div><h2>Why not these?</h2>
      <div class="mdl-alt">
        <div><b>Spatial Durbin panel</b><span>The spatial version of Model A (continuous rent growth plus neighbor lags). The right choice if we switch back to a numeric outcome.</span></div>
        <div><b>Knorr-Held space × time interaction</b><span>Lets each place's risk trend over time differently. Many more parameters; add it later if INLA is used.</span></div>
        <div><b>Self-exciting (Hawkes) contagion</b><span>Models each event directly triggering nearby ones. Good fit for the idea, but it needs exact event dates, and ACS only gives fuzzy “first visible” years.</span></div>
        <div><b>Graph neural net / ConvLSTM</b><span>Could predict well, but it can't tell us <em>which</em> signal matters, and that is the research question. It also needs far more events.</span></div>
        <div><b>Event study / synthetic control</b><span>Still useful for single shocks (a new station, a rezoning) and for the Bushwick case study.</span></div>
      </div>
    </section>`;
  };

  // ═══ Part 4: first test run on real data (models_check*.json) ═══
  window.nycRenderModelsTest = async function (main) {
    main.innerHTML = '<p class="nyc-loading" style="padding:2rem">Loading model checks…</p>';
    let D, D3;
    try {
      [D, D3] = await Promise.all(['models_check', 'models_check_v3'].map((n) => fetch('assets/nyc-explorer/' + n + '.json').then((r) => { if (!r.ok) throw new Error(n + ': HTTP ' + r.status); return r.json(); })));
    } catch (e) { main.innerHTML = `<p style="padding:2rem">Could not load model checks (${e.message}).</p>`; return; }
    const M_ = D.models, M3 = D3.models, def = D.definitions;
    const gap = M_.auc_gap, gap3 = M3.auc_gap;
    const coefC = M_.C.coefs, orr = (b) => Math.exp(b).toFixed(2) + '×';

    main.innerHTML = `
    <header class="nyc-hero">
      <div class="nyc-eyebrow">Part 4 · First Test Run · real data, no gentrification signals yet</div>
      <h1 class="nyc-title">Do Models B and C hold up on real data?</h1>
      <p class="nyc-lede"><a href="#" onclick="openNycModels();return false;">Part 3</a> planned the models. This page is the first test run of B and C. It builds B's outcome for every NYC census tract (2010–2019), tests three event definitions, then fits both models using only starting conditions and past change and scores them on years they never saw. <strong>No restaurant, permit or other signal is in either model</strong>, so this tests the setup, not the research question.</p>
    </header>

    <div class="nyc-stats">
      <div class="nyc-stat"><div class="nyc-stat-num">${D.n_tracts.toLocaleString()}</div><div class="nyc-stat-label">NYC census tracts with full data, 2010–2019</div></div>
      <div class="nyc-stat"><div class="nyc-stat-num">${D.n_at_risk}</div><div class="nyc-stat-label">“at risk”: bottom 40% of income in 2006–10 (≤ $${D.income_cut_2010.toLocaleString()})</div></div>
      <div class="nyc-stat"><div class="nyc-stat-num">${def.v2.events}</div><div class="nyc-stat-label">tipped by 2017 under the confirmed definition (v2)</div></div>
      <div class="nyc-stat"><div class="nyc-stat-num">${def.v2.morans_i.I}</div><div class="nyc-stat-label">Moran's I of tipping: events cluster on the map (p = ${def.v2.morans_i.p})</div></div>
    </div>


    <h2 class="mdl-section b">Model B · building the outcome on real data</h2>
    <section class="nyc-panel">
      <div class="nyc-kicker">Step 1 · the event definition is the model</div>
      <h2>Three versions of “tipped,” tested on all ${D.n_at_risk} at-risk tracts</h2>
      <p class="mdl-cap">A tract “tips” when its rent growth <b>and</b> its growth in college-educated adults since 2006–10 both beat the median tract in the city (the Furman-style rule from Part 2). Version 1 took the first year that happened. ${def.v1.flip_back} of its ${def.v1.events} events (${Math.round(100 * def.v1.flip_back / def.v1.events)}%) fell back below the line later, which means survey noise was triggering them. Version 2 requires the crossing to still hold two survey releases later. Version 3 also requires a strong entry (top third).</p>
      <div class="nyc-row tight">
        <div>${chartDefs(D)}${real}</div>
        <div>${chartSurvReal(D)}${real}</div>
      </div>
      <p class="mdl-cap">Left: v1 calls ${Math.round(100 * def.v1.events / D.n_at_risk)}% of low-income tracts “gentrified” and most of those calls reverse. That is too many to be believable. Right: the definition alone moves the 2017 survival share from ${pc(1 - (def.v1.events - def.v1.by_year[2018] - def.v1.by_year[2019]) / D.n_at_risk)} to ${pc(1 - def.v3.events / D.n_at_risk)}. <b>We use v2 and check the results against v3.</b></p>
    </section>

    <div class="nyc-row">
      <section class="nyc-panel"><div class="nyc-kicker">Step 2 · real baseline hazard</div><h2>When did tracts tip?</h2>
        ${chartHazReal(D)}${real}
        <p class="mdl-cap">These are the α<sub>t</sub>. ${D.n_left_truncated} tracts “tipped” in the first look (2011). Most of that change happened before our window, so they are dropped as <b>already tipped</b> rather than counted as events. After 2011 the yearly risk holds at ~4–7%, slowly falling.</p>
      </section>
      <section class="nyc-panel"><div class="nyc-kicker">Step 3 · where</div><h2>Tipping happens in clusters</h2>
        ${mapEvents(D)}${real}
        <p class="mdl-cap">Central Brooklyn (Bushwick, Bed-Stuy, Crown Heights, Flatbush) and upper Manhattan (Harlem, Washington Heights) light up together. Bensonhurst shows up too, a reminder that the rule catches any rise in rent and education, not only classic gentrification. Moran's I = ${def.v2.morans_i.I} (permutation p = ${def.v2.morans_i.p}). Model B assumes tracts are independent; this map says they are not. <b>That is the case for Model C.</b></p>
      </section>
    </div>

    <section class="nyc-panel">
      <div class="nyc-kicker">Step 4 · design decisions, iterated</div><h2>What changed after seeing the data</h2>
      <div class="mdl-iter">
        <div><span class="mdl-iter-was">NTA (~195 areas)</span><span class="mdl-iter-now">Census tract (${D.n_tracts.toLocaleString()})</span><span>~10× more places and events. Restaurant data has tract IDs, so the signals can follow.</span></div>
        <div><span class="mdl-iter-was">First crossing</span><span class="mdl-iter-now">Crossing confirmed 2 vintages later</span><span>Cuts out the ${def.v1.flip_back} noise events. The cost is that 2018–19 can't be confirmed yet (right-censored).</span></div>
        <div><span class="mdl-iter-was">Everyone low-income at start</span><span class="mdl-iter-now">Drop ${D.n_left_truncated} already-tipped tracts</span><span>Left truncation: their change happened before 2010, so they can't tell us what comes first.</span></div>
        <div><span class="mdl-iter-was">Signals at t−1</span><span class="mdl-iter-now">Everything at t−1, nothing in hindsight</span><span>A first draft leaked future data: it used neighbors' <em>confirmed</em> events, which need 2 more years. Fixed: only values published by year t−1.</span></div>
        <div><span class="mdl-iter-was">ACS 5-year every year</span><span class="mdl-iter-now">Kept, with a caveat</span><span>Back-to-back vintages share 4 of 5 survey years, so yearly change is smoothed. The event year means “first visible,” not “happened.”</span></div>
        <div><span class="mdl-iter-was">2010 → 2020 tracts</span><span class="mdl-iter-now">Stay on 2010 lines (2010–19)</span><span>Every ACS vintage through 2019 uses the same tract lines, so no crosswalk is needed. 2020+ needs a tract crosswalk.</span></div>
      </div>
    </section>

    <h2 class="mdl-section c">Model C · what the test fit learned</h2>

    <div class="nyc-row">
      <section class="nyc-panel"><div class="nyc-kicker">What the fit found</div><h2>The two spatial pieces, estimated</h2>
        ${steps([
          ['Spillover term (W X)', `Neighbors' rent and college-share change last year. In the test fit both push risk up: ${orr(coefC.nb_rent_rk)} and ${orr(coefC.nb_ba_rk)} odds per standard deviation, on top of the tract's own change.`],
          ['Affluent edge', `Share of neighbors that were never low-income: ${orr(coefC.nb_affluent)} odds per SD. Change spreads out from wealthier areas.`],
          ['Place effect u (ICAR)', `Soaks up clustered risk the variables miss. Each tract's u is shrunk toward its neighbors' values, so tracts with few events borrow strength from next door. τ = ${M_.C.tau} was picked by leave-one-year-out CV.`],
          ['How it was fit', 'Penalized likelihood (the posterior mode of the Bayesian model) in numpy/scipy. A full write-up would refit in R-INLA or Stan to get posterior intervals.'],
        ])}
      </section>
      <section class="nyc-panel"><div class="nyc-kicker">What C learned</div><h2>The place effect u</h2>
        ${mapU(D)}${real}
        <p class="mdl-cap">Red = riskier than income, rent, education and the neighbors explain. Mostly smooth patches, because the ICAR prior ties neighbors together. The few strong lone tracts have no at-risk neighbor to pull them in.</p>
      </section>
    </div>

    <!-- ═════════ HEAD TO HEAD ═════════ -->
    <h2 class="mdl-section bc">Model B vs Model C · same data, same test</h2>

    <section class="nyc-panel">
      <div class="nyc-kicker">The test</div>
      <p class="mdl-cap" style="margin-top:0">Both models were trained on 2012–15 (${M_.train_rows.toLocaleString()} tract-years, ${M_.train_events} events) and scored on 2016–17, which they never saw (${M_.test_rows.toLocaleString()} tract-years, ${M_.test_events} events). Inputs are only baseline conditions and each tract's own change through last year. C also gets its neighbors. <b>No gentrification signal is in either model</b>, so this compares the frames, not the answer to the research question.</p>
      <div class="nyc-stats" style="margin:0.9rem 0 0">
        <div class="nyc-stat"><div class="nyc-stat-num"><span style="color:${B_COL}">${f2(M_.B.auc)}</span> → <span style="color:${C_COL}">${f2(M_.C.auc)}</span></div><div class="nyc-stat-label">held-out AUC, B → C</div></div>
        <div class="nyc-stat"><div class="nyc-stat-num">+${f3(gap.est)}</div><div class="nyc-stat-label">AUC gain, 95% CI ${f3(gap.lo)} to ${f3(gap.hi)} (tract-cluster bootstrap): <b>borderline</b></div></div>
        <div class="nyc-stat"><div class="nyc-stat-num"><span style="color:${B_COL}">${M_.top50.B}</span> → <span style="color:${C_COL}">${M_.top50.C}</span></div><div class="nyc-stat-label">hits in a top-50 watch list (random ≈ ${M_.top50.random})</div></div>
        <div class="nyc-stat"><div class="nyc-stat-num"><span style="color:${B_COL}">${M_.resid_I.B[0]}</span> → <span style="color:${C_COL}">${M_.resid_I.C[0]}</span></div><div class="nyc-stat-label">clustering left in the errors (Moran's I; p ${M_.resid_I.B[1]} → ${M_.resid_I.C[1]})</div></div>
      </div>
    </section>

    <div class="nyc-row">
      <section class="nyc-panel"><div class="nyc-kicker">Graph 1 · ranking</div><h2>Who ranks risky tracts better?</h2>
        ${chartScores(M_)}${real}
        <p class="mdl-cap">Most of C's gain comes from the neighbor terms (light teal). The place effect adds a little more. Log-loss: null ${f3(M_.null.logloss)}, B ${f3(M_.B.logloss)}, C ${f3(M_.C.logloss)} (lower is better).</p>
      </section>
      <section class="nyc-panel"><div class="nyc-kicker">Graph 2 · calibration</div><h2>Are the probabilities honest?</h2>
        ${chartCalib(M_)}${real}
        <p class="mdl-cap">Tract-years split into 5 risk groups. C separates them more: its top group tips at 15.5% (B's: 11.9%), and its middle group is near 0% where B's is 2.8%. Both under-predict the riskiest group a little.</p>
      </section>
    </div>

    <section class="nyc-panel"><div class="nyc-kicker">Graph 3 · what each model misses</div><h2>B's errors cluster on the map. C's don't.</h2>
      <div class="mdl-narrow">${chartResidI(M_, M3)}</div>${real}
      <p class="mdl-cap">For each tract, take events minus predicted events, then ask whether neighbors' errors look alike (Moran's I). The gray band is what chance alone gives. Under both definitions B's dot sits outside the band: it misses whole patches at once. That breaks its independence assumption and makes its p-values too optimistic. C's dot sits inside the band. On a map the two error patterns look alike tract by tract, because most of each error is a single tract tipping. The difference is in how neighbors' errors line up.</p>
    </section>

    <div class="nyc-row">
      <section class="nyc-panel"><div class="nyc-kicker">Graph 4 · the practical test</div><h2>A 50-tract watch list for 2016–17</h2>
        ${chartWatch(M_)}${real}
        <p class="mdl-cap">If the city could watch 50 low-income tracts, C's list catches ${M_.top50.C} of the ${M_.top50.tipped} that tipped, B's catches ${M_.top50.B}, and a random list catches about ${M_.top50.random}.</p>
      </section>
      <section class="nyc-panel"><div class="nyc-kicker">Robustness · does it hold under v3?</div><h2>Partly</h2>
        <div class="nyc-table-wrap"><table class="nyc-table"><thead><tr><th></th><th>v2 confirmed</th><th>v3 strict</th></tr></thead><tbody>
          <tr><td class="muted">Test events</td><td class="num">${M_.test_events}</td><td class="num">${M3.test_events}</td></tr>
          <tr><td class="muted">AUC B → C</td><td class="num">${f3(M_.B.auc)} → ${f3(M_.C.auc)}</td><td class="num">${f3(M3.B.auc)} → ${f3(M3.C.auc)}</td></tr>
          <tr><td class="muted">AUC gain (95% CI)</td><td class="num">${f3(gap.est)} (${f3(gap.lo)}, ${f3(gap.hi)})</td><td class="num">${f3(gap3.est)} (${f3(gap3.lo)}, ${f3(gap3.hi)})</td></tr>
          <tr><td class="muted">Watch-list hits B / C</td><td class="num">${M_.top50.B} / ${M_.top50.C}</td><td class="num">${M3.top50.B} / ${M3.top50.C}</td></tr>
          <tr><td class="muted">Residual Moran's I B → C</td><td class="num">${M_.resid_I.B[0]} → ${M_.resid_I.C[0]}</td><td class="num">${M3.resid_I.B[0]} → ${M3.resid_I.C[0]}</td></tr>
        </tbody></table></div>
        <p class="mdl-cap">Under the strict definition both models predict about equally well. But B's errors still cluster (p = ${M3.resid_I.B[1]}) and C's still don't (p = ${M3.resid_I.C[1]}). <b>The prediction gain depends on the definition. The fix to the clustered errors holds under both.</b></p>
      </section>
    </div>

    <section class="nyc-panel">
      <div class="nyc-kicker">Pros and cons</div><h2>B or C?</h2>
      <div class="nyc-row tight">
        <div><div class="mdl-maphead" style="--c:${B_COL}">Model B · discrete-time hazard</div>${proscons([
          'Simple: a logistic regression anyone can check, with odds ratios that are easy to explain',
          'Fits with standard tools (statsmodels, R glm)',
          'Already beats a random list well (AUC ' + f2(M_.B.auc) + ')',
          'Good first model and a baseline to beat',
        ], [
          'Ignores the map: it can\'t see spread from next door',
          'Its errors cluster (Moran\'s I ' + M_.resid_I.B[0] + ', p = ' + M_.resid_I.B[1] + '), so its standard errors and p-values are too small',
          'A signal that only <em>looks</em> predictive because it is spatially clustered (like chain openings) could pass falsely',
        ])}</div>
        <div><div class="mdl-maphead" style="--c:${C_COL}">Model C · spatio-temporal hazard</div>${proscons([
          'Matches how gentrification actually moves: outward from neighbors',
          'Leaves no clustered error, so tests of each signal are honest',
          'Neighbors share strength, which helps tracts with few events',
          'Better ranking and watch list under v2; never worse under v3',
          'Same equation as B plus terms: B is a special case, so results compare directly',
        ], [
          'Harder to explain (“ICAR random effect”) and to fit: a proper version needs R-INLA or Stan',
          'Needs a neighbor map, so the tract lines must be fixed (2010 vs 2020 crosswalk)',
          'The spillover term can mean “spread” or just “shared cause nearby.” It doesn\'t prove contagion',
          'Prediction gain is borderline (CI touches 0) and disappears under v3',
        ])}</div>
      </div>
      <div class="nyc-note" style="margin-top:1rem"><b>Recommendation:</b> use <b>C as the main model</b> and report <b>B next to it</b>. When the restaurant and permit signals go in, compare each one's effect in B vs C. A signal that is “significant” in B but shrinks in C was riding on location, not leading gentrification. <b>Next:</b> <a href="#" onclick="openNycModelsSignals();return false;">Part 5</a> puts the first real signals in.</div>
    </section>

    <section class="nyc-panel">
      <div class="nyc-kicker">Reproduce</div>
      <p class="mdl-cap" style="margin-top:0"><code>python nyc-data-explorer/build_models.py</code> (v2) and <code>MODEL_RULE=v3 python nyc-data-explorer/build_models.py</code> (strict definition). Data: Census ACS 5-year API (B19013, B25064, B15002, B25003, B01003), NYC 2010 census tracts (bmjq-373p). Model C here is the penalized-likelihood (posterior mode) version; a full write-up would refit it in R-INLA or Stan for posterior intervals.</p>
    </section>`;

    // shared hover for every [data-tip] mark on this page
    main.onmousemove = (e) => { const t = e.target.closest('[data-tip]'); if (window.nycTip) window.nycTip(t ? t.getAttribute('data-tip') : null, e); };
    main.onmouseleave = () => window.nycTip && window.nycTip(null);
  };

  // Part 5 (models5.js) draws with the same helpers
  window.nycMdl = { C, W, H, M, iw, ih, sx, sy, frame, svg, legend, steps, proscons, tractMap, tipAttr, B_COL, C_COL, NULL_COL, f2, f3, pc };
})();
