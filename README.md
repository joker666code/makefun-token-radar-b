# Token Radar B — lane5

A second route at the same snapshot as lane4's Route A, for the
`token-radar-01` bounty ($1,325, deadline 2026-12-14 10:00 UTC).

## The route

Route A ranks by `TVL × 0.08 × growth × maturity × breadth`. Route B ranks
by a **category-relative multiple with shrinkage**:

```
implied = TVL × categoryMultiple × momentum × seasoning × breadth × credibility
```

- **Category multiple**: median mcap/TVL of the token-having protocols in
  the same category, shrunk toward the snapshot's global median (prior 6
  peers), clamped to 0.05–0.80. Peer ratios are winsorised to 0.02–1.00
  first, and $0-market-cap tokens are excluded as comps, so one outlier
  peer cannot set a whole category's multiple. Computed from the snapshot
  at run time.
- **Momentum**: 1 + 0.4 × 7-day TVL change, winsorised to −40%…+60%.
- **Seasoning**: 0.75 + 0.25 × age / 3 years; unknown age takes the floor.
- **Breadth**: +2% per extra chain, at most +8%.
- **Credibility** (added after a design review): 1.00 minus 0.03 for a
  missing 7-day change, 0.03 for a missing listing date, 0.02 for TVL under
  $10M, 0.02 for a single chain; floor 0.90. Thin records are penalised,
  never rewarded, and nobody is dropped from the board for them.

The board covers all 198 pre-token candidates under the house watchlist
rule (minus its $50M floor), including all 40 watchlist slugs.

## Farm plans

Six steps — a Week 0 verification, then five on a weekly cadence (Week 1 probe, Week 2 scale,
Weeks 3–4 deepen, Ongoing weekly routine, Exit conditions). Week 0 costs $0: it verifies the
snapshot's own claims about the protocol (TVL in the same ballpark, no token listed) plus one
check the protocol's category makes possible — a lending market's borrow rate, a vault
curator's strategy, an RWA vault's custodian attestation — and the sharpest warning the row's
own flags raise (a capped spike first). If any check cannot be confirmed, the Week 1 probe is
halved. Every step states its cost in dollars and its time. No step assumes an airdrop or
points exist.

## Dashboard

Light paper theme. Three lenses: **Implied value**, **Early movers**
(momentum × youth) and **Value density** (implied value per dollar of
TVL). Search, category, minimum TVL, watchlist-only, sort, a top-10
category summary, a Show more control (60 rows at a time), and a detail
view per protocol with factor bars, a why-this-rank sentence, its rank
and share inside its own category, the peer count behind its multiple,
and risk flags.

## v2 (2026-11-21)

Board depth, no model change — the ranking and the $4.99B total are
identical to v1:

- Each row now carries `category_rank`, `category_implied_share`,
  `peers` (token-having peers behind its multiple) and `density`
  (implied / TVL, the five factors folded into one number).
- `data.js` carries `category_summary`: the top 10 categories by total
  implied value, with row counts, the multiple used and the share.
- Third lens, **Value density**, surfaces small protocols whose TVL
  converts efficiently; its board is led by the highest-density rows,
  not by TVL.
- Show more loads the next 60 rows instead of capping the board at 60.
- Fourth screenshot (`4-density.png`) captures the new lens.

## v3 (2026-11-21)

Same model, same ranking, same $4.99B total — the work is verification and
explanation, not re-scoring:

- **Farm plans grow a Week 0 step (6 steps now).** Before any money moves,
  each plan verifies the record: the protocol's own page should show TVL in
  the same ballpark and list no token, plus one check its category makes
  possible (borrow rate for Lending, pool depth for Dexs, custodian
  attestation for RWA, curator and strategy for Risk Curators, and so on
  across all 33 categories on the board), plus the sharpest warning its own
  flags raise — a capped 7-day spike first. An unconfirmed check halves the
  Week 1 probe. This is a pre-flight check of the data, not lane4's
  mid-plan health check, and it sits before the money, at $0.
- **Early-movers lens gets its spike warning in the detail view.** A
  spike-capped row now shows a plain-words box: the raw 7-day jump, the
  +60% cap, momentum stopped at 1.24×, and that the early score is
  momentum × youth, so the spike alone lifts its early rank — with the
  Week 0 check named as the thing that settles it. With the early lens on,
  the detail also shows the early-score arithmetic. The board's count line
  carries the same caution.
- **Two more "same score, more information" lines.** The category summary
  calls out its concentration (Risk Curators alone holds 54.9% of the
  board's implied value), and each detail shows the row's share of the
  board's total implied value.
- **Screenshot 2** now captures the early-movers leader Shift DeFi
  (+4448.5% in 7 days, 45 days old) with the spike warning and the Week 0
  step visible, instead of the #1 detail.

## v4 (2026-11-21)

Same model, same ranking, same $4.99B total — the work is dashboard
interaction and explanation, not re-scoring:

- **Category summary rows are clickable.** Clicking a row filters the
  board to that category (the same control as the Category dropdown, and
  the row stays highlighted while the filter is on); clicking it again
  clears the filter. Risk Curators → 34 rows, Dexs → 21, all verified by
  an automated interaction test.
- **The method box is open by default**, so the formula, the five
  factors and the 34 category multiples are visible on load instead of
  behind a collapsed summary.
- **The early-movers lens reads its leader in one sentence** at the top
  of the board: Shift DeFi scores 1.81 = momentum 1.24× (7-day TVL
  +4448.5%, capped at +60%) × youth 1.46 (45 days old), ahead of August
  Digital (1.78, 73 days old) — tied on capped momentum, it leads on
  youth. The sentence is computed from the rows, so under any filter it
  names that filter's leader instead. The detail view's early read and
  spike box now also give age in exact days, so youth can be checked
  from the words.
- **Mobile verified at 390px wide.** The 720px media query held for the
  header, stats and method box, but the 9-column board table pushed the
  page to 849px wide; the board and summary tables now scroll inside
  their own boxes and the page stays 390px. The mobile shots are
  verification-only and are not shipped (the dossier still holds 4).
- **Screenshot 3 changes:** `3-filtered.png` (watchlist filter) is
  replaced by `3-method.png` (method box open on load). The watchlist
  filter stays in the controls and its 40/40 coverage is proven by
  `board.json` and the header stats; no other shot proved the method box
  opens by default. 1-board now scrolls to the count line first, since
  the open method box pushes the board below the fold.

## v5 (2026-11-21)

Same model, same ranking, same $4.99B total — the work is dashboard
explanation and layout, not re-scoring:

- **The other two lenses read their leader in one sentence**, same shape
  as the early one (v4), every figure computed from the rows: Steakhouse
  Financial leads on implied value ($840.3M) because its seasoning and
  breadth beat Sentora Curator's on a fractionally smaller TVL and the
  same 0.326× multiple; Manta CeDeFi leads on value density (0.422×)
  on momentum and seasoning, despite a single chain and a 0.98
  credibility dock, while ranking only #57 by implied value. The
  sentence follows any filter and never changes when the Sort dropdown
  changes — the leader is picked by the lens metric, not the sort order.
- **The method box is two levels now.** The outer box stays open with
  the formula and the three lenses; the five factors and the 34-row
  multiples table fold into one collapsed level, with a jump link that
  opens it and scrolls it into view (and a `?multiples=1` deep link).
  Folding the table alone did not bring the board back on the first
  screen (measured: board top still 1,734px, the category summary sits
  between), so the summary moved below the board and the spacing above
  it was tightened — the board now starts at 835px in a 1440×900
  viewport. The trade: the five factors are one click away instead of
  visible on load.
- **The category summary covers all 33 categories**, computed from the
  rows (it agrees with the shipped Top 10 exactly). The top 10 show by
  default; "Show all 33 categories" reveals the other 23 ($607.2M
  combined, 12.2% of the board), and every row — including the folded
  ones — still filters the board on click.
- **Mobile fits 390px with no sideways scroll.** The board hides its
  Chains, Age and Category columns at phone width, drops the share bar
  (the % stays), and lets numeric cells wrap, so it measures exactly
  350px in all three lenses. All three columns stay visible in the
  detail view.
- **Screenshot 3 changes again:** it now loads `?multiples=1` and shows
  the open second level (factors in two columns, multiples table from
  the top). Screenshot 4 now frames the density leader sentence with
  the density board; screenshot 1 frames the implied leader sentence.

## v6 (2026-11-21)

Same model, same ranking, same $4.99B total — the work is dashboard
explanation and layout, not re-scoring:

- **Every protocol's detail now reads its standing against its lens
  leader**, not just the board-top leader. Open any row and the detail
  shows one line next to the why-this-rank sentence: the leader gets
  the board-top sentence itself (Steakhouse Financial is worth $840.3M
  …), any other row gets its lens rank and metric plus the same
  why-parts comparison from its own side (Veda ranks #4 of 198 by
  implied value, behind leader Steakhouse Financial, …). The three
  leader sentences are now one shared function, so the board top and
  the detail can never disagree. The v3 early-only detail read is
  folded into this line — its arithmetic is still there for the early
  lens, for every row.
- **The category summary shows all 33 categories by default.** It sits
  below the board now, so the extra ~500px costs no first-screen space
  (the board still starts inside 900px); the toggle is gone, the
  click-to-filter rows and the long-tail callout ($495.1M, 9.9%) stay.
  (Correction to the v5 record: the v5 report said the tail 23 held
  $607.2M / 12.2% — that was a reporting slip, not a page figure. The
  page always computed the tail from the rows, and board.json + data.js
  agree it is $495.1M / 9.9%: Top 10 $4,499.1M, total $4,994.2M.)
- **Show all 198.** A second button beside Show more loads every
  matching row in one click (198 with no filter on) instead of paging
  +60 at a time; Show more still works the same way.
- **Mobile gets the category back as a card-style sub-line.** The
  Category column stays hidden at 390px, but each protocol name now
  carries its category in small grey type underneath it, so no
  information is lost to the v5 column cut — and the board still
  measures 350px with no sideways scroll in all three lenses.

## v7 (2026-11-21)

Same model, same ranking, same $4.99B total — the work is the
sensitivity audit the model was missing, the first screen, and the
farm plans' last two gaps. Only farm-step wording changes, so
board.json differs from v6 in `farm_steps` text alone; every rank,
implied value, multiple and factor is identical.

- **Sensitivity audit in the method box.** Nine re-ranks: eight
  one-change variants (shrink prior 3/12, momentum weight 0.3/0.5,
  maturity floor 0.65/0.85, no breadth bonus, winsorise
  [-20%, +30%]) plus one joint change (prior 3 + momentum 0.5). Rank
  #1 stays #1 under every variant and the top 10 keeps 9–10 of 10;
  the shrink prior is the sensitive knob (prior 3: biggest move 20,
  33 rows move >10; the joint change barely goes further at 21/35).
  The table is computed at render time from the same data.js as the
  board and cross-checked cell-for-cell against the build-time audit
  in `lib/model.ts` (`buildSensitivity`).
- **Thin-peer warnings.** 65 of 198 rows sit on a multiple set by one
  peer (47) or none (18). The multiples table marks all 12 single-peer
  categories, each detail view states what its peer count means, and a
  footnote explains the 34-vs-33 count (34 categories have
  token-having peers; the board spans 33; the 13 peerless board
  categories take the global median).
- **Why $4.99B is 3.7× the flat route's $1.35B**, in one paragraph in
  the method box: multiples come from each category's own peers
  (global median 0.214×, not 0.08×), Risk Curators alone holds 54.9%
  at 0.326× — and the flat route's own below-floor check found a
  median of 0.419× among 76 smaller token-having protocols.
- **The method box is folded by default.** The board now starts at
  587px in a 1440×900 viewport with 5 full rows on the first screen
  (v5: 835px, header only). The formula and the three lenses are one
  click away; the folded line carries a "Show the model ↓" hint.
- **Farm plans: a deterministic deepen rule and sizing reasons.** The
  Weeks 3–4 step now picks the largest pool or vault Week 1 did not
  use (ranked by the size the protocol's own page shows), with
  single-pool and single-chain fallbacks. The 7 capped probes say so:
  6 young protocols are held at $100 by the young-protocol cap, Shift
  DeFi at $50 by the spike cap. The detail lens read now follows the
  filtered leader, and the phone sub-line adds the chain count.
- **Re-rated (five items, same scale as the v5 final): 5 / 4 / 5 / 5 /
  4.6 = 23.6/25**, up from 19.7. The value_model ceiling is honest:
  with no realized launch valuations in the snapshot, calibration
  cannot be backtested — the audit is the most the data allows.

## v8 (2026-11-21)

Same model, same ranking, same $4.99B total — `board.json` and
`data.js` are byte-identical to v7. The only chaseable item the v7
re-rating left was its footnote: first-screen density was verified at
1440×900 and 390px, not at shorter laptop heights. Measured first:
at 720px height the v7 board showed a single row. So v8 tightens the
first screen only — a shorter lede (same two facts: records no token,
never a prediction), tighter stats, method fold and controls (all six
controls now fit one row at desktop width), a more compact leader
sentence with its wording untouched, and 1px less cell padding. The
board now starts at 473px (v7: 587px) and shows 8 rows at 1440×900,
5 at 768px height, and 4 at 720px height, with no horizontal overflow
at any of the five short viewports tested. Interaction tests:
83/83 (the v7 66 plus lede and short-viewport checks). The value
backtest gap is not chased: with no realized launch valuations in the
snapshot it cannot be built, so no table was added for it.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

Node 22.18+ (tested on 24.22.1), standard library only. Deterministic:
two runs write byte-identical output.
