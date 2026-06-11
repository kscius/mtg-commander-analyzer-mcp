import { describe, expect, it } from 'vitest';
import { buildBuildQualityReport, buildSuggestedUpgrades } from './buildQualityReport';
import type { CategorySummary, DeckAnalysis, DeckRecommendations, LintReport } from './types';

function minimalAnalysis(overrides: Partial<DeckAnalysis> = {}): DeckAnalysis {
  const categories: CategorySummary[] = [
    { name: 'lands', count: 36, min: 35, max: 38, status: 'within' },
    { name: 'ramp', count: 10, min: 9, max: 12, status: 'within' },
    { name: 'card_draw', count: 9, min: 8, max: 11, status: 'within' },
  ];
  const lintReport: LintReport = {
    ok: true,
    issues: [],
    metrics: { land_count: 36 },
  };
  return {
    commanderName: 'Test Commander',
    totalCards: 99,
    uniqueCards: 99,
    categories,
    notes: [],
    bracketWarnings: [],
    bannedCards: [],
    banlistValid: true,
    lintReport,
    synergyScore: 65,
    ...overrides,
  };
}

describe('buildBuildQualityReport', () => {
  it('rates a clean deck as strong', () => {
    const report = buildBuildQualityReport(minimalAnalysis());
    expect(report.overall).toBe('strong');
    expect(report.categoryGaps).toHaveLength(0);
    expect(report.categoryOverflows).toHaveLength(0);
    expect(report.banlistOk).toBe(true);
    expect(report.compromises).toHaveLength(0);
  });

  it('maps below/above categories into gaps and overflows', () => {
    const categories: CategorySummary[] = [
      { name: 'card_draw', count: 6, min: 8, max: 11, status: 'below' },
      { name: 'lands', count: 40, min: 35, max: 38, status: 'above' },
    ];
    const report = buildBuildQualityReport(minimalAnalysis({ categories }));
    expect(report.categoryGaps).toEqual([
      { category: 'card_draw', count: 6, min: 8, deficit: 2 },
    ]);
    expect(report.categoryOverflows).toEqual([
      { category: 'lands', count: 40, max: 38, excess: 2 },
    ]);
    expect(report.compromises).toEqual(
      expect.arrayContaining([
        'Under-filled categories: card_draw',
        'Over-filled categories: lands',
      ])
    );
  });

  it('rates acceptable when one category gap remains', () => {
    const categories: CategorySummary[] = [
      { name: 'card_draw', count: 7, min: 8, max: 11, status: 'below' },
      { name: 'ramp', count: 10, min: 9, max: 12, status: 'within' },
    ];
    const report = buildBuildQualityReport(minimalAnalysis({ categories }));
    expect(report.overall).toBe('acceptable');
  });

  it('rates acceptable for low synergy without category gaps', () => {
    const report = buildBuildQualityReport(minimalAnalysis({ synergyScore: 50 }));
    expect(report.overall).toBe('acceptable');
    expect(report.synergyScore).toBe(50);
  });

  it('rates acceptable for a single Bracket warning', () => {
    const report = buildBuildQualityReport(
      minimalAnalysis({ bracketWarnings: ['Game Changer cap reached'] })
    );
    expect(report.overall).toBe('acceptable');
    expect(report.bracketIssueCount).toBe(1);
    expect(report.compromises).toContain('1 Bracket 3 warning(s) remain');
  });

  it('rates needs_work when banlist fails', () => {
    const report = buildBuildQualityReport(
      minimalAnalysis({ banlistValid: false, bannedCards: ['Mana Crypt'] })
    );
    expect(report.overall).toBe('needs_work');
    expect(report.banlistOk).toBe(false);
  });

  it('rates needs_work when three or more categories are below minimum', () => {
    const categories: CategorySummary[] = [
      { name: 'card_draw', count: 5, min: 8, max: 11, status: 'below' },
      { name: 'ramp', count: 6, min: 9, max: 12, status: 'below' },
      { name: 'spot_removal', count: 2, min: 4, max: 7, status: 'below' },
    ];
    const report = buildBuildQualityReport(minimalAnalysis({ categories }));
    expect(report.overall).toBe('needs_work');
  });

  it('rates needs_work when more than two Bracket warnings remain', () => {
    const report = buildBuildQualityReport(
      minimalAnalysis({
        bracketWarnings: ['warn-a', 'warn-b', 'warn-c'],
      })
    );
    expect(report.overall).toBe('needs_work');
    expect(report.bracketIssueCount).toBe(3);
  });

  it('records hard lint issues in compromises', () => {
    const lintReport: LintReport = {
      ok: false,
      issues: [{ key: 'format:deck_size', severity: 'hard', message: 'Wrong size' }],
      metrics: {},
    };
    const report = buildBuildQualityReport(minimalAnalysis({ lintReport }));
    expect(report.compromises).toContain('Template lint has hard issues');
  });
});

describe('buildSuggestedUpgrades', () => {
  const recommendations: DeckRecommendations = {
    cuts: [],
    adds: [
      { name: 'Rhystic Study', reason: 'Repeatable draw', category: 'card_draw' },
      { name: '(use search_cards)', reason: 'Placeholder add', category: 'ramp' },
    ],
    swaps: [
      {
        remove: 'Divination',
        add: 'Phyrexian Arena',
        reason: 'Upgrade draw',
        category: 'card_draw',
      },
      {
        remove: 'Cultivate',
        add: '(use search_cards)',
        reason: 'Placeholder swap',
        category: 'ramp',
      },
    ],
    prioritizedActions: [],
  };

  it('skips search_cards placeholders from adds and swaps', () => {
    const upgrades = buildSuggestedUpgrades(minimalAnalysis(), recommendations);
    expect(upgrades.map((u) => u.name)).toEqual(['Rhystic Study', 'Phyrexian Arena']);
    expect(upgrades[0]).toMatchObject({
      name: 'Rhystic Study',
      reason: 'Repeatable draw',
      category: 'card_draw',
      priority: 1,
    });
    expect(upgrades[1]).toMatchObject({
      name: 'Phyrexian Arena',
      category: 'card_draw',
      priority: 2,
    });
  });

  it('caps explicit upgrades at ten items', () => {
    const manyAdds = Array.from({ length: 12 }, (_, i) => ({
      name: `Card ${i}`,
      reason: `reason ${i}`,
      category: 'ramp',
    }));
    const upgrades = buildSuggestedUpgrades(minimalAnalysis(), {
      cuts: [],
      adds: manyAdds,
      swaps: [],
      prioritizedActions: [],
    });
    expect(upgrades).toHaveLength(10);
    expect(upgrades[0]?.priority).toBe(1);
    expect(upgrades[9]?.priority).toBe(10);
  });

  it('backfills below categories with search_cards hints when few upgrades exist', () => {
    const categories: CategorySummary[] = [
      { name: 'card_draw', count: 6, min: 8, max: 11, status: 'below' },
      { name: 'ramp', count: 7, min: 9, max: 12, status: 'below' },
    ];
    const upgrades = buildSuggestedUpgrades(
      minimalAnalysis({ categories }),
      { cuts: [], adds: [], swaps: [], prioritizedActions: [] }
    );
    expect(upgrades.length).toBeGreaterThanOrEqual(2);
    expect(upgrades.every((u) => u.name === '(use search_cards)')).toBe(true);
    expect(upgrades[0]?.reason).toContain('card_draw');
    expect(upgrades[1]?.reason).toContain('ramp');
  });

  it('does not backfill when five or more explicit upgrades exist', () => {
    const manyAdds = Array.from({ length: 5 }, (_, i) => ({
      name: `Upgrade ${i}`,
      reason: `reason ${i}`,
      category: 'ramp',
    }));
    const categories: CategorySummary[] = [
      { name: 'card_draw', count: 6, min: 8, max: 11, status: 'below' },
    ];
    const upgrades = buildSuggestedUpgrades(
      minimalAnalysis({ categories }),
      { cuts: [], adds: manyAdds, swaps: [], prioritizedActions: [] }
    );
    expect(upgrades).toHaveLength(5);
    expect(upgrades.every((u) => u.name.startsWith('Upgrade'))).toBe(true);
  });
});
