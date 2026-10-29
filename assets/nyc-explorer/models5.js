/* ═══════════════════════════════════════════════════════════════
   NYC DATA EXPLORER -- Part 5: First Spatio-Temporal Model
   Real data: models_signals.json (nyc-data-explorer/build_signals.py)
   plus the tract geometry in models_check.json. Two models only (B, C),
   eight signals from five city sources, and where every input comes from.
   Draws with the helpers models.js exposes as window.nycMdl.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  const SIG_COL = { A1: '#0039a6', NB: '#ff6319', DM: '#ee352e', SALES: '#00933c', PRICE: '#6cbe45', CRIME: '#8b5a2b', NOISE: '#d4a106', SUBWAY: '#4d5357' };
  const SIGS = ['A1', 'NB', 'DM', 'SALES', 'PRICE', 'CRIME', 'NOISE', 'SUBWAY'];
  const TV = SIGS.filter((j) => j !== 'SUBWAY');  // time-varying: these get a neighbor version in C
  const SRC_COL = { acs: '#1b1d22', dob: '#0039a6', dof: '#00933c', nypd: '#8b5a2b', 311: '#d4a106', mta: '#4d5357', derived: '#808183' };
  const UNIT = {
    A1: 'renovation jobs per 1,000 households', NB: 'new-building jobs per 1,000 households', DM: 'demolition jobs per 1,000 households',
    SALES: 'home sales per 1,000 households', PRICE: '% change in price per unit since 2009–10', CRIME: 'felonies per 1,000 residents',
    NOISE: 'noise complaints per 1,000 residents',
  };

  window.nycRenderModelsSignals = async function (main) {
    const { C, svg, legend, steps, tractMap, tipAttr, B_COL, C_COL, NULL_COL, f2, f3, pc } = window.nycMdl;
    main.innerHTML = '<p class="nyc-loading" style="padding:2rem">Loading the first spatio-temporal model…</p>';
    let S, D;
    try {
      [S, D] = await Promise.all(['models_signals', 'models_check'].map((n) => fetch('assets/nyc-explorer/' + n + '.json?v=20261029').then((r) => { if (!r.ok) throw new Error(n + ': HTTP ' + r.status); return r.json(); })));
    } catch (e) { main.innerHTML = `<p style="padding:2rem">Could not load the model results (${e.message}).</p>`; return; }

    const MB = S.models.B, MC = S.models.C, G = S.gaps, sens = S.sensitivity, V = S.variables;
    const VAR = Object.fromEntries(V.map((v) => [v.key, v]));
    const lab = (j) => S.signals[j].label;
    const colLab = (c) => (VAR[c] ? VAR[c].label : c);
    const orTxt = (o) => `${f2(o.or)}× (95% CI ${f2(o.lo)}–${f2(o.hi)})`;
    const clears = (o) => o && (o.lo > 1 || o.hi < 1);
    const real = '<div class="mdl-real">Real data · ACS 5-year 2010–19 · DOB permits · DOF sales · NYPD felonies · 311 noise · MTA stations</div>';
    const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
    const rng = (a) => [Math.min(...a), Math.max(...a)];
    const sgn = (v, f = f3) => (v >= 0 ? '+' : '') + f(v);
    const famCol = { base: C.purple, start: C.green, own: C.green, signal: C.blue, nb: C_COL, nbsig: C_COL, place: C_COL };
    const grid = (x1, x2, y) => `<line x1="${x1}" x2="${x2}" y1="${y}" y2="${y}" stroke="rgba(27,29,34,0.08)"/>`;

    // ── §1 charts: where every input comes from ─────────────────
    // sources -> inputs -> models, as one flow diagram
    function chartFlow() {
      const srcs = [['acs', 'Census ACS 5-year', 'rent, income, college, renters'], ['dob', 'Dept. of Buildings', 'permit issuance'], ['dof', 'Dept. of Finance', 'every property sale'],
        ['nypd', 'NYPD', 'felony complaints'], ['311', 'NYC 311', 'noise complaints'], ['mta', 'MTA', 'station locations']];
      const inputs = [
        ['acs', 'α_t baseline yearly risk', 'base', 'BC'], ['acs', 'Starting income, rent, college, renters', 'start', 'BC'], ['acs', 'Own rent + college change so far', 'own', 'BC'],
        ['dob', 'Renovation · new-building · demolition permits', 'signal', 'BC'], ['dof', 'Home sales · home price growth', 'signal', 'BC'],
        ['nypd', 'Felony change since 2009', 'signal', 'BC'], ['311', 'Noise complaints vs the city', 'signal', 'BC'], ['mta', 'Distance to nearest station', 'signal', 'BC'],
        ['acs', "Neighbors' change + affluent edge", 'nb', 'C'], ['dob', "Neighbors' signals (all 7 that change yearly)", 'nbsig', 'C'], ['acs', 'Place effect u_i (borrows from next door)', 'place', 'C'],
      ];
      const w = 900, rh = 38, top = 26, h = top + inputs.length * rh + 6, sx0 = 0, sw = 190, ix = 300, iw = 360, mx = 760;
      const sy = (i) => top + ((inputs.length * rh) / srcs.length) * (i + 0.5);
      const iy = (i) => top + i * rh + rh / 2;
      let s = `<text x="${sx0}" y="14" style="font-weight:700;fill:#1b1d22">Where it comes from</text><text x="${ix}" y="14" style="font-weight:700;fill:#1b1d22">What goes in the model</text><text x="${mx}" y="14" style="font-weight:700;fill:#1b1d22">Used by</text>`;
      inputs.forEach(([src, name, fam, models], i) => {
        const si = srcs.findIndex((d) => d[0] === src), y1 = sy(si), y2 = iy(i);
        const links = fam === 'nbsig' ? ['dob', 'dof', 'nypd', '311'] : fam === 'base' ? ['acs'] : [src];
        links.forEach((ls) => {
          const yy = sy(srcs.findIndex((d) => d[0] === ls));
          s += `<path d="M${sx0 + sw},${yy} C${sx0 + sw + 60},${yy} ${ix - 60},${y2} ${ix},${y2}" fill="none" stroke="${SRC_COL[ls]}" stroke-width="1.6" opacity="${fam === 'nbsig' || fam === 'nb' || fam === 'place' ? 0.25 : 0.5}"/>`;
        });
        s += `<rect x="${ix}" y="${y2 - 13}" width="${iw}" height="26" rx="5" fill="#fff" stroke="${famCol[fam]}" stroke-width="1.5"/><text x="${ix + 10}" y="${y2 + 4}" style="fill:#1b1d22;font-size:11.5px">${name}</text>`;
        ['B', 'C'].forEach((m, k) => {
          const on = models.includes(m), cx = mx + 18 + k * 50, col = m === 'B' ? B_COL : C_COL;
          s += `<line x1="${ix + iw}" x2="${mx}" y1="${y2}" y2="${y2}" stroke="#ddd" stroke-dasharray="2 3"/>`;
          s += `<circle cx="${cx}" cy="${y2}" r="11" fill="${on ? col : '#fff'}" stroke="${on ? col : '#ddd'}" stroke-width="1.5"/><text x="${cx}" y="${y2 + 4}" text-anchor="middle" style="font-size:10px;font-weight:700;fill:${on ? '#fff' : '#ccc'}">${m}</text>`;
        });
      });
      srcs.forEach(([k, name, sub], i) => {
        const y = sy(i);
        s += `<rect x="${sx0}" y="${y - 20}" width="${sw}" height="40" rx="6" fill="${SRC_COL[k]}"/><text x="${sx0 + 10}" y="${y - 3}" style="fill:#fff;font-weight:700;font-size:12px">${name}</text><text x="${sx0 + 10}" y="${y + 12}" style="fill:#fff;opacity:.85;font-size:10px">${sub}</text>`;
      });
      return svg(s, w, h);
    }

    // baseline yearly risk: what actually happened each year, and the alpha_t each model fit
    function chartBaseRisk() {
      const BR = S.baseline_risk, w = 620, h = 260, l = 50, r = 20, t = 18, b = 46;
      const max = Math.max(...BR.flatMap((d) => [d.rate, d.B.p, d.C.p])) * 1.25;
      const bw = (w - l - r) / BR.length, x = (i) => l + bw * (i + 0.5), y = (v) => t + (h - t - b) * (1 - v / max);
      let s = '';
      d3.ticks(0, max, 4).forEach((v) => { s += grid(l, w - r, y(v)) + `<text x="${l - 6}" y="${y(v) + 4}" text-anchor="end">${(100 * v).toFixed(0)}%</text>`; });
      const tx0 = l + bw * BR.findIndex((d) => d.test);
      s += `<rect x="${tx0}" y="${t}" width="${w - r - tx0}" height="${h - t - b}" fill="rgba(0,173,208,0.07)"/><text x="${tx0 + 6}" y="${t + 12}" style="fill:${C_COL};font-size:10px;font-weight:700">test years: never seen</text>`;
      BR.forEach((d, i) => {
        s += `<rect x="${x(i) - bw * 0.3}" y="${y(d.rate)}" width="${bw * 0.6}" height="${y(0) - y(d.rate)}" rx="3" fill="${NULL_COL}" opacity="0.45"${tipAttr(`<b>${d.year}</b>: ${d.events} of ${d.at_risk} at-risk tracts tipped = ${pc(d.rate)}`)}/>`;
        s += `<text x="${x(i)}" y="${h - b + 15}" text-anchor="middle">${d.year}</text><text x="${x(i)}" y="${h - b + 29}" text-anchor="middle" style="font-size:9.5px;fill:#5d616b">${d.events} / ${d.at_risk}</text>`;
        [['B', B_COL, -9], ['C', C_COL, 9]].forEach(([m, col, dx]) => {
          s += `<circle cx="${x(i) + dx}" cy="${y(d[m].p)}" r="5.5" fill="${d.test ? '#fff' : col}" stroke="${col}" stroke-width="2"${tipAttr(`<b>Model ${m}</b>, ${d.year}<br>α = ${f3(d[m].alpha)} (log-odds) → ${pc(d[m].p)} for a tract at the average of every input${d.test ? '<br>test year: α is the average of 2012–15' : ''}`)}/>`;
        });
      });
      s += `<text x="${l + (w - l - r) / 2}" y="${h - 4}" text-anchor="middle" style="fill:#5d616b">year predicted · bars: share of at-risk tracts that tipped (tipped / still at risk)</text>`;
      return svg(s, w, h) + legend([[NULL_COL, 'what happened (tipped ÷ at risk)'], [B_COL, 'Model B: α_t as a probability'], [C_COL, 'Model C: α_t as a probability'], ['#999', 'hollow = carried from 2012–15']]);
    }

    function miniHist(v, col) {
      if (!v.hist) return '';
      const w = 240, h = 58, n = v.hist.n, mx = Math.max(...n), bw = w / n.length;
      const x = (val) => ((val - v.hist.lo) / (v.hist.hi - v.hist.lo || 1)) * w;
      let s = n.map((c, i) => `<rect x="${i * bw + 0.5}" y="${h - 14 - (c / mx) * (h - 18)}" width="${bw - 1}" height="${(c / mx) * (h - 18)}" fill="${col}" opacity="0.55"/>`).join('');
      const md = v.dist.q[2];
      s += `<line x1="${x(md)}" x2="${x(md)}" y1="2" y2="${h - 14}" stroke="#1b1d22" stroke-width="1.5"/>`;
      s += `<text x="0" y="${h - 2}" style="font-size:9px">${v.hist.lo}</text><text x="${w}" y="${h - 2}" text-anchor="end" style="font-size:9px">${v.hist.hi}</text><text x="${Math.min(Math.max(x(md), 30), w - 30)}" y="${h - 2}" text-anchor="middle" style="font-size:9px;font-weight:700">median ${md}</text>`;
      return `<svg viewBox="0 0 ${w} ${h}" class="p5-hist">${s}</svg>`;
    }

    function orPill(m, o) {
      if (!o) return `<span class="p5-pill off">${m}: not in ${m}</span>`;
      const col = m === 'B' ? B_COL : C_COL, cl = clears(o);
      return `<span class="p5-pill" style="--c:${col}" ${tipAttr(`Model ${m}: odds of tipping × ${f2(o.or)} per 1 SD more<br>95% CI ${f2(o.lo)}–${f2(o.hi)}<br>${cl ? 'clears 1: evidence of an effect' : 'crosses 1: no clear effect'}`)}><b>${m}</b> ${f2(o.or)}× ${cl ? '●' : '○'}</span>`;
    }

    function varCards(fam) {
      const list = V.filter((v) => fam === 'all' || v.family === fam);
      return `<div class="p5-cards">${list.map((v) => {
        const src = S.sources[v.source], col = famCol[v.family];
        const sj = v.key.startsWith('s_') ? v.key.slice(2) : null;
        return `<div class="p5-card" style="--c:${col}">
          <div class="p5-card-h"><b>${v.label}</b><code>${v.key}</code></div>
          <div class="p5-src"><span style="background:${SRC_COL[v.source]}">${src[0]}</span>${src[1] ? (src[2] ? `<a href="${src[2]}" target="_blank" rel="noopener">${src[1]}</a>` : src[1]) : ''}</div>
          <div class="p5-field"><i>Raw field</i>${v.fields}</div>
          <ol>${v.steps.map((x) => `<li>${x}</li>`).join('')}</ol>
          <div class="p5-when"><i>Measured</i>${v.timing}</div>
          ${v.hist ? `<div class="p5-histwrap"><i>Model value across at-risk tract-years${sj && UNIT[sj] ? '' : ''}</i>${miniHist(v, sj ? SIG_COL[sj] : col)}</div>` : ''}
          ${v.family !== 'base' && v.family !== 'place' ? `<div class="p5-pills">${orPill('B', v.B)}${orPill('C', v.C)}</div>` : ''}
        </div>`;
      }).join('')}</div>`;
    }

    // worked example: one tract-year, every input from raw value to its push on the odds
    function exampleTable(ex, m) {
      const M = ex.models[m];
      const rows = M.contrib.map((c) => ({ ...c, v: VAR[c.col], term: ex.terms[c.col] }));
      const fams = ['start', 'own', 'signal', 'nb', 'nbsig'];
      rows.sort((a, b) => fams.indexOf(a.v.family) - fams.indexOf(b.v.family));
      let lastFam = null;
      const tr = rows.map((r) => {
        const head = r.v.family !== lastFam ? `<tr class="p5-fam"><td colspan="5">${S.families[r.v.family]}</td></tr>` : '';
        lastFam = r.v.family;
        const sj = r.col.startsWith('s_') ? r.col.slice(2) : null;
        return head + `<tr><td><b style="color:${sj ? SIG_COL[sj] : famCol[r.v.family]}">${r.v.label}</b></td><td class="p5-raw">${r.term.raw}</td><td class="num">${f2(r.term.value)}</td><td class="num">${sgn(r.z, f2)}</td><td class="num" style="font-weight:700;color:${r.add > 0.02 ? C.red : r.add < -0.02 ? C.blue : '#5d616b'}">${sgn(r.add, f2)}</td></tr>`;
      }).join('');
      return `<div class="nyc-table-wrap p5-ex"><table class="nyc-table"><thead><tr><th>Input</th><th>Where the number comes from (this tract)</th><th>Model value</th><th>SDs from avg (z)</th><th>× weight = push</th></tr></thead><tbody>${tr}</tbody></table></div>`;
    }

    function waterfall(ex, m) {
      const M = ex.models[m], col = m === 'B' ? B_COL : C_COL;
      const sorted = [...M.contrib].sort((a, b) => Math.abs(b.add) - Math.abs(a.add));
      const top = sorted.slice(0, 9), rest = sorted.slice(9);
      const steps_ = [['Baseline yearly risk α_' + ex.year, M.alpha, 'base']];
      top.forEach((c) => steps_.push([colLab(c.col), c.add, c.col]));
      if (rest.length) steps_.push([`${rest.length} other inputs`, rest.reduce((a, c) => a + c.add, 0), 'rest']);
      if (m === 'C') steps_.push(['Place effect u_i', M.u, 'u']);
      let run = 0;
      const bars = steps_.map(([nm, v, k]) => { const a = k === 'base' ? 0 : run; run = k === 'base' ? v : run + v; return { nm, v, k, a, b: run }; });
      const all = bars.flatMap((d) => [d.a, d.b]).concat([0]);
      let [lo, hi] = rng(all); const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
      const w = 640, l = 210, r = 70, rh = 24, top_ = 8, h = top_ + (bars.length + 1) * rh + 40;
      const x = (v) => l + ((w - l - r) * (v - lo)) / (hi - lo);
      let s = '';
      d3.ticks(lo, hi, 6).forEach((v) => { s += `<line x1="${x(v)}" x2="${x(v)}" y1="${top_}" y2="${top_ + (bars.length + 1) * rh}" stroke="rgba(27,29,34,0.07)"/><text x="${x(v)}" y="${top_ + (bars.length + 1) * rh + 14}" text-anchor="middle">${v.toFixed(1)}</text><text x="${x(v)}" y="${top_ + (bars.length + 1) * rh + 26}" text-anchor="middle" style="font-size:9px;fill:#5d616b">${(100 / (1 + Math.exp(-v))).toFixed(v < -4 ? 1 : 0)}%</text>`; });
      bars.forEach((d, i) => {
        const y = top_ + i * rh, sj = SIGS.find((j) => d.k === 's_' + j);
        const fill = d.k === 'base' ? C.purple : d.k === 'u' ? C_COL : d.k === 'rest' ? NULL_COL : d.v >= 0 ? C.red : C.blue;
        s += `<text x="${l - 8}" y="${y + rh / 2 + 4}" text-anchor="end" style="fill:${sj ? SIG_COL[sj] : '#1b1d22'};font-weight:${d.k === 'base' ? 700 : 500}">${d.nm}</text>`;
        s += `<rect x="${Math.min(x(d.a), x(d.b))}" y="${y + 4}" width="${Math.max(1.5, Math.abs(x(d.b) - x(d.a)))}" height="${rh - 8}" rx="2" fill="${fill}" opacity="0.85"${tipAttr(`<b>${d.nm}</b><br>${d.k === 'base' ? 'starting log-odds ' + f2(d.v) : 'adds ' + sgn(d.v, f2) + ' to the log-odds'}<br>running total ${f2(d.b)} → ${pc(1 / (1 + Math.exp(-d.b)))}`)}/>`;
        s += `<text x="${Math.max(x(d.a), x(d.b)) + 4}" y="${y + rh / 2 + 4}" style="font-size:10px">${d.k === 'base' ? f2(d.v) : sgn(d.v, f2)}</text>`;
        if (i < bars.length - 1) s += `<line x1="${x(d.b)}" x2="${x(d.b)}" y1="${y + rh - 4}" y2="${y + rh + 4}" stroke="#999"/>`;
      });
      const yF = top_ + bars.length * rh;
      s += `<text x="${l - 8}" y="${yF + rh / 2 + 4}" text-anchor="end" style="font-weight:700">= chance of tipping in ${ex.year}</text><circle cx="${x(M.eta)}" cy="${yF + rh / 2}" r="7" fill="${col}"/><text x="${x(M.eta) + 11}" y="${yF + rh / 2 + 4}" style="font-weight:700;fill:${col}">${pc(M.p)}</text>`;
      s += `<text x="${l + (w - l - r) / 2}" y="${h - 2}" text-anchor="middle" style="fill:#5d616b">log-odds (top) and the matching probability (bottom)</text>`;
      return svg(s, w, h) + legend([[C.purple, 'start: baseline yearly risk'], [C.red, 'pushes risk up'], [C.blue, 'pushes risk down'], ...(m === 'C' ? [[C_COL, 'place effect']] : [])]);
    }

    function exampleView(i, m) {
      const ex = S.examples[i], M = ex.models[m];
      const fate = ex.tipped ? `tipped in <b>${ex.tipped}</b>` : 'did <b>not</b> tip by 2017';
      return `<div class="p5-ex-head"><div><b>${ex.nta}</b>, ${ex.boro} · tract ${ex.tract}</div><div>Predicting <b>${ex.year}</b> (a test year: the model never saw it) · this tract ${fate}</div><div>Model ${m}: <b style="color:${m === 'B' ? B_COL : C_COL}">${pc(M.p)}</b> chance of tipping in ${ex.year} (typical at-risk tract: ${pc(S.ripple.A1.base)})</div></div>
        <div class="nyc-row p5-stack" style="margin-top:0.6rem"><div>${waterfall(ex, m)}</div><div>${steps([
          ['Start at the baseline yearly risk', `α<sub>${ex.year}</sub> = ${f2(M.alpha)} on the log-odds scale (${pc(1 / (1 + Math.exp(-M.alpha)))}). Same for every tract that year.`],
          ['Turn each input into “SDs from average”', 'z = (value − at-risk average) ÷ SD, using the 2012–15 training rows. That puts permits, prices and percentages on one scale.'],
          ['Multiply by its weight', 'Each z is multiplied by the coefficient the model learned (β). Positive pushes the odds up.'],
          ...(m === 'C' ? [['Add the place effect', `u<sub>i</sub> = ${sgn(M.u, f2)} for this tract, learned from it and its neighbors.`]] : []),
          ['Add it all up, then convert', `log-odds ${f2(M.eta)} → p = 1 ÷ (1 + e<sup>−(${f2(M.eta)})</sup>) = <b>${pc(M.p)}</b>.`],
        ])}</div></div>${exampleTable(ex, m)}`;
    }

    // correlation among the signals: are they telling the same story?
    function chartCorr() {
      const N = S.corr_signals.names.map((c) => c.slice(2)), R = S.corr_signals.r, cs = 34, l = 130, t = 96, w = l + cs * N.length + 10, h = t + cs * N.length + 10;
      const col = d3.scaleDiverging([-0.7, 0, 0.7], d3.interpolateRdBu).clamp(true);
      let s = '';
      N.forEach((a, i) => {
        s += `<text x="${l - 6}" y="${t + i * cs + cs / 2 + 4}" text-anchor="end" style="fill:${SIG_COL[a]};font-weight:600">${lab(a)}</text>`;
        s += `<text transform="translate(${l + i * cs + cs / 2 + 4},${t - 6}) rotate(-50)" style="fill:${SIG_COL[a]};font-weight:600">${lab(a)}</text>`;
        N.forEach((b, k) => {
          const v = R[i][k];
          s += `<rect x="${l + k * cs}" y="${t + i * cs}" width="${cs - 2}" height="${cs - 2}" rx="3" fill="${i === k ? '#eee' : col(-v)}"${tipAttr(`${lab(a)} vs ${lab(b)}: r = ${v}`)}/>`;
          if (i !== k) s += `<text x="${l + k * cs + cs / 2 - 1}" y="${t + i * cs + cs / 2 + 3}" text-anchor="middle" style="font-size:9.5px;fill:${Math.abs(v) > 0.45 ? '#fff' : '#1b1d22'}">${v.toFixed(2).replace('0.', '.')}</text>`;
        });
      });
      return svg(s, w, h) + legend([[col(-0.6), 'move together'], [col(0.6), 'move opposite'], ['#f4f3ef', 'unrelated']]);
    }

    // ── §2 charts: the signals ──────────────────────────────────
    function chartTotals() {
      const show = ['A1', 'NB', 'DM', 'SALES', 'CRIME', 'NOISE'], pw = 300, ph = 120, cols = 3;
      let s = '';
      show.forEach((j, k) => {
        const T = S.signals[j].total, yrs = Object.keys(T).map(Number).sort((a, b) => a - b), vals = yrs.map((y) => T[y]);
        const ox = (k % cols) * pw, oy = Math.floor(k / cols) * (ph + 20), l = 46, t = 22, b = 22;
        const max = Math.max(...vals) * 1.1, x = (v) => ox + l + ((pw - l - 20) * (v - 2008)) / 10, y = (v) => oy + t + (ph - t - b) * (1 - v / max);
        s += `<text x="${ox + l}" y="${oy + 12}" style="fill:${SIG_COL[j]};font-weight:700">${lab(j)}</text>`;
        d3.ticks(0, max, 2).forEach((v) => { s += grid(ox + l, ox + pw - 20, y(v)) + `<text x="${ox + l - 5}" y="${y(v) + 4}" text-anchor="end" style="font-size:9.5px">${v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v}</text>`; });
        [2008, 2012, 2016].forEach((v) => { s += `<text x="${x(v)}" y="${oy + ph - b + 13}" text-anchor="middle" style="font-size:9.5px">${v}</text>`; });
        s += `<polyline points="${yrs.map((v, i) => `${x(v)},${y(vals[i])}`).join(' ')}" fill="none" stroke="${SIG_COL[j]}" stroke-width="2.2"/>`;
        yrs.forEach((v, i) => { s += `<circle cx="${x(v)}" cy="${y(vals[i])}" r="3" fill="${SIG_COL[j]}"${tipAttr(`<b>${lab(j)}</b>, ${v}: ${vals[i].toLocaleString()} citywide`)}/>`; });
      });
      return svg(s, cols * pw, 2 * (ph + 20));
    }

    const MAPS = {
      A1: ['Blues', (v) => `${v} renovation jobs per 1,000 households / yr`, 'avg 2011–16'],
      SALES: ['Greens', (v) => `${v} home sales per 1,000 households / yr`, 'avg 2011–16'],
      PRICE: ['RdBu', (v) => `${v > 0 ? '+' : ''}${v}% price per unit, 2009–10 → 2015–16`, 'change by 2016', true],
      CRIME: ['RdBu', (v) => `${v > 0 ? '+' : ''}${v}% felony rate, 2009 → 2016`, 'change by 2016'],
      NOISE: ['YlOrBr', (v) => `${v} noise complaints per 1,000 residents / yr`, 'avg 2011–16'],
      SUBWAY: ['Greys', (v) => `${v} km to the nearest station`, 'fixed', true],
    };
    function mapSig(j) {
      const [ramp, fmt, when, rev] = MAPS[j], vals = Object.values(S.maps[j]);
      const interp = d3['interpolate' + ramp];
      const q = d3.scaleQuantile().domain(vals).range(d3.range(7).map((i) => interp(rev ? 0.9 - 0.12 * i : 0.12 + 0.13 * i)));
      if (ramp === 'RdBu') q.range(d3.range(7).map((i) => interp(rev ? 0.9 - 0.13 * i : 0.1 + 0.13 * i)));
      const qs = q.quantiles();
      return tractMap(D, (p) => (S.maps[j][p.t] == null ? '#f7f7f4' : q(S.maps[j][p.t])),
        (p) => `<b>${p.nta}</b> · tract ${p.t}<br>${S.maps[j][p.t] == null ? 'not modeled' : fmt(S.maps[j][p.t])}<br>${!p.r ? 'not at risk (not low-income in 2006–10)' : p.e2 ? `at risk · tipped ${p.e2}` : 'at risk · did not tip'}`) +
        legend([[q.range()[0], `lowest seventh (< ${f2(qs[0])})`], [q.range()[3], 'middle'], [q.range()[6], `highest seventh (> ${f2(qs[5])})`], ['#999', when]]);
    }

    function chartEventTime() {
      const pw = 225, h = 200, l = 40, t = 30, b = 36, ks = [-4, -3, -2, -1, 0, 1], perRow = 4;
      let s = '';
      TV.forEach((j, pi) => {
        const E = S.event_time[j], ox = (pi % perRow) * pw, oy = Math.floor(pi / perRow) * h;
        const vals = ks.map((k) => E.rel[k].mean).filter((v) => v != null).concat([E.never]);
        let [lo, hi] = rng(vals); const pad = (hi - lo) * 0.25 || 1; lo = Math.min(lo - pad, j === 'PRICE' ? lo - pad : 0); hi += pad;
        const x = (k) => ox + l + ((pw - l - 14) * (k + 4)) / 5, y = (v) => oy + t + (h - t - b) * (1 - (v - lo) / (hi - lo));
        s += `<text x="${ox + l}" y="${oy + 14}" style="fill:${SIG_COL[j]};font-weight:700">${lab(j)}</text>`;
        d3.ticks(lo, hi, 3).forEach((v) => { s += grid(ox + l, ox + pw - 14, y(v)) + `<text x="${ox + l - 4}" y="${y(v) + 4}" text-anchor="end" style="font-size:9.5px">${v}</text>`; });
        ks.forEach((k) => { s += `<text x="${x(k)}" y="${oy + h - b + 14}" text-anchor="middle" style="font-size:9.5px">${k === 0 ? 'tip' : k > 0 ? '+' + k : k}</text>`; });
        s += `<line x1="${x(0)}" x2="${x(0)}" y1="${oy + t}" y2="${oy + h - b}" stroke="#1b1d22" stroke-dasharray="3 3" opacity="0.5"/>`;
        s += `<line x1="${ox + l}" x2="${ox + pw - 14}" y1="${y(E.never)}" y2="${y(E.never)}" stroke="${NULL_COL}" stroke-width="2" stroke-dasharray="6 4"${tipAttr(`At-risk tracts that never tipped: ${E.never} ${UNIT[j]}`)}/>`;
        const pts = ks.filter((k) => E.rel[k].mean != null);
        s += `<polyline points="${pts.map((k) => `${x(k)},${y(E.rel[k].mean)}`).join(' ')}" fill="none" stroke="${SIG_COL[j]}" stroke-width="2.5"/>`;
        pts.forEach((k) => { s += `<circle cx="${x(k)}" cy="${y(E.rel[k].mean)}" r="3.8" fill="${SIG_COL[j]}"${tipAttr(`<b>${lab(j)}</b>, ${k === 0 ? 'the year it tipped' : Math.abs(k) + ' yr ' + (k < 0 ? 'before' : 'after')}<br>${E.rel[k].mean} ${UNIT[j]} (${E.rel[k].n} tracts)`)}/>`; });
      });
      // the eighth panel: subway distance does not change over time, so compare medians
      const ox = 3 * pw, oy = h, Sb = S.event_time.SUBWAY, mx = Math.max(Sb.tipped, Sb.never) * 1.3;
      const bx = (v) => ox + l + ((pw - l - 14) * v) / mx;
      s += `<text x="${ox + l}" y="${oy + 14}" style="fill:${SIG_COL.SUBWAY};font-weight:700">Subway distance (fixed)</text>`;
      [['tipped', Sb.tipped, SIG_COL.SUBWAY], ['never tipped', Sb.never, NULL_COL]].forEach(([nm, v, col], i) => {
        const y = oy + 50 + i * 42;
        s += `<text x="${ox + l}" y="${y - 4}" style="font-size:10px">${nm}</text><rect x="${ox + l}" y="${y}" width="${bx(v) - ox - l}" height="16" rx="2" fill="${col}" opacity="0.75"/><text x="${bx(v) + 4}" y="${y + 12}" style="font-size:10px;font-weight:700">${v} km</text>`;
      });
      s += `<text x="${ox + l}" y="${oy + 150}" style="font-size:9.5px;fill:#5d616b">median distance to a station</text>`;
      return svg(s, perRow * pw, 2 * h) + legend([[C.blue, 'tracts that tipped, lined up on their tipping year'], [NULL_COL, 'at-risk tracts that never tipped (average)']]);
    }

    // ── §3 charts: B vs C ───────────────────────────────────────
    function forestAxis(lo, hi, x0, x1) {
      const L = Math.log(lo), R = Math.log(hi);
      return (v) => x0 + ((x1 - x0) * (Math.log(Math.min(Math.max(v, lo), hi)) - L)) / (R - L);
    }
    function chartForest() {
      const rows = [{ head: "The tract's own signals, last year" }];
      SIGS.forEach((j) => { rows.push({ j, m: 'B', o: MB.coefs['s_' + j] }); rows.push({ j, m: 'C', o: MC.coefs['s_' + j] }); });
      rows.push({ head: "Neighbors' signals, last year (only C has these)" });
      TV.forEach((j) => rows.push({ j, m: 'C', o: MC.coefs['n_' + j], nb: true }));
      const w = 640, l = 190, r = 110, rh = 21, top = 6, h = top + rows.length * rh + 34;
      const x = forestAxis(0.4, 2.5, l, w - r);
      let s = '';
      [0.5, 0.67, 1, 1.5, 2].forEach((v) => { s += `<line x1="${x(v)}" x2="${x(v)}" y1="${top}" y2="${top + rows.length * rh}" stroke="${v === 1 ? 'rgba(27,29,34,0.45)' : 'rgba(27,29,34,0.07)'}" ${v === 1 ? 'stroke-dasharray="4 3"' : ''}/><text x="${x(v)}" y="${top + rows.length * rh + 14}" text-anchor="middle">${v}×</text>`; });
      rows.forEach((rw, i) => {
        const y = top + i * rh + rh / 2;
        if (rw.head) { s += `<text x="0" y="${y + 5}" style="fill:#1b1d22;font-weight:700;font-size:11px">${rw.head}</text>`; return; }
        const col = rw.m === 'B' ? B_COL : C_COL, o = rw.o, sig = clears(o);
        if (rw.m === 'B' || rw.nb) s += `<text x="10" y="${y + 4 + (rw.nb ? 0 : rh / 2)}" style="fill:${SIG_COL[rw.j]};font-weight:600">${lab(rw.j)}</text>`;
        s += `<text x="${l - 8}" y="${y + 4}" text-anchor="end" style="fill:${col};font-weight:700;font-size:10px">${rw.m}</text>`;
        s += `<line x1="${x(o.lo)}" x2="${x(o.hi)}" y1="${y}" y2="${y}" stroke="${col}" stroke-width="2.5"/>`;
        s += `<circle cx="${x(o.or)}" cy="${y}" r="5.5" fill="${sig ? col : '#fff'}" stroke="${col}" stroke-width="2"${tipAttr(`<b>Model ${rw.m}</b> · ${rw.nb ? "neighbors' " : ''}${lab(rw.j).toLowerCase()}<br>odds of tipping × ${f2(o.or)} per 1 SD more<br>95% CI ${f2(o.lo)} to ${f2(o.hi)} · z = ${o.z}<br>${sig ? 'interval clears 1: evidence of an effect' : 'interval crosses 1: no clear effect'}`)}/>`;
        s += `<text x="${w - r + 8}" y="${y + 4}" class="bar-label" style="font-weight:${sig ? 700 : 400}">${f2(o.or)}× ${sig ? '●' : '○'}</text>`;
      });
      s += `<text x="${l + (w - l - r) / 2}" y="${h - 2}" text-anchor="middle" style="fill:#5d616b">odds ratio per 1 SD more of the signal (1 = no effect)</text>`;
      return svg(s, w, h) + legend([[B_COL, 'Model B'], [C_COL, 'Model C'], ['#999', 'filled = 95% interval clears 1 · hollow = crosses 1']]);
    }

    function chartAuc() {
      const rows = [['Model B', MB, B_COL], ['Model C', MC, C_COL]];
      const all = rows.flatMap(([, m]) => [m.auc, m.auc_nosig, m.auc_permits]);
      const lo = Math.floor((Math.min(...all) - 0.03) * 20) / 20, hi = Math.ceil((Math.max(...all) + 0.02) * 20) / 20;
      const w = 560, h = 160, l = 80, r = 30, top = 14, rh = 50, x = (v) => l + ((w - l - r) * (v - lo)) / (hi - lo);
      let s = '';
      d3.range(lo, hi + 1e-9, 0.05).forEach((v) => { s += `<line x1="${x(v)}" x2="${x(v)}" y1="${top}" y2="${top + rh * 2}" stroke="rgba(27,29,34,0.07)"/><text x="${x(v)}" y="${top + rh * 2 + 14}" text-anchor="middle">${v.toFixed(2)}</text>`; });
      rows.forEach(([nm, m, col], i) => {
        const y = top + i * rh + rh / 2;
        s += `<text x="0" y="${y + 4}" style="fill:${col};font-weight:700">${nm}</text>`;
        s += `<line x1="${x(Math.min(m.auc_nosig, m.auc, m.auc_permits))}" x2="${x(Math.max(m.auc_nosig, m.auc, m.auc_permits))}" y1="${y}" y2="${y}" stroke="${col}" stroke-width="2" opacity="0.35"/>`;
        [[m.auc_nosig, 'no signals', '#fff', 6], [m.auc_permits, 'permits only', 'rgba(255,255,255,0.5)', 6], [m.auc, 'all 8 signals', col, 7.5]].forEach(([v, nmv, fill, rr], k) => {
          s += `<circle cx="${x(v)}" cy="${y}" r="${rr}" fill="${k === 1 ? col : fill}" ${k === 1 ? 'opacity="0.45"' : ''} stroke="${col}" stroke-width="2"${tipAttr(`<b>${nm}</b>, ${nmv}: AUC ${f3(v)}`)}/>`;
        });
      });
      s += `<text x="${l + (w - l - r) / 2}" y="${h - 2}" text-anchor="middle" style="fill:#5d616b">held-out AUC 2016–17 (0.5 = coin flip)</text>`;
      return svg(s, w, h) + legend([['#fff', 'no signals (Part 4)'], ['#bbb', 'permits only (first Part 5)'], ['#555', 'all 8 signals']]);
    }

    // which signal groups carry the prediction: AUC lost when a group is dropped
    function chartDrop() {
      const base = sens.find((r) => r.key === 'base');
      const rows = sens.filter((r) => r.key.startsWith('drop_')).map((r) => ({ lab: r.label.replace('Drop ', ''), B: base.B.auc - r.B.auc, C: base.C.auc - r.C.auc }));
      const vals = rows.flatMap((r) => [r.B, r.C]);
      const m = Math.max(0.02, ...vals.map(Math.abs)) * 1.15;
      const w = 560, l = 170, r = 50, rh = 34, top = 10, h = top + rows.length * rh + 34, x0 = l + (w - l - r) / 2, x = (v) => x0 + ((w - l - r) / 2) * (v / m);
      let s = `<line x1="${x0}" x2="${x0}" y1="${top}" y2="${top + rows.length * rh}" stroke="rgba(27,29,34,0.45)"/>`;
      [-m, -m / 2, 0, m / 2, m].forEach((v) => { s += `<text x="${x(v)}" y="${top + rows.length * rh + 14}" text-anchor="middle">${sgn(v)}</text>`; });
      rows.forEach((rw, i) => {
        const y = top + i * rh;
        s += `<text x="0" y="${y + rh / 2 + 4}" style="font-weight:600">${rw.lab}</text>`;
        [['B', B_COL, 6], ['C', C_COL, 18]].forEach(([mm, col, dy]) => {
          const v = rw[mm];
          s += `<rect x="${Math.min(x0, x(v))}" y="${y + dy - 5}" width="${Math.max(1.5, Math.abs(x(v) - x0))}" height="10" rx="2" fill="${col}"${tipAttr(`<b>Model ${mm}</b> without ${rw.lab}<br>AUC ${v >= 0 ? 'drops' : 'rises'} by ${f3(Math.abs(v))}`)}/>`;
          s += `<text x="${x(v) + (v >= 0 ? 4 : -4)}" y="${y + dy + 4}" text-anchor="${v >= 0 ? 'start' : 'end'}" style="font-size:9.5px">${sgn(v)}</text>`;
        });
      });
      s += `<text x="${l + (w - l - r) / 2}" y="${h - 2}" text-anchor="middle" style="fill:#5d616b">AUC lost when the group is removed (right = the group was helping)</text>`;
      return svg(s, w, h) + legend([[B_COL, 'Model B'], [C_COL, 'Model C']]);
    }

    // ── §4 sensitivity ──────────────────────────────────────────
    function chartSens(j) {
      const w = 940, l = 270, top = 30, rh = 25, h = top + sens.length * rh + 30;
      const p1 = [l, l + 120], p2 = [l + 155, l + 390], p3 = [l + 430, w - 50];
      const evMax = Math.max(...sens.map((r) => r.events));
      const aucs = sens.flatMap((r) => [r.B.auc, r.C.auc]);
      const aLo = Math.floor((Math.min(...aucs) - 0.02) * 20) / 20, aHi = Math.ceil((Math.max(...aucs) + 0.01) * 20) / 20;
      const xa = (v) => p2[0] + ((p2[1] - p2[0]) * (v - aLo)) / (aHi - aLo);
      const xo = forestAxis(0.4, 2.5, p3[0], p3[1]);
      let s = `<text x="${p1[0]}" y="12" style="font-weight:700;fill:#1b1d22">Events (tipped tracts)</text><text x="${p2[0]}" y="12" style="font-weight:700;fill:#1b1d22">Held-out AUC</text><text x="${p3[0]}" y="12" style="font-weight:700;fill:${SIG_COL[j]}">${lab(j)}: odds ratio</text>`;
      d3.range(aLo, aHi + 1e-9, 0.05).forEach((v) => { s += `<line x1="${xa(v)}" x2="${xa(v)}" y1="${top - 6}" y2="${top + sens.length * rh}" stroke="rgba(27,29,34,0.07)"/><text x="${xa(v)}" y="${top + sens.length * rh + 14}" text-anchor="middle">${v.toFixed(2)}</text>`; });
      [0.5, 0.67, 1, 1.5, 2].forEach((v) => { s += `<line x1="${xo(v)}" x2="${xo(v)}" y1="${top - 6}" y2="${top + sens.length * rh}" stroke="${v === 1 ? 'rgba(27,29,34,0.45)' : 'rgba(27,29,34,0.07)'}" ${v === 1 ? 'stroke-dasharray="4 3"' : ''}/><text x="${xo(v)}" y="${top + sens.length * rh + 14}" text-anchor="middle">${v}×</text>`; });
      sens.forEach((r, i) => {
        const y = top + i * rh + rh / 2, base = r.key === 'base';
        if (base) s += `<rect x="0" y="${y - rh / 2 + 1}" width="${w}" height="${rh - 2}" fill="rgba(0,173,208,0.08)" rx="4"/>`;
        s += `<text x="4" y="${y + 4}" style="fill:#1b1d22;font-weight:${base ? 700 : 400};font-size:11px">${r.label}</text>`;
        const bw = ((p1[1] - p1[0]) * r.events) / evMax;
        s += `<rect x="${p1[0]}" y="${y - 6}" width="${bw}" height="12" rx="2" fill="${NULL_COL}" opacity="0.55"${tipAttr(`<b>${r.label}</b><br>${r.events} of ${r.n_at_risk} at-risk tracts tip<br>${r.test_events} tipping events in the test years`)}/><text x="${p1[0] + bw + 4}" y="${y + 4}" class="bar-label">${r.events}</text>`;
        s += `<line x1="${xa(r.B.auc)}" x2="${xa(r.C.auc)}" y1="${y}" y2="${y}" stroke="#bbb" stroke-width="2"/>`;
        [['B', B_COL], ['C', C_COL]].forEach(([m, col]) => { s += `<circle cx="${xa(r[m].auc)}" cy="${y}" r="5" fill="${col}" stroke="#fff" stroke-width="1.5"${tipAttr(`<b>${r.label}</b><br>Model ${m} held-out AUC ${f3(r[m].auc)}<br>errors cluster? Moran's I ${r[m].resid_I[0]} (p ${r[m].resid_I[1]})`)}/>`; });
        [['B', B_COL, -4], ['C', C_COL, 4]].forEach(([m, col, dy]) => {
          const o = r[m].sig['s_' + j];
          if (!o) { if (m === 'B') s += `<text x="${p3[0]}" y="${y + 4}" style="font-size:10px;fill:#999">signal left out in this run</text>`; return; }
          const sig = clears(o);
          s += `<line x1="${xo(o.lo)}" x2="${xo(o.hi)}" y1="${y + dy}" y2="${y + dy}" stroke="${col}" stroke-width="2"/><circle cx="${xo(o.or)}" cy="${y + dy}" r="4.2" fill="${sig ? col : '#fff'}" stroke="${col}" stroke-width="1.5"${tipAttr(`<b>${r.label}</b><br>Model ${m}: ${lab(j).toLowerCase()} odds ratio ${orTxt(o)}`)}/>`;
        });
      });
      return svg(s, w, h) + legend([[B_COL, 'Model B'], [C_COL, 'Model C'], [NULL_COL, 'events under that choice'], ['rgba(0,173,208,0.3)', 'baseline choice']]);
    }

    // ── §5 data noise ───────────────────────────────────────────
    function chartNoise() {
      const R = S.noise.reps, w = 760, l = 230, r = 40, rh = 60, top = 8;
      const strips = [
        ['Tracts that tip (v2)', R.map((d) => [d.events, NULL_COL]), S.noise.base_events, (v) => Math.round(v)],
        ['At-risk tracts whose yes/no answer flips', R.map((d) => [d.status_changed, C.orange]), 0, (v) => Math.round(v)],
        ['Held-out AUC', R.flatMap((d) => [[d.auc_B, B_COL], [d.auc_C, C_COL]]), null, (v) => v.toFixed(2)],
      ];
      const h = top + strips.length * rh + 8;
      let s = '';
      strips.forEach(([name, pts, base, fmt], i) => {
        const y = top + i * rh + rh / 2, vals = pts.map((p) => p[0]).concat(base != null ? [base] : []);
        let [lo, hi] = rng(vals);
        const pad = (hi - lo) * 0.15 || Math.abs(hi) * 0.05 || 1; lo -= pad; hi += pad;
        const x = (v) => l + ((w - l - r) * (v - lo)) / (hi - lo);
        s += `<text x="0" y="${y + 4}" style="fill:#1b1d22;font-weight:600">${name}</text>`;
        s += `<line x1="${l}" x2="${w - r}" y1="${y + 14}" y2="${y + 14}" stroke="rgba(27,29,34,0.2)"/>`;
        d3.ticks(lo, hi, 4).forEach((v) => { s += `<text x="${x(v)}" y="${y + 27}" text-anchor="middle" style="font-size:10px">${fmt(v)}</text>`; });
        pts.forEach(([v, col], k) => { s += `<circle cx="${x(v)}" cy="${y + ((k * 7) % 15) - 7}" r="4" fill="${col}" opacity="0.75"${tipAttr(`${name}: ${fmt(v)}`)}/>`; });
        if (base != null && i === 0) s += `<line x1="${x(base)}" x2="${x(base)}" y1="${y - 14}" y2="${y + 14}" stroke="#1b1d22" stroke-width="2.5"/><text x="${x(base)}" y="${y - 17}" text-anchor="middle" style="font-size:10px;font-weight:700">published data: ${base}</text>`;
      });
      return svg(s, w, h) + legend([[NULL_COL, 'one redraw of the ACS data'], [B_COL, 'Model B'], [C_COL, 'Model C'], [C.orange, 'tracts whose answer changes']]);
    }

    // per signal: in how many redraws is its effect clear?
    function chartNoiseSig() {
      const R = S.noise.reps, n = R.length, w = 560, l = 150, r = 50, rh = 26, top = 8, h = top + SIGS.length * rh + 30;
      const x = (v) => l + ((w - l - r) * v) / n;
      let s = '';
      [0, n / 2, n].forEach((v) => { s += `<line x1="${x(v)}" x2="${x(v)}" y1="${top}" y2="${top + SIGS.length * rh}" stroke="rgba(27,29,34,0.08)"/><text x="${x(v)}" y="${top + SIGS.length * rh + 14}" text-anchor="middle">${v}</text>`; });
      SIGS.forEach((j, i) => {
        const y = top + i * rh;
        s += `<text x="0" y="${y + rh / 2 + 4}" style="fill:${SIG_COL[j]};font-weight:600">${lab(j)}</text>`;
        [['B', B_COL, 7], ['C', C_COL, 17]].forEach(([m, col, dy]) => {
          const k = R.filter((d) => d[`${m}_s_${j}_clear`]).length, ors = R.map((d) => d[`${m}_s_${j}`]);
          s += `<rect x="${l}" y="${y + dy - 4}" width="${Math.max(1.5, x(k) - l)}" height="8" rx="2" fill="${col}"${tipAttr(`<b>Model ${m}</b> · ${lab(j)}<br>effect clear in ${k} of ${n} redraws<br>odds ratio ranged ${f2(Math.min(...ors))}× to ${f2(Math.max(...ors))}×`)}/><text x="${x(k) + 4}" y="${y + dy + 4}" style="font-size:9.5px">${k}</text>`;
        });
      });
      s += `<text x="${l + (w - l - r) / 2}" y="${h - 2}" text-anchor="middle" style="fill:#5d616b">redraws (of ${n}) where the signal's 95% interval clears 1</text>`;
      return svg(s, w, h) + legend([[B_COL, 'Model B'], [C_COL, 'Model C']]);
    }

    function ripple(j) {
      const R_ = S.ripple[j], n = Math.max(4, Math.min(8, Math.round(R_.n_nb)));
      const vals = [R_.base, R_.own_B, R_.own_C, R_.each_nb_C];
      const heat = d3.scaleLinear().domain([Math.min(...vals), R_.base, Math.max(...vals)]).range(['#bcd3ee', '#f4f3ef', C.red]).clamp(true);
      const one = (m, ox) => {
        const own = m === 'B' ? R_.own_B : R_.own_C, nbv = m === 'B' ? R_.base : R_.each_nb_C, cx = ox + 140, cy = 130;
        let s = `<text x="${cx}" y="16" text-anchor="middle" style="fill:${m === 'B' ? B_COL : C_COL};font-weight:700">Model ${m}</text>`;
        for (let k = 0; k < n; k++) {
          const a = (2 * Math.PI * k) / n - Math.PI / 2, x = cx + 82 * Math.cos(a), y = cy + 82 * Math.sin(a);
          s += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="${m === 'C' ? C_COL : '#ddd'}" stroke-width="${m === 'C' ? 2 : 1}" ${m === 'B' ? 'stroke-dasharray="3 3"' : ''}/>`;
          s += `<circle cx="${x}" cy="${y}" r="24" fill="${heat(nbv)}" stroke="#fff" stroke-width="2"${tipAttr(`Neighbor tract: ${pc(R_.base)} → ${pc(nbv)} chance of tipping this year`)}/><text x="${x}" y="${y + 4}" text-anchor="middle" style="font-size:10px;font-weight:600">${pc(nbv)}</text>`;
        }
        s += `<circle cx="${cx}" cy="${cy}" r="34" fill="${heat(own)}" stroke="#1b1d22" stroke-width="2"${tipAttr(`The tract with the jump: ${pc(R_.base)} → ${pc(own)}`)}/><text x="${cx}" y="${cy - 2}" text-anchor="middle" style="font-weight:700">${pc(own)}</text><text x="${cx}" y="${cy + 12}" text-anchor="middle" style="font-size:9px">was ${pc(R_.base)}</text>`;
        return s;
      };
      return svg(one('B', 0) + one('C', 300), 580, 250) + legend([['#f4f3ef', `typical yearly risk (${pc(R_.base)})`], [C.red, 'higher risk'], ['#bcd3ee', 'lower risk']]);
    }

    // ── §6 counterfactual ───────────────────────────────────────
    function chartCF() {
      const cf = S.counterfactual;
      const rows = [
        ['Graded on the years it learned from (C)', cf.insample.C, C.orange, 'what you would report with no held-out test'],
        ['Allowed to peek at the future (C)', cf.leak.auc, C.red, "uses neighbors' events that are only confirmed 2 years later"],
        ['Permits only, honest test (C)', cf.permits_only.C, '#7fd3e6', 'the first version of this page'],
        ['All 8 signals, honest test (C)', MC.auc, C_COL, 'held-out 2016–17, only data known at the time'],
        ['All 8 signals, honest test (B)', MB.auc, B_COL, 'held-out 2016–17, only data known at the time'],
        ['Coin flip', 0.5, NULL_COL, ''],
      ];
      const w = 620, rh = 36, top = 10, h = top + rh * rows.length + 30, l = 250, r = 50, x = (v) => l + ((w - l - r) * (v - 0.5)) / 0.5;
      let s = '';
      [0.5, 0.6, 0.7, 0.8, 0.9, 1].forEach((v) => { s += `<line x1="${x(v)}" x2="${x(v)}" y1="${top}" y2="${top + rh * rows.length}" stroke="rgba(27,29,34,0.07)"/><text x="${x(v)}" y="${top + rh * rows.length + 14}" text-anchor="middle">${v.toFixed(1)}</text>`; });
      rows.forEach(([nm, v, col, note], i) => {
        const y = top + i * rh;
        s += `<text x="0" y="${y + 21}" style="fill:#1b1d22;font-weight:600">${nm}</text>`;
        s += `<rect x="${l}" y="${y + 8}" width="${Math.max(2, x(v) - l)}" height="20" rx="3" fill="${col}"${tipAttr(`<b>${nm}</b>: AUC ${f3(v)}${note ? '<br>' + note : ''}`)}/><text x="${x(v) + 6}" y="${y + 23}" class="bar-label" style="font-weight:700">${f3(v)}</text>`;
      });
      s += `<text x="${l + (w - l - r) / 2}" y="${h - 2}" text-anchor="middle" style="fill:#5d616b">AUC (how well the model ranks tracts that tipped above ones that didn't)</text>`;
      return svg(s, w, h);
    }

    // ── numbers the text needs ──────────────────────────────────
    const nR = S.noise.reps, evs = nR.map((d) => d.events), flips = nR.map((d) => d.status_changed);
    const aB = nR.map((d) => d.auc_B), aC = nR.map((d) => d.auc_C);
    const cWins = nR.filter((d) => d.auc_C > d.auc_B).length;
    const nIB = nR.filter((d) => d.pI_B < 0.05).length, nIC = nR.filter((d) => d.pI_C < 0.05).length;
    const sensC = sens.filter((r) => r.key !== 'base');
    const cBeatsAll = sens.filter((r) => r.C.auc > r.B.auc).length;
    const bClust = sens.filter((r) => r.B.resid_I[1] < 0.05).length, cClust = sens.filter((r) => r.C.resid_I[1] < 0.05).length;
    const clearB = SIGS.filter((j) => clears(MB.coefs['s_' + j])), clearC = SIGS.filter((j) => clears(MC.coefs['s_' + j]));
    const clearNb = TV.filter((j) => clears(MC.coefs['n_' + j]));
    const robust = (m, j) => sens.filter((r) => r[m].sig['s_' + j]).filter((r) => clears(r[m].sig['s_' + j])).length;
    const robustN = (m, j) => sens.filter((r) => r[m].sig['s_' + j]).length;
    const wd = S.counterfactual.width, v1 = S.counterfactual.v1, BR = S.baseline_risk;
    const listSig = (arr, M, pre = 's_') => (arr.length ? arr.map((j) => `<b>${lab(j).toLowerCase()}</b> ${f2(M.coefs[pre + j].or)}×`).join(', ') : 'none');
    const trainRate = BR.filter((d) => !d.test), testRate = BR.filter((d) => d.test);

    main.innerHTML = `
    <header class="nyc-hero">
      <div class="nyc-eyebrow">Part 5 · First Spatio-Temporal Model · eight signals from five city sources</div>
      <h1 class="nyc-title">Which signals predict where gentrification comes next, and does space matter?</h1>
      <p class="nyc-lede"><a href="#" onclick="openNycModelsTest();return false;">Part 4</a> tested Models B and C with no signals. This page adds <strong>eight real signals</strong>: building permits (DOB), home sales and prices (Finance), felonies (NYPD), noise complaints (311) and subway access (MTA). It fits <strong>only two models</strong>, B (hazard) and C (spatio-temporal hazard), and compares them. Section 1 shows <strong>where every number in the model comes from</strong>, down to one tract. Then both models are stress-tested: <strong>sensitivity</strong>, <strong>data noise</strong> and <strong>“if I had done it differently.”</strong></p>
    </header>

    <div class="p5-road">
      ${[['1', 'Where inputs come from', 'Every variable: source, field, steps, one worked tract', 'p5-vars'],
        ['2', 'The signals', 'Eight signals: totals, maps, and do they rise before tipping?', 'p5-sig'],
        ['3', 'B vs C', 'Fit both on 2012–15, score both on 2016–17', 'p5-fit'],
        ['4', 'Sensitivity', 'Change one choice or drop one source at a time', 'p5-sens'],
        ['5', 'Data noise', 'What a change in the data does downstream', 'p5-noise'],
        ['6', 'If I’d done it differently', 'Choices that would have changed the answer', 'p5-cf']].map(([n, h, b, id]) =>
        `<button type="button" onclick="document.getElementById('${id}').scrollIntoView({behavior:'smooth'})"><i>${n}</i><b>${h}</b><span>${b}</span></button>`).join('')}
    </div>

    <div class="nyc-stats">
      <div class="nyc-stat"><div class="nyc-stat-num">${S.main.events_model}</div><div class="nyc-stat-label">tracts that tip during 2012–17 (v2), out of ${S.main.n_at_risk} low-income tracts at risk</div></div>
      <div class="nyc-stat"><div class="nyc-stat-num">8</div><div class="nyc-stat-label">signals from 5 sources · Model B has ${MB.n_terms} terms, Model C ${MC.n_terms} + a place effect per tract</div></div>
      <div class="nyc-stat"><div class="nyc-stat-num"><span style="color:${B_COL}">${f2(MB.auc)}</span> → <span style="color:${C_COL}">${f2(MC.auc)}</span></div><div class="nyc-stat-label">held-out AUC, Model B → Model C (gap 95% CI ${f3(G.C_minus_B.lo)} to ${f3(G.C_minus_B.hi)})</div></div>
      <div class="nyc-stat"><div class="nyc-stat-num"><span style="color:${B_COL}">${MB.resid_I[0]}</span> → <span style="color:${C_COL}">${MC.resid_I[0]}</span></div><div class="nyc-stat-label">clustering left in the errors (Moran's I; p ${MB.resid_I[1]} → ${MC.resid_I[1]})</div></div>
    </div>

    <!-- ═════════ 1. WHERE EVERY INPUT COMES FROM ═════════ -->
    <h2 class="mdl-section c" id="p5-vars">1 · Where every input comes from</h2>
    <section class="nyc-panel">
      <div class="nyc-kicker">The model, in one line</div>
      <div class="mdl-eq">logit h<sub>i,t</sub> = <span class="fe">α<sub>t</sub></span> + <span class="c">γ·Start<sub>i</sub> + δ·OwnChange<sub>i,t−1</sub></span> + <span class="x">β·Signals<sub>i,t−1</sub></span> + <span class="sp">θ·NeighborChange<sub>i,t−1</sub> + λ·NeighborSignals<sub>i,t−1</sub> + u<sub>i</sub></span></div>
      <div class="mdl-eq-key">
        <span><i class="fe"></i><b>h<sub>i,t</sub></b>: chance tract <i>i</i> tips in year <i>t</i>, given it hasn't yet. <b>α<sub>t</sub></b>: the baseline yearly risk</span>
        <span><i class="c"></i><b>γ, δ</b>: where the tract started (2006–10) and how far its rent and college share have already moved</span>
        <span><i class="x"></i><b>β</b>: the eight signals, last year. What we want to test. <b>(B and C)</b></span>
        <span><i class="sp"></i><b>θ, λ, u</b>: the spatio-temporal part. Neighbors' change and signals, plus a place effect <b>(C only)</b></span>
      </div>
      <p class="mdl-cap"><b>Model B</b> is everything except the teal terms; <b>Model C</b> is the whole line, so B is a special case of C. Every input is from <b>t−1</b> or earlier: only what you could have known the year before.</p>
    </section>

    <section class="nyc-panel"><div class="nyc-kicker">The map of inputs</div><h2>Six sources → the inputs → which model uses them</h2>
      ${chartFlow()}
      <p class="mdl-cap">Each colored box on the left is a public dataset. Every line is a calculation described in the cards below. The neighbor and place terms (faded) are built from the same data, just averaged over the tracts next door, so they add no new source.</p>
    </section>

    <div class="nyc-row p5-stack">
      <section class="nyc-panel"><div class="nyc-kicker">α<sub>t</sub> · the baseline yearly risk</div><h2>How the baseline yearly risk is set</h2>
        ${chartBaseRisk()}
        <p class="mdl-cap"><b>What it is:</b> one intercept per year, the “year dummies.” For a tract at the average of every input, α<sub>t</sub> is the log-odds it tips that year; 1 ÷ (1 + e<sup>−α</sup>) turns it into a probability (the dots). <b>Where it comes from:</b> the model fits it so that, after the other inputs, the predicted number of tips each year matches the actual number (the bars: ${trainRate.map((d) => `${d.year} ${d.events}/${d.at_risk}`).join(', ')}). <b>Why per year:</b> the whole city's pace changed (2012–13 had the most tipping), and this soaks that up so the signals are judged against same-year tracts. <b>Test years:</b> 2016–17 were never seen, so their α is the 2012–15 average. That is the honest choice, and it is why the hollow dots miss the ${testRate.map((d) => pc(d.rate)).join(' and ')} that actually happened.</p>
      </section>
      <section class="nyc-panel"><div class="nyc-kicker">The outcome · what “tipped” means</div><h2>How y (tipped or not) is built</h2>
        ${steps([
          ['Pick the tracts that could gentrify', `All NYC census tracts with 500+ people and complete ACS data (${D.n_tracts.toLocaleString()}). “At risk” = the bottom 40% by 2006–10 median household income (≤ $${S.main.income_cut.toLocaleString()}): <b>${S.main.n_at_risk} tracts</b>.`],
          ['Measure change since 2010 each year', 'From each ACS 5-year release 2011–2019: rent growth (%) and college-share growth (points), vs the 2006–10 release.'],
          ['Call it a tip', 'A tract tips in year t when <b>both</b> its rent growth and college growth beat the median NYC tract that year, <b>and both stay above the median for the next two releases</b> (the “v2 confirmed” rule from Part 4).'],
          ['Stop watching it', 'Once a tract tips it leaves the data. Before that, each year it is still at risk is one row: y = 1 the year it tips, else 0.'],
          ['Leave room to confirm', 'Confirmation needs t+2 ≤ 2019, so the years modeled are 2012–17. Train on 2012–15, test on 2016–17.'],
        ])}
      </section>
    </div>

    <section class="nyc-panel"><div class="nyc-kicker">The variable dictionary</div><h2>Every input: source, raw field, steps, timing, spread, effect</h2>
      <div class="mdl-toggle" id="p5-fam-toggle" style="--c:${C_COL}">${[['signal', 'Signals (8)'], ['base', 'Baseline yearly risk'], ['start', 'Starting point'], ['own', 'Own change'], ['nb', "Neighbors' change (C)"], ['nbsig', "Neighbors' signals (C)"], ['place', 'Place effect (C)'], ['all', 'All']].map(([k, t], i) => `<button type="button" data-f="${k}" class="${i === 0 ? 'on' : ''}">${t}</button>`).join('')}</div>
      <div id="p5-cards">${varCards('signal')}</div>${real}
      <p class="mdl-cap"><b>How to read a card:</b> the colored chip is the agency, the link is the exact dataset. <b>Raw field</b> is the column(s) pulled. The numbered steps are the full calculation, in order. The histogram is the value the model sees, across every at-risk tract-year (black line = median). The pills are the fitted effect in each model: odds of tipping × that much per 1 SD more; ● = the 95% interval clears 1, ○ = it does not.</p>
    </section>

    <section class="nyc-panel"><div class="nyc-kicker">One tract, start to finish</div><h2>Follow every number for one real tract</h2>
      <div class="p5-ex-ctl"><label>Tract <select id="p5-ex-sel">${S.examples.map((ex, i) => `<option value="${i}">${ex.nta} · ${ex.tract}${ex.tipped ? ' · tipped ' + ex.tipped : ''}</option>`).join('')}</select></label>
        <div class="mdl-toggle" id="p5-ex-m" style="margin:0"><button type="button" data-m="B" style="--c:${B_COL}">Model B</button><button type="button" data-m="C" class="on" style="--c:${C_COL}">Model C</button></div></div>
      <div id="p5-ex">${exampleView(0, 'C')}</div>${real}
      <p class="mdl-cap">Pick a tract and a model. The chart builds that tract's predicted risk for its first test year from the baseline yearly risk, one input at a time (the 9 biggest pushes shown; the rest grouped). The table shows every input: the raw numbers behind it for this tract, the value the model sees, how unusual it is (z), and how far it moves the log-odds (z × the model's weight). The examples are the highest-risk tract (by C) in each of several neighborhoods, plus the city's highest- and lowest-risk at-risk tract that year.</p>
    </section>

    <div class="nyc-row">
      <section class="nyc-panel"><div class="nyc-kicker">Are the signals saying the same thing?</div><h2>Correlation between the eight signals</h2>
        ${chartCorr()}${real}
        <p class="mdl-cap">Pearson correlation across the 2012–15 training rows. Strongly related signals split credit between them, which widens both intervals. Hover a square for the exact value.</p>
      </section>
      <section class="nyc-panel"><div class="nyc-kicker">How each source was matched to a tract</div><h2>Data placed in a tract</h2>
        <div class="p5-match">${[['Permits', S.match.permits, 'BIS tract code, read two ways (702.01 is written “70201”)', 'dob'], ['Home sales', S.match.sales, 'tax lot → PLUTO 2010 tract, or the lot\'s block', 'dof'], ['Felonies', S.match.crime, 'complaint coordinates inside the tract polygon', 'nypd'], ['Noise complaints', S.match.noise, 'complaint coordinates inside the tract polygon', '311']].map(([n, v, how, k]) =>
          `<div><b style="color:${SRC_COL[k]}">${n}</b><div class="p5-bar"><span style="width:${100 * v}%;background:${SRC_COL[k]}"></span></div><em>${pc(v)}</em><span>${how}</span></div>`).join('')}</div>
        <p class="mdl-cap">What is left is in parks, airports, small tracts dropped for <500 people, or has no usable location. Price growth needed 5+ sales in both periods; ${pc(S.match.price_fallback)} of tract-years fell back to the neighborhood (NTA) median instead. Subway distance uses all ${S.match.stations} subway and SIR stations.</p>
      </section>
    </div>

    <!-- ═════════ 2. SIGNALS ═════════ -->
    <h2 class="mdl-section c" id="p5-sig">2 · The eight signals</h2>
    <section class="nyc-panel"><div class="nyc-kicker">Citywide, by year</div><h2>What each source looks like over time</h2>
      ${chartTotals()}${real}
      <p class="mdl-cap">Totals across the modeled tracts. 311 noise complaints <b>doubled</b> 2011 → 2016 because more people used 311, not because the city got twice as loud. That is why the noise signal is measured <b>relative to the city that year</b>. Felonies fell, then leveled off; the felony signal is each tract's change since 2009. Price growth and subway distance aren't counts, so they're on the map instead.</p>
    </section>

    <section class="nyc-panel"><div class="nyc-kicker">Where</div><h2>Six signals on the map</h2>
      <div class="mdl-toggle" id="p5-map-toggle">${Object.keys(MAPS).map((j, i) => `<button type="button" data-j="${j}" class="${i === 0 ? 'on' : ''}" style="--c:${SIG_COL[j]}">${lab(j)}</button>`).join('')}</div>
      <div class="mdl-narrow" id="p5-map">${mapSig('A1')}</div>${real}
      <p class="mdl-cap">Colors split tracts into sevenths. Hover a tract for its value and whether it tipped. For price, red = prices rose more; for felonies, red = crime rose, blue = crime fell.</p>
    </section>

    <section class="nyc-panel"><div class="nyc-kicker">Before any model · the raw pattern</div><h2>Do the signals move <em>before</em> a tract tips?</h2>
      ${chartEventTime()}${real}
      <p class="mdl-cap">Each tract that tipped is lined up on its tipping year (“tip”), then each signal is averaged for the years around it. The dashed line is the average for at-risk tracts that never tipped. <b>A leading signal sits above (or, for felonies, below) the dashed line on the left side, before “tip.”</b> Units: ${TV.map((j) => `${lab(j).toLowerCase()} = ${UNIT[j]}`).join('; ')}.</p>
    </section>

    <div class="nyc-warn"><b>Food signals are not in yet, on purpose.</b> The models need signal history back to 2010–16, before the tipping years. The DOHMH inspection data keeps only ~3 years, and the state liquor data overwrites a license's issue date when it renews, so neither reaches back that far. Every signal on this page does. The 2017 inspection snapshot (Part 1) is the path to adding restaurants.</div>

    <!-- ═════════ 3. B vs C ═════════ -->
    <h2 class="mdl-section bc" id="p5-fit">3 · Two models, one test: B vs C</h2>
    <section class="nyc-panel">
      <div class="nyc-kicker">The test</div>
      <p class="mdl-cap" style="margin-top:0">Same rules as Part 4. Both models train on <b>2012–15</b> (${S.main.train_events} tipping events in ${S.main.train_rows.toLocaleString()} tract-years) and are scored on <b>2016–17</b>, which they never saw (${S.main.test_events} events in ${S.main.test_rows.toLocaleString()} tract-years). Only two models are compared, so every difference below is B vs C and nothing else. C's spatial strength τ = ${S.tau} was picked by cross-validation inside the training years.</p>
    </section>

    <div class="nyc-row p5-wide">
      <section class="nyc-panel"><div class="nyc-kicker">Graph 1 · the signal effects</div><h2>What each model says each signal does</h2>
        ${chartForest()}${real}
        <p class="mdl-cap"><b>How to read:</b> a dot right of the dashed line means more of the signal last year → higher odds of tipping this year. The bar is the 95% interval. Filled = the interval clears 1 (evidence); hollow = it crosses 1 (no clear effect). Effects are per 1 SD so signals in different units compare.</p>
      </section>
      <div>
        <section class="nyc-panel"><div class="nyc-kicker">Graph 2 · prediction</div><h2>Did the signals help predict 2016–17?</h2>
          ${chartAuc()}${real}
          <p class="mdl-cap"><b>AUC</b> = the chance the model ranks a tract that tipped above one that didn't. No signals → permits only → all eight: B ${f3(MB.auc_nosig)} → ${f3(MB.auc_permits)} → ${f3(MB.auc)}; C ${f3(MC.auc_nosig)} → ${f3(MC.auc_permits)} → ${f3(MC.auc)}. Gain from all eight signals over none: B ${sgn(G.B_signal_gain.est)} (95% CI ${f3(G.B_signal_gain.lo)} to ${f3(G.B_signal_gain.hi)}), C ${sgn(G.C_signal_gain.est)} (${f3(G.C_signal_gain.lo)} to ${f3(G.C_signal_gain.hi)}).</p>
          <div class="nyc-stats" style="margin:0.6rem 0 0">
            <div class="nyc-stat"><div class="nyc-stat-num"><span style="color:${B_COL}">${S.top50.B}</span> → <span style="color:${C_COL}">${S.top50.C}</span></div><div class="nyc-stat-label">top-50 watch list hits, B → C (random ≈ ${S.top50.random})</div></div>
            <div class="nyc-stat"><div class="nyc-stat-num">${sgn(G.C_minus_B.est)}</div><div class="nyc-stat-label">C − B AUC, 95% CI ${f3(G.C_minus_B.lo)} to ${f3(G.C_minus_B.hi)}</div></div>
          </div>
        </section>
        <section class="nyc-panel"><div class="nyc-kicker">Graph 3 · which sources carry it</div><h2>Take one source out, refit, score again</h2>
          ${chartDrop()}${real}
        </section>
      </div>
    </div>
    <div class="nyc-note" id="p5-fit-note"></div>

    <!-- ═════════ 4. SENSITIVITY ═════════ -->
    <h2 class="mdl-section b" id="p5-sens">4 · Sensitivity analysis: change one choice, refit, see what moves</h2>
    <section class="nyc-panel">
      <div class="nyc-kicker">Why</div>
      <p class="mdl-cap" style="margin-top:0">Every model rests on choices I made: what counts as “tipped,” who is “at risk,” what “neighbor” means, how far back the signal is measured, and which sources go in. A sensitivity analysis changes <b>one choice at a time</b>, keeps everything else fixed, refits both models, and checks whether the answer survives. If a result only shows up under one set of choices, it is not a finding.</p>
      <div class="mdl-toggle" id="p5-sens-toggle">${SIGS.map((j, i) => `<button type="button" data-j="${j}" class="${i === 0 ? 'on' : ''}" style="--c:${SIG_COL[j]}">${lab(j)}</button>`).join('')}</div>
      <div id="p5-sens-chart">${chartSens('A1')}</div>${real}
      <p class="mdl-cap"><b>How to read:</b> each row is the whole analysis rerun with one change (shaded row = baseline). Left: how many tracts tip. Middle: held-out AUC for B (purple) and C (teal). Right: the odds ratio for the selected signal, B above, C below. Use the buttons to switch signals.</p>
    </section>
    <div class="p5-takeaways">
      <div><b>C ranks better than B</b><span>in ${cBeatsAll} of ${sens.length} setups.</span></div>
      <div><b>B's errors cluster</b><span>in ${bClust} of ${sens.length} setups; C's in ${cClust}.</span></div>
      <div><b>Signals that hold up</b><span>${SIGS.filter((j) => robust('C', j) >= 0.75 * robustN('C', j)).map((j) => `${lab(j).toLowerCase()} (C: ${robust('C', j)}/${robustN('C', j)})`).join(', ') || 'none clear in ≥ 75% of setups for C'}.</span></div>
      <div><b>The biggest lever</b><span>is the event definition: events range from ${Math.min(...sens.map((r) => r.events))} to ${Math.max(...sens.map((r) => r.events))} depending on the choice.</span></div>
    </div>
    <div class="nyc-note" id="p5-sens-note"></div>

    <!-- ═════════ 5. DATA NOISE ═════════ -->
    <h2 class="mdl-section a" id="p5-noise">5 · What changes in the data do to everything else</h2>
    <div class="nyc-row p5-stack">
      <section class="nyc-panel"><div class="nyc-kicker">Change the data · ACS margins of error</div><h2>Redraw the Census numbers ${nR.length} times</h2>
        ${chartNoise()}${real}
        <p class="mdl-cap">Every ACS tract estimate comes with a margin of error. The typical one is ±${S.noise.median_rent_se_pct}% on median rent and ±${S.noise.median_ba_se_pts} points on college share (1 standard error). Each tract's rent and college share were redrawn inside those margins ${nR.length} times (errors carried across overlapping 5-year releases, correlation ${S.noise.rho}), then the outcome was rebuilt and both models refit. The city signals (permits, sales, felonies, 311) are counts of records, not survey estimates, so they were held fixed.</p>
      </section>
      <section class="nyc-panel"><div class="nyc-kicker">What moved</div><h2>The chain reaction, in numbers</h2>
        <ol class="mdl-steps">
          <li><b>Who tips</b><span>${Math.min(...evs)}–${Math.max(...evs)} tracts tip across redraws (published data: ${S.noise.base_events}).</span></li>
          <li><b>Which tracts</b><span>${Math.min(...flips)}–${Math.max(...flips)} at-risk tracts (median ${Math.round(median(flips))}) get a different yes/no answer than with the published numbers. This is the most sensitive link.</span></li>
          <li><b>Signal effects</b><span>See the chart below: how often each signal stays clear when only the survey noise changes.</span></li>
          <li><b>Prediction</b><span>AUC B ${f2(Math.min(...aB))}–${f2(Math.max(...aB))}, C ${f2(Math.min(...aC))}–${f2(Math.max(...aC))}. C beats B in ${cWins} of ${nR.length} redraws.</span></li>
          <li><b>Clustered errors</b><span>B's errors cluster (p &lt; 0.05) in ${nIB} of ${nR.length} redraws, C's in ${nIC}.</span></li>
        </ol>
      </section>
    </div>
    <div class="nyc-row">
      <section class="nyc-panel"><div class="nyc-kicker">Signal by signal</div><h2>Does each effect survive the survey noise?</h2>
        ${chartNoiseSig()}${real}
        <p class="mdl-cap">For each of the ${nR.length} redraws: is the signal's 95% interval clear of 1? A signal that is clear in nearly every redraw is not an accident of one noisy Census release. Hover for the range of its odds ratio.</p>
      </section>
      <section class="nyc-panel"><div class="nyc-kicker">Change one tract · what happens next door</div><h2>A jump in one tract, read by each model</h2>
        <div class="mdl-toggle" id="p5-rip-toggle">${TV.map((j, i) => `<button type="button" data-j="${j}" class="${i === 0 ? 'on' : ''}" style="--c:${SIG_COL[j]}">${lab(j)}</button>`).join('')}</div>
        <div id="p5-rip">${ripple('A1')}</div>
        <p class="mdl-cap">Take a typical at-risk tract (yearly risk ${pc(S.ripple.A1.base)}) and give it 1 SD more of the signal last year. <b>Model B</b> can only change that tract. <b>Model C</b> also changes each of its ~${Math.round(S.ripple.A1.n_nb)} neighbors through the neighbor-signal term λ. That spillover is the spatio-temporal part, measured.</p>
      </section>
    </div>

    <!-- ═════════ 6. COUNTERFACTUAL ═════════ -->
    <h2 class="mdl-section c" id="p5-cf">6 · If I had done it differently</h2>
    <div class="nyc-row">
      <section class="nyc-panel"><div class="nyc-kicker">Same data, different shortcuts</div><h2>How good would the model have <em>looked</em>?</h2>
        ${chartCF()}${real}
        <p class="mdl-cap" id="p5-cf-note"></p>
      </section>
      <section class="nyc-panel"><div class="nyc-kicker">Decision by decision</div><h2>What I did, the alternative, what it would have changed</h2>
        <div class="p5-cf">
          <div><i>Test</i><b>Held out 2016–17</b><span>Graded on its own training years, C scores ${f3(S.counterfactual.insample.C)} (B ${f3(S.counterfactual.insample.B)}), not ${f3(MC.auc)}. A single in-sample number would have misstated both models.</span></div>
          <div><i>Timing</i><b>Only data known by t−1</b><span>Letting C use neighbors' <em>confirmed</em> events (which need 2 more years of data) gives AUC ${f3(S.counterfactual.leak.auc)} vs ${f3(MC.auc)} honest. Even when it doesn't inflate the score, it reads the answer key, so any signal test would be invalid.</span></div>
          <div><i>Signals</i><b>Eight signals, not permits only</b><span>Permits alone: C ${f3(S.counterfactual.permits_only.C)}, B ${f3(S.counterfactual.permits_only.B)}. All eight: C ${f3(MC.auc)}, B ${f3(MB.auc)}.</span></div>
          <div><i>Scale</i><b>Noise relative to the city</b><span>Raw 311 counts double over 2011–16 from 311 adoption alone. Without dividing by the city rate, “more noise” would mostly mean “a later year.”</span></div>
          <div><i>Event</i><b>v2 confirmed, not v1 naive</b><span>v1 would have called ${v1.events} tracts “gentrified” (vs ${S.main.events}), many of them survey noise. AUC under v1: B ${f3(v1.B.auc)}, C ${f3(v1.C.auc)}.</span></div>
          <div><i>Model</i><b>Report C, not B alone</b><span>B's intervals are narrower than C's for ${SIGS.filter((j) => wd['s_' + j].B < wd['s_' + j].C).length} of 8 signals. B looks more certain only because it treats clustered tracts as independent.</span></div>
          <div><i>Data</i><b>Checked the margins of error</b><span>Without §5 I would not know that ~${Math.round(median(flips))} of ${S.main.n_at_risk} tracts (${Math.round(100 * median(flips) / S.main.n_at_risk)}%) get a different answer from survey noise alone. That is still the weakest link.</span></div>
        </div>
      </section>
    </div>

    <!-- ═════════ VERDICT ═════════ -->
    <h2 class="mdl-section bc">Two models, final scorecard</h2>
    <section class="nyc-panel">
      <div class="nyc-table-wrap"><table class="nyc-table p5-score"><thead><tr><th>Test</th><th style="color:${B_COL}">Model B · hazard</th><th style="color:${C_COL}">Model C · spatio-temporal</th><th>Edge</th></tr></thead><tbody>
        <tr><td>Held-out AUC 2016–17</td><td class="num">${f3(MB.auc)}</td><td class="num">${f3(MC.auc)}</td><td>${G.C_minus_B.lo > 0 ? 'C' : G.C_minus_B.hi < 0 ? 'B' : (MC.auc > MB.auc ? 'C, not significant' : 'B, not significant')}</td></tr>
        <tr><td>Top-50 watch list hits</td><td class="num">${S.top50.B}</td><td class="num">${S.top50.C}</td><td>${S.top50.C > S.top50.B ? 'C' : S.top50.C < S.top50.B ? 'B' : 'tie'}</td></tr>
        <tr><td>Signals with a clear effect</td><td>${clearB.length ? clearB.map(lab).join(', ') : 'none'}</td><td>${clearC.length ? clearC.map(lab).join(', ') : 'none'}${clearNb.length ? ' + neighbors\' ' + clearNb.map((j) => lab(j).toLowerCase()).join(', ') : ''}</td><td>—</td></tr>
        <tr><td>Errors cluster on the map? (Moran's I, p)</td><td class="num">${MB.resid_I[0]} (p ${MB.resid_I[1]})</td><td class="num">${MC.resid_I[0]} (p ${MC.resid_I[1]})</td><td>${MB.resid_I[1] < 0.05 && MC.resid_I[1] >= 0.05 ? 'C' : 'neither clearly'}</td></tr>
        <tr><td>Ranks better across sensitivity setups</td><td class="num">${sens.length - cBeatsAll} of ${sens.length}</td><td class="num">${cBeatsAll} of ${sens.length}</td><td>${cBeatsAll > sens.length / 2 ? 'C' : 'B'}</td></tr>
        <tr><td>Ranks better across data redraws</td><td class="num">${nR.length - cWins} of ${nR.length}</td><td class="num">${cWins} of ${nR.length}</td><td>${cWins > nR.length / 2 ? 'C' : 'B'}</td></tr>
        <tr><td>Can see spread from next door</td><td>no</td><td>yes (λ, θ, u)</td><td>C</td></tr>
        <tr><td>Easy to explain and fit</td><td>yes (a logistic regression)</td><td>harder (spatial random effect)</td><td>B</td></tr>
      </tbody></table></div>
      <div class="nyc-note" style="margin-top:1rem" id="p5-verdict"></div>
    </section>

    <section class="nyc-panel">
      <div class="nyc-kicker">Reproduce</div>
      <p class="mdl-cap" style="margin-top:0"><code>python nyc-data-explorer/build_signals.py</code> (reuses Part 4's cached ACS pulls; adds DOB BIS permits <code>ipu4-2q9a</code>, DOF annualized sales + PLUTO <code>64uk-42ks</code>, NYPD complaints <code>qgea-i56i</code>, 311 <code>76ig-c548</code>, MTA stations <code>39hk-dx4f</code> and ACS margins of error). Model C is fit by penalized likelihood (posterior mode); intervals for C come from the Laplace approximation, intervals for B from its Hessian. A full write-up would refit C in R-INLA or Stan.</p>
    </section>`;

    // ── text that depends on the results ────────────────────────
    const fitNote = `<b>What it means:</b> with all eight signals, the effects that clear 1 are: Model B ${listSig(clearB, MB)}; Model C ${listSig(clearC, MC)}${clearNb.length ? `, plus neighbors' ${listSig(clearNb, MC, 'n_')}` : ''}. Everything else crosses 1. <b>Prediction:</b> adding the signals moved held-out AUC by ${sgn(G.B_signal_gain.est)} for B and ${sgn(G.C_signal_gain.est)} for C (95% CIs ${f3(G.B_signal_gain.lo)} to ${f3(G.B_signal_gain.hi)} and ${f3(G.C_signal_gain.lo)} to ${f3(G.C_signal_gain.hi)}). ${G.C_signal_gain.est < -0.01 ? `<b>More inputs made C rank worse:</b> C adds ${S.models.C.n_terms - S.models.B.n_terms} neighbor and signal terms on only ${S.main.train_events} training events, and it fits noise. Shrinking every effect toward zero (ridge penalty picked by cross-validation, last row of §4) only gets C to ${f3(sens.find((r) => r.key === 'ridge').C.auc)}, so it is not just tuning: the signals describe tracts that tip, but they add little ranking power beyond what each tract's own rent and college momentum already says.` : ''} <b>B vs C:</b> C ${MC.auc >= MB.auc ? 'ranks better' : 'ranks worse'} (${f3(MB.auc)} → ${f3(MC.auc)}, gap interval ${G.C_minus_B.lo > 0 ? 'clears 0' : 'touches 0'}) and catches ${S.top50.C} vs ${S.top50.B} on the watch list. B's errors ${MB.resid_I[1] < 0.05 ? 'still cluster' : 'do not cluster'} on the map (p = ${MB.resid_I[1]}); C's ${MC.resid_I[1] < 0.05 ? 'do too' : "don't"} (p = ${MC.resid_I[1]}).`;
    document.getElementById('p5-fit-note').innerHTML = fitNote;
    document.getElementById('p5-sens-note').innerHTML = `<b>What it means:</b> across ${sens.length} setups, B's errors cluster in ${bClust} and C's in ${cClust}, and C ranks better in ${cBeatsAll}. Per signal (Model C, setups where the signal is in): ${SIGS.map((j) => `${lab(j).toLowerCase()} clear in ${robust('C', j)}/${robustN('C', j)}`).join('; ')}. A signal clear in most rows is robust to how the analysis is set up; one clear in a few is not a finding. Dropping a whole source (bottom rows) shows what each one adds once the others are in.`;
    document.getElementById('p5-cf-note').innerHTML = `The top two bars are the scores the same model would have shown with two common shortcuts: grading on its own training years (${f3(S.counterfactual.insample.C)}) and peeking at neighbors' future events (${f3(S.counterfactual.leak.auc)}). The honest test is ${f3(MC.auc)}. The permits-only bar is this page's first version, on the same rows.`;
    document.getElementById('p5-verdict').innerHTML = `<b>Verdict:</b> keep <b>${cBeatsAll > sens.length / 2 ? 'C as the main model' : 'both, with B as the main model'}</b> and ${cBeatsAll > sens.length / 2 ? 'B as the readable baseline' : 'C for the spatial checks'}. ${MB.resid_I[1] < 0.05 && MC.resid_I[1] >= 0.05 ? "C is the only one whose errors behave, so B's intervals are too narrow. " : ''}With eight signals instead of three, the clear effects are ${clearC.length ? listSig(clearC, MC) : 'none'} in C${clearNb.length ? ` and neighbors' ${clearNb.map((j) => lab(j).toLowerCase()).join(', ')}` : ''}. For <b>prediction</b>, the signals do not beat the no-signal model (C ${f3(MC.auc_nosig)} without them vs ${f3(MC.auc)} with). <b>Next step:</b> the outcome is still the weak link (§5: ~${Math.round(100 * median(flips) / S.main.n_at_risk)}% of at-risk tracts change answer under survey noise alone), so a sturdier “tipped” definition should come before adding more signals; the 2017 restaurant snapshot is the next signal.`;

    const wire = (tid, cid, draw, attr = 'j') => document.getElementById(tid).addEventListener('click', (e) => {
      const b = e.target.closest(`button[data-${attr}]`); if (!b) return;
      document.querySelectorAll(`#${tid} button`).forEach((x) => x.classList.toggle('on', x === b));
      document.getElementById(cid).innerHTML = draw(b.dataset[attr]);
    });
    wire('p5-sens-toggle', 'p5-sens-chart', chartSens);
    wire('p5-rip-toggle', 'p5-rip', ripple);
    wire('p5-map-toggle', 'p5-map', mapSig);
    wire('p5-fam-toggle', 'p5-cards', varCards, 'f');
    let exI = 0, exM = 'C';
    const drawEx = () => { document.getElementById('p5-ex').innerHTML = exampleView(exI, exM); };
    document.getElementById('p5-ex-sel').addEventListener('change', (e) => { exI = +e.target.value; drawEx(); });
    document.getElementById('p5-ex-m').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-m]'); if (!b) return;
      document.querySelectorAll('#p5-ex-m button').forEach((x) => x.classList.toggle('on', x === b));
      exM = b.dataset.m; drawEx();
    });

    main.onmousemove = (e) => { const t = e.target.closest('[data-tip]'); if (window.nycTip) window.nycTip(t ? t.getAttribute('data-tip') : null, e); };
    main.onmouseleave = () => window.nycTip && window.nycTip(null);
  };
})();
