import * as path from 'path';
import { describe, expect, it } from 'vitest';
import {
  USER_DECK_LIBRARY_DIR,
  assertNotUserDeckLibraryWrite,
} from './userDeckPaths';

describe('userDeckPaths', () => {
  it('blocks writes directly to the user deck library directory', () => {
    expect(() => assertNotUserDeckLibraryWrite(USER_DECK_LIBRARY_DIR)).toThrow(
      /Refusing to write generated deck to user import library/
    );
  });

  it('blocks writes to nested paths under data/my_decks', () => {
    const nested = path.join(USER_DECK_LIBRARY_DIR, 'some-commander', 'deck.txt');
    expect(() => assertNotUserDeckLibraryWrite(nested)).toThrow(/read-only reference data/);
  });

  it('allows writes outside the user deck library', () => {
    expect(() =>
      assertNotUserDeckLibraryWrite(path.join('/tmp', 'generated-deck.txt'))
    ).not.toThrow();
  });
});
