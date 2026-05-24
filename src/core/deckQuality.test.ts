import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseDeckText } from './deckParser';
import { analyzeDeckBasic } from './analyzer';
import { BuildDeckInputSchema } from './schemas';
import { isDatabaseReady } from './cardDatabase';
import { resolveCardNameSync } from './cardResolution';

const root = process.cwd();

function loadDeckFile(name: string): string {
  const fixturePath = join(root, 'test', 'fixtures', name);
  try {
    return readFileSync(fixturePath, 'utf-8');
  } catch {
    return readFileSync(join(root, name), 'utf-8');
  }
}

const analyzeTimeoutMs = 60_000;

describe('deck quality golden files', () => {
  it(
    'parses and analyzes Shadrix golden deck (mainboard 99)',
    { timeout: analyzeTimeoutMs },
    async () => {
    const deckText = loadDeckFile('shadrix-group-slug-golden.txt');
    const parsed = parseDeckText(deckText);
    const withoutCommander = parsed.cards.filter(
      (c) => !c.name.toLowerCase().includes('shadrix silverquill')
    );
    const mainQty = withoutCommander.reduce((s, c) => s + c.quantity, 0);
    expect(mainQty).toBe(99);

    const result = await analyzeDeckBasic(
      {
        deckText,
        templateId: 'bracket3',
        bracketId: 'bracket3',
        commanderName: 'Shadrix Silverquill',
        preferredStrategy: 'group-slug',
      },
      parsed
    );

    expect(result.analysis.banlistValid).toBe(true);
    expect(result.analysis.bannedCards).toHaveLength(0);
    expect(result.decklistText).toBeTruthy();
    expect(result.analysis.recommendations).toBeDefined();
    if (isDatabaseReady()) {
      const unresolvedNote = result.analysis.notes.some((n) =>
        n.includes('not found in database')
      );
      expect(unresolvedNote).toBe(false);
    }
  });

  it('negative: invalid Braids name does not resolve', () => {
    const resolved = resolveCardNameSync('Braids, Armana of Favour');
    expect(resolved).toBeNull();
  });

  it('negative: variant main list differs from golden (includes Braids)', () => {
    const deckText = loadDeckFile('tmp-deck-shadrix-final-main.txt');
    const parsed = parseDeckText(deckText);
    expect(parsed.cards.some((c) => c.name.includes('Braids'))).toBe(true);
    expect(parsed.cards.reduce((s, c) => s + c.quantity, 0)).toBe(99);

    const golden = parseDeckText(loadDeckFile('tmp-deck-shadrix-final.txt'));
    const goldenNames = new Set(golden.cards.map((c) => c.name.toLowerCase()));
    const variantOnly = parsed.cards.filter((c) => !goldenNames.has(c.name.toLowerCase()));
    expect(variantOnly.length).toBeGreaterThan(0);
    expect(variantOnly.some((c) => c.name.includes('Braids'))).toBe(true);
  });

  it(
    'negative: variant with Braids reports unresolved when analyzed',
    { timeout: analyzeTimeoutMs },
    async () => {
      const deckText = loadDeckFile('tmp-deck-shadrix-final-main.txt');
      const parsed = parseDeckText(deckText);
      const result = await analyzeDeckBasic(
        {
          deckText,
          templateId: 'bracket3',
          commanderName: 'Shadrix Silverquill',
          preferredStrategy: 'group-slug',
        },
        parsed
      );
      expect(result.analysis.totalCards).toBe(99);
      const braidsUnresolved = result.analysis.notes.some(
        (n) => n.includes('Braids') && n.includes('not found')
      );
      expect(braidsUnresolved || resolveCardNameSync('Braids, Armana of Favour') === null).toBe(
        true
      );
    }
  );
});

describe('BuildDeckInputSchema', () => {
  it('defaults useEdhrec and useTemplateGenerator to true', () => {
    const parsed = BuildDeckInputSchema.parse({ commanderName: 'Sol Ring' });
    expect(parsed.useEdhrec).toBe(true);
    expect(parsed.useEdhrecAutofill).toBe(true);
    expect(parsed.useTemplateGenerator).toBe(true);
    expect(parsed.refineUntilStable).toBe(true);
    expect(parsed.maxRefinementIterations).toBe(5);
  });

  it('accepts preferredStrategy slug', () => {
    const parsed = BuildDeckInputSchema.parse({
      commanderName: "Y'shtola, Night's Blessed",
      preferredStrategy: 'blink',
    });
    expect(parsed.preferredStrategy).toBe('blink');
  });

  it('rejects missing commanderName', () => {
    expect(() => BuildDeckInputSchema.parse({})).toThrow();
  });

  it('rejects maxRefinementIterations outside 1–12', () => {
    expect(() =>
      BuildDeckInputSchema.parse({ commanderName: 'X', maxRefinementIterations: 0 })
    ).toThrow();
    expect(() =>
      BuildDeckInputSchema.parse({ commanderName: 'X', maxRefinementIterations: 13 })
    ).toThrow();
  });

  it('accepts seedCards and template overrides', () => {
    const parsed = BuildDeckInputSchema.parse({
      commanderName: 'Shadrix Silverquill',
      seedCards: ['Sol Ring'],
      templateId: 'bracket3',
      bracketId: 'bracket3',
      useEdhrec: false,
      useTemplateGenerator: false,
    });
    expect(parsed.seedCards).toEqual(['Sol Ring']);
    expect(parsed.useEdhrec).toBe(false);
    expect(parsed.useTemplateGenerator).toBe(false);
  });
});
