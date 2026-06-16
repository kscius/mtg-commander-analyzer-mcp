import { describe, expect, it } from 'vitest';
import {
  benchmarkHasHardFailures,
  formatBenchmarkHardFailures,
  type BenchmarkRow,
} from './benchmarkGate';

function row(overrides: Partial<BenchmarkRow> = {}): BenchmarkRow {
  return {
    commander: 'Test Commander',
    buildMs: 100,
    mainboardCards: 99,
    synergyScore: 50,
    buildQuality: 'acceptable',
    converged: true,
    readyToShip: false,
    categoriesBelow: 2,
    lintHardIssues: 0,
    banlistValid: true,
    ...overrides,
  };
}

describe('benchmarkHasHardFailures', () => {
  it('returns false for soft quality gaps only', () => {
    expect(benchmarkHasHardFailures([row({ readyToShip: false, categoriesBelow: 3 })])).toBe(
      false
    );
  });

  it('returns true on build error', () => {
    expect(benchmarkHasHardFailures([row({ error: 'Commander not found' })])).toBe(true);
  });

  it('returns true when mainboard is not 99 cards', () => {
    expect(benchmarkHasHardFailures([row({ mainboardCards: 98 })])).toBe(true);
  });

  it('returns true when banlist fails', () => {
    expect(benchmarkHasHardFailures([row({ banlistValid: false })])).toBe(true);
  });

  it('returns true on hard lint issues', () => {
    expect(benchmarkHasHardFailures([row({ lintHardIssues: 1 })])).toBe(true);
  });
});

describe('formatBenchmarkHardFailures', () => {
  it('lists each hard failure with commander label', () => {
    const messages = formatBenchmarkHardFailures([
      row({ commander: 'Shadrix', preferredStrategy: 'group-slug', mainboardCards: 98 }),
      row({ commander: 'Talrand', error: 'timeout' }),
    ]);
    expect(messages).toEqual([
      'Shadrix [group-slug]: expected 99 mainboard cards, got 98',
      'Talrand: build error — timeout',
    ]);
  });
});
