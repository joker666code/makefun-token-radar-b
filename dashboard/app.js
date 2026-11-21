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
    return '<tr><td>' + esc(c.category) + '</td><td>' + c.peers + '</td><td>' + c.multiple.toFixed(3) + '</td></tr>';
  }).join('');
  mult.innerHTML = '<p>Category multiples actually used (median mcap/TVL of token-having peers, ' +
    'shrunk toward the global median ' + R.global_median.toFixed(3) + '):</p>' +
    '<table class="mult-table"><thead><tr><th>Category</th><th>Peers</th><th>Multiple</th></tr></thead><tbody>' +
    cells + '</tbody></table>';

  var catSummary = document.getElementById('catSummary');
  var sumCells = R.category_summary.map(function (c) {
    return '<tr><td>' + esc(c.category) + '</td><td class="num">' + c.rows + '</td>' +
      '<td class="num">' + money(c.total_implied_usd) + '</td><td class="num">' + c.multiple.toFixed(3) + '×</td>' +
      '<td class="num">' + (c.share * 100).toFixed(1) + '%</td></tr>';
  }).join('');
  var topCat = R.category_summary[0];
  catSummary.innerHTML = '<h2>Where the implied value sits</h2>' +
    '<p>Top 10 categories by total implied value on this board — the multiple shown is the one the model actually used for that category.</p>' +
    '<table class="mult-table"><thead><tr><th>Category</th><th class="num">Rows</th><th class="num">Total implied</th><th class="num">Multiple</th><th class="num">Share</th></tr></thead><tbody>' +
    sumCells + '</tbody></table>' +
    '<p><strong>Concentration:</strong> ' + esc(topCat.category) + ' alone holds ' +
    (topCat.share * 100).toFixed(1) + '% of the board\u2019s implied value across ' + topCat.rows +
    ' rows — the value is concentrated, not spread. A category this heavy moves the whole board.</p>';

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
        ' is momentum × youth (' + ageLabel(row.age_days) + ' old), so the spike alone lifts its early rank. ' +
        'Treat the spike as unverified until the Week 0 check finds one deposit or a new vault behind it; ' +
        'if the inflow reverses, the implied value falls with it.</p>';
    }
    var earlyRead = '';
    if (lensEl.value === 'early') {
      var youth = 1.5 - Math.min(row.age_days === null ? 365 : row.age_days, 1095) / 1095;
      earlyRead = '<p class="compare">Early-movers read: early score ' + row.early_score.toFixed(2) +
        ' = momentum ' + row.momentum.toFixed(2) + '× × youth ' + youth.toFixed(2) +
        ' (' + ageLabel(row.age_days) + ' old). Youth, not size, is what this lens rewards.</p>';
    }
    detailEl.hidden = false;
    detailEl.innerHTML =
      '<button class="close" id="closeDetail">Close ×</button>' +
      '<h2>#' + row.rank + ' ' + esc(row.name) + (onWatchlist(row) ? '<span class="badge">WATCHLIST</span>' : '') + '</h2>' +
      '<p class="sub">' + esc(row.category || 'No category') + ' · ' + esc(row.chains.join(', ')) +
      ' · TVL ' + money(row.tvl_usd) + ' · snapshot ' + esc(R.as_of) + '</p>' +
      '<p class="why">' + esc(whySentence(row)) + '</p>' +
      spike +
      '<p class="compare">#' + row.category_rank + ' in ' + esc(row.category || 'no category') + ' · ' +
      (row.category_implied_share * 100).toFixed(1) + '% of its category\u2019s implied value · ' +
      row.peers + ' token-having peer' + (row.peers === 1 ? '' : 's') + ' set the ' + row.multiple.toFixed(3) +
      '× multiple · value density ' + row.density.toFixed(3) + '× · ' +
      (row.implied_value_usd / R.total_implied_usd * 100).toFixed(1) + '% of the board\u2019s total implied value.</p>' +
      earlyRead +
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

  function render() {
    var state = currentRows();
    var lens = state.lens;
    lensHead.textContent = lens === 'early' ? 'Early score' : lens === 'density' ? 'Density' : 'Share';
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
        '<td class="name">' + esc(r.name) + (onWatchlist(r) ? '<span class="badge">WATCHLIST</span>' : '') + '</td>' +
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
      ? 'Showing the first ' + shownCount + ' — use Show more, or narrow the filters.'
      : '';
    showMoreEl.hidden = state.total <= shownCount;
    rowsEl.querySelectorAll('tr').forEach(function (tr) {
      tr.addEventListener('click', function () { showDetail(tr.getAttribute('data-slug')); });
    });
  }

  var shownCount = SHOW;
  var showMoreEl = document.getElementById('showMore');
  [qEl, catSel, minTvlEl, watchEl, lensEl, sortEl].forEach(function (el) {
    el.addEventListener('input', function () { shownCount = SHOW; render(); });
    el.addEventListener('change', function () { shownCount = SHOW; render(); });
  });
  showMoreEl.addEventListener('click', function () {
    shownCount += SHOW;
    render();
  });

  render();
  var slugParam = params.get('slug');
  if (slugParam) showDetail(slugParam);
})();
