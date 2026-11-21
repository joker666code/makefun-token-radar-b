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

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

Node 22.18+ (tested on 24.22.1), standard library only. Deterministic:
two runs write byte-identical output.
