import { describe, expect, it } from 'vitest';
import {
  formatAuxiliaryMcpJson,
  toBriefStrategyGuideResult,
  toBriefSynergiesResult,
} from './mcpResponseFormat';

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
