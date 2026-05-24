import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runOptimizeDeck } from './optimizeDeckTool';
import { describeDb, itDb } from '../../test/helpers/db';
import { loadMainboardFixture } from '../../test/helpers/fixtures';

vi.mock('../core/edhrec', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../core/edhrec')>();
  return {
    ...actual,
    getFullCommanderProfile: vi.fn().mockResolvedValue({
      cards: [{ name: 'Impact Tremors', synergyScore: 0.8, category: 'win_conditions' }],
      lands: [],
      themes: [{ name: 'Group Slug', slug: 'group-slug', count: 1 }],
      combos: [],
      highSaltCards: [],
      sourcesUsed: ['mock'],
    }),
    sortBySynergy: actual.sortBySynergy,
  };
});

describeDb('runOptimizeDeck', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  itDb(
    'returns OptimizeDeckResult shape with metrics and iteration notes',
    { timeout: 90_000 },
    async () => {
      const deckText = loadMainboardFixture('shadrix-group-slug-golden.txt');
      const result = await runOptimizeDeck({
        deckText,
        commanderName: 'Shadrix Silverquill',
        preferredStrategy: 'group-slug',
        templateId: 'bracket3',
        maxIterations: 2,
      });

      expect(result.input.commanderName).toBe('Shadrix Silverquill');
      expect(result.input.preferredStrategy).toBe('group-slug');
      expect(result.input.maxIterations).toBe(2);
      expect(result.deckText).toBeTruthy();
      expect(result.decklistText).toBe(result.deckText);
      expect(Array.isArray(result.changes)).toBe(true);
      expect(result.metricsBefore).toMatchObject({
        categoriesBelow: expect.any(Number),
        lintHardIssues: expect.any(Number),
      });
      expect(result.metricsAfter).toMatchObject({
        categoriesBelow: expect.any(Number),
        lintHardIssues: expect.any(Number),
      });
      expect(result.analysis.totalCards).toBe(99);
      expect(Array.isArray(result.iterationNotes)).toBe(true);
      expect(result.iterationNotes.some((n) => /Pass 1/i.test(n))).toBe(true);
    }
  );
});

describe('runOptimizeDeck (no DB)', () => {
  it('throws when commander is unknown', async () => {
    await expect(
      runOptimizeDeck({
        deckText: '1 Island',
        commanderName: 'Totally Fake Commander XYZ 99999',
      })
    ).rejects.toThrow(/not found/i);
  });
});
