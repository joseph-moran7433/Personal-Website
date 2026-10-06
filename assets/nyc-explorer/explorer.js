/* ═══════════════════════════════════════════════════════════════
   NYC DATA EXPLORER
   One tab per dataset. Every number and chart comes from the JSON that
   nyc-data-explorer/build_explorer_data.py precomputes from the live
   open-data APIs. This page only *describes* the data (coverage, fields,
   distributions, quality traps) -- it deliberately makes no analytical
   claims and doesn't relate one dataset to another.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  const BASE = 'assets/nyc-explorer/';
  const PORTAL = 'https://data.cityofnewyork.us/d/';
  const NYS_PORTAL = 'https://data.ny.gov/d/';
  const C = {
    blue: '#0039a6', red: '#ee352e', green: '#00933c', orange: '#ff6319', purple: '#b933ad',
    yellow: '#fccc0a', gray: '#808183', brown: '#996633', teal: '#00add0', ink: '#1b1d22',
  };
  const BORO_COLORS = {
    Manhattan: C.orange, Brooklyn: C.blue, Queens: C.purple, Bronx: C.green, 'Staten Island': C.brown,
  };

  const fmt = d3.format(',');
  const fmt1 = d3.format(',.1f');
  const fmtMoney = (v) => (v >= 1e6 ? '$' + d3.format('.3~s')(v).replace('G', 'B') : '$' + d3.format(',.0f')(v));
  const pct = (a, b) => (b ? (100 * a / b).toFixed(1) + '%' : '—');
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const day = (iso) => (iso ? new Date(iso.slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');

  const cache = {};
  function load(name) {
    if (!cache[name]) {
      cache[name] = fetch(BASE + name + '.json').then((r) => {
        if (!r.ok) throw new Error(name + '.json: HTTP ' + r.status);
        return r.json();
      }).then((j) => (name === 'nta2020' ? rewind(j) : j));
    }
    return cache[name];
  }

  // The city's GeoJSON follows the RFC 7946 winding order (counter-clockwise
  // outer rings); d3-geo expects the opposite and would otherwise read each
  // neighborhood as "the whole globe except this polygon". Flip any polygon
  // whose spherical area comes out larger than a hemisphere.
  function rewind(geo) {
    geo.features.forEach((f) => {
      f.geometry.coordinates.forEach((poly) => {
        if (d3.geoArea({ type: 'Polygon', coordinates: poly }) > 2 * Math.PI) poly.forEach((ring) => ring.reverse());
      });
    });
    return geo;
  }

  // ── tooltip ──────────────────────────────────────────────────────
  let tipEl = null;
  function tip(html, ev) {
    if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'nyc-tip'; document.body.appendChild(tipEl); }
    if (html == null) { tipEl.style.opacity = 0; return; }
    tipEl.innerHTML = html;
    const pad = 14, w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    let x = ev.clientX + pad, y = ev.clientY + pad;
    if (x + w > window.innerWidth - 8) x = ev.clientX - w - pad;
    if (y + h > window.innerHeight - 8) y = ev.clientY - h - pad;
    tipEl.style.left = x + 'px'; tipEl.style.top = y + 'px'; tipEl.style.opacity = 1;
  }

  // ── HTML building blocks ─────────────────────────────────────────
  const panel = (title, body, kicker) =>
    `<section class="nyc-panel">${kicker ? `<div class="nyc-kicker">${kicker}</div>` : ''}${title ? `<h2>${title}</h2>` : ''}${body}</section>`;
  const row = (...panels) => `<div class="nyc-row">${panels.join('')}</div>`;
  const stats = (items) => `<div class="nyc-stats">${items.map(([n, l]) =>
    `<div class="nyc-stat"><div class="nyc-stat-num">${n}</div><div class="nyc-stat-label">${l}</div></div>`).join('')}</div>`;
  const gotchas = (items) => `<ul class="nyc-gotchas">${items.map((g) => `<li>${g}</li>`).join('')}</ul>`;
  const chartDiv = (id) => `<div class="nyc-chart" id="${id}"></div>`;
  const mapDiv = (id) => `<div class="nyc-map" id="${id}"></div>`;

  function meta(items) {
    return `<dl class="nyc-meta">${items.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
  }

  function fieldTable(fields, missing) {
    const rows = fields.map(([name, type, meaning]) => {
      const m = missing && missing[name];
      const miss = m == null ? '<span class="muted">—</span>'
        : `<span class="nyc-missbar"><span style="width:${Math.min(100, m)}%"></span></span>${m.toFixed(1)}%`;
      return `<tr><td class="mono">${name}</td><td class="muted">${type}</td><td>${meaning}</td><td class="num">${miss}</td></tr>`;
    }).join('');
    return `<div class="nyc-table-wrap"><table class="nyc-table"><thead><tr><th>Field</th><th>Type</th><th>What it means</th><th>Blank</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function sampleTable(rows, cols) {
    if (!rows || !rows.length) return '<p>No sample rows.</p>';
    cols = cols || Object.keys(rows[0]);
    const cell = (v) => {
      if (v == null) return '<span style="opacity:.35">null</span>';
      if (typeof v === 'object') v = JSON.stringify(v);
      v = String(v);
      if (/^\d{4}-\d\d-\d\dT00:00:00\.000$/.test(v)) v = v.slice(0, 10);
      return esc(v.length > 42 ? v.slice(0, 40) + '…' : v);
    };
    return `<div class="nyc-table-wrap"><table class="nyc-table sample"><thead><tr>${cols.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${
      rows.map((r) => `<tr>${cols.map((c) => `<td>${cell(r[c])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  // ── charts ───────────────────────────────────────────────────────
  // Horizontal ranked bars: data = [[label, value], ...]
  function barH(sel, data, o = {}) {
    const el = document.querySelector(sel); if (!el) return;
    const total = o.total;
    const W = 640, bh = o.barHeight || 20, gap = 5, lw = o.labelWidth || 190, rw = 92;
    const H = data.length * (bh + gap);
    const x = d3.scaleLinear().domain([0, d3.max(data, (d) => d[1]) || 1]).range([0, W - lw - rw]);
    const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`);
    const g = svg.selectAll('g').data(data).join('g').attr('transform', (d, i) => `translate(0,${i * (bh + gap)})`);
    g.append('text').attr('x', lw - 8).attr('y', bh / 2).attr('dy', '0.35em').attr('text-anchor', 'end')
      .text((d) => (d[0].length > 30 ? d[0].slice(0, 29) + '…' : d[0])).append('title').text((d) => d[0]);
    g.append('rect').attr('x', lw).attr('height', bh).attr('rx', 2).attr('width', (d) => Math.max(1, x(d[1])))
      .attr('fill', (d, i) => (typeof o.color === 'function' ? o.color(d, i) : o.color || C.blue))
      .on('mousemove', (ev, d) => tip(`<b>${esc(d[0])}</b><br>${fmt(d[1])}${total ? ` · ${pct(d[1], total)}` : ''}${o.unit ? ' ' + o.unit : ''}`, ev))
      .on('mouseleave', () => tip(null));
    g.append('text').attr('class', 'bar-label').attr('x', (d) => lw + x(d[1]) + 6).attr('y', bh / 2).attr('dy', '0.35em')
      .text((d) => (o.valueFmt ? o.valueFmt(d[1]) : fmt(d[1])) + (total ? `  (${pct(d[1], total)})` : ''));
  }

  // Vertical columns over an ordered x: series = [{name, color, values: [[x, y], ...]}]
  function columns(sel, series, o = {}) {
    const el = document.querySelector(sel); if (!el) return;
    const W = 680, H = o.height || 240, m = { t: 10, r: 8, b: 30, l: 52 };
    const xs = [...new Set(series.flatMap((s) => s.values.map((v) => v[0])))];
    if (o.sortX !== false) xs.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const x0 = d3.scaleBand().domain(xs).range([m.l, W - m.r]).padding(xs.length > 60 ? 0.08 : 0.2);
    const x1 = d3.scaleBand().domain(series.map((s) => s.name)).range([0, x0.bandwidth()]).padding(series.length > 1 ? 0.06 : 0);
    const ymax = d3.max(series.flatMap((s) => s.values.map((v) => v[1]))) || 1;
    const y = d3.scaleLinear().domain([0, ymax]).nice().range([H - m.b, m.t]);
    const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`);
    svg.append('g').attr('class', 'gridline').attr('transform', `translate(${m.l},0)`)
      .call(d3.axisLeft(y).ticks(5).tickSize(-(W - m.l - m.r)).tickFormat(''));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`)
      .call(d3.axisLeft(y).ticks(5).tickFormat(o.yFmt || d3.format('~s')));
    const every = Math.ceil(xs.length / (o.maxTicks || 14));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`)
      .call(d3.axisBottom(x0).tickValues(xs.filter((d, i) => i % every === 0)).tickFormat(o.xFmt || ((d) => d)));
    series.forEach((s) => {
      svg.append('g').selectAll('rect').data(s.values).join('rect')
        .attr('x', (d) => x0(d[0]) + x1(s.name)).attr('width', x1.bandwidth())
        .attr('y', (d) => y(d[1])).attr('height', (d) => y(0) - y(d[1]))
        .attr('fill', (d) => (o.colorFn ? o.colorFn(d, s) : s.color))
        .on('mousemove', (ev, d) => tip(`<b>${esc(o.xLabel ? o.xLabel(d[0]) : d[0])}</b><br>${series.length > 1 ? esc(s.name) + ': ' : ''}${fmt(d[1])}${o.unit ? ' ' + o.unit : ''}`, ev))
        .on('mouseleave', () => tip(null));
    });
    if (series.length > 1 || o.legend) {
      el.insertAdjacentHTML('beforeend', `<div class="nyc-legend">${(o.legend || series).map((s) =>
        `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>`);
    }
  }

  // ── maps ─────────────────────────────────────────────────────────
  // NTA polygons in SVG (hoverable), with an optional canvas layer of
  // points/grid cells drawn underneath the transparent hover targets.
  const MW = 800, MH = 760;
  async function nycMap(sel, o) {
    const el = document.querySelector(sel); if (!el) return;
    const geo = await load('nta2020');
    const proj = d3.geoMercator().fitExtent([[6, 6], [MW - 6, MH - 6]], geo);
    const path = d3.geoPath(proj);
    el.innerHTML = '';
    const base = d3.select(el).append('svg').attr('viewBox', `0 0 ${MW} ${MH}`);
    base.append('g').selectAll('path').data(geo.features).join('path')
      .attr('d', path).attr('fill', (f) => (o.baseFill ? o.baseFill(f) : '#e4e4de')).attr('stroke', '#fff').attr('stroke-width', 0.5);

    if (o.points || o.grid) {
      const cv = d3.select(el).append('canvas').attr('width', MW * 2).attr('height', MH * 2).style('pointer-events', 'none').node();
      const ctx = cv.getContext('2d'); ctx.scale(2, 2);
      if (o.grid) {
        const maxN = d3.max(o.grid, (d) => d[2]);
        const col = d3.scaleSequentialLog(o.gridInterp || d3.interpolatePuRd).domain([1, maxN]);
        const cell = o.cellDeg || 0.004;
        o.grid.forEach(([lon, lat, n]) => {
          const [x0, y0] = proj([lon - cell / 2, lat + cell / 2]);
          const [x1, y1] = proj([lon + cell / 2, lat - cell / 2]);
          ctx.fillStyle = col(n); ctx.fillRect(x0, y0, x1 - x0 + 0.3, y1 - y0 + 0.3);
        });
        if (o.gridLegend) {
          el.insertAdjacentHTML('afterend', rampLegend(col.interpolator(), '1', fmt(maxN), o.gridLegend));
        }
      }
      if (o.points) {
        ctx.globalAlpha = o.alpha ?? 0.55;
        const r = o.radius || 1.2;
        o.points.forEach((p) => {
          const xy = proj([p[0], p[1]]); if (!xy) return;
          ctx.fillStyle = o.pointColor ? o.pointColor(p) : C.blue;
          ctx.beginPath(); ctx.arc(xy[0], xy[1], r, 0, 2 * Math.PI); ctx.fill();
        });
        ctx.globalAlpha = 1;
      }
    }

    const top = d3.select(el).append('svg').attr('viewBox', `0 0 ${MW} ${MH}`);
    top.append('g').selectAll('path').data(geo.features).join('path')
      .attr('class', 'nta').attr('d', path)
      .attr('fill', (f) => (o.fill ? o.fill(f) : 'transparent'))
      .attr('stroke', o.points || o.grid ? 'rgba(27,29,34,0.18)' : '#fff')
      .on('mousemove', (ev, f) => {
        const p = f.properties;
        tip(`<b>${esc(p.name)}</b> <span class="mono">${p.code}</span><br>${esc(p.boro)} · ${esc(p.type)}${o.tipExtra ? '<br>' + o.tipExtra(f) : ''}`, ev);
      })
      .on('mouseleave', () => tip(null));
    if (o.markers) {
      top.append('g').selectAll('circle').data(o.markers).join('circle')
        .attr('cx', (d) => proj([d.lon, d.lat])[0]).attr('cy', (d) => proj([d.lon, d.lat])[1])
        .attr('r', o.markerR || 4).attr('fill', (d) => d.color || C.orange).attr('stroke', '#fff').attr('stroke-width', 1)
        .on('mousemove', (ev, d) => tip(d.tip, ev)).on('mouseleave', () => tip(null));
    }
  }

  function rampLegend(interp, lo, hi, label) {
    const stops = d3.range(0, 1.01, 0.1).map((t) => `${interp(t)} ${t * 100}%`).join(',');
    return `<div class="nyc-legend"><span class="nyc-ramp">${label}: ${lo} <span class="nyc-ramp-bar" style="background:linear-gradient(90deg,${stops})"></span> ${hi}</span></div>`;
  }

  function quantileLegend(scale, f) {
    const q = scale.quantiles(); const cols = scale.range();
    const parts = cols.map((c, i) => {
      const lo = i === 0 ? null : q[i - 1], hi = i < q.length ? q[i] : null;
      const txt = lo == null ? `< ${f(hi)}` : hi == null ? `≥ ${f(lo)}` : `${f(lo)}–${f(hi)}`;
      return `<span><i style="background:${c}"></i>${txt}</span>`;
    });
    return `<div class="nyc-legend">${parts.join('')}<span><i style="background:#e4e4de"></i>no data</span></div>`;
  }

  // ═══════════════════════════════════════════════════════════════
  // TABS
  // ═══════════════════════════════════════════════════════════════
  const TABS = [
    { id: 'overview', label: 'Overview', letter: 'i', color: C.gray, render: renderOverview },
    { id: 'inspections', label: 'Restaurant Inspections', letter: 'R', color: C.red, render: renderInspections },
    { id: 'sales', label: 'Property Sales', letter: 'S', color: C.blue, render: renderSales },
    { id: 'licenses', label: 'Liquor Licenses', letter: 'L', color: C.purple, render: renderLicenses },
    { id: 'neighborhoods', label: 'Neighborhoods', letter: 'N', color: C.green, render: renderNeighborhoods },
    { id: 'food', label: 'Food Access', letter: 'F', color: C.orange, render: renderFood },
  ];
  let current = null;

  function buildTabBar() {
    const bar = document.getElementById('nyc-tabs');
    if (bar.childElementCount) return;
    bar.innerHTML = TABS.map((t) =>
      `<button type="button" class="nyc-tab" data-tab="${t.id}" onclick="nycShowTab('${t.id}')">` +
      `<span class="nyc-bullet${t.color === C.yellow ? ' dark-text' : ''}" style="background:${t.color}">${t.letter}</span>${t.label}</button>`).join('');
  }

  async function showTab(id) {
    const t = TABS.find((x) => x.id === id) || TABS[0];
    current = t.id;
    document.querySelectorAll('#nyc-tabs .nyc-tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === t.id));
    document.getElementById('nyc-crumb').textContent = '/ NYC Data Explorer / ' + t.label;
    const main = document.getElementById('nyc-main');
    main.innerHTML = '<div class="nyc-loading">Loading ' + esc(t.label) + '…</div>';
    document.getElementById('nyc-explorer').scrollTo(0, 0);
    try {
      await t.render(main);
    } catch (e) {
      console.error('[nyc-explorer]', e);
      main.innerHTML = `<div class="nyc-error">Couldn't load this tab: ${esc(e.message)}</div>`;
    }
    tip(null);
  }

  // ── OVERVIEW ─────────────────────────────────────────────────────
  async function renderOverview(main) {
    const man = await load('manifest');
    const g = (id) => man[id] || {};
    const yr = (v) => (v ? +String(v).slice(0, 4) : null);
    const insp = g('43nn-pn8j'), sales = g('w2pb-icbu'), act = g('9s3h-dpkz'), inact = g('6dg3-2z7i'),
      gap = g('4kc9-zrs2'), mkts = g('8vwk-6iz2'), snap = g('tc6u-8rnp'), nta = g('9nt8-h7nd');

    const inv = [
      ['Restaurant Inspections', 'DOHMH', '43nn-pn8j', PORTAL, insp.rows, 'one violation citation (or one clean inspection)', `${day(insp.first)} – ${day(insp.last)}`, 'lat/long, BBL, zip, <b>2010</b> NTA', 'inspections'],
      ['Property Sales', 'Dept. of Finance', 'w2pb-icbu', PORTAL, sales.rows, 'one recorded property sale', `${day(sales.first)} – ${day(sales.last)}`, 'lat/long, BBL, 2020 tract, <b>2020</b> NTA', 'sales'],
      ['Liquor Licenses — active', 'NYS Liquor Authority', '9s3h-dpkz', NYS_PORTAL, act.nyc_rows, 'one license currently active', `issued ${day(act.first)} – ${day(act.last)}`, 'lat/long, zip, county', 'licenses'],
      ['Liquor Licenses — inactive', 'NYS Liquor Authority', '6dg3-2z7i', NYS_PORTAL, inact.nyc_rows, 'one expired/surrendered license', `issued ${day(inact.first)} – ${day(inact.last)}`, 'lat/long, zip, county', 'licenses'],
      ['Neighborhood boundaries (NTA 2020)', 'Dept. of City Planning', '9nt8-h7nd', PORTAL, nta.rows, 'one neighborhood polygon', 'static (2020 Census geography)', '<b>2020</b> NTA code', 'neighborhoods'],
      ['Emergency Food Supply Gap', "Mayor's Office of Food Policy", '4kc9-zrs2', PORTAL, gap.rows, 'one neighborhood in one year', `${gap.first} – ${gap.last}`, '<b>2020</b> NTA code', 'food'],
      ['Farmers Markets', 'DOHMH', '8vwk-6iz2', PORTAL, mkts.rows, 'one market in one season', `${mkts.first} – ${mkts.last}`, 'lat/long', 'food'],
      ['SNAP Centers', 'Human Resources Admin.', 'tc6u-8rnp', PORTAL, snap.rows, 'one SNAP office', 'current list', 'lat/long, 2020 NTA', 'food'],
    ];
    const invRows = inv.map((d) => `<tr><td><a href="#" onclick="nycShowTab('${d[8]}');return false;"><b>${d[0]}</b></a><br><span class="muted" style="font-size:.76rem">${d[1]} · <a href="${d[3]}${d[2]}" target="_blank" rel="noopener"><code>${d[2]}</code></a></span></td>` +
      `<td class="num">${d[4] != null ? fmt(d[4]) : '—'}</td><td class="muted">${d[5]}</td><td>${d[6]}</td><td class="muted">${d[7]}</td></tr>`).join('');

    // Coverage strip: which calendar years each dataset actually has data for.
    const spans = [
      { name: 'Restaurant Inspections', color: C.red, from: 2022, to: yr(insp.last), thin: [2016, 2021], note: 'rolling ~3 yrs; only open restaurants' },
      { name: 'Property Sales', color: C.blue, from: yr(sales.first), to: yr(sales.last), note: '' },
      { name: 'Liquor — inactive', color: C.purple, from: 2012, to: yr(inact.last), note: 'licenses that have since closed' },
      { name: 'Liquor — active', color: C.purple, from: 2023, to: yr(act.last), thin: [2020, 2022], note: '"original issue" date reset — see tab' },
      { name: 'Food Supply Gap', color: C.orange, from: +gap.first, to: +gap.last, note: 'annual' },
      { name: 'Farmers Markets', color: C.green, from: +mkts.first, to: +mkts.last, note: 'one row per market per year' },
    ];
    const updated = Object.values(man).map((m) => m.pulled_at).filter(Boolean).sort().pop();

    main.innerHTML = `
      <div class="nyc-hero">
        <div class="nyc-eyebrow">MA491 · Project 2 · Understanding the data first</div>
        <h1 class="nyc-title">NYC Data Explorer</h1>
        <p class="nyc-lede">A tab-by-tab look at every NYC open dataset that might help answer a question about <strong>food and neighborhood change</strong>. Nothing here tests anything yet. Each tab just shows what one dataset actually contains: what a row is, which years and places it covers, what each field means, how complete it is, and the traps found while profiling it. More tabs get added as the project goes.</p>
      </div>
      ${panel('Every dataset so far', `<p>Row counts are live as of the last data pull (${day(updated)}). Click a name to open its tab.</p>
        <div class="nyc-table-wrap"><table class="nyc-table"><thead><tr><th>Dataset</th><th>Rows</th><th>One row is…</th><th>Coverage</th><th>Location fields</th></tr></thead><tbody>${invRows}</tbody></table></div>`, 'Inventory')}
      ${panel('Which years each dataset covers', `<p>The single most important thing to know before combining any of these: they don't cover the same years. Solid bars are where there's real volume. Faded bars are where a handful of records exist but too few to rely on.</p>${chartDiv('nyc-cov')}`, 'Coverage')}
      ${panel('How the datasets could connect', `<p>Different datasets use different location keys. These are the fields that <em>could</em> link them later. Linking hasn't been done here.</p>
        <div class="nyc-table-wrap"><table class="nyc-table"><thead><tr><th>Key</th><th>What it is</th><th>Found in</th></tr></thead><tbody>
          <tr><td class="mono">lat / long</td><td>Point location</td><td>Inspections, Sales, Licenses, Markets, SNAP</td></tr>
          <tr><td class="mono">NTA 2020</td><td>Neighborhood code like <code>BK0101</code> (262 areas)</td><td>Sales, Supply Gap, SNAP, NTA boundaries</td></tr>
          <tr><td class="mono">NTA 2010</td><td>Older neighborhood code like <code>BK90</code> (~195 areas). <b>Not the same system as 2020.</b></td><td>Inspections</td></tr>
          <tr><td class="mono">BBL</td><td>Borough-Block-Lot: one tax lot (a building's parcel)</td><td>Inspections, Sales</td></tr>
          <tr><td class="mono">zip code</td><td>USPS zip</td><td>Inspections, Sales, Licenses</td></tr>
        </tbody></table></div>`, 'Join keys')}
      ${panel('How this page is built', `<p>Every number comes from <code>nyc-data-explorer/build_explorer_data.py</code> in this site's repo. It queries the city and state open-data APIs directly, does the counting server-side, and writes the small JSON files this page reads. Rerunning it refreshes every tab. No API keys are needed.</p>`, 'Reproducibility')}
    `;

    // coverage strip
    const el = document.getElementById('nyc-cov');
    const y0 = 2009, y1 = 2027, W = 680, rh = 30, lw = 170, H = spans.length * rh + 26;
    const x = d3.scaleLinear().domain([y0, y1]).range([lw, W - 10]);
    const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`);
    svg.append('g').attr('class', 'gridline').attr('transform', `translate(0,${H - 22})`)
      .call(d3.axisBottom(x).ticks(9).tickFormat(d3.format('d')).tickSize(-(H - 22)));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - 22})`).call(d3.axisBottom(x).ticks(9).tickFormat(d3.format('d')));
    spans.forEach((s, i) => {
      const yy = i * rh + 6;
      svg.append('text').attr('class', 'nyc-cov-label').attr('x', 0).attr('y', yy + 9).text(s.name);
      svg.append('text').attr('class', 'nyc-cov-sub').attr('x', 0).attr('y', yy + 21).text(s.note);
      if (s.thin) svg.append('rect').attr('x', x(s.thin[0])).attr('width', x(s.thin[1] + 1) - x(s.thin[0])).attr('y', yy + 3).attr('height', 12).attr('rx', 3).attr('fill', s.color).attr('opacity', 0.18);
      svg.append('rect').attr('x', x(s.from)).attr('width', x(s.to + 1) - x(s.from)).attr('y', yy + 3).attr('height', 12).attr('rx', 3).attr('fill', s.color)
        .on('mousemove', (ev) => tip(`<b>${s.name}</b><br>${s.from}–${s.to}`, ev)).on('mouseleave', () => tip(null));
    });
  }

  // ── RESTAURANT INSPECTIONS ───────────────────────────────────────
  const INSPECTION_FIELDS = [
    ['camis', 'id', 'Permanent ID for one restaurant permit. The same CAMIS repeats on every row for that restaurant.'],
    ['dba', 'text', 'Business name ("doing business as"). The owner can change it.'],
    ['boro', 'text', 'Borough. Can disagree with the zip code for a few restaurants.'],
    ['building', 'text', 'Street number'], ['street', 'text', 'Street name'], ['zipcode', 'text', 'Zip code'],
    ['phone', 'text', 'Phone number given by the restaurant'],
    ['cuisine_description', 'category', 'Cuisine, <b>chosen by the owner</b>. One value per restaurant.'],
    ['inspection_date', 'date', 'Date of the inspection. <code>1900-01-01</code> means not inspected yet.'],
    ['action', 'category', 'What happened: violations cited, no violations, closed, re-opened…'],
    ['violation_code', 'code', 'Code of the specific violation on this row'],
    ['violation_description', 'text', 'Plain-text description of that violation'],
    ['critical_flag', 'category', '"Critical" = violations most likely to contribute to food-borne illness'],
    ['score', 'number', 'Total points for the inspection. Lower is better: 0–13 → A, 14–27 → B, 28+ → C.'],
    ['grade', 'category', 'Letter grade. N = not yet graded, Z / P = grade pending. Blank on most rows (see gotchas).'],
    ['grade_date', 'date', 'When the current grade was issued'],
    ['inspection_type', 'category', 'Inspection program + kind (initial, re-inspection, pre-permit, …)'],
    ['latitude', 'number', 'Geocoded latitude. 0 or blank when the address could not be geocoded.'], ['longitude', 'number', 'Geocoded longitude'],
    ['nta', 'code', 'Neighborhood code, <b>2010 vintage</b> (e.g. <code>BK90</code>)'],
    ['bbl', 'id', 'Tax lot ID. The same key the property data uses.'],
  ];

  async function renderInspections(main) {
    const d = await load('inspections');
    const graded = d.grades.filter((g) => g[0] !== '(blank)');
    const gradeColors = { A: C.blue, B: C.green, C: C.orange, N: C.gray, Z: C.purple, P: C.brown };
    const blankGrade = (d.grades.find((g) => g[0] === '(blank)') || [0, 0])[1];
    const cuisineBlank = (d.cuisine.find((c) => c[0] === '(blank)') || [0, 0])[1];
    const lastMonth = d.monthly[d.monthly.length - 1];

    main.innerHTML = `
      <div class="nyc-hero">
        <div class="nyc-eyebrow" style="color:${C.red}">Dataset · Department of Health (DOHMH)</div>
        <h1 class="nyc-title">Restaurant Inspection Results</h1>
        <p class="nyc-lede">Every health-inspection violation the city has cited at currently open restaurants, going back about three years. This is the richest food dataset NYC publishes: cuisine, location, and an inspection history for ~${fmt(Math.round(d.restaurants / 1000) * 1000)} restaurants. <a href="${PORTAL}${d.dataset}" target="_blank" rel="noopener">Open on NYC Open Data ↗</a></p>
      </div>
      ${stats([
        [fmt(d.total_rows), 'rows (one per violation cited)'],
        [fmt(d.restaurants), 'distinct restaurants (CAMIS)'],
        [fmt(d.inspections), 'distinct inspections (restaurant + date)'],
        [d.rows_per_inspection, 'rows per inspection, on average'],
        [day(d.first_date).replace(/^\w+ \d+, /, ''), `earliest real inspection (${day(d.first_date)})`],
        [day(d.last_date), 'most recent inspection'],
      ])}
      ${row(
        panel('What one row is', `<p><strong>One row = one violation cited during one inspection.</strong> An inspection that finds four problems produces four rows, each repeating the restaurant's name, address, date, and score. An inspection with no violations still gets one row.</p>
          ${meta([['Publisher', 'NYC Dept. of Health & Mental Hygiene'], ['Dataset ID', `<code>${d.dataset}</code>`], ['Updates', 'Daily (automated)'], ['Data pulled', day(d.record_date)], ['Who\'s included', 'Only restaurants <b>open on the pull date</b>']])}`, 'Structure'),
        panel('Gotchas found while profiling', gotchas([
          `<strong>Closed restaurants disappear.</strong> Only restaurants active on the pull date are included. A place that closed in 2024 has no rows at all, so this can't show which restaurants used to exist anywhere.`,
          `<strong>Rolling ~3-year window.</strong> Inspections older than ~3 years before a restaurant's latest one are dropped. Real volume starts in 2022 (see the timeline). The few 2007–2021 rows are long-lived restaurants' oldest kept records.`,
          `<strong>${fmt(d.placeholder_rows)} rows dated 1900-01-01.</strong> These are ${fmt(d.placeholder_restaurants)} new restaurants that have applied for a permit but haven't been inspected yet. That date is a placeholder, not a real one.`,
          `<strong>Grade is blank on ${pct(blankGrade, d.total_rows)} of rows.</strong> Grades are only given on certain inspection types, and the score/grade repeat on every violation row, so count per inspection, not per row.`,
          `<strong>Neighborhood codes are the old 2010 NTAs</strong> (${d.nta_codes_distinct} distinct codes), while the sales data uses 2020 NTAs. Latitude/longitude or BBL are the safer location keys.`,
          `<strong>${fmt(d.no_geo_restaurants)} restaurants have no usable coordinates</strong> and can't be placed on the map. ${(d.boro.find((b) => b[0] === '0') || [0, 0])[1]} restaurants have borough "0" (unknown).`,
        ]))
      )}
      ${panel('Inspections over time', `<p>Rows per month (excluding the 1900 placeholders). The ramp-up in 2022–23 is the rolling window filling in, not a real increase in inspections.</p>${chartDiv('nyc-i-monthly')}`, 'Coverage over time')}
      ${row(
        panel('Where the restaurants are', `<p>One dot per restaurant (${fmt(d.restaurants - d.no_geo_restaurants)} with coordinates), colored by borough. Hover a neighborhood for its name.</p>${mapDiv('nyc-i-map')}
          <div class="nyc-legend">${Object.entries(BORO_COLORS).map(([b, c]) => `<span><i style="background:${c}"></i>${b}</span>`).join('')}</div>`, 'Coverage over space'),
        panel('Restaurants per borough', `${chartDiv('nyc-i-boro')}<h3>Grades given (rows with a grade)</h3>${chartDiv('nyc-i-grades')}
          <p style="margin-top:.5rem">A = 0–13 points, B = 14–27, C = 28+. N = not yet graded, Z / P = grade pending.</p>`, 'Distributions')
      )}
      ${row(
        panel('Top 25 cuisines', `<p>Count of distinct restaurants. Cuisine is self-reported. ${fmt(cuisineBlank)} restaurants have none, mostly not-yet-inspected ones. ${d.cuisine.length} distinct values in total.</p>${chartDiv('nyc-i-cuisine')}`, 'Distributions'),
        panel('Inspection score distribution', `<p>One score per inspection (${fmt(d.scored_inspections)} scored inspections), in 5-point bins. Dashed lines mark the A/B and B/C cutoffs.</p>${chartDiv('nyc-i-score')}
          <h3>Most common violations</h3>${chartDiv('nyc-i-viol')}`, 'Distributions')
      )}
      ${row(
        panel('Inspection types', chartDiv('nyc-i-types'), 'What kind of visit'),
        panel('Critical vs. not', `${chartDiv('nyc-i-crit')}<h3>Actions taken</h3>${chartDiv('nyc-i-action')}`, 'Severity')
      )}
      ${panel('Fields', fieldTable(INSPECTION_FIELDS, d.missing_pct), 'Data dictionary')}
      ${panel('Sample rows', `<p>Six real rows pulled from 2026 inspections that cited a violation.</p>${sampleTable(d.sample, ['camis', 'dba', 'boro', 'zipcode', 'cuisine_description', 'inspection_date', 'inspection_type', 'violation_code', 'critical_flag', 'score', 'grade', 'nta'])}`, 'Raw data')}
    `;

    columns('#nyc-i-monthly', [{ name: 'rows', color: C.red, values: d.monthly.filter((m) => m[0] >= '2016').map((m) => [m[0], m[1]]) }],
      { maxTicks: 11, xFmt: (v) => (v.endsWith('-01') ? v.slice(0, 4) : v), unit: 'rows', xLabel: (v) => v });
    barH('#nyc-i-boro', d.boro, { total: d.restaurants, labelWidth: 110, color: (x) => BORO_COLORS[x[0]] || C.gray });
    barH('#nyc-i-grades', graded, { labelWidth: 110, color: (x) => gradeColors[x[0]] || C.gray, total: d3.sum(graded, (g) => g[1]) });
    barH('#nyc-i-cuisine', d.cuisine.slice(0, 25), { color: C.red, total: d.restaurants, barHeight: 16 });
    const sh = d.score_hist.map(([b, n]) => [b === 100 ? '100+' : `${b}–${b + 4}`, n]);
    columns('#nyc-i-score', [{ name: 'inspections', color: C.red, values: sh }], {
      sortX: false, height: 200, unit: 'inspections',
      colorFn: (v) => { const lo = parseInt(v[0], 10); return lo < 14 ? C.blue : lo < 28 ? C.green : C.orange; },
      legend: [{ name: 'A range (0–13)', color: C.blue }, { name: 'B range (14–27)', color: C.green }, { name: 'C range (28+)', color: C.orange }],
    });
    barH('#nyc-i-viol', d.top_violations.slice(0, 8).map((v) => [`${v[0]} · ${v[1]}`, v[2]]), { color: C.gray, labelWidth: 260, barHeight: 16 });
    barH('#nyc-i-types', d.inspection_types.slice(0, 14), { color: C.red, labelWidth: 260, barHeight: 16, total: d.total_rows });
    barH('#nyc-i-crit', d.critical, { color: (x) => (x[0] === 'Critical' ? C.orange : C.gray), labelWidth: 120, total: d.total_rows });
    barH('#nyc-i-action', d.actions.map((a) => [a[0].replace(/^(Establishment |Violations were cited in the following area\(s\)\.)/, (m) => (m.startsWith('V') ? 'Violations cited' : ''))
      .replace('No violations were recorded at the time of this inspection.', 'No violations'), a[1]]),
    { color: C.gray, labelWidth: 230, barHeight: 16, total: d.total_rows });
    const pts = await load('inspections_points');
    await nycMap('#nyc-i-map', { points: pts, pointColor: (p) => BORO_COLORS[p[2]] || C.gray, radius: 1.1, alpha: 0.5 });
  }

  // ── PROPERTY SALES ───────────────────────────────────────────────
  const SALES_FIELDS = [
    ['borough', 'code', 'Borough as a <b>number</b>: 1 = Manhattan, 2 = Bronx, 3 = Brooklyn, 4 = Queens, 5 = Staten Island'],
    ['neighborhood', 'text', "DOF assessors' own neighborhood name. <b>Not</b> the same as NTA neighborhoods."],
    ['building_class_category', 'category', 'Broad use, e.g. "01 ONE FAMILY DWELLINGS", "13 CONDOS - ELEVATOR APARTMENTS"'],
    ['address', 'text', 'Street address. Co-op sales put the apartment number in here too.'],
    ['apartment_number', 'text', 'Unit number, for condos'],
    ['zip_code', 'text', 'Zip code'],
    ['residential_units', 'number', 'Residential units at the property'],
    ['commercial_units', 'number', 'Commercial units at the property'],
    ['gross_square_feet', 'text', 'Total floor area of the building. Stored as <b>text with commas</b> ("2,400"). Blank or "0" for most condo/co-op units.'],
    ['land_square_feet', 'text', 'Lot size. Also text with commas.'],
    ['year_built', 'number', 'Year the structure was built'],
    ['sale_price', 'number', 'Price paid. <b>$0 = ownership transfer with no money</b> (e.g. to a family member or trust).'],
    ['sale_date', 'date', 'Date the deed was recorded as sold'],
    ['latitude', 'number', 'Building latitude'], ['longitude', 'number', 'Building longitude'],
    ['census_tract_2020', 'code', '2020 Census tract number (unique only within a borough)'],
    ['nta', 'code', 'Neighborhood code, <b>2020 vintage</b> (e.g. <code>MN0303</code>)'],
    ['bbl', 'id', 'Borough-Block-Lot tax lot ID'],
  ];

  const BORO_CODES = { 1: 'Manhattan', 2: 'Bronx', 3: 'Brooklyn', 4: 'Queens', 5: 'Staten Island' };

  async function renderSales(main) {
    const d = await load('sales');
    d.boro = d.boro.map(([b, n]) => [BORO_CODES[b] || b, n]).sort((x, y) => y[1] - x[1]);
    const market = d3.sum(d.by_year, (y) => y[2]);
    const resPrefixes = d.residential_prefixes;
    const resClasses = d.classes.filter((c) => resPrefixes.includes(c[0].slice(0, 2)));
    const ntaVals = Object.values(d.nta);

    main.innerHTML = `
      <div class="nyc-hero">
        <div class="nyc-eyebrow" style="color:${C.blue}">Dataset · Department of Finance (DOF)</div>
        <h1 class="nyc-title">Citywide Property Sales</h1>
        <p class="nyc-lede">Every recorded property sale in all five boroughs, ${d.first_date.slice(0, 4)} through ${d.last_date.slice(0, 4)}: price, date, building type, size, and location. It's the longest-running dataset in this explorer and the only one that goes back to 2016 in full. <a href="${PORTAL}${d.dataset}" target="_blank" rel="noopener">Open on NYC Open Data ↗</a></p>
      </div>
      ${stats([
        [fmt(d.total_rows), 'rows (one per recorded sale)'],
        [pct(d.zero_price, d.total_rows), `$0 transfers (${fmt(d.zero_price)} rows)`],
        [fmt(market), 'sales over $10,000'],
        [fmtMoney(d.median_market_price), 'median price, sales over $10K, all types, all years'],
        [`${d.first_date.slice(0, 4)}–${d.last_date.slice(0, 4)}`, `${day(d.first_date)} to ${day(d.last_date)}`],
        [d.nta_codes_distinct, 'distinct 2020 NTA codes'],
      ])}
      ${row(
        panel('What one row is', `<p><strong>One row = one recorded property sale.</strong> One building can appear many times (each condo unit sale is its own row, and a house sold twice shows up twice). It covers every property type, from one-family homes to office towers, vacant land and parking garages.</p>
          ${meta([['Publisher', 'NYC Department of Finance'], ['Dataset ID', `<code>${d.dataset}</code>`], ['Updates', 'Annually (each calendar year added once complete)'], ['Price unit', 'Nominal dollars, <b>not</b> adjusted for inflation']])}`, 'Structure'),
        panel('Gotchas found while profiling', gotchas([
          `<strong>${pct(d.zero_price + d.nominal_price, d.total_rows)} of rows aren't market sales.</strong> ${fmt(d.zero_price)} are $0 transfers and ${fmt(d.nominal_price)} more are $1–$10,000 (e.g. $10 deed transfers). Anything about "prices" needs to drop these first.`,
          `<strong>Every property type is mixed together.</strong> A $400M office tower and a $500K condo are both one row. The building-class field is the only way to separate them.`,
          `<strong>The same category is spelled two ways.</strong> ${d.class_spacing_duplicates} building classes appear both as "01 ONE FAMILY…" and "01&nbsp;&nbsp;ONE FAMILY…" (an extra space), so they have to be merged before counting.`,
          `<strong>Square footage is stored as text, and it's missing on ${pct(d.sqft_missing_or_zero, d.total_rows)} of rows.</strong> Values look like "2,400" (with a comma), so they need converting before any math. ${fmt(d.sqft_blank)} rows are blank and another ${fmt(d.sqft_zero)} are "0", which means missing too. The "Blank" column below only counts true blanks. Nearly all condo and co-op unit sales lack it, so price per square foot only works for some property types.`,
          `<strong>Borough is a number, not a name</strong> (1 = Manhattan … 5 = Staten Island), even though the official field description says "name".`,
          `<strong>2020 is thin</strong> (COVID: ${fmt((d.by_year.find((y) => y[0] === 2020) || [0, 0, 0])[2])} market sales vs. ${fmt((d.by_year.find((y) => y[0] === 2019) || [0, 0, 0])[2])} in 2019), and 2021 is a rebound spike.`,
          `<strong>"neighborhood" ≠ NTA.</strong> DOF's neighborhood names are the assessors' own. The <code>nta</code> column is the 2020 city-planning code that matches the boundary map.`,
        ]))
      )}
      ${panel('Sales per year', `<p>All rows vs. sales over $10,000. The gap between the two bars is the $0 / nominal transfers.</p>${chartDiv('nyc-s-year')}`, 'Coverage over time')}
      ${panel('Market sales per month', chartDiv('nyc-s-month'), 'Coverage over time')}
      ${row(
        panel('Where the sales are', `<p>Each 2020 neighborhood (NTA) shaded by its count of <b>residential</b> sales over $10K, all years combined. Hover for counts and the median price.</p>
          <div class="nyc-controls" id="nyc-s-toggle"><button class="nyc-chip active" data-m="n">Number of sales</button><button class="nyc-chip" data-m="med">Median price</button></div>
          ${mapDiv('nyc-s-map')}<div id="nyc-s-legend"></div>`, 'Coverage over space'),
        panel('Price distribution', `<p>All ${fmt(d.total_rows)} rows in price bands. The x-axis is roughly logarithmic.</p>${chartDiv('nyc-s-price')}
          <h3>Rows per borough</h3>${chartDiv('nyc-s-boro')}`, 'Distributions')
      )}
      ${panel('Building class categories (top 20)', `<p>After merging the spacing duplicates. Residential classes (1–3 family, condos, co-ops) are blue: ${fmt(d3.sum(resClasses, (c) => c[1]))} rows, ${pct(d3.sum(resClasses, (c) => c[1]), d.total_rows)} of the file.</p>${chartDiv('nyc-s-class')}`, 'What got sold')}
      ${panel('Fields', fieldTable(SALES_FIELDS, d.missing_pct), 'Data dictionary')}
      ${panel('Sample rows', `<p>Six real sales over $10K from mid-2025.</p>${sampleTable(d.sample, ['borough', 'neighborhood', 'building_class_category', 'address', 'zip_code', 'gross_square_feet', 'year_built', 'sale_price', 'sale_date', 'nta'])}`, 'Raw data')}
    `;

    columns('#nyc-s-year', [
      { name: 'All rows', color: '#b9c3dc', values: d.by_year.map((y) => [y[0], y[1]]) },
      { name: 'Sales over $10K', color: C.blue, values: d.by_year.map((y) => [y[0], y[2]]) },
    ], { unit: 'rows' });
    columns('#nyc-s-month', [{ name: 'sales', color: C.blue, values: d.monthly }], { maxTicks: 11, xFmt: (v) => (v.endsWith('-01') ? v.slice(0, 4) : ''), unit: 'sales over $10K' });
    const bandLabel = (lo, hi) => (lo === 0 ? '$0' : lo === 1 ? '$1–10K' : hi >= 1e13 ? '$50M+' : `${fmtMoney(lo)}–${fmtMoney(hi)}`);
    columns('#nyc-s-price', [{ name: 'rows', color: C.blue, values: d.price_hist.map(([lo, hi, n]) => [bandLabel(lo, hi), n]) }],
      { sortX: false, height: 220, maxTicks: 13, colorFn: (v) => (v[0] === '$0' || v[0] === '$1–10K' ? C.orange : C.blue), unit: 'rows',
        legend: [{ name: 'Not a market sale', color: C.orange }, { name: 'Over $10K', color: C.blue }] });
    barH('#nyc-s-boro', d.boro, { labelWidth: 110, color: (x) => BORO_COLORS[x[0]] || C.blue, total: d.total_rows });
    barH('#nyc-s-class', d.classes.slice(0, 20), { labelWidth: 280, barHeight: 16, total: d.total_rows,
      color: (x) => (resPrefixes.includes(x[0].slice(0, 2)) ? C.blue : C.gray) });

    const scales = {
      n: d3.scaleQuantile().domain(ntaVals.map((v) => v[0])).range(d3.schemeBlues[7]),
      med: d3.scaleQuantile().domain(ntaVals.map((v) => v[1])).range(d3.schemePuBu[7]),
    };
    const drawMap = (mode) => {
      const s = scales[mode];
      nycMap('#nyc-s-map', {
        fill: (f) => { const v = d.nta[f.properties.code]; return v ? s(mode === 'n' ? v[0] : v[1]) : '#e4e4de'; },
        tipExtra: (f) => { const v = d.nta[f.properties.code]; return v ? `${fmt(v[0])} residential sales · median ${fmtMoney(v[1])}` : 'no residential sales'; },
      });
      document.getElementById('nyc-s-legend').innerHTML = quantileLegend(s, mode === 'n' ? (v) => fmt(Math.round(v)) : fmtMoney);
    };
    document.querySelectorAll('#nyc-s-toggle .nyc-chip').forEach((b) => b.addEventListener('click', () => {
      document.querySelectorAll('#nyc-s-toggle .nyc-chip').forEach((x) => x.classList.toggle('active', x === b));
      drawMap(b.dataset.m);
    }));
    drawMap('n');
  }

  // ── LIQUOR LICENSES ──────────────────────────────────────────────
  const LICENSE_FIELDS = [
    ['licensepermitid', 'id', 'License ID'],
    ['premisescounty', 'text', 'County: New York = Manhattan, Kings = Brooklyn, Richmond = Staten Island'],
    ['description', 'category', 'License kind: Restaurant, Grocery Store, Liquor Store, Additional Bar…'],
    ['legalname / dba', 'text', 'Legal owner name and business name'],
    ['actualaddressofpremises', 'text', 'Street address of the licensed premises'],
    ['originalissuedate', 'date', 'Labeled "date license was issued". <b>For active licenses this is not the real opening date</b> (see gotchas).'],
    ['lastissuedate', 'date', 'Most recent renewal'],
    ['expirationdate', 'date', 'When the current term ends'],
    ['legacyserialnumber', 'id', "Serial number from the Liquor Authority's previous records system"],
    ['georeference', 'point', 'Geocoded location'],
  ];

  async function renderLicenses(main) {
    const d = await load('licenses');
    const a = d.active, n = d.inactive;
    const years = d3.range(2010, 2027);
    const val = (arr, y) => (arr.find((x) => x[0] === y) || [0, 0])[1];
    const boros = Object.keys(BORO_COLORS);

    main.innerHTML = `
      <div class="nyc-hero">
        <div class="nyc-eyebrow" style="color:${C.purple}">Dataset · New York State Liquor Authority</div>
        <h1 class="nyc-title">Liquor Licenses</h1>
        <p class="nyc-lede">Every business licensed to sell alcohol (restaurants, bars, grocery stores, liquor stores), filtered here to the five NYC counties. It comes as two separate state datasets: licenses that are <b>active now</b> and licenses that are <b>inactive</b> (expired, surrendered, or revoked). Open the <a href="${NYS_PORTAL}${d.datasets.active}" target="_blank" rel="noopener">active ↗</a> and <a href="${NYS_PORTAL}${d.datasets.inactive}" target="_blank" rel="noopener">inactive ↗</a> datasets on data.ny.gov.</p>
      </div>
      ${stats([
        [fmt(a.total_nyc), `active licenses in NYC (of ${fmt(a.total_statewide)} statewide)`],
        [fmt(n.total_nyc), `inactive licenses in NYC (of ${fmt(n.total_statewide)} statewide)`],
        [fmt(val(a.by_type, 'Restaurant') || (a.by_type.find((t) => t[0] === 'Restaurant') || [0, 0])[1]), 'active "Restaurant" licenses'],
        [pct(a.geocoded, a.total_nyc), 'of active licenses have coordinates'],
      ])}
      ${row(
        panel('What one row is', `<p><strong>One row = one license at one premises.</strong> A single restaurant can hold several (e.g. a "Restaurant" license plus an "Additional Bar" license). A grocery store selling beer has its own license type.</p>
          ${meta([['Publisher', 'NYS Liquor Authority (via data.ny.gov)'], ['Dataset IDs', `<code>${d.datasets.active}</code> (active), <code>${d.datasets.inactive}</code> (inactive)`], ['Updates', 'Daily'], ['Filtered to', 'Counties: New York, Kings, Queens, Bronx, Richmond']])}`, 'Structure'),
        panel('Gotchas found while profiling', gotchas([
          `<strong>The active list's "original issue date" isn't when a business opened.</strong> All ${fmt(a.total_nyc)} active NYC licenses have issue dates between ${day(a.first_issue)} and ${day(a.last_issue)}, and ${pct(val(a.by_year, 2025) + val(a.by_year, 2026), a.total_nyc)} fall in 2025–26. Every one also carries a <code>legacyserialnumber</code>. That pattern fits licenses being re-keyed when the state moved to a new records system, not thousands of businesses opening at once. Treat this date as "current license record created."`,
          `<strong>The inactive list has the longer history.</strong> Its issue dates run from 2012 onward with steady yearly volume, but it only contains licenses that have since ended.`,
          `<strong>Two datasets, two spellings.</strong> The active file uses <code>premisescounty</code> and <code>originalissuedate</code>, and the inactive file uses <code>premises_county</code> and <code>original_issue_date</code>. They have to be renamed before stacking.`,
          `<strong>Not just restaurants.</strong> "Grocery Store" licenses (bodegas and supermarkets selling beer) are the second-largest group. Filter on <code>description</code> to get just restaurants and bars.`,
        ]))
      )}
      ${panel('Licenses by issue year', `<p>Purple = active, gray = inactive. Note how differently the two are distributed across years. That's the date-reset gotcha above, visible in the data.</p>${chartDiv('nyc-l-years')}`, 'Coverage over time')}
      ${row(
        panel('Active licenses on the map', `<p>Licenses counted in ~400 m grid squares. Darker = more licenses.</p>${mapDiv('nyc-l-map-a')}`, 'Coverage over space'),
        panel('Inactive licenses on the map', `<p>Same grid, inactive file.</p>${mapDiv('nyc-l-map-i')}`, 'Coverage over space')
      )}
      ${row(
        panel('License types: active', chartDiv('nyc-l-type-a'), 'Distributions'),
        panel('License types: inactive', chartDiv('nyc-l-type-i'), 'Distributions')
      )}
      ${panel('By borough', chartDiv('nyc-l-boro'), 'Distributions')}
      ${panel('Fields (active file)', fieldTable(LICENSE_FIELDS, null), 'Data dictionary')}
      ${panel('Sample rows', `<p>Six active Brooklyn licenses with 2024+ issue dates.</p>${sampleTable(d.sample)}`, 'Raw data')}
    `;

    columns('#nyc-l-years', [
      { name: 'Active', color: C.purple, values: years.map((y) => [y, val(a.by_year, y)]) },
      { name: 'Inactive', color: '#b5b6b8', values: years.map((y) => [y, val(n.by_year, y)]) },
    ], { unit: 'licenses' });
    await nycMap('#nyc-l-map-a', { grid: a.grid, gridLegend: 'licenses per square' });
    await nycMap('#nyc-l-map-i', { grid: n.grid, gridInterp: d3.interpolateGreys, gridLegend: 'licenses per square' });
    barH('#nyc-l-type-a', a.by_type.slice(0, 12), { color: C.purple, total: a.total_nyc, labelWidth: 180, barHeight: 16 });
    barH('#nyc-l-type-i', n.by_type.slice(0, 12), { color: C.gray, total: n.total_nyc, labelWidth: 180, barHeight: 16 });
    columns('#nyc-l-boro', [
      { name: 'Active', color: C.purple, values: boros.map((b) => [b, a.by_boro[b] || 0]) },
      { name: 'Inactive', color: '#b5b6b8', values: boros.map((b) => [b, n.by_boro[b] || 0]) },
    ], { sortX: false, height: 200, unit: 'licenses' });
  }

  // ── NEIGHBORHOODS ────────────────────────────────────────────────
  async function renderNeighborhoods(main) {
    const d = await load('neighborhoods');
    const geo = await load('nta2020');
    const typeColors = { Residential: '#c9d8c5', Park: C.green, Cemetery: C.gray, Airport: C.blue, 'Rikers Island': C.red, 'Other special-use': C.yellow };
    const areas = geo.features.filter((f) => f.properties.type === 'Residential').map((f) => f.properties.area_sqmi);

    main.innerHTML = `
      <div class="nyc-hero">
        <div class="nyc-eyebrow" style="color:${C.green}">Geography · Department of City Planning</div>
        <h1 class="nyc-title">Neighborhoods (NTA 2020)</h1>
        <p class="nyc-lede">Neighborhood Tabulation Areas are the city's standard "neighborhood" unit: ${d.count} areas built from 2020 Census tracts, each with roughly 15,000+ residents. Any neighborhood-level comparison between the datasets in this explorer would use these boundaries. <a href="${PORTAL}${d.dataset}" target="_blank" rel="noopener">Open on NYC Open Data ↗</a></p>
      </div>
      ${stats([
        [d.count, 'NTAs in total'],
        [d.by_type.Residential, 'residential NTAs'],
        [d.count - d.by_type.Residential, 'parks, cemeteries, airports, Rikers & other'],
        [d3.median(areas).toFixed(2), 'median residential NTA area (sq mi)'],
      ])}
      ${row(
        panel('The map', `<p>Shaded by NTA type. Hover any area for its code and name.</p>${mapDiv('nyc-n-map')}
          <div class="nyc-legend">${Object.entries(typeColors).map(([t, c]) => `<span><i style="background:${c}"></i>${t} (${d.by_type[t] || 0})</span>`).join('')}</div>`, 'Boundaries'),
        panel('Reading an NTA code', `<p><code>BK0101</code> = <b>BK</b> (Brooklyn) + <b>01</b> (community district 1) + <b>01</b> (first NTA in it). The first four characters are the <b>CDTA</b>, the community-district-sized area each NTA nests inside.</p>
          <h3>Residential NTAs per borough</h3>${chartDiv('nyc-n-boro')}
          <h3>Gotchas</h3>${gotchas([
            `<strong>2010 vs. 2020 NTAs are different systems.</strong> 2010 codes look like <code>BK90</code> (~195 areas) and 2020 codes like <code>BK0101</code> (${d.count}). The boundaries were redrawn, so there's no one-to-one lookup. Restaurant inspections still use 2010 codes. Sales, the food supply gap, and SNAP use 2020.`,
            `<strong>${d.count - d.by_type.Residential} NTAs have almost no residents</strong> (parks, cemeteries, airports, Rikers). Anything "per neighborhood" should usually drop them.`,
            `<strong>Population isn't on the portal for 2020 NTAs.</strong> The city's NTA population table (<code>swpk-hqdp</code>) only covers 2000/2010 on the old boundaries. 2020 counts would come from the Census API (free key) via the tract→NTA table <code>hm78-6dwm</code>.`,
          ])}`, 'How it works')
      )}
      ${panel('Area of each residential NTA', `<p>Square miles, computed from the boundary polygons. Hover for the name.</p>${chartDiv('nyc-n-area')}`, 'Distribution')}
      ${panel('Fields', fieldTable(d.fields, null), 'Data dictionary')}
    `;

    await nycMap('#nyc-n-map', { fill: (f) => typeColors[f.properties.type] || '#ddd' });
    barH('#nyc-n-boro', Object.entries(d.residential_by_boro).sort((x, y) => y[1] - x[1]), { labelWidth: 110, color: (x) => BORO_COLORS[x[0]] || C.green });
    const res = geo.features.filter((f) => f.properties.type === 'Residential')
      .map((f) => [f.properties.code, f.properties.area_sqmi, f.properties.name, f.properties.boro]).sort((x, y) => x[1] - y[1]);
    const el = document.getElementById('nyc-n-area');
    const W = 680, H = 200, m = { t: 8, r: 8, b: 22, l: 40 };
    const x = d3.scaleBand().domain(res.map((r) => r[0])).range([m.l, W - m.r]).padding(0.1);
    const y = d3.scaleLinear().domain([0, d3.max(res, (r) => r[1])]).nice().range([H - m.b, m.t]);
    const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`);
    svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5));
    svg.append('text').attr('x', m.l).attr('y', H - 4).text('← smallest');
    svg.append('text').attr('x', W - m.r).attr('y', H - 4).attr('text-anchor', 'end').text('largest →');
    svg.selectAll('rect').data(res).join('rect').attr('x', (r) => x(r[0])).attr('width', x.bandwidth())
      .attr('y', (r) => y(r[1])).attr('height', (r) => y(0) - y(r[1])).attr('fill', (r) => BORO_COLORS[r[3]] || C.green)
      .on('mousemove', (ev, r) => tip(`<b>${esc(r[2])}</b> <span class="mono">${r[0]}</span><br>${r[1].toFixed(2)} sq mi`, ev)).on('mouseleave', () => tip(null));
  }

  // ── FOOD ACCESS ──────────────────────────────────────────────────
  const GAP_FIELDS = [
    ['year', 'number', 'Analysis year'],
    ['nta / nta_name', 'code', '2020 NTA code and name'],
    ['supply_gap_lbs', 'number', 'Estimated pounds of emergency food <b>needed</b> minus pounds <b>supplied</b>, per year'],
    ['food_insecure_percentage', 'share', 'Estimated share of residents who are food insecure'],
    ['unemployment_rate', 'share', 'Unemployment rate (ACS 5-year estimates)'],
    ['vulnerable_population', 'score', 'Presence of residents 65+, under 18, non-citizen foreign-born, or veterans (ACS)'],
    ['weighted_score', 'score', 'The city\'s combined need score from the variables above'],
    ['rank', 'number', 'Rank of the weighted score (1 = highest need)'],
  ];

  async function renderFood(main) {
    const d = await load('food_access');
    const years = Object.keys(d.gap).sort();
    const latest = years[years.length - 1];
    const mk = d.markets.map(([name, boro, year, ebt, yr, lon, lat, st]) => ({ name, boro, year, ebt, yr, lon, lat, st }));
    const stCount = d3.rollups(mk, (v) => v.length, (m) => m.st).sort((a, b) => b[1] - a[1]);
    const stYears = (st) => { const ys = [...new Set(mk.filter((m) => m.st === st).map((m) => m.year))].sort(); return ys.length > 3 ? `${ys[0]}–${ys[ys.length - 1]}` : ys.join(', '); };
    const mkByYear = d3.rollups(mk, (v) => v.length, (m) => m.year).sort((a, b) => (a[0] < b[0] ? -1 : 1));
    const latestYear = d.market_years[d.market_years.length - 1];
    const latestAll = mk.filter((m) => m.year === latestYear);
    const latestMk = latestAll.filter((m) => m.lat != null);
    const gapRows = years.map((y) => [y, Object.keys(d.gap[y]).length]);
    const metrics = {
      score: ['Need score (weighted)', (v) => v.score, d3.schemeOrRd[7], (v) => v.toFixed(2)],
      food_insecure: ['% food insecure', (v) => v.food_insecure, d3.schemeOrRd[7], (v) => (v * 100).toFixed(1) + '%'],
      gap_lbs: ['Supply gap (lbs)', (v) => v.gap_lbs, d3.schemeRdBu[7].slice().reverse(), (v) => d3.format('~s')(v)],
    };

    main.innerHTML = `
      <div class="nyc-hero">
        <div class="nyc-eyebrow" style="color:${C.orange}">Datasets · Food Policy, Health Dept., HRA</div>
        <h1 class="nyc-title">Food Access</h1>
        <p class="nyc-lede">Three smaller datasets about where food help and fresh food are: the city's yearly <b>Emergency Food Supply Gap</b> by neighborhood, the list of <b>farmers markets</b> by season, and <b>SNAP centers</b> (food-stamp offices). Open <a href="${PORTAL}${d.datasets.gap}" target="_blank" rel="noopener">Supply Gap ↗</a>, <a href="${PORTAL}${d.datasets.markets}" target="_blank" rel="noopener">Farmers Markets ↗</a>, or <a href="${PORTAL}${d.datasets.snap}" target="_blank" rel="noopener">SNAP Centers ↗</a> on NYC Open Data.</p>
      </div>
      ${stats([
        [years.length, `years of supply-gap data (${years[0]}–${latest})`],
        [Object.keys(d.gap[latest]).length, `neighborhoods scored in ${latest}`],
        [fmt(mk.length), `farmers-market rows (${d.market_years[0]}–${d.market_years[d.market_years.length - 1]})`],
        [d.snap.length, 'SNAP centers citywide'],
      ])}
      ${row(
        panel('Emergency Food Supply Gap', `<p><strong>One row = one neighborhood (2020 NTA) in one year.</strong> Published by the Mayor's Office of Food Policy, annually. It combines estimated need (food insecurity, unemployment, vulnerable groups from Census ACS) with how much emergency food actually reaches each neighborhood. It's a <em>modeled</em> estimate, not a direct count.</p>
          <div class="nyc-controls" id="nyc-f-metric">${Object.entries(metrics).map(([k, m], i) => `<button class="nyc-chip${i === 0 ? ' active' : ''}" data-k="${k}">${m[0]}</button>`).join('')}</div>
          <div class="nyc-controls" id="nyc-f-year">${years.map((y) => `<button class="nyc-chip${y === latest ? ' active' : ''}" data-y="${y}">${y}</button>`).join('')}</div>
          ${mapDiv('nyc-f-map')}<div id="nyc-f-legend"></div>`, 'Map'),
        panel('Gotchas found while profiling', gotchas([
          `<strong>It's a model output, not a measurement.</strong> Need is estimated from survey data (ACS), so small neighborhoods carry wide uncertainty that the file doesn't report.`,
          `<strong>Row counts per year differ</strong> (${gapRows.map((r) => `${r[0]}: ${r[1]}`).join(', ')}), so not every neighborhood is in every year.`,
          `<strong>Supply gap is in pounds, not per person.</strong> Big neighborhoods have bigger numbers just from being bigger. A negative gap means more food was supplied than the estimated need.`,
          `<strong>Farmers markets are one row per market <em>per season</em>.</strong> The same market repeats every year it operated, so count distinct markets within a year, not across the file.`,
          `<strong>Farmers-market coordinates are only usable for ${pct((stCount.find((s) => s[0] === 'ok') || [0, 0])[1], mk.length)} of rows.</strong> ${stYears('missing')} rows have none, every ${stYears('lat/long swapped')} row has latitude and longitude swapped, and later years have scattered entry errors (see the table below).`,
          `<strong>Yes/No fields aren't standardized.</strong> "Open year-round" has ${d.year_round_values.length} different values, including ${d.year_round_values.map((v) => `"${esc(v[0])}"`).slice(0, 6).join(', ')}…`,
          `<strong>SNAP centers are tiny:</strong> only ${d.snap.length} offices citywide. It's a list of where to apply, not a measure of food access.`,
        ]))
      )}
      ${row(
        panel('Farmers markets per season', chartDiv('nyc-f-mkyear'), 'Coverage over time'),
        panel(`Farmers markets & SNAP centers, ${d.market_years[d.market_years.length - 1]}`, `<p>Green = farmers market (${latestMk.length} of ${latestAll.length} have usable coordinates), red = SNAP center. Hover a dot for details.</p>${mapDiv('nyc-f-pts')}`, 'Coverage over space')
      )}
      ${panel('Farmers-market coordinate quality', `<p>Every row's latitude/longitude, checked against a box around NYC. Only "ok" rows are drawn on the map above.</p>
        <div class="nyc-table-wrap"><table class="nyc-table"><thead><tr><th>Status</th><th>Rows</th><th>Share</th><th>Years it occurs</th></tr></thead><tbody>${
          stCount.map(([s, n]) => `<tr><td>${esc(s)}</td><td class="num">${fmt(n)}</td><td class="num">${pct(n, mk.length)}</td><td class="muted">${stYears(s)}</td></tr>`).join('')}</tbody></table></div>`, 'Data quality')}
      ${panel('Supply Gap fields', fieldTable(GAP_FIELDS, null), 'Data dictionary')}
      ${panel('Sample rows: farmers markets', sampleTable(d.market_sample), 'Raw data')}
    `;

    let metric = 'score', year = latest;
    const draw = () => {
      const [label, get, range, f] = metrics[metric];
      const vals = Object.values(d.gap[year]).map(get);
      const s = d3.scaleQuantile().domain(vals).range(range);
      nycMap('#nyc-f-map', {
        fill: (ft) => { const v = d.gap[year][ft.properties.code]; return v ? s(get(v)) : '#e4e4de'; },
        tipExtra: (ft) => { const v = d.gap[year][ft.properties.code]; return v ? `${label}: <b>${f(get(v))}</b><br>rank ${v.rank} · food insecure ${(v.food_insecure * 100).toFixed(1)}%` : `not in ${year} file`; },
      });
      document.getElementById('nyc-f-legend').innerHTML = quantileLegend(s, f);
    };
    document.querySelectorAll('#nyc-f-metric .nyc-chip').forEach((b) => b.addEventListener('click', () => {
      metric = b.dataset.k; document.querySelectorAll('#nyc-f-metric .nyc-chip').forEach((x) => x.classList.toggle('active', x === b)); draw();
    }));
    document.querySelectorAll('#nyc-f-year .nyc-chip').forEach((b) => b.addEventListener('click', () => {
      year = b.dataset.y; document.querySelectorAll('#nyc-f-year .nyc-chip').forEach((x) => x.classList.toggle('active', x === b)); draw();
    }));
    draw();
    columns('#nyc-f-mkyear', [{ name: 'markets', color: C.green, values: mkByYear }], { height: 200, unit: 'markets' });
    await nycMap('#nyc-f-pts', {
      markers: [
        ...latestMk.map((m) => ({ lon: m.lon, lat: m.lat, color: C.green, tip: `<b>${esc(m.name)}</b><br>${esc(m.boro)} · EBT: ${esc(m.ebt)} · year-round: ${esc(m.yr)}` })),
        ...d.snap.filter((s) => s.lat).map((s) => ({ lon: s.lon, lat: s.lat, color: C.red, tip: `<b>${esc(s.name)}</b><br>${esc(s.address)}<br>${esc(s.hours)}` })),
      ], markerR: 4.5,
    });
  }

  // ── open / close (same overlay mechanics as the site's other rooms) ─
  window.openNycExplorer = function (tab) {
    document.getElementById('project-detail').classList.remove('open');
    if (typeof closeAllToolOverlays === 'function') closeAllToolOverlays();
    document.getElementById('nyc-explorer').classList.add('open');
    document.getElementById('main-site').classList.add('hidden');
    window.scrollTo(0, 0);
    buildTabBar();
    if (window.lucide) lucide.createIcons();
    showTab(tab || current || 'overview');
  };
  window.closeNycExplorer = function () {
    document.getElementById('nyc-explorer').classList.remove('open');
    document.getElementById('main-site').classList.remove('hidden');
    tip(null);
  };
  window.nycShowTab = showTab;
})();
