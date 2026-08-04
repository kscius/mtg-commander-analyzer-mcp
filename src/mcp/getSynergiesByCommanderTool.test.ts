import { beforeEach, describe, expect, it, vi } from 'vitest';

const detectSynergiesForCommander = vi.fn();

vi.mock('../core/synergyDetector', () => ({
  detectSynergiesForCommander: (...args: unknown[]) => detectSynergiesForCommander(...args),
}));

import { runGetSynergies } from './getSynergiesByCommanderTool';

describe('runGetSynergies', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects missing commanderName via Zod', async () => {
    await expect(runGetSynergies({})).rejects.toThrow();
  });

  it('returns summary listing synergy slugs', async () => {
    detectSynergiesForCommander.mockResolvedValue({
      commander: { name: 'Krenko, Mob Boss', colorIdentity: ['R'], abilities: 'tokens' },
      synergies: [
        { slug: 'tokens', name: 'Tokens', description: 'd', exampleCards: [], source: 'edhrec' },
        { slug: 'aristocrats', name: 'Aristocrats', description: 'd', exampleCards: [], source: 'edhrec' },
      ],
      recommendedStrategy: 'tokens',
    });

    const result = await runGetSynergies({ commanderName: 'Krenko, Mob Boss' });

    expect(detectSynergiesForCommander).toHaveBeenCalledWith('Krenko, Mob Boss');
    expect(result.summary).toMatch(/Found 2 synergies for Krenko, Mob Boss/);
    expect(result.summary).toMatch(/tokens, aristocrats/);
    expect(result.recommendedStrategy).toBe('tokens');
  });

  it('steers agents to confirm recommendedStrategy before build', async () => {
    detectSynergiesForCommander.mockResolvedValue({
      commander: { name: 'Krenko, Mob Boss', colorIdentity: ['R'], abilities: 'tokens' },
      synergies: [
        { slug: 'tokens', name: 'Tokens', description: 'd', exampleCards: [], source: 'edhrec' },
      ],
      recommendedStrategy: 'tokens',
    });

    const result = await runGetSynergies({ commanderName: 'Krenko, Mob Boss' });

    expect(result.nextSuggestedAction).toMatch(/confirm slug "tokens"/);
    expect(result.nextSuggestedAction).toMatch(/get_strategy_guide/);
    expect(result.nextSuggestedAction).toMatch(/build_deck_from_commander/);
  });

  it('asks the user to pick a slug when no recommendedStrategy is available', async () => {
    detectSynergiesForCommander.mockResolvedValue({
      commander: { name: 'Gisela, the Broken Blade', colorIdentity: ['W'], abilities: '' },
      synergies: [],
      recommendedStrategy: undefined,
    });

    const result = await runGetSynergies({ commanderName: 'Gisela, the Broken Blade' });

    expect(result.summary).toMatch(/Found 0 synergies/);
    expect(result.nextSuggestedAction).toMatch(/pick one synergy slug/);
    expect(result.nextSuggestedAction).toMatch(/get_strategy_guide/);
  });
});
