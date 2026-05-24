import { describe, expect, it } from 'vitest';
import { runGetCategoryCandidates } from './getCategoryCandidatesTool';
import { hasCardsDatabase } from '../../test/helpers/dbAvailability';

describe('runGetCategoryCandidates', () => {
  it('returns candidates for ramp in mono-green colors', async () => {
    if (!hasCardsDatabase()) return;

    const result = await runGetCategoryCandidates({
      commanderName: 'Llanowar Elves',
      category: 'ramp',
      limit: 5,
    });

    expect(result.databaseReady).toBe(true);
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates.every((c) => c.primaryCategory === 'ramp')).toBe(true);
  });

  it('requires commander in database', async () => {
    if (!hasCardsDatabase()) return;

    const result = await runGetCategoryCandidates({
      commanderName: 'Totally Fake Commander XYZ',
      category: 'ramp',
    });
    expect(result.candidates).toHaveLength(0);
    expect(result.error).toBeDefined();
  });
});
