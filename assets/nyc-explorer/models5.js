/* ═══════════════════════════════════════════════════════════════
   NYC DATA EXPLORER -- Part 5: First Spatio-Temporal Model
   Real data: models_signals.json (nyc-data-explorer/build_signals.py)
   plus the tract geometry in models_check.json. Two models only (B, C).
   Draws with the helpers models.js exposes as window.nycMdl.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  const SIG_COL = { A1: '#0039a6', NB: '#ff6319', DM: '#ee352e' };
  const SIGS = ['A1', 'NB', 'DM'];

  window.nycRenderModelsSignals = async function (main) {
    const { C, svg, legend, steps, proscons, tractMap, tipAttr, B_COL, C_COL, NULL_COL, f2, f3, pc } = window.nycMdl;
    main.innerHTML = '<p class="nyc-loading" style="padding:2rem">Loading the first spatio-temporal model…</p>';
    let S, D;
    try {
      [S, D] = await Promise.all(['models_signals', 'models_check'].map((n) => fetch('assets/nyc-explorer/' + n + '.json').then((r) => { if (!r.ok) throw new Error(n + ': HTTP ' + r.status); return r.json(); })));
    } catch (e) { main.innerHTML = `<p style="padding:2rem">Could not load the model results (${e.message}).</p>`; return; }

    const MB = S.models.B, MC = S.models.C, G = S.gaps, sens = S.sensitivity;
    const lab = (j) => S.signals[j].label;
    const orTxt = (o) => `${f2(o.or)}× (95% CI ${f2(o.lo)}–${f2(o.hi)})`;
    const clears = (o) => o.lo > 1 || o.hi < 1;
    const real = '<div class="mdl-real">Real data · ACS 5-year tracts 2010–2019 + DOB permits (BIS) 2008–2018</div>';
    const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
    const rng = (a) => [Math.min(...a), Math.max(...a)];

    // ── charts ──────────────────────────────────────────────────
    function chartTotals() {
      const w = 560, h = 230, l = 52, r = 120, t = 14, b = 34, yrs = d3.range(2008, 2019);
      const max = d3.max(SIGS.flatMap((j) => yrs.map((y) => S.signals[j].total[y])));
      const x = (v) => l + ((w - l - r) * (v - 2008)) / 10, y = (v) => t + (h - t - b) * (1 - v / (max * 1.1));
      let s = '';
      d3.ticks(0, max * 1.1, 4).forEach((v) => { s += `<line x1="${l}" x2="${w - r}" y1="${y(v)}" y2="${y(v)}" stroke="rgba(27,29,34,0.08)"/><text x="${l - 6}" y="${y(v) + 4}" text-anchor="end">${v.toLocaleString()}</text>`; });
      yrs.filter((v) => v % 2 === 0).forEach((v) => { s += `<text x="${x(v)}" y="${h - b + 16}" text-anchor="middle">${v}</text>`; });
      SIGS.forEach((j) => {
        const pts = yrs.map((v) => [x(v), y(S.signals[j].total[v])]);
        s += `<polyline points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="${SIG_COL[j]}" stroke-width="2.5"/>`;
        yrs.forEach((v, i) => { s += `<circle cx="${pts[i][0]}" cy="${pts[i][1]}" r="3.5" fill="${SIG_COL[j]}"${tipAttr(`<b>${lab(j)}</b>, ${v}<br>${S.signals[j].total[v].toLocaleString()} jobs citywide`)}/>`; });
        s += `<text x="${w - r + 6}" y="${pts[10][1] + 4}" style="fill:${SIG_COL[j]};font-weight:700">${lab(j).replace(' permits', '')}</text>`;
      });
      s += `<text x="${l + (w - l - r) / 2}" y="${h - 4}" text-anchor="middle" style="fill:#5d616b">year issued · DOB permit jobs, all NYC</text>`;
      return svg(s, w, h);
    }

    function mapA1() {
      const vals = Object.values(S.map_A1).filter((v) => v > 0);
      const q = d3.scaleQuantile().domain(vals).range(d3.range(5).map((i) => d3.interpolateBlues(0.25 + 0.17 * i)));
      return tractMap(D, (p) => (S.map_A1[p.t] == null ? '#f7f7f4' : S.map_A1[p.t] === 0 ? '#ecebe6' : q(S.map_A1[p.t])),
        (p) => `<b>${p.nta}</b> · tract ${p.t}<br>${S.map_A1[p.t] ?? '–'} renovation permits per 1,000 households, 2011–16<br>${!p.r ? 'not at risk (not low-income in 2006–10)' : p.e2 ? `at risk · tipped ${p.e2}` : 'at risk · did not tip'}`) +
        legend([['#ecebe6', 'none'], [d3.interpolateBlues(0.3), 'few'], [d3.interpolateBlues(0.9), 'many (top fifth)']]);
    }

    function chartEventTime() {
      const pw = 290, h = 230, l = 44, t = 26, b = 40, ks = [-4, -3, -2, -1, 0, 1];
      let s = '';
      SIGS.forEach((j, pi) => {
        const E = S.event_time[j], ox = pi * pw;
        const max = Math.max(...ks.map((k) => E.rel[k]), E.never) * 1.25;
        const x = (k) => ox + l + ((pw - l - 18) * (k + 4)) / 5, y = (v) => t + (h - t - b) * (1 - v / max);
        s += `<text x="${ox + l}" y="14" style="fill:${SIG_COL[j]};font-weight:700">${lab(j)}</text>`;
        d3.ticks(0, max, 3).forEach((v) => { s += `<line x1="${ox + l}" x2="${ox + pw - 18}" y1="${y(v)}" y2="${y(v)}" stroke="rgba(27,29,34,0.08)"/><text x="${ox + l - 5}" y="${y(v) + 4}" text-anchor="end">${v}</text>`; });
        ks.forEach((k) => { s += `<text x="${x(k)}" y="${h - b + 15}" text-anchor="middle">${k === 0 ? 'tip' : k > 0 ? '+' + k : k}</text>`; });
        s += `<line x1="${x(0)}" x2="${x(0)}" y1="${t}" y2="${h - b}" stroke="#1b1d22" stroke-dasharray="3 3" opacity="0.5"/>`;
        s += `<line x1="${ox + l}" x2="${ox + pw - 18}" y1="${y(E.never)}" y2="${y(E.never)}" stroke="${NULL_COL}" stroke-width="2" stroke-dasharray="6 4"${tipAttr(`At-risk tracts that never tipped: ${E.never} per 1,000 households per year`)}/>`;
        s += `<polyline points="${ks.map((k) => `${x(k)},${y(E.rel[k])}`).join(' ')}" fill="none" stroke="${SIG_COL[j]}" stroke-width="2.5"/>`;
        ks.forEach((k) => { s += `<circle cx="${x(k)}" cy="${y(E.rel[k])}" r="4" fill="${SIG_COL[j]}"${tipAttr(`<b>${lab(j)}</b>, ${k === 0 ? 'the year it tipped' : Math.abs(k) + ' yr ' + (k < 0 ? 'before' : 'after')}<br>${E.rel[k]} per 1,000 households (${E.n[k]} tracts)`)}/>`; });
        s += `<text x="${ox + l + (pw - l - 18) / 2}" y="${h - 6}" text-anchor="middle" style="fill:#5d616b;font-size:10px">years from tipping</text>`;
      });
      s += `<text transform="translate(10,${(h - 14) / 2 + 10}) rotate(-90)" text-anchor="middle" style="fill:#5d616b;font-size:10px">per 1,000 households / yr</text>`;
      return svg(s, 3 * pw, h) + legend([[SIG_COL.A1, 'tracts that tipped (lined up on their tipping year)'], [NULL_COL, 'at-risk tracts that never tipped (average)']]);
    }

    // odds-ratio forest: x on a log scale
    function forestAxis(lo, hi, x0, x1) {
      const L = Math.log(lo), R = Math.log(hi);
      return (v) => x0 + ((x1 - x0) * (Math.log(Math.min(Math.max(v, lo), hi)) - L)) / (R - L);
    }
    function chartForest() {
      const rows = [];
      rows.push({ head: "Tract's own permits last year" });
      SIGS.forEach((j) => { rows.push({ j, m: 'B', o: MB.coefs['s_' + j] }); rows.push({ j, m: 'C', o: MC.coefs['s_' + j] }); });
      rows.push({ head: "Neighbors' permits last year (only C has this)" });
      SIGS.forEach((j) => rows.push({ j, m: 'C', o: MC.coefs['n_' + j], nb: true }));
      const w = 640, l = 200, r = 120, rh = 26, top = 8, h = top + rows.length * rh + 34;
      const x = forestAxis(0.5, 2.2, l, w - r);
      let s = '';
      [0.5, 0.67, 1, 1.5, 2].forEach((v) => { s += `<line x1="${x(v)}" x2="${x(v)}" y1="${top}" y2="${top + rows.length * rh}" stroke="${v === 1 ? 'rgba(27,29,34,0.45)' : 'rgba(27,29,34,0.07)'}" ${v === 1 ? 'stroke-dasharray="4 3"' : ''}/><text x="${x(v)}" y="${top + rows.length * rh + 14}" text-anchor="middle">${v}×</text>`; });
      rows.forEach((rw, i) => {
        const y = top + i * rh + rh / 2;
        if (rw.head) { s += `<text x="0" y="${y + 5}" style="fill:#1b1d22;font-weight:700;font-size:11px">${rw.head}</text>`; return; }
        const col = rw.m === 'B' ? B_COL : C_COL, o = rw.o, sig = clears(o);
        s += `<text x="12" y="${y + 4}" style="fill:${SIG_COL[rw.j]};font-weight:600">${lab(rw.j).replace(' permits', '')}</text><text x="${l - 8}" y="${y + 4}" text-anchor="end" style="fill:${col};font-weight:700">${rw.m}</text>`;
        s += `<line x1="${x(o.lo)}" x2="${x(o.hi)}" y1="${y}" y2="${y}" stroke="${col}" stroke-width="2.5"/>`;
        s += `<circle cx="${x(o.or)}" cy="${y}" r="6" fill="${sig ? col : '#fff'}" stroke="${col}" stroke-width="2"${tipAttr(`<b>Model ${rw.m}</b> · ${rw.nb ? "neighbors' " : ''}${lab(rw.j).toLowerCase()}<br>odds of tipping × ${f2(o.or)} per 1 SD more<br>95% CI ${f2(o.lo)} to ${f2(o.hi)} · z = ${o.z}<br>${sig ? 'interval clears 1: evidence of an effect' : 'interval crosses 1: no clear effect'}`)}/>`;
        s += `<text x="${w - r + 8}" y="${y + 4}" class="bar-label" style="font-weight:${sig ? 700 : 400}">${f2(o.or)}× ${sig ? '●' : '○'}</text>`;
      });
      s += `<text x="${l + (w - l - r) / 2}" y="${h - 2}" text-anchor="middle" style="fill:#5d616b">odds ratio per 1 SD more permits (1 = no effect)</text>`;
      return svg(s, w, h) + legend([[B_COL, 'Model B (hazard)'], [C_COL, 'Model C (spatio-temporal)'], ['#999', 'filled = 95% interval clears 1 · hollow = it crosses 1']]);
    }

    function chartAuc() {
      const rows = [['Model B', MB, B_COL], ['Model C', MC, C_COL]];
      const all = rows.flatMap(([, m]) => [m.auc, m.auc_nosig]);
      const lo = Math.floor((Math.min(...all) - 0.03) * 20) / 20, hi = Math.ceil((Math.max(...all) + 0.02) * 20) / 20;
      const w = 560, h = 150, l = 90, r = 40, top = 14, rh = 46, x = (v) => l + ((w - l - r) * (v - lo)) / (hi - lo);
      let s = '';
      d3.range(lo, hi + 1e-9, 0.05).forEach((v) => { s += `<line x1="${x(v)}" x2="${x(v)}" y1="${top}" y2="${top + rh * 2}" stroke="rgba(27,29,34,0.07)"/><text x="${x(v)}" y="${top + rh * 2 + 14}" text-anchor="middle">${v.toFixed(2)}</text>`; });
      rows.forEach(([nm, m, col], i) => {
        const y = top + i * rh + rh / 2;
        s += `<text x="0" y="${y + 4}" style="fill:${col};font-weight:700">${nm}</text>`;
        s += `<line x1="${x(m.auc_nosig)}" x2="${x(m.auc)}" y1="${y}" y2="${y}" stroke="${col}" stroke-width="3" opacity="0.5"/>`;
        s += `<circle cx="${x(m.auc_nosig)}" cy="${y}" r="6" fill="#fff" stroke="${col}" stroke-width="2"${tipAttr(`<b>${nm}</b> without permit signals (Part 4 frame): AUC ${f3(m.auc_nosig)}`)}/>`;
        s += `<circle cx="${x(m.auc)}" cy="${y}" r="7" fill="${col}" stroke="#fff" stroke-width="2"${tipAttr(`<b>${nm}</b> with permit signals: AUC ${f3(m.auc)}`)}/>`;
        const right = m.auc >= m.auc_nosig;
        s += `<text x="${x(right ? m.auc : m.auc_nosig) + 12}" y="${y + 4}" class="bar-label">${f3(m.auc_nosig)} → <tspan style="font-weight:700">${f3(m.auc)}</tspan></text>`;
      });
      s += `<text x="${l + (w - l - r) / 2}" y="${h - 2}" text-anchor="middle" style="fill:#5d616b">held-out AUC 2016–17 · hollow = no signals, filled = with permit signals</text>`;
      return svg(s, w, h);
    }

    // sensitivity: one row per scenario, three panels
    function chartSens(j) {
      const w = 940, l = 250, top = 30, rh = 27, h = top + sens.length * rh + 30;
      const p1 = [l, l + 130], p2 = [l + 165, l + 400], p3 = [l + 440, w - 60];
      const evMax = Math.max(...sens.map((r) => r.events));
      const aucs = sens.flatMap((r) => [r.B.auc, r.C.auc]);
      const aLo = Math.floor((Math.min(...aucs) - 0.02) * 20) / 20, aHi = Math.ceil((Math.max(...aucs) + 0.01) * 20) / 20;
      const xa = (v) => p2[0] + ((p2[1] - p2[0]) * (v - aLo)) / (aHi - aLo);
      const xo = forestAxis(0.5, 2.2, p3[0], p3[1]);
      let s = `<text x="${p1[0]}" y="12" style="font-weight:700;fill:#1b1d22">Events (tipped tracts)</text><text x="${p2[0]}" y="12" style="font-weight:700;fill:#1b1d22">Held-out AUC</text><text x="${p3[0]}" y="12" style="font-weight:700;fill:#1b1d22">${lab(j)}: odds ratio</text>`;
      d3.range(aLo, aHi + 1e-9, 0.05).forEach((v) => { s += `<line x1="${xa(v)}" x2="${xa(v)}" y1="${top - 6}" y2="${top + sens.length * rh}" stroke="rgba(27,29,34,0.07)"/><text x="${xa(v)}" y="${top + sens.length * rh + 14}" text-anchor="middle">${v.toFixed(2)}</text>`; });
      [0.5, 0.67, 1, 1.5, 2].forEach((v) => { s += `<line x1="${xo(v)}" x2="${xo(v)}" y1="${top - 6}" y2="${top + sens.length * rh}" stroke="${v === 1 ? 'rgba(27,29,34,0.45)' : 'rgba(27,29,34,0.07)'}" ${v === 1 ? 'stroke-dasharray="4 3"' : ''}/><text x="${xo(v)}" y="${top + sens.length * rh + 14}" text-anchor="middle">${v}×</text>`; });
      sens.forEach((r, i) => {
        const y = top + i * rh + rh / 2, base = r.key === 'base';
        if (base) s += `<rect x="0" y="${y - rh / 2 + 1}" width="${w}" height="${rh - 2}" fill="rgba(0,173,208,0.08)" rx="4"/>`;
        s += `<text x="4" y="${y + 4}" style="fill:#1b1d22;font-weight:${base ? 700 : 400}">${r.label}</text>`;
        const bw = ((p1[1] - p1[0]) * r.events) / evMax;
        s += `<rect x="${p1[0]}" y="${y - 7}" width="${bw}" height="14" rx="2" fill="${NULL_COL}" opacity="0.55"${tipAttr(`<b>${r.label}</b><br>${r.events} of ${r.n_at_risk} at-risk tracts tip<br>${r.test_events} tipping events in the test years`)}/><text x="${p1[0] + bw + 4}" y="${y + 4}" class="bar-label">${r.events}</text>`;
        s += `<line x1="${xa(r.B.auc)}" x2="${xa(r.C.auc)}" y1="${y}" y2="${y}" stroke="#bbb" stroke-width="2"/>`;
        [['B', B_COL], ['C', C_COL]].forEach(([m, col]) => { s += `<circle cx="${xa(r[m].auc)}" cy="${y}" r="5.5" fill="${col}" stroke="#fff" stroke-width="1.5"${tipAttr(`<b>${r.label}</b><br>Model ${m} held-out AUC ${f3(r[m].auc)}<br>errors cluster? Moran's I ${r[m].resid_I[0]} (p ${r[m].resid_I[1]})`)}/>`; });
        [['B', B_COL, -4], ['C', C_COL, 4]].forEach(([m, col, dy]) => {
          const o = r[m].sig['s_' + j], sig = clears(o);
          s += `<line x1="${xo(o.lo)}" x2="${xo(o.hi)}" y1="${y + dy}" y2="${y + dy}" stroke="${col}" stroke-width="2"/><circle cx="${xo(o.or)}" cy="${y + dy}" r="4.5" fill="${sig ? col : '#fff'}" stroke="${col}" stroke-width="1.5"${tipAttr(`<b>${r.label}</b><br>Model ${m}: ${lab(j).toLowerCase()} odds ratio ${orTxt(o)}`)}/>`;
        });
      });
      return svg(s, w, h) + legend([[B_COL, 'Model B'], [C_COL, 'Model C'], [NULL_COL, 'events under that choice'], ['rgba(0,173,208,0.3)', 'baseline choice']]);
    }

    // data noise: strips across the Monte Carlo redraws
    function chartNoise() {
      const R = S.noise.reps, w = 760, l = 230, r = 40, rh = 62, top = 8;
      const strips = [
        ['Tracts that tip (v2)', R.map((d) => [d.events, NULL_COL]), S.noise.base_events, (v) => Math.round(v)],
        ['At-risk tracts whose yes/no answer flips', R.map((d) => [d.status_changed, C.orange]), 0, (v) => Math.round(v)],
        ['Held-out AUC', R.flatMap((d) => [[d.auc_B, B_COL], [d.auc_C, C_COL]]), null, (v) => v.toFixed(2)],
        [lab('A1') + ' odds ratio', R.flatMap((d) => [[d.B_s_A1, B_COL], [d.C_s_A1, C_COL]]), null, (v) => v.toFixed(2)],
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

    // ripple: +1 SD of one tract's permits, read by each model
    function ripple(j) {
      const R_ = S.ripple[j], n = Math.max(4, Math.min(8, Math.round(R_.n_nb)));
      const heat = d3.scaleLinear().domain([R_.base * 0.8, R_.base, Math.max(R_.own_B, R_.own_C, R_.each_nb_C)]).range(['#dfe9f5', '#f4f3ef', C.red]).clamp(true);
      const one = (m, ox) => {
        const own = m === 'B' ? R_.own_B : R_.own_C, nbv = m === 'B' ? R_.base : R_.each_nb_C, cx = ox + 140, cy = 130;
        let s = `<text x="${cx}" y="16" text-anchor="middle" style="fill:${m === 'B' ? B_COL : C_COL};font-weight:700">Model ${m}</text>`;
        for (let k = 0; k < n; k++) {
          const a = (2 * Math.PI * k) / n - Math.PI / 2, x = cx + 82 * Math.cos(a), y = cy + 82 * Math.sin(a);
          s += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="${m === 'C' ? C_COL : '#ddd'}" stroke-width="${m === 'C' ? 2 : 1}" ${m === 'B' ? 'stroke-dasharray="3 3"' : ''}/>`;
          s += `<circle cx="${x}" cy="${y}" r="24" fill="${heat(nbv)}" stroke="#fff" stroke-width="2"${tipAttr(`Neighbor tract: ${pc(R_.base)} → ${pc(nbv)} chance of tipping this year`)}/><text x="${x}" y="${y + 4}" text-anchor="middle" style="font-size:10px;font-weight:600">${pc(nbv)}</text>`;
        }
        s += `<circle cx="${cx}" cy="${cy}" r="34" fill="${heat(own)}" stroke="#1b1d22" stroke-width="2"${tipAttr(`The tract with the permit jump: ${pc(R_.base)} → ${pc(own)}`)}/><text x="${cx}" y="${cy - 2}" text-anchor="middle" style="font-weight:700">${pc(own)}</text><text x="${cx}" y="${cy + 12}" text-anchor="middle" style="font-size:9px">was ${pc(R_.base)}</text>`;
        return s;
      };
      return svg(one('B', 0) + one('C', 300), 580, 250) + legend([['#f4f3ef', `typical yearly risk (${pc(R_.base)})`], [C.red, 'higher risk'], ['#dfe9f5', 'lower risk']]);
    }

    function chartCF() {
      const cf = S.counterfactual;
      const rows = [
        ['Graded on the years it learned from (C)', cf.insample.C, C.orange, 'what you would report with no held-out test'],
        ['Allowed to peek at the future (C)', cf.leak.auc, C.red, "uses neighbors' events that are only confirmed 2 years later"],
        ['Honest test, Model C', MC.auc, C_COL, 'held-out 2016–17, only data known at the time'],
        ['Honest test, Model B', MB.auc, B_COL, 'held-out 2016–17, only data known at the time'],
        ['Coin flip', 0.5, NULL_COL, ''],
      ];
      const w = 620, h = 230, l = 250, r = 50, top = 10, rh = 38, x = (v) => l + ((w - l - r) * (v - 0.5)) / 0.5;
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
    const cBeats = sensC.filter((r) => r.C.auc > r.B.auc).length;
    const a1C = sens.map((r) => r.C.sig.s_A1), a1B = sens.map((r) => r.B.sig.s_A1);
    const a1Cclear = a1C.filter(clears).length, a1Bclear = a1B.filter(clears).length;
    const bClust = sens.filter((r) => r.B.resid_I[1] < 0.05).length, cClust = sens.filter((r) => r.C.resid_I[1] < 0.05).length;
    const wd = S.counterfactual.width;
    const v1 = S.counterfactual.v1;

    main.innerHTML = `
    <header class="nyc-hero">
      <div class="nyc-eyebrow">Part 5 · First Spatio-Temporal Model · real data, first real signals</div>
      <h1 class="nyc-title">Do construction signals predict which tracts gentrify, and does space matter?</h1>
      <p class="nyc-lede"><a href="#" onclick="openNycModelsTest();return false;">Part 4</a> tested Models B and C with no signals. This page adds the <strong>first real signals</strong>: building permits from the Department of Buildings. It fits <strong>only two models</strong>, B (hazard) and C (spatio-temporal hazard), and compares them. Then it stress-tests both: <strong>sensitivity analysis</strong> (change one choice at a time), <strong>data noise</strong> (redraw the Census numbers inside their error bars) and <strong>“if I had done it differently.”</strong></p>
    </header>

    <div class="p5-road">
      ${[['1', 'Signals in', 'Which permits go in, and do they rise before a tract tips?', 'p5-sig'],
        ['2', 'B vs C', 'Fit both on 2012–15, score both on 2016–17', 'p5-fit'],
        ['3', 'Sensitivity', 'Change one analysis choice at a time', 'p5-sens'],
        ['4', 'Data noise', 'What a change in the data does downstream', 'p5-noise'],
        ['5', 'If I’d done it differently', 'Choices that would have changed the answer', 'p5-cf']].map(([n, h, b, id]) =>
        `<button type="button" onclick="document.getElementById('${id}').scrollIntoView({behavior:'smooth'})"><i>${n}</i><b>${h}</b><span>${b}</span></button>`).join('')}
    </div>

    <div class="nyc-stats">
      <div class="nyc-stat"><div class="nyc-stat-num">${S.main.events_model}</div><div class="nyc-stat-label">tracts that tip during 2012–17 (v2), out of ${S.main.n_at_risk} low-income tracts at risk</div></div>
      <div class="nyc-stat"><div class="nyc-stat-num">3</div><div class="nyc-stat-label">permit signals: renovation, new building, demolition (${pc(S.permit_match)} matched to a tract)</div></div>
      <div class="nyc-stat"><div class="nyc-stat-num"><span style="color:${B_COL}">${f2(MB.auc)}</span> → <span style="color:${C_COL}">${f2(MC.auc)}</span></div><div class="nyc-stat-label">held-out AUC, Model B → Model C (gap 95% CI ${f3(G.C_minus_B.lo)} to ${f3(G.C_minus_B.hi)})</div></div>
      <div class="nyc-stat"><div class="nyc-stat-num"><span style="color:${B_COL}">${MB.resid_I[0]}</span> → <span style="color:${C_COL}">${MC.resid_I[0]}</span></div><div class="nyc-stat-label">clustering left in the errors (Moran's I; p ${MB.resid_I[1]} → ${MC.resid_I[1]})</div></div>
    </div>

    <!-- ═════════ 1. SIGNALS ═════════ -->
    <h2 class="mdl-section c" id="p5-sig">1 · The first signals go in</h2>
    <section class="nyc-panel">
      <div class="nyc-kicker">The model, in one line</div>
      <div class="mdl-eq">logit h<sub>i,t</sub> = <span class="fe">α<sub>t</sub></span> + <span class="c">γ·Baseline<sub>i</sub> + δ·OwnChange<sub>i,t−1</sub></span> + <span class="x">β·Permits<sub>i,t−1</sub></span> + <span class="sp">θ·NeighborChange<sub>i,t−1</sub> + λ·NeighborPermits<sub>i,t−1</sub> + u<sub>i</sub></span></div>
      <div class="mdl-eq-key">
        <span><i class="fe"></i><b>α<sub>t</sub></b>: the baseline yearly risk (one per year)</span>
        <span><i class="c"></i><b>γ, δ</b>: starting income/rent/education, and the tract's own change so far</span>
        <span><i class="x"></i><b>β</b>: what we want. Do permits last year raise the odds of tipping this year? <b>(B and C)</b></span>
        <span><i class="sp"></i><b>θ, λ, u</b>: the spatio-temporal part. Neighbors' change and permits, plus a place effect that borrows from next door <b>(C only)</b></span>
      </div>
      <p class="mdl-cap"><b>Model B</b> is everything except the teal terms. <b>Model C</b> is the whole line. So B is a special case of C and the two can be compared directly. Every input is from <b>t−1</b>: only what you could have known the year before.</p>
    </section>

    <div class="nyc-row">
      <section class="nyc-panel"><div class="nyc-kicker">The signals</div><h2>Three kinds of building permit, 2008–2018</h2>
        ${chartTotals()}${real}
        <p class="mdl-cap"><b>Renovation</b> = a major alteration that changes a building's use or occupancy (e.g. warehouse → apartments, a house split into units). <b>New building</b> and <b>demolition</b> are what they say. Counted as permit jobs per tract per year, divided by the tract's 2006–10 households so big and small tracts compare. These have clean history back to 2008, which the models need.</p>
      </section>
      <section class="nyc-panel"><div class="nyc-kicker">Where</div><h2>Renovation permits per 1,000 households, 2011–16</h2>
        ${mapA1()}${real}
        <p class="mdl-cap">Renovation is concentrated in north and central Brooklyn, Long Island City, Harlem and the South Bronx. Hover a tract for its rate and whether it tipped.</p>
      </section>
    </div>

    <section class="nyc-panel"><div class="nyc-kicker">Before any model · the raw pattern</div><h2>Do permits rise <em>before</em> a tract tips?</h2>
      ${chartEventTime()}${real}
      <p class="mdl-cap">Each tract that tipped is lined up on its tipping year (“tip”), then permits are averaged for the years around it. The dashed line is the average for at-risk tracts that never tipped. <b>If permits are a leading signal, the colored line should sit above the dashed line on the left side, before “tip.”</b> ${SIGS.map((j) => `${lab(j)}: ${S.event_time[j].rel[-2]} two years before vs ${S.event_time[j].never} for never-tipped`).join('; ')} (per 1,000 households per year). <b>Read:</b> renovation runs only slightly above never-tipped tracts and edges up toward the tipping year. Demolitions climb steadily in the four years before tipping. New buildings show no clear lead. The pattern is weak, which the models confirm.</p>
    </section>

    <div class="nyc-warn"><b>Food signals are not in yet, on purpose.</b> The models need signal history back to 2010–16, before the tipping years. The DOHMH inspection data keeps only ~3 years, and the state liquor data overwrites a license's issue date when it renews, so neither reaches back that far. Permits do. The 2017 inspection snapshot (Part 1) is the path to adding restaurants.</div>

    <!-- ═════════ 2. B vs C ═════════ -->
    <h2 class="mdl-section bc" id="p5-fit">2 · Two models, one test: B vs C</h2>
    <section class="nyc-panel">
      <div class="nyc-kicker">The test</div>
      <p class="mdl-cap" style="margin-top:0">Same rules as Part 4. Both models train on <b>2012–15</b> (${S.main.train_events} tipping events) and are scored on <b>2016–17</b>, which they never saw (${S.main.test_events} events in ${S.main.test_rows.toLocaleString()} tract-years). Only two models are compared, so every difference below is B vs C and nothing else. C's spatial strength τ = ${S.tau} was picked by cross-validation inside the training years.</p>
    </section>

    <div class="nyc-row p5-wide">
      <section class="nyc-panel"><div class="nyc-kicker">Graph 1 · the signal effects</div><h2>What each model says permits do</h2>
        ${chartForest()}${real}
        <p class="mdl-cap"><b>How to read:</b> a dot right of the dashed line means more permits last year → higher odds of tipping this year. The bar is the 95% interval. Filled = the interval clears 1 (evidence); hollow = it crosses 1 (no clear effect). <span id="p5-forest-note"></span></p>
      </section>
      <section class="nyc-panel"><div class="nyc-kicker">Graph 2 · prediction</div><h2>Did the signals help predict 2016–17?</h2>
        ${chartAuc()}${real}
        <p class="mdl-cap"><b>How to read:</b> AUC is the chance the model ranks a tract that tipped above one that didn't (0.5 = coin flip, 1 = perfect). Hollow dot = the Part 4 model with no permits, filled = with permits. Gain from permits: B ${G.B_signal_gain.est >= 0 ? '+' : ''}${f3(G.B_signal_gain.est)} (95% CI ${f3(G.B_signal_gain.lo)} to ${f3(G.B_signal_gain.hi)}), C ${G.C_signal_gain.est >= 0 ? '+' : ''}${f3(G.C_signal_gain.est)} (${f3(G.C_signal_gain.lo)} to ${f3(G.C_signal_gain.hi)}).</p>
        <div class="nyc-stats" style="margin:0.6rem 0 0">
          <div class="nyc-stat"><div class="nyc-stat-num"><span style="color:${B_COL}">${S.top50.B}</span> → <span style="color:${C_COL}">${S.top50.C}</span></div><div class="nyc-stat-label">top-50 watch list hits, B → C (random ≈ ${S.top50.random})</div></div>
          <div class="nyc-stat"><div class="nyc-stat-num">${G.C_minus_B.est >= 0 ? '+' : ''}${f3(G.C_minus_B.est)}</div><div class="nyc-stat-label">C − B AUC, 95% CI ${f3(G.C_minus_B.lo)} to ${f3(G.C_minus_B.hi)}</div></div>
        </div>
      </section>
    </div>
    <div class="nyc-note"><b>What it means:</b> <b>No permit signal clearly predicts tipping in either model.</b> Renovation leans the right way (B ${f2(MB.coefs.s_A1.or)}×, C ${f2(MC.coefs.s_A1.or)}×), but both intervals cross 1, and adding permits did not improve held-out prediction. The one clear effect is spatial: in C, <b>demolitions in neighboring tracts</b> raise the odds ${orTxt(MC.coefs.n_DM)}. Model B can't test that, because it has no neighbor terms. <b>B vs C:</b> C ranks better (${f3(MB.auc)} → ${f3(MC.auc)}, interval touches 0) and catches ${S.top50.C} vs ${S.top50.B} on the watch list. B's errors still cluster on the map (p = ${MB.resid_I[1]}); C's don't (p = ${MC.resid_I[1]}). A null on the first signals is a real result: construction alone is not an early warning at tract level.</div>

    <!-- ═════════ 3. SENSITIVITY ═════════ -->
    <h2 class="mdl-section b" id="p5-sens">3 · Sensitivity analysis: change one choice, refit, see what moves</h2>
    <section class="nyc-panel">
      <div class="nyc-kicker">Why</div>
      <p class="mdl-cap" style="margin-top:0">Every model rests on choices I made: what counts as “tipped,” who is “at risk,” what “neighbor” means, how far back the signal is measured. A sensitivity analysis changes <b>one choice at a time</b>, keeps everything else fixed, refits both models, and checks whether the answer survives. If a result only shows up under one set of choices, it is not a finding.</p>
      <div class="mdl-toggle" id="p5-sens-toggle">${SIGS.map((j, i) => `<button type="button" data-j="${j}" class="${i === 0 ? 'on' : ''}" style="--c:${SIG_COL[j]}">${lab(j)}</button>`).join('')}</div>
      <div id="p5-sens-chart">${chartSens('A1')}</div>${real}
      <p class="mdl-cap"><b>How to read:</b> each row is the whole analysis rerun with one change (the shaded row is the baseline). Left: how many tracts tip. Middle: held-out AUC for B (purple) and C (teal). Right: the odds ratio for the selected signal, B above, C below. Use the buttons to switch signals.</p>
    </section>
    <div class="p5-takeaways">
      <div><b>C ranks better than B</b><span>in ${cBeats + (MC.auc > MB.auc ? 1 : 0)} of ${sens.length} setups (ties under v3; B wins under v1 and bottom-30%).</span></div>
      <div><b>B's errors cluster</b><span>in ${bClust} of ${sens.length} setups; C's in ${cClust}. The case for C does not depend on one choice.</span></div>
      <div><b>Renovation effect</b><span>interval clears 1 in ${a1Bclear} of ${sens.length} setups for B, ${a1Cclear} for C. Range in C: ${f2(Math.min(...a1C.map((o) => o.or)))}× to ${f2(Math.max(...a1C.map((o) => o.or)))}×.</span></div>
      <div><b>The biggest lever</b><span>is the event definition: events range from ${Math.min(...sens.map((r) => r.events))} to ${Math.max(...sens.map((r) => r.events))} depending on the choice.</span></div>
    </div>
    <div class="nyc-note"><b>What it means:</b> two things hold under every choice. <b>(1) B's errors cluster on the map and C's don't</b>, so B's p-values are too optimistic no matter how the analysis is set up. <b>(2) No permit effect becomes clear</b>, so the null is not an artifact of one choice. What moves the most is <b>how many tracts count as gentrified</b> (the event rule and the income cutoff). Under the strict v3 rule both models tie at AUC ${f3(sens.find((r) => r.key === 'v3').C.auc)}, and with a narrower at-risk group (bottom 30%) B edges out C. Neighbor definition, signal timing and the spatial prior barely matter.</div>

    <!-- ═════════ 4. DATA NOISE ═════════ -->
    <h2 class="mdl-section a" id="p5-noise">4 · What changes in the data do to everything else</h2>
    <div class="nyc-row p5-stack">
      <section class="nyc-panel"><div class="nyc-kicker">Change the data · ACS margins of error</div><h2>Redraw the Census numbers ${nR.length} times</h2>
        ${chartNoise()}${real}
        <p class="mdl-cap">Every ACS tract estimate comes with a margin of error. The typical one is ±${S.noise.median_rent_se_pct}% on median rent and ±${S.noise.median_ba_se_pts} points on college share (1 standard error). Here each tract's rent and college share were redrawn inside those margins ${nR.length} times (errors carried across overlapping 5-year releases, correlation ${S.noise.rho}), then the outcome was rebuilt and both models refit. <b>One change in the data ripples through:</b> it changes who tips → which rows the model learns from → the signal effects → the scores.</p>
      </section>
      <section class="nyc-panel"><div class="nyc-kicker">What moved</div><h2>The chain reaction, in numbers</h2>
        <ol class="mdl-steps">
          <li><b>Who tips</b><span>${Math.min(...evs)}–${Math.max(...evs)} tracts tip across redraws (published data: ${S.noise.base_events}).</span></li>
          <li><b>Which tracts</b><span>${Math.min(...flips)}–${Math.max(...flips)} at-risk tracts (median ${Math.round(median(flips))}) get a different yes/no answer than with the published numbers. This is the most sensitive link.</span></li>
          <li><b>Signal effects</b><span>Renovation odds ratio in C ranges ${f2(Math.min(...nR.map((d) => d.C_s_A1)))}× to ${f2(Math.max(...nR.map((d) => d.C_s_A1)))}×; in B ${f2(Math.min(...nR.map((d) => d.B_s_A1)))}× to ${f2(Math.max(...nR.map((d) => d.B_s_A1)))}×.</span></li>
          <li><b>Prediction</b><span>AUC B ${f2(Math.min(...aB))}–${f2(Math.max(...aB))}, C ${f2(Math.min(...aC))}–${f2(Math.max(...aC))}. C beats B in ${cWins} of ${nR.length} redraws.</span></li>
          <li><b>Clustered errors</b><span>B's errors cluster (p &lt; 0.05) in ${nIB} of ${nR.length} redraws, C's in ${nIC}.</span></li>
        </ol>
      </section>
    </div>

    <section class="nyc-panel"><div class="nyc-kicker">Change one tract · what happens next door</div><h2>A permit jump in one tract, read by each model</h2>
      <div class="mdl-toggle" id="p5-rip-toggle">${SIGS.map((j, i) => `<button type="button" data-j="${j}" class="${i === 0 ? 'on' : ''}" style="--c:${SIG_COL[j]}">${lab(j)}</button>`).join('')}</div>
      <div class="mdl-narrow" id="p5-rip">${ripple('A1')}</div>${real}
      <p class="mdl-cap">Take a typical at-risk tract (yearly risk ${pc(S.ripple.A1.base)}) and give it 1 SD more permits last year. <b>Model B</b> can only change that tract. <b>Model C</b> also changes each of its ~${Math.round(S.ripple.A1.n_nb)} neighbors through the neighbor-permits term λ, because the jump raises their “neighbors' permits” average. That spillover is the spatio-temporal part, measured.</p>
    </section>

    <!-- ═════════ 5. COUNTERFACTUAL ═════════ -->
    <h2 class="mdl-section c" id="p5-cf">5 · If I had done it differently</h2>
    <div class="nyc-row">
      <section class="nyc-panel"><div class="nyc-kicker">Same data, different shortcuts</div><h2>How good would the model have <em>looked</em>?</h2>
        ${chartCF()}${real}
        <p class="mdl-cap">The top two bars are the scores I would have gotten with two common shortcuts. <b>Surprise:</b> neither inflated the score this time. The training years are harder to predict (2012–13 have the most tipping), so grading on them looks <em>worse</em>. Letting C peek at neighbors' future events adds nothing, because C's neighbor-change terms already carry that information honestly. The fix still matters: B's or a weaker model's leak would not be caught without the held-out test.</p>
      </section>
      <section class="nyc-panel"><div class="nyc-kicker">Decision by decision</div><h2>What I did, the alternative, what it would have changed</h2>
        <div class="p5-cf">
          <div><i>Test</i><b>Held out 2016–17</b><span>Graded on its own training years, C scores ${f3(S.counterfactual.insample.C)} (B ${f3(S.counterfactual.insample.B)}), not ${f3(MC.auc)}. Different years, different difficulty: a single in-sample number would have misstated both models.</span></div>
          <div><i>Timing</i><b>Only data known by t−1</b><span>Letting C use neighbors' <em>confirmed</em> events (which need 2 more years of data) gives AUC ${f3(S.counterfactual.leak.auc)} vs ${f3(MC.auc)} honest: no gain here, but it would make any signal test invalid (it reads the answer key).</span></div>
          <div><i>Event</i><b>v2 confirmed, not v1 naive</b><span>v1 would have called ${v1.events} tracts “gentrified” (vs ${S.main.events}), many of them survey noise. AUC under v1: B ${f3(v1.B.auc)}, C ${f3(v1.C.auc)}.</span></div>
          <div><i>Model</i><b>Report C, not B alone</b><span>B's intervals are narrower than C's for every signal (log-width ${SIGS.map((j) => `${lab(j).split(' ')[0]} ${wd['s_' + j].B} vs ${wd['s_' + j].C}`).join(', ')}). B looks more certain only because it treats clustered tracts as independent.</span></div>
          <div><i>Data</i><b>Checked the margins of error</b><span>Without §4 I would not know that ~${Math.round(median(flips))} of ${S.main.n_at_risk} tracts (${Math.round(100 * median(flips) / S.main.n_at_risk)}%) get a different answer from survey noise alone. That is the weakest link in the project.</span></div>
        </div>
      </section>
    </div>

    <!-- ═════════ VERDICT ═════════ -->
    <h2 class="mdl-section bc">Two models, final scorecard</h2>
    <section class="nyc-panel">
      <div class="nyc-table-wrap"><table class="nyc-table p5-score"><thead><tr><th>Test</th><th style="color:${B_COL}">Model B · hazard</th><th style="color:${C_COL}">Model C · spatio-temporal</th><th>Edge</th></tr></thead><tbody>
        <tr><td>Held-out AUC 2016–17</td><td class="num">${f3(MB.auc)}</td><td class="num">${f3(MC.auc)}</td><td>${G.C_minus_B.lo > 0 ? 'C' : G.C_minus_B.hi < 0 ? 'B' : (MC.auc > MB.auc ? 'C, not significant' : 'B, not significant')}</td></tr>
        <tr><td>Top-50 watch list hits</td><td class="num">${S.top50.B}</td><td class="num">${S.top50.C}</td><td>${S.top50.C > S.top50.B ? 'C' : S.top50.C < S.top50.B ? 'B' : 'tie'}</td></tr>
        <tr><td>Errors cluster on the map? (Moran's I, p)</td><td class="num">${MB.resid_I[0]} (p ${MB.resid_I[1]})</td><td class="num">${MC.resid_I[0]} (p ${MC.resid_I[1]})</td><td>${MB.resid_I[1] < 0.05 && MC.resid_I[1] >= 0.05 ? 'C' : 'neither clearly'}</td></tr>
        <tr><td>Beats the other across sensitivity setups</td><td class="num">${sens.length - cBeats - (MC.auc > MB.auc ? 1 : 0)} of ${sens.length}</td><td class="num">${cBeats + (MC.auc > MB.auc ? 1 : 0)} of ${sens.length}</td><td>${cBeats + (MC.auc > MB.auc ? 1 : 0) > sens.length / 2 ? 'C' : 'B'}</td></tr>
        <tr><td>Beats the other across data redraws</td><td class="num">${nR.length - cWins} of ${nR.length}</td><td class="num">${cWins} of ${nR.length}</td><td>${cWins > nR.length / 2 ? 'C' : 'B'}</td></tr>
        <tr><td>Can see spread from next door</td><td>no</td><td>yes (λ, θ, u)</td><td>C</td></tr>
        <tr><td>Easy to explain and fit</td><td>yes (a logistic regression)</td><td>harder (spatial random effect)</td><td>B</td></tr>
      </tbody></table></div>
      <div class="nyc-note" style="margin-top:1rem"><b>Verdict:</b> keep <b>C as the main model</b> and B as the readable baseline. C is never badly worse, usually better, and is the only one whose errors behave. Its edge in raw prediction is real but small and not significant. <b>Next step:</b> the signals, not the model. Permits alone don't lead gentrification here, so the next inputs are the restaurant signals (2017 inspection snapshot), sales prices and crime. Also, the outcome itself is fragile (§4), so a sturdier event definition, e.g. requiring the change to beat the margin of error, should come first.</div>
    </section>

    <section class="nyc-panel">
      <div class="nyc-kicker">Reproduce</div>
      <p class="mdl-cap" style="margin-top:0"><code>python nyc-data-explorer/build_signals.py</code> (reuses Part 4's cached ACS pulls; adds DOB BIS permits <code>ipu4-2q9a</code> and ACS margins of error). Model C is fit by penalized likelihood (posterior mode); intervals for C come from the Laplace approximation, intervals for B from its Hessian. A full write-up would refit C in R-INLA or Stan.</p>
    </section>`;

    document.getElementById('p5-forest-note').innerHTML = SIGS.map((j) => {
      const b = MB.coefs['s_' + j], c = MC.coefs['s_' + j];
      return `${lab(j)}: B ${f2(b.or)}× ${clears(b) ? '(clear)' : '(not clear)'}, C ${f2(c.or)}× ${clears(c) ? '(clear)' : '(not clear)'}.`;
    }).join(' ');

    const wire = (tid, cid, draw) => document.getElementById(tid).addEventListener('click', (e) => {
      const b = e.target.closest('button[data-j]'); if (!b) return;
      document.querySelectorAll(`#${tid} button`).forEach((x) => x.classList.toggle('on', x === b));
      document.getElementById(cid).innerHTML = draw(b.dataset.j);
    });
    wire('p5-sens-toggle', 'p5-sens-chart', chartSens);
    wire('p5-rip-toggle', 'p5-rip', ripple);

    main.onmousemove = (e) => { const t = e.target.closest('[data-tip]'); if (window.nycTip) window.nycTip(t ? t.getAttribute('data-tip') : null, e); };
    main.onmouseleave = () => window.nycTip && window.nycTip(null);
  };
})();
