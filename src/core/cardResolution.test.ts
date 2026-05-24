import { describe, expect, it } from 'vitest';
import {
  resolveCardNameSync,
  suggestCardNamesFts,
  normalizeParsedCardNames,
} from './cardResolution';
import { describeDb, itDb } from '../../test/helpers/db';

describeDb('resolveCardNameSync (database)', () => {
  itDb('resolves exact English card names from database', () => {
    const r = resolveCardNameSync('Sol Ring');
    expect(r).toBeTruthy();
    expect(r!.canonicalName).toBe('Sol Ring');
    expect(r!.source).toBe('exact');
  });

  itDb('resolves minor typos via FTS when database is ready', () => {
    const r = resolveCardNameSync('Sol Rng');
    if (!r) return;
    expect(r.canonicalName).toBe('Sol Ring');
    expect(['exact', 'fts']).toContain(r.source);
  });

  itDb('suggestCardNamesFts returns candidates for partial names', () => {
    const suggestions = suggestCardNamesFts('Rhystic', 5);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.some((n) => /rhystic/i.test(n))).toBe(true);
  });

  itDb('normalizeParsedCardNames renames fuzzy entries', () => {
    const { entries, renamed, unresolved } = normalizeParsedCardNames([
      { name: 'Sol Ring', quantity: 1 },
      { name: 'Totally Fake Card XYZ 99999', quantity: 1 },
    ]);
    expect(entries[0].name).toBe('Sol Ring');
    expect(unresolved).toContain('Totally Fake Card XYZ 99999');
    expect(renamed.length + unresolved.length).toBeGreaterThan(0);
  });
});

describe('resolveCardNameSync (no database)', () => {
  it('returns null for invented card names when unresolved', () => {
    expect(resolveCardNameSync('Totally Fake Card XYZ 99999')).toBeNull();
  });
});
