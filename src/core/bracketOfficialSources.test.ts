import { describe, expect, it } from 'vitest';
import {
  getMoxfieldBracketsUrl,
  loadBracket3PolicyReference,
  loadBracketOfficialSources,
} from './bracketOfficialSources';

describe('bracketOfficialSources', () => {
  it('loads official sources with Moxfield URL', () => {
    const sources = loadBracketOfficialSources();
    expect(sources.sources.some((s) => s.url.includes('moxfield.com/commanderbrackets'))).toBe(
      true
    );
    expect(sources.maintenance.command).toContain('brackets:check-official');
  });

  it('policy reference states fast mana is not prohibited in Bracket 3', () => {
    const policy = loadBracket3PolicyReference();
    expect(policy.fastMana.prohibitedInBracket3).toBe(false);
    expect(policy.fastMana.solRing.isGameChanger).toBe(false);
    expect(policy.hardLimits.maxGameChangers).toBe(3);
  });

  it('getMoxfieldBracketsUrl matches registry', () => {
    expect(getMoxfieldBracketsUrl()).toBe('https://moxfield.com/commanderbrackets');
  });
});
