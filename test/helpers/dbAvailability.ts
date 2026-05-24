/**
 * Database availability checks (no Vitest dependency — safe for scripts).
 */

import { existsSync } from 'fs';
import { join } from 'path';
import { isDatabaseReady, getCardCount } from '../../src/core/cardDatabase';

export const CARDS_DB_PATH = join(process.cwd(), 'data', 'cards.db');

export const CARDS_DB_SETUP_HINT =
  'Requires data/cards.db. Run: npm run db:create && npm run db:import';

export function hasCardsDatabase(): boolean {
  return existsSync(CARDS_DB_PATH) && isDatabaseReady();
}

export function skipIfNoDb(): boolean {
  return !hasCardsDatabase();
}

export function getDatabaseCardCount(): number {
  if (!hasCardsDatabase()) return 0;
  try {
    return getCardCount();
  } catch {
    return 0;
  }
}
