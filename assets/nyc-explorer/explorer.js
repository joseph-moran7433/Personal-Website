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
      }).then((j) => (name === 'nta2020' ? rewind(j) : name === 'case_bushwick_tracts' ? (rewind(j.geo), j) : j));
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
        const maxN = o.gridMax || d3.max(o.grid, (d) => d[2]);
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
    { id: 'overview', label: 'Overview', letter: 'i', color: C.gray, render: renderOverview, group: 'Food & neighborhoods' },
    { id: 'inspections', label: 'Restaurant Inspections', letter: 'R', color: C.red, render: renderInspections, group: 'Food & neighborhoods' },
    { id: 'sales', label: 'Property Sales', letter: 'S', color: C.blue, render: renderSales, group: 'Food & neighborhoods' },
    { id: 'licenses', label: 'Liquor Licenses', letter: 'L', color: C.purple, render: renderLicenses, group: 'Food & neighborhoods' },
    { id: 'neighborhoods', label: 'Neighborhoods', letter: 'N', color: C.green, render: renderNeighborhoods, group: 'Food & neighborhoods' },
    { id: 'food', label: 'Food Access', letter: 'F', color: C.orange, render: renderFood, group: 'Food & neighborhoods' },
    { id: 'questions', label: 'Question Map', letter: '?', color: C.ink, render: renderQuestions, group: 'Gentrification signals' },
    { id: 'turnover', label: 'Business Turnover', letter: 'T', color: C.blue, render: renderTurnover, group: 'Gentrification signals' },
    { id: 'chains', label: 'Chains & Lists', letter: 'C', color: C.red, render: renderChains, group: 'Gentrification signals' },
    { id: 'rent', label: 'Rent', letter: '$', color: C.orange, render: renderRent, group: 'Gentrification signals' },
    { id: 'values', label: 'Property Values', letter: 'V', color: C.purple, render: renderValues, group: 'Gentrification signals' },
    { id: 'construction', label: 'Construction', letter: 'K', color: C.green, render: renderConstruction, group: 'Gentrification signals' },
    { id: 'capital', label: 'Capital Spending', letter: 'P', color: C.brown, render: renderCapital, group: 'Gentrification signals' },
    { id: 'schools', label: 'Schools', letter: 'E', color: C.teal, render: renderSchools, group: 'Gentrification signals' },
    { id: 'crime', label: 'Crime', letter: 'X', color: C.ink, render: renderCrime, group: 'Gentrification signals' },
    { id: 'subway', label: 'Subway', letter: 'M', color: C.yellow, render: renderSubway, group: 'Gentrification signals' },
    { id: 'fires', label: 'Fires', letter: 'F', color: C.red, render: renderFires, group: 'Gentrification signals' },
  ];
  let current = null;

  function buildTabBar() {
    const bar = document.getElementById('nyc-tabs');
    if (bar.childElementCount) return;
    const groups = [...new Set(TABS.map((t) => t.group))];
    bar.innerHTML = groups.map((g) => `<div class="nyc-tab-group"><span class="nyc-tab-group-label">${esc(g)}</span><div class="nyc-tab-list">${TABS.filter((t) => t.group === g).map((t) =>
      `<button type="button" class="nyc-tab" data-tab="${t.id}" onclick="nycShowTab('${t.id}')">` +
      `<span class="nyc-bullet${t.color === C.yellow ? ' dark-text' : ''}" style="background:${t.color}">${t.letter}</span>${esc(t.label)}</button>`).join('')}</div></div>`).join('');
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
      <div class="nyc-note" style="margin-bottom:1.25rem"><b>New:</b> the project question has narrowed to <b>neighborhood change / gentrification signals</b>. The ${tabLink('questions', 'Question Map')} matches each idea from the project notes to the data that could measure it, and the "Gentrification signals" tabs profile that data.</div>
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

  // ═══════════════════════════════════════════════════════════════
  // GENTRIFICATION SIGNALS (added 2026-10-06)
  // One tab per family of candidate signals from the project notes.
  // Same rule as the food tabs: describe what each dataset contains and
  // what it can / can't measure. No signal is tested or compared here.
  // ═══════════════════════════════════════════════════════════════

  // Multi-series line chart. series = [{name, color, values: [[x, y], ...]}].
  // x is a 'YYYY-MM' string (o.time) or a number (year). null y = gap.
  function lines(sel, series, o = {}) {
    const el = document.querySelector(sel); if (!el) return;
    const W = o.width || 680, H = o.height || 240, m = { t: 10, r: o.right || 12, b: 28, l: 56 };
    const px = o.time ? (v) => new Date(v + '-15T12:00:00') : (v) => +v;
    const all = series.flatMap((s) => s.values.filter((v) => v[1] != null));
    const x = (o.time ? d3.scaleTime() : d3.scaleLinear()).domain(d3.extent(all, (v) => px(v[0]))).range([m.l, W - m.r]);
    const y = d3.scaleLinear().domain([o.yMin ?? 0, d3.max(all, (v) => v[1]) || 1]).nice().range([H - m.b, m.t]);
    const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`);
    svg.append('g').attr('class', 'gridline').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(W - m.l - m.r)).tickFormat(''));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(o.yFmt || d3.format('~s')));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`)
      .call(d3.axisBottom(x).ticks(o.ticks || 10).tickFormat(o.time ? d3.timeFormat('%Y') : d3.format('d')));
    const line = d3.line().defined((v) => v[1] != null).x((v) => x(px(v[0]))).y((v) => y(v[1]));
    if (o.hline != null) { // reference level, e.g. 1.0 on a ratio chart
      svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(o.hline)).attr('y2', y(o.hline)).attr('stroke', C.gray).attr('stroke-width', 1);
    }
    (o.marks || []).forEach(([at, label]) => { // dashed verticals for breaks / events
      const xx = x(px(at)); if (!(xx >= m.l && xx <= W - m.r)) return;
      svg.append('line').attr('x1', xx).attr('x2', xx).attr('y1', m.t).attr('y2', H - m.b).attr('stroke', C.gray).attr('stroke-dasharray', '3 3');
      if (label) svg.append('text').attr('x', xx + 3).attr('y', m.t + 9).attr('font-size', 10).text(label);
    });
    series.forEach((s) => {
      svg.append('path').datum(s.values).attr('fill', 'none').attr('stroke', s.color).attr('stroke-width', s.width || 2)
        .attr('stroke-dasharray', s.dash || null).attr('opacity', s.opacity ?? 1).attr('d', line);
      if (o.dots !== false && s.values.length < 40) {
        svg.append('g').selectAll('circle').data(s.values.filter((v) => v[1] != null)).join('circle')
          .attr('cx', (v) => x(px(v[0]))).attr('cy', (v) => y(v[1])).attr('r', 3.2).attr('fill', s.color)
          .on('mousemove', (ev, v) => tip(`<b>${esc(s.name)}</b><br>${v[0]}: ${o.valFmt ? o.valFmt(v[1]) : fmt(v[1])}`, ev)).on('mouseleave', () => tip(null));
      }
    });
    if (o.time) { // hover rule for dense monthly series
      const xs = [...new Set(all.map((v) => v[0]))].sort();
      svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', W - m.l - m.r).attr('height', H - m.t - m.b).attr('fill', 'transparent')
        .on('mousemove', (ev) => {
          const [mx] = d3.pointer(ev); const d = x.invert(mx);
          const k = xs.reduce((a, b) => (Math.abs(px(b) - d) < Math.abs(px(a) - d) ? b : a), xs[0]);
          tip(`<b>${k}</b><br>${series.map((s) => { const v = s.values.find((q) => q[0] === k); return v && v[1] != null ? `${esc(s.name)}: ${o.valFmt ? o.valFmt(v[1]) : fmt(v[1])}` : ''; }).filter(Boolean).join('<br>')}`, ev);
        }).on('mouseleave', () => tip(null));
    }
    if (series.length > 1) el.insertAdjacentHTML('beforeend', `<div class="nyc-legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>`);
  }

  const portalLink = (id, label, nys) => `<a href="${nys ? NYS_PORTAL : PORTAL}${id}" target="_blank" rel="noopener">${label || 'Open on ' + (nys ? 'data.ny.gov ↗' : 'NYC Open Data ↗')}</a>`;
  const hero = (color, eyebrow, title, lede) => `<div class="nyc-hero"><div class="nyc-eyebrow" style="color:${color}">${eyebrow}</div><h1 class="nyc-title">${title}</h1><p class="nyc-lede">${lede}</p></div>`;
  const simpleTable = (head, rows) => `<div class="nyc-table-wrap"><table class="nyc-table"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const tabLink = (id, label) => `<a href="#" onclick="nycShowTab('${id}');return false;">${label}</a>`;
  const pivot = (rows, keep) => { // [[year, cat, n], ...] -> {cat: [[year, n], ...]}
    const out = {}; rows.forEach(([y, c, n]) => { if (keep && !keep.includes(c)) return; (out[c] = out[c] || []).push([y, n]); });
    Object.values(out).forEach((v) => v.sort((a, b) => (a[0] < b[0] ? -1 : 1))); return out;
  };
  const PALETTE = [C.blue, C.red, C.green, C.orange, C.purple, C.teal, C.brown, C.gray, C.yellow];
  const BORO_CODE = { Manhattan: 'MN', Brooklyn: 'BK', Queens: 'QN', Bronx: 'BX', 'Staten Island': 'SI' };

  // ── QUESTION MAP ─────────────────────────────────────────────────
  // Each idea from the project notes -> which data could speak to it,
  // and how ready that data is. Readiness is about data, not results.
  const READY = {
    good: ['Data exists', C.green],
    partial: ['Partial / proxy', C.orange],
    gap: ['Gap: not open data', C.red],
  };
  const IDEAS = [
    ['Turnover vs. new business openings', 'turnover', 'partial',
      'Storefront registry (vacant/occupied per storefront, yearly) · DCWP licenses (create/expire dates) · liquor licenses (issue dates; inactive file = closures) · inspections (first inspection, pending permits)',
      '2019–2024 (storefronts) · 1994–2026 (DCWP) · 2012–2026 (liquor)', 'BBL, lat/long, 2020 NTA',
      'Openings show up in several places. Closures only appear in the liquor "inactive" file and storefront vacancy. Closed restaurants are <b>removed</b> from inspections.'],
    ['Where fast-food chains choose to open', 'chains', 'partial',
      'Restaurant inspections, chain names matched from the business name (DBA)', '~2022–2026 (rolling window)', 'lat/long, BBL',
      'Current chain locations are complete. <b>When</b> each opened is only visible from 2022 on. An older 2017 inspection snapshot exists off-portal (Kaggle / p8105).'],
    ['Rent price over time', 'rent', 'partial',
      'StreetEasy median asking rent (monthly) · Census ACS median gross rent · DOF storefront rent per sq ft', '2010–2026 · 2005–2024 · 2019–2024', 'StreetEasy names (≠ NTA) · tract / borough · tract',
      'StreetEasy is asking rent on listed units. ACS is rent actually paid, but tract values are overlapping 5-year averages on boundaries that change in 2010 and 2020.'],
    ['Property value % change over time', 'values', 'good',
      'DOF sales (every recorded sale) · DOF assessment roll (market value of every lot, yearly)', '2016–2025 · 2010/11–2018/19 + 2023–2027', 'BBL, 2020 NTA (sales)',
      'Assessment rolls are missing 2019/20–2022/23 on the portal. Sales are thin in some NTA-years (see tab).'],
    ['Value relative to surrounding area / whole city', 'values', 'good',
      'Same as above, plus a citywide benchmark series', 'same', 'NTA, borough, city',
      'This is a choice of denominator, not a new dataset. The tab shows how many sales each NTA-year has to support it.'],
    ['Money going into infrastructure', 'capital', 'partial',
      'Capital Projects Database (CPDB) · Capital Commitment Plan · DOT street-construction permits', 'current plan snapshot · 32 plan editions 2016–2026 · 2022–2026', 'points/polygons for ~35% of projects · none',
      'Only about a third of capital projects carry a location. The commitment plan has budget lines but no geography.'],
    ['Rising public-school ratings', 'schools', 'good',
      'School Quality Reports · state ELA & Math test results by school · school locations', '2015–2024 · 2013–2023 (no 2020–21) · 2019–20 snapshot', 'school DBN → lat/long, 2010 NTA, district',
      'Test formats changed in 2018 and 2023, which breaks year-to-year comparisons. Schools ≠ residents (choice & zoning).'],
    ['Prices × business longevity (interaction)', 'turnover', 'partial',
      'Built from the two rows above: storefront/DCWP longevity + sales/assessed values', 'overlap ≈ 2019–2024', '<b>BBL</b> is in storefronts, sales, assessments, inspections',
      'A shared tax-lot key exists in all the needed tables. The join itself hasn\'t been built.'],
    ['Published restaurant data (reviews, guides)', 'chains', 'partial',
      'Michelin Guide (community-maintained scrape) · MenuStat (national chain menus, 2017–18)', 'current list only · 2017–18', 'lat/long',
      'Yelp, Google, NYT, and Infatuation are not open data. Michelin is current-only, with no history of when places were added.'],
    ['Corporate news before a restaurant appears', null, 'partial',
      'GDELT news coverage (the unrest project already runs a GDELT pipeline on the Pi)', '2015–present', 'text / place names',
      'Not profiled here. The GDELT free API is rate-limited (1 request / 5 s) and was flaky in testing. Raw-file pulls (as in the unrest project) would be the reliable route.'],
    ['Large facilities under construction', 'construction', 'good',
      'DCP Housing Database (new buildings with units/floors) · DOB new-building permits', '1998–2026 (filings) · 1989–2026 (permits)', 'BBL, lat/long, 2020 NTA (Housing DB)',
      'The Housing Database only covers jobs that touch housing units. Purely commercial towers come from DOB permits.'],
    ['Building / construction / renovation permits', 'construction', 'good',
      'DOB permits, legacy BIS system · DOB NOW permits · DOT street permits', '1989–2026 · 2016–2026 · 2022–2026', 'BBL, lat/long, NTA <i>name</i>',
      'Permitting moved from BIS to DOB NOW from 2016 to 2021. Either system alone shows a fake trend, so both are needed.'],
    ['Lots of renovation if gentrifying', 'construction', 'good',
      'Alteration permits (A1/A2/A3 in BIS, "General Construction" in DOB NOW) · Housing DB alterations', 'same', 'same',
      'Alteration types are coded differently in the two systems.'],
    ['Street crime: muggings, robbery, assault', 'crime', 'good',
      'NYPD complaint data (historic + year-to-date)', '2006–2026', 'lat/long, precinct',
      'Reported crime, not all crime. "Mugging" isn\'t a category; the closest are robbery sub-types (open area, personal electronic device, bag snatch…).'],
    ['Subway renovation: repeated work → people move?', 'subway', 'partial',
      'MTA capital projects · elevator/escalator outages · station ridership · service alerts', 'current projects · 2015– · 2017– · 2020–', 'station lat/long',
      'No open log of historical station closures or planned work. Subway planned work is <b>missing</b> from the alerts archive.'],
    ['Fires in the area', 'fires', 'good',
      'FDNY fire-incident dispatch · Fire Marshal cause investigations', '2005–2026 · 2016–2026', 'zip, community district, precinct (no lat/long)',
      'No point locations. Neighborhood-level use needs a zip or community-district crosswalk.'],
  ];

  async function renderQuestions(main) {
    const man = await load('manifest');
    const counts = Object.entries(READY).map(([k, [l, c]]) => [l, IDEAS.filter((i) => i[2] === k).length, c]);
    const rows = IDEAS.map(([idea, tab, ready, src, yrs, geo, caveat]) => {
      const [label, color] = READY[ready];
      return `<tr><td><b>${idea}</b>${tab ? `<br><span style="font-size:.76rem">${tabLink(tab, 'open tab →')}</span>` : ''}</td>
        <td><span class="nyc-pill" style="--c:${color}">${label}</span></td>
        <td class="muted" style="font-size:.8rem">${src}</td><td style="font-size:.8rem;white-space:nowrap">${yrs.replace(/ · /g, '<br>')}</td>
        <td class="muted" style="font-size:.8rem">${geo}</td><td style="font-size:.8rem">${caveat}</td></tr>`;
    }).join('');
    // Coverage strip of every signal dataset (years with real volume)
    const spans = [
      ['Storefront registry', C.blue, 2019, 2024, 'yearly filings'], ['DCWP licenses', C.blue, 2010, 2026, 'non-food businesses'],
      ['Inspections (chains)', C.red, 2022, 2026, 'rolling window'], ['StreetEasy rent', C.orange, 2010, 2026, 'monthly'], ['Census ACS rent', C.orange, 2005, 2024, '1-yr boroughs · 5-yr tracts'],
      ['DOF sales', C.purple, 2016, 2025, ''], ['Assessment roll (old)', C.purple, 2010, 2018, 'gap 2019–22'], ['Assessment roll (new)', C.purple, 2023, 2027, 'fiscal years'],
      ['Housing Database', C.green, 2010, 2026, 'completions'], ['DOB permits (BIS)', C.green, 1990, 2020, 'fades out → DOB NOW'], ['DOB NOW permits', C.green, 2018, 2026, ''],
      ['Capital plan editions', C.brown, 2016, 2026, 'no location'], ['School tests', C.teal, 2013, 2023, 'no 2020–21'], ['School Quality Reports', C.teal, 2015, 2024, ''],
      ['NYPD complaints', C.ink, 2006, 2026, ''], ['Station ridership', C.yellow, 2017, 2026, 'monthly'], ['Elevator outages', C.yellow, 2015, 2026, ''],
      ['FDNY dispatch', C.red, 2005, 2026, ''], ['Fire causes', C.red, 2016, 2026, ''],
    ];
    main.innerHTML = `
      ${hero(C.ink, 'Project question · What data could speak to each idea', 'Gentrification Signals: Question Map',
        'Each idea from the project notes, matched to the open datasets that could measure it, with the years and location keys each one actually has. <b>This page rates the data, not the ideas.</b> "Data exists" means the measurement is available, not that it shows anything. No signal has been tested.')}
      ${stats([[IDEAS.length, 'ideas from the notes'], ...counts.filter(([, n]) => n).map(([l, n]) => [n, l.toLowerCase()]), [Object.keys(man).length, 'datasets profiled so far']])}
      ${panel('Idea → data', `<p>Click "open tab" to see each dataset's coverage, fields, and traps.</p>
        <div class="nyc-table-wrap"><table class="nyc-table"><thead><tr><th>Idea</th><th>Readiness</th><th>Data sources</th><th>Years</th><th>Location key</th><th>What limits it</th></tr></thead><tbody>${rows}</tbody></table></div>`, 'The map')}
      ${panel('Which years each signal covers', `<p>The years where every source overlaps are narrow: roughly <b>2019–2024</b>. Faded labels mark the main coverage trap for each source.</p>${chartDiv('nyc-q-cov')}`, 'Coverage')}
      ${row(
        panel('Location keys across the signal data', simpleTable(['Key', 'Datasets that have it'], [
          ['<span class="mono">BBL</span> (tax lot)', 'Storefronts, sales, assessment roll, Housing DB, DOB permits, inspections, DCWP'],
          ['<span class="mono">lat / long</span>', 'Storefronts, inspections, Housing DB, DOB NOW, NYPD, schools, subway stations, Michelin'],
          ['<span class="mono">2020 NTA</span> code', 'Storefronts, sales, Housing DB, DCWP (historic)'],
          ['<span class="mono">2010 NTA</span> code', 'Inspections, DCWP (current), school locations'],
          ['NTA <i>name</i> only', 'DOB NOW permits (spelling must match)'],
          ['Census tract', 'Storefront rent stats, DOB permits, Housing DB'],
          ['Zip / community district / precinct', 'FDNY (no points), NYPD (precinct)'],
          ['Own neighborhood names', 'StreetEasy (176 areas, not NTAs)'],
        ]), 'Join keys'),
        panel('Still missing', gotchas([
          `<strong>Who lives there.</strong> Rent paid, household income and renter share are now pulled from Census ACS (Rent tab). Education, race and age come from the same API and aren't pulled yet.`,
          `<strong>Restaurant reviews / buzz.</strong> Yelp and Google review data aren't open. Michelin is the only published list found with coordinates.`,
          `<strong>Historical subway station work.</strong> No archive of past station closures or planned-work notices was found.`,
          `<strong>News lead-time.</strong> GDELT is reachable, but it wasn't profiled for this question yet.`,
        ]), 'Gaps')
      )}
    `;
    const el = document.getElementById('nyc-q-cov');
    const y0 = 1989, y1 = 2028, W = 680, rh = 24, lw = 170, H = spans.length * rh + 26;
    const x = d3.scaleLinear().domain([y0, y1]).range([lw, W - 10]);
    const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`);
    svg.append('g').attr('class', 'gridline').attr('transform', `translate(0,${H - 22})`).call(d3.axisBottom(x).ticks(8).tickFormat(d3.format('d')).tickSize(-(H - 22)));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - 22})`).call(d3.axisBottom(x).ticks(8).tickFormat(d3.format('d')));
    svg.append('rect').attr('x', x(2019)).attr('width', x(2025) - x(2019)).attr('y', 0).attr('height', H - 22).attr('fill', C.green).attr('opacity', 0.07);
    spans.forEach(([name, color, a, b, note], i) => {
      const yy = i * rh + 4;
      svg.append('text').attr('class', 'nyc-cov-label').attr('x', 0).attr('y', yy + 11).text(name);
      svg.append('rect').attr('x', x(a)).attr('width', x(b + 1) - x(a)).attr('y', yy + 3).attr('height', 11).attr('rx', 3).attr('fill', color)
        .on('mousemove', (ev) => tip(`<b>${name}</b><br>${a}–${b}${note ? '<br>' + note : ''}`, ev)).on('mouseleave', () => tip(null));
      if (note) svg.append('text').attr('class', 'nyc-cov-sub').attr('x', x(a) - 4).attr('y', yy + 12).attr('text-anchor', 'end').text(note);
    });
  }

  // ── BUSINESS TURNOVER ────────────────────────────────────────────
  async function renderTurnover(main) {
    const d = await load('turnover');
    const geo = await load('nta2020');
    const yrs = Object.keys(d.storefront_years).sort();
    const full = yrs.filter((y) => y !== '2025');
    const sy = d.storefront_years;
    const latest = sy['2024'];
    const city = d.storefront_stats.filter((r) => r.level === 'CITYWIDE').sort((a, b) => (a.year < b.year ? -1 : 1));
    const boros = d.storefront_stats.filter((r) => r.level === 'BOROUGH');
    const actY = pivot(d.activity_by_year.map(([y, a, n]) => [y, a, n]));
    const presenceTotal = d3.sum(d.bbl_presence, (p) => p[1]);
    const vac = d.nta_vacancy_2024;
    const rates = Object.entries(vac).filter(([, [n]]) => n >= 20).map(([, [n, v]]) => v / n);
    const vs = d3.scaleQuantile().domain(rates).range(d3.schemeOrRd[6]);
    const iss = d.dcwp.issued, his = d.dcwp.historic;

    main.innerHTML = `
      ${hero(C.blue, 'Signal · Business turnover', 'Business Turnover &amp; Openings',
        `Turnover (a storefront changing hands or going dark) and openings (a new business appearing) are different measurements, and NYC records them in different places. The core source is the <b>storefront registry</b>: since 2019, owners of ground- and second-floor commercial space must report every year whether each storefront is vacant and what business is in it. City business <b>licenses</b> (DCWP) add start and end dates for licensed, non-restaurant trades. ${portalLink(d.datasets.storefronts, 'Storefront registry ↗')} · ${portalLink(d.datasets.storefront_stats, 'Storefront statistics ↗')} · ${portalLink(d.datasets.dcwp_issued, 'DCWP licenses ↗')} · ${portalLink(d.datasets.dcwp_historic, 'DCWP historical ↗')}`)}
      ${stats([
        [fmt(d.storefront_rows), 'storefront-year rows'],
        [full.length, 'complete filing years (2019/20–2024)'],
        [fmt(latest.rows), 'storefronts reported for 2024'],
        [pct(latest.vacant, latest.rows), 'reported vacant at end of 2024'],
        [fmt(iss.rows + his.rows), 'DCWP license records (current + historical)'],
      ])}
      ${panel('Where each kind of change can be seen', simpleTable(['Change', 'Storefront registry', 'DCWP licenses', 'Liquor licenses', 'Restaurant inspections'], [
        ['<b>New business opens</b>', 'storefront flips vacant → occupied, or the business activity changes', 'license creation date', 'original issue date', 'first inspection / 1900-dated pre-permit rows'],
        ['<b>Business closes</b>', 'storefront flips occupied → vacant', 'status = expired / out of business / surrendered', 'license moves to the "inactive" file', '<b>not visible</b> (closed restaurants are deleted)'],
        ['<b>Turnover</b> (one replaces another)', 'needs two consecutive years for the same storefront', 'two license holders at one address over time', 'same', 'two CAMIS IDs at the same BBL'],
        ['Covers restaurants?', 'yes ("Food Services")', '<b>no</b>: DOHMH permits restaurants', 'only places serving alcohol', 'yes'],
        ['Years', '2019–2024 (+ partial 2025)', '1994–2026', '2012–2026 (inactive file)', '~2022–2026'],
      ]), 'Definitions')}
      ${row(
        panel('Storefronts reported each filing year', `<p>Stacked: occupied vs. vacant on Dec 31. 2025 is a partial filing that so far contains only vacant storefronts (see gotchas).</p>${chartDiv('nyc-t-years')}`, 'Coverage over time'),
        panel('Gotchas found while profiling', gotchas([
          `<strong>The first four filing years are labeled "2019 and 2020", "2020 and 2021", …</strong> Each covers a calendar year plus the mid-year check of the next. From 2023 on, labels are single years.`,
          `<strong>The vacancy flag is coded three ways.</strong> 2024 mixes <code>YES</code> (${fmt(sy['2024'].vacant_codes.YES || 0)}), <code>Y</code> (${fmt(sy['2024'].vacant_codes.Y || 0)}), and rows where only the "vacant on 6/30 or date sold" field is filled (${fmt(sy['2024'].vacant_codes['(blank; 6/30 field=YES)'] || 0)}).`,
          `<strong>2025 so far has ${fmt(sy['2025'].rows)} rows, every one vacant.</strong> Occupied storefronts for 2025 haven't been published yet, so a 2025 vacancy rate would be meaningless until they are.`,
          `<strong>Row counts dropped ~16% after 2020/21</strong> (${fmt(sy['2020 and 2021'].rows)} → ${fmt(sy['2021 and 2022'].rows)}). That's a change in which properties must file, not 12,000 storefronts disappearing.`,
          `<strong>One BBL ≠ one storefront.</strong> A tax lot can hold several storefronts (the <code>unit</code> field). Only ${fmt((d.bbl_presence.find((p) => p[0] === 6) || [0, 0])[1] + (d.bbl_presence.find((p) => p[0] === 7) || [0, 0])[1])} of ${fmt(presenceTotal)} lots appear in 6+ filing years.`,
          `<strong>Business activity is broad</strong> ("FOOD SERVICES", "RETAIL"…) and comes in two spellings of the same category, so it can't separate a fast-food chain from a fine-dining restaurant.`,
          `<strong>DCWP doesn't license restaurants.</strong> Its biggest categories are home-improvement contractors and tobacco dealers. ${fmt(iss.placeholder_1900)} current licenses have a placeholder creation date of 1900.`,
        ]))
      )}
      ${row(
        panel('Storefront vacancy by neighborhood, 2024', `<p>Share of reported storefronts that were vacant on Dec 31, 2024, by 2020 NTA (NTAs with ≥ 20 storefronts). Descriptive only.</p>${mapDiv('nyc-t-map')}<div id="nyc-t-leg"></div>`, 'Coverage over space'),
        panel('Storefronts by business activity', `<p>All filing years combined, top categories. Case-variant spellings are merged.</p>${chartDiv('nyc-t-act')}
          <h3>Food services vs. retail vs. no activity, by year</h3>${chartDiv('nyc-t-acty')}`, 'Distributions')
      )}
      ${row(
        panel('How many filing years each lot appears in', `<p>Distinct BBLs by the number of filing years they show up in (out of 7). Following a storefront over time depends on this.</p>${chartDiv('nyc-t-pres')}`, 'Panel structure'),
        panel('Storefront rent &amp; vacancy, citywide', `<p>From the aggregated storefront statistics. Median asking rent is <b>monthly dollars per square foot</b> for leased storefronts.</p>${chartDiv('nyc-t-rent')}
          ${simpleTable(['Year', 'Storefronts', 'Leased', 'Not leased', 'Median rent $/sf/mo'], city.map((r) => [r.year, fmt(r.total), fmt(r.leased), fmt(r.not_leased || 0), r.rent_psf_median]))}`, 'Aggregates')
      )}
      ${row(
        panel('DCWP licenses created per year', `<p>Blue = current file (licenses active or expired since 2019). Gray = historical file (expired before 2019). The split is by expiry, so recent years only appear in the current file.</p>${chartDiv('nyc-t-dcwp')}`, 'Coverage over time'),
        panel('DCWP license categories (current file)', chartDiv('nyc-t-dcat'), 'Distributions')
      )}
      ${panel('Storefront registry: key fields', fieldTable([
        ['reporting_year', 'text', 'Filing year label ("2019 and 2020" … "2023", "2024", "2025")'],
        ['bbl', 'id', 'Tax lot. The same key the sales and assessment data use.'],
        ['property_street_address_or', 'text', 'Street address of the storefront'], ['unit', 'text', 'Storefront unit within the lot (often blank)'],
        ['vacant_on_12_31', 'flag', 'Was the storefront vacant at year end? YES / NO / Y'],
        ['vacant_6_30_or_date_sold', 'flag', 'Vacant at mid-year (or date sold). Carries the vacancy flag in some 2024/2025 rows.'],
        ['primary_business_activity', 'category', 'Broad industry of the tenant'],
        ['expir_dt_of_most_recent_lease', 'date', 'When the current lease ends (a forward-looking date)'],
        ['construction_reported', 'flag', 'Storefront under construction (rarely filled)'],
        ['sold_date', 'date', 'Only 2020–2022 filings'], ['latitude', 'number', 'Geocoded point'], ['nta', 'code', '<b>2020</b> NTA code'],
      ], d.storefront_missing), 'Data dictionary')}
      ${panel('Sample rows (2024, food services)', sampleTable(d.storefront_sample), 'Raw data')}
    `;
    columns('#nyc-t-years', [
      { name: 'occupied', color: C.blue, values: yrs.map((y) => [y, sy[y].occupied]) },
      { name: 'vacant', color: C.orange, values: yrs.map((y) => [y, sy[y].vacant]) },
    ], { unit: 'storefronts', xFmt: (v) => v.replace(' and ', '/').replace(/20(\d\d)\/20(\d\d)/, '$1/$2') });
    await nycMap('#nyc-t-map', {
      fill: (f) => { const v = vac[f.properties.code]; return v && v[0] >= 20 ? vs(v[1] / v[0]) : '#e4e4de'; },
      tipExtra: (f) => { const v = vac[f.properties.code]; return v ? `${fmt(v[1])} vacant of ${fmt(v[0])} storefronts (${pct(v[1], v[0])})` : 'no storefront filings'; },
    });
    document.getElementById('nyc-t-leg').innerHTML = quantileLegend(vs, (v) => (v * 100).toFixed(0) + '%');
    const act = {};
    d.storefront_activity.forEach(([a, n]) => { act[a] = (act[a] || 0) + n; });
    barH('#nyc-t-act', Object.entries(act).sort((a, b) => b[1] - a[1]).slice(0, 14), { total: d.storefront_rows, color: C.blue, barHeight: 16, labelWidth: 230 });
    columns('#nyc-t-acty', Object.entries(actY).map(([k, v], i) => ({ name: k.toLowerCase(), color: [C.red, C.blue, C.gray][i % 3], values: v })),
      { height: 200, xFmt: (v) => v.replace(' and ', '/').replace(/20(\d\d)\/20(\d\d)/, '$1/$2') });
    columns('#nyc-t-pres', [{ name: 'lots', color: C.blue, values: d.bbl_presence.map(([k, n]) => [String(k), n]) }], { height: 200, sortX: false, unit: 'lots', xLabel: (v) => v + ' filing year(s)' });
    lines('#nyc-t-rent', [{ name: 'Citywide median rent $/sf/mo', color: C.blue, values: city.map((r) => [+r.year, r.rent_psf_median]) },
      ...Object.keys(BORO_COLORS).map((b) => ({ name: b, color: BORO_COLORS[b], width: 1.3, values: boros.filter((r) => (r.id || '').toUpperCase() === b.toUpperCase()).sort((x, y) => x.year - y.year).map((r) => [+r.year, r.rent_psf_median]) }))],
      { height: 210, yFmt: (v) => '$' + v, valFmt: (v) => '$' + v.toFixed(2) });
    columns('#nyc-t-dcwp', [
      { name: 'current file', color: C.blue, values: iss.by_year.filter((r) => r[0] >= 2000).map(([y, n]) => [y, n]) },
      { name: 'historical file', color: C.gray, values: his.by_year.filter((r) => r[0] >= 2000 && r[0] <= 2026).map(([y, n]) => [y, n]) },
    ], { maxTicks: 14, unit: 'licenses' });
    barH('#nyc-t-dcat', iss.categories.slice(0, 15), { total: iss.rows, color: C.blue, barHeight: 15, labelWidth: 230 });
  }

  // ── CHAINS & PUBLISHED LISTS ─────────────────────────────────────
  const CHAIN_GROUP_COLORS = { 'Fast food': C.red, 'Local fried chicken': C.orange, 'Coffee & bakery': C.brown, 'Fast casual': C.green, 'Bubble tea': C.purple };
  const AWARD_COLORS = { '3 Stars': C.red, '2 Stars': C.orange, '1 Star': C.yellow, 'Bib Gourmand': C.purple, 'Selected Restaurants': C.gray };

  async function renderChains(main) {
    const d = await load('chains');
    const groups = d3.rollups(d.chains, (v) => d3.sum(v, (c) => c.n), (c) => c.group).sort((a, b) => b[1] - a[1]);
    const fy = {}; d.chains.forEach((c) => c.first_years.forEach(([y, n]) => { fy[y] = (fy[y] || 0) + n; }));
    const pending = d3.sum(d.chains, (c) => c.pending);
    const dunkin = d.chains.find((c) => c.label === "Dunkin'");
    const mich = d.michelin;
    main.innerHTML = `
      ${hero(C.red, 'Signal · Chains &amp; published restaurant lists', 'Fast-Food Chains &amp; Published Lists',
        `There's no "chain" field anywhere in NYC data. Chains have to be found by matching the business name (DBA) on restaurant inspections. This tab shows what that matching recovers: ${d.chains.length} chains, ${fmt(d.chain_restaurants)} locations. It also profiles the one published restaurant list available with coordinates, the <b>Michelin Guide</b>. ${portalLink(d.dataset, 'Inspections ↗')} · <a href="${mich.source.replace('raw.githubusercontent.com', 'github.com').replace('/main/', '/blob/main/')}" target="_blank" rel="noopener">Michelin scrape ↗</a>`)}
      ${stats([
        [d.chains.length, 'chains matched (my list, below)'], [fmt(d.chain_restaurants), 'chain locations among ' + fmt(d.restaurants) + ' restaurants'],
        [pct(d.chain_restaurants, d.restaurants), 'of all restaurants'], [pending, 'chain locations permitted but not yet inspected'],
        [mich.nyc, 'Michelin-listed NYC restaurants'],
      ])}
      ${row(
        panel('Chain locations today', `<p>One dot per matched location, colored by group. The grouping is mine (for display), not a city field.</p>${mapDiv('nyc-c-map')}
          <div class="nyc-legend">${Object.entries(CHAIN_GROUP_COLORS).map(([g, c]) => `<span><i style="background:${c}"></i>${g}</span>`).join('')}</div>`, 'Coverage over space'),
        panel('Gotchas found while profiling', gotchas([
          `<strong>Names are free text.</strong> ${dunkin ? `Dunkin' alone shows up under ${dunkin.n_variants} spellings (${dunkin.variants.slice(0, 4).map((v) => `"${esc(v[0])}"`).join(', ')}…).` : ''} Matching uses a normalized name plus one pattern per chain. Co-branded stores (Dunkin'/Baskin-Robbins) count once, under the first match.`,
          `<strong>"When did it open" is censored.</strong> The first inspection year of chain locations piles up in 2022–2024 (chart below), because the dataset only keeps ~3 years of history. A Starbucks open since 2010 looks like it "appeared" in 2023.`,
          `<strong>Pre-permit rows are the one forward-looking piece.</strong> ${pending} chain locations (and ${fmt((d.first_seen_all.find((x) => x[0] === '1900') || [0, 0])[1])} restaurants overall) have a 1900-01-01 date: permitted, not yet inspected, i.e. about to open.`,
          `<strong>Closed chain stores vanish</strong> from the data, so exits (a chain leaving a neighborhood) are invisible here.`,
          `<strong>Michelin is a current snapshot.</strong> The scrape has no "year added" field, so it can't say when a neighborhood first got a starred or Bib Gourmand restaurant without the repo's commit history.`,
          `<strong>Michelin names don't match inspection DBAs</strong> (legal names, punctuation). Joining the two would mean matching on location plus a fuzzy name.`,
        ]))
      )}
      ${row(
        panel('Locations per chain', `<p>${d.chains.length} chains with at least one match. Hover a bar for its count.</p>${chartDiv('nyc-c-bars')}`, 'Distributions'),
        panel('Locations by group', `${chartDiv('nyc-c-groups')}<h3>First inspection year of chain locations</h3><p>A coverage artifact, not openings: the rolling window starts ~2022.</p>${chartDiv('nyc-c-first')}`, 'Distributions')
      )}
      ${panel('The 60 most common restaurant names (raw)', `<p>Straight from the data, no matching. This is how the chain list was seeded, and it shows the variant-spelling problem (e.g. "DUNKIN" vs "DUNKIN'").</p>${chartDiv('nyc-c-raw')}`, 'Raw names')}
      ${row(
        panel('Michelin Guide: NYC', `<p>${mich.nyc} restaurants, colored by award.</p>${mapDiv('nyc-c-mich')}
          <div class="nyc-legend">${mich.awards.map(([a, n]) => `<span><i style="background:${AWARD_COLORS[a] || C.gray}"></i>${a} (${n})</span>`).join('')}</div>`, 'Published list'),
        panel('Other published-restaurant sources checked', simpleTable(['Source', 'Open?', 'Notes'], [
          ['Michelin Guide', 'yes (community scrape)', `${fmt(mich.rows_world)} restaurants worldwide; fields: ${mich.fields.slice(0, 8).join(', ')}…`],
          ['DOHMH MenuStat (<code>qgc5-ecnb</code>)', 'yes, historical', '96 national chains\' menu items, 2017–2018 only. Useful as a list of chain names.'],
          ['Yelp / Google reviews', 'no', 'API terms forbid bulk storage. The Yelp Open Dataset doesn\'t include NYC.'],
          ['NYT / Infatuation / Eater', 'no', 'No structured open data'],
          ['Open Restaurants applications (<code>pitm-atqc</code>)', 'yes, 2020–2023', '14K outdoor-dining applications with lat/long. A one-time COVID program.'],
        ]), 'Coverage')
      )}
    `;
    await nycMap('#nyc-c-map', { points: d.points, pointColor: (p) => CHAIN_GROUP_COLORS[p[3]] || C.gray, radius: 1.8, alpha: 0.75 });
    barH('#nyc-c-bars', d.chains.map((c) => [c.label, c.n]), { color: (x) => CHAIN_GROUP_COLORS[d.chains.find((c) => c.label === x[0]).group], barHeight: 12, labelWidth: 160 });
    barH('#nyc-c-groups', groups, { color: (x) => CHAIN_GROUP_COLORS[x[0]], labelWidth: 150, total: d.chain_restaurants });
    columns('#nyc-c-first', [{ name: 'locations', color: C.red, values: Object.entries(fy).sort() }], { height: 180, unit: 'chain locations' });
    barH('#nyc-c-raw', d.top_names, { color: C.gray, barHeight: 11, labelWidth: 250 });
    await nycMap('#nyc-c-mich', { markers: mich.points.map(([lon, lat, name, award, cuisine, price]) => ({ lon, lat, color: AWARD_COLORS[award] || C.gray, tip: `<b>${esc(name)}</b><br>${esc(award)} · ${esc(cuisine)} · ${esc(price)}` })), markerR: 3.5 });
  }

  // ── RENT ─────────────────────────────────────────────────────────
  async function renderRent(main) {
    const d = await load('rent');
    const turn = await load('turnover');
    const city = d.areas.find((a) => a.type === 'city');
    const boros = d.areas.filter((a) => a.type === 'borough');
    const hoods = d.areas.filter((a) => a.type === 'neighborhood').sort((a, b) => b.n_months - a.n_months);
    const full = hoods.filter((h) => h.n_months >= d.months.length * 0.9).length;
    const thin = hoods.filter((h) => h.n_months < 60).length;
    const years = [...new Set(d.months.map((m) => m.slice(0, 4)))];
    const toSeries = (a) => d.months.map((m, i) => [m, a.monthly[i]]);
    const tr = turn.tract_rent;
    main.innerHTML = `
      ${hero(C.orange, 'Signal · Rent', 'Rent Over Time',
        `NYC Open Data has no residential rent dataset. The best open series found is <b>StreetEasy's median asking rent</b>: the monthly median listed rent for apartments on StreetEasy, by StreetEasy's own neighborhoods, back to 2010. For commercial space, the city's <b>storefront registry</b> reports median rent per square foot by census tract (2019–2024). <a href="${d.source}">StreetEasy data download ↗</a> · ${portalLink(turn.datasets.storefront_stats, 'Storefront statistics ↗')}`)}
      ${stats([
        [d.months.length, `months (${d.months[0]} – ${d.months[d.months.length - 1]})`], [d.neighborhoods, 'StreetEasy neighborhoods'],
        [full, 'neighborhoods with ≥ 90% of months filled'], [thin, 'neighborhoods with < 5 years of months'],
        [d.name_matches_nta + ' / ' + d.neighborhoods, 'names that match a piece of an NTA name (boundaries differ)'],
      ])}
      ${panel('Median asking rent: city and boroughs', `<p>Monthly, all unit sizes. Hover for values.</p>${chartDiv('nyc-r-city')}`, 'Coverage over time')}
      ${row(
        panel('Pick a neighborhood', `<p>Annual average of the monthly medians (blank months skipped). Up to 6 at once.</p>
          <select id="nyc-r-pick" class="nyc-select" multiple size="8">${hoods.map((h) => `<option value="${esc(h.name)}">${esc(h.name)} (${esc(h.boro)}) · ${h.n_months} mo</option>`).join('')}</select>
          ${chartDiv('nyc-r-hood')}`, 'Explore'),
        panel('Gotchas found while profiling', gotchas([
          `<strong>Asking, not paid.</strong> These are list prices of units advertised on one website. Rent-stabilized units (about half of NYC rentals) rarely appear there, and concessions ("1 month free") aren't netted out.`,
          `<strong>Mix shifts move the median.</strong> If a new luxury building lists 200 units in one month, the median jumps without any existing rent changing.`,
          `<strong>Coverage is uneven.</strong> Only ${full} of ${d.neighborhoods} neighborhoods have ≥ 90% of months. ${thin} have under five years, mostly outer-borough areas with few listings, which are often exactly the areas a gentrification question cares about.`,
          `<strong>StreetEasy neighborhoods aren't NTAs.</strong> ${d.name_matches_nta} of ${d.neighborhoods} names match a piece of some 2020 NTA name (e.g. "Astoria"), but a shared name isn't a shared boundary: StreetEasy draws its own lines and publishes no shapes. Linking needs a hand-built crosswalk, and the other ${d.neighborhoods - d.name_matches_nta} have no name match at all.`,
          `<strong>Storefront rent is suppressed in small tracts</strong> (shown as "*" when too few storefronts report). ${tr['2024'] ? tr['2024'].suppressed + ' of ' + tr['2024'].tracts + ' tracts in 2024.' : ''}`,
          `<strong>Rent actually paid</strong> comes from Census ACS, profiled in the section below.`,
        ]))
      )}
      ${row(
        panel('Months of data per neighborhood', `<p>Each bar is one neighborhood, sorted by how many of the ${d.months.length} months have a value.</p>${chartDiv('nyc-r-cov')}`, 'Completeness'),
        panel('Storefront rent per sq ft, by census tract', `<p>Spread of tract-level median monthly rent ($/sq ft). The line is the median tract, the band is the 25th–75th percentile, the faint band is the 10th–90th.</p>${chartDiv('nyc-r-tract')}
          ${simpleTable(['Year', 'Tracts', 'Suppressed', 'Median $/sf/mo'], Object.entries(tr).map(([y, t]) => [y, fmt(t.tracts), fmt(t.suppressed), t.p50]))}`, 'Commercial rent')
      )}
    `;
    lines('#nyc-r-city', [{ name: 'NYC', color: C.ink, width: 2.5, values: toSeries(city) },
      ...boros.map((b) => ({ name: b.name, color: BORO_COLORS[b.name] || C.gray, width: 1.4, values: toSeries(b) }))],
    { time: true, height: 260, yFmt: (v) => '$' + d3.format(',')(v), valFmt: (v) => '$' + fmt(v) });
    const pick = document.getElementById('nyc-r-pick');
    const defaults = ['Williamsburg', 'Bushwick', 'Harlem', 'Astoria', 'Crown Heights'];
    [...pick.options].forEach((o) => { o.selected = defaults.includes(o.value); });
    const drawHood = () => {
      document.getElementById('nyc-r-hood').innerHTML = '';
      const sel = [...pick.selectedOptions].slice(0, 6).map((o) => hoods.find((h) => h.name === o.value));
      lines('#nyc-r-hood', sel.map((h, i) => ({ name: h.name, color: PALETTE[i], values: years.map((y) => [+y, h.annual[y] ?? null]) })),
        { height: 230, yFmt: (v) => '$' + d3.format(',')(v), valFmt: (v) => '$' + fmt(v) });
    };
    pick.addEventListener('change', drawHood); drawHood();
    columns('#nyc-r-cov', [{ name: 'months', color: C.orange, values: hoods.map((h) => [h.name, h.n_months]) }], { sortX: false, height: 180, maxTicks: 1, xFmt: () => '', unit: 'months' });
    // Percentile band chart: line = median tract, bands = p25–p75 and p10–p90.
    const band = (sel, ty, color, yFmt, marks = []) => {
      const el = document.getElementById(sel);
      const W = 680, H = 200, m = { t: 10, r: 10, b: 26, l: 50 };
      const x = d3.scaleLinear().domain(d3.extent(ty, (t) => t.y)).range([m.l, W - m.r]);
      const y = d3.scaleLinear().domain([0, d3.max(ty, (t) => t.p90)]).nice().range([H - m.b, m.t]);
      const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`);
      svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(yFmt));
      svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(ty.length).tickFormat(d3.format('d')));
      marks.forEach(([yr, label]) => {
        svg.append('line').attr('x1', x(yr - 0.5)).attr('x2', x(yr - 0.5)).attr('y1', m.t).attr('y2', H - m.b).attr('stroke', C.gray).attr('stroke-dasharray', '3 3');
        svg.append('text').attr('x', x(yr - 0.5) + 4).attr('y', m.t + 10).attr('font-size', 10).attr('fill', C.gray).text(label);
      });
      svg.append('path').datum(ty).attr('fill', color).attr('opacity', 0.12).attr('d', d3.area().x((t) => x(t.y)).y0((t) => y(t.p10)).y1((t) => y(t.p90)));
      svg.append('path').datum(ty).attr('fill', color).attr('opacity', 0.25).attr('d', d3.area().x((t) => x(t.y)).y0((t) => y(t.p25)).y1((t) => y(t.p75)));
      svg.append('path').datum(ty).attr('fill', 'none').attr('stroke', color).attr('stroke-width', 2).attr('d', d3.line().x((t) => x(t.y)).y((t) => y(t.p50)));
    };
    band('nyc-r-tract', Object.entries(tr).map(([y, t]) => ({ y: +y, ...t })), C.orange, (v) => '$' + v);

    // ── Census ACS: rent actually paid (tract 5-year + borough 1-year)
    const acs = await load('acs');
    const tv = Object.entries(acs.tract_vintages).map(([y, t]) => ({ y: +y, ...t }));
    const gr = (t) => t.vars.gross_rent;
    const last = tv[tv.length - 1], first = tv[0], mid = tv.find((t) => t.y === 2015);
    const acsYears = Object.keys(acs.county_acs1[Object.keys(acs.county_acs1)[0]]).map(Number).sort((a, b) => a - b);
    const boroSeries = (key) => Object.entries(acs.county_acs1).map(([b, byY]) => ({
      name: b, color: BORO_COLORS[b] || C.gray,
      values: d3.range(acsYears[0], acsYears[acsYears.length - 1] + 1).map((y) => [y, byY[y] ? byY[y][key][0] : null]) }));
    const geoOf = (y) => (y <= 2009 ? '2000' : y <= 2019 ? '2010' : '2020');
    const usd = (v) => (v == null ? '—' : '$' + fmt(v));
    main.insertAdjacentHTML('beforeend', `
      ${panel('Rent actually paid: Census ACS', `<p>The American Community Survey asks a sample of households what they pay. <b>Median gross rent</b> = contract rent + utilities, for renter units paying cash rent, rent-stabilized units included. Two products: <b>1-year</b> estimates (annual, but only for big areas like boroughs) and <b>5-year</b> estimates (down to census tracts, but each value pools five years of responses). Pulled from <a href="https://api.census.gov/data.html" target="_blank" rel="noopener">api.census.gov ↗</a>: table B25064, plus B25058 (contract rent), B19013 (household income) and B25003 (renters vs. owners).</p>
        ${stats([
          [`${first.y}–${last.y}`, '5-year vintages, tract level'], [`${acsYears[0]}–${acsYears[acsYears.length - 1]}`, '1-year estimates, borough level'],
          [fmt(last.tracts), `NYC tracts in the ${last.y} vintage`], [usd(gr(last).p50), `median tract, gross rent (${last.y} 5-yr)`],
          [fmt(gr(last).missing), `tracts with no rent estimate (${last.y})`],
        ])}`, 'Census ACS')}
      ${row(
        panel('Median gross rent by borough (1-year ACS)', `<p>Nominal dollars, not adjusted for inflation. No point for 2020: the Census Bureau didn't release standard 1-year estimates that year because pandemic response rates were too low.</p>${chartDiv('nyc-r-acs1')}`, 'Coverage over time'),
        panel('Spread across tracts (5-year ACS)', `<p>Tract-level median gross rent for each 5-year vintage. Line = median tract, bands = 25th–75th and 10th–90th percentile. Dashed lines mark where the tract boundaries change.</p>${chartDiv('nyc-r-acs5')}`, 'Distributions')
      )}
      ${panel('Per-vintage profile: gross rent by tract', simpleTable(['Vintage', 'Covers', 'Tract map', 'Tracts', 'No estimate', 'Median tract', 'Top code', 'Tracts at top code', 'Median MOE', 'MOE > 30%'],
          tv.map((t) => [t.y, `${t.y - 4}–${t.y}`, geoOf(t.y), fmt(t.tracts), fmt(gr(t).missing), usd(gr(t).p50), usd(gr(t).max), fmt(gr(t).at_max), gr(t).moe_rel_p50 + '%', fmt(gr(t).moe_rel_over_30)])), 'Completeness')}
      ${panel('Gotchas found while profiling: Census ACS', gotchas([
          `<strong>5-year vintages overlap.</strong> The "${last.y}" value pools ${last.y - 4}–${last.y} responses, and "${last.y - 1}" shares four of those five years. Back-to-back vintages aren't independent snapshots. The Census Bureau's guidance is to compare non-overlapping vintages (e.g. ${last.y - 10}, ${last.y - 5}, ${last.y}).`,
          `<strong>The tract map changes twice.</strong> The ${first.y} vintage uses 2000 tracts (${fmt(first.tracts)}), 2010–2019 use 2010 tracts (${fmt(mid.tracts)}), and 2020+ use 2020 tracts (${fmt(last.tracts)}). A tract ID can mean a different area across those breaks. Following one place over time needs the Census tract relationship files. Mapping tracts to 2020 NTAs uses the city's crosswalk <code>hm78-6dwm</code>.`,
          `<strong>Rents are top-coded, and the cap moved.</strong> Anything above the cap is reported as the cap plus $1: $${fmt(first.vars.gross_rent.max)} through 2014, $${fmt(last.vars.gross_rent.max)} after. ${fmt(gr(last).at_max)} tracts sit at the cap in ${last.y}, up from ${fmt(mid.vars.gross_rent.at_max)} in 2015, so the most expensive tracts can't show any further increase. Household income is capped at $250,001.`,
          `<strong>Small samples, wide error bars.</strong> Every estimate has a 90% margin of error (MOE). In ${last.y} the median tract's MOE is ${gr(last).moe_rel_p50}% of its rent, and ${fmt(gr(last).moe_rel_over_30)} tracts are over 30%. A few-hundred-dollar change in one tract can be noise.`,
          `<strong>No estimate shows up as a sentinel value.</strong> The API returns codes like <code>-666666666</code> when there's no estimate (parks, airports, tracts with too few renters). The build treats every negative value as missing: ${fmt(gr(last).missing)} tracts in ${last.y}.`,
          `<strong>Paid rent ≠ asking rent.</strong> ACS includes every renter, including long-time and rent-stabilized tenants, so it moves slowly. StreetEasy asking rents (above) only cover new listings. The two series measure different things, so expect them to differ.`,
          `<strong>Dollars are nominal.</strong> Each vintage reports values in its own end-year dollars. Comparing across years needs an inflation adjustment (the Census Bureau uses CPI-U-RS).`,
        ]))}
    `);
    lines('#nyc-r-acs1', boroSeries('gross_rent'), { height: 230, yFmt: (v) => '$' + d3.format(',')(v), valFmt: (v) => '$' + fmt(v) });
    band('nyc-r-acs5', tv.map((t) => ({ y: t.y, ...gr(t) })), C.orange, (v) => '$' + d3.format(',')(v), [[2010, '2010 tracts'], [2020, '2020 tracts']]);
  }

  // ── PROPERTY VALUES ──────────────────────────────────────────────
  async function renderValues(main) {
    const d = await load('values');
    const CLASS = { 1: ['Class 1: 1–3 family homes', C.blue], 2: ['Class 2: apartments, co-ops, condos', C.purple], 4: ['Class 4: commercial', C.orange] };
    const fyNew = (y) => `${+y - 1}/${String(y).slice(2)}`;
    const series = Object.entries(CLASS).map(([c, [name, color]]) => ({
      name, color,
      values: [...d.median_mv_old.filter((r) => r[1] === c).map((r) => [+r[0].slice(0, 4), r[2]]),
        [2019, null], ...d.median_mv_new.filter((r) => r[1] === c).map((r) => [+r[0] - 1, r[2]])],
    }));
    const by = d.nta_year_buckets; const yrs = Object.keys(by).sort();
    const thinShare = yrs.map((y) => { const t = d3.sum(Object.values(by[y])); return [y, (by[y]['0–9'] || 0) / t]; });
    main.innerHTML = `
      ${hero(C.purple, 'Signal · Property value', 'Property Values &amp; Relative Change',
        `Two ways to see property value: <b>sales prices</b> (what buyers paid; profiled on the ${tabLink('sales', 'Property Sales')} tab) and the city's <b>assessment roll</b>, where the Department of Finance estimates a market value for every tax lot every year, whether it sold or not. Measuring change <em>relative to the city</em> needs a citywide benchmark and enough sales per neighborhood to compute one. This tab profiles both. ${portalLink(d.datasets.new, 'Assessment roll 2023+ ↗')} · ${portalLink(d.datasets.old, 'Assessment roll 2010–2018 ↗')}`)}
      ${stats([
        [fmt(d.rows_new), 'lot-year rows, 2023+ rolls'], [fmt(d.rows_old), 'lot-year rows, 2010/11–2018/19 rolls'],
        ['2019/20–2021/22', 'rolls not on the portal'], [d.city_median.length, 'years of residential sales (benchmark)'],
      ])}
      ${row(
        panel('Median DOF market value per lot, by tax class', `<p>Median of DOF's estimated full market value across all lots in each class. Old file: <code>fullval</code>, final roll. New file: <code>curmkttot</code>, final roll (period 3). The break is the missing years.</p>${chartDiv('nyc-v-mv')}`, 'Coverage over time'),
        panel('Gotchas found while profiling', gotchas([
          `<strong>Three roll years are missing.</strong> The old file stops at 2018/19 and the new one starts at 2022/23 (fiscal 2023). Two single-roll files (<code>kevu-8hby</code>, <code>m8p6-tp4b</code>) exist but use a different layout.`,
          `<strong>Every year appears twice</strong> in the new file: period 1 (tentative, January) and period 3 (final, May). Mixing them double-counts.`,
          `<strong>Co-op and condo values aren't sale-based.</strong> State law makes DOF value class-2 buildings as if they were rentals (income capitalization), so their "market value" sits far below sale prices.`,
          `<strong>Market value ≠ assessed value.</strong> Assessed value for classes 1 and 2 is capped (6%/yr, 20%/5 yrs for class 1), so it lags real change. Use the market-value columns for change over time.`,
          `<strong>No neighborhood field.</strong> The roll has borough-block-lot, zip, and address only. Neighborhood totals need a BBL → NTA lookup (e.g. from the sales file or PLUTO).`,
          `<strong>${fmt(d.zero_mv_2026)} lots in the 2026 final roll have zero or blank market value</strong> (mostly exempt and condo billing lots).`,
        ]))
      )}
      ${row(
        panel('Citywide benchmark: median residential sale price', `<p>Residential market sales (> $10K, residential building classes) from DOF sales. This is the "whole city" series that a relative measure would be divided by.</p>${chartDiv('nyc-v-city')}`, 'Benchmark'),
        panel('Is there enough data per neighborhood?', `<p>For each year: how many NTAs had how many residential market sales. NTAs with under 10 sales in a year can't support a reliable median. That share was <b>${(d3.mean(thinShare, (t) => t[1]) * 100).toFixed(0)}%</b> of NTA-years on average.</p>${chartDiv('nyc-v-buckets')}`, 'Data sufficiency')
      )}
      ${panel('Assessment roll: key fields', fieldTable(d.fields, null), 'Data dictionary')}
      ${panel('Rows per roll', simpleTable(['Roll', 'Period', 'Rows'], [...d.old_years.map(([y, n]) => [y, 'final', fmt(n)]), ...d.year_period.map(([y, p, n]) => [`${fyNew(y)} (FY${y})`, p === '1' ? 'tentative' : 'final', fmt(n)])]), 'Coverage')}
    `;
    lines('#nyc-v-mv', series, { height: 240, yFmt: (v) => fmtMoney(v), valFmt: fmtMoney });
    lines('#nyc-v-city', [{ name: 'median residential sale', color: C.purple, values: d.city_median.map(([y, m2]) => [y, m2]) }], { height: 210, yFmt: fmtMoney, valFmt: fmtMoney, yMin: 0 });
    columns('#nyc-v-buckets', d.bucket_order.map((b, i) => ({ name: b + ' sales', color: d3.schemePurples[8][i + 2], values: yrs.map((y) => [y, by[y][b] || 0]) })), { unit: 'NTAs', height: 230 });
  }

  // ── CONSTRUCTION & PERMITS ───────────────────────────────────────
  async function renderConstruction(main) {
    const d = await load('construction');
    const h = d.housing;
    const yr = (rows, lo, hi) => rows.filter((r) => +r[0] >= lo && +r[0] <= hi);
    const comp = pivot(yr(h.completed, 2010, 2026).map(([y, t, n]) => [y, t, n]));
    const units = d3.rollups(yr(h.completed, 2010, 2026), (v) => d3.sum(v, (r) => r[3]), (r) => r[0]).sort();
    const bisY = d3.rollups(yr(d.bis.by_year_type, 1990, 2026), (v) => d3.sum(v, (r) => r[2]), (r) => r[0]).sort();
    const nowY = d3.rollups(yr(d.now.by_year_type, 2016, 2026), (v) => d3.sum(v, (r) => r[2]), (r) => r[0]).sort();
    const bisT = pivot(yr(d.bis.by_year_type, 2005, 2026), ['A1', 'A2', 'A3', 'NB', 'DM']);
    const nowTop = d3.rollups(d.now.by_year_type, (v) => d3.sum(v, (r) => r[2]), (r) => r[1]).sort((a, b) => b[1] - a[1]);
    const nu = h.nta_units; const vals = Object.values(nu).map((v) => v[0]).filter((v) => v > 0);
    const us = d3.scaleQuantile().domain(vals).range(d3.schemeGreens[6]);
    main.innerHTML = `
      ${hero(C.green, 'Signal · Construction &amp; renovation', 'Construction &amp; Permits',
        `Every new building, demolition, and significant renovation in NYC needs a Department of Buildings (DOB) permit. Permits live in two systems: the legacy <b>BIS</b> system (1989 on) and <b>DOB NOW</b> (2016 on, the only system for most work since ~2021). City Planning's <b>Housing Database</b> cleans the residential subset into one row per job, with net units and completion year. ${portalLink(d.datasets.housing_db, 'Housing DB ↗')} · ${portalLink(d.datasets.bis, 'BIS permits ↗')} · ${portalLink(d.datasets.now, 'DOB NOW permits ↗')} · ${portalLink(d.datasets.street, 'Street permits ↗')}`)}
      ${stats([
        [fmt(h.rows), 'Housing DB jobs (new, alteration, demolition)'], [fmt(d.bis.rows), 'BIS permits (1989–)'], [fmt(d.now.rows), 'DOB NOW permits (2016–)'],
        [fmt(d3.sum(units, (u) => u[1])), 'net new housing units completed 2010–2026'], [fmt(d.street.rows), 'DOT street-construction permits (2022–)'],
      ])}
      ${panel('Permits per year: the system switch', `<p>Total permits issued per year in each system. Neither line alone is a construction trend: BIS falls because work moved to DOB NOW, not because building stopped.</p>${chartDiv('nyc-k-switch')}`, 'Coverage over time')}
      ${row(
        panel('Housing Database: jobs completed per year', `<p>By job type (completed jobs only).</p>${chartDiv('nyc-k-comp')}<h3>Net housing units completed per year</h3>${chartDiv('nyc-k-units')}`, 'Distributions'),
        panel('Gotchas found while profiling', gotchas([
          `<strong>Two permit systems, one trend.</strong> BIS issued ${fmt((bisY.find((x) => x[0] === '2017') || [0, 0])[1])} permits in 2017 and ${fmt((bisY.find((x) => x[0] === '2024') || [0, 0])[1])} in 2024, while DOB NOW grew from near zero. Any count over time has to add both systems together.`,
          `<strong>BIS dates are text, in two formats.</strong> ${fmt(d.bis.us_dates)} rows are <code>MM/DD/YYYY</code> and ${fmt(d.bis.iso_dates)} are <code>YYYY-MM-DD</code>, so date functions fail without parsing.`,
          `<strong>One job → many permits.</strong> A single renovation gets separate permits for plumbing, scaffolding, sidewalk shed, etc. Count jobs (job number), not permit rows.`,
          `<strong>BIS job types are codes:</strong> NB = new building, A1 = major alteration (changes use/occupancy), A2 = multiple-work-type alteration, A3 = minor alteration, DM = demolition. DOB NOW uses plain-language work types instead.`,
          `<strong>DOB NOW's <code>nta</code> field holds a neighborhood <em>name</em></strong> (e.g. "East Flushing"), not a code. Filled on ${pct(d.now.nta_filled, d.now.rows)} of rows.`,
          `<strong>The Housing DB only includes jobs touching housing units.</strong> Office towers, stores, and hotels come from DOB permits instead. ${fmt(h.big_nb_by_permit_year.reduce((a, b) => a + b[1], 0))} new buildings have ≥ 100 units or ≥ 15 floors.`,
          `<strong>Street permits split at 2022.</strong> The 2013–2021 permits are in a separate dataset (<code>c9sj-fmsg</code>). Most rows are equipment or dumpster placement, not reconstruction.`,
        ]))
      )}
      ${row(
        panel('Net housing units completed by neighborhood, 2010–2026', `<p>Sum of net class-A units from completed Housing DB jobs, by 2020 NTA. Descriptive only.</p>${mapDiv('nyc-k-map')}<div id="nyc-k-leg"></div>`, 'Coverage over space'),
        panel('BIS permits by job type', `<p>Renovation (A1/A2/A3) vs. new building (NB) vs. demolition (DM), 2005 on.</p>${chartDiv('nyc-k-bist')}<h3>DOB NOW permits by work type (all years)</h3>${chartDiv('nyc-k-nowt')}`, 'Renovation vs. new')
      )}
      ${row(
        panel('Large new buildings by permit year', `<p>Housing DB new buildings with ≥ 100 proposed units or ≥ 15 floors.</p>${chartDiv('nyc-k-big')}`, 'Large facilities'),
        panel('Street-construction permit types (2022–)', chartDiv('nyc-k-street'), 'Infrastructure work')
      )}
    `;
    lines('#nyc-k-switch', [{ name: 'BIS (legacy)', color: C.gray, values: bisY.map(([y, n]) => [+y, n]) }, { name: 'DOB NOW', color: C.green, values: nowY.map(([y, n]) => [+y, n]) }], { height: 230 });
    columns('#nyc-k-comp', Object.entries(comp).map(([t, v], i) => ({ name: t, color: [C.green, C.blue, C.red][i % 3], values: v })), { height: 210, unit: 'jobs' });
    columns('#nyc-k-units', [{ name: 'net units', color: C.green, values: units }], { height: 170, unit: 'units' });
    await nycMap('#nyc-k-map', {
      fill: (f) => { const v = nu[f.properties.code]; return v && v[0] > 0 ? us(v[0]) : '#e4e4de'; },
      tipExtra: (f) => { const v = nu[f.properties.code]; return v ? `${fmt(v[0])} net units · ${fmt(v[1])} completed jobs` : 'none'; },
    });
    document.getElementById('nyc-k-leg').innerHTML = quantileLegend(us, (v) => fmt(Math.round(v)));
    columns('#nyc-k-bist', Object.entries(bisT).map(([t, v], i) => ({ name: t, color: PALETTE[i], values: v })), { height: 210, maxTicks: 11 });
    barH('#nyc-k-nowt', nowTop.slice(0, 12), { color: C.green, barHeight: 13, labelWidth: 200 });
    columns('#nyc-k-big', [{ name: 'large new buildings', color: C.green, values: h.big_nb_by_permit_year.filter((r) => +r[0] >= 2000) }], { height: 190, unit: 'buildings' });
    barH('#nyc-k-street', d.street.types.slice(0, 12), { color: C.brown, barHeight: 13, labelWidth: 260, total: d.street.rows });
  }

  // ── CAPITAL SPENDING ─────────────────────────────────────────────
  async function renderCapital(main) {
    const d = await load('capital');
    const sub = await load('subway');
    const spent = d3.sum(d.by_agency, (a) => a[3]);
    const located = d.markers.length;
    const agencies = [...new Set(d.markers.map((m) => m[2]))];
    const acol = (a) => PALETTE[agencies.indexOf(a) % PALETTE.length];
    const stationProj = sub.projects.filter((p) => /Station/i.test(p.asset_categories || ''));
    main.innerHTML = `
      ${hero(C.brown, 'Signal · Public investment', 'Infrastructure &amp; Capital Spending',
        `"Money going into a neighborhood" from government shows up in the city's capital budget. The <b>Capital Projects Database</b> (CPDB, from City Planning) lists every project in the current capital plan with planned, committed, and spent dollars, and maps the ones it can. The <b>Capital Commitment Plan</b> has every plan edition since 2016, by budget line. MTA projects are on the ${tabLink('subway', 'Subway')} tab. ${portalLink(d.datasets.cpdb, 'CPDB ↗')} · ${portalLink(d.datasets.points, 'CPDB points ↗')} · ${portalLink(d.datasets.plan, 'Commitment Plan ↗')}`)}
      ${stats([
        [fmt(d.rows), `projects in CPDB (${esc(d.version)})`], [fmtMoney(spent), 'spent to date, top 20 agencies'],
        [fmt(located), 'projects with a mappable location'], [pct(located, d.rows), 'of projects mappable'], [d.plan_pubs.length, 'Commitment Plan editions'],
      ])}
      ${row(
        panel('Mapped capital projects', `<p>One dot per project with a point or polygon (polygons drawn at their center), colored by managing agency. Hover for description and dollars.</p>${mapDiv('nyc-p-map')}`, 'Coverage over space'),
        panel('Gotchas found while profiling', gotchas([
          `<strong>Only ${pct(located, d.rows)} of projects have a location.</strong> Big-ticket items such as water tunnels, citywide IT, and "lump sum" programs can't be pinned to a neighborhood, and those are a large share of dollars.`,
          `<strong>CPDB is one plan snapshot</strong> (${esc(d.version)}). Spent-to-date is cumulative over each project's life, so it isn't spending <em>in</em> a given year. History needs older CPDB releases (published by DCP, not all on the portal).`,
          `<strong>Managing agency ≠ sponsor.</strong> DDC (Design &amp; Construction) builds for other agencies, so it tops the list without being the agency that wanted the project.`,
          `<strong>The Commitment Plan has no geography at all.</strong> It's a budget-line ledger ("HW-…" = highways, "ED-…" = education), good for citywide totals per edition only.`,
          `<strong>Dollar fields mix planned, committed, and spent.</strong> They are different stages of the same money and shouldn't be added together.`,
        ]))
      )}
      ${row(
        panel('Spent to date by managing agency (top 20)', chartDiv('nyc-p-agency'), 'Distributions'),
        panel('Projects by type', `${simpleTable(['Type', 'Projects', 'Spent to date'], d.by_type.map(([t, n, s]) => [esc(t), fmt(n), fmtMoney(s)]))}
          <h3>Commitment Plan: rows per edition</h3>${chartDiv('nyc-p-plan')}`, 'Distributions')
      )}
      ${panel('MTA station projects in the capital dashboard', `<p>${stationProj.length} of ${sub.projects.length} MTA capital projects are tagged as station work. More on the Subway tab.</p>${simpleTable(['Project', 'Stage', 'Start', 'Est. completion', 'Est. cost'], stationProj.slice(0, 15).map((p) => [esc(p.title), esc(p.stage), day(p.start_date), day(p.estimated_actual_completion_date), p.estimated_actual_project_cost ? fmtMoney(+p.estimated_actual_project_cost) : '—']))}`, 'Transit')}
    `;
    await nycMap('#nyc-p-map', { markers: d.markers.map(([lon, lat, a, desc, s, p, kind]) => ({ lon, lat, color: acol(a), tip: `<b>${esc(desc)}</b><br>${esc(a)} · ${kind}<br>spent ${fmtMoney(s)} · planned ${fmtMoney(p)}` })), markerR: 2.6 });
    barH('#nyc-p-agency', d.by_agency.map((a) => [`${a[0]} · ${a[1]}`, a[3]]), { color: C.brown, barHeight: 13, labelWidth: 260, valueFmt: fmtMoney });
    columns('#nyc-p-plan', [{ name: 'budget-line rows', color: C.brown, values: d.plan_pubs.map(([p, n]) => [p.slice(0, 4) + '-' + p.slice(4, 6), n]) }], { height: 170, maxTicks: 11, xFmt: (v) => v.slice(0, 4) });
  }

  // ── SCHOOLS ──────────────────────────────────────────────────────
  async function renderSchools(main) {
    const d = await load('schools');
    const sqrY = d3.rollups(d.sqr.filter((r) => r[1] === 'EMS' || r[1] === 'HS'), (v) => d3.sum(v, (r) => r[3]), (r) => r[0]).sort();
    const catCol = {}; d.categories.forEach(([c], i) => { catCol[c] = PALETTE[i % PALETTE.length]; });
    const ela = d.tests.ela, math = d.tests.math;
    main.innerHTML = `
      ${hero(C.teal, 'Signal · Schools', 'Public School Ratings',
        `The DOE publishes a yearly <b>School Quality Report</b> for every school (hundreds of metrics: test proficiency, attendance, surveys, ratings) and the state test results by school. Each school is identified by its <b>DBN</b> (district-borough-number, e.g. <code>15K001</code>), which links to a location file. ${portalLink(d.datasets.sqr, 'School Quality Reports ↗')} · ${portalLink(d.datasets.ela, 'ELA results ↗')} · ${portalLink(d.datasets.math, 'Math results ↗')} · ${portalLink(d.datasets.locs, 'School locations ↗')}`)}
      ${stats([
        [sqrY.length, `School Quality Report years (${sqrY[0][0]}–${sqrY[sqrY.length - 1][0]})`], [fmt(d.sqr_metrics), 'distinct metrics'],
        [ela.city.length, 'state-test years (2013–2023)'], [fmt(d.locations_total), 'school locations (2019–20 file)'],
      ])}
      ${row(
        panel('School locations', `<p>One dot per school building (2019–20 file), by school level.</p>${mapDiv('nyc-s-map')}
          <div class="nyc-legend">${d.categories.slice(0, 7).map(([c, n]) => `<span><i style="background:${catCol[c]}"></i>${esc(c)} (${n})</span>`).join('')}</div>`, 'Coverage over space'),
        panel('Gotchas found while profiling', gotchas([
          `<strong>No tests in 2020, and 2021 was opt-in.</strong> The state results file jumps from 2019 to 2022, so there's a hole right where COVID hit.`,
          `<strong>Test changes break comparisons.</strong> New York shortened its tests in 2018 and moved to new standards in 2023. The state cautions against comparing proficiency across those breaks.`,
          `<strong>School Quality Reports are long format:</strong> one row per school × metric × year (1.5M rows). Metric names and the rating scale changed over the years, so pick metrics that exist in every year.`,
          `<strong>School ≠ neighborhood.</strong> Many students attend schools outside their zone (choice, charters, high-school admissions). Rating changes partly reflect who enrolls, not just the school.`,
          `<strong>The location file is a 2019–20 snapshot</strong> with <b>2010</b> NTA codes. Schools that opened or closed since aren't in it.`,
        ]))
      )}
      ${row(
        panel('Citywide % proficient (Level 3 + 4)', `<p>All grades, all students, grades 3–8. Dashed lines mark the test-change years (2018, 2023).</p>${chartDiv('nyc-s-tests')}`, 'Coverage over time'),
        panel('Schools reported per year', `<p>Distinct schools with School Quality Reports (elementary/middle + high school), and with test results.</p>${chartDiv('nyc-s-n')}
          <h3>Most common School Quality Report metrics (elementary/middle)</h3>${chartDiv('nyc-s-metrics')}`, 'Completeness')
      )}
    `;
    await nycMap('#nyc-s-map', { points: d.locations, pointColor: (p) => catCol[p[3]] || C.gray, radius: 1.8, alpha: 0.8 });
    lines('#nyc-s-tests', [{ name: 'ELA', color: C.teal, values: ela.city.map(([y, p]) => [y, p]) }, { name: 'Math', color: C.blue, values: math.city.map(([y, p]) => [y, p]) }],
      { height: 220, yFmt: (v) => v + '%', valFmt: (v) => v + '%' });
    const svg = d3.select('#nyc-s-tests svg');
    // mark test-change years
    const xs = d3.scaleLinear().domain([2013, 2023]).range([56, 668]);
    [2018, 2023].forEach((yy) => svg.append('line').attr('x1', xs(yy)).attr('x2', xs(yy)).attr('y1', 10).attr('y2', 212).attr('stroke', C.gray).attr('stroke-dasharray', '4 3'));
    columns('#nyc-s-n', [{ name: 'Quality Reports', color: C.teal, values: sqrY.map(([y, n]) => [y, n]) }, { name: 'ELA tests', color: C.blue, values: ela.schools }], { height: 190, unit: 'schools' });
    barH('#nyc-s-metrics', d.sqr_top_metrics, { color: C.teal, barHeight: 12, labelWidth: 300 });
  }

  // ── CRIME ────────────────────────────────────────────────────────
  async function renderCrime(main) {
    const d = await load('crime');
    const st = pivot(d.street);
    const last = d.by_year[d.by_year.length - 1];
    const robYears = Object.keys(d.robbery_by_year).map(Number).sort((a, b) => a - b);
    const robDefault = robYears.includes(last[0]) ? last[0] : robYears[robYears.length - 1];
    main.innerHTML = `
      ${hero(C.ink, 'Signal · Street crime', 'Crime (NYPD Complaints)',
        `Every felony, misdemeanor, and violation reported to the NYPD since 2006, one row per complaint, with offense type, premise, and a map point. "Street crime" isn't a field. The closest pieces are the offense category (robbery, felony assault, larceny…), its sub-type (<code>pd_desc</code>, e.g. "ROBBERY, PERSONAL ELECTRONIC DEVICE"), and premise = STREET. ${portalLink(d.datasets.hist, 'Historic ↗')} · ${portalLink(d.datasets.ytd, 'Year-to-date ↗')}`)}
      ${stats([
        [fmt(d.rows), 'complaints 2006–2025 (historic file)'], [fmt(d.ytd_rows), `complaints in 2026 YTD file (through ${day(d.ytd_last)})`],
        [fmt(last[1]), `complaints reported in ${last[0]}`], [pct(last[2], last[1]), `with coordinates in ${last[0]}`],
      ])}
      ${panel('Street-type offenses reported per year', `<p>Six offense categories, by report year. 2026 is a partial year (YTD file).</p>${chartDiv('nyc-x-street')}`, 'Coverage over time')}
      ${row(
        panel('Robberies reported, by year', `<p>Density of robbery complaints on a ~400 m grid, by the year they were reported. Drag to change the year. Every year uses the same color scale, so darker means more robberies, not just a relatively busier cell.</p>
          <div class="nyc-year-pick"><input type="range" id="nyc-x-year" min="${robYears[0]}" max="${robYears[robYears.length - 1]}" step="1" value="${robDefault}" aria-label="Year">
          <span id="nyc-x-year-label" class="nyc-year-label"></span></div>${mapDiv('nyc-x-map')}`, 'Coverage over space'),
        panel('Gotchas found while profiling', gotchas([
          `<strong>Reported ≠ committed.</strong> Complaints depend on people calling the police, and willingness to report can itself differ by neighborhood and change over time.`,
          `<strong>Two files.</strong> Historic (through ${d.by_year[d.by_year.length - 1][0]}) and current year-to-date (lags ~1 quarter). A full series has to stack them.`,
          `<strong>Report date vs. occurrence date.</strong> ${fmt(d.late_reports_2025)} complaints reported in 2025 happened before 2024. ${fmt(d.bad_dates)} rows have impossible occurrence dates (before 2000, some in year 1010).`,
          `<strong>Locations are offset</strong> to the middle of the block for privacy, and some sensitive offenses (rape, some sex crimes) have no location at all.`,
          `<strong>Offense names are truncated and inconsistent</strong> ("OTHER OFFENSES RELATED TO THEF" and "…THEFT" both appear), so group on the code <code>ky_cd</code>/<code>pd_cd</code>, not the text.`,
          `<strong>Precinct is the native geography.</strong> 77 precincts don't nest in NTAs, so points are the way to reach neighborhoods.`,
        ]))
      )}
      ${row(
        panel('Robbery sub-types (all years)', `<p>The nearest thing to "mugging" is the open-area, personal-device, bag-snatch, and jewelry robberies.</p>${chartDiv('nyc-x-rob')}`, 'Distributions'),
        panel('Where complaints happen (premise type)', chartDiv('nyc-x-prem'), 'Distributions')
      )}
      ${row(
        panel('Top offense categories (all years)', chartDiv('nyc-x-off'), 'Distributions'),
        panel('Key fields', fieldTable([
          ['cmplnt_num', 'id', 'Complaint ID'], ['rpt_dt', 'date', 'Date reported to police'], ['cmplnt_fr_dt', 'date', 'Date the offense started'],
          ['ofns_desc', 'category', 'Offense category (~70 values)'], ['pd_desc', 'category', 'Detailed offense sub-type (~400 values)'],
          ['law_cat_cd', 'category', 'Felony / misdemeanor / violation'], ['crm_atpt_cptd_cd', 'flag', 'Completed or attempted'],
          ['boro_nm', 'text', 'Borough'], ['addr_pct_cd', 'number', 'Precinct'], ['prem_typ_desc', 'category', 'Premise (street, residence, chain store…)'],
          ['loc_of_occur_desc', 'category', 'Inside / front of / rear of / opposite of'], ['latitude', 'number', 'Block-midpoint latitude'],
          ['susp_age_group', 'category', 'Suspect age group'], ['vic_age_group', 'category', 'Victim age group'],
        ], d.missing_pct), 'Data dictionary')
      )}
    `;
    lines('#nyc-x-street', Object.entries(st).map(([o, v], i) => ({ name: o.toLowerCase(), color: PALETTE[i], values: v })), { height: 260 });
    const rob = await load('crime_robbery_years');
    const robMax = d3.max(Object.values(rob.years), (v) => d3.max(v.grid, (g) => g[2]));
    const slider = document.getElementById('nyc-x-year');
    const drawRob = async () => {
      const y = +slider.value, v = rob.years[y];
      document.getElementById('nyc-x-year-label').innerHTML = `<b>${y}</b> · ${v ? fmt(v.n) : 0} robberies${y === rob.partial_year ? ` <span class="muted">(partial year, through ${day(d.ytd_last)})</span>` : ''}`;
      const mapEl = document.getElementById('nyc-x-map');
      if (mapEl.nextElementSibling?.classList.contains('nyc-legend')) mapEl.nextElementSibling.remove();
      await nycMap('#nyc-x-map', { grid: v ? v.grid : [], gridMax: robMax, cellDeg: rob.cell_deg, gridInterp: d3.interpolateGreys, gridLegend: 'robberies per cell' });
    };
    // One redraw at a time; a drag mid-redraw just triggers one more pass with the latest year.
    let busy = false, again = false;
    const redraw = async () => {
      if (busy) { again = true; return; }
      busy = true;
      do { again = false; await drawRob(); } while (again);
      busy = false;
    };
    slider.addEventListener('input', redraw);
    await redraw();
    barH('#nyc-x-rob', d.robbery_types, { color: C.ink, barHeight: 13, labelWidth: 280 });
    barH('#nyc-x-prem', d.premises, { color: C.gray, barHeight: 13, labelWidth: 220, total: d.rows });
    barH('#nyc-x-off', d.offenses.slice(0, 18), { color: C.ink, barHeight: 12, labelWidth: 250, total: d.rows });
  }

  // ── SUBWAY ───────────────────────────────────────────────────────
  async function renderSubway(main) {
    const d = await load('subway');
    const stationProj = d.projects.filter((p) => /Station/i.test(p.asset_categories || ''));
    const pw = d3.rollups(d.alerts.filter((a) => a[3] > 0), (v) => d3.sum(v, (a) => a[3]), (a) => a[0]).sort((a, b) => b[1] - a[1]);
    const sub = d.alerts.filter((a) => a[0] === 'NYCT Subway');
    const rid = d.ridership;
    main.innerHTML = `
      ${hero(C.yellow, 'Signal · Transit disruption', 'Subway: Renovation &amp; Disruption',
        `The idea: does repeated renovation or disruption at a station change who lives nearby, and how long do those projects take? The MTA publishes the <b>stations</b> themselves, monthly <b>ridership by station</b>, <b>elevator/escalator outages</b> (including scheduled ones), a <b>service-alert archive</b>, and a <b>capital-project dashboard</b> with start and completion dates. ${portalLink(d.datasets.stations, 'Stations ↗', true)} · ${portalLink(d.datasets.ridership, 'Ridership ↗', true)} · ${portalLink(d.datasets.elevators, 'Elevators ↗', true)} · ${portalLink(d.datasets.alerts, 'Alerts ↗', true)} · ${portalLink(d.datasets.capital, 'Capital projects ↗', true)}`)}
      ${stats([
        [d.stations.length, 'subway stations (platform level)'], [rid.length, `months of station ridership (${rid[0][0]}–)`],
        [d.projects.length, 'projects in the MTA capital dashboard'], [stationProj.length, 'tagged as station work'],
        [fmt(d3.sum(sub, (a) => a[3])), 'subway "planned work" alerts in the archive'],
      ])}
      ${row(
        panel('Stations', `<p>Yellow = fully ADA accessible, gray = not (or partially).</p>${mapDiv('nyc-m-map')}`, 'Coverage over space'),
        panel('Gotchas found while profiling', gotchas([
          `<strong>Subway planned work isn't in the alert archive.</strong> Of ${fmt(d3.sum(d.alerts, (a) => a[3]))} "planned-work" alerts, ${fmt((pw.find((p) => p[0] === 'NYCT Subway') || [0, 0])[1])} are for the subway. Nearly all are Bridges &amp; Tunnels. Weekend subway service changes were published separately and aren't archived as open data.`,
          `<strong>The capital dashboard is current projects only</strong> (${d.projects.length}), not a history of every past renovation. Station names live in free-text titles, with no station ID.`,
          `<strong>Ridership is by station <em>complex</em></strong> (transfer stations combined), while the station file is by platform. Ridership collapsed in 2020, so pre/post-COVID comparisons need care.`,
          `<strong>Elevator outages are the best per-station disruption series</strong> (monthly, since 2015, scheduled vs. unscheduled). But they cover only stations that have elevators or escalators.`,
          `<strong>"How long can a plan for that happen"</strong>: the dashboard has goal vs. estimated completion dates for current projects, which shows schedule slippage, but only for open projects.`,
        ]))
      )}
      ${panel('Monthly subway ridership (all stations)', `<p>Sum of station-complex entries per month. The COVID drop and partial recovery dominate everything else.</p>${chartDiv('nyc-m-rid')}`, 'Coverage over time')}
      ${row(
        panel('Elevator &amp; escalator outages per year', `<p>Scheduled (planned maintenance/replacement) vs. unscheduled. The equipment count grows as new elevators are installed.</p>${chartDiv('nyc-m-elev')}`, 'Disruption'),
        panel('What the subway alerts do contain', `<p>Status labels on NYCT Subway alerts, 2020 on.</p>${chartDiv('nyc-m-labels')}`, 'Disruption')
      )}
      ${panel('Station projects: schedule', simpleTable(['Project', 'Stage', 'Start', 'Goal completion', 'Est. completion', 'Schedule', 'Est. cost'],
        stationProj.map((p) => [esc(p.title), esc(p.stage), day(p.start_date), day(p.goal_completion_date), day(p.estimated_actual_completion_date), esc(p.schedule_status || '—'), p.estimated_actual_project_cost ? fmtMoney(+p.estimated_actual_project_cost) : '—'])), 'Capital projects')}
    `;
    await nycMap('#nyc-m-map', { markers: d.stations.map(([lon, lat, name, routes, struct, ada]) => ({ lon, lat, color: ada === '1' ? C.yellow : '#9a9a9a', tip: `<b>${esc(name)}</b><br>${esc(routes)} · ${esc(struct)}` })), markerR: 2.8 });
    lines('#nyc-m-rid', [{ name: 'entries', color: C.ink, values: rid.map(([m, r]) => [m, r]) }], { time: true, height: 220, valFmt: (v) => d3.format('.3s')(v) });
    columns('#nyc-m-elev', [{ name: 'scheduled', color: C.yellow, values: d.elevators.map((e) => [e[0], e[1]]) }, { name: 'unscheduled', color: C.gray, values: d.elevators.map((e) => [e[0], e[2]]) }], { height: 200, unit: 'outages' });
    barH('#nyc-m-labels', d.subway_labels, { color: C.yellow, barHeight: 13, labelWidth: 220 });
  }

  // ── FIRES ────────────────────────────────────────────────────────
  async function renderFires(main) {
    const d = await load('fires');
    const g = pivot(d.by_year_group.filter((r) => r[0] >= 2005), ['Structural Fires', 'NonStructural Fires']);
    const cy = pivot(d.causes_by_year);
    const incendiary = (cy.Incendiary || []).map(([y, n]) => { const t = d3.sum(d.causes_by_year.filter((r) => r[0] === y), (r) => r[2]); return [y, t ? +(100 * n / t).toFixed(1) : null]; });
    const sg = d.structural_geo;
    main.innerHTML = `
      ${hero(C.red, 'Signal · Fires', 'Fires (FDNY)',
        `Two FDNY datasets. <b>Fire Incident Dispatch</b> has every incident the FDNY was dispatched to since 2005 (fires, medical, false alarms…), classified by type. The <b>Bureau of Fire Investigations</b> file covers fires the Fire Marshals investigated since 2016, with a cause (including <em>incendiary</em>, i.e. deliberately set). ${portalLink(d.datasets.dispatch, 'Dispatch ↗')} · ${portalLink(d.datasets.causes, 'Fire causes ↗')}`)}
      ${stats([
        [fmt(d.rows), 'dispatch incidents (2005–2026)'], [fmt(d3.sum(d.structural_boro, (b) => b[1])), 'structural fires'],
        [fmt(d.causes_rows), 'Fire Marshal investigations (2016–)'], ['none', 'point locations in either file'],
      ])}
      ${row(
        panel('Fires dispatched per year', `<p>Structural vs. non-structural (car, rubbish, brush). 2026 is partial.</p>${chartDiv('nyc-f2-yr')}`, 'Coverage over time'),
        panel('Gotchas found while profiling', gotchas([
          `<strong>No coordinates.</strong> The finest geography is zip code (${pct(sg.z, sg.t)} filled), community district (${pct(sg.cd, sg.t)}), or police precinct. None of them nest neatly in NTAs.`,
          `<strong>Most dispatches aren't fires.</strong> Medical and non-medical emergencies are ~88% of rows. Filter on <code>incident_classification_group</code>.`,
          `<strong>"Structural fire" is mostly cooking.</strong> The biggest single class is "food on the stove" in apartment buildings, very different from a building-destroying fire. Use <code>highest_alarm_level</code> to find serious ones.`,
          `<strong>Investigations aren't all fires.</strong> Investigations are a selected subset, and "Preliminary Investigation Only" is the top cause value (cause not determined).`,
          `<strong>The incendiary share depends on which fires get investigated</strong>, and recent years may still be under investigation, so the latest years can look artificially low.`,
        ]))
      )}
      ${row(
        panel('Structural fires by class (2005–2026)', chartDiv('nyc-f2-cls'), 'Distributions'),
        panel('Fire Marshal: % of investigated fires ruled incendiary', `${chartDiv('nyc-f2-inc')}<h3>Top recorded causes</h3>${chartDiv('nyc-f2-cause')}`, 'Distributions')
      )}
      ${panel('Structural fires by borough', chartDiv('nyc-f2-boro'), 'Distributions')}
    `;
    columns('#nyc-f2-yr', Object.entries(g).map(([k, v], i) => ({ name: k, color: [C.red, C.orange][i], values: v })), { height: 220, unit: 'incidents' });
    barH('#nyc-f2-cls', d.structural_classes.slice(0, 14), { color: C.red, barHeight: 13, labelWidth: 260 });
    lines('#nyc-f2-inc', [{ name: '% incendiary', color: C.red, values: incendiary }], { height: 180, yFmt: (v) => v + '%', valFmt: (v) => v + '%' });
    barH('#nyc-f2-cause', d.causes.slice(0, 12), { color: C.red, barHeight: 12, labelWidth: 260 });
    barH('#nyc-f2-boro', d.structural_boro, { color: C.red, labelWidth: 200, total: d3.sum(d.structural_boro, (b) => b[1]) });
  }

  // ── CASE STUDY: BUSHWICK ─────────────────────────────────────────
  // One neighborhood the published reports call gentrified, lined up
  // across every dataset and year we have. Built by
  // nyc-data-explorer/build_case_study.py. Still descriptive: what changed
  // and when, next to comparison areas. No models.
  const CASE_C = { Bushwick: C.orange, Williamsburg: C.blue, 'East New York': C.gray, NYC: C.ink, Brooklyn: C.purple };
  const CASE_S = { Bushwick: { width: 3 }, Williamsburg: { width: 1.6 }, 'East New York': { width: 1.6, dash: '5 4' }, NYC: { width: 1.4, dash: '2 3' }, Brooklyn: { width: 1.4, dash: '2 3' } };
  const caseSeries = (names, fn) => names.map((n) => ({ name: n, color: CASE_C[n], ...CASE_S[n], values: fn(n) }));
  const usd = (v) => (v == null ? '—' : '$' + fmt(Math.round(v)));
  const pctTxt = (v) => (v == null ? '—' : fmt1(v) + '%');
  const CASE_IND = [
    { k: 'rent', label: 'Median gross rent (paid)', f: usd, money: true },
    { k: 'income', label: 'Median household income', f: usd, money: true },
    { k: 'ba_pct', label: "Adults 25+ with a bachelor's degree", f: pctTxt },
    { k: 'white_pct', label: 'Non-Hispanic white residents', f: pctTxt },
    { k: 'hisp_pct', label: 'Hispanic residents', f: pctTxt },
    { k: 'age2034_pct', label: 'Residents aged 20–34', f: pctTxt },
    { k: 'poverty_pct', label: 'Residents below the poverty line', f: pctTxt },
    { k: 'renter_pct', label: 'Homes that are rented', f: pctTxt },
  ];
  const CASE_EVENTS = [
    [2005, 'Williamsburg–Greenpoint waterfront rezoning'],
    [2008, 'Financial crisis; Roberta’s opens on Moore St'],
    [2013, 'Rheingold brewery site rezoned for housing'],
    [2015, 'Citywide rush to permit before the 421-a tax break lapses'],
    [2019, 'L-train tunnel repairs (nights/weekends, Apr 2019–Apr 2020)'],
    [2020, 'COVID-19; no standard 1-year ACS release'],
    [2022, 'Census redraws the Bushwick PUMA (series break)'],
  ];

  async function renderCase(main) {
    const d = await load('case_bushwick');
    const T = await load('case_bushwick_tracts');
    const A = d.acs1;
    const years = d3.range(2005, d3.max(Object.keys(A.Bushwick).map(Number)) + 1);
    const y0 = years[0], y1 = years[years.length - 1];
    const at = (area, y, k) => (A[area][y] ? A[area][y][k] : null);
    const annual = (k) => (n) => years.map((y) => [y, at(n, y, k)]);
    const BREAKS = [[2020, 'no 2020'], [2022, 'PUMA redrawn']];
    const CRIME_SHOWN = ['total', 'ROBBERY', 'FELONY ASSAULT', 'DANGEROUS DRUGS'];

    // Change tiles: first year -> last year, Bushwick vs NYC
    const tiles = CASE_IND.map((ind) => {
      const a = at('Bushwick', y0, ind.k), b = at('Bushwick', y1, ind.k);
      const ca = at('NYC', y0, ind.k), cb = at('NYC', y1, ind.k);
      const ch = (p, q) => (p == null || q == null ? null : ind.money ? 100 * (q - p) / p : q - p);
      const bw = ch(a, b), ny = ch(ca, cb);
      const unit = ind.money ? '%' : ' pts';
      const sign = (v) => (v == null ? '—' : (v > 0 ? '+' : '') + fmt1(v) + unit);
      const mx = Math.max(Math.abs(bw || 0), Math.abs(ny || 0)) || 1;
      const bar = (v, color, who) => `<div class="case-bar-row"><span>${who}</span><div class="case-bar-track"><div class="case-bar" style="width:${(100 * Math.abs(v || 0) / mx).toFixed(1)}%;background:${color}"></div></div><b>${sign(v)}</b></div>`;
      return `<div class="case-tile"><div class="case-tile-label">${ind.label}</div>
        <div class="case-tile-nums"><span class="muted">${ind.f(a)}</span><span class="case-arrow">→</span><span>${ind.f(b)}</span></div>
        ${bar(bw, C.orange, 'Bushwick')}${bar(ny, C.ink, 'NYC')}</div>`;
    }).join('');

    // Furman/Comptroller-style placement of every NYC PUMA, 2012 -> 2019
    const P12 = d.pumas['2012'], P19 = d.pumas['2019'];
    const pts = Object.keys(P12).filter((c) => P19[c] && P12[c].income && P12[c].rent && P19[c].rent).map((c) => ({
      code: c, name: P12[c].name, cd: P12[c].cd, inc: P12[c].income, rent12: P12[c].rent,
      rg: 100 * (P19[c].rent - P12[c].rent) / P12[c].rent, bag: P19[c].ba_pct - P12[c].ba_pct,
    }));
    const incCut = d3.quantile(pts.map((p) => p.inc).sort(d3.ascending), 0.4);
    const rgMed = d3.median(pts, (p) => p.rg), bagMed = d3.median(pts, (p) => p.bag);
    const rentMed12 = d3.median(pts, (p) => p.rent12);
    const bwP = pts.find((p) => p.code === d.areas.Bushwick.puma_old);
    const rankOf = (arr, v, desc) => 1 + arr.filter((x) => (desc ? x > v : x < v)).length;
    const check = (ok, text) => `<li class="${ok ? 'yes' : 'no'}"><span class="case-check">${ok ? '✓' : '✗'}</span>${text}</li>`;

    // Pre-factor dot plot rows (shares), first year
    const preRows = ['renter_pct', 'poverty_pct', 'hisp_pct', 'ba_pct', 'white_pct', 'age2034_pct'];
    const se = d.streeteasy;
    const seAnnual = (n, y) => { const v = se.months.map((m, i) => [m, se.series[n] ? se.series[n][i] : null]).filter(([m, x]) => m.startsWith(String(y)) && x != null); return v.length ? d3.mean(v, (q) => q[1]) : null; };
    const seFirst = +se.months[0].slice(0, 4);
    const gap0 = seAnnual('Bushwick', seFirst) / seAnnual('Williamsburg', seFirst);

    main.innerHTML = `
      ${hero(C.orange, 'Case study · one neighborhood', 'Bushwick, Brooklyn: what gentrification looked like in the data',
        `Before analyzing the whole city, here's one place the published research calls gentrified, followed through every dataset we have, year by year. Bushwick is on the <a href="https://furmancenter.org/research/sonychan/2015-report" target="_blank" rel="noopener">NYU Furman Center's</a> list of 15 gentrifying neighborhoods and the <a href="https://comptroller.nyc.gov/reports/nyc-neighborhood-economic-profiles/" target="_blank" rel="noopener">NYC Comptroller's</a> 2010–2016 neighborhood profiles. Its biggest shift happened <em>inside</em> our data window (roughly 2008–2019), and its police precinct (the 83rd) lines up almost exactly with its community district. Orange is always Bushwick. The comparisons are <b style="color:${C.blue}">Williamsburg</b> (next door, changed first), <b>East New York</b> (also low-income, but <em>not</em> on Furman's gentrifying list), and <b>NYC</b>.`)}

      ${panel(`${y0} → ${y1}: what changed`, `<p>Census ACS 1-year estimates for the Bushwick PUMA (Community District 4). Bars compare the size of the change in Bushwick with the change citywide. Dollar rows are % change, nominal. Share rows are percentage-point change. The ${y1} values use the PUMA boundaries the Census redrew in 2022, so part of any change is the new boundary, not the neighborhood.</p><div class="case-tiles">${tiles}</div>`, 'The headline')}

      ${panel('Timeline', `<p>Events that matter for reading the charts below. Dashed lines on later charts mark data breaks, not events.</p>${chartDiv('case-timeline')}`, 'Context')}

      ${row(
        panel('How the sources define “gentrifying”', `
          <div class="case-defs">
            <div><b>NYU Furman Center (2016)</b><span>Sub-borough area was <b>low-income in 1990</b> (bottom 40%) <b>and</b> had <b>above-median rent growth</b> 1990–2014. 15 of 55 areas qualified, Bushwick among them.</span></div>
            <div><b>NYC Comptroller (2017)</b><span>Neighborhood had <b>below-median rent in 2010</b>, <b>above-average rent growth</b> to 2016, <b>and</b> faster-than-median growth in <b>bachelor's degrees</b>. 24 neighborhoods qualified.</span></div>
            <div><b>Urban Displacement Project</b><span>Tract-level stages (at risk → early/ongoing → advanced → exclusive). A tract is first <b>vulnerable</b> (mostly low-income, renter, non-white, few college grads vs. the region), then shows <b>demographic change</b> (college-educated share and income rising faster than the region) <b>plus a hot market</b> (rents or home values rising faster than the region).</span></div>
          </div>
          <p>Shared ingredients: <b>a low-income starting point</b>, <b>rent rising faster than the city</b>, and <b>who lives there changing</b> (education, income, race, age).</p>`, 'Definitions'),
        panel('Does Bushwick meet them in our data? (2012 → 2019)', `
          <p>Same tests, using our data: all ${pts.length} NYC PUMAs, 2012 vs. 2019 (one set of boundaries, before COVID). This is a replication of the <em>rules</em>, not the original studies' years.</p>
          <ul class="case-checks">
            ${check(bwP.inc <= incCut, `Low-income start: 2012 median income ${usd(bwP.inc)}, #${rankOf(pts.map((p) => p.inc), bwP.inc)} lowest of ${pts.length} (bottom-40% cutoff ${usd(incCut)})`)}
            ${check(bwP.rent12 <= rentMed12, `Below-median rent at the start: ${usd(bwP.rent12)} vs. PUMA median ${usd(rentMed12)}`)}
            ${check(bwP.rg > rgMed, `Rent growth ${fmt1(bwP.rg)}%, #${rankOf(pts.map((p) => p.rg), bwP.rg, true)} fastest (median ${fmt1(rgMed)}%)`)}
            ${check(bwP.bag > bagMed, `Bachelor's share +${fmt1(bwP.bag)} pts, #${rankOf(pts.map((p) => p.bag), bwP.bag, true)} fastest (median +${fmt1(bagMed)} pts)`)}
          </ul>
          ${bwP.rent12 > rentMed12 ? `<p class="case-note">The one miss says something about timing: by 2012 Bushwick's rent had already climbed to the middle of the pack. The change started before 2012, which matches the 2005–2012 rise in the charts below.</p>` : ''}
          ${chartDiv('case-quad')}
          <p class="case-note">Each dot is a PUMA. Left of the vertical line = low-income start (bottom 40%). Above the horizontal line = faster-than-median rent growth. The shaded corner is where both hold. Hover for names.</p>`, 'Definitions, applied')
      )}

      ${panel('Every indicator, every year', `<p>ACS 1-year estimates (PUMA level, annual since ${y0}). Dashed verticals are <b>data breaks</b>: no standard 2020 release, and new PUMA boundaries from 2022. Hover the dots for values.</p>
        <div class="case-grid">${CASE_IND.map((ind) => `<div><h3>${ind.label}</h3>${chartDiv('case-ts-' + ind.k)}</div>`).join('')}</div>
        <div class="nyc-legend">${['Bushwick', 'Williamsburg', 'East New York', 'NYC'].map((n) => `<span><i style="background:${CASE_C[n]}"></i>${n}</span>`).join('')}</div>`, 'Change over time')}

      ${row(
        panel('Before it happened: the pre-factors', `<p>What Bushwick looked like in ${y0} next to the city. These are the conditions the definitions treat as “vulnerable.” Dot = share of residents/homes.</p>${chartDiv('case-pre')}
          <ul class="case-facts">
            <li><b>Cheaper than the neighbor.</b> In ${seFirst}, Bushwick asking rents were ${Math.round(100 * gap0)}% of Williamsburg's.</li>
            <li><b>Same subway line.</b> The L train runs straight through Williamsburg into Bushwick and on to Manhattan.</li>
            <li><b>Mostly renters, older housing</b>, plus industrial lofts near the Williamsburg border.</li>
          </ul>`, 'Pre-factors'),
        panel('Catching up to the neighbor', `<p>StreetEasy median <em>asking</em> rent (monthly). The bottom chart is Bushwick as a share of Williamsburg: a rising line means Bushwick is closing the gap. That spread from one neighborhood to the next is the pattern a time-series model would test.</p>${chartDiv('case-se')}${chartDiv('case-se-ratio')}`, 'Spillover')
      )}

      ${panel('Inside Bushwick: tract by tract', `<p>Census ACS 5-year estimates for Bushwick's ${T.geo.features.length} census tracts in three <b>non-overlapping</b> windows. All three maps share one color scale. Pick a measure:</p>
        <div class="case-btns" id="case-map-btns">${[['ba_pct', "Bachelor's degree"], ['white_pct', 'Non-Hispanic white'], ['hisp_pct', 'Hispanic'], ['rent', 'Gross rent'], ['income', 'Household income'], ['age2034_pct', 'Age 20–34']].map(([k, l], i) => `<button type="button" data-k="${k}" class="${i ? '' : 'on'}">${l}</button>`).join('')}</div>
        <div class="case-maps" id="case-maps"></div><div id="case-map-legend"></div>`, 'Where inside the neighborhood')}

      ${row(
        panel('New housing permitted and completed', `<p>NYC Housing Database, Community District 4, net new units from new buildings. The 2015 spike is the citywide rush to file before the 421-a tax break lapsed (${fmt(d.housing.NYC.permitted_units['2015'])} units permitted citywide that year vs. ${fmt(d.housing.NYC.permitted_units['2014'])} in 2014).</p>${chartDiv('case-housing')}`, 'Market signals'),
        panel('Home sale prices', `<p>DOF sales, median price of 1–3 family buildings (Bushwick's typical building), market sales only (over $10K). 2007–2015 from DOF's yearly spreadsheets, 2016+ from the open-data API.</p>${chartDiv('case-sales')}`, 'Market signals')
      )}

      ${panel('Crime complaints, indexed', `<p>NYPD complaints by precinct (83rd = Bushwick, 90th = Williamsburg, 75th = East New York), each line indexed to its own 2006 level = 100, so the lines show change rather than size. Drug complaints mostly track enforcement policy (marijuana enforcement fell sharply in the late 2010s), not drug use. The 83rd's jump since 2021 is worth checking before reading anything into it.</p>
        <div class="case-grid">${CRIME_SHOWN.map((g) => `<div><h3>${g === 'total' ? 'All complaints' : g.toLowerCase()}</h3>${chartDiv('case-cr-' + g.replace(/\W/g, ''))}</div>`).join('')}</div>`, 'Other signals')}

      ${panel('Thinking ahead: this will be a time series', `
        <p>Every source, the years it covers for Bushwick, and the breaks to handle before any model:</p>${chartDiv('case-cov')}
        <div class="case-notes">
          <div><b>Mixed frequencies</b><span>StreetEasy is monthly. ACS, sales, permits and crime are annual. Pick one clock (annual is safest) or model the frequencies separately.</span></div>
          <div><b>Structural breaks</b><span>No 2020 ACS 1-year, PUMA redraw in 2022, the 421-a spike in 2015, COVID in 2020. Treat these as known shocks, not signal.</span></div>
          <div><b>Overlapping windows</b><span>5-year ACS values share 4 of 5 years with their neighbors. Use 1-year PUMA data for annual series and non-overlapping 5-year windows for tracts.</span></div>
          <div><b>Relative, not absolute</b><span>Everything rose citywide. Gentrification is about rising <em>faster than the city</em>, so the natural series is Bushwick ÷ NYC (or minus NYC).</span></div>
          <div><b>A comparison group</b><span>East New York-style “low-income but didn't gentrify” areas are the counterfactual. Two groups over time is the setup for difference-in-differences.</span></div>
          <div><b>Leading vs. lagging</b><span>Asking rents, sales and permits move first. ACS income and education move later and are smoothed. The interesting question is which series <em>leads</em> and by how much.</span></div>
          <div><b>Short series</b><span>~20 annual points per area. That's enough to describe, not enough to fit a complicated model to one neighborhood. Pooling many neighborhoods is what makes it work.</span></div>
          <div><b>Nominal dollars</b><span>All $ values are in their own year's dollars. Deflate (CPI) or use ratios to the city before comparing across years.</span></div>
        </div>`, 'Time-series notes')}

      ${panel('Sources', `<ul class="case-facts">
        <li>NYU Furman Center, <a href="https://furmancenter.org/research/sonychan/2015-report" target="_blank" rel="noopener">State of NYC's Housing &amp; Neighborhoods 2015</a> (gentrification focus) and its <a href="https://www.furmancenter.org/data-tool/state-of-the-city/" target="_blank" rel="noopener">data tool</a></li>
        <li>NYC Comptroller, <a href="https://comptroller.nyc.gov/reports/nyc-neighborhood-economic-profiles/" target="_blank" rel="noopener">Neighborhood Economic Profiles</a> and <a href="https://comptroller.nyc.gov/reports/new-york-a-city-of-diverse-evolving-neighborhoods/" target="_blank" rel="noopener">A City of Diverse, Evolving Neighborhoods</a></li>
        <li>Urban Displacement Project, <a href="https://www.urbandisplacement.org/maps/new-york-gentrification-and-displacement/" target="_blank" rel="noopener">New York gentrification &amp; displacement map</a></li>
        <li>Data: Census ACS (1-year PUMA, 5-year tract), StreetEasy, NYC Housing Database, DOF rolling sales, NYPD complaints. Built ${day(d.built_at)}.</li></ul>`, 'Sources')}
    `;

    // timeline strip
    (() => {
      const el = document.getElementById('case-timeline');
      const W = 1000, H = 112, m = { l: 20, r: 20 };
      const x = d3.scaleLinear().domain([2004, 2026]).range([m.l, W - m.r]);
      const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`);
      svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', 60).attr('y2', 60).attr('stroke', C.ink).attr('stroke-width', 1.5);
      svg.append('g').attr('class', 'axis').attr('transform', 'translate(0,60)').call(d3.axisBottom(x).ticks(11).tickFormat(d3.format('d')).tickSize(4));
      svg.append('rect').attr('x', x(2008)).attr('width', x(2019) - x(2008)).attr('y', 52).attr('height', 8).attr('fill', C.orange).attr('opacity', 0.25);
      svg.append('text').attr('x', x(2013.5)).attr('y', 48).attr('text-anchor', 'middle').attr('font-size', 11).style('fill', C.orange).text('main shift in the data');
      CASE_EVENTS.forEach(([yr, label], i) => {
        const g = svg.append('g').attr('transform', `translate(${x(yr)},${i % 2 ? 92 : 28})`);
        svg.append('line').attr('x1', x(yr)).attr('x2', x(yr)).attr('y1', i % 2 ? 64 : 38).attr('y2', i % 2 ? 82 : 56).attr('stroke', C.gray);
        svg.append('circle').attr('cx', x(yr)).attr('cy', 60).attr('r', 4).attr('fill', C.ink);
        g.append('circle').attr('r', 11).attr('fill', C.ink);
        g.append('text').attr('text-anchor', 'middle').attr('dy', '0.35em').attr('font-size', 11).attr('font-weight', 700).style('fill', '#fff').text(i + 1);
        g.append('title').text(`${yr}: ${label}`);
      });
      el.insertAdjacentHTML('beforeend', `<ol class="case-events">${CASE_EVENTS.map(([yr, label]) => `<li><b>${yr}</b> ${esc(label)}</li>`).join('')}</ol>`);
    })();

    // quadrant
    (() => {
      const el = document.getElementById('case-quad');
      const W = 560, H = 300, m = { t: 10, r: 14, b: 36, l: 50 };
      const x = d3.scaleLinear().domain(d3.extent(pts, (p) => p.inc)).nice().range([m.l, W - m.r]);
      const y = d3.scaleLinear().domain(d3.extent(pts, (p) => p.rg)).nice().range([H - m.b, m.t]);
      const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`);
      svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', x(incCut) - m.l).attr('height', y(rgMed) - m.t).attr('fill', C.orange).attr('opacity', 0.07);
      svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(6).tickFormat((v) => '$' + d3.format('~s')(v)));
      svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat((v) => v + '%'));
      svg.append('text').attr('x', (m.l + W - m.r) / 2).attr('y', H - 4).attr('text-anchor', 'middle').text('2012 median household income');
      svg.append('text').attr('transform', `translate(12,${(m.t + H - m.b) / 2}) rotate(-90)`).attr('text-anchor', 'middle').text('rent growth 2012→19');
      svg.append('line').attr('x1', x(incCut)).attr('x2', x(incCut)).attr('y1', m.t).attr('y2', H - m.b).attr('stroke', C.gray).attr('stroke-dasharray', '4 3');
      svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(rgMed)).attr('y2', y(rgMed)).attr('stroke', C.gray).attr('stroke-dasharray', '4 3');
      svg.append('text').attr('x', m.l + 6).attr('y', m.t + 12).attr('font-size', 10).style('fill', C.orange).text('gentrifying by these rules');
      const special = { [d.areas.Bushwick.puma_old]: 'Bushwick', [d.areas.Williamsburg.puma_old]: 'Williamsburg', [d.areas['East New York'].puma_old]: 'East New York' };
      svg.append('g').selectAll('circle').data([...pts].sort((a, b) => (special[a.code] ? 1 : 0) - (special[b.code] ? 1 : 0))).join('circle')
        .attr('cx', (p) => x(p.inc)).attr('cy', (p) => y(p.rg)).attr('r', (p) => (special[p.code] ? 7 : 4.5))
        .attr('fill', (p) => CASE_C[special[p.code]] || '#c9cbd1').attr('stroke', '#fff').attr('stroke-width', 1.5)
        .on('mousemove', (ev, p) => tip(`<b>${esc(p.name)}</b><br>${esc(p.cd)}<br>2012 income ${usd(p.inc)}<br>rent growth ${fmt1(p.rg)}%<br>bachelor's +${fmt1(p.bag)} pts`, ev))
        .on('mouseleave', () => tip(null));
      pts.filter((p) => special[p.code]).forEach((p) => svg.append('text').attr('x', x(p.inc) + 10).attr('y', y(p.rg) + 4).attr('font-weight', 700).style('fill', 'var(--nyc-text)').text(special[p.code]));
    })();

    // small multiples
    const four = ['NYC', 'East New York', 'Williamsburg', 'Bushwick'];
    CASE_IND.forEach((ind) => lines('#case-ts-' + ind.k, caseSeries(four, annual(ind.k)),
      { width: 420, height: 230, marks: BREAKS.map(([x]) => [x, '']), yMin: ind.money ? 0 : undefined, yFmt: ind.money ? (v) => '$' + d3.format('~s')(v) : (v) => v + '%', valFmt: ind.f }));
    document.querySelectorAll('.case-grid .nyc-legend').forEach((l) => l.remove());

    // pre-factor dot plot
    (() => {
      const el = document.getElementById('case-pre');
      const rowsP = preRows.map((k) => ({ k, label: CASE_IND.find((i) => i.k === k).label, v: Object.fromEntries(['Bushwick', 'Williamsburg', 'NYC'].map((n) => [n, at(n, y0, k)])) }));
      const W = 560, rh = 34, lw = 190, H = rowsP.length * rh + 24;
      const x = d3.scaleLinear().domain([0, 100]).range([lw, W - 14]);
      const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`);
      svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - 22})`).call(d3.axisBottom(x).ticks(5).tickFormat((v) => v + '%'));
      rowsP.forEach((r, i) => {
        const yy = i * rh + 14;
        svg.append('text').attr('x', lw - 10).attr('y', yy + 4).attr('text-anchor', 'end').style('fill', 'var(--nyc-text)').text(r.label);
        const vals = Object.values(r.v).filter((v) => v != null);
        svg.append('line').attr('x1', x(d3.min(vals))).attr('x2', x(d3.max(vals))).attr('y1', yy).attr('y2', yy).attr('stroke', C.gray).attr('stroke-width', 1.5);
        ['NYC', 'Williamsburg', 'Bushwick'].forEach((n) => r.v[n] != null && svg.append('circle').attr('cx', x(r.v[n])).attr('cy', yy).attr('r', n === 'Bushwick' ? 7 : 5)
          .attr('fill', CASE_C[n]).attr('stroke', '#fff').attr('stroke-width', 1.5)
          .on('mousemove', (ev) => tip(`<b>${n}</b>, ${y0}<br>${esc(r.label)}: ${pctTxt(r.v[n])}`, ev)).on('mouseleave', () => tip(null)));
      });
      el.insertAdjacentHTML('beforeend', `<div class="nyc-legend">${['Bushwick', 'Williamsburg', 'NYC'].map((n) => `<span><i style="background:${CASE_C[n]}"></i>${n}</span>`).join('')}</div>`);
    })();

    // StreetEasy level + ratio
    const seS = (n) => se.months.map((m, i) => [m, se.series[n] ? se.series[n][i] : null]);
    lines('#case-se', caseSeries(['Brooklyn', 'Williamsburg', 'Bushwick'].filter((n) => se.series[n]), seS),
      { time: true, height: 210, yFmt: (v) => '$' + d3.format(',')(v), valFmt: usd });
    lines('#case-se-ratio', [{ name: 'Bushwick ÷ Williamsburg', color: C.orange, width: 2.5,
      values: se.months.map((m, i) => { const a = se.series.Bushwick?.[i], b = se.series.Williamsburg?.[i]; return [m, a && b ? Math.round(1000 * a / b) / 10 : null]; }) }],
    { time: true, height: 150, yMin: 50, yFmt: (v) => v + '%', valFmt: (v) => v + '% of Williamsburg' });

    // tract maps
    const drawMaps = (k) => {
      const box = document.getElementById('case-maps'); box.innerHTML = '';
      const all = Object.values(T.values).flatMap((v) => Object.values(v).map((r) => r[k])).filter((v) => v != null);
      const col = d3.scaleSequential(d3.interpolateOranges).domain([d3.min(all), d3.max(all)]);
      const f = CASE_IND.find((i) => i.k === k).f;
      const MWc = 300, MHc = 300;
      const proj = d3.geoMercator().fitExtent([[6, 6], [MWc - 6, MHc - 6]], T.geo);
      const path = d3.geoPath(proj);
      Object.entries(T.windows).forEach(([yr, label]) => {
        const cell = document.createElement('div'); cell.className = 'case-map';
        cell.innerHTML = `<div class="case-map-title">${label}</div>`;
        box.appendChild(cell);
        const svg = d3.select(cell).append('svg').attr('viewBox', `0 0 ${MWc} ${MHc}`);
        svg.selectAll('path').data(T.geo.features).join('path').attr('d', path)
          .attr('fill', (ft) => { const v = T.values[yr][ft.properties.tract]?.[k]; return v == null ? '#e4e4de' : col(v); })
          .attr('stroke', '#fff').attr('stroke-width', 0.8)
          .on('mousemove', (ev, ft) => tip(`<b>Tract ${esc(ft.properties.tract)}</b> · ${esc(ft.properties.ntaname)}<br>${label}: ${f(T.values[yr][ft.properties.tract]?.[k])}`, ev))
          .on('mouseleave', () => tip(null));
      });
      document.getElementById('case-map-legend').innerHTML = rampLegend(d3.interpolateOranges, f(d3.min(all)), f(d3.max(all)), CASE_IND.find((i) => i.k === k).label) +
        '<p class="case-note">Gray = no estimate. Tract IDs and shapes are the 2020 ones. All 29 IDs also exist on the 2010 map, which these windows (2006–10, 2011–15) use.</p>';
    };
    document.getElementById('case-map-btns').addEventListener('click', (ev) => {
      const b = ev.target.closest('button'); if (!b) return;
      document.querySelectorAll('#case-map-btns button').forEach((x) => x.classList.toggle('on', x === b));
      drawMaps(b.dataset.k);
    });
    drawMaps('ba_pct');

    // housing + sales
    const hy = d3.range(2005, 2026);
    columns('#case-housing', [
      { name: 'permitted', color: C.orange, values: hy.map((y) => [y, d.housing.Bushwick.permitted_units[y] || 0]) },
      { name: 'completed', color: C.gray, values: hy.map((y) => [y, d.housing.Bushwick.completed_units[y] || 0]) }],
    { height: 220, unit: 'units', maxTicks: 11 });
    const sy = Object.keys(d.sales.Bushwick).map(Number).sort();
    lines('#case-sales', caseSeries(['Brooklyn', 'Bushwick'], (n) => sy.map((y) => [y, d.sales[n][y]?.median ?? null])),
      { height: 220, yFmt: (v) => '$' + d3.format('~s')(v), valFmt: usd, marks: [[2015.5, 'file → API']] });

    // crime indexed
    CRIME_SHOWN.forEach((g) => {
      const idx = (n) => { const s = d.crime.series[n][g]; const base = s['2006']; return d3.range(2006, 2026).map((y) => [y, base && s[y] != null ? Math.round(1000 * s[y] / base) / 10 : null]); };
      lines('#case-cr-' + g.replace(/\W/g, ''), caseSeries(four, idx), { width: 420, height: 220, hline: 100, valFmt: (v) => v + ' (2006 = 100)' });
    });
    document.querySelectorAll('.case-grid .nyc-legend').forEach((l) => l.remove());

    // coverage gantt
    (() => {
      const el = document.getElementById('case-cov');
      const rowsC = [
        ['ACS 1-year (PUMA)', 2005, y1, 'annual', [[2020, 'gap'], [2022, 'redraw']]],
        ['ACS 5-year (tracts)', 2006, y1, '5-yr windows', [[2010, 'tract map'], [2020, 'tract map']]],
        ['StreetEasy asking rent', +se.months[0].slice(0, 4), +se.months[se.months.length - 1].slice(0, 4), 'monthly', []],
        ['Housing permits / completions', 2005, 2025, 'annual', [[2015, '421-a']]],
        ['DOF sales', 2007, 2025, 'annual', [[2016, 'file→API']]],
        ['NYPD complaints', 2006, 2025, 'annual', []],
        ['Restaurant inspections', 2022, 2026, 'rolling ~3 yr', []],
      ];
      const W = 1000, rh = 28, lw = 220, H = rowsC.length * rh + 30;
      const x = d3.scaleLinear().domain([2004, 2027]).range([lw, W - 10]);
      const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`);
      svg.append('rect').attr('x', x(2008)).attr('width', x(2019) - x(2008)).attr('y', 0).attr('height', H - 26).attr('fill', C.orange).attr('opacity', 0.08);
      svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - 24})`).call(d3.axisBottom(x).ticks(12).tickFormat(d3.format('d')));
      rowsC.forEach(([label, a, b, freq, br], i) => {
        const yy = i * rh + 6;
        svg.append('text').attr('x', lw - 10).attr('y', yy + 12).attr('text-anchor', 'end').style('fill', 'var(--nyc-text)').text(label);
        svg.append('rect').attr('x', x(a)).attr('width', Math.max(4, x(b + 1) - x(a))).attr('y', yy + 2).attr('height', 16).attr('rx', 3).attr('fill', a > 2019 ? C.gray : C.ink).attr('opacity', 0.8);
        svg.append('text').attr('x', x(b + 1) + 6).attr('y', yy + 14).attr('font-size', 10).text(freq);
        br.forEach(([yr, l]) => {
          svg.append('line').attr('x1', x(yr)).attr('x2', x(yr)).attr('y1', yy - 1).attr('y2', yy + 21).attr('stroke', C.red).attr('stroke-width', 2.5);
          svg.append('title').text(l);
        });
      });
      el.insertAdjacentHTML('beforeend', `<div class="nyc-legend"><span><i style="background:${C.ink}"></i>years covered</span><span><i style="background:${C.red}"></i>break / shock</span><span><i style="background:${C.orange};opacity:.3"></i>Bushwick's main shift</span></div>`);
    })();
  }

  async function showCase() {
    current = null;
    document.getElementById('nyc-crumb').innerHTML = `/ Case Study: Bushwick · <a href="#" onclick="openNycExplorer('overview');return false;">open the full NYC Data Explorer →</a>`;
    const main = document.getElementById('nyc-main');
    main.innerHTML = '<div class="nyc-loading">Loading the Bushwick case study…</div>';
    document.getElementById('nyc-explorer').scrollTo(0, 0);
    try {
      await renderCase(main);
    } catch (e) {
      console.error('[nyc-case]', e);
      main.innerHTML = `<div class="nyc-error">Couldn't load the case study: ${esc(e.message)}</div>`;
    }
    tip(null);
  }
  window.openNycCaseStudy = () => window.openNycExplorer('__case');

  // ── open / close (same overlay mechanics as the site's other rooms) ─
  window.openNycExplorer = function (tab) {
    document.getElementById('project-detail').classList.remove('open');
    if (typeof closeAllToolOverlays === 'function') closeAllToolOverlays();
    document.getElementById('nyc-explorer').classList.add('open');
    document.getElementById('main-site').classList.add('hidden');
    window.scrollTo(0, 0);
    const caseMode = tab === '__case';
    document.getElementById('nyc-explorer').classList.toggle('case-mode', caseMode);
    buildTabBar();
    if (window.lucide) lucide.createIcons();
    if (caseMode) showCase(); else showTab(tab || current || 'overview');
  };
  window.closeNycExplorer = function () {
    document.getElementById('nyc-explorer').classList.remove('open');
    document.getElementById('main-site').classList.remove('hidden');
    tip(null);
  };
  window.nycShowTab = showTab;
})();
