// Token Radar B (lane5) runner: snapshot in, board + dashboard + dossier out.
//
// Reads the sealed snapshot (default /input/snapshot.json, overridable with
// --input <file|dir>), scores it with lib/model.ts, and writes the entry's
// outputs: board.json, data.js, dashboard/, screenshots/ and dossier.json.
// The output directory is /output, or MAKEFUN_OUTPUT_DIR, or --output <dir>.
// Runs are deterministic: the same snapshot always writes the same bytes,
// so the grader's two runs agree.
//
// Usage (local):
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const TEXT_CAP_BYTES = 65_536;

function flagValue(name: string, fallback: string): string {
  const position = process.argv.indexOf(`--${name}`);
  if (position >= 0 && position + 1 < process.argv.length) return process.argv[position + 1]!;
  const joined = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return joined === undefined ? fallback : joined.slice(name.length + 3);
}

function fail(message: string): never {
  process.stderr.write(`token-radar-b: ${message}\n`);
  process.exit(1);
}

const inputGiven = flagValue('input', '/input');
const snapshotPath = inputGiven.endsWith('.json') ? inputGiven : join(inputGiven, 'snapshot.json');
if (!existsSync(snapshotPath)) {
  fail(`no snapshot at ${snapshotPath}: pass --input <snapshot.json|directory>`);
}
const outDir = flagValue('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(snapshotPath, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const problem = boardIssue(board, snapshot);
if (problem !== null) fail(`the model wrote a board the gate refuses: ${problem}`);

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(outDir, 'data.js'), dataScript(radar));

const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

function copyDir(source: string, target: string): string[] {
  if (!existsSync(source)) return [];
  mkdirSync(target, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(source).sort()) {
    if (name.startsWith('.')) continue;
    const from = join(source, name);
    if (statSync(from).isFile()) {
      copyFileSync(from, join(target, name));
      copied.push(name);
    }
  }
  return copied;
}

const dashboardFiles = copyDir(join(repoRoot, 'dashboard'), join(outDir, 'dashboard'));
if (!dashboardFiles.includes('index.html')) fail('dashboard/ holds no index.html');
const shots = copyDir(join(repoRoot, 'screenshots'), join(outDir, 'screenshots'));
if (shots.length < 3) {
  fail(`screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view`);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) fail(`screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters`);
}

// The dossier is written last: the scorer rebuilds it from this output and
// compares the bytes, so nothing may change after this line.
writeFileSync(
  join(outDir, 'dossier.json'),
  buildDossier(outDir, {
    text_max_bytes: TEXT_CAP_BYTES,
    screenshots: { max: 4, max_bytes: 524_288 },
    dashboard: { max_files: 400, max_bytes: 4_194_304 },
  }),
);

process.stdout.write(
  `token-radar-b: ${snapshot.protocols.length} protocols in, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows ranked\n` +
    `token-radar-b: total implied value $${radar.total_implied_usd.toLocaleString('en-US')}, global mcap/TVL median ${radar.global_median}\n` +
    `token-radar-b: wrote ${join(outDir, 'board.json')}, ${join(outDir, 'data.js')}, dashboard (${dashboardFiles.length} files), screenshots (${shots.length}) and dossier.json\n`,
);
