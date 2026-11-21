// Token Radar B (lane5): a second route at the same snapshot.
//
// The board ranks every pre-token protocol the house watchlist rule keeps
// (the rule minus its $50M floor), by an implied launch value derived only
// from the snapshot's own figures. No protocol name is ever special-cased.
//
//   implied = TVL x categoryMultiple x momentum x seasoning x breadth x credibility
//
// categoryMultiple: the median mcap/TVL of the token-having protocols in the
//   same category, shrunk toward the snapshot's global median when the
//   category has few token-having peers (weight n / (n + 6)), then clamped
//   to [0.05, 0.80]. Peer ratios are winsorised to [0.02, 1.00] first, so one
//   outlier peer cannot set a whole category's multiple, and protocols
//   whose token records a $0 market cap are not valuation comps at all.
//   Categories with no token-having peer take the global median. The
//   medians are computed from this snapshot at run time.
// momentum: 1 + 0.4 x clamp(change_7d, -40%, +60%); missing change is 1.00
//   before the credibility factor below docks it.
// seasoning: 0.75 + 0.25 x min(ageDays, 1095) / 1095; unknown listed_at is
//   the 0.75 floor, also docked by credibility.
// breadth: 1 + 0.02 x min(chains - 1, 4), at most 1.08.
// credibility: 1.00 minus 0.03 for a missing 7d change, 0.03 for a missing
//   listed_at, 0.02 for TVL under $10M, 0.02 for a single chain; floor 0.90.
//   Sparse or thin records are penalised, never rewarded, and nobody is
//   dropped from the board for them.
//
// Farm plans run on a weekly cadence (Week 1 probe, Week 2 scale,
// Weeks 3-4 deepen, Ongoing, Exit). Every step states what it costs in
// dollars and how long it takes, and no step assumes an airdrop, points
// or any incentive exists: where incentives are checked, the step says to
// record what the page actually shows, including nothing. A Week 0 step
// comes first and costs $0: it verifies the snapshot's own claims about
// the protocol (TVL in the same ballpark, no token listed) plus one
// check the category makes possible and the sharpest warning the row's
// own flags raise, so no money moves on an unverified record.
//
// v2 adds board depth without touching the model: each row carries its
// rank and share inside its own category, the peer count behind its
// multiple, and its density (implied / TVL); the dashboard data carries
// a top-10 category summary by total implied value.
//
// v3 also leaves the model alone. It adds a Week 0 verification step to
// every farm plan — a $0, category-specific check of the record before
// any money moves, plus the sharpest warning the row's own flags raise
// (a capped spike first) — and the dashboard's detail view now spells
// out the spike check and the early-score arithmetic for the
// early-movers lens. Same ranking, same $4.99B total, more information
// per row.
//
// v7 also leaves the ranking alone. It adds the sensitivity audit the
// model was missing (buildSensitivity: eight one-change re-ranks plus one
// joint change, reported as top-10 overlap / biggest rank move / rows
// moved >10 / rank #1 same),
// a deterministic selection rule for the Weeks 3-4 deepen step, and a
// sizing reason on the 7 farm plans whose probe a cap actually cuts.
// Same ranking, same $4.99B total — only the farm-step wording changes,
// so board.json differs from v6 in farm_steps text alone.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface FactorSet {
  multiple: number;
  momentum: number;
  seasoning: number;
  breadth: number;
  credibility: number;
}

export interface BoardRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  rank: number;
  implied_value_usd: number;
  multiple: number;
  momentum: number;
  seasoning: number;
  breadth: number;
  credibility: number;
  early_score: number;
  // v2: where the row sits inside its own category, and how efficiently its
  // TVL converts to implied value. All derived from the snapshot at run time.
  category_rank: number;
  category_implied_share: number;
  peers: number;
  density: number;
  flags: string[];
  farm_steps: string[];
}

export interface CategoryMultiple {
  category: string;
  peers: number;
  multiple: number;
}

export interface CategorySummary {
  category: string;
  rows: number;
  total_implied_usd: number;
  multiple: number;
  share: number;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  protocol_count: number;
  watchlist_count: number;
  watchlist: string[];
  row_count: number;
  global_median: number;
  total_implied_usd: number;
  category_multiples: CategoryMultiple[];
  category_summary: CategorySummary[];
  rows: BoardRow[];
}

const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

const EXCHANGE_PREFIXES = [
  'Binance',
  'Coinbase',
  'Bybit',
  'Kraken',
  'Bitget',
  'OKX',
  'Bitfinex',
  'Gemini',
];

const SHRINK_PRIOR = 6;
const PEER_RATIO_LOW = 0.02;
const PEER_RATIO_HIGH = 1;
const MULTIPLE_LOW = 0.05;
const MULTIPLE_HIGH = 0.8;
const GROWTH_LOW = -40;
const GROWTH_HIGH = 60;
const GROWTH_WEIGHT = 0.4;
const SEASON_DAYS = 1095;
const SEASON_FLOOR = 0.75;
const BREADTH_STEP = 0.02;
const BREADTH_CHAINS = 4;
const SMALL_TVL_USD = 10_000_000;

/**
 * The model's tunable assumptions, as one object, so the sensitivity audit
 * (buildSensitivity) can re-rank the board under one changed assumption at
 * a time. The published board always uses DEFAULT_OPTS, so the audit never
 * moves a rank: it only reports how far the ranking would move.
 */
export interface ModelOpts {
  prior: number;
  growthWeight: number;
  seasonFloor: number;
  breadthStep: number;
  growthLow: number;
  growthHigh: number;
}

export const DEFAULT_OPTS: ModelOpts = {
  prior: SHRINK_PRIOR,
  growthWeight: GROWTH_WEIGHT,
  seasonFloor: SEASON_FLOOR,
  breadthStep: BREADTH_STEP,
  growthLow: GROWTH_LOW,
  growthHigh: GROWTH_HIGH,
};

/** Parse and lightly validate the snapshot document. */
export function parseSnapshot(text: string): Snapshot {
  const doc = JSON.parse(text) as Snapshot;
  if (!Array.isArray(doc.protocols) || !Array.isArray(doc.watchlist)) {
    throw new Error('snapshot: protocols and watchlist must be arrays');
  }
  return doc;
}

/** Median of a non-empty list; 0 when empty. */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Clamp a number into [low, high]. */
function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/** Days between the snapshot date and a protocol's first listing, or null. */
export function ageDays(protocol: SnapshotProtocol, asOf: string): number | null {
  if (protocol.listed_at === null) return null;
  const listed = Date.parse(`${protocol.listed_at}T00:00:00Z`);
  const at = Date.parse(`${asOf}T00:00:00Z`);
  if (Number.isNaN(listed) || Number.isNaN(at)) return null;
  return Math.max(0, Math.floor((at - listed) / 86_400_000));
}

/**
 * The house watchlist rule without its TVL floor: records no token, is not
 * a wrapped / staked / bridged product of a token that trades, carries no
 * version marker in its name and does not start with an exchange's name.
 */
export function isCandidate(protocol: SnapshotProtocol): boolean {
  if (protocol.gecko_id !== null || protocol.symbol !== null) return false;
  if (protocol.mcap_usd !== null) return false;
  if (protocol.category !== null && EXCLUDED_CATEGORIES.has(protocol.category)) return false;
  const name = protocol.name;
  if (/ (V\d+|v\d+|\d+\.\d+)$/.test(name)) return false;
  if (/\b(wrapped|staked|staking)\b/i.test(name)) return false;
  if (EXCHANGE_PREFIXES.some((prefix) => name.startsWith(prefix))) return false;
  return true;
}

/**
 * Category multiples from the snapshot itself: for each category, the
 * median mcap/TVL of its token-having protocols, shrunk toward the global
 * median with a prior of `prior` peers, then clamped. The published board
 * uses prior 6; the sensitivity audit re-runs this with prior 3 and 12.
 */
export function categoryMultiples(snapshot: Snapshot, prior: number = SHRINK_PRIOR): {
  globalMedian: number;
  byCategory: Map<string, number>;
  table: CategoryMultiple[];
} {
  const ratios: number[] = [];
  const perCategory = new Map<string, number[]>();
  for (const p of snapshot.protocols) {
    if (p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0) {
      const ratio = clamp(p.mcap_usd / p.tvl_usd, PEER_RATIO_LOW, PEER_RATIO_HIGH);
      ratios.push(ratio);
      const key = p.category ?? '(no category)';
      const list = perCategory.get(key) ?? [];
      list.push(ratio);
      perCategory.set(key, list);
    }
  }
  const globalMedian = median(ratios);
  const byCategory = new Map<string, number>();
  const table: CategoryMultiple[] = [];
  for (const [category, list] of [...perCategory.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const catMedian = median(list);
    const shrunk = (list.length * catMedian + prior * globalMedian) / (list.length + prior);
    const multiple = clamp(shrunk, MULTIPLE_LOW, MULTIPLE_HIGH);
    byCategory.set(category, multiple);
    table.push({ category, peers: list.length, multiple: Math.round(multiple * 10000) / 10000 });
  }
  return { globalMedian, byCategory, table };
}

export interface Scoring {
  implied: number;
  factors: FactorSet;
  flags: string[];
  earlyScore: number;
}

/** Score one candidate protocol. Every input is a snapshot figure.
 * `opts` is DEFAULT_OPTS on the published board; the sensitivity audit
 * passes one changed assumption at a time. */
export function scoreProtocol(
  protocol: SnapshotProtocol,
  age: number | null,
  multiple: number,
  opts: ModelOpts = DEFAULT_OPTS,
): Scoring {
  const momentum =
    protocol.change_7d === null
      ? 1
      : 1 + (opts.growthWeight * clamp(protocol.change_7d, opts.growthLow, opts.growthHigh)) / 100;
  const seasoning =
    age === null
      ? opts.seasonFloor
      : opts.seasonFloor + (1 - opts.seasonFloor) * (Math.min(age, SEASON_DAYS) / SEASON_DAYS);
  const breadth = 1 + opts.breadthStep * Math.min(Math.max(protocol.chains.length - 1, 0), BREADTH_CHAINS);

  let credibility = 1;
  if (protocol.change_7d === null) credibility -= 0.03;
  if (age === null) credibility -= 0.03;
  if (protocol.tvl_usd < SMALL_TVL_USD) credibility -= 0.02;
  if (protocol.chains.length <= 1) credibility -= 0.02;
  credibility = Math.max(0.9, credibility);

  const implied = Math.max(
    1,
    Math.round(protocol.tvl_usd * multiple * momentum * seasoning * breadth * credibility),
  );

  const flags: string[] = [];
  if (protocol.change_7d !== null && protocol.change_7d <= -20) flags.push('tvl-falling');
  if (protocol.change_7d !== null && protocol.change_7d >= GROWTH_HIGH) flags.push('spike-capped');
  if (protocol.change_7d === null) flags.push('growth-unreported');
  if (protocol.chains.length <= 1) flags.push('single-chain');
  if (age !== null && age < 180) flags.push('young');
  if (age === null) flags.push('age-unknown');

  // Early-mover lens (dashboard sort only): momentum times youth.
  const youth = 1.5 - Math.min(age ?? 365, SEASON_DAYS) / SEASON_DAYS;
  const earlyScore = Math.round(momentum * youth * 100) / 100;

  return {
    implied,
    factors: { multiple, momentum, seasoning, breadth, credibility },
    flags,
    earlyScore,
  };
}

/** The core action a farm plan repeats, by category. */
function coreAction(category: string | null): string {
  switch (category) {
    case 'Lending':
      return 'supply assets to its lending market and borrow a small amount against them';
    case 'Dexs':
      return 'provide liquidity to its largest pool and swap through it';
    case 'Yield':
    case 'Yield Aggregator':
      return 'deposit into its yield vault';
    case 'RWA':
      return 'deposit into its tokenised-asset vault';
    case 'Derivatives':
    case 'Perps':
      return 'open small hedged positions on its perps market';
    case 'Risk Curators':
    case 'Onchain Capital Allocator':
      return 'deposit into its curated vault';
    case 'CDP':
      return 'open a small collateralised debt position';
    case 'Prediction Market':
      return 'place small trades on its prediction market';
    case 'Payments':
      return 'route a real payment through it';
    default:
      return 'use its core product with a real transaction';
  }
}

/**
 * Probe size by TVL tier, capped for young protocols and spiked ones.
 * The caps are reported, not just applied: when one actually bites (the
 * probe it produces is smaller than the TVL tier alone would allow), the
 * Week 1 step says so and why — a capped size with no reason is not
 * auditable. On this snapshot 7 of 198 rows are capped: 6 by the
 * young-protocol cap, 1 (Shift DeFi) by the spike cap.
 */
function probeDetail(protocol: SnapshotProtocol, age: number | null): {
  probe: number;
  base: number;
  youngCapped: boolean;
  spikeCapped: boolean;
} {
  const base = protocol.tvl_usd >= 1_000_000_000 ? 250
    : protocol.tvl_usd >= 100_000_000 ? 150
    : protocol.tvl_usd >= 25_000_000 ? 100
    : 50;
  let probe = base;
  let youngCapped = false;
  let spikeCapped = false;
  if (age !== null && age < 180 && probe > 100) {
    probe = 100;
    youngCapped = true;
  }
  if (protocol.change_7d !== null && protocol.change_7d >= GROWTH_HIGH) {
    const after = probe >= 250 ? 150 : probe >= 150 ? 100 : 50;
    if (after < probe) {
      probe = after;
      spikeCapped = true;
    }
  }
  return { probe, base, youngCapped, spikeCapped };
}

/** Probe size by TVL tier, capped for young protocols and spiked ones. */
function probeDollars(protocol: SnapshotProtocol, age: number | null): number {
  return probeDetail(protocol, age).probe;
}

function money(n: number): string {
  return `$${n.toLocaleString('en-US')}`;
}

function chainName(protocol: SnapshotProtocol): string {
  return protocol.chains[0] ?? 'its main chain';
}

/** The Week 0 check, by category: what to verify on the protocol's own
 * pages before any money moves. A lending market's borrow rate is
 * checkable in a way a vault curator's strategy is not, so the check
 * follows the category; every category the snapshot carries is covered,
 * and the default fits the long tail of one- and two-row categories. */
function verifyCheck(category: string | null): string {
  switch (category) {
    case 'Lending':
    case 'Uncollateralized Lending':
      return 'check the borrow rate, the collateral list and that a withdrawal preview returns cleanly on its lending page';
    case 'Dexs':
      return 'check the largest pool\u2019s depth and that a small swap preview quotes without heavy slippage';
    case 'Yield':
    case 'Yield Aggregator':
    case 'Farm':
    case 'Leveraged Farming':
      return 'check the vault\u2019s stated yield source, its fee page and the withdrawal delay it states';
    case 'RWA':
      return 'check the custodian or attestation page for the tokenised asset and the redemption terms it states';
    case 'Derivatives':
    case 'Perps':
    case 'Basis Trading':
    case 'Interest Rate Derivatives':
      return 'check the funding rate, the liquidation rules and the fee schedule on its trading page';
    case 'Risk Curators':
    case 'Onchain Capital Allocator':
      return 'check who curates the vault, the strategy it states and the fee it charges';
    case 'CDP':
    case 'CDP Manager':
    case 'Collateral Markets':
    case 'Stablecoin Wrapper':
    case 'Dual-Token Stablecoin':
    case 'Decentralized BTC':
    case 'Anchor BTC':
      return 'check the collateral ratio, the liquidation threshold and the redemption path it states';
    case 'Prediction Market':
      return 'check the market\u2019s resolution rules and who resolves it';
    case 'Payments':
    case 'Crypto Card Issuer':
      return 'check the fee and settlement time it states for a payment';
    case 'Chain':
    case 'Cross Chain Bridge':
      return 'check the bridge or chain explorer lists it and the transfer fee it states';
    default:
      return 'check its docs page states what the product does, how fees work and how withdrawals work';
  }
}

/**
 * The sharpest warning the row's own record raises, if it raises one.
 * A capped spike first, then a falling TVL, then missing figures, then
 * youth or a single chain. Only one note: the step has to stay readable
 * and inside the gate's 600-character step cap.
 */
function verifyFlagNote(protocol: SnapshotProtocol, age: number | null): string {
  if (protocol.change_7d !== null && protocol.change_7d >= GROWTH_HIGH) {
    return ` Its 7-day TVL jumped +${protocol.change_7d.toFixed(1)}% — check whether one deposit or a new vault explains it, because a single inflow can reverse as fast as it arrived.`;
  }
  if (protocol.change_7d !== null && protocol.change_7d <= -20) {
    return ` Its TVL fell ${Math.abs(protocol.change_7d).toFixed(1)}% in 7 days — check whether the fall is still going before probing.`;
  }
  if (protocol.change_7d === null) {
    return ' Its 7-day change is unreported, so there is no growth figure to confirm.';
  }
  if (age === null) {
    return ' Its listing date is unknown, so its age cannot be confirmed.';
  }
  if (age < 180) {
    return ' It listed under 6 months ago, so confirm the launch date on its own page.';
  }
  if (protocol.chains.length <= 1) {
    return ' It runs on one chain only, so confirm that chain\u2019s explorer lists it.';
  }
  return '';
}

/** Six farm steps: a Week 0 verification, then five weekly-cadence steps, each with a cost in dollars and a time. */
export function farmPlan(protocol: SnapshotProtocol, age: number | null): string[] {
  const sizing = probeDetail(protocol, age);
  const probe = sizing.probe;
  const total = probe * 2;
  const action = coreAction(protocol.category);
  const chain = chainName(protocol);
  const young = age !== null && age < 180;
  const hold = young ? '30 days' : '45 days';
  // The sizing reason (v7): when a cap actually bites, the Week 1 step
  // says which cap and what the uncapped size would have been. Only the
  // 7 capped rows carry this sentence; the other 191 read as before.
  let sizingNote = '';
  if (sizing.youngCapped && sizing.spikeCapped) {
    sizingNote = ` The probe is capped at ${money(probe)} — its TVL alone would allow ${money(sizing.base)}, but it listed under 6 months ago and its 7-day TVL jumped +${protocol.change_7d!.toFixed(1)}%, so the young-protocol cap and the spike cap both bite.`;
  } else if (sizing.youngCapped) {
    sizingNote = ` The probe is capped at ${money(probe)} — its TVL alone would allow ${money(sizing.base)}, but it listed under 6 months ago, so the young-protocol cap holds it there.`;
  } else if (sizing.spikeCapped) {
    sizingNote = ` The probe is capped at ${money(probe)} — its TVL alone would allow ${money(sizing.base)}, but its 7-day TVL jumped +${protocol.change_7d!.toFixed(1)}%, so the spike cap drops it one tier.`;
  }
  const verify =
    `Week 0, verify the record (15 minutes, $0 at risk): before spending anything, ${verifyCheck(protocol.category)}. ` +
    `Confirm its own page shows TVL in the same ballpark as ${money(protocol.tvl_usd)} and lists no token.` +
    `${verifyFlagNote(protocol, age)} Write down what each check shows; if any check cannot be confirmed, halve the Week 1 probe.`;
  return [
    verify,
    `Week 1, probe (30 minutes to set up, then 7 days): use ${money(probe)} to ${action} on ${chain}. Save the transaction hash, check the next day that your balance reads above $0, and note the fee you paid.${sizingNote}`,
    `Week 2, scale (20 minutes, then 7 days): if the probe balance is above $0 and a withdrawal preview returns cleanly, add another ${money(probe)} so ${money(total)} is at risk in total. If either check fails, stop here and withdraw.`,
    `Weeks 3-4, deepen (30 minutes, then 14 days): repeat the core action a second time through a different pool or vault on the same protocol — pick the largest one Week 1 did not use, ranking the protocol's pools or vaults by the size its own page shows; if it lists only one, use that same one again on a different chain it runs on, or the same chain if it runs on one — still with no more than ${money(total)} at risk. Open the protocol's incentives page if it has one and write down exactly what it shows, including when it shows nothing: do not assume points or an airdrop exist.`,
    `Ongoing, weekly routine (10 minutes a week for ${hold}): once a week re-check the protocol's TVL, your balance and whether any new pool or vault opened. Keep a one-line log with the date so a later token claim, if one ever appears, can be traced to real use.`,
    `Exit (about 30 minutes including confirmation): withdraw everything when any of these is true: the protocol's TVL falls 30% from where you entered, fees eat more than a tenth of your position, or a token launches and you have decided to take profits. Withdraw in one transaction and confirm the funds land back in your wallet.`,
  ];
}

/** Build the whole board and the dashboard's data object. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const { globalMedian, byCategory, table } = categoryMultiples(snapshot);
  const candidates = snapshot.protocols.filter(isCandidate);
  const scored: BoardRow[] = candidates.map((p) => {
    const age = ageDays(p, snapshot.as_of);
    const multiple = byCategory.get(p.category ?? '(no category)') ?? clamp(globalMedian, MULTIPLE_LOW, MULTIPLE_HIGH);
    const scoredOne = scoreProtocol(p, age, multiple);
    return {
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      age_days: age,
      rank: 0,
      implied_value_usd: scoredOne.implied,
      multiple: Math.round(scoredOne.factors.multiple * 10000) / 10000,
      momentum: Math.round(scoredOne.factors.momentum * 10000) / 10000,
      seasoning: Math.round(scoredOne.factors.seasoning * 10000) / 10000,
      breadth: Math.round(scoredOne.factors.breadth * 10000) / 10000,
      credibility: Math.round(scoredOne.factors.credibility * 10000) / 10000,
      early_score: scoredOne.earlyScore,
      category_rank: 0,
      category_implied_share: 0,
      peers: 0,
      density: 0,
      flags: scoredOne.flags,
      farm_steps: farmPlan(p, age),
    };
  });
  scored.sort((a, b) => {
    if (b.implied_value_usd !== a.implied_value_usd) return b.implied_value_usd - a.implied_value_usd;
    if (b.tvl_usd !== a.tvl_usd) return b.tvl_usd - a.tvl_usd;
    return a.slug.localeCompare(b.slug);
  });
  scored.forEach((row, index) => {
    row.rank = index + 1;
  });
  const totalImplied = scored.reduce((sum, row) => sum + row.implied_value_usd, 0);
  // v2: category context, computed after the global sort so category_rank
  // follows the same implied-value order. density is the effective multiple
  // (implied / TVL): the model's five factors folded into one number, so a
  // small protocol that converts TVL efficiently can be found without
  // re-running the model.
  const peerCount = new Map(table.map((t) => [t.category, t.peers]));
  const catTotals = new Map<string, number>();
  const catCounts = new Map<string, number>();
  for (const row of scored) {
    const key = row.category ?? '(no category)';
    catTotals.set(key, (catTotals.get(key) ?? 0) + row.implied_value_usd);
    catCounts.set(key, (catCounts.get(key) ?? 0) + 1);
  }
  const catSeen = new Map<string, number>();
  for (const row of scored) {
    const key = row.category ?? '(no category)';
    const n = (catSeen.get(key) ?? 0) + 1;
    catSeen.set(key, n);
    row.category_rank = n;
    row.category_implied_share = Math.round((row.implied_value_usd / catTotals.get(key)!) * 10000) / 10000;
    row.peers = peerCount.get(key) ?? 0;
    row.density = Math.round((row.implied_value_usd / row.tvl_usd) * 10000) / 10000;
  }
  const categorySummary: CategorySummary[] = [...catTotals.entries()]
    .map(([category, total]) => ({
      category,
      rows: catCounts.get(category)!,
      total_implied_usd: total,
      multiple: Math.round((byCategory.get(category) ?? clamp(globalMedian, MULTIPLE_LOW, MULTIPLE_HIGH)) * 10000) / 10000,
      share: Math.round((total / totalImplied) * 10000) / 10000,
    }))
    .sort((a, b) => b.total_implied_usd - a.total_implied_usd || a.category.localeCompare(b.category))
    .slice(0, 10);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    protocol_count: snapshot.protocols.length,
    watchlist_count: snapshot.watchlist.length,
    watchlist: [...snapshot.watchlist].sort(),
    row_count: scored.length,
    global_median: Math.round(globalMedian * 10000) / 10000,
    total_implied_usd: totalImplied,
    category_multiples: table,
    category_summary: categorySummary,
    rows: scored,
  };
  return { board: scored, radar };
}

export interface SensitivityRow {
  /** One assumption changed, everything else as published. */
  variant: string;
  /** How many of the base top 10 stay in the variant's top 10. */
  top10_overlap: number;
  /** Largest absolute rank move of any row under the variant. */
  max_rank_move: number;
  /** Rows moving more than 10 places under the variant. */
  rows_moved_gt10: number;
  /** Whether rank #1 is the same protocol under the variant. */
  rank1_same: boolean;
}

/** Rank the candidates under one set of assumptions, returning slug → rank
 *  with the same sort (implied desc, TVL desc, slug asc) as the board. */
function rankWithOpts(snapshot: Snapshot, opts: ModelOpts): Map<string, number> {
  const { byCategory, globalMedian } = categoryMultiples(snapshot, opts.prior);
  const scored = snapshot.protocols.filter(isCandidate).map((p) => {
    const age = ageDays(p, snapshot.as_of);
    const multiple = byCategory.get(p.category ?? '(no category)') ?? clamp(globalMedian, MULTIPLE_LOW, MULTIPLE_HIGH);
    return { slug: p.slug, tvl: p.tvl_usd, implied: scoreProtocol(p, age, multiple, opts).implied };
  });
  scored.sort((a, b) => b.implied - a.implied || b.tvl - a.tvl || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  return new Map(scored.map((r, i) => [r.slug, i + 1]));
}

/**
 * Re-rank the board under one changed assumption at a time — plus one
 * joint change (the two most sensitive knobs together) — and report how
 * far the ranking moves. The published board never changes: this is the
 * audit that the ranking is not an artefact of one parameter choice. The
 * dashboard recomputes this same table at render time from data.js (see
 * dashboard/app.js, renderSensitivity) and the two agree exactly — the
 * cross-check is verify-sensitivity.mjs beside this lane's REPORT.md.
 */
export function buildSensitivity(snapshot: Snapshot): SensitivityRow[] {
  const base = rankWithOpts(snapshot, DEFAULT_OPTS);
  const baseTop10 = new Set([...base.entries()].filter(([, r]) => r <= 10).map(([s]) => s));
  const baseRank1 = [...base.entries()].find(([, r]) => r === 1)![0];
  const variants: Array<[string, Partial<ModelOpts>]> = [
    ['Shrink prior 3 (peers weigh more)', { prior: 3 }],
    ['Shrink prior 12 (peers weigh less)', { prior: 12 }],
    ['Momentum weight 0.3', { growthWeight: 0.3 }],
    ['Momentum weight 0.5', { growthWeight: 0.5 }],
    ['Maturity floor 0.65', { seasonFloor: 0.65 }],
    ['Maturity floor 0.85', { seasonFloor: 0.85 }],
    ['No breadth bonus', { breadthStep: 0 }],
    ['Winsorise [-20%, +30%]', { growthLow: -20, growthHigh: 30 }],
    // One joint change (v7.1): the two most sensitive knobs together, so
    // the audit also answers whether the prior and momentum interact.
    ['Prior 3 + momentum 0.5 (joint)', { prior: 3, growthWeight: 0.5 }],
  ];
  return variants.map(([variant, over]) => {
    const opts = { ...DEFAULT_OPTS, ...over };
    const vRank = rankWithOpts(snapshot, opts);
    const vTop10 = [...vRank.entries()].filter(([, r]) => r <= 10).map(([s]) => s);
    const overlap = vTop10.filter((s) => baseTop10.has(s)).length;
    let maxMove = 0;
    let moved = 0;
    for (const [slug, rank] of base) {
      const d = Math.abs((vRank.get(slug) ?? 0) - rank);
      if (d > maxMove) maxMove = d;
      if (d > 10) moved += 1;
    }
    const vRank1 = [...vRank.entries()].find(([, r]) => r === 1)![0];
    return { variant, top10_overlap: overlap, max_rank_move: maxMove, rows_moved_gt10: moved, rank1_same: vRank1 === baseRank1 };
  });
}

/**
 * The gate's shape, checked before anything is written: 100+ rows, every
 * watchlist slug covered, ranks exactly 1..N, implied values never rising
 * with rank, farm steps 3-12 strings of 20-600 characters each.
 */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100) return `board holds ${board.length} rows, fewer than 100`;
  const slugs = new Set(board.map((row) => row.slug));
  for (const slug of snapshot.watchlist) {
    if (!slugs.has(slug)) return `watchlist slug ${slug} is missing from the board`;
  }
  const seenRanks = new Set<number>();
  for (const row of board) {
    if (!Number.isInteger(row.rank) || row.rank < 1) return `row ${row.slug} has a bad rank ${row.rank}`;
    seenRanks.add(row.rank);
  }
  if (seenRanks.size !== board.length) return 'ranks are not all distinct';
  for (let i = 1; i < board.length; i += 1) {
    if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) {
      return `implied value rises from rank ${i} to rank ${i + 1}`;
    }
  }
  for (const row of board) {
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) {
      return `row ${row.slug} has ${row.farm_steps.length} farm steps`;
    }
    for (const step of row.farm_steps) {
      const trimmed = step.trim();
      if (trimmed.length < 20 || trimmed.length > 600) {
        return `row ${row.slug} has a farm step of ${trimmed.length} characters`;
      }
    }
  }
  return null;
}

/** The dashboard's data file: the same board the program writes, as a script. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR = ${JSON.stringify(radar)};\n`;
}
