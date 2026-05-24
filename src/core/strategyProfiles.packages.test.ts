import { describe, expect, it } from 'vitest';
import { listStrategyPackageCardNames } from './strategyProfiles';

describe('listStrategyPackageCardNames', () => {
  it('returns token package cards for tokens slug', () => {
    const names = listStrategyPackageCardNames('tokens');
    expect(names).toContain('Anointed Procession');
    expect(names.length).toBeGreaterThan(2);
  });

  it('returns empty for unknown slug', () => {
    expect(listStrategyPackageCardNames('not-a-real-slug')).toEqual([]);
  });
});
