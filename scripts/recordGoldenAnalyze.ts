/**
 * Record golden analyze expectations from the current analyzer output.
 * Run: npm run record:golden
 * Requires data/cards.db.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { parseDeckText } from '../src/core/deckParser';
import { analyzeDeckBasic } from '../src/core/analyzer';
import { buildQualityGate } from '../src/mcp/mcpOutputHelpers';
import { isDatabaseReady } from '../src/core/cardDatabase';
import { loadFixtureText } from '../test/helpers/fixtures';
import type { GoldenAnalyzeExpected } from '../src/core/goldenDeckExpected';

const PROJECT_ROOT = join(__dirname, '..');
const CARDS_DB_HINT = 'Requires data/cards.db. Run: npm run db:create && npm run db:import';

async function main(): Promise<void> {
  if (!isDatabaseReady()) {
    console.error(`recordGoldenAnalyze: ${CARDS_DB_HINT}`);
    process.exit(1);
  }

  const commanderName = 'Shadrix Silverquill';
  const preferredStrategy = 'group-slug';
  const fixture = 'test/fixtures/shadrix-group-slug-golden.txt';
  const deckText = loadFixtureText('shadrix-group-slug-golden.txt');
  const parsed = parseDeckText(deckText);

  const result = await analyzeDeckBasic(
    {
      deckText,
      commanderName,
      templateId: 'bracket3',
      bracketId: 'bracket3',
      preferredStrategy,
    },
    parsed
  );

  const a = result.analysis;
  const hardLint = a.lintReport?.issues.filter((i) => i.severity === 'hard').length ?? 0;
  const below = a.categories.filter((c) => c.status === 'below');
  const gate = buildQualityGate(a, { synergyTarget: 60 });

  const expected: GoldenAnalyzeExpected = {
    schemaVersion: 1,
    caseId: 'shadrix-group-slug',
    description: 'Analyze regression for Shadrix Silverquill group-slug golden list',
    commanderName,
    preferredStrategy,
    fixture,
    assertions: {
      mainboardCount: 99,
      banlistValid: true,
      maxCategoriesBelow: below.length,
      maxLintHardIssues: hardLint,
      maxBracketWarnings: a.bracketWarnings.length,
      minSynergyScore: a.synergyScore ?? 0,
      qualityGateReady: gate.readyToShip,
    },
    categorySnapshots: a.categories
      .filter((c) => c.status !== 'unknown')
      .map((c) => ({
        name: c.name,
        count: c.count,
        status: c.status,
        min: c.min,
        max: c.max,
      })),
  };

  // Resolve from script location so `npm run record:golden` from a non-root cwd
  // cannot write golden expectations outside the repo (matches benchmarkDecks / mcpSmokeTest).
  const outDir = join(PROJECT_ROOT, 'data', 'golden');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, 'shadrix-group-slug-analyze.expected.json');
  writeFileSync(outPath, JSON.stringify(expected, null, 2) + '\n', 'utf8');

  console.log(`Wrote ${outPath}`);
  console.log(`  synergyScore: ${a.synergyScore ?? 'n/a'}`);
  console.log(`  categoriesBelow: ${below.length}`);
  console.log(`  qualityGate.readyToShip: ${gate.readyToShip}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
