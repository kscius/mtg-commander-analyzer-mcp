import { describe, expect, it } from 'vitest';
import {
  formatAuxiliaryMcpJson,
  formatMcpToolJson,
  toBriefStrategyGuideResult,
  toBriefSynergiesResult,
} from './mcpResponseFormat';
import type { BuildDeckResult } from '../core/types';

describe('formatAuxiliaryMcpJson', () => {
  it('strips full oracle text from search_cards in brief mode', () => {
    const raw = {
      cards: [
        {
          name: 'Sol Ring',
          type: 'Artifact',
          mv: 1,
          oracleText: 'A'.repeat(200),
          tags: ['ramp'],
        },
      ],
      count: 1,
      databaseReady: true,
    };
    const brief = JSON.parse(formatAuxiliaryMcpJson(raw, 'brief')) as typeof raw;
    expect(brief.cards[0]).not.toHaveProperty('oracleText');
    expect((brief.cards[0] as { oracleTextPreview?: string }).oracleTextPreview?.length).toBe(120);
  });

  it('limits synergy example cards in brief mode', () => {
    const raw = {
      synergies: [
        {
          slug: 'tokens',
          name: 'Tokens',
          description: 'Go wide',
          exampleCards: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
        },
      ],
      commander: { name: 'Test' },
    };
    const slim = toBriefSynergiesResult(raw);
    expect((slim.synergies as Array<{ exampleCards: string[] }>)[0].exampleCards).toHaveLength(5);
  });

  it('omits guide markdown in brief strategy guide', () => {
    const slim = toBriefStrategyGuideResult({
      guideMarkdown: '# Long guide',
      preferredStrategy: 'tokens',
      summary: 'ok',
    });
    expect(slim.guideMarkdown).toBe('');
  });
});

describe('formatMcpToolJson build brief', () => {
  it('omits deck.cards array in brief build responses (use decklistText)', () => {
    const buildResult = {
      input: { commanderName: 'Test' },
      templateId: 'bracket3',
      bracketId: 'bracket3',
      deck: {
        commanderName: 'Test',
        cards: Array.from({ length: 99 }, (_, i) => ({
          name: `Card ${i}`,
          quantity: 1,
        })),
      },
      analysis: {
        commanderName: 'Test',
        totalCards: 99,
        uniqueCards: 99,
        categories: [],
        notes: [],
        bracketWarnings: [],
        bannedCards: [],
        banlistValid: true,
      },
      notes: [],
      decklistText: '1 Sol Ring\n1 Command Tower',
    } as BuildDeckResult;

    const parsed = JSON.parse(formatMcpToolJson(buildResult, 'brief')) as BuildDeckResult;

    expect(parsed.decklistText).toContain('Sol Ring');
    expect(parsed.deck.commanderName).toBe('Test');
    expect(parsed.deck.cards).toEqual([]);
  });
});
