import { describe, expect, it } from 'vitest';
import { buildFtsPrefixQuery } from './cardDatabase';

describe('buildFtsPrefixQuery', () => {
  it('wraps normal card-name tokens as FTS5 prefix phrases', () => {
    expect(buildFtsPrefixQuery('Sol Ring')).toBe('"Sol"* "Ring"*');
    expect(buildFtsPrefixQuery('  Cultivate  ')).toBe('"Cultivate"*');
  });

  it('strips quote characters that would break out of FTS phrase quoting', () => {
    // Before sanitization, wrapping `"${t}"*` let embedded " close the phrase early.
    expect(buildFtsPrefixQuery('foo" OR bar')).toBe('"foo"* "OR"* "bar"*');
    expect(buildFtsPrefixQuery('"Sol Ring"')).toBe('"Sol"* "Ring"*');
  });

  it('strips FTS operators / punctuation other than word chars, space, apostrophe, comma, hyphen', () => {
    expect(buildFtsPrefixQuery('Rhystic*(Study)')).toBe('"Rhystic"* "Study"*');
    expect(buildFtsPrefixQuery("Urza's Saga")).toBe('"Urza\'s"* "Saga"*');
  });

  it('drops single-character tokens and returns empty when nothing usable remains', () => {
    expect(buildFtsPrefixQuery('a b')).toBe('');
    expect(buildFtsPrefixQuery('"""')).toBe('');
    expect(buildFtsPrefixQuery('   ')).toBe('');
  });
});
