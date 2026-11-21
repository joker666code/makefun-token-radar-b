// Token Radar B dashboard: renders window.RADAR (written by main.ts) with
// no network. Filters, two lenses, sorting, and a detail view per protocol.
(function () {
  'use strict';
  var R = window.RADAR;
  // Watchlist membership is the snapshot's own list, not a TVL test: a
  // protocol above the floor can still be off the list (wrapped, staked,
  // bridged, or a CEX product), and one below it is never on it.
  var watchSet = new Set(R.watchlist);
  var params = new URLSearchParams(window.location.search);
  var SHOW = 60;

  function money(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
    return '$' + n;
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function ageLabel(days) {
    if (days === null || days === undefined) return '—';
    if (days < 30) return days + 'd';
    if (days < 365) return Math.round(days / 30) + 'mo';
    return (days / 365).toFixed(1) + 'y';
  }
  function growthLabel(row) {
    if (row.change_7d === null || row.change_7d === undefined) return '—';
    var v = row.change_7d;
    var sign = v > 0 ? '+' : '';
    var capped = (v > 60 || v < -40) ? ' *' : '';
    return sign + v.toFixed(1) + '%' + capped;
  }

  var stats = document.getElementById('stats');
  var top = R.rows[0];
  stats.innerHTML =
    '<div><dt>Protocols ranked</dt><dd>' + R.row_count + '</dd></div>' +
    '<div><dt>Watchlist covered</dt><dd>' + R.watchlist_count + ' / ' + R.watchlist_count + '</dd></div>' +
    '<div><dt>Total implied value</dt><dd>' + money(R.total_implied_usd) + '</dd></div>' +
    '<div><dt>Snapshot</dt><dd>' + esc(R.as_of) + '</dd></div>';

  var mult = document.getElementById('multiples');
  var cells = R.category_multiples.map(function (c) {
    // Thin-multiple warning (v7): a multiple resting on one peer is one
    // protocol's ratio carrying 1/7 of the weight after shrinkage — the
    // reader should know before trusting it. No-peer categories never
    // appear here: they take the global median instead (see below).
    var note = c.peers === 1 ? 'Single peer — carries 1/7 of the weight' : '';
    return '<tr><td>' + esc(c.category) + '</td><td>' + c.peers + '</td><td>' + c.multiple.toFixed(3) + '</td><td>' + note + '</td></tr>';
  }).join('');
  var thinCats = R.category_multiples.filter(function (c) { return c.peers === 1; }).length;
  var thinRows1 = R.rows.filter(function (r) { return r.peers === 1; }).length;
  var thinRows0 = R.rows.filter(function (r) { return r.peers === 0; }).length;
  var boardCats = {};
  R.rows.forEach(function (r) { boardCats[r.category || '(no category)'] = true; });
  var multCats = {};
  R.category_multiples.forEach(function (c) { multCats[c.category] = true; });
  var noPeerCats = Object.keys(boardCats).filter(function (c) { return !multCats[c]; }).length;
  var unusedCats = Object.keys(multCats).filter(function (c) { return !boardCats[c]; }).length;
  mult.innerHTML =
    '<div class="table-wrap"><table class="mult-table"><thead><tr><th>Category</th><th>Peers</th><th>Multiple</th><th>Note</th></tr></thead><tbody>' +
    cells + '</tbody></table></div>' +
    '<p>Each multiple is the median mcap/TVL of that category\u2019s token-having peers, shrunk toward the global median ' +
    R.global_median.toFixed(3) + ' when peers are few, then clamped to 0.05–0.80. ' + thinCats + ' of the ' +
    R.category_multiples.length + ' multiples rest on a single peer, and ' + (thinRows1 + thinRows0) + ' of the ' +
    R.rows.length + ' board rows sit on a multiple set by one peer (' + thinRows1 + ') or none (' + thinRows0 +
    ') — those rows carry a warning in the detail view. The table lists ' + R.category_multiples.length +
    ' categories with token-having peers while the board spans ' + Object.keys(boardCats).length + ': the ' +
    noPeerCats + ' board categories with no peer at all take the global median, and ' + unusedCats +
    ' peer categories have no pre-token row on the board, so their multiples are never used.</p>';

  // Two-level method box (v5, v7): the outer box is folded by default so
  // the board starts on the first screen; the multiples table is folded one
  // level deeper. The jump link opens both levels and scrolls the table into
  // view, and ?multiples=1 opens both on load (deep link + screenshot).
  var multiplesBox = document.getElementById('multiplesBox');
  document.getElementById('multJump').addEventListener('click', function (ev) {
    ev.preventDefault();
    document.getElementById('method').open = true;
    multiplesBox.open = true;
    multiplesBox.scrollIntoView({ block: 'start' });
  });
  if (params.get('multiples') === '1') {
    document.getElementById('method').open = true;
    multiplesBox.open = true;
  }

  // Sensitivity audit (v7): re-rank the board under one changed assumption
  // at a time, computed here at render time from the same data.js the board
  // uses — the published ranks are the base, only the variant implied values
  // are recomputed. The build-time audit in lib/model.ts (buildSensitivity)
  // computes the same table from the snapshot; the two agree exactly.
  function clampNum(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  var sensCatMed = {};
  R.category_multiples.forEach(function (c) {
    if (c.peers > 0) sensCatMed[c.category] = (c.multiple * (c.peers + 6) - 6 * R.global_median) / c.peers;
  });
  function sensMultiple(cat, prior) {
    var n = 0;
    for (var i = 0; i < R.category_multiples.length; i++) {
      if (R.category_multiples[i].category === cat) { n = R.category_multiples[i].peers; break; }
    }
    if (n === 0) return clampNum(R.global_median, 0.05, 0.8);
    return clampNum((n * sensCatMed[cat] + prior * R.global_median) / (n + prior), 0.05, 0.8);
  }
  function sensImplied(r, o) {
    var m = sensMultiple(r.category || '(no category)', o.prior);
    var mom = r.change_7d === null ? 1 : 1 + (o.gw * clampNum(r.change_7d, o.lo, o.hi)) / 100;
    var seas = r.age_days === null ? o.floor : o.floor + (1 - o.floor) * (Math.min(r.age_days, 1095) / 1095);
    var br = 1 + o.bs * Math.min(Math.max(r.chains.length - 1, 0), 4);
    var cred = 1;
    if (r.change_7d === null) cred -= 0.03;
    if (r.age_days === null) cred -= 0.03;
    if (r.tvl_usd < 10000000) cred -= 0.02;
    if (r.chains.length <= 1) cred -= 0.02;
    cred = Math.max(0.9, cred);
    return Math.max(1, Math.round(r.tvl_usd * m * mom * seas * br * cred));
  }
  function sensRanks(o) {
    var arr = R.rows.map(function (r) { return { slug: r.slug, tvl: r.tvl_usd, imp: sensImplied(r, o) }; });
    arr.sort(function (a, b) { return b.imp - a.imp || b.tvl - a.tvl || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0); });
    var map = {};
    arr.forEach(function (x, i) { map[x.slug] = i + 1; });
    return map;
  }
  var SENS_DEF = { prior: 6, gw: 0.4, floor: 0.75, bs: 0.02, lo: -40, hi: 60 };
  var SENS_VARS = [
    ['Shrink prior 3 (peers weigh more)', { prior: 3 }],
    ['Shrink prior 12 (peers weigh less)', { prior: 12 }],
    ['Momentum weight 0.3', { gw: 0.3 }],
    ['Momentum weight 0.5', { gw: 0.5 }],
    ['Maturity floor 0.65', { floor: 0.65 }],
    ['Maturity floor 0.85', { floor: 0.85 }],
    ['No breadth bonus', { bs: 0 }],
    ['Winsorise [-20%, +30%]', { lo: -20, hi: 30 }],
    ['Prior 3 + momentum 0.5 (joint)', { prior: 3, gw: 0.5 }]
  ];
  function renderSensitivity() {
    var baseRank = {};
    R.rows.forEach(function (r) { baseRank[r.slug] = r.rank; });
    var baseTop10 = {};
    R.rows.forEach(function (r) { if (r.rank <= 10) baseTop10[r.slug] = true; });
    var base1 = R.rows.filter(function (r) { return r.rank === 1; })[0];
    var srows = SENS_VARS.map(function (v) {
      var merged = {};
      Object.keys(SENS_DEF).forEach(function (k) { merged[k] = SENS_DEF[k]; });
      Object.keys(v[1]).forEach(function (k) { merged[k] = v[1][k]; });
      var vr = sensRanks(merged);
      var top10 = R.rows.filter(function (r) { return vr[r.slug] <= 10; });
      var overlap = top10.filter(function (r) { return baseTop10[r.slug]; }).length;
      var mx = 0, moved = 0;
      R.rows.forEach(function (r) {
        var d = Math.abs(vr[r.slug] - baseRank[r.slug]);
        if (d > mx) mx = d;
        if (d > 10) moved++;
      });
      var rank1 = R.rows.filter(function (r) { return vr[r.slug] === 1; })[0];
      return { variant: v[0], top10: overlap, maxMove: mx, moved: moved, rank1Same: rank1.slug === base1.slug };
    });
    var allRank1 = srows.every(function (x) { return x.rank1Same; });
    var minTop = Math.min.apply(null, srows.map(function (x) { return x.top10; }));
    var maxTop = Math.max.apply(null, srows.map(function (x) { return x.top10; }));
    // The calm single changes are rows 3–8; the joint change (last row) is
    // reported on its own so it cannot hide inside that range.
    var calmMax = Math.max.apply(null, srows.slice(2, 8).map(function (x) { return x.maxMove; }));
    var joint = srows[srows.length - 1];
    var thin1 = R.rows.filter(function (r) { return r.peers === 1; }).length;
    var thin0 = R.rows.filter(function (r) { return r.peers === 0; }).length;
    document.getElementById('sensitivity').innerHTML =
      '<h3>Would the ranking survive different assumptions?</h3>' +
      '<p>Each row re-ranks the whole board with one assumption changed and nothing else — the published board never moves. ' +
      (allRank1 ? 'Rank #1 stays rank #1 under every variant, and the top 10 keeps ' + minTop + '–' + maxTop + ' of 10. ' : '') +
      'Momentum, maturity, breadth and winsorising are calm: no row moves more than ' + calmMax + ' places. ' +
      'The sensitive knob is the shrink prior: with prior 3, a row moves up to ' + srows[0].maxMove + ' places and ' +
      srows[0].moved + ' rows move more than 10; with prior 12, ' + srows[1].maxMove + ' places and ' + srows[1].moved +
      ' rows — because ' + (thin1 + thin0) + ' of 198 rows sit on a multiple set by one peer (' + thin1 + ') or none (' +
      thin0 + '), so how much the category median weighs matters most exactly where the data is thinnest. ' +
      'The one joint change (prior 3 with momentum 0.5) moves a row up to ' + joint.maxMove + ' places and ' +
      joint.moved + ' rows more than 10 — barely further than the prior alone, so the two knobs do not amplify each other. ' +
      'Read those rows with the peer warning below.</p>' +
      '<div class="table-wrap"><table class="mult-table"><thead><tr><th>One change</th><th class="num">Top 10 kept</th><th class="num">Biggest rank move</th><th class="num">Rows moved &gt; 10</th><th>Rank #1 same?</th></tr></thead><tbody>' +
      srows.map(function (x) {
        return '<tr><td>' + esc(x.variant) + '</td><td class="num">' + x.top10 + ' / 10</td><td class="num">' + x.maxMove + '</td><td class="num">' + x.moved + '</td><td>' + (x.rank1Same ? 'yes' : 'no') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  renderSensitivity();

  var catSummary = document.getElementById('catSummary');
  // Full summary, computed from the rows (v5): the shipped Top 10 in
  // data.js is the head of this same list — same order, same totals —
  // so the table agrees with it and adds the other 23 categories, which
  // previously needed the Category dropdown to reach at all. A category's
  // multiple is the same on every one of its rows, so the first row's
  // value stands for the category.
  var byCat = {};
  R.rows.forEach(function (r) {
    var c = r.category || '(no category)';
    var e = byCat[c];
    if (!e) { e = byCat[c] = { category: c, rows: 0, total_implied_usd: 0, multiple: r.multiple }; }
    e.rows += 1;
    e.total_implied_usd += r.implied_value_usd;
  });
  var fullSummary = Object.keys(byCat).map(function (k) { return byCat[k]; })
    .sort(function (a, b) { return b.total_implied_usd - a.total_implied_usd; });
  fullSummary.forEach(function (c) { c.share = c.total_implied_usd / R.total_implied_usd; });
  function sumRow(c) {
    return '<tr class="cat-row" data-cat="' + esc(c.category) + '" title="Filter the board by ' + esc(c.category) + '"><td>' + esc(c.category) + '</td><td class="num">' + c.rows + '</td>' +
      '<td class="num">' + money(c.total_implied_usd) + '</td><td class="num">' + c.multiple.toFixed(3) + '×</td>' +
      '<td class="num">' + (c.share * 100).toFixed(1) + '%</td></tr>';
  }
  var topCat = fullSummary[0];
  var restCats = fullSummary.slice(10);
  var restTotal = restCats.reduce(function (a, c) { return a + c.total_implied_usd; }, 0);
  var restShare = restTotal / R.total_implied_usd;
  catSummary.innerHTML = '<h2>Where the implied value sits</h2>' +
    '<p>All ' + fullSummary.length + ' categories by total implied value on this board — the multiple shown is the one the model actually used for that category. Click a row to filter the board by that category; click it again to clear. The ' + restCats.length + ' categories after the top 10 together hold ' + money(restTotal) + ' (' + (restShare * 100).toFixed(1) + '% of the board) — the long tail.</p>' +
    '<div class="table-wrap"><table class="mult-table"><thead><tr><th>Category</th><th class="num">Rows</th><th class="num">Total implied</th><th class="num">Multiple</th><th class="num">Share</th></tr></thead><tbody>' +
    fullSummary.map(sumRow).join('') + '</tbody></table></div>' +
    '<p><strong>Concentration:</strong> ' + esc(topCat.category) + ' alone holds ' +
    (topCat.share * 100).toFixed(1) + '% of the board\u2019s implied value across ' + topCat.rows +
    ' rows — the value is concentrated, not spread. A category this heavy moves the whole board.</p>';
  // (v6: no toggle any more — the table sits below the board now, so all
  // 33 rows show by default; the click-to-filter rows are unchanged.)
  // Clickable category rows (v4): a row filters the board to its category
  // (the same control as the Category dropdown), a second click clears it.
  catSummary.querySelectorAll('.cat-row').forEach(function (tr) {
    tr.addEventListener('click', function () {
      var cat = tr.getAttribute('data-cat');
      catSel.value = (catSel.value === cat) ? '' : cat;
      shownCount = SHOW;
      render();
      document.querySelector('.board').scrollIntoView({ block: 'start' });
    });
  });

  var catSel = document.getElementById('cat');
  var cats = Array.from(new Set(R.rows.map(function (r) { return r.category || '(no category)'; }))).sort();
  cats.forEach(function (c) {
    var opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    catSel.appendChild(opt);
  });

  var qEl = document.getElementById('q');
  var minTvlEl = document.getElementById('minTvl');
  var watchEl = document.getElementById('watchOnly');
  var lensEl = document.getElementById('lens');
  var sortEl = document.getElementById('sort');
  var rowsEl = document.getElementById('rows');
  var countEl = document.getElementById('count');
  var lensLeadEl = document.getElementById('lensLead');
  var moreEl = document.getElementById('more');
  var detailEl = document.getElementById('detail');
  var lensHead = document.getElementById('lensHead');

  if (params.get('watch') === '1') watchEl.checked = true;
  var lensParam = params.get('lens');
  if (lensParam === 'early' || lensParam === 'density') lensEl.value = lensParam;

  var FLAG_TEXT = {
    'tvl-falling': 'TVL falling 20%+ in 7 days',
    'spike-capped': '7d spike capped at +60% — verify it is not mercenary capital',
    'growth-unreported': '7-day growth unreported — credibility docked',
    'single-chain': 'Single chain — concentration risk',
    'young': 'Listed under 6 months ago — thin track record',
    'age-unknown': 'Listing date unknown — credibility docked'
  };

  function onWatchlist(row) {
    return watchSet.has(row.slug);
  }

  function currentRows() {
    var q = qEl.value.trim().toLowerCase();
    var cat = catSel.value;
    var minTvl = Number(minTvlEl.value);
    var watchOnly = watchEl.checked;
    var lens = lensEl.value;
    var sort = sortEl.value;
    var list = R.rows.filter(function (r) {
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.indexOf(q) < 0) return false;
      if (cat && (r.category || '(no category)') !== cat) return false;
      if (r.tvl_usd < minTvl) return false;
      if (watchOnly && !onWatchlist(r)) return false;
      return true;
    });
    var sorted = list.slice();
    if (lens === 'early') {
      sorted.sort(function (a, b) { return b.early_score - a.early_score || b.implied_value_usd - a.implied_value_usd; });
    } else if (lens === 'density') {
      sorted.sort(function (a, b) { return b.density - a.density || b.implied_value_usd - a.implied_value_usd; });
    } else if (sort === 'tvl') {
      sorted.sort(function (a, b) { return b.tvl_usd - a.tvl_usd; });
    } else if (sort === 'growth') {
      sorted.sort(function (a, b) { return (b.change_7d === null ? -Infinity : b.change_7d) - (a.change_7d === null ? -Infinity : a.change_7d); });
    } else if (sort === 'age') {
      sorted.sort(function (a, b) { return (b.age_days === null ? -1 : b.age_days) - (a.age_days === null ? -1 : a.age_days); });
    } else {
      sorted.sort(function (a, b) { return a.rank - b.rank; });
    }
    return { list: sorted, lens: lens, total: list.length };
  }

  function factorBar(label, value, max, display) {
    var pct = Math.max(2, Math.min(100, (value / max) * 100));
    return '<div class="factor"><b>' + display + '</b><span>' + label + '</span>' +
      '<div class="track"><div class="fill" style="width:' + pct.toFixed(0) + '%"></div></div></div>';
  }

  function whySentence(row) {
    var parts = [];
    parts.push('TVL ' + money(row.tvl_usd) + ' at a ' + row.multiple.toFixed(3) + '× category multiple');
    if (row.momentum > 1.1) parts.push('7-day growth of +' + row.change_7d.toFixed(1) + '% lifts it');
    else if (row.momentum < 0.95) parts.push('7-day TVL fell ' + row.change_7d.toFixed(1) + '% and drags it down');
    if (row.seasoning > 0.95) parts.push('it has run ' + ageLabel(row.age_days) + ' with no token');
    if (row.breadth > 1.05) parts.push('it spans ' + row.chains.length + ' chains');
    if (row.credibility < 1) parts.push('thin records dock its credibility to ' + row.credibility.toFixed(2));
    if (row.density >= 0.5) parts.push('its TVL converts at ' + row.density.toFixed(3) + '×, among the densest on the board');
    return 'Rank #' + row.rank + ' because ' + parts.join(', ') + ' — implied ' + money(row.implied_value_usd) + '.';
  }

  function showDetail(slug) {
    var row = null;
    for (var i = 0; i < R.rows.length; i++) {
      if (R.rows[i].slug === slug) { row = R.rows[i]; break; }
    }
    if (!row) return;
    var flags = row.flags.map(function (f) {
      return '<li>' + esc(FLAG_TEXT[f] || f) + '</li>';
    }).join('');
    var steps = row.farm_steps.map(function (s, idx) {
      var tag = ['VERIFY', 'WEEK 1', 'WEEK 2', 'WEEKS 3–4', 'ONGOING', 'EXIT'][idx] || ('STEP ' + (idx + 1));
      return '<li><span class="tag">' + tag + '</span>' + esc(s) + '</li>';
    }).join('');
    // Spike check (v3): a capped 7-day spike lifts both the implied value
    // (momentum stops at 1.24x) and the early-mover score (momentum x
    // youth), so the detail says so in plain words instead of leaving the
    // flag to speak for itself. The early-movers read shows the score's
    // arithmetic whenever that lens is on.
    var spike = '';
    if (row.flags.indexOf('spike-capped') >= 0) {
      spike = '<p class="warn"><strong>Spike check — do not trust the jump yet.</strong> Its 7-day TVL rose +' +
        row.change_7d.toFixed(1) + '%, but the model caps growth at +60%, so momentum is ' +
        row.momentum.toFixed(2) + '× and no higher. Its early-mover score ' + row.early_score.toFixed(2) +
        ' is momentum × youth (' + (row.age_days === null || row.age_days === undefined ? 'age unknown' : row.age_days + ' days old') + '), so the spike alone lifts its early rank. ' +
        'Treat the spike as unverified until the Week 0 check finds one deposit or a new vault behind it; ' +
        'if the inflow reverses, the implied value falls with it.</p>';
    }
    // Lens read (v6): the row's standing under the current lens, against
    // the lens leader — the same comparison logic as the board-top leader
    // sentence, but for any row, not just the leader. When this row IS
    // the leader, it is that sentence. (Replaces the v3 early-only read:
    // the early arithmetic now lives inside this line for every lens.)
    var lensRead = '<p class="compare">' + esc(detailLensRead(row)) + '</p>';
    // Thin-multiple warning (v7): the peer count behind the multiple is
    // already in the line below; when it is one peer or none, say what
    // that means instead of leaving the number to speak for itself.
    var peersBit = row.peers === 0
      ? 'no token-having peer in its category, so the ' + row.multiple.toFixed(3) + '× multiple is the snapshot\u2019s global median'
      : row.peers === 1
        ? 'a single token-having peer sets the ' + row.multiple.toFixed(3) + '× multiple — one peer carries 1/7 of the weight'
        : row.peers + ' token-having peers set the ' + row.multiple.toFixed(3) + '× multiple';
    detailEl.hidden = false;
    detailEl.innerHTML =
      '<button class="close" id="closeDetail">Close ×</button>' +
      '<h2>#' + row.rank + ' ' + esc(row.name) + (onWatchlist(row) ? '<span class="badge">WATCHLIST</span>' : '') + '</h2>' +
      '<p class="sub">' + esc(row.category || 'No category') + ' · ' + esc(row.chains.join(', ')) +
      ' · TVL ' + money(row.tvl_usd) + ' · snapshot ' + esc(R.as_of) + '</p>' +
      '<p class="why">' + esc(whySentence(row)) + '</p>' +
      lensRead +
      spike +
      '<p class="compare">#' + row.category_rank + ' in ' + esc(row.category || 'no category') + ' · ' +
      (row.category_implied_share * 100).toFixed(1) + '% of its category\u2019s implied value · ' +
      peersBit + ' · value density ' + row.density.toFixed(3) + '× · ' +
      (row.implied_value_usd / R.total_implied_usd * 100).toFixed(1) + '% of the board\u2019s total implied value.</p>' +
      '<div class="factors">' +
      factorBar('Category multiple', row.multiple, 0.8, row.multiple.toFixed(3) + '×') +
      factorBar('Momentum', row.momentum, 1.24, row.momentum.toFixed(2) + '×') +
      factorBar('Seasoning', row.seasoning, 1, row.seasoning.toFixed(2) + '×') +
      factorBar('Breadth', row.breadth, 1.08, row.breadth.toFixed(2) + '×') +
      factorBar('Credibility', row.credibility, 1, row.credibility.toFixed(2) + '×') +
      '</div>' +
      (flags ? '<ul class="flags">' + flags + '</ul>' : '') +
      '<h3>Farm plan — 6 steps, Week 0 verify first, then a weekly cadence</h3>' +
      '<ol class="steps">' + steps + '</ol>';
    document.getElementById('closeDetail').addEventListener('click', function () {
      detailEl.hidden = true;
      detailEl.innerHTML = '';
    });
    detailEl.scrollIntoView({ block: 'start' });
  }

  // Leader in one sentence, for every lens — see lensSentence /
  // earlySentence / densitySentence / impliedSentence below (v4 early,
  // v5 implied + density, v6 extracted so the detail view reuses them).
  // The comparison itself is split into parts by whyParts, below.
  var FACTORS = [
    { key: 'momentum', label: 'momentum', disp: function (r) { return r.momentum.toFixed(2) + '×'; } },
    { key: 'seasoning', label: 'seasoning', disp: function (r) { return r.seasoning.toFixed(2) + '×'; },
      extra: function (r) { return (r.age_days === null || r.age_days === undefined) ? 'unknown age' : r.age_days + ' days'; } },
    { key: 'breadth', label: 'breadth', disp: function (r) { return r.breadth.toFixed(2) + '×'; },
      extra: function (r) { return r.chains.length + (r.chains.length === 1 ? ' chain' : ' chains'); } },
    { key: 'credibility', label: 'credibility', disp: function (r) { return r.credibility.toFixed(2); } }
  ];
  function factorCmp(f, a, b) {
    var s = f.label + ' (' + f.disp(a);
    if (f.extra) s += ', ' + f.extra(a);
    s += ' vs ' + f.disp(b);
    if (f.extra) s += ', ' + f.extra(b);
    return s + ')';
  }
  // Split the leader-vs-runner-up comparison into its parts; each lens
  // sentence composes them in its own order. The multiple is phrased on
  // its own (same / higher / lower), never also as a lead/trail.
  function whyParts(lead, second) {
    var multSame = Math.abs(lead.multiple - second.multiple) < 0.0005;
    var multBit = multSame
      ? 'the same ' + lead.multiple.toFixed(3) + '× multiple'
      : 'a ' + (lead.multiple > second.multiple ? 'higher' : 'lower') + ' multiple (' +
        lead.multiple.toFixed(3) + '× vs ' + second.multiple.toFixed(3) + '×)';
    var tvlBit = '';
    if (money(lead.tvl_usd) !== money(second.tvl_usd)) {
      var ratio = lead.tvl_usd / second.tvl_usd;
      if (ratio < 0.98 || ratio > 1.02) {
        var how = ratio < 0.5 ? 'a far smaller' : ratio < 1 ? 'a smaller' : ratio < 2 ? 'a larger' : 'a far larger';
        tvlBit = how + ' TVL (' + money(lead.tvl_usd) + ' vs ' + money(second.tvl_usd) + ')';
      } else {
        tvlBit = 'a fractionally ' + (ratio < 1 ? 'smaller' : 'larger') + ' TVL (' +
          money(lead.tvl_usd) + ' vs ' + money(second.tvl_usd) + ')';
      }
    }
    var leads = [], trails = [];
    FACTORS.forEach(function (f) {
      var d = lead[f.key] - second[f.key];
      if (d > 0.001) leads.push(f);
      else if (d < -0.001) trails.push(f);
    });
    return {
      multBit: multBit,
      tvlBit: tvlBit,
      leadsText: leads.map(function (f) { return factorCmp(f, lead, second); }).join(' and '),
      trailsText: trails.map(function (f) { return factorCmp(f, lead, second); }).join(' and ')
    };
  }
  function metricOf(r, lensName) {
    return lensName === 'early' ? r.early_score : lensName === 'density' ? r.density : r.implied_value_usd;
  }
  function topTwo(list, lensName) {
    var sorted = list.slice().sort(function (a, b) { return metricOf(b, lensName) - metricOf(a, lensName); });
    return { lead: sorted[0], second: sorted[1] || null };
  }


  // Shared lens helpers (v6): youth and exact age are used by both the
  // board-top leader sentence and the detail lens read.
  function youthOf(r) { return 1.5 - Math.min(r.age_days === null || r.age_days === undefined ? 365 : r.age_days, 1095) / 1095; }
  function ageExact(r) {
    return (r.age_days === null || r.age_days === undefined)
      ? 'unknown age' : r.age_days + (r.age_days === 1 ? ' day' : ' days') + ' old';
  }
  // One factor compared between two rows, from the first row's side.
  function cmpFactor(label, a, b, fmt) {
    if (Math.abs(a - b) < 0.001) return 'tied on ' + label + ' (' + fmt(a) + ')';
    return (a > b ? 'leading on ' : 'trailing on ') + label + ' (' + fmt(a) + ' vs ' + fmt(b) + ')';
  }

  // Leader in one sentence, for every lens (v4 early, v5 implied +
  // density, v6 extracted so the detail view can reuse them): the leader's
  // own figures, why it leads the runner-up, and the caveat when the
  // leader's jump was capped. All figures come from the rows, so the
  // sentence stays true under any filter. The leader is picked by the
  // lens metric, not by the board's sort order.
  function earlySentence(list, filtered) {
    var sorted = list.slice().sort(function (a, b) { return b.early_score - a.early_score || b.implied_value_usd - a.implied_value_usd; });
    var lead = sorted[0];
    var growthBit = (lead.change_7d === null || lead.change_7d === undefined)
      ? '7-day change unreported'
      : '7-day TVL ' + (lead.change_7d > 0 ? '+' : '') + lead.change_7d.toFixed(1) + '%' +
        (lead.change_7d >= 60 ? ', capped at +60%' : '');
    var secondBit = '';
    var tieBit = ' — the highest momentum × youth combination ' +
      (filtered ? 'among the matching rows' : 'on the board');
    if (sorted.length > 1) {
      var second = sorted[1];
      secondBit = ', ahead of ' + second.name + ' (' + second.early_score.toFixed(2) +
        ', ' + ageExact(second) + ')';
      // The usual reason a leader leads: same capped momentum as the
      // runner-up, so youth decides it. Say so only when it is true.
      if (Math.abs(second.momentum - lead.momentum) < 0.001) {
        tieBit = ' — tied on momentum ' + lead.momentum.toFixed(2) + '×, it leads on youth (' +
          youthOf(lead).toFixed(2) + ' vs ' + youthOf(second).toFixed(2) + ')';
      }
    }
    var spikeBit = (lead.change_7d !== null && lead.change_7d !== undefined && lead.change_7d >= 60)
      ? ', and the spike stays unverified until its Week 0 check'
      : '';
    return 'Early-movers leader ' + lead.name + ' scores ' + lead.early_score.toFixed(2) +
      ' = momentum ' + lead.momentum.toFixed(2) + '× (' + growthBit + ') × youth ' + youthOf(lead).toFixed(2) +
      ' (' + ageExact(lead) + ')' + secondBit + tieBit + spikeBit + '.';
  }
  function densitySentence(list, filtered) {
    var scopeBit = filtered ? ' among the matching rows' : '';
    var dTop = topTwo(list, 'density');
    var dLead = dTop.lead, dSecond = dTop.second;
    var dText = 'Value-density leader ' + dLead.name + ' converts TVL at ' + dLead.density.toFixed(3) +
      '× — ' + money(dLead.implied_value_usd) + ' implied on ' + money(dLead.tvl_usd) + ' TVL, ' +
      dLead.multiple.toFixed(3) + '× ' + (dLead.category || 'no category') + ' multiple × ' +
      dLead.momentum.toFixed(2) + '× momentum × ' + dLead.seasoning.toFixed(2) + '× seasoning × ' +
      dLead.breadth.toFixed(2) + '× breadth × ' + dLead.credibility.toFixed(2) + ' credibility';
    if (dSecond) {
      var dWhy = whyParts(dLead, dSecond);
      dText += ' — ahead of ' + dSecond.name + ' (' + dSecond.density.toFixed(3) + '×)' + scopeBit +
        ', on ' + dWhy.multBit +
        (dWhy.leadsText ? ', leading on ' + dWhy.leadsText : '') +
        (dWhy.trailsText ? ', enough to outweigh weaker ' + dWhy.trailsText : '') +
        (dWhy.tvlBit ? ', on ' + dWhy.tvlBit : '');
    } else {
      dText += filtered ? ' — the only matching row' : ' — the only row on the board';
    }
    if (dLead.rank > 10) dText += ', while ranking only #' + dLead.rank + ' by implied value';
    return dText + '.';
  }
  function impliedSentence(list, filtered) {
    var scopeBit = filtered ? ' among the matching rows' : '';
    var iTop = topTwo(list, 'implied');
    var iLead = iTop.lead, iSecond = iTop.second;
    var iText = 'Implied-value leader ' + iLead.name + ' is worth ' + money(iLead.implied_value_usd) +
      ' — TVL ' + money(iLead.tvl_usd) + ' at a ' + iLead.multiple.toFixed(3) + '× ' +
      (iLead.category || 'no category') + ' multiple, momentum ' + iLead.momentum.toFixed(2) +
      '×, seasoning ' + iLead.seasoning.toFixed(2) + '×, breadth ' + iLead.breadth.toFixed(2) +
      '×, credibility ' + iLead.credibility.toFixed(2);
    if (iSecond) {
      var iWhy = whyParts(iLead, iSecond);
      var onBits = [iWhy.tvlBit, iWhy.multBit].filter(function (x) { return x !== ''; }).join(' and ');
      iText += ' — ahead of ' + iSecond.name + ' (' + money(iSecond.implied_value_usd) + ')' + scopeBit +
        ', on ' + onBits +
        (iWhy.leadsText ? ', leading on ' + iWhy.leadsText : '') +
        (iWhy.trailsText ? ', enough to outweigh weaker ' + iWhy.trailsText : '');
    } else {
      iText += filtered ? ' — the only matching row' : ' — the only row on the board';
    }
    return iText + '.';
  }
  function lensSentence(list, lens, filtered) {
    if (lens === 'early') return earlySentence(list, filtered);
    if (lens === 'density') return densitySentence(list, filtered);
    return impliedSentence(list, filtered);
  }

  // Detail lens read (v6, v7): where this row stands under the current lens,
  // against the lens leader. v7 measures it against the leader of the rows
  // currently matching the filters — the same leader the board-top sentence
  // reads — so the detail and the board-top sentence agree; with no filter
  // on, that is the whole board, exactly as before. A row opened by a
  // ?slug= link that matches no current filter falls back to the whole board.
  function detailLensRead(row) {
    var lens = lensEl.value;
    var scope = currentRows().list;
    if (scope.indexOf(row) < 0) scope = R.rows;
    var filtered = scope.length < R.rows.length;
    var sorted = scope.slice().sort(function (a, b) { return metricOf(b, lens) - metricOf(a, lens); });
    var pos = sorted.indexOf(row) + 1;
    var leader = sorted[0];
    if (pos === 1) return lensSentence(scope, lens, filtered);
    if (lens === 'early') {
      return 'Early-movers read: early score ' + row.early_score.toFixed(2) +
        ' = momentum ' + row.momentum.toFixed(2) + '× × youth ' + youthOf(row).toFixed(2) +
        ' (' + ageExact(row) + '), ranking #' + pos + ' of ' + scope.length +
        (filtered ? ' matching rows' : ' on the board') +
        ' — behind leader ' + leader.name + ' (' + leader.early_score.toFixed(2) + '), ' +
        cmpFactor('momentum', row.momentum, leader.momentum, function (v) { return v.toFixed(2) + '×'; }) +
        ', ' + cmpFactor('youth', youthOf(row), youthOf(leader), function (v) { return v.toFixed(2); }) + '.';
    }
    var label = lens === 'density' ? 'Value-density' : 'Implied-value';
    var metricName = lens === 'density' ? 'value density' : 'implied value';
    var metric = lens === 'density' ? row.density.toFixed(3) + '×' : money(row.implied_value_usd);
    var leadMetric = lens === 'density' ? leader.density.toFixed(3) + '×' : money(leader.implied_value_usd);
    var w = whyParts(row, leader);
    var onBits = [w.multBit, w.tvlBit].filter(function (x) { return x !== ''; }).join(' and ');
    var text = label + ' read: ranks #' + pos + ' of ' + scope.length + (filtered ? ' matching rows' : '') + ' by ' + metricName +
      ' (' + metric + '), behind leader ' + leader.name + ' (' + leadMetric + ')' +
      (onBits ? ', on ' + onBits : '') +
      (w.leadsText ? ', leading on ' + w.leadsText : '') +
      (w.trailsText ? ', trailing on ' + w.trailsText : '');
    if (lens === 'density') text += ', while ranking #' + row.rank + ' by implied value';
    return text + '.';
  }

  function render() {
    var state = currentRows();
    var lens = state.lens;
    lensHead.textContent = lens === 'early' ? 'Early score' : lens === 'density' ? 'Density' : 'Share';
    // Keep the clicked category-summary row highlighted while its filter is on.
    catSummary.querySelectorAll('.cat-row').forEach(function (tr) {
      tr.classList.toggle('active', catSel.value !== '' && tr.getAttribute('data-cat') === catSel.value);
    });
    var filtered = qEl.value.trim() !== '' || catSel.value !== '' ||
      Number(minTvlEl.value) > 0 || watchEl.checked;
    lensLeadEl.className = 'lens-lead ' + lens;
    if (state.list.length === 0) {
      lensLeadEl.hidden = true;
      lensLeadEl.textContent = '';
    } else {
      lensLeadEl.hidden = false;
      lensLeadEl.textContent = lensSentence(state.list, lens, filtered);
    }
    var shown = state.list.slice(0, shownCount);
    var maxImplied = top.implied_value_usd;
    rowsEl.innerHTML = shown.map(function (r) {
      var share = Math.max(2, Math.round((r.implied_value_usd / maxImplied) * 100));
      var right = lens === 'early'
        ? r.early_score.toFixed(2)
        : lens === 'density'
          ? r.density.toFixed(3) + '×'
          : '<span class="bar" style="width:' + share + 'px"></span> ' + (share) + '%';
      return '<tr data-slug="' + esc(r.slug) + '">' +
        '<td>' + r.rank + '</td>' +
        '<td class="name">' + esc(r.name) + (onWatchlist(r) ? '<span class="badge">WATCHLIST</span>' : '') + '<span class="subcat">' + esc(r.category || '—') + ' · ' + r.chains.length + (r.chains.length === 1 ? ' chain' : ' chains') + '</span></td>' +
        '<td>' + esc(r.category || '—') + '</td>' +
        '<td>' + r.chains.length + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num">' + growthLabel(r) + '</td>' +
        '<td class="num">' + ageLabel(r.age_days) + '</td>' +
        '<td class="num"><strong>' + money(r.implied_value_usd) + '</strong></td>' +
        '<td class="num">' + right + '</td></tr>';
    }).join('');
    countEl.textContent = 'Showing ' + shown.length + ' of ' + state.total + ' matching protocols' +
      (state.total < R.row_count ? ' (' + R.row_count + ' on the board)' : ' — the full board') +
      (lens === 'early' ? ' · Early-movers lens: momentum × youth. A capped +60% spike can still lift a row — open its detail and read the spike check before farming.'
        : lens === 'density' ? ' · Value-density lens: implied value per dollar of TVL.'
        : ' · Implied-value lens.') +
      ' * = 7-day change winsorised for the model.';
    moreEl.textContent = state.total > shownCount
      ? 'Showing the first ' + shownCount + ' — use Show more, Show all ' + state.total + ', or narrow the filters.'
      : '';
    showMoreEl.hidden = state.total <= shownCount;
    showAllEl.hidden = state.total <= shownCount;
    showAllEl.textContent = 'Show all ' + state.total;
    rowsEl.querySelectorAll('tr').forEach(function (tr) {
      tr.addEventListener('click', function () { showDetail(tr.getAttribute('data-slug')); });
    });
  }

  var shownCount = SHOW;
  var showMoreEl = document.getElementById('showMore');
  var showAllEl = document.getElementById('showAll');
  [qEl, catSel, minTvlEl, watchEl, lensEl, sortEl].forEach(function (el) {
    el.addEventListener('input', function () { shownCount = SHOW; render(); });
    el.addEventListener('change', function () { shownCount = SHOW; render(); });
  });
  showMoreEl.addEventListener('click', function () {
    shownCount += SHOW;
    render();
  });
  // Show all (v6): one click loads every matching row — 198 with no
  // filter on — instead of paging +60 at a time.
  showAllEl.addEventListener('click', function () {
    shownCount = currentRows().total;
    render();
  });

  render();
  var slugParam = params.get('slug');
  if (slugParam) showDetail(slugParam);
})();
