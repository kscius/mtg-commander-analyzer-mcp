import { describe, expect } from 'vitest';
import { parseDeckText } from './deckParser';
import { analyzeDeckBasic } from './analyzer';
import {
  assertAnalyzeMatchesGolden,
  loadGoldenAnalyzeExpected,
} from './goldenDeckExpected';
import { describeDb, itDb } from '../../test/helpers/db';
import { loadFixtureText } from '../../test/helpers/fixtures';

const analyzeTimeoutMs = 90_000;

describeDb('golden deck analyze regression', () => {
  itDb(
    'Shadrix group-slug golden list matches data/golden/shadrix-group-slug-analyze.expected.json',
    { timeout: analyzeTimeoutMs },
    async () => {
      const expected = loadGoldenAnalyzeExpected();
      const deckText = loadFixtureText('shadrix-group-slug-golden.txt');
      const parsed = parseDeckText(deckText);

      const result = await analyzeDeckBasic(
        {
          deckText,
          commanderName: expected.commanderName,
          templateId: 'bracket3',
          bracketId: 'bracket3',
          preferredStrategy: expected.preferredStrategy,
        },
        parsed
      );

      const failures = assertAnalyzeMatchesGolden(result.analysis, expected);
      if (failures.length > 0) {
        const detail = failures.map((f) => `${f.field}: expected ${f.expected}, got ${f.actual}`).join('\n');
        expect.fail(`Golden regression failed:\n${detail}`);
      }
    }
  );
});
