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

Five steps on a weekly cadence — Week 1 probe, Week 2 scale, Weeks 3–4
deepen, Ongoing weekly routine, Exit conditions. Every step states its
cost in dollars and its time. No step assumes an airdrop or points exist.

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

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

Node 22.18+ (tested on 24.22.1), standard library only. Deterministic:
two runs write byte-identical output.
