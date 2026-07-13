import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AnalyzeDeckResult,
  BuildDeckInput,
  CategorySummary,
  DeckAnalysis,
  EdhrecContext,
} from './types';
import type { OracleCard } from './scryfall';

const analyzeDeckBasic = vi.fn<() => Promise<AnalyzeDeckResult>>();

vi.mock('./analyzer', () => ({
  analyzeDeckBasic: (...args: unknown[]) => analyzeDeckBasic(...args),
}));

vi.mock('./scryfall', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./scryfall')>();
  const cards: Record<string, object> = {
    'Command Tower': {
      name: 'Command Tower',
      type_line: 'Land',
      color_identity: [] as string[],
      mana_cost: '',
      cmc: 0,
      oracle_text: '',
      tags: ['land'],
    },
    'Sol Ring': {
      name: 'Sol Ring',
      type_line: 'Artifact',
      color_identity: [] as string[],
      mana_cost: '{1}',
      cmc: 1,
      oracle_text: '{T}: Add {C}{C}.',
      tags: ['ramp'],
    },
    Plains: {
      name: 'Plains',
      type_line: 'Basic Land — Plains',
      color_identity: ['W'],
      mana_cost: '',
      cmc: 0,
      oracle_text: '',
      tags: ['land'],
    },
  };
  return {
    ...actual,
    getCardByName: vi.fn((name: string) => cards[name] ?? null),
  };
});

vi.mock('./banlist', () => ({
  isBanned: vi.fn(() => false),
}));

vi.mock('./bracketCards', () => ({
  isGameChanger: vi.fn(() => false),
  isMassLandDenial: vi.fn(() => false),
  isExtraTurnCard: vi.fn(() => false),
}));

vi.mock('./bracket3Validation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./bracket3Validation')>();
  return {
    ...actual,
    loadCombos: vi.fn(() => []),
    validateBracket3: vi.fn(() => ({ errors: [], warnings: [] })),
    validateTwoCardCombosBeforeT6: vi.fn(() => []),
  };
});

vi.mock('./autoTags', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./autoTags')>();
  return {
    ...actual,
    getPrimaryTemplateCategory: vi.fn((card: { name?: string; tags?: string[] }) => {
      if (card.tags?.includes('ramp')) return 'ramp';
      if (card.tags?.includes('land')) return 'lands';
      return undefined;
    }),
  };
});

import { runIterativeEdhrecAutofill } from './edhrecAutofill';
import { loadDeckTemplate } from './templates';

const category = (
  name: string,
  count: number,
  status: CategorySummary['status'],
  min = 0,
  max = 99
): CategorySummary => ({ name, count, status, min, max });

const deckAnalysis = (overrides: Partial<DeckAnalysis> = {}): DeckAnalysis => ({
  commanderName: 'Test Commander',
  totalCards: 90,
  uniqueCards: 90,
  categories: [
    category('lands', 35, 'within', 35, 38),
    category('ramp', 9, 'within', 9, 12),
  ],
  notes: [],
  bracketWarnings: [],
  bannedCards: [],
  banlistValid: true,
  synergyScore: 50,
  lintReport: { ok: true, issues: [], metrics: {} },
  ...overrides,
});

const analyzeResult = (analysis: DeckAnalysis): AnalyzeDeckResult =>
  ({
    input: { templateId: 'bracket3', bracketId: 'bracket3' },
    analysis,
    parsedDeck: { commanderName: 'Test Commander', cards: [] },
  }) as AnalyzeDeckResult;

const commanderCard = {
  name: 'Test Commander',
  color_identity: ['W', 'U', 'B'],
  type_line: 'Legendary Creature — Test',
  oracle_text: '',
  mana_cost: '{2}{W}{U}{B}',
  cmc: 5,
} as OracleCard;

describe('runIterativeEdhrecAutofill analysis contract', () => {
  const template = loadDeckTemplate('bracket3');

  beforeEach(() => {
    vi.clearAllMocks();
    analyzeDeckBasic.mockReset();
  });

  it('forwards preferredStrategy and commanderName to analyzeDeckBasic', async () => {
    analyzeDeckBasic.mockResolvedValue(
      analyzeResult(
        deckAnalysis({
          synergyScore: 72,
          categories: [
            category('lands', 36, 'within', 35, 38),
            category('ramp', 10, 'within', 9, 12),
          ],
        })
      )
    );

    const input: BuildDeckInput = {
      commanderName: 'Test Commander',
      preferredStrategy: 'tokens',
      useEdhrecAutofill: false,
      banlistId: 'commander',
    };

    const result = await runIterativeEdhrecAutofill(
      input,
      commanderCard,
      template,
      undefined,
      'bracket3',
      'bracket3',
      { sourcesUsed: [], suggestions: [] },
      [{ name: 'Plains', quantity: 36, roles: ['land'] }],
      true,
      1
    );

    expect(analyzeDeckBasic).toHaveBeenCalledTimes(1);
    const analyzeInput = analyzeDeckBasic.mock.calls[0]?.[0] as {
      preferredStrategy?: string;
      commanderName?: string;
    };
    expect(analyzeInput.preferredStrategy).toBe('tokens');
    expect(analyzeInput.commanderName).toBe('Test Commander');
    expect(result.analysis.synergyScore).toBe(72);
  });

  it('re-analyzes after land autofill before the category pass', async () => {
    const preLand = deckAnalysis({
      categories: [
        category('lands', 32, 'below', 35, 38),
        category('ramp', 7, 'below', 9, 12),
      ],
      synergyScore: 50,
    });
    const postLand = deckAnalysis({
      categories: [
        category('lands', 35, 'within', 35, 38),
        category('ramp', 7, 'below', 9, 12),
      ],
      synergyScore: 61,
    });
    const afterCategory = deckAnalysis({
      categories: [
        category('lands', 35, 'within', 35, 38),
        category('ramp', 9, 'within', 9, 12),
      ],
      synergyScore: 64,
    });

    analyzeDeckBasic
      .mockResolvedValueOnce(analyzeResult(preLand))
      .mockResolvedValueOnce(analyzeResult(postLand))
      .mockResolvedValueOnce(analyzeResult(afterCategory));

    const edhrecContext: EdhrecContext = {
      sourcesUsed: ['test'],
      selectedTheme: 'tokens',
      suggestions: [
        { name: 'Command Tower', synergyScore: 0.9, category: 'lands' },
        { name: 'Sol Ring', synergyScore: 0.95, category: 'ramp' },
      ],
    };

    const input: BuildDeckInput = {
      commanderName: 'Test Commander',
      preferredStrategy: 'tokens',
      useEdhrecAutofill: true,
      banlistId: 'commander',
    };

    await runIterativeEdhrecAutofill(
      input,
      commanderCard,
      template,
      undefined,
      'bracket3',
      'bracket3',
      edhrecContext,
      [{ name: 'Plains', quantity: 32, roles: ['land'] }],
      false,
      1
    );

    // pass start + post-land refresh + final analysis after progress
    expect(analyzeDeckBasic.mock.calls.length).toBeGreaterThanOrEqual(3);

    for (const call of analyzeDeckBasic.mock.calls) {
      const analyzeInput = call[0] as { preferredStrategy?: string; commanderName?: string };
      expect(analyzeInput.preferredStrategy).toBe('tokens');
      expect(analyzeInput.commanderName).toBe('Test Commander');
    }

    // Second call is the post-land refresh (before category autofill uses it)
    expect(analyzeDeckBasic.mock.calls[1]?.[0]).toBeDefined();
  });
});
