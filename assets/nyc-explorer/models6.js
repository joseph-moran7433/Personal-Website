/* ═══════════════════════════════════════════════════════════════
   NYC DATA EXPLORER -- Part 6: Rising Neighborhood Score
   Real data: rising_score.json (nyc-data-explorer/build_rising.py).
   Implements MA491/rising-neighborhood-score-change-log.md: continuous
   3-year price outcome vs the city, NTAs, linear Models B and C, a 0-100
   score, then livability filters (Score -> Rank -> Filter).
   Draws with the helpers models.js exposes as window.nycMdl.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  const KIND_COL = { RES: '#b933ad', COM: '#ff6319', STR: '#d4a106', CON: '#0039a6' };
  const SRC_COL = { acs: '#1b1d22', dob: '#0039a6', dof: '#00933c', nypd: '#8b5a2b', 311: '#d4a106', mta: '#4d5357', derived: '#808183' };
  const MODEL_LAB = { zero: 'Everyone matches the city', persist: 'Last 3 years continue', B1: 'B, start simple', B: 'Model B', C1: 'B + neighbors', C: 'Model C' };

  window.nycRenderRisingScore = async function (main) {
    const { C, svg, legend, tipAttr, proscons, B_COL, C_COL, NULL_COL, f2, f3 } = window.nycMdl;
    main.innerHTML = '<p class="nyc-loading" style="padding:2rem">Loading the Rising Neighborhood Score…</p>';
    let S;
    try {
      const r = await fetch('assets/nyc-explorer/rising_score.json?v=20261030');
      if (!r.ok) throw new Error('HTTP ' + r.status);
      S = await r.json();
    } catch (e) { main.innerHTML = `<p style="padding:2rem">Could not load the model results (${e.message}).</p>`; return; }

    const M = S.meta, L = S.ladder, CH = S.choices, CO = S.coefs;
    const V = Object.fromEntries(S.variables.map((v) => [v.key, v]));
    const NT = Object.fromEntries(S.ntas.map((d) => [d.code, d]));
    const scored = S.ntas.filter((d) => d.scored);
    const f1 = (v) => (v == null ? '–' : v.toFixed(1));
    const sgn = (v, f = f1) => (v == null ? '–' : (v >= 0 ? '+' : '−') + f(Math.abs(v)));
    const pct = (lp) => 100 * (Math.exp(lp / 100) - 1);  // log points -> %
    const money = (v) => (v == null ? '–' : '$' + (v >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : Math.round(v / 1000) + 'k'));
    const clears = (c) => c && (c.lo > 0 || c.hi < 0);
    const grid = (x1, x2, y) => `<line x1="${x1}" x2="${x2}" y1="${y}" y2="${y}" stroke="rgba(27,29,34,0.08)"/>`;
    const real = `<div class="mdl-real">Real data · DOF sales ${M.sale_years[0]}–${M.sale_years[1]} · ACS 5-year · DOB · NYPD · 311 · MTA · NYC Parks</div>`;
    const lab = (k) => (V[k] ? V[k].label : k.startsWith('NOISE_') ? 'Noise: ' + M.kinds[k.slice(6)] : k);
    const shortLab = { PRICE0: 'Starting price', INC: 'Income', RENT: 'Rent', BA: 'College share', RENTER: 'Renter share', MOM: 'Own momentum',
      CONSTR: 'Construction', NB: 'New buildings', DM: 'Demolitions', A1: 'Renovations', SALES: 'Sales volume', CRIME_LVL: 'Felony rate',
      CRIME_CHG: 'Felony change', NOISE: 'Noise (all)', NOISE_RES: 'Noise: residential', NOISE_COM: 'Noise: bars/clubs', NOISE_STR: 'Noise: street',
      NOISE_CON: 'Noise: construction', SUBWAY: 'Subway distance', NBMOM: "Neighbors' momentum", GAP: 'Gap (hot side)' };
    const sl = (k) => shortLab[k] || k;
    const T = M.test_years, tr0 = M.first_t;
    const scoreCol = d3.scaleSequential((x) => d3.interpolateRgb('#eef4f1', '#00626f')(x)).domain([0, 100]);

    // ── map: one projection, paths drawn once ──────────────────
    const MW = 600, MH = 600;
    const proj = d3.geoMercator().fitExtent([[6, 6], [MW - 6, MH - 6]], S.geo);
    const gpath = d3.geoPath(proj);
    const PATHS = S.geo.features.map((f) => [f.properties.code, gpath(f)]);
    function ntaMap(fill, tipFn, extra = '', id = '') {
      return `<div class="nyc-chart mdl-map"><svg viewBox="0 0 ${MW} ${MH}" style="overflow:hidden"${id ? ` id="${id}"` : ''}>${PATHS.map(([c, d]) => `<path d="${d}" data-code="${c}" fill="${fill(NT[c])}" stroke="#fff" stroke-width="0.5"${tipAttr(tipFn(NT[c]))}/>`).join('')}${extra}</svg></div>`;
    }

    // ═════════ §0 what changed ═════════
    const CHANGES = [
      ['1', 'Fix the t−1 timing problem', `Every input closes by year t−2; the outcome's starting price uses sales in t−1 and t. Momentum is P[t−5] → P[t−2]; ACS comes from the release ending t−2. Nothing the model sees shares a sale or survey year with what it predicts.`, 'p6-out'],
      ['2', 'Rename to Rising Neighborhood Score', 'This page, its code (build_rising.py, models6.js) and its labels use the new name. Parts 3–5 keep their wording because they document the old tipping model.', 'p6-score'],
      ['3', 'New question', 'Which neighborhoods are good places to live and likely to see home values beat the city over a 3-year tour?', 'p6-out'],
      ['4', 'Continuous outcome', `y = log(P[t+3] ÷ P[t]) minus the city's, in log points. P = median price per unit of 1–3 family homes, sales ≥ $10k, pooled 2 years, ${M.min_sales}+ sales required. ${M.n_rows.toLocaleString()} NTA-years, none dropped after an "event".`, 'p6-out'],
      ['5', 'Linear models B and C', `B: start-year intercepts + levels + momentum + signals. C: B + neighbors' momentum + Gap + a CAR place effect (Leroux, a proper ICAR). Built up step by step from "start simple".`, 'p6-fit'],
      ['6', '0–100 score', `Score = rank of Model C's predicted 3-year appreciation vs the city among the ${M.n_now} NTAs scored for ${M.now_t}, shown with the % and an 80% range.`, 'p6-score'],
      ['7', 'New evaluation', 'Held-out years, RMSE / MAE, Spearman rank correlation, top-20 check vs a random pick and vs "last 3 years continue", Moran\'s I on errors.', 'p6-fit'],
      ['8', 'Hold = 3 years', 'Every outcome is a 3-year window (a PCS tour). §6 also tries 2 and 5.', 'p6-sens'],
      ['9', 'NTAs, all of them', `${M.n_ntas} residential 2010 NTAs (parks, cemeteries and airports dropped). No low-income restriction; affordability is a filter instead.`, 'p6-out'],
      ['10', 'Sales extended', `DOF annualized sales ${M.sale_years[0]}–${M.sale_years[1]} (was 2009–16). Permits, 311 and NYPD extended to match.`, 'p6-out'],
      ['11', 'Livability = filters after scoring', 'Commute (pick a duty station or click the map), crime trend, park access, price cap, noise caps. Score → Rank → Filter.', 'p6-score'],
      ['12', 'Construction overlap', `New-building and demolition permits: combined vs separate tested on the validation years, with VIF and sign checks. Kept: ${CH.constr.pick}.`, 'p6-choice'],
      ['13', 'Noise split by type', `Four 311 kinds (residential, bars/clubs, street, construction) vs one total. Kept: ${CH.noise.pick}.`, 'p6-choice'],
      ['14', 'Noise threshold', `Model: straight line vs squared vs bins vs spline, kept ${CH.form.pick === 'linear' ? 'the straight line' : CH.form.pick === 'sq' ? 'the squared term' : CH.form.pick === 'bins' ? 'the bins' : 'the spline'}. Filters: officer-set noise caps, off by default.`, 'p6-choice'],
      ['15', 'Gap term', 'Gap = hottest qualifying neighbor\'s momentum minus own, next to the neighbor average. Checked with the 2nd-hottest neighbor and a share-of-neighbors version.', 'p6-choice'],
    ];
    const MYCHOICES = [
      ['Base window', 'P[t] pools sales in t−1 and t, so the model "buys" at the end of year t. Inputs stop at t−2, one clear year before the base window.'],
      ['Momentum gap', 'Own momentum P[t−5] → P[t−2] leaves a 1-year gap before the outcome. Ending it at P[t] would share sales with the outcome; §8 shows what that does.'],
      ['Unit', `2010 NTAs (${M.n_ntas} residential), because every tract input from Parts 4–5 already nests in them. 2020+ ACS releases are moved onto 2010 tracts with the Census relationship file (largest land overlap).`],
      ['Minimum sales', `${M.min_sales} sales of 1–3 family homes per 2-year window, at both ends of every change. §6 tries 10 and 40.`],
      ['City benchmark', 'The citywide median price per unit of the same 1–3 family sales, same 2-year pooling.'],
      ['ACS for an NTA', 'Counts are summed; medians (income, rent) are household-weighted averages of the tract medians.'],
      ['Rates vs the city', 'Felonies and 311: log((count + 1) ÷ (count the city rate predicts for this many residents + 1)). 0 = city rate.'],
      ['Training rule', 'Rolling origin: start year t is scored by a model trained only on start years whose 3-year outcome had finished by t (t′ ≤ t−3). That is what an officer could have done in real time.'],
      ['Choice years', `Ridge, τ, construction, noise split and noise shape are picked on ${M.val_years.join('–')} only. A more complex option must lower Model C's RMSE by more than 0.5% to be kept. The test years ${T[0]}–${T[T.length - 1]} are never used for choosing.`],
      ['Prediction range', `80% range = the 10th–90th percentile of Model C's own errors on the test years (covered ${Math.round(100 * S.band.coverage)}% of them).`],
      ['Commute', 'Straight-line km from the NTA\'s population center to the duty station. It is not a transit time.'],
      ['Park access', `Share of residents (2010 tract centers) within 400 m (~5-minute walk) of a park of 1+ acre (${M.n_parks} parks).`],
    ];

    // ═════════ §1 charts ═════════
    function chartTimeline() {
      const yrs = ['t−6', 't−5', 't−4', 't−3', 't−2', 't−1', 't', 't+1', 't+2', 't+3'];
      const w = 900, l = 270, r = 14, top = 30, rh = 30;
      const bw = (w - l - r) / yrs.length, x = (i) => l + i * bw;
      const bars = [
        ['Momentum: starting price P[t−5]', [0, 1], C.green, 'own'],
        ['Momentum: end price P[t−2]', [3, 4], C.green, 'own'],
        ['Starting price vs the city', [3, 4], C.green, 'own'],
        ['Census ACS 5-year release ending t−2', [0, 4], '#1b1d22', 'acs'],
        ['Signals: permits, sales, felonies, 311', [3, 4], C.blue, 'sig'],
        ['Felony change: earlier window', [0, 1], C.blue, 'sig2'],
        ["Neighbors' momentum + Gap", [0, 4], C_COL, 'nb'],
        ['OUTCOME: base price P[t]  (buy)', [5, 6], C.orange, 'y'],
        ['OUTCOME: end price P[t+3]  (sell)', [8, 9], C.orange, 'y'],
      ];
      const h = top + bars.length * rh + 40;
      let s = yrs.map((y, i) => `<text x="${x(i) + bw / 2}" y="${top - 10}" text-anchor="middle" style="font-family:monospace;font-weight:700">${y}</text>`).join('');
      yrs.forEach((_, i) => { s += `<line x1="${x(i)}" x2="${x(i)}" y1="${top - 4}" y2="${top + bars.length * rh}" stroke="rgba(27,29,34,0.07)"/>`; });
      bars.forEach(([name, [a, b], col, k], i) => {
        const y = top + i * rh;
        s += `<text x="${l - 10}" y="${y + rh / 2 + 4}" text-anchor="end" style="fill:${k === 'y' ? C.orange : '#1b1d22'};font-weight:${k === 'y' ? 700 : 500}">${name}</text>`;
        s += `<rect x="${x(a) + 3}" y="${y + 5}" width="${(b - a + 1) * bw - 6}" height="${rh - 10}" rx="4" fill="${col}" opacity="${k === 'acs' || k === 'sig2' || k === 'nb' ? 0.35 : 0.85}"/>`;
      });
      const cx = x(5);
      s += `<line x1="${cx}" x2="${cx}" y1="${top - 4}" y2="${top + bars.length * rh + 6}" stroke="${C.red}" stroke-width="2.5" stroke-dasharray="6 4"/>`;
      s += `<text x="${cx - 6}" y="${h - 14}" text-anchor="end" style="fill:${C.red};font-weight:700">← everything the model sees closes here</text><text x="${cx + 6}" y="${h - 14}" style="fill:${C.orange};font-weight:700">what it predicts →</text>`;
      return svg(s, w, h);
    }

    function chartPrice(code) {
      const P = S.price_series, ys = P.years, cs = P.city, ns = P.nta[code] || [];
      const w = 620, h = 260, l = 58, r = 120, t = 16, b = 34;
      const vals = cs.concat(ns.filter((v) => v != null));
      const lo = 0, hi = Math.max(...vals) * 1.1;
      const x = (yr) => l + ((w - l - r) * (yr - ys[0])) / (ys[ys.length - 1] - ys[0]), y = (v) => t + (h - t - b) * (1 - (v - lo) / (hi - lo));
      let s = '';
      d3.ticks(lo, hi, 5).forEach((v) => { s += grid(l, w - r, y(v)) + `<text x="${l - 6}" y="${y(v) + 4}" text-anchor="end">${money(v)}</text>`; });
      ys.filter((yr) => yr % 3 === 2).forEach((yr) => { s += `<text x="${x(yr)}" y="${h - b + 16}" text-anchor="middle">${yr}</text>`; });
      const line = (arr, col, wd) => {
        const seg = arr.map((v, i) => (v == null ? null : `${x(ys[i])},${y(v)}`));
        let d = '', pen = false;
        seg.forEach((p) => { if (p == null) { pen = false; return; } d += (pen ? 'L' : 'M') + p; pen = true; });
        return `<path d="${d}" fill="none" stroke="${col}" stroke-width="${wd}"/>`;
      };
      s += line(cs, '#1b1d22', 2) + line(ns, C.orange, 3);
      ns.forEach((v, i) => { if (v != null) s += `<circle cx="${x(ys[i])}" cy="${y(v)}" r="3.5" fill="${C.orange}"${tipAttr(`<b>${NT[code].name}</b>, sales ${ys[i] - 1}–${ys[i]}<br>median ${money(v)} per unit<br>city ${money(cs[i])}`)}/>`; });
      const lastN = ns.map((v, i) => [v, i]).filter(([v]) => v != null).pop();
      s += `<text x="${x(ys[ys.length - 1]) + 6}" y="${y(cs[cs.length - 1]) + 4}" style="font-weight:700">NYC</text>`;
      if (lastN) s += `<text x="${x(ys[lastN[1]]) + 6}" y="${y(lastN[0]) + 4}" style="fill:${C.orange};font-weight:700">${NT[code].name.split('-')[0].slice(0, 16)}</text>`;
      s += `<text x="${l + (w - l - r) / 2}" y="${h - 2}" text-anchor="middle" style="fill:#5d616b">median price per unit, 1–3 family homes, 2-year pool ending that year</text>`;
      return svg(s, w, h);
    }

    function chartOutcomeHist() {
      const H_ = S.outcome.hist, n = H_.n, mx = Math.max(...n), w = 560, h = 210, l = 34, r = 10, t = 12, b = 36;
      const bw = (w - l - r) / n.length, x = (v) => l + ((w - l - r) * (v - H_.lo)) / (H_.hi - H_.lo);
      let s = '';
      n.forEach((c, i) => {
        const v0 = H_.lo + (i * (H_.hi - H_.lo)) / n.length;
        s += `<rect x="${l + i * bw + 0.5}" y="${t + (h - t - b) * (1 - c / mx)}" width="${bw - 1}" height="${((h - t - b) * c) / mx}" fill="${v0 >= 0 ? C.green : C.red}" opacity="0.6"${tipAttr(`${sgn(v0, (v) => v.toFixed(0))} to ${sgn(v0 + (H_.hi - H_.lo) / n.length, (v) => v.toFixed(0))} log pts: ${c} NTA-years`)}/>`;
      });
      [-60, -40, -20, 0, 20, 40, 60].forEach((v) => { s += `<text x="${x(v)}" y="${h - b + 15}" text-anchor="middle">${v > 0 ? '+' : ''}${v}${v === 60 ? '+' : ''}</text>`; });
      s += `<line x1="${x(0)}" x2="${x(0)}" y1="${t}" y2="${h - b}" stroke="#1b1d22" stroke-dasharray="4 3"/>`;
      s += `<text x="${x(0) - 6}" y="${t + 12}" text-anchor="end" style="fill:${C.red};font-weight:700">lagged the city</text><text x="${x(0) + 6}" y="${t + 12}" style="fill:${C.green};font-weight:700">beat the city</text>`;
      s += `<text x="${l + (w - l - r) / 2}" y="${h - 4}" text-anchor="middle" style="fill:#5d616b">3-year price change minus the city's (log points ≈ %)</text>`;
      return svg(s, w, h);
    }

    function chartCoverage() {
      return ntaMap((d) => (d.scored ? C_COL : '#e7e7e2'), (d) => `<b>${d.name}</b> (${d.code})<br>${d.scored ? 'scored' : 'not scored'} · ${d.n_sales} sales of 1–3 family homes in ${M.now_t - 1}–${M.now_t}${d.scored ? '' : ` (needs ${M.min_sales}+ at every price point)`}`);
    }

    // ═════════ §2 inputs ═════════
    function miniHist(v, col) {
      if (!v.hist) return '';
      const w = 240, h = 58, n = v.hist.n, mx = Math.max(...n), bw = w / n.length;
      const x = (val) => ((val - v.hist.lo) / (v.hist.hi - v.hist.lo || 1)) * w;
      let s = n.map((c, i) => `<rect x="${i * bw + 0.5}" y="${h - 14 - (c / mx) * (h - 18)}" width="${bw - 1}" height="${(c / mx) * (h - 18)}" fill="${col}" opacity="0.55"/>`).join('');
      const md = v.dist.q[2], fmt = (u) => (Math.abs(u) >= 1000 ? Math.round(u).toLocaleString() : u);
      s += `<line x1="${x(md)}" x2="${x(md)}" y1="2" y2="${h - 14}" stroke="#1b1d22" stroke-width="1.5"/>`;
      s += `<text x="0" y="${h - 2}" style="font-size:9px">${fmt(v.hist.lo)}</text><text x="${w}" y="${h - 2}" text-anchor="end" style="font-size:9px">${fmt(v.hist.hi)}</text><text x="${Math.min(Math.max(x(md), 34), w - 34)}" y="${h - 2}" text-anchor="middle" style="font-size:9px;font-weight:700">median ${fmt(md)}</text>`;
      return `<svg viewBox="0 0 ${w} ${h}" class="p5-hist">${s}</svg>`;
    }
    function pill(m, c, key) {
      if (!c) {
        const curve = key.startsWith('NOISE') && CH.form.pick !== 'linear' && CO[m][key + '^2'] !== undefined || Object.keys(CO[m]).some((k) => k.startsWith(key + '[') || k.startsWith(key + '~'));
        return `<span class="p5-pill off">${m}: ${curve ? 'curve, see §3' : 'not in ' + m}</span>`;
      }
      const col = m === 'B' ? B_COL : C_COL;
      return `<span class="p5-pill" style="--c:${col}"${tipAttr(`Model ${m}: 1 SD more → ${sgn(c.b, f2)} log points of 3-year appreciation vs the city<br>95% CI ${f2(c.lo)} to ${f2(c.hi)} (clustered by NTA)<br>${clears(c) ? 'clears 0: evidence of an effect' : 'crosses 0: no clear effect'}`)}><b>${m}</b> ${sgn(c.b, f1)} ${clears(c) ? '●' : '○'}</span>`;
    }
    const famCol = { base: C.purple, start: C.green, own: C.green, signal: C.blue, noise: '#d4a106', nb: C_COL, place: C_COL };
    function varCards(fam) {
      const list = S.variables.filter((v) => fam === 'all' || v.family === fam);
      return `<div class="p5-cards">${list.map((v) => {
        const src = S.sources[v.source], col = v.key.startsWith('NOISE_') ? KIND_COL[v.key.slice(6)] : famCol[v.family];
        const inB = CO.B[v.key] !== undefined || Object.keys(CO.B).some((k) => k.startsWith(v.key + '[') || k.startsWith(v.key + '~') || k === v.key + '^2');
        const inC = CO.C[v.key] !== undefined || Object.keys(CO.C).some((k) => k.startsWith(v.key + '[') || k.startsWith(v.key + '~') || k === v.key + '^2');
        const unused = !inB && !inC && !['alpha', 'u'].includes(v.key);
        return `<div class="p5-card${unused ? ' p6-unused' : ''}" style="--c:${col}">
          <div class="p5-card-h"><b>${v.label}</b><code>${v.key}</code></div>
          <div class="p5-src"><span style="background:${SRC_COL[v.source]}">${src[0]}</span>${src[1] ? (src[2] ? `<a href="${src[2]}" target="_blank" rel="noopener">${src[1]}</a>` : src[1]) : ''}</div>
          <div class="p5-field"><i>Raw field</i>${v.fields}</div>
          <ol>${v.steps.map((x) => `<li>${x}</li>`).join('')}</ol>
          <div class="p5-when"><i>Measured</i>${v.timing}</div>
          ${v.hist ? `<div class="p5-histwrap"><i>Across NTA-years ${tr0}–${M.last_t}${v.unit ? ' · ' + v.unit : ''}</i>${miniHist(v, col)}</div>` : ''}
          ${unused ? '<div class="p6-unused-tag">Tested in §3, not in the final models</div>' : ''}
          ${!['base', 'place'].includes(v.family) && !unused ? `<div class="p5-pills">${pill('B', CO.B[v.key], v.key)}${pill('C', CO.C[v.key], v.key)}</div>` : ''}
        </div>`;
      }).join('')}</div>`;
    }

    // ═════════ §3 choices ═════════
    function rmseBars(res, opts, labels, pick) {
      const w = 420, l = 150, r = 50, rh = 30, h = opts.length * rh * 1 + 30;
      const vals = opts.flatMap((o) => [res[o].B.rmse, res[o].C.rmse]);
      const lo = Math.min(...vals) * 0.97, hi = Math.max(...vals) * 1.01;
      const x = (v) => l + ((w - l - r) * (v - lo)) / (hi - lo);
      let s = '';
      opts.forEach((o, i) => {
        const y = 8 + i * rh;
        s += `<text x="${l - 8}" y="${y + rh / 2 + 3}" text-anchor="end" style="font-weight:${o === pick ? 700 : 400}">${labels[o]}${o === pick ? ' ✓' : ''}</text>`;
        [['B', B_COL, 7], ['C', C_COL, 16]].forEach(([m, col, dy]) => {
          const v = res[o][m].rmse;
          s += `<rect x="${l}" y="${y + dy - 4}" width="${x(v) - l}" height="7" rx="2" fill="${col}" opacity="${o === pick ? 0.95 : 0.5}"${tipAttr(`<b>${labels[o]}</b>, Model ${m}<br>validation RMSE ${f2(v)} log pts · Spearman ${f2(res[o][m].rho)}`)}/><text x="${x(v) + 4}" y="${y + dy + 3}" style="font-size:10px">${f2(v)}</text>`;
        });
      });
      s += `<text x="${l}" y="${h - 4}" style="fill:#5d616b;font-size:10px">validation RMSE, ${M.val_years.join('–')} (shorter = better; axis starts at ${f1(lo)})</text>`;
      return svg(s, w, h);
    }
    function chartSigns() {
      const sg = CH.constr.signs, yrs = CH.constr.sign_years, rows = [['CONSTR', sg.combined.CONSTR, C.blue], ['NB', sg.separate.NB, C.orange], ['DM', sg.separate.DM, C.red]];
      const w = 440, l = 110, r = 16, rh = 34, h = rows.length * rh + 34;
      const all = rows.flatMap((d) => d[1]), m = Math.max(...all.map(Math.abs), 0.5);
      const x = (v) => l + ((w - l - r) * (v + m)) / (2 * m);
      let s = `<line x1="${x(0)}" x2="${x(0)}" y1="4" y2="${h - 26}" stroke="#1b1d22" stroke-dasharray="3 3"/>`;
      rows.forEach(([k, vals, col], i) => {
        const y = 10 + i * rh + rh / 2;
        const pos = vals.filter((v) => v > 0).length;
        s += `<text x="${l - 8}" y="${y + 4}" text-anchor="end" style="font-weight:600">${sl(k)}</text>`;
        vals.forEach((v, j) => { s += `<circle cx="${x(v)}" cy="${y + (j - 2.5) * 2.2}" r="5" fill="${col}" opacity="0.75"${tipAttr(`<b>${sl(k)}</b>, trained on ${tr0}–${yrs[j] - M.hold}<br>${sgn(v, f2)} log pts per SD`)}/>`; });
        s += `<text x="${w - r}" y="${y + 4}" text-anchor="end" style="font-size:10px;fill:#5d616b">${pos}/${vals.length} positive</text>`;
      });
      s += `<text x="${l + (w - l - r) / 2}" y="${h - 6}" text-anchor="middle" style="fill:#5d616b;font-size:10px">effect per SD in Model C, one dot per growing training window</text>`;
      return svg(s, w, h);
    }
    function chartCurve(k) {
      const cv = S.curves[k];
      if (!cv) return '<p class="mdl-cap">No curve: noise is in as one combined input.</p>';
      const w = 560, h = 240, l = 46, r = 16, t = 16, b = 40;
      const xs = cv.x, es = cv.eff, xlo = Math.min(...xs), xhi = Math.max(...xs);
      const elo = Math.min(...es, -1), ehi = Math.max(...es, 1);
      const X = (v) => l + ((w - l - r) * (Math.log(v) - Math.log(xlo))) / (Math.log(xhi) - Math.log(xlo)), Y = (v) => t + (h - t - b) * (1 - (v - elo) / (ehi - elo));
      const col = KIND_COL[k.slice(6)] || '#d4a106';
      let s = '';
      d3.ticks(elo, ehi, 5).forEach((v) => { s += grid(l, w - r, Y(v)) + `<text x="${l - 6}" y="${Y(v) + 4}" text-anchor="end">${v === 0 ? '0' : sgn(v, (q) => q.toFixed(1))}</text>`; });
      [0.25, 0.5, 1, 2, 3, 5, 8].filter((v) => v >= xlo && v <= xhi).forEach((v) => { s += `<text x="${X(v)}" y="${h - b + 15}" text-anchor="middle">${v}×</text>`; });
      s += `<line x1="${X(1)}" x2="${X(1)}" y1="${t}" y2="${h - b}" stroke="#1b1d22" stroke-dasharray="3 3"/><text x="${X(1) + 4}" y="${t + 10}" style="font-size:10px">city rate</text>`;
      s += `<path d="${xs.map((v, i) => (i ? 'L' : 'M') + X(v) + ',' + Y(es[i])).join('')}" fill="none" stroke="${col}" stroke-width="3"/>`;
      if (cv.peak) s += `<circle cx="${X(cv.peak)}" cy="${Y(Math.max(...es))}" r="6" fill="#fff" stroke="${col}" stroke-width="2.5"/><text x="${X(cv.peak)}" y="${Y(Math.max(...es)) - 10}" text-anchor="middle" style="font-weight:700;fill:${col}">turns at ~${cv.peak}×</text>`;
      s += `<text x="${l + (w - l - r) / 2}" y="${h - 4}" text-anchor="middle" style="fill:#5d616b">complaints relative to the city rate (log scale), years t−3…t−2</text>`;
      s += `<text transform="translate(12,${t + (h - t - b) / 2}) rotate(-90)" text-anchor="middle" style="fill:#5d616b;font-size:10px">push on predicted appreciation (log pts)</text>`;
      return svg(s, w, h);
    }
    function chartGapBins() {
      const B_ = S.gap.bins, w = 460, h = 230, l = 46, r = 10, t = 14, b = 48;
      const vals = B_.flatMap((d) => [d.mean - 2 * d.se, d.mean + 2 * d.se]), lo = Math.min(0, ...vals) - 1, hi = Math.max(0, ...vals) + 1;
      const bw = (w - l - r) / B_.length, Y = (v) => t + (h - t - b) * (1 - (v - lo) / (hi - lo));
      let s = '';
      d3.ticks(lo, hi, 5).forEach((v) => { s += grid(l, w - r, Y(v)) + `<text x="${l - 6}" y="${Y(v) + 4}" text-anchor="end">${sgn(v, (q) => q.toFixed(0))}</text>`; });
      s += `<line x1="${l}" x2="${w - r}" y1="${Y(0)}" y2="${Y(0)}" stroke="#1b1d22"/>`;
      B_.forEach((d, i) => {
        const x = l + bw * (i + 0.5);
        s += `<rect x="${x - bw * 0.3}" y="${Math.min(Y(d.mean), Y(0))}" width="${bw * 0.6}" height="${Math.abs(Y(d.mean) - Y(0))}" fill="${C_COL}" opacity="0.7"${tipAttr(`Gap ${f1(d.lo)} to ${f1(d.hi)} log pts<br>average outcome ${sgn(d.mean)} (± ${f1(2 * d.se)})<br>${d.n} NTA-years`)}/>`;
        s += `<line x1="${x}" x2="${x}" y1="${Y(d.mean - 2 * d.se)}" y2="${Y(d.mean + 2 * d.se)}" stroke="#1b1d22"/>`;
        s += `<text x="${x}" y="${h - b + 15}" text-anchor="middle">${['lowest', '2nd', 'middle', '4th', 'highest'][i]}</text><text x="${x}" y="${h - b + 28}" text-anchor="middle" style="font-size:9px;fill:#5d616b">${i === 0 ? '< ' + d.hi.toFixed(0) : i === 4 ? '> ' + d.lo.toFixed(0) : d.lo.toFixed(0) + ' to ' + d.hi.toFixed(0)}</text>`;
      });
      s += `<text x="${l + (w - l - r) / 2}" y="${h - 4}" text-anchor="middle" style="fill:#5d616b">Gap fifth (hottest neighbor's momentum − own, log pts)</text>`;
      s += `<text transform="translate(12,${t + (h - t - b) / 2}) rotate(-90)" text-anchor="middle" style="fill:#5d616b;font-size:10px">next 3 yrs vs city (log pts)</text>`;
      return svg(s, w, h);
    }

    // ═════════ §4 fit ═════════
    function chartLadder() {
      const ks = ['zero', 'persist', 'B1', 'B', 'C1', 'C'];
      const w = 880, l = 190, mid = 520, r = 20, rh = 34, top = 24, h = top + ks.length * rh + 30;
      const rmax = Math.max(...ks.map((k) => L[k].rmse_within)) * 1.05;
      const rhoMax = Math.max(0.5, ...ks.map((k) => L[k].rho || 0)) * 1.1;
      const x1 = (v) => l + ((mid - 40 - l) * v) / rhoMax, x2 = (v) => mid + ((w - r - mid) * v) / rmax;
      let s = `<text x="${l}" y="14" style="font-weight:700">Spearman rank correlation (higher = better ranking)</text><text x="${mid}" y="14" style="font-weight:700">Typical miss within a year, log pts (lower = better)</text>`;
      ks.forEach((k, i) => {
        const y = top + i * rh, d = L[k], col = k.startsWith('C') ? C_COL : k.startsWith('B') ? B_COL : NULL_COL, op = k === 'B' || k === 'C' ? 0.95 : 0.5;
        s += `<text x="${l - 10}" y="${y + rh / 2 + 4}" text-anchor="end" style="font-weight:${k === 'B' || k === 'C' ? 700 : 400}">${MODEL_LAB[k]}</text>`;
        if (d.rho != null && !Number.isNaN(d.rho)) s += `<rect x="${l}" y="${y + 7}" width="${Math.max(0, x1(d.rho) - l)}" height="${rh - 14}" rx="3" fill="${col}" opacity="${op}"/><text x="${Math.max(l, x1(d.rho)) + 5}" y="${y + rh / 2 + 4}">${f3(d.rho)}</text>`;
        else s += `<text x="${l + 4}" y="${y + rh / 2 + 4}" style="fill:#5d616b;font-size:10px">no ranking (same guess for all)</text>`;
        s += `<rect x="${mid}" y="${y + 7}" width="${x2(d.rmse_within) - mid}" height="${rh - 14}" rx="3" fill="${col}" opacity="${op}"${tipAttr(`<b>${MODEL_LAB[k]}</b><br>within-year RMSE ${f2(d.rmse_within)}<br>raw RMSE ${f2(d.rmse)} · average miss ${sgn(d.bias, f2)}`)}/><text x="${x2(d.rmse_within) + 5}" y="${y + rh / 2 + 4}">${f1(d.rmse_within)}</text>`;
      });
      s += `<text x="${l}" y="${h - 6}" style="fill:#5d616b;font-size:10px">${L.C.per_year.reduce((a, d) => a + d.n, 0)} NTA-years in ${T[0]}–${T[T.length - 1]}, each scored by a model trained only on start years finished by then</text>`;
      return svg(s, w, h);
    }
    function chartPerYear() {
      const ks = [['persist', NULL_COL], ['B', B_COL], ['C', C_COL]];
      const w = 460, h = 230, l = 40, r = 10, t = 14, b = 40;
      const vals = ks.flatMap(([k]) => L[k].per_year.map((d) => d.rho)), lo = Math.min(0, ...vals) - 0.05, hi = Math.max(...vals) + 0.05;
      const bw = (w - l - r) / T.length, Y = (v) => t + (h - t - b) * (1 - (v - lo) / (hi - lo));
      let s = '';
      d3.ticks(lo, hi, 5).forEach((v) => { s += grid(l, w - r, Y(v)) + `<text x="${l - 6}" y="${Y(v) + 4}" text-anchor="end">${v.toFixed(1)}</text>`; });
      s += `<line x1="${l}" x2="${w - r}" y1="${Y(0)}" y2="${Y(0)}" stroke="#1b1d22"/>`;
      T.forEach((yr, i) => {
        const x0 = l + bw * i;
        ks.forEach(([k, col], j) => {
          const d = L[k].per_year.find((q) => q.t === yr);
          if (!d) return;
          const x = x0 + bw * (0.25 + 0.25 * j);
          s += `<rect x="${x - bw * 0.1}" y="${Math.min(Y(d.rho), Y(0))}" width="${bw * 0.2}" height="${Math.abs(Y(d.rho) - Y(0))}" fill="${col}" opacity="0.85"${tipAttr(`<b>${MODEL_LAB[k]}</b>, start ${yr} (sell ${yr + M.hold})<br>Spearman ${f3(d.rho)} · RMSE ${f1(d.rmse)}<br>top 20 beat the city: ${d.top_beat}/20`)}/>`;
        });
        s += `<text x="${x0 + bw / 2}" y="${h - b + 15}" text-anchor="middle">${yr}</text><text x="${x0 + bw / 2}" y="${h - b + 28}" text-anchor="middle" style="font-size:9px;fill:#5d616b">→ ${yr + M.hold}</text>`;
      });
      return svg(s, w, h) + legend(ks.map(([k, c]) => [c, MODEL_LAB[k]]));
    }
    function chartTop() {
      const ks = [['persist', NULL_COL], ['B', B_COL], ['C', C_COL]];
      const n = L.C.top_n, w = 460, l = 150, r = 50, rh = 34, h = 3 * rh + 3 * rh + 70;
      const x = (v) => l + ((w - l - r) * v) / n;
      let s = `<text x="0" y="14" style="font-weight:700">How many of the top 20 beat the city (${T.length} years × 20 = ${n})</text>`;
      ks.forEach(([k, col], i) => {
        const y = 22 + i * rh;
        s += `<text x="${l - 8}" y="${y + rh / 2 + 4}" text-anchor="end">${MODEL_LAB[k]}</text><rect x="${l}" y="${y + 7}" width="${x(L[k].top_beat) - l}" height="${rh - 14}" rx="3" fill="${col}"/><text x="${x(L[k].top_beat) + 5}" y="${y + rh / 2 + 4}" style="font-weight:700">${L[k].top_beat}</text>`;
      });
      const rx = x(L.C.random_beat);
      s += `<line x1="${rx}" x2="${rx}" y1="20" y2="${22 + 3 * rh}" stroke="#1b1d22" stroke-dasharray="4 3"/><text x="${rx}" y="${30 + 3 * rh}" text-anchor="middle" style="font-size:10px">random pick ≈ ${f1(L.C.random_beat)}</text>`;
      const y0 = 50 + 3 * rh, mx = Math.max(...ks.map(([k]) => L[k].top_mean), L.C.all_mean, 1) * 1.15, mn = Math.min(0, L.C.all_mean, ...ks.map(([k]) => L[k].top_mean));
      const x2 = (v) => l + ((w - l - r) * (v - mn)) / (mx - mn);
      s += `<text x="0" y="${y0 - 4}" style="font-weight:700">Average 3-year gain vs the city of those 20 (log pts)</text>`;
      ks.forEach(([k, col], i) => {
        const y = y0 + i * rh, v = L[k].top_mean;
        s += `<text x="${l - 8}" y="${y + rh / 2 + 4}" text-anchor="end">${MODEL_LAB[k]}</text><rect x="${Math.min(x2(0), x2(v))}" y="${y + 7}" width="${Math.abs(x2(v) - x2(0))}" height="${rh - 14}" rx="3" fill="${col}"/><text x="${Math.max(x2(v), x2(0)) + 5}" y="${y + rh / 2 + 4}" style="font-weight:700">${sgn(v)}</text>`;
      });
      const ax = x2(L.C.all_mean);
      s += `<line x1="${ax}" x2="${ax}" y1="${y0}" y2="${y0 + 3 * rh}" stroke="#1b1d22" stroke-dasharray="4 3"/><text x="${ax}" y="${y0 + 3 * rh + 10}" text-anchor="middle" style="font-size:10px">all NTAs ${sgn(L.C.all_mean)}</text>`;
      return svg(s, w, h);
    }
    function chartForest() {
      const keys = Object.keys(CO.C).filter((k) => !/[\^\[~]/.test(k));
      const w = 640, l = 190, r = 20, rh = 26, top = 10, h = top + keys.length * rh + 34;
      const all = keys.flatMap((k) => [CO.C[k].lo, CO.C[k].hi, ...(CO.B[k] ? [CO.B[k].lo, CO.B[k].hi] : [])]);
      const m = Math.max(...all.map(Math.abs)) * 1.05, x = (v) => l + ((w - l - r) * (v + m)) / (2 * m);
      let s = `<line x1="${x(0)}" x2="${x(0)}" y1="${top}" y2="${top + keys.length * rh}" stroke="#1b1d22" stroke-dasharray="4 3"/>`;
      d3.ticks(-m, m, 7).forEach((v) => { s += `<text x="${x(v)}" y="${top + keys.length * rh + 14}" text-anchor="middle">${v === 0 ? '0' : sgn(v, (q) => q.toFixed(1))}</text>`; });
      keys.forEach((k, i) => {
        const y = top + i * rh + rh / 2;
        if (i % 2) s += `<rect x="0" y="${y - rh / 2}" width="${w}" height="${rh}" fill="rgba(27,29,34,0.025)"/>`;
        s += `<text x="${l - 10}" y="${y + 4}" text-anchor="end">${sl(k)}</text>`;
        [['B', B_COL, -5], ['C', C_COL, 5]].forEach(([mm, col, dy]) => {
          const c = CO[mm][k];
          if (!c) return;
          const cl = clears(c);
          s += `<line x1="${x(c.lo)}" x2="${x(c.hi)}" y1="${y + dy}" y2="${y + dy}" stroke="${col}" stroke-width="2"/><circle cx="${x(c.b)}" cy="${y + dy}" r="4.5" fill="${cl ? col : '#fff'}" stroke="${col}" stroke-width="2"${tipAttr(`<b>${lab(k)}</b>, Model ${mm}<br>1 SD more → ${sgn(c.b, f2)} log pts (95% CI ${f2(c.lo)} to ${f2(c.hi)})<br>${cl ? 'clears 0' : 'crosses 0'}`)}/>`;
        });
      });
      s += `<text x="${l + (w - l - r) / 2}" y="${h - 4}" text-anchor="middle" style="fill:#5d616b">change in 3-year appreciation vs the city per 1 SD more of the input (log pts ≈ %)</text>`;
      return svg(s, w, h) + legend([[B_COL, 'Model B'], [C_COL, 'Model C'], ['#999', 'filled = 95% interval clears 0 (clustered by NTA)']]);
    }
    function chartScatter(m) {
      const pts = S.scatter[m], w = 440, h = 400, l = 46, r = 12, t = 12, b = 40;
      const ylim = 60, xlim = Math.ceil(Math.max(...pts.map((q) => Math.abs(q[1]))) / 5) * 5 + 5;
      const X = (v) => l + ((w - l - r) * (Math.max(-xlim, Math.min(xlim, v)) + xlim)) / (2 * xlim), Y = (v) => t + (h - t - b) * (1 - (Math.max(-ylim, Math.min(ylim, v)) + ylim) / (2 * ylim));
      const ycol = d3.scaleOrdinal(T, ['#0039a6', '#00933c', '#ff6319', '#b933ad']);
      let s = '';
      [-60, -30, 0, 30, 60].forEach((v) => { s += grid(l, w - r, Y(v)) + `<text x="${l - 6}" y="${Y(v) + 4}" text-anchor="end">${v}</text>`; });
      d3.ticks(-xlim, xlim, 6).forEach((v) => { s += `<text x="${X(v)}" y="${h - b + 15}" text-anchor="middle">${v}</text>`; });
      s += `<line x1="${X(-xlim)}" x2="${X(xlim)}" y1="${Y(-xlim)}" y2="${Y(xlim)}" stroke="#1b1d22" stroke-dasharray="4 3"/>`;
      s += `<line x1="${X(0)}" x2="${X(0)}" y1="${t}" y2="${h - b}" stroke="rgba(27,29,34,0.2)"/>`;
      pts.forEach(([y, p, yr]) => { s += `<circle cx="${X(p)}" cy="${Y(y)}" r="2.6" fill="${ycol(yr)}" opacity="0.55"/>`; });
      s += `<text x="${l + (w - l - r) / 2}" y="${h - 4}" text-anchor="middle" style="fill:#5d616b">predicted (log pts vs city; note the narrower scale)</text><text transform="translate(12,${t + (h - t - b) / 2}) rotate(-90)" text-anchor="middle" style="fill:#5d616b">what happened</text>`;
      return svg(s, w, h) + legend(T.map((yr) => [ycol(yr), `start ${yr}`]));
    }

    // ═════════ §5 score tool ═════════
    const kmTo = (d, lat, lon) => { const R = 6371, dl = ((lat - d.lat) * Math.PI) / 180, dn = ((lon - d.lon) * Math.PI) / 180; const a = Math.sin(dl / 2) ** 2 + Math.cos((d.lat * Math.PI) / 180) * Math.cos((lat * Math.PI) / 180) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(a)); };
    const F = { wp: 0, lat: S.workplaces[0].lat, lon: S.workplaces[0].lon, km: 20, crime: 'off', park: 0, price: 0, noise: { RES: 0, COM: 0, STR: 0, CON: 0 }, topN: 20 };
    const priceMax = Math.max(...scored.map((d) => d.price_now || 0));
    function reasons(d) {
      const out = [];
      const km = kmTo(d, F.lat, F.lon);
      if (F.km && km > F.km) out.push(`${f1(km)} km away`);
      if (F.crime === 'city' && d.felony_chg > M.felony_city_chg) out.push(`felonies ${sgn(d.felony_chg)}% (city ${sgn(M.felony_city_chg)}%)`);
      if (F.crime === 'flat' && d.felony_chg > 0) out.push(`felonies ${sgn(d.felony_chg)}%`);
      if (F.park && d.park_400 * 100 < F.park) out.push(`${Math.round(d.park_400 * 100)}% near a park`);
      if (F.price && d.price_now > F.price) out.push(`${money(d.price_now)}/unit`);
      Object.entries(F.noise).forEach(([k, cap]) => { if (cap && d.noise[k] > cap) out.push(`${sl('NOISE_' + k).replace('Noise: ', '')} noise ${f1(d.noise[k])}×`); });
      return out;
    }
    function scoreView() {
      const ranked = [...scored].sort((a, b) => b.score - a.score);
      const pass = ranked.filter((d) => !reasons(d).length);
      const failSet = new Set(ranked.filter((d) => reasons(d).length).map((d) => d.code));
      const show = pass.slice(0, F.topN);
      const [px, py] = proj([F.lon, F.lat]);
      const ring = F.km ? (() => { const p2 = proj([F.lon + F.km / (111.32 * Math.cos((F.lat * Math.PI) / 180)), F.lat]); return `<circle cx="${px}" cy="${py}" r="${Math.abs(p2[0] - px)}" fill="none" stroke="#1b1d22" stroke-dasharray="5 4" stroke-width="1.2"/>`; })() : '';
      const showSet = new Set(show.map((d) => d.code));
      const map = ntaMap((d) => (!d.scored ? '#fbfbf8' : failSet.has(d.code) ? '#e3e3de' : scoreCol(d.score)),
        (d) => (d.scored ? `<b>${d.name}</b><br>Score ${d.score} · predicted ${sgn(d.pctC)}% vs city (80%: ${sgn(d.lo)} to ${sgn(d.hi)})${reasons(d).length ? '<br><span style="color:#ee352e">filtered out: ' + reasons(d).join(', ') + '</span>' : ''}` : `<b>${d.name}</b><br>not scored (too few 1–3 family sales)`),
        ring + `<path d="M${px},${py - 9}l2.6,6 6.4,.4-5,4.1 1.7,6.3L${px},${py + 3.6}l-5.7,3.2 1.7-6.3-5-4.1 6.4-.4z" fill="${C.red}" stroke="#fff" stroke-width="1"/>` +
        show.map((d, i) => { const [x, y] = proj([d.lon, d.lat]); return `<circle cx="${x}" cy="${y}" r="7.5" fill="#1b1d22" stroke="#fff" stroke-width="1"/><text x="${x}" y="${y + 3.2}" text-anchor="middle" style="fill:#fff;font-size:8.5px;font-weight:700;pointer-events:none">${i + 1}</text>`; }).join(''), 'p6-scoremap');
      const list = show.map((d, i) => {
        const km = kmTo(d, F.lat, F.lon);
        return `<tr><td class="num"><b>${i + 1}</b></td><td><b>${d.name}</b><div class="p6-sub">${d.boro} · #${ranked.indexOf(d) + 1} overall · ${f1(km)} km</div></td>
          <td class="num"><span class="p6-score" style="background:${scoreCol(d.score)};color:${d.score > 55 ? '#fff' : '#1b1d22'}">${d.score}</span></td>
          <td class="num">${sgn(d.pctC)}%<div class="p6-sub">${sgn(d.lo)} to ${sgn(d.hi)}</div></td>
          <td>${d.hot_name && d.gap > 0 ? `<b>+${f1(d.gap)}</b><div class="p6-sub p6-trunc" title="${d.hot_name}">${d.hot_name.split('-')[0]}</div>` : '<span class="p6-sub">leads its neighbors</span>'}</td>
          <td class="num">${money(d.price_now)}</td></tr>`;
      }).join('');
      const funnel = `<div class="p6-funnel"><div><b>${S.ntas.length}</b><span>residential NTAs</span></div><i>→</i><div><b>${scored.length}</b><span>scored (enough sales)</span></div><i>→</i><div><b>${pass.length}</b><span>pass your filters</span></div><i>→</i><div><b>${show.length}</b><span>shown, best score first</span></div></div>`;
      return { map, funnel, table: `<div class="nyc-table-wrap"><table class="nyc-table p6-rank"><thead><tr><th>#</th><th>Neighborhood</th><th>Score</th><th>3 yrs vs city<br><span class="p6-sub">80% range</span></th><th>Gap<br><span class="p6-sub">hottest neighbor</span></th><th>$ / unit</th></tr></thead><tbody>${list || '<tr><td colspan="6">No neighborhood passes every filter. Loosen one.</td></tr>'}</tbody></table></div>` };
    }
    function controls() {
      const nz = (k) => `<label class="p6-ctl"><span>${sl('NOISE_' + k).replace('Noise: ', '')} noise cap <b id="p6-nv-${k}">${F.noise[k] ? F.noise[k] + '×' : 'off'}</b></span><input type="range" min="0" max="5" step="0.25" value="${F.noise[k]}" data-noise="${k}"></label>`;
      return `<div class="p6-ctls">
        <label class="p6-ctl"><span>Duty station</span><select id="p6-wp">${S.workplaces.map((w, i) => `<option value="${i}">${w.name}</option>`).join('')}<option value="-1">Custom (click the map)</option></select></label>
        <label class="p6-ctl"><span>Max straight-line distance <b id="p6-kmv">${F.km ? F.km + ' km' : 'off'}</b></span><input type="range" id="p6-km" min="0" max="40" step="1" value="${F.km}"></label>
        <label class="p6-ctl"><span>Felony trend (${M.crime_base_years.join('–')} → ${M.filter_years.join('–')})</span><select id="p6-crime"><option value="off">off</option><option value="city">not rising faster than the city (${sgn(M.felony_city_chg)}%)</option><option value="flat">not rising at all</option></select></label>
        <label class="p6-ctl"><span>Residents within a 5-min walk of a park <b id="p6-parkv">${F.park ? '≥ ' + F.park + '%' : 'off'}</b></span><input type="range" id="p6-park" min="0" max="100" step="5" value="0"></label>
        <label class="p6-ctl"><span>Price cap per unit (1–3 family) <b id="p6-pricev">off</b></span><input type="range" id="p6-price" min="0" max="${Math.ceil(priceMax / 50000) * 50000}" step="25000" value="0"></label>
        <label class="p6-ctl"><span>Show top <b id="p6-topv">${F.topN}</b></span><input type="range" id="p6-top" min="5" max="50" step="5" value="${F.topN}"></label>
        ${['COM', 'RES', 'STR', 'CON'].map(nz).join('')}
      </div>`;
    }

    // ═════════ §5 worked example ═════════
    function waterfall() {
      const E = S.example, top = [...E.contrib].sort((a, b) => Math.abs(b.c) - Math.abs(a.c));
      const main_ = top.slice(0, 9), rest = top.slice(9);
      const steps_ = [['Average start-year intercept', E.a, 'base']];
      main_.forEach((c) => steps_.push([sl(c.col.replace(/\^2|\[.*|~s\d/, '')) + (/\^2|\[|~/.test(c.col) ? ' (curve)' : ''), c.c, c.col]));
      if (rest.length) steps_.push([`${rest.length} other inputs`, rest.reduce((a, c) => a + c.c, 0), 'rest']);
      steps_.push(['Place effect u', E.u, 'u']);
      let run = 0;
      const bars = steps_.map(([nm, v, k]) => { const a = k === 'base' ? 0 : run; run = k === 'base' ? v : run + v; return { nm, v, k, a, b: run }; });
      const all = bars.flatMap((d) => [d.a, d.b]).concat([0]);
      let lo = Math.min(...all), hi = Math.max(...all); const pad = (hi - lo) * 0.1 + 0.5; lo -= pad; hi += pad;
      const w = 660, l = 220, r = 60, rh = 24, top_ = 8, h = top_ + (bars.length + 1) * rh + 32;
      const x = (v) => l + ((w - l - r) * (v - lo)) / (hi - lo);
      let s = '';
      d3.ticks(lo, hi, 6).forEach((v) => { s += `<line x1="${x(v)}" x2="${x(v)}" y1="${top_}" y2="${top_ + (bars.length + 1) * rh}" stroke="rgba(27,29,34,0.07)"/><text x="${x(v)}" y="${top_ + (bars.length + 1) * rh + 14}" text-anchor="middle">${v === 0 ? '0' : sgn(v, (q) => q.toFixed(hi - lo < 8 ? 1 : 0))}</text>`; });
      s += `<line x1="${x(0)}" x2="${x(0)}" y1="${top_}" y2="${top_ + (bars.length + 1) * rh}" stroke="#1b1d22" stroke-dasharray="3 3"/>`;
      bars.forEach((d, i) => {
        const y = top_ + i * rh;
        const fill = d.k === 'base' ? C.purple : d.k === 'u' ? C_COL : d.k === 'rest' ? NULL_COL : d.v >= 0 ? C.green : C.red;
        const cc = E.contrib.find((c) => c.col === d.k);
        s += `<text x="${l - 8}" y="${y + rh / 2 + 4}" text-anchor="end" style="font-weight:${d.k === 'base' ? 700 : 500}">${d.nm}</text>`;
        s += `<rect x="${Math.min(x(d.a), x(d.b))}" y="${y + 4}" width="${Math.max(1.5, Math.abs(x(d.b) - x(d.a)))}" height="${rh - 8}" rx="2" fill="${fill}" opacity="0.85"${tipAttr(`<b>${d.nm}</b><br>${cc ? `z = ${sgn(cc.z, f2)} SD × weight ${sgn(cc.b, f2)} = ` : ''}${sgn(d.v, f2)} log pts<br>running total ${sgn(d.b, f2)}`)}/>`;
      });
      const yE = top_ + bars.length * rh;
      s += `<text x="${l - 8}" y="${yE + rh / 2 + 4}" text-anchor="end" style="font-weight:700">Prediction</text><rect x="${Math.min(x(0), x(E.pred))}" y="${yE + 4}" width="${Math.abs(x(E.pred) - x(0))}" height="${rh - 8}" rx="2" fill="#1b1d22"/><text x="${Math.max(x(0), x(E.pred)) + 5}" y="${yE + rh / 2 + 4}" style="font-weight:700">${sgn(E.pred)} → score ${E.score}</text>`;
      s += `<text x="${l + (w - l - r) / 2}" y="${h - 4}" text-anchor="middle" style="fill:#5d616b">log points of predicted 3-year appreciation vs the city</text>`;
      return svg(s, w, h);
    }
    function chartHistory() {
      const Hs = S.example.history;
      if (!Hs.length) return '<p class="mdl-cap">This NTA has no test-year rows.</p>';
      const w = 420, h = 200, l = 40, r = 10, t = 14, b = 34;
      const vals = Hs.flatMap((d) => [d.y, d.p]), lo = Math.min(0, ...vals) - 3, hi = Math.max(0, ...vals) + 3;
      const bw = (w - l - r) / Hs.length, Y = (v) => t + (h - t - b) * (1 - (v - lo) / (hi - lo));
      let s = '';
      d3.ticks(lo, hi, 5).forEach((v) => { s += grid(l, w - r, Y(v)) + `<text x="${l - 6}" y="${Y(v) + 4}" text-anchor="end">${sgn(v, (q) => q.toFixed(0))}</text>`; });
      s += `<line x1="${l}" x2="${w - r}" y1="${Y(0)}" y2="${Y(0)}" stroke="#1b1d22"/>`;
      Hs.forEach((d, i) => {
        const x = l + bw * (i + 0.5);
        s += `<rect x="${x - bw * 0.25}" y="${Math.min(Y(d.y), Y(0))}" width="${bw * 0.5}" height="${Math.abs(Y(d.y) - Y(0))}" fill="${NULL_COL}" opacity="0.45"/><circle cx="${x}" cy="${Y(d.p)}" r="6" fill="${C_COL}"${tipAttr(`start ${d.t} → sell ${d.t + M.hold}<br>predicted ${sgn(d.p)} · happened ${sgn(d.y)}`)}/>`;
        s += `<text x="${x}" y="${h - b + 15}" text-anchor="middle">${d.t}→${d.t + M.hold}</text>`;
      });
      return svg(s, w, h) + legend([[NULL_COL, 'what happened'], [C_COL, 'Model C prediction (made before)']]);
    }

    // ═════════ §6 sensitivity ═════════
    function chartSens() {
      const R = S.sensitivity, w = 900, l = 330, mid = 600, r = 10, rh = 26, top = 30, h = top + R.length * rh + 28;
      const rhos = R.flatMap((d) => [d.B.rho, d.C.rho, d.persist.rho]), lo = Math.min(0, ...rhos) - 0.02, hi = Math.max(...rhos) + 0.02;
      const x = (v) => l + ((mid - 30 - l) * (v - lo)) / (hi - lo);
      const gaps = R.map((d) => d.C.coef.GAP).filter(Boolean), gm = Math.max(...gaps.map((c) => Math.max(Math.abs(c.lo), Math.abs(c.hi))), 1);
      const xg = (v) => mid + 120 + ((w - r - mid - 120) * (v + gm)) / (2 * gm);
      let s = `<text x="${l}" y="16" style="font-weight:700">Spearman on held-out years</text><text x="${mid}" y="16" style="font-weight:700">Top 20 beat (C)</text><text x="${mid + 120}" y="16" style="font-weight:700">Gap effect in C (per SD)</text>`;
      s += `<line x1="${xg(0)}" x2="${xg(0)}" y1="${top}" y2="${top + R.length * rh}" stroke="#1b1d22" stroke-dasharray="3 3"/>`;
      R.forEach((d, i) => {
        const y = top + i * rh + rh / 2;
        if (d.key === 'base') s += `<rect x="0" y="${y - rh / 2}" width="${w}" height="${rh}" fill="rgba(0,173,208,0.09)"/>`;
        s += `<text x="${l - 10}" y="${y + 4}" text-anchor="end" style="font-weight:${d.key === 'base' ? 700 : 400}">${d.label}</text>`;
        s += `<line x1="${x(Math.min(d.B.rho, d.C.rho))}" x2="${x(Math.max(d.B.rho, d.C.rho))}" y1="${y}" y2="${y}" stroke="#ccc" stroke-width="2"/>`;
        s += `<text x="${x(d.persist.rho)}" y="${y + 4}" text-anchor="middle" style="fill:${NULL_COL};font-weight:700"${tipAttr('last 3 years continue: ' + f3(d.persist.rho))}>|</text>`;
        [['B', B_COL], ['C', C_COL]].forEach(([m, col]) => { s += `<circle cx="${x(d[m].rho)}" cy="${y}" r="5.5" fill="${col}"${tipAttr(`<b>${d.label}</b><br>Model ${m}: Spearman ${f3(d[m].rho)}, RMSE ${f1(d[m].rmse)}<br>${d.rows.toLocaleString()} NTA-years · test ${d.test_years.join(', ')}`)}/>`; });
        s += `<text x="${mid}" y="${y + 4}">${d.C.top_beat}/${d.C.top_n} <tspan style="fill:#5d616b;font-size:10px">(${sgn(d.C.top_mean)} vs ${sgn(d.C.all_mean)})</tspan></text>`;
        const g = d.C.coef.GAP;
        if (g) s += `<line x1="${xg(g.lo)}" x2="${xg(g.hi)}" y1="${y}" y2="${y}" stroke="${C_COL}" stroke-width="2"/><circle cx="${xg(g.b)}" cy="${y}" r="4.5" fill="${clears(g) ? C_COL : '#fff'}" stroke="${C_COL}" stroke-width="2"${tipAttr(`Gap: ${sgn(g.b, f2)} (${f2(g.lo)} to ${f2(g.hi)})`)}/>`;
      });
      [lo, (lo + hi) / 2, hi].forEach((v) => { s += `<text x="${x(v)}" y="${h - 8}" text-anchor="middle" style="font-size:10px">${v.toFixed(2)}</text>`; });
      return svg(s, w, h) + legend([[B_COL, 'Model B'], [C_COL, 'Model C'], [NULL_COL, '| = last 3 years continue']]);
    }

    // ═════════ §7 sales bootstrap ═════════
    function chartBoot() {
      const D_ = S.bootstrap.draws, cnt = Array(21).fill(0);
      D_.forEach((d) => { cnt[d.top_overlap]++; });
      const w = 460, h = 200, l = 30, r = 10, t = 12, b = 36, mx = Math.max(...cnt), bw = (w - l - r) / 21;
      let s = '';
      cnt.forEach((c, i) => { s += `<rect x="${l + i * bw + 1}" y="${t + (h - t - b) * (1 - c / mx)}" width="${bw - 2}" height="${((h - t - b) * c) / mx}" fill="${C_COL}" opacity="0.75"${tipAttr(`${c} of ${D_.length} redraws keep ${i} of today's top 20`)}/>`; if (i % 2 === 0) s += `<text x="${l + (i + 0.5) * bw}" y="${h - b + 14}" text-anchor="middle">${i}</text>`; });
      s += `<text x="${l + (w - l - r) / 2}" y="${h - 4}" text-anchor="middle" style="fill:#5d616b">how many of today's top 20 are still in the top 20 after redrawing the sales</text>`;
      return svg(s, w, h);
    }

    // ═════════ §8 counterfactual ═════════
    function chartCF() {
      const shared = S.sensitivity.find((d) => d.key === 'shared');
      const items = [
        ['Graded on its own training years', S.counterfactual.insample.C.rho, C.red],
        ['Random 75/25 split, ignores time', S.counterfactual.randsplit.C.rho, C.red],
        ['Momentum shares the base price', shared ? shared.C.rho : null, C.orange],
        ['Honest: rolling held-out years', L.C.rho, C_COL],
        ['Last 3 years continue', L.persist.rho, NULL_COL],
      ].filter((d) => d[1] != null);
      const w = 520, l = 230, r = 50, rh = 32, h = items.length * rh + 26, mx = Math.max(...items.map((d) => d[1])) * 1.1;
      const x = (v) => l + ((w - l - r) * Math.max(v, 0)) / mx;
      let s = '';
      items.forEach(([nm, v, col], i) => { const y = 6 + i * rh; s += `<text x="${l - 8}" y="${y + rh / 2 + 4}" text-anchor="end" style="font-weight:${col === C_COL ? 700 : 400}">${nm}</text><rect x="${l}" y="${y + 7}" width="${x(v) - l}" height="${rh - 14}" rx="3" fill="${col}" opacity="0.85"/><text x="${x(v) + 5}" y="${y + rh / 2 + 4}" style="font-weight:700">${f3(v)}</text>`; });
      s += `<text x="${l}" y="${h - 4}" style="fill:#5d616b;font-size:10px">Model C, Spearman rank correlation</text>`;
      return svg(s, w, h);
    }

    // ═════════ text that depends on results ═════════
    const cb = CO.C, bb = CO.B;
    const clearList = (m) => Object.entries(CO[m]).filter(([k, c]) => !/[\^\[~]/.test(k) && clears(c)).map(([k, c]) => `${sl(k).toLowerCase()} ${sgn(c.b)}`);
    const gR = S.gap.runs;
    const gapClear = clears(cb.GAP);
    const boot = S.bootstrap.draws, ov = boot.map((d) => d.top_overlap).sort((a, b) => a - b), rhoC = boot.map((d) => d.rhoC);
    const medOv = ov[Math.floor(ov.length / 2)];
    const sens = S.sensitivity;
    const cBeats = sens.filter((d) => d.C.rho > d.B.rho).length;
    const beatPersist = sens.filter((d) => d.C.rho > d.persist.rho).length;
    const gapPos = sens.filter((d) => d.C.coef.GAP && d.C.coef.GAP.b > 0).length, gapClearN = sens.filter((d) => d.C.coef.GAP && clears(d.C.coef.GAP)).length, gapN = sens.filter((d) => d.C.coef.GAP).length;
    const ex = S.example, exN = NT[ex.code];
    const formLabel = { linear: 'straight line', sq: 'squared term', bins: 'four levels (<1×, 1–2×, 2–3×, 3×+)', spline: 'spline (4 knots)' };
    const peakTxt = Object.entries(S.curves).filter(([, c]) => c.peak).map(([k, c]) => `${sl(k).replace('Noise: ', '').toLowerCase()} noise helps up to ~${c.peak}× the city rate, then hurts (${Math.round(100 * c.share_above_peak)}% of NTA-years are past it)`);

    main.innerHTML = `
    <header class="nyc-hero">
      <div class="nyc-eyebrow">Part 6 · Rising Neighborhood Score · built from the change log</div>
      <h1 class="nyc-title">For an officer on PCS orders: where will a home bought now beat the city by the time you sell?</h1>
      <p class="nyc-lede">The question is now <strong>which neighborhoods are good places to live and likely to see home values beat the city's over a 3-year tour</strong>. The outcome is a <strong>number</strong> (3-year price change minus the city's), not a 0/1 "tipped" label. The unit is the neighborhood (NTA). Models B and C are now <strong>linear regressions</strong>, and the prediction becomes a <strong>0–100 score</strong>. Livability <strong>filters</strong> (commute, crime, parks, price, noise) are applied after scoring. <a href="#" onclick="openNycModelsSignals();return false;">Part 5</a> is the tipping model this replaces.</p>
      <div class="nyc-stats">
        <div class="nyc-stat"><div class="nyc-stat-num">${M.n_now}</div><div class="nyc-stat-label">neighborhoods (NTAs) scored for ${M.now_t}</div></div>
        <div class="nyc-stat"><div class="nyc-stat-num">${M.n_sales_fam.toLocaleString()}</div><div class="nyc-stat-label">1–3 family home sales, ${M.sale_years[0]}–${M.sale_years[1]}</div></div>
        <div class="nyc-stat"><div class="nyc-stat-num">${f2(L.C.rho)}</div><div class="nyc-stat-label">Model C rank correlation on years it never saw (last 3 years continue: ${f2(L.persist.rho)})</div></div>
        <div class="nyc-stat"><div class="nyc-stat-num">${L.C.top_beat}/${L.C.top_n}</div><div class="nyc-stat-label">of C's top 20 beat the city, ${T[0]}–${T[T.length - 1]} starts (random ≈ ${Math.round(L.C.random_beat)})</div></div>
      </div>
    </header>

    <div class="p5-road">
      ${[['p6-change', 'What changed', 'the 15 items'], ['p6-out', 'Outcome', 'timing, price, coverage'], ['p6-in', 'Inputs', 'where each comes from'], ['p6-choice', 'Choices tested', 'permits, noise, Gap'], ['p6-fit', 'B vs C', 'held-out years'], ['p6-score', 'The score', 'rank, then filter'], ['p6-sens', 'Sensitivity', 'one change at a time'], ['p6-noise', 'Data noise', 'redraw the sales'], ['p6-cf', 'If done differently', 'shortcuts'], ['p6-verdict', 'Verdict', 'scorecard + limits']]
        .map(([id, a, b], i) => `<button type="button" onclick="document.getElementById('${id}').scrollIntoView({behavior:'smooth'})"><i>${i}</i><b>${a}</b><span>${b}</span></button>`).join('')}
    </div>

    <!-- ═════════ 0. CHANGES ═════════ -->
    <h2 class="mdl-section bc" id="p6-change">0 · What changed from Part 5, item by item</h2>
    <section class="nyc-panel">
      <div class="nyc-kicker">rising-neighborhood-score-change-log.md → this page</div>
      <div class="p6-changes">${CHANGES.map(([n, t, d, where]) => `<div><i>${n}</i><b>${t}</b><span>${d}</span><a href="#" onclick="document.getElementById('${where}').scrollIntoView({behavior:'smooth'});return false;">see it →</a></div>`).join('')}</div>
    </section>
    <section class="nyc-panel">
      <div class="nyc-kicker">Choices the change log left open</div><h2>Decisions I made, and why</h2>
      <div class="p5-cf">${MYCHOICES.map(([a, b]) => `<div><i>Choice</i><b>${a}</b><span>${b}</span></div>`).join('')}</div>
    </section>

    <!-- ═════════ 1. OUTCOME ═════════ -->
    <h2 class="mdl-section a" id="p6-out">1 · The outcome: will prices here beat the city's over 3 years?</h2>
    <section class="nyc-panel"><div class="nyc-kicker">Item 1 · timing</div><h2>Nothing the model sees overlaps what it predicts</h2>
      ${chartTimeline()}
      <p class="mdl-cap"><b>Part 5's problem:</b> an ACS 5-year release averages 5 survey years, so its "2016" tipping used 2012–16 answers. A 2015 signal sat inside that window, and own momentum (the 2011–15 release) shared 4 of its 5 survey years with the outcome. Momentum "predicted" tipping partly because both numbers came from the same survey answers. <b>Now:</b> every input closes by t−2 (left of the red line), the price the outcome starts from uses sales in t−1 and t, and the price it ends at uses t+2 and t+3. The ACS release ending t−2 is an input only, never part of the outcome.</p>
    </section>
    <div class="nyc-row">
      <section class="nyc-panel"><div class="nyc-kicker">Item 4 · the price</div><h2>Median price per unit, one neighborhood vs the city</h2>
        <label class="p6-ctl inline"><span>Neighborhood</span><select id="p6-price-sel">${[...scored].sort((a, b) => a.name.localeCompare(b.name)).map((d) => `<option value="${d.code}"${d.code === ex.code ? ' selected' : ''}>${d.name} (${d.boro})</option>`).join('')}</select></label>
        <div id="p6-price">${chartPrice(ex.code)}</div>${real}
        <p class="mdl-cap"><b>The outcome</b> for start year t is the gap between the orange line's 3-year change and the black line's, in log points (≈ %): <code>y = log(P[t+3] ÷ P[t]) − log(City[t+3] ÷ City[t])</code>. P = median sale price ÷ residential units for 1–3 family homes, sales ≥ $10,000 (drops $0 family transfers), two calendar years pooled so there are enough sales. A neighborhood needs ${M.min_sales}+ sales in a window to get a price at all. Gaps in a line mean it fell short.</p>
      </section>
      <section class="nyc-panel"><div class="nyc-kicker">Item 4 · what the model predicts</div><h2>A number, not a yes / no</h2>
        ${chartOutcomeHist()}${real}
        <p class="mdl-cap">${M.n_rows.toLocaleString()} NTA-years (start years ${tr0}–${M.last_t}). Spread: SD ${f1(S.outcome.sd)} log pts; ${Math.round(100 * S.outcome.share_pos)}% beat the city. There is no "event" or at-risk set, and no neighborhood leaves the data after something happens. Every NTA with enough sales is in every year. <b>Caveat:</b> a median moves with the mix of homes sold (more renovated brownstones one year, more fixer-uppers the next). A repeat-sales index would fix that and is the main upgrade to make later.</p>
      </section>
    </div>
    <div class="nyc-row">
      <section class="nyc-panel"><div class="nyc-kicker">Items 9–10 · unit and coverage</div><h2>${M.n_now} of ${M.n_ntas} neighborhoods have enough sales to score</h2>
        <div class="mdl-narrow">${chartCoverage()}</div>${real}
      </section>
      <section class="nyc-panel"><div class="nyc-kicker">Why NTAs, and where they fall short</div><h2>Bigger areas, steadier prices</h2>
        <ul class="p6-list">
          <li><b>Neighborhood Tabulation Areas</b> (2010 lines) replace census tracts. A tract has too few home sales to give a stable median; an NTA averages ~${Math.round(M.n_sales_fam / M.n_ntas / (M.sale_years[1] - M.sale_years[0] + 1))} 1–3 family sales a year. The names are ones people recognize.</li>
          <li><b>Every input is aggregated up.</b> Counts (permits, felonies, complaints, sales, households) are summed over the NTA's tracts. ACS medians are household-weighted averages. Neighbors and the CAR structure were rebuilt from NTA borders.</li>
          <li><b>No low-income restriction.</b> The question is about appreciation for buyers anywhere, so all NTAs are in. Affordability became a filter (§5).</li>
          <li><b>Coverage by borough</b> (scored / all): ${Object.entries(M.covered_boro).map(([b, [a, n]]) => `${b} ${a}/${n}`).join(' · ')}. <b>Manhattan is mostly missing:</b> it has few 1–3 family homes; almost everything sells as a condo or co-op. §6 reruns with condos added to see what that changes.</li>
          <li><b>Sales extended</b> to ${M.sale_years[0]}–${M.sale_years[1]} (DOF annualized files; ${Math.round(100 * M.sale_match)}% of residential sales ≥ $10k land in an NTA via PLUTO tax lots). Permits now combine DOB BIS and DOB NOW (new-building filings moved to DOB NOW in 2021); 311 joins the 2010–19 and 2020+ datasets.</li>
        </ul>
      </section>
    </div>

    <!-- ═════════ 2. INPUTS ═════════ -->
    <h2 class="mdl-section b" id="p6-in">2 · Inputs: where every number comes from</h2>
    <section class="nyc-panel">
      <div class="nyc-kicker">Variable dictionary</div>
      <p class="mdl-cap" style="margin-top:0">Each card: the source dataset, the raw field, how it becomes a model input, when it is measured relative to start year t, its distribution across NTA-years, and its effect in each model (log points of 3-year appreciation vs the city per 1 SD more; ● = the 95% interval clears 0). Inputs are z-scored on the training rows, so effects compare across units. Grayed cards were tested in §3 and not kept.</p>
      <div class="mdl-toggle" id="p6-fam">${[['all', 'All']].concat(Object.entries(S.families)).map(([k, v], i) => `<button type="button" data-f="${k}" class="${i === 0 ? 'on' : ''}" style="--c:${famCol[k] || '#1b1d22'}">${v}</button>`).join('')}</div>
      <div id="p6-cards">${varCards('all')}</div>
    </section>

    <!-- ═════════ 3. CHOICES ═════════ -->
    <h2 class="mdl-section c" id="p6-choice">3 · Choices tested on ${M.val_years.join('–')} (items 12–15)</h2>
    <section class="nyc-panel">
      <div class="nyc-kicker">The rule</div>
      <p class="mdl-cap" style="margin-top:0">Every choice below is made on the validation start years ${M.val_years.join(' and ')} only, each scored by a model trained on start years finished by then. The test years ${T[0]}–${T[T.length - 1]} are not looked at until §4. A more complex option is kept only if it lowers Model C's validation RMSE by more than 0.5%. First, the two tuning knobs: ridge shrinkage <b>λ = ${CH.ridge.pick}</b> (tried ${Object.keys(CH.ridge.cv).join(', ')}) and spatial strength <b>τ = ${CH.tau.pick}</b> with CAR mix <b>ρ = ${CH.tau.rho}</b> (tried τ ${[...new Set(CH.tau.cv.map((d) => d.tau))].join(', ')} × ρ ${[...new Set(CH.tau.cv.map((d) => d.rho))].join(', ')}).</p>
    </section>
    <div class="nyc-row">
      <section class="nyc-panel"><div class="nyc-kicker">Item 12 · permits</div><h2>New buildings and demolitions: one input or two?</h2>
        ${rmseBars(CH.constr.res, ['combined', 'separate'], { combined: 'Combined (NB + DM)', separate: 'Separate NB, DM' }, CH.constr.pick)}
        ${chartSigns()}${real}
        <p class="mdl-cap">New-building and demolition permits correlate at <b>r = ${f2(CH.constr.corr_nb_dm)}</b> across NTA-years (tear down → build). VIF with both in: new buildings ${CH.vif.separate.NB}, demolitions ${CH.vif.separate.DM}; combined: ${CH.vif.combined.CONSTR}. The dots show each permit effect refit on six growing training windows. Kept: <b>${CH.constr.pick}</b>. ${CH.constr.pick === 'combined' ? 'One input, so the model cannot split the credit with opposite signs as Part 5\'s C did (neighbors\' demolitions 1.37×, new buildings pushing down).' : 'The separate inputs predicted better on the validation years.'} With a price outcome the sign can go either way (more supply slows prices; new development signals demand). The data sets it.</p>
      </section>
      <section class="nyc-panel"><div class="nyc-kicker">Item 13 · 311 noise</div><h2>One noise total, or four kinds?</h2>
        ${rmseBars(CH.noise.res, ['combined', 'split'], { combined: 'One total', split: 'Four kinds' }, CH.noise.pick)}${real}
        <p class="mdl-cap">311 noise counts complaints, not loudness, and mixes three different things: nightlife (an amenity, a demand signal), construction (a development signal, overlapping item 12) and new residents who call 311 more. Split into Residential/party, Commercial (bars, clubs, music), Street/Sidewalk and Construction (after-hours work, jackhammering). Each is relative to the city rate for that year. Kept: <b>${CH.noise.pick === 'split' ? 'four kinds' : 'one total'}</b>.</p>
        <div class="nyc-kicker" style="margin-top:1rem">Collinearity check (VIF, all inputs, separate permits)</div>
        <div class="p6-vif">${Object.entries(CH.vif.separate).map(([k, v]) => `<span class="${v > 5 ? 'hi' : v > 2.5 ? 'mid' : ''}"${tipAttr(`VIF ${v}: the variance of this effect is ${v}× what it would be if the input were uncorrelated with the others`)}>${sl(k)} <b>${v}</b></span>`).join('')}</div>
        <p class="mdl-cap">VIF above 5 (dark) means an input is largely predictable from the others, and its own effect is hard to pin down. The ridge penalty (λ = ${CH.ridge.pick}) is there for that.</p>
      </section>
    </div>
    <div class="nyc-row p5-wide">
      <section class="nyc-panel"><div class="nyc-kicker">Item 14 · noise threshold, in the model</div><h2>Does noise help up to a point, then hurt?</h2>
        <div class="mdl-toggle" id="p6-curve-t">${Object.keys(S.curves).map((k, i) => `<button type="button" data-k="${k}" class="${i === 1 || Object.keys(S.curves).length === 1 ? 'on' : ''}" style="--c:${KIND_COL[k.slice(6)] || '#d4a106'}">${sl(k).replace('Noise: ', '')}</button>`).join('')}</div>
        <div id="p6-curve">${chartCurve(Object.keys(S.curves)[Object.keys(S.curves).length > 1 ? 1 : 0])}</div>${real}
        <p class="mdl-cap">Each curve is the noise input's push on predicted appreciation in the final Model C, everything else held at its average, zeroed at the city rate. Shape kept: <b>${formLabel[CH.form.pick]}</b>. ${peakTxt.length ? peakTxt.join('; ') + '.' : CH.form.pick === 'linear' ? 'No shape beat the straight line by the 0.5% rule, so no turning point is claimed.' : 'No curve turns over inside the observed range.'}</p>
      </section>
      <section class="nyc-panel"><div class="nyc-kicker">Shapes tried</div><h2>Straight, squared, binned, spline</h2>
        ${rmseBars(CH.form.res, ['linear', 'sq', 'bins', 'spline'], { linear: 'Straight line', sq: 'Squared term', bins: 'Bins <1, 1–2, 2–3, 3×+', spline: 'Spline, 4 knots' }, CH.form.pick)}
        <p class="mdl-cap"><b>And in the filters:</b> what counts as "too loud" depends on who is moving (a family vs a single lieutenant), so it is not learned from the data. §5 has an officer-set cap for each noise kind, relative to the city, off by default.</p>
      </section>
    </div>
    <div class="nyc-row">
      <section class="nyc-panel"><div class="nyc-kicker">Item 15 · the raw pattern first</div><h2>Do areas next to a hot neighbor catch up?</h2>
        ${chartGapBins()}${real}
        <p class="mdl-cap">NTA-years split into fifths by Gap (hottest qualifying neighbor's momentum − own momentum), then the average outcome in each fifth, with ±2 SE. No model yet. If spread runs from the hot side (Williamsburg → Bushwick), the bars should rise left to right. Some of any rise is plain mean reversion: a large Gap often means this NTA's own momentum is low.</p>
      </section>
      <section class="nyc-panel"><div class="nyc-kicker">Item 15 · in Model C, beside the neighbor average</div><h2>Gap: ${sgn(cb.GAP.b, f2)} per SD ${gapClear ? '(clears 0)' : '(crosses 0)'}</h2>
        <div class="nyc-table-wrap"><table class="nyc-table"><thead><tr><th>Version</th><th>Effect per SD (95% CI)</th><th>Test Spearman</th><th>Test RMSE</th></tr></thead><tbody>
          <tr><td>No Gap (neighbor average only)</td><td class="num">–</td><td class="num">${f3(gR.none.test.rho)}</td><td class="num">${f1(gR.none.test.rmse)}</td></tr>
          <tr class="p6-hl"><td><b>Gap = hottest neighbor − own</b> (used)</td><td class="num">${sgn(gR.max.b, f2)} (${f2(gR.max.lo)}, ${f2(gR.max.hi)})</td><td class="num">${f3(gR.max.test.rho)}</td><td class="num">${f1(gR.max.test.rmse)}</td></tr>
          <tr><td>2nd-hottest neighbor − own</td><td class="num">${sgn(gR.second.b, f2)} (${f2(gR.second.lo)}, ${f2(gR.second.hi)})</td><td class="num">${f3(gR.second.test.rho)}</td><td class="num">${f1(gR.second.test.rmse)}</td></tr>
          <tr><td>Share of neighbors beating the city by 5%+</td><td class="num">${sgn(gR.share.b, f2)} (${f2(gR.share.lo)}, ${f2(gR.share.hi)})</td><td class="num">${f3(gR.share.test.rho)}</td><td class="num">${f1(gR.share.test.rmse)}</td></tr>
        </tbody></table></div>
        <p class="mdl-cap"><b>Why Gap and not Max:</b> with own momentum in the model, Gap = Max − Own carries the same information, so predictions are identical. Gap reads directly as "how far ahead the area next door is." <b>Noise guard:</b> only neighbors with ${M.min_sales}+ sales count, so one thin neighbor cannot set the max. The 2nd-hottest row checks that one neighbor isn't driving it; the share row checks that the conclusion doesn't depend on Gap's exact form. Neighbors' average momentum in C: ${sgn(cb.NBMOM.b, f2)} (${f2(cb.NBMOM.lo)} to ${f2(cb.NBMOM.hi)}).</p>
      </section>
    </div>

    <!-- ═════════ 4. B vs C ═════════ -->
    <h2 class="mdl-section bc" id="p6-fit">4 · Model B vs Model C on years they never saw</h2>
    <section class="nyc-panel">
      <div class="nyc-kicker">Items 5 and 7 · the two models</div>
      <div class="mdl-eq"><span class="fe">y<sub>i,t</sub></span> = <span class="fe">a<sub>t</sub></span> + <span class="c">β · levels<sub>i,t−2</sub></span> + <span class="c">γ · momentum<sub>i</sub></span> + <span class="x">δ · signals<sub>i,t−3..t−2</sub></span> <span class="sp">+ λ · neighbors' momentum + θ · Gap + u<sub>i</sub></span> + ε</div>
      <div class="mdl-eq-key"><span><i class="fe"></i>a<sub>t</sub>: one intercept per start year (replaces α_t); absorbs citywide shocks</span><span><i class="c"></i>levels and momentum: where the NTA starts, and its own last 3-year run vs the city</span><span><i class="x"></i>signals: permits, sales volume, felonies, 311 noise by kind, subway distance</span><span><i class="sp"></i>teal = Model C only: neighbors, Gap, and the CAR place effect u<sub>i</sub> (τ = ${CH.tau.pick}, ρ = ${CH.tau.rho})</span></div>
      <p class="mdl-cap">Both are linear regressions on the same rows. B is fit by least squares with a ridge penalty λ = ${CH.ridge.pick} on everything except the intercepts. C is fit as the posterior mode of a Gaussian model with a Leroux CAR prior on u (penalized least squares): u is pulled toward its neighbors' average with weight ρ and toward 0 with weight 1 − ρ. <b>Disclosure:</b> the first run used a pure ICAR (ρ = 1). On the test years, that C ranked far worse than the same model without u (Spearman −0.02 vs 0.11), because a pure ICAR leaves borough-wide patterns in u almost unpenalized. I switched to the Leroux CAR <em>after</em> seeing that test result, so this one choice was not made blind. τ and ρ were then picked on the validation years as before. τ landed at the top of its grid (${CH.tau.pick}): the validation years wanted the place effect shrunk almost to zero (u ranges ${f2(Math.min(...scored.map((d) => d.u)))} to ${f2(Math.max(...scored.map((d) => d.u)))} log pts), so in practice <b>C ≈ B + neighbors' momentum + Gap</b>. Intervals are <b>clustered by NTA</b>: consecutive start years share sale years, so one neighborhood's rows are not independent. <b>Test:</b> each start year ${T[0]}–${T[T.length - 1]} is predicted by a model trained only on start years whose 3-year outcome had finished (t′ ≤ t−3), the way it would have been used in real time. The ${T[1]}–${T[T.length - 1]} starts run through COVID and the rate spike, which makes this a hard test.</p>
    </section>
    <section class="nyc-panel"><div class="nyc-kicker">Graph 1 · start simple, then add (item 5)</div><h2>What each step adds</h2>
      ${chartLadder()}${real}
      <p class="mdl-cap"><b>Spearman</b> = does the ranking hold up (1 = perfect order, 0 = random), averaged over the test years. <b>Typical miss within a year</b> = RMSE after removing each start year's average miss, so it measures how well the model sizes neighborhoods <em>against each other</em>. "Everyone matches the city" predicts 0 for all, so it has no ranking. <b>The level is a different story:</b> raw RMSE is ${f1(L.zero.rmse)} for "everyone matches the city" and ${f1(L.C.rmse)} for C. In the test years the average neighborhood lagged the city by ${f1(-L.zero.bias)} pts, while the start-year intercepts the models carry forward come from earlier start years (${tr0}–${T[T.length - 1] - M.hold}), most of which had the average neighborhood beating it. Nothing in the inputs can see a citywide swing like that coming, so the % should be read as relative to other neighborhoods, not as a forecast of the citywide level. "Last 3 years continue" is the baseline from item 7: each NTA's own momentum, carried forward. C − B: Spearman ${sgn(S.gap_ci.rho[0], f3)} (95% CI ${f3(S.gap_ci.rho[1])} to ${f3(S.gap_ci.rho[2])}), RMSE ${sgn(S.gap_ci.rmse[0], f2)} (${f2(S.gap_ci.rmse[1])} to ${f2(S.gap_ci.rmse[2])}), resampling whole NTAs.</p>
    </section>
    <div class="nyc-row">
      <section class="nyc-panel"><div class="nyc-kicker">Graph 2 · year by year</div><h2>Ranking quality for each start year</h2>${chartPerYear()}${real}</section>
      <section class="nyc-panel"><div class="nyc-kicker">Graph 3 · the practical test (item 7)</div><h2>Buy in the top 20: did it pay?</h2>${chartTop()}${real}</section>
    </div>
    <div class="nyc-row p5-wide">
      <section class="nyc-panel"><div class="nyc-kicker">Graph 4 · what each input does (final fit, ${tr0}–${M.last_t})</div><h2>Effects in log points per 1 SD</h2>
        ${chartForest()}${real}
        <p class="mdl-cap"><b>How to read:</b> right of the dashed line = more of this input → faster appreciation vs the city over the next 3 years. Filled = the 95% interval (clustered by NTA) clears 0. Clear in B: ${clearList('B').join(', ') || 'none'}. Clear in C: ${clearList('C').join(', ') || 'none'}.</p>
      </section>
      <section class="nyc-panel"><div class="nyc-kicker">Graph 5 · predicted vs what happened</div><h2>Every test NTA-year</h2>
        <div class="mdl-toggle" id="p6-sc-t"><button type="button" data-m="C" class="on" style="--c:${C_COL}">Model C</button><button type="button" data-m="B" style="--c:${B_COL}">Model B</button></div>
        <div id="p6-sc">${chartScatter('C')}</div>
        <p class="mdl-cap">On the dashed line = predicted exactly. The predictions spread over a much narrower range than what happened (outcomes clipped at ±60): the model is cautious, which ridge shrinkage and weak inputs both cause. A cloud that tilts up to the right means the ranking carries some information even when the sizes are off.</p>
      </section>
    </div>
    <div class="nyc-row">
      <section class="nyc-panel"><div class="nyc-kicker">Graph 6 · errors on the map (item 7)</div><h2>Do misses cluster? Moran's I</h2>
        <div class="nyc-table-wrap"><table class="nyc-table"><thead><tr><th></th><th>Moran's I of test errors</th><th>p</th><th>chance band</th></tr></thead><tbody>
          <tr><td style="color:${B_COL};font-weight:700">Model B</td><td class="num">${S.moran.B[0]}</td><td class="num">${S.moran.B[1]}</td><td class="num">${S.moran.B[2]} to ${S.moran.B[3]}</td></tr>
          <tr><td style="color:${C_COL};font-weight:700">Model C</td><td class="num">${S.moran.C[0]}</td><td class="num">${S.moran.C[1]}</td><td class="num">${S.moran.C[2]} to ${S.moran.C[3]}</td></tr>
        </tbody></table></div>
        <p class="mdl-cap">Each NTA's average test error, compared with its neighbors'. Positive I with small p = whole patches missed together, so a model that treats NTAs as independent is too confident. ${S.moran.B[1] < 0.05 && S.moran.C[1] >= 0.05 ? "B's errors cluster and C's don't." : S.moran.B[1] < 0.05 && S.moran.C[1] < 0.05 ? 'Both models leave clustered errors; C reduces but does not remove them.' : "Neither model's errors cluster clearly."}</p>
      </section>
      <section class="nyc-panel"><div class="nyc-kicker">Pros and cons</div><h2>B or C?</h2>
        <div class="nyc-row tight">
          <div><div class="mdl-maphead" style="--c:${B_COL}">Model B · linear regression</div>${proscons(['Plain least squares; every coefficient reads in log points', `Spearman ${f2(L.B.rho)} on held-out years`, 'Fewer terms, less to go wrong with thin data'], ['Can\'t see the hot side next door', `Errors ${S.moran.B[1] < 0.05 ? 'cluster' : 'may cluster'} on the map (I = ${S.moran.B[0]})`])}</div>
          <div><div class="mdl-maphead" style="--c:${C_COL}">Model C · spatial</div>${proscons(['Sees spread: neighbor average + Gap', 'CAR u corrects for unmeasured local factors', `Spearman ${f2(L.C.rho)} on held-out years`], ['More terms; harder to explain', `The data shrank u to ~0 (τ = ${CH.tau.pick}): no lasting local effect beyond the inputs`, 'Posterior mode here, not a full Bayesian fit'])}</div>
        </div>
      </section>
    </div>

    <!-- ═════════ 5. SCORE ═════════ -->
    <h2 class="mdl-section c" id="p6-score">5 · The Rising Neighborhood Score: score, rank, then filter</h2>
    <section class="nyc-panel">
      <div class="nyc-kicker">Items 6 and 11 · for an officer buying now</div>
      <p class="mdl-cap" style="margin-top:0"><b>Score</b> = the percentile rank (0–100) of Model C's predicted 3-year appreciation vs the city, among the ${M.n_now} NTAs scored for start year ${M.now_t} (base price = ${M.now_t - 1}–${M.now_t} sales; inputs through ${M.now_t - 2}; the prediction is for ${M.now_t} → ${M.now_t + M.hold}). The weights were learned from ${tr0}–${M.last_t}, not set by hand. The % is the prediction itself; the range is where 80% of Model C's held-out misses fell (${sgn(pct(S.band.q10))}% to ${sgn(pct(S.band.q90))}% around the prediction). <b>The filters are not in the model.</b> They measure current conditions (${M.filter_years.join('–')}) and only hide neighborhoods. Pick a duty station or click the map to set your own.</p>
      ${controls()}
      <div id="p6-funnel"></div>
    </section>
    <div class="nyc-row p6-scorerow">
      <section class="nyc-panel"><div class="nyc-kicker">Map · darker = higher score · gray = filtered out · numbers = your list</div><div id="p6-map"></div>${real}</section>
      <section class="nyc-panel"><div class="nyc-kicker">Your ranked list</div><div id="p6-list"></div>
        <p class="mdl-cap"><b>Hottest neighbor</b> is the Gap in words: the qualifying neighbor with the highest 3-year momentum and how many log points ahead of this one it is. Price is the ${M.now_t - 1}–${M.now_t} median per unit for 1–3 family homes. Distance is straight-line from the neighborhood's population center, not a commute time.</p>
      </section>
    </div>
    <div class="nyc-row">
      <section class="nyc-panel"><div class="nyc-kicker">Worked example · ${ex.name}</div><h2>From inputs to a score of ${ex.score}</h2>
        ${waterfall()}${real}
        <p class="mdl-cap">Model C for ${ex.name}, start year ${M.now_t}. Each bar is one input's push: (its value minus the training average, in SDs) × its weight. They add up to the prediction, ${sgn(ex.pred)} log pts (${sgn(pct(ex.pred))}% vs the city), which ranks it ${ex.score} out of 100.${ex.hot_name ? ` Its hottest neighbor is ${ex.hot_name}${exN && exN.gap != null ? `, ${sgn(exN.gap)} pts ahead` : ''}.` : ''}</p>
      </section>
      <section class="nyc-panel"><div class="nyc-kicker">Did it work here before?</div><h2>${ex.name}: predicted vs actual</h2>
        ${chartHistory()}${real}
        <p class="mdl-cap">Each prediction was made with a model that had seen only the start years finished by then.</p>
      </section>
    </div>

    <!-- ═════════ 6. SENSITIVITY ═════════ -->
    <h2 class="mdl-section b" id="p6-sens">6 · Sensitivity analysis: change one choice, refit, see what moves</h2>
    <section class="nyc-panel">
      ${chartSens()}${real}
      <p class="mdl-cap"><b>How to read:</b> each row is the whole pipeline rerun with one change (shaded row = as built): rows rebuilt, both models refit, scored on the same rolling held-out years (hold 5 can only test ${sens.find((d) => d.key === 'hold5') ? sens.find((d) => d.key === 'hold5').test_years.join(', ') : '–'}). C ranks better than B in <b>${cBeats} of ${sens.length}</b> setups and beats "last 3 years continue" in <b>${beatPersist} of ${sens.length}</b>. The Gap effect is positive in ${gapPos} of ${gapN} and clears 0 in ${gapClearN} of ${gapN}.</p>
    </section>

    <!-- ═════════ 7. DATA NOISE ═════════ -->
    <h2 class="mdl-section a" id="p6-noise">7 · What changes in the data do to everything else</h2>
    <div class="nyc-row p5-stack">
      <section class="nyc-panel"><div class="nyc-kicker">Change the data · redraw the sales</div><h2>Resample every neighborhood's sales ${boot.length} times</h2>
        ${chartBoot()}${real}
        <p class="mdl-cap">The outcome is now built from sales, not survey estimates, so the noise check redraws the sales: within each NTA and year, sample the same number of sales with replacement, then rebuild every price, outcome, momentum and Gap and refit Model C. This is Part 5's margin-of-error Monte Carlo adapted to a sales-based outcome.</p>
      </section>
      <section class="nyc-panel"><div class="nyc-kicker">What moved</div><h2>The chain reaction, in numbers</h2>
        <ol class="mdl-steps">
          <li><b>Outcomes</b><span>${f1(100 * Math.min(...S.bootstrap.sign_flip))}–${f1(100 * Math.max(...S.bootstrap.sign_flip))}% of NTA-years switch between beating and lagging the city (Part 5's 0/1 label: ~23% of tracts flipped).</span></li>
          <li><b>Scores</b><span>A neighborhood's score moves by ${S.bootstrap.median_score_sd} points (median SD across redraws).</span></li>
          <li><b>Top 20</b><span>${ov[0]}–${ov[ov.length - 1]} of today's top 20 stay in it (median ${medOv}).</span></li>
          <li><b>Ranking quality</b><span>Held-out Spearman for C ${f2(Math.min(...rhoC))}–${f2(Math.max(...rhoC))}; C beats B in ${boot.filter((d) => d.rhoC > d.rhoB).length} of ${boot.length} redraws.</span></li>
          <li><b>Gap effect</b><span>${sgn(Math.min(...boot.map((d) => d.gap_b)), f2)} to ${sgn(Math.max(...boot.map((d) => d.gap_b)), f2)} per SD across redraws.</span></li>
        </ol>
      </section>
    </div>

    <!-- ═════════ 8. COUNTERFACTUAL ═════════ -->
    <h2 class="mdl-section c" id="p6-cf">8 · If I had done it differently</h2>
    <div class="nyc-row">
      <section class="nyc-panel"><div class="nyc-kicker">Same data, different shortcuts</div><h2>How good would the model have <em>looked</em>?</h2>${chartCF()}${real}</section>
      <section class="nyc-panel"><div class="nyc-kicker">Decision by decision</div><h2>What I did, the alternative, what it would have changed</h2>
        <div class="p5-cf">
          <div><i>Test</i><b>Rolling held-out years</b><span>Graded on its own training rows, C's Spearman is ${f3(S.counterfactual.insample.C.rho)} instead of ${f3(L.C.rho)}. A random 75/25 split that mixes years gives ${f3(S.counterfactual.randsplit.C.rho)}: neighbors in time share sale years, so it partly grades the answer key.</span></div>
          <div><i>Timing</i><b>Momentum ends at t−2</b><span>${(() => { const sh = sens.find((d) => d.key === 'shared'); return sh ? `Letting momentum end at the outcome's own base price gives C ${f3(sh.C.rho)} (vs ${f3(L.C.rho)}) and momentum ${sgn(sh.C.coef.MOM.b, f2)} per SD (vs ${sgn(cb.MOM.b, f2)}). It is not a leak (those sales are known by year t), and it ranks better. But any noise in that shared median shows up with opposite signs in momentum and outcome: a median that came in high by chance looks like "hot momentum" and then "falls back." That reversal is real in the data but not in any one house an officer buys, so the honest version keeps the 1-year gap the change log asked for (item 1) and reports this as the cost.` : ''; })()}</span></div>
          <div><i>Outcome</i><b>Continuous, not 0/1</b><span>A yes/no "beat the city" would throw away how much. Under redrawn sales ~${f1(100 * S.bootstrap.sign_flip.reduce((a, b) => a + b, 0) / S.bootstrap.sign_flip.length)}% of NTA-years switch sign, but the continuous value only moves a little.</span></div>
          <div><i>Unit</i><b>NTAs, not tracts</b><span>At tract level most medians would rest on a handful of sales. NTAs trade spatial detail for prices that mean something.</span></div>
          <div><i>Filters</i><b>After scoring, not inside</b><span>Commute, parks and a noise cap are preferences, not causes of price growth. Put in the model, they would get weights learned from prices, and a family's cap would be overridden by what the market paid for.</span></div>
        </div>
      </section>
    </div>

    <!-- ═════════ VERDICT ═════════ -->
    <h2 class="mdl-section bc" id="p6-verdict">Verdict: two models, final scorecard</h2>
    <section class="nyc-panel">
      <div class="nyc-table-wrap"><table class="nyc-table p5-score"><thead><tr><th>Test (${T[0]}–${T[T.length - 1]} start years)</th><th>Last 3 yrs continue</th><th style="color:${B_COL}">Model B</th><th style="color:${C_COL}">Model C</th><th>Edge</th></tr></thead><tbody>
        <tr><td>Spearman rank correlation</td><td class="num">${f3(L.persist.rho)}</td><td class="num">${f3(L.B.rho)}</td><td class="num">${f3(L.C.rho)}</td><td>${S.gap_ci.rho[1] > 0 ? 'C' : S.gap_ci.rho[2] < 0 ? 'B' : L.C.rho >= L.B.rho ? 'C, not significant' : 'B, not significant'}</td></tr>
        <tr><td>Typical miss within a year ("everyone = city": ${f1(L.zero.rmse_within)})</td><td class="num">${f1(L.persist.rmse_within)}</td><td class="num">${f1(L.B.rmse_within)}</td><td class="num">${f1(L.C.rmse_within)}</td><td>${L.C.rmse_within <= L.B.rmse_within ? 'C' : 'B'}, barely</td></tr>
        <tr><td>Raw RMSE / MAE ("everyone = city": ${f1(L.zero.rmse)} / ${f1(L.zero.mae)})</td><td class="num">${f1(L.persist.rmse)} / ${f1(L.persist.mae)}</td><td class="num">${f1(L.B.rmse)} / ${f1(L.B.mae)}</td><td class="num">${f1(L.C.rmse)} / ${f1(L.C.mae)}</td><td>neither beats "everyone = city"</td></tr>
        <tr><td>Top 20 beat the city (random ≈ ${Math.round(L.C.random_beat)})</td><td class="num">${L.persist.top_beat}/${L.persist.top_n}</td><td class="num">${L.B.top_beat}/${L.B.top_n}</td><td class="num">${L.C.top_beat}/${L.C.top_n}</td><td>${L.C.top_beat > L.B.top_beat ? 'C' : L.C.top_beat < L.B.top_beat ? 'B' : 'tie'}</td></tr>
        <tr><td>Top 20 average gain vs city (all NTAs ${sgn(L.C.all_mean)})</td><td class="num">${sgn(L.persist.top_mean)}</td><td class="num">${sgn(L.B.top_mean)}</td><td class="num">${sgn(L.C.top_mean)}</td><td>${L.C.top_mean >= L.B.top_mean ? 'C' : 'B'}</td></tr>
        <tr><td>Errors cluster on the map (Moran's I, p)</td><td>–</td><td class="num">${S.moran.B[0]} (p ${S.moran.B[1]})</td><td class="num">${S.moran.C[0]} (p ${S.moran.C[1]})</td><td>${S.moran.C[0] < S.moran.B[0] ? 'C' : 'B'}</td></tr>
        <tr><td>Ranks better across sensitivity setups</td><td>–</td><td class="num">${sens.length - cBeats} of ${sens.length}</td><td class="num">${cBeats} of ${sens.length}</td><td>${cBeats > sens.length / 2 ? 'C' : 'B'}</td></tr>
        <tr><td>Can see a hot side next door</td><td>no</td><td>no</td><td>yes (Gap, average, u)</td><td>C</td></tr>
      </tbody></table></div>
      <div class="nyc-note" style="margin-top:1rem" id="p6-verdict-note"></div>
    </section>
    <section class="nyc-panel">
      <div class="nyc-kicker">Limits to say out loud</div>
      <ul class="p6-list">
        <li><b>Median, not a price index.</b> A shift in which homes sell moves the median. Repeat-sales is the next upgrade (item 4).</li>
        <li><b>The test years were unusual.</b> ${T[0] + M.hold}–${T[T.length - 1] + M.hold} outcomes include COVID moves out of dense areas and the 2022–23 rate spike. A model that ranks well through that is encouraging; one that ranks poorly may just be facing a regime change.</li>
        <li><b>Manhattan is mostly unscored</b> (few 1–3 family homes). The condo sensitivity row shows what adding condos does.</li>
        <li><b>Filters are rough.</b> Distance is straight-line, park access uses tract centers, and noise is complaints, not decibels.</li>
        <li><b>Model C is a posterior mode.</b> Intervals come from a clustered sandwich, not a full Bayesian fit; R-INLA or Stan would give proper posterior intervals for u.</li>
        <li><b>Past ≠ future.</b> The score says where the patterns of 2013–2025 point. It is one input to a housing decision, not financial advice.</li>
      </ul>
    </section>
    <section class="nyc-panel">
      <div class="nyc-kicker">Reproduce</div>
      <p class="mdl-cap" style="margin-top:0"><code>python nyc-data-explorer/rns_pulls.py</code> (slow, cached) then <code>python nyc-data-explorer/build_rising.py</code>. Data: DOF annualized sales ${M.sale_years[0]}–${M.sale_years[1]} (nyc.gov) + PLUTO <code>64uk-42ks</code>; ACS 5-year 2010–2023 (B19013, B25064, B15002, B25003, B01003) with the Census 2020→2010 tract relationship file; DOB BIS <code>ipu4-2q9a</code> + DOB NOW <code>w9ak-ipjd</code>; NYPD <code>qgea-i56i</code>; 311 <code>76ig-c548</code> + <code>erm2-nwe9</code>; MTA <code>39hk-dx4f</code>; NYC Parks <code>enfh-gkve</code>; 2010 tracts/NTAs <code>bmjq-373p</code>. Change log: <code>MA491/rising-neighborhood-score-change-log.md</code>.</p>
    </section>`;

    document.getElementById('p6-verdict-note').innerHTML = `<b>Verdict:</b> the honest test says <b>the ranking is weak overall but useful at the top</b>. Across ${T[0]}–${T[T.length - 1]} starts, Model C's ranking correlates only ${f2(L.C.rho)} with what happened (B ${f2(L.B.rho)}; the simplest B, levels + momentum only, ${f2(L.B1.rho)}; last 3 years continue ${f2(L.persist.rho)}), and it fades from ${f2(L.C.per_year[0].rho)} for ${T[0]} starts to ${f2(L.C.per_year[L.C.per_year.length - 1].rho)} for ${T[T.length - 1]}. But its top 20 beat the city <b>${L.C.top_beat} of ${L.C.top_n}</b> times vs ~${Math.round(L.C.random_beat)} for a random pick, and landed ${sgn(L.C.top_mean - L.C.all_mean)} pts above the average neighborhood. <b>What drives it:</b> cheaper, lower-income neighborhoods catch up (starting price ${sgn(cb.PRICE0.b, f2)} per SD, income ${sgn(cb.INC.b, f2)}), recent winners cool off (momentum ${sgn(cb.MOM.b, f2)}), more construction slows prices (${sgn(cb.CONSTR ? cb.CONSTR.b : cb.NB.b, f2)}), and <b>a hot neighbor next door helps</b> (Gap ${sgn(cb.GAP.b, f2)}, 95% CI ${f2(cb.GAP.lo)} to ${f2(cb.GAP.hi)}). The extra signals did not improve the ranking over the simple model, the same lesson as Part 5. <b>B vs C:</b> a tie (Spearman difference ${sgn(S.gap_ci.rho[0], f3)}, CI ${f3(S.gap_ci.rho[1])} to ${f3(S.gap_ci.rho[2])}), with B ahead by a hair in ${sens.length - cBeats} of ${sens.length} sensitivity setups; the place effect shrank to ~0, and both leave clustered errors (Moran's I ≈ ${S.moran.C[0]}), meaning whole areas move together in ways no input sees. I keep <b>C for the score</b> because it carries the Gap, the one neighbor effect that held up, and B beside it. <b>Use the score to shortlist, not to forecast a number:</b> the 80% range is wide and the citywide level is unpredictable. <b>Next:</b> a repeat-sales index (removes mix shifts in the median), condos for Manhattan, transit commute times, and a longer test once 2026–27 sales exist.`;

    // ── interactions ─────────────────────────────────────────────
    const wire = (tid, cid, draw, attr) => document.getElementById(tid).addEventListener('click', (e) => {
      const b = e.target.closest(`button[data-${attr}]`); if (!b) return;
      document.querySelectorAll(`#${tid} button`).forEach((x) => x.classList.toggle('on', x === b));
      document.getElementById(cid).innerHTML = draw(b.dataset[attr]);
    });
    wire('p6-fam', 'p6-cards', varCards, 'f');
    wire('p6-curve-t', 'p6-curve', chartCurve, 'k');
    wire('p6-sc-t', 'p6-sc', chartScatter, 'm');
    document.getElementById('p6-price-sel').addEventListener('change', (e) => { document.getElementById('p6-price').innerHTML = chartPrice(e.target.value); });

    function redraw() {
      const v = scoreView();
      document.getElementById('p6-map').innerHTML = v.map;
      document.getElementById('p6-list').innerHTML = v.table;
      document.getElementById('p6-funnel').innerHTML = v.funnel;
      document.getElementById('p6-scoremap').addEventListener('click', (e) => {
        const pt = e.currentTarget.createSVGPoint();
        pt.x = e.clientX; pt.y = e.clientY;
        const p = pt.matrixTransform(e.currentTarget.getScreenCTM().inverse());
        [F.lon, F.lat] = proj.invert([p.x, p.y]);
        F.wp = -1;
        document.getElementById('p6-wp').value = '-1';
        redraw();
      });
    }
    const on = (id, ev, fn) => document.getElementById(id).addEventListener(ev, fn);
    on('p6-wp', 'change', (e) => { const i = +e.target.value; F.wp = i; if (i >= 0) { F.lat = S.workplaces[i].lat; F.lon = S.workplaces[i].lon; } redraw(); });
    on('p6-km', 'input', (e) => { F.km = +e.target.value; document.getElementById('p6-kmv').textContent = F.km ? F.km + ' km' : 'off'; redraw(); });
    on('p6-crime', 'change', (e) => { F.crime = e.target.value; redraw(); });
    on('p6-park', 'input', (e) => { F.park = +e.target.value; document.getElementById('p6-parkv').textContent = F.park ? '≥ ' + F.park + '%' : 'off'; redraw(); });
    on('p6-price', 'input', (e) => { F.price = +e.target.value; document.getElementById('p6-pricev').textContent = F.price ? money(F.price) : 'off'; redraw(); });
    on('p6-top', 'input', (e) => { F.topN = +e.target.value; document.getElementById('p6-topv').textContent = F.topN; redraw(); });
    document.querySelectorAll('[data-noise]').forEach((el) => el.addEventListener('input', (e) => { const k = e.target.dataset.noise; F.noise[k] = +e.target.value; document.getElementById('p6-nv-' + k).textContent = F.noise[k] ? F.noise[k] + '×' : 'off'; redraw(); }));
    redraw();

    main.onmousemove = (e) => { const t = e.target.closest('[data-tip]'); if (window.nycTip) window.nycTip(t ? t.getAttribute('data-tip') : null, e); };
    main.onmouseleave = () => window.nycTip && window.nycTip(null);
  };
})();
