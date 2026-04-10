/**
 * importRulings.ts
 * 
 * Imports Scryfall rulings from a JSON file into SQLite database.
 * Uses streaming for large files and upsert logic to handle updates.
 * 
 * Rulings are linked to cards via oracle_id, which is shared across
 * all printings of the same card.
 * 
 * Usage: 
 *   npm run db:import-rulings                    # Default path
 *   npm run db:import-rulings /path/to/file.json # Custom path
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import { parser } from 'stream-json';
import { streamArray } from 'stream-json/streamers/StreamArray';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { chain } = require('stream-chain') as { chain: (streams: unknown[]) => Readable };

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'cards.db');
const DEFAULT_JSON_PATH = path.join(__dirname, '..', '..', 'data', 'rulings.json');

interface ScryfallRuling {
  object: string;
  oracle_id: string;
  source: string;
  published_at: string;
  comment: string;
}

async function importRulings(jsonPath: string): Promise<void> {
  // Check if database exists
  if (!fs.existsSync(DB_PATH)) {
    console.error(`Database not found at ${DB_PATH}`);
    console.error('Run createDatabase.ts first:');
    console.error('  npm run db:create');
    process.exit(1);
  }

  // Check if JSON file exists
  if (!fs.existsSync(jsonPath)) {
    console.error(`JSON file not found at ${jsonPath}`);
    process.exit(1);
  }

  const stats = fs.statSync(jsonPath);
  const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
  console.log(`Opening JSON file: ${jsonPath}`);
  console.log(`File size: ${fileSizeMB} MB`);
  console.log('');

  const db = new Database(DB_PATH);

  // Check if rulings table exists
  const tableExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='rulings'"
  ).get();

  if (!tableExists) {
    console.error('Rulings table does not exist. Run db:create first.');
    db.close();
    process.exit(1);
  }

  // Optimize for bulk inserts
  db.pragma('synchronous = OFF');
  db.pragma('journal_mode = MEMORY');
  db.pragma('cache_size = -64000'); // 64MB cache

  // Prepare insert statement with ON CONFLICT for upsert
  const insertStmt = db.prepare(`
    INSERT INTO rulings (oracle_id, source, published_at, comment)
    VALUES (@oracle_id, @source, @published_at, @comment)
    ON CONFLICT(oracle_id, published_at, comment) DO NOTHING
  `);

  let totalCount = 0;
  let insertedCount = 0;
  let skippedCount = 0;
  let batchCount = 0;
  const BATCH_SIZE = 1000;
  const startTime = Date.now();

  // Begin transaction
  db.exec('BEGIN TRANSACTION');

  return new Promise((resolve, reject) => {
    const pipeline = chain([
      fs.createReadStream(jsonPath),
      parser(),
      streamArray(),
    ]);

    pipeline.on('data', ({ value }: { value: ScryfallRuling }) => {
      try {
        const ruling = value;
        totalCount++;

        const result = insertStmt.run({
          oracle_id: ruling.oracle_id,
          source: ruling.source || 'wotc',
          published_at: ruling.published_at || null,
          comment: ruling.comment,
        });

        if (result.changes > 0) {
          insertedCount++;
        } else {
          skippedCount++;
        }

        batchCount++;

        // Commit and start new transaction every BATCH_SIZE rulings
        if (batchCount >= BATCH_SIZE) {
          db.exec('COMMIT');
          db.exec('BEGIN TRANSACTION');
          batchCount = 0;

          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          const rate = (totalCount / parseFloat(elapsed)).toFixed(0);
          process.stdout.write(
            `\rProcessed ${totalCount.toLocaleString()} rulings... ` +
            `(${insertedCount.toLocaleString()} new, ${skippedCount.toLocaleString()} existing) ` +
            `[${rate}/sec]`
          );
        }
      } catch (err) {
        console.error(`\nError processing ruling:`, err);
      }
    });

    pipeline.on('end', () => {
      // Commit final batch
      db.exec('COMMIT');

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const rate = (totalCount / parseFloat(elapsed)).toFixed(0);

      console.log(`\n`);
      console.log('='.repeat(60));
      console.log('Import completed successfully!');
      console.log('='.repeat(60));
      console.log(`Total rulings processed: ${totalCount.toLocaleString()}`);
      console.log(`New rulings inserted:    ${insertedCount.toLocaleString()}`);
      console.log(`Existing (skipped):      ${skippedCount.toLocaleString()}`);
      console.log(`Time elapsed:            ${elapsed} seconds`);
      console.log(`Average rate:            ${rate} rulings/second`);
      console.log('');

      // Get some stats
      const rulingCount = db.prepare('SELECT COUNT(*) as count FROM rulings').get() as { count: number };
      const uniqueCards = db.prepare('SELECT COUNT(DISTINCT oracle_id) as count FROM rulings').get() as { count: number };

      console.log('Database stats:');
      console.log(`  Total rulings in DB:   ${rulingCount.count.toLocaleString()}`);
      console.log(`  Cards with rulings:    ${uniqueCards.count.toLocaleString()}`);
      console.log('');

      // Optimize database after import
      console.log('Optimizing database...');
      db.exec('ANALYZE rulings');
      db.pragma('optimize');
      console.log('Done!');

      db.close();
      resolve();
    });

    pipeline.on('error', (err: Error) => {
      console.error('Stream error:', err);
      db.exec('ROLLBACK');
      db.close();
      reject(err);
    });
  });
}

// Run if called directly
if (require.main === module) {
  const jsonPath = process.argv[2] || DEFAULT_JSON_PATH;
  console.log('='.repeat(60));
  console.log('Scryfall Rulings Importer');
  console.log('='.repeat(60));
  console.log('');

  importRulings(jsonPath)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Import failed:', err);
      process.exit(1);
    });
}

export { importRulings };

