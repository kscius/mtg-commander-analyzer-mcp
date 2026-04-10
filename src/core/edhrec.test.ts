import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  extractEdhrecSuggestionsFromJson,
  commanderNameToSlug,
  sortBySynergy,
  getThemesForCommander,
  getCombosForCommander,
  clearEdhrecCache,
} from './edhrec';

function loadFixture(name: string): unknown {
  const p = join(process.cwd(), 'data', 'edhrec_structures', name);
  return JSON.parse(readFileSync(p, 'utf-8')) as unknown;
}

describe('extractEdhrecSuggestionsFromJson', () => {
  it('parses minimal container.json_dict.cardlists fixture', () => {
    const json = loadFixture('top-color-sample.json');
    const rows = extractEdhrecSuggestionsFromJson(json, 'top/white');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].name).toBe('Sol Ring');
    expect(rows[0].rank).toBe(1);
    expect(rows[0].inclusionRate).toBeCloseTo(0.99, 5);
    expect(rows[0].category).toBe('top/white');
  });

  it('maps inclusion to inclusionRate and keeps rank separate from percent inclusion', () => {
    const json = loadFixture('top-color-rich-sample.json');
    const rows = extractEdhrecSuggestionsFromJson(json, 'test');
    const sol = rows.find((r) => r.name === 'Sol Ring');
    expect(sol?.inclusionRate).toBeCloseTo(0.99, 5);
    expect(sol?.rank).toBe(1);
    expect(sol?.saltScore).toBe(0.4);
    expect(sol?.synergyScore).toBe(0.85);
    expect(sol?.numDecks).toBe(120000);
    expect(sol?.label).toBe('Staple');

    const crypt = rows.find((r) => r.name === 'Mana Crypt');
    expect(crypt?.inclusionRate).toBeCloseTo(0.95, 5);
    expect(crypt?.rank).toBe(2);

    const noRank = rows.find((r) => r.name === 'No Rank Card');
    expect(noRank?.rank).toBe(3);
    expect(noRank?.saltScore).toBe(0);
    expect(noRank?.synergyScore).toBe(-0.1);
  });

  it('handles direct cardviews array', () => {
    const json = {
      cardviews: [{ name: 'A', rank: 10 }, { name: 'B' }],
    };
    const rows = extractEdhrecSuggestionsFromJson(json, 'x');
    expect(rows[0].rank).toBe(10);
    expect(rows[1].rank).toBe(2);
  });

  it('parses top-level cards array fixture', () => {
    const json = loadFixture('top-cards-root-sample.json');
    const rows = extractEdhrecSuggestionsFromJson(json, 'cards-root');
    expect(rows.map((r) => r.name)).toEqual(['Root Cards A', 'Root Cards B']);
    expect(rows[0].inclusionRate).toBeCloseTo(0.88, 5);
    expect(rows[0].category).toBe('cards-root');
  });
});

describe('commanderNameToSlug', () => {
  it('normalizes typical commander names', () => {
    expect(commanderNameToSlug("Atraxa, Praetors' Voice")).toBe('atraxa-praetors-voice');
  });
});

describe('sortBySynergy', () => {
  it('orders by synergy descending', () => {
    const sorted = sortBySynergy([
      { name: 'a', synergyScore: 0.1 },
      { name: 'b', synergyScore: 0.9 },
      { name: 'c' },
    ]);
    expect(sorted.map((s) => s.name).join(',')).toBe('b,a,c');
  });
});

function mockFetchReturningJson(data: unknown): void {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => data,
  } as Response);
}

describe('getThemesForCommander (fixture-backed fetch)', () => {
  beforeEach(() => {
    clearEdhrecCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads themes from panels', async () => {
    mockFetchReturningJson(loadFixture('commander-themes-panels-sample.json'));
    const themes = await getThemesForCommander('any-slug');
    expect(themes).toHaveLength(2);
    expect(themes[0]).toMatchObject({ name: 'Tokens', slug: 'tokens', count: 4521 });
    expect(themes[1]).toMatchObject({ name: '+1/+1 Counters', slug: '11-counters', count: 1200 });
  });

  it('reads themes from header when panels omit themes', async () => {
    mockFetchReturningJson(loadFixture('commander-themes-header-sample.json'));
    const themes = await getThemesForCommander('any-slug');
    expect(themes).toHaveLength(2);
    expect(themes[0]).toMatchObject({ name: 'Artifacts', slug: 'artifacts', count: 800 });
    expect(themes[1]).toMatchObject({ name: 'Voltron', slug: 'voltron', count: 300 });
  });
});

describe('getCombosForCommander (fixture-backed fetch)', () => {
  beforeEach(() => {
    clearEdhrecCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('parses combo cardlists and skips single-card lists', async () => {
    mockFetchReturningJson(loadFixture('combos-sample.json'));
    const combos = await getCombosForCommander('any-slug');
    expect(combos).toHaveLength(1);
    expect(combos[0].cards).toEqual(['Basalt Monolith', 'Rings of Brighthearth']);
    expect(combos[0].description).toBe('Example combo');
    expect(combos[0].colorIdentity).toEqual(['G', 'U']);
  });
});
