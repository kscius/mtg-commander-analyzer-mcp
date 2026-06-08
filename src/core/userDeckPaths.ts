/**
 * Read-only user deck library under data/my_decks (Moxfield imports).
 * Generated decks must never be written here — use agent output / decklistText only.
 */

import * as path from 'path';

export const USER_DECK_LIBRARY_DIR = path.join(__dirname, '..', '..', 'data', 'my_decks');

export const USER_DECK_INDEX_FILE = 'index.json';

/** Paths that must never receive generated deck output. */
export const USER_DECK_WRITE_BLOCKED_DIRS = [USER_DECK_LIBRARY_DIR] as const;

/**
 * Throws if a write target would land inside the user import library.
 */
export function assertNotUserDeckLibraryWrite(targetPath: string): void {
  const normalized = path.resolve(targetPath);
  for (const blocked of USER_DECK_WRITE_BLOCKED_DIRS) {
    const blockedResolved = path.resolve(blocked);
    if (normalized === blockedResolved || normalized.startsWith(blockedResolved + path.sep)) {
      throw new Error(
        `Refusing to write generated deck to user import library: ${targetPath}. ` +
          'data/my_decks is read-only reference data from Moxfield.'
      );
    }
  }
}
