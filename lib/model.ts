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
// record what the page actually shows, including nothing.

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
  flags: string[];
  farm_steps: string[];
}

export interface CategoryMultiple {
  category: string;
  peers: number;
  multiple: number;
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
 * median with a prior of SHRINK_PRIOR peers, then clamped.
 */
export function categoryMultiples(snapshot: Snapshot): {
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
    const shrunk = (list.length * catMedian + SHRINK_PRIOR * globalMedian) / (list.length + SHRINK_PRIOR);
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

/** Score one candidate protocol. Every input is a snapshot figure. */
export function scoreProtocol(
  protocol: SnapshotProtocol,
  age: number | null,
  multiple: number,
): Scoring {
  const momentum =
    protocol.change_7d === null
      ? 1
      : 1 + (GROWTH_WEIGHT * clamp(protocol.change_7d, GROWTH_LOW, GROWTH_HIGH)) / 100;
  const seasoning =
    age === null
      ? SEASON_FLOOR
      : SEASON_FLOOR + (1 - SEASON_FLOOR) * (Math.min(age, SEASON_DAYS) / SEASON_DAYS);
  const breadth = 1 + BREADTH_STEP * Math.min(Math.max(protocol.chains.length - 1, 0), BREADTH_CHAINS);

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

/** Probe size by TVL tier, capped for young protocols and spiked ones. */
function probeDollars(protocol: SnapshotProtocol, age: number | null): number {
  let probe = protocol.tvl_usd >= 1_000_000_000 ? 250
    : protocol.tvl_usd >= 100_000_000 ? 150
    : protocol.tvl_usd >= 25_000_000 ? 100
    : 50;
  if (age !== null && age < 180) probe = Math.min(probe, 100);
  if (protocol.change_7d !== null && protocol.change_7d >= GROWTH_HIGH) {
    probe = probe >= 250 ? 150 : probe >= 150 ? 100 : 50;
  }
  return probe;
}

function money(n: number): string {
  return `$${n.toLocaleString('en-US')}`;
}

function chainName(protocol: SnapshotProtocol): string {
  return protocol.chains[0] ?? 'its main chain';
}

/** Five weekly-cadence farm steps, each with a cost in dollars and a time. */
export function farmPlan(protocol: SnapshotProtocol, age: number | null): string[] {
  const probe = probeDollars(protocol, age);
  const total = probe * 2;
  const action = coreAction(protocol.category);
  const chain = chainName(protocol);
  const young = age !== null && age < 180;
  const hold = young ? '30 days' : '45 days';
  return [
    `Week 1, probe (30 minutes to set up, then 7 days): use ${money(probe)} to ${action} on ${chain}. Save the transaction hash, check the next day that your balance reads above $0, and note the fee you paid.`,
    `Week 2, scale (20 minutes, then 7 days): if the probe balance is above $0 and a withdrawal preview returns cleanly, add another ${money(probe)} so ${money(total)} is at risk in total. If either check fails, stop here and withdraw.`,
    `Weeks 3-4, deepen (30 minutes, then 14 days): repeat the core action a second time through a different pool or vault on the same protocol, still with no more than ${money(total)} at risk. Open the protocol's incentives page if it has one and write down exactly what it shows, including when it shows nothing: do not assume points or an airdrop exist.`,
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
    rows: scored,
  };
  return { board: scored, radar };
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
