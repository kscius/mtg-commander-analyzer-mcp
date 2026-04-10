/**
 * tagCards.ts
 *
 * Populates the local categorization store: for each card (by oracle_id),
 * runs autoTags and writes tags to the cards.tags column.
 *
 * Usage:
 *   npm run db:tag
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { findCardByOracleId, getAllOracleIds } from '../core/cardDatabase';
import { autoTags, getDefaultBracket3Options, ScryCard } from '../core/autoTags';

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'cards.db');

async function runTagCards(): Promise<void> {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`Database not found at ${DB_PATH}`);
    console.error('Run: npm run db:create && npm run db:import');
    process.exit(1);
  }

  const opts = getDefaultBracket3Options('bracket3');
  const oracleIds = getAllOracleIds();
  console.log(`Tagging ${oracleIds.length} unique cards (by oracle_id)...`);

  const db = new Database(DB_PATH);
  const updateStmt = db.prepare('UPDATE cards SET tags = ? WHERE oracle_id = ?');

  let done = 0;
  const start = Date.now();

  for (const oracleId of oracleIds) {
    const card = findCardByOracleId(oracleId);
    if (!card) continue;

    const scryCard: ScryCard = {
      name: card.name,
      oracle_text: card.oracle_text ?? undefined,
      type_line: card.type_line ?? undefined,
      mana_cost: card.mana_cost ?? undefined,
      cmc: card.cmc ?? undefined,
      all_parts: Array.isArray(card.all_parts) ? card.all_parts as { component?: string; name?: string; id?: string }[] : undefined,
    };

    const tags = autoTags(scryCard, opts);
    const tagsJson = JSON.stringify(tags);
    updateStmt.run(tagsJson, oracleId);
    done++;
    if (done % 5000 === 0) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      const rate = (done / parseFloat(elapsed)).toFixed(0);
      process.stdout.write(`\r  ${done.toLocaleString()} / ${oracleIds.length} (${rate}/s)`);
    }
  }

  db.close();

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\nDone. Tagged ${done} cards in ${elapsed}s.`);
}

runTagCards()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
