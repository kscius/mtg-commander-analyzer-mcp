/**
 * Vitest helpers for integration tests. See test/README.md and dbAvailability.ts.
 */

import { describe, it, type TestOptions } from 'vitest';
import { hasCardsDatabase } from './dbAvailability';

export {
  CARDS_DB_PATH,
  CARDS_DB_SETUP_HINT,
  hasCardsDatabase,
  skipIfNoDb,
  getDatabaseCardCount,
} from './dbAvailability';

/** Run describe block only when cards.db is present (checked at call time). */
export function describeDb(name: string, fn: () => void): void {
  if (hasCardsDatabase()) describe(name, fn);
  else describe.skip(name, fn);
}

type ItDbFn = () => void | Promise<void>;

/** Run it block only when cards.db is present (checked at call time). */
export function itDb(name: string, fn: ItDbFn): void;
export function itDb(name: string, options: TestOptions, fn: ItDbFn): void;
export function itDb(
  name: string,
  optionsOrFn: TestOptions | ItDbFn,
  maybeFn?: ItDbFn
): void {
  const run = hasCardsDatabase() ? it : it.skip;
  if (typeof optionsOrFn === 'function') {
    run(name, optionsOrFn);
    return;
  }
  run(name, optionsOrFn, maybeFn!);
}
