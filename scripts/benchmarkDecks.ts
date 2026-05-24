/**
 * Benchmark build + analyze for several commanders.
 *
 * Requires data/cards.db (npm run db:create && npm run db:import).
 * Run: npm run benchmark:decks
 * JSON: npm run benchmark:decks -- --json
 */

import * as fs from 'fs';
import * as path from 'path';
import { isDatabaseReady, getCardCount } from '../src/core/cardDatabase';
import { runBuildDeckFromCommander } from '../src/mcp/buildDeckFromCommanderTool';

const CARDS_DB_SETUP_HINT =
  'Requires data/cards.db. Run: npm run db:create && npm run db:import';

const COMMANDERS: Array<{ name: string; strategy?: string }> = [
  { name: 'Shadrix Silverquill', strategy: 'group-slug' },
  { name: 'Talrand, Sky Summoner', strategy: 'spellslinger' },
  { name: "Atraxa, Praetors' Voice", strategy: 'counters' },
];

const writeJson = process.argv.includes('--json');

interface BenchmarkRow {
  commander: string;
  preferredStrategy?: string;
  buildMs: number;
  mainboardCards: number;
  synergyScore: number | null;
  buildQuality: string;
  converged: boolean;
  readyToShip: boolean;
  categoriesBelow: number;
  lintHardIssues: number;
  banlistValid: boolean;
  error?: string;
}

async function main(): Promise<void> {
  if (!isDatabaseReady()) {
    console.error(`benchmarkDecks: ${CARDS_DB_SETUP_HINT}`);
    process.exit(1);
  }

  console.log(`cards.db ready (${getCardCount()} cards)\n`);
  const rows: BenchmarkRow[] = [];

  for (const { name, strategy } of COMMANDERS) {
    const label = strategy ? `${name} [${strategy}]` : name;
    console.log(`--- ${label} ---`);
    const t0 = performance.now();

    try {
      const built = await runBuildDeckFromCommander({
        commanderName: name,
        preferredStrategy: strategy,
        templateId: 'bracket3',
        useEdhrec: false,
        useEdhrecAutofill: false,
        useTemplateGenerator: true,
        refineUntilStable: false,
      });
      const buildMs = performance.now() - t0;
      const mainQty = built.deck.cards.reduce((s, c) => s + c.quantity, 0);
      const analysis = built.analysis;

      const below = analysis.categories.filter((c) => c.status === 'below').length;
      const hardLint =
        analysis.lintReport?.issues.filter((i) => i.severity === 'hard').length ?? 0;
      const overall = built.buildQualityReport?.overall ?? 'n/a';
      const ready = built.qualityGate?.readyToShip ?? false;

      rows.push({
        commander: name,
        preferredStrategy: strategy,
        buildMs: Math.round(buildMs),
        mainboardCards: mainQty,
        synergyScore: analysis.synergyScore ?? null,
        buildQuality: String(overall),
        converged: built.converged ?? false,
        readyToShip: ready,
        categoriesBelow: below,
        lintHardIssues: hardLint,
        banlistValid: analysis.banlistValid,
      });

      console.log(`  build (template): ${buildMs.toFixed(0)} ms | cards: ${mainQty}`);
      console.log(
        `  synergy: ${analysis.synergyScore ?? 'n/a'} | quality: ${overall} | converged: ${built.converged ?? false} | readyToShip: ${ready}`
      );
      console.log(`  categories below: ${below} | lint hard: ${hardLint} | banlist: ${analysis.banlistValid}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      rows.push({
        commander: name,
        preferredStrategy: strategy,
        buildMs: 0,
        mainboardCards: 0,
        synergyScore: null,
        buildQuality: 'error',
        converged: false,
        readyToShip: false,
        categoriesBelow: 0,
        lintHardIssues: 0,
        banlistValid: false,
        error: message,
      });
      console.log(`  ERROR: ${message}`);
    }
    console.log('');
  }

  if (writeJson) {
    const outPath = path.join(__dirname, '..', 'data', 'benchmark-latest.json');
    const payload = {
      generatedAt: new Date().toISOString(),
      mode: 'template-offline-edhrec',
      rows,
    };
    fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    console.log(`Wrote ${outPath}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
