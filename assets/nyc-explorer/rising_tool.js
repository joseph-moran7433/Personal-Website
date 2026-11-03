/* ═══════════════════════════════════════════════════════════════
   NYC DATA EXPLORER -- Part 6 tool: Rising Neighborhood Finder
   What Part 6 opens to. Proof of concept on NYC: the officer sets
   duty station, distance, budget and must-haves; neighborhoods that
   pass are ranked by the Rising Neighborhood Score (Score -> Rank ->
   Filter). The full analysis is models6.js (route __rising_analysis).
   Data: rising_score.json (build_rising.py) + rising_checks.json
   (build_checks.py). Draws with window.nycMdl's helpers.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  const NOISE_LAB = { COM: 'Bars, clubs, music', RES: 'Residential / party', STR: 'Street / sidewalk', CON: 'Construction' };
  const QUIET = {
    any: { label: 'No limit', caps: { COM: 0, RES: 0, STR: 0, CON: 0 } },
    quiet: { label: 'Quiet (family)', caps: { COM: 1, RES: 1, STR: 1, CON: 1 } },
    some: { label: 'Some nightlife OK', caps: { COM: 2, RES: 1.5, STR: 2, CON: 0 } },
    custom: { label: 'Custom', caps: null },
  };
  const BOROS = ['Brooklyn', 'Queens', 'Bronx', 'Staten Island', 'Manhattan'];

  window.nycRenderRisingTool = async function (main) {
    const { C, svg, tipAttr } = window.nycMdl;
    main.innerHTML = '<p class="nyc-loading" style="padding:2rem">Loading the Rising Neighborhood Finder…</p>';
    let S, K;
    try {
      const [a, b] = await Promise.all(['rising_score.json?v=20261030', 'rising_checks.json?v=20261103'].map((f) => fetch('assets/nyc-explorer/' + f)));
      if (!a.ok || !b.ok) throw new Error('HTTP ' + (a.ok ? b.status : a.status));
      [S, K] = await Promise.all([a.json(), b.json()]);
    } catch (e) { main.innerHTML = `<p style="padding:2rem">Could not load the score (${e.message}).</p>`; return; }

    const M = S.meta, NT = Object.fromEntries(S.ntas.map((d) => [d.code, d]));
    const scored = S.ntas.filter((d) => d.scored);
    const c1 = K.check1.models.C, py = c1.per_year;
    const f1 = (v) => (v == null ? '–' : v.toFixed(1));
    const sgn = (v, f = f1) => (v == null ? '–' : (v >= 0 ? '+' : '−') + f(Math.abs(v)));
    const money = (v) => (v == null ? '–' : '$' + (v >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : Math.round(v / 1000) + 'k'));
    const mi = (km) => (km * 0.621371).toFixed(1);
    const scoreCol = (x) => d3.interpolateRgb('#eef4f1', '#00626f')(x / 100);
    const kmTo = (d, lat, lon) => { const R = 6371, dl = ((lat - d.lat) * Math.PI) / 180, dn = ((lon - d.lon) * Math.PI) / 180; const a = Math.sin(dl / 2) ** 2 + Math.cos((d.lat * Math.PI) / 180) * Math.cos((lat * Math.PI) / 180) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(a)); };
    const priceMax = Math.ceil(Math.max(...scored.map((d) => d.price_now || 0)) / 50000) * 50000;

    // ── state: what the officer asks for ──────────────────────
    const F = { wp: 0, lat: S.workplaces[0].lat, lon: S.workplaces[0].lon, km: 15, price: 0, subway: 0, park: 0, crime: 'off',
      boros: new Set(BOROS), quiet: 'any', noise: { ...QUIET.any.caps }, sort: 'score', topN: 15, sel: null };

    function checks(d) {
      const km = kmTo(d, F.lat, F.lon);
      const out = [
        ['Distance to work', `${f1(km)} km (${mi(km)} mi)`, !F.km || km <= F.km, F.km ? `limit ${F.km} km` : ''],
        ['Price per unit', money(d.price_now), !F.price || (d.price_now != null && d.price_now <= F.price), F.price ? `budget ${money(F.price)}` : ''],
        ['Subway', `${f1(d.subway_km)} km to nearest station`, !F.subway || d.subway_km <= F.subway, F.subway ? `limit ${F.subway} km` : ''],
        ['Park within a 5-min walk', `${Math.round(d.park_400 * 100)}% of residents`, !F.park || d.park_400 * 100 >= F.park, F.park ? `want ≥ ${F.park}%` : ''],
        ['Felony trend', `${sgn(d.felony_chg)}% (city ${sgn(M.felony_city_chg)}%)`, F.crime === 'off' || (F.crime === 'city' ? d.felony_chg <= M.felony_city_chg : d.felony_chg <= 0), F.crime === 'off' ? '' : F.crime === 'city' ? 'not faster than the city' : 'not rising'],
        ['Borough', d.boro, F.boros.has(d.boro), ''],
      ];
      Object.entries(F.noise).forEach(([k, cap]) => out.push([`Noise: ${NOISE_LAB[k].toLowerCase()}`, `${f1(d.noise[k])}× city rate`, !cap || d.noise[k] <= cap, cap ? `cap ${cap}×` : '']));
      return out;
    }
    const passes = (d) => checks(d).every((c) => c[2]);

    // ── map ─────────────────────────────────────────────────────
    const MW = 600, MH = 600;
    const proj = d3.geoMercator().fitExtent([[6, 6], [MW - 6, MH - 6]], S.geo);
    const gpath = d3.geoPath(proj);
    const PATHS = S.geo.features.map((f) => [f.properties.code, gpath(f)]);
    function mapSvg(show, passSet) {
      const [px, py_] = proj([F.lon, F.lat]);
      const ring = F.km ? (() => { const p2 = proj([F.lon + F.km / (111.32 * Math.cos((F.lat * Math.PI) / 180)), F.lat]); return `<circle cx="${px}" cy="${py_}" r="${Math.abs(p2[0] - px)}" fill="none" stroke="#1b1d22" stroke-dasharray="5 4" stroke-width="1.2" pointer-events="none"/>`; })() : '';
      const fill = (d) => (!d.scored ? '#fbfbf8' : passSet.has(d.code) ? scoreCol(d.score) : '#e3e3de');
      const tipFn = (d) => (d.scored ? `<b>${d.name}</b><br>Score ${d.score} · ${sgn(d.pctC)}% vs city over 3 yrs${passSet.has(d.code) ? '' : '<br><span style="color:#ee352e">filtered out: ' + checks(d).filter((c) => !c[2]).map((c) => c[0].toLowerCase()).join(', ') + '</span>'}` : `<b>${d.name}</b><br>not scored (too few 1–3 family sales)`);
      const paths = PATHS.map(([c, p]) => `<path d="${p}" data-code="${c}" fill="${fill(NT[c])}" stroke="${c === F.sel ? '#ee352e' : '#fff'}" stroke-width="${c === F.sel ? 2.2 : 0.5}"${tipAttr(tipFn(NT[c]))}/>`).join('');
      const sel = F.sel ? PATHS.filter(([c]) => c === F.sel).map(([, p]) => `<path d="${p}" fill="none" stroke="#ee352e" stroke-width="2.4" pointer-events="none"/>`).join('') : '';
      const star = `<path d="M${px},${py_ - 9}l2.6,6 6.4,.4-5,4.1 1.7,6.3L${px},${py_ + 3.6}l-5.7,3.2 1.7-6.3-5-4.1 6.4-.4z" fill="${C.red}" stroke="#fff" stroke-width="1" pointer-events="none"/>`;
      const pins = show.map((d, i) => { const [x, y] = proj([d.lon, d.lat]); return `<g data-code="${d.code}" style="cursor:pointer"><circle cx="${x}" cy="${y}" r="7.5" fill="#1b1d22" stroke="#fff" stroke-width="1"/><text x="${x}" y="${y + 3.2}" text-anchor="middle" style="fill:#fff;font-size:8.5px;font-weight:700;pointer-events:none">${i + 1}</text></g>`; }).join('');
      return `<div class="nyc-chart mdl-map"><svg viewBox="0 0 ${MW} ${MH}" id="rt-map" style="overflow:hidden;cursor:${F.wp === -1 ? 'crosshair' : 'pointer'}">${paths}${sel}${ring}${star}${pins}</svg></div>`;
    }

    // ── one neighborhood up close ──────────────────────────────
    function priceChart(code) {
      const P = S.price_series, ys = P.years, nv = P.nta[code] || [];
      const w = 380, h = 170, l = 46, r = 10, t = 10, b = 22;
      const vals = nv.concat(P.city).filter((v) => v != null);
      const lo = Math.min(...vals) * 0.9, hi = Math.max(...vals) * 1.05;
      const x = (yr) => l + ((w - l - r) * (yr - ys[0])) / (ys[ys.length - 1] - ys[0]);
      const y = (v) => t + (h - t - b) * (1 - (Math.log(v) - Math.log(lo)) / (Math.log(hi) - Math.log(lo)));
      const line = (arr, col, wd) => { let d = '', pen = false; arr.forEach((v, i) => { if (v == null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${x(ys[i])},${y(v)}`; pen = true; }); return `<path d="${d}" fill="none" stroke="${col}" stroke-width="${wd}"/>`; };
      let s = '';
      d3.ticks(lo, hi, 4).forEach((v) => { if (v > 0) s += `<line x1="${l}" x2="${w - r}" y1="${y(v)}" y2="${y(v)}" stroke="rgba(27,29,34,0.07)"/><text x="${l - 5}" y="${y(v) + 3}" text-anchor="end">${money(v)}</text>`; });
      ys.filter((yr) => (ys[ys.length - 1] - yr) % 4 === 0).forEach((yr) => { s += `<text x="${x(yr)}" y="${h - 6}" text-anchor="middle">${yr}</text>`; });
      s += line(P.city, '#1b1d22', 1.6) + line(nv, C.orange, 2.4);
      return svg(s, w, h) + `<div class="nyc-legend"><span><i style="background:${C.orange}"></i>${NT[code].name}</span><span><i style="background:#1b1d22"></i>whole city</span></div>`;
    }
    function detail(d) {
      if (!d) return `<div class="rt-empty">Click a neighborhood on the map or in the list to see why it is (or isn't) on your list.</div>`;
      if (!d.scored) return `<h3>${d.name}</h3><p class="mdl-cap">${d.boro}. Not scored: fewer than ${M.min_sales} 1–3 family home sales in a two-year window, so there is no stable price to start from.</p>`;
      const cs = checks(d), ok = cs.every((c) => c[2]);
      return `<div class="rt-dhead"><div><h3>${d.name}</h3><div class="p6-sub">${d.boro} · population ${d.pop.toLocaleString()} · median income ${money(d.income)}</div></div>
          <span class="p6-score rt-big" style="background:${scoreCol(d.score)};color:${d.score > 55 ? '#fff' : '#1b1d22'}">${d.score}</span></div>
        <div class="rt-facts">
          <div><b>${sgn(d.pctC)}%</b><span>predicted 3-yr gain vs the city<br>80% range ${sgn(d.lo)} to ${sgn(d.hi)}</span></div>
          <div><b>${money(d.price_now)}</b><span>median price per unit, 1–3 family, ${M.now_t - 1}–${M.now_t} (${d.n_sales} sales)</span></div>
          <div><b>${d.gap > 0 ? '+' + f1(d.gap) : '—'}</b><span>${d.gap > 0 && d.hot_name ? `pts behind its hottest neighbor, ${d.hot_name}` : 'already ahead of all its neighbors'}</span></div>
        </div>
        ${priceChart(d.code)}
        <div class="nyc-kicker" style="margin-top:0.6rem">Your must-haves ${ok ? '· passes all' : '· fails ' + cs.filter((c) => !c[2]).length}</div>
        <ul class="rt-checks">${cs.map(([k, v, pass, lim]) => `<li class="${pass ? (lim ? 'yes' : 'na') : 'no'}"><i>${pass ? (lim ? '✓' : '·') : '✗'}</i><b>${k}</b><span>${v}${lim ? ` <em>(${lim})</em>` : ''}</span></li>`).join('')}</ul>`;
    }

    // ── the page ────────────────────────────────────────────────
    const nz = (k) => `<label class="p6-ctl"><span>${NOISE_LAB[k]} <b id="rt-nv-${k}">${F.noise[k] ? F.noise[k] + '×' : 'off'}</b></span><input type="range" min="0" max="4" step="0.25" value="${F.noise[k]}" data-noise="${k}"></label>`;
    const yrs = K.meta.test_years, lastP = py[py.length - 1], early = py.slice(0, 2), late = py.slice(2);
    const sum = (a, k) => a.reduce((s, d) => s + d[k], 0);
    main.innerHTML = `
    <header class="nyc-hero">
      <div class="nyc-eyebrow">Part 6 · Rising Neighborhood Finder · proof of concept on NYC</div>
      <h1 class="nyc-title">Moving to NYC on PCS orders? Find a neighborhood that fits your life and is likely to beat the city on home values over a 3-year tour.</h1>
      <p class="nyc-lede">Tell it where you'll work and what you need. Neighborhoods that pass are ranked by the <strong>Rising Neighborhood Score</strong> (0–100): how much a home there is predicted to gain vs the city by ${M.now_t + M.hold}, ranked against ${scored.length} neighborhoods. Your filters never change a score; they only decide who is on the list.</p>
    </header>

    <section class="nyc-panel">
      <div class="nyc-kicker">1 · Your move</div>
      <div class="p6-ctls rt-ctls">
        <label class="p6-ctl"><span>Duty station</span><select id="rt-wp">${S.workplaces.map((w, i) => `<option value="${i}">${w.name}</option>`).join('')}<option value="-1">Somewhere else (click the map)</option></select></label>
        <label class="p6-ctl"><span>Max distance from work <b id="rt-kmv"></b></span><input type="range" id="rt-km" min="0" max="40" step="1" value="${F.km}"></label>
        <label class="p6-ctl"><span>Budget: price per home unit <b id="rt-pricev">no limit</b></span><input type="range" id="rt-price" min="0" max="${priceMax}" step="25000" value="0"></label>
        <label class="p6-ctl"><span>Subway within <b id="rt-subv">any distance</b></span><input type="range" id="rt-sub" min="0" max="2" step="0.1" value="0"></label>
        <label class="p6-ctl"><span>Park within a 5-min walk for <b id="rt-parkv">any share</b> of residents</span><input type="range" id="rt-park" min="0" max="90" step="5" value="0"></label>
        <label class="p6-ctl"><span>Felonies (${M.crime_base_years.join('–')} → ${M.filter_years.join('–')})</span><select id="rt-crime"><option value="off">don't filter</option><option value="city">not rising faster than the city (${sgn(M.felony_city_chg)}%)</option><option value="flat">not rising at all</option></select></label>
        <label class="p6-ctl"><span>Noise</span><select id="rt-quiet">${Object.entries(QUIET).map(([k, q]) => `<option value="${k}">${q.label}</option>`).join('')}</select></label>
        <div class="p6-ctl"><span>Boroughs</span><div class="rt-chips" id="rt-boros">${BOROS.map((b) => `<button type="button" class="on" data-b="${b}">${b}</button>`).join('')}</div></div>
      </div>
      <div class="p6-ctls rt-noise" id="rt-noise" hidden>${['COM', 'RES', 'STR', 'CON'].map(nz).join('')}<p class="mdl-cap" style="grid-column:1/-1;margin:0">311 complaints per resident relative to the city (1× = city rate), ${M.filter_years.join('–')}. Complaints, not decibels.</p></div>
      <div id="rt-funnel"></div>
    </section>

    <div class="nyc-row p6-scorerow">
      <section class="nyc-panel"><div class="nyc-kicker">2 · The map · darker = higher score · gray = fails a must-have · ★ = work</div><div id="rt-mapbox"></div></section>
      <section class="nyc-panel"><div class="nyc-kicker" style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem">3 · Your list
          <span class="rt-sort">sort <select id="rt-sort"><option value="score">by score</option><option value="km">by distance</option><option value="price">by price</option></select>
          show <select id="rt-top">${[10, 15, 25, 50].map((n) => `<option${n === F.topN ? ' selected' : ''}>${n}</option>`).join('')}</select></span></div>
        <div id="rt-list"></div></section>
    </div>
    <section class="nyc-panel" id="rt-detail"></section>

    <section class="nyc-panel rt-trust">
      <div class="nyc-kicker">How much to trust it · back-tested on ${yrs[0]}–${yrs[yrs.length - 1]} start years the model never saw</div>
      <div class="nyc-stats" style="margin:0.4rem 0 0">
        <div class="nyc-stat"><div class="nyc-stat-num">${c1.hits} / ${c1.of}</div><div class="nyc-stat-label">top-20 picks that beat the city. Picking at random gives ~${Math.round(c1.expected)} (95% of random draws: ${c1.null_lo}–${c1.null_hi}). p ≈ ${c1.p < 0.001 ? '0.00001' : c1.p}</div></div>
        <div class="nyc-stat"><div class="nyc-stat-num">${sgn(c1.excess_ret_ci[0])} pts</div><div class="nyc-stat-label">extra 3-year gain of the top 20 over the average neighborhood (95% CI ${sgn(c1.excess_ret_ci[1])} to ${sgn(c1.excess_ret_ci[2])})</div></div>
        <div class="nyc-stat"><div class="nyc-stat-num">${sum(early, 'hits')} vs ${Math.round(sum(early, 'expected'))} → ${sum(late, 'hits')} vs ${Math.round(sum(late, 'expected'))}</div><div class="nyc-stat-label">top-20 hits vs random: ${early.map((d) => d.t).join('–')} starts, then ${late.map((d) => d.t).join('–')}. The edge has shrunk; for ${lastP.t} starts it was no better than random.</div></div>
      </div>
      <p class="mdl-cap"><b>Use it as a tiebreaker, not a forecast.</b> It picks winners more often than chance, but it can't say how much the whole city will move, and its edge has faded since COVID (the full analysis explains why). Choose for livability first, then let the score break ties.</p>
    </section>

    <section class="nyc-panel">
      <div class="nyc-kicker">What is behind the score</div>
      <ul class="p6-list">
        <li><b>The prediction:</b> a spatial linear regression (Model C) fit on ${M.n_rows.toLocaleString()} neighborhood-years of 1–3 family home sales (${M.sale_years[0]}–${M.sale_years[1]}), Census income, rent and education, building permits, felonies, 311 noise and subway access, plus how far ahead the hottest next-door neighborhood is.</li>
        <li><b>What tends to rise:</b> cheaper, lower-income neighborhoods catching up, and places sitting next to a neighborhood that already surged. Recent winners tend to cool off.</li>
        <li><b>The filters</b> use current conditions (${M.filter_years.join('–')}). Distance is straight-line from the neighborhood's population center, not a commute time.</li>
        <li><b>Not covered:</b> most of Manhattan (almost no 1–3 family homes sell there). This is a proof of concept, not financial advice.</li>
      </ul>
      <p class="mdl-cap"><a href="#" onclick="openNycRisingAnalysis();return false;">Full code &amp; analysis →</a> the data, both models, the back-test, sensitivity runs and the two checks behind the numbers above.</p>
    </section>`;

    // ── redraw on every change ──────────────────────────────────
    function redraw() {
      const ranked = [...scored].sort((a, b) => b.score - a.score);
      const pass = ranked.filter(passes), passSet = new Set(pass.map((d) => d.code));
      const keyFn = { score: (d) => -d.score, km: (d) => kmTo(d, F.lat, F.lon), price: (d) => d.price_now ?? 1e12 }[F.sort];
      const show = [...pass].sort((a, b) => keyFn(a) - keyFn(b)).slice(0, F.topN);
      document.getElementById('rt-mapbox').innerHTML = mapSvg(show, passSet);
      document.getElementById('rt-funnel').innerHTML = `<div class="p6-funnel"><div><b>${S.ntas.length}</b><span>neighborhoods</span></div><i>→</i><div><b>${scored.length}</b><span>enough sales to score</span></div><i>→</i><div><b>${pass.length}</b><span>pass your must-haves</span></div><i>→</i><div><b>${show.length}</b><span>on your list</span></div></div>`;
      document.getElementById('rt-list').innerHTML = `<div class="nyc-table-wrap"><table class="nyc-table p6-rank rt-rank"><thead><tr><th>#</th><th>Neighborhood</th><th>Score</th><th>3 yrs vs city<br><span class="p6-sub">80% range</span></th><th>$ / unit</th></tr></thead><tbody>${show.map((d, i) => `<tr data-code="${d.code}" class="${d.code === F.sel ? 'p6-hl' : ''}"><td class="num"><b>${i + 1}</b></td><td><b>${d.name}</b><div class="p6-sub">${d.boro} · ${f1(kmTo(d, F.lat, F.lon))} km · #${ranked.indexOf(d) + 1} of ${scored.length}</div></td><td class="num"><span class="p6-score" style="background:${scoreCol(d.score)};color:${d.score > 55 ? '#fff' : '#1b1d22'}">${d.score}</span></td><td class="num">${sgn(d.pctC)}%<div class="p6-sub">${sgn(d.lo)} to ${sgn(d.hi)}</div></td><td class="num">${money(d.price_now)}</td></tr>`).join('') || '<tr><td colspan="5">No neighborhood passes every must-have. Loosen one.</td></tr>'}</tbody></table></div>`;
      document.getElementById('rt-detail').innerHTML = `<div class="nyc-kicker">4 · Up close</div>${detail(F.sel ? NT[F.sel] : null)}`;
      document.getElementById('rt-kmv').textContent = F.km ? `${F.km} km (${mi(F.km)} mi)` : 'any';
    }
    const select = (code) => { F.sel = F.sel === code ? null : code; redraw(); if (F.sel) document.getElementById('rt-detail').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); };
    const on = (id, ev, fn) => document.getElementById(id).addEventListener(ev, fn);
    on('rt-mapbox', 'click', (e) => {
      const svgEl = document.getElementById('rt-map');
      if (F.wp === -1) {
        const pt = svgEl.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
        const p = pt.matrixTransform(svgEl.getScreenCTM().inverse());
        [F.lon, F.lat] = proj.invert([p.x, p.y]);
        redraw(); return;
      }
      const t = e.target.closest('[data-code]'); if (t) select(t.dataset.code);
    });
    on('rt-list', 'click', (e) => { const t = e.target.closest('tr[data-code]'); if (t) select(t.dataset.code); });
    on('rt-wp', 'change', (e) => { F.wp = +e.target.value; if (F.wp >= 0) { F.lat = S.workplaces[F.wp].lat; F.lon = S.workplaces[F.wp].lon; } redraw(); });
    on('rt-km', 'input', (e) => { F.km = +e.target.value; redraw(); });
    on('rt-price', 'input', (e) => { F.price = +e.target.value; document.getElementById('rt-pricev').textContent = F.price ? money(F.price) : 'no limit'; redraw(); });
    on('rt-sub', 'input', (e) => { F.subway = +e.target.value; document.getElementById('rt-subv').textContent = F.subway ? F.subway.toFixed(1) + ' km' : 'any distance'; redraw(); });
    on('rt-park', 'input', (e) => { F.park = +e.target.value; document.getElementById('rt-parkv').textContent = F.park ? '≥ ' + F.park + '%' : 'any share'; redraw(); });
    on('rt-crime', 'change', (e) => { F.crime = e.target.value; redraw(); });
    on('rt-sort', 'change', (e) => { F.sort = e.target.value; redraw(); });
    on('rt-top', 'change', (e) => { F.topN = +e.target.value; redraw(); });
    on('rt-boros', 'click', (e) => { const b = e.target.closest('button[data-b]'); if (!b) return; F.boros.has(b.dataset.b) ? F.boros.delete(b.dataset.b) : F.boros.add(b.dataset.b); b.classList.toggle('on'); redraw(); });
    const setNoise = (caps) => { Object.assign(F.noise, caps); document.querySelectorAll('[data-noise]').forEach((el) => { const k = el.dataset.noise; el.value = F.noise[k]; document.getElementById('rt-nv-' + k).textContent = F.noise[k] ? F.noise[k] + '×' : 'off'; }); };
    on('rt-quiet', 'change', (e) => { F.quiet = e.target.value; document.getElementById('rt-noise').hidden = F.quiet !== 'custom'; if (QUIET[F.quiet].caps) setNoise(QUIET[F.quiet].caps); redraw(); });
    document.querySelectorAll('[data-noise]').forEach((el) => el.addEventListener('input', (e) => { setNoise({ [e.target.dataset.noise]: +e.target.value }); redraw(); }));
    redraw();

    main.onmousemove = (e) => { const t = e.target.closest('[data-tip]'); if (window.nycTip) window.nycTip(t ? t.getAttribute('data-tip') : null, e); };
    main.onmouseleave = () => window.nycTip && window.nycTip(null);
  };
})();
