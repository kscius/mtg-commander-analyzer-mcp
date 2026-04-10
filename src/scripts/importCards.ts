/**
 * importCards.ts
 * 
 * Imports Scryfall cards from a large JSON file using streaming.
 * This script can handle files of any size (2GB+) without running out of memory.
 * 
 * Key design:
 * - Uses `id` as the unique identifier (each card printing has a unique id)
 * - Uses INSERT OR REPLACE for upsert behavior (updates existing, inserts new)
 * - Tracks `updated_at` timestamp for change tracking
 * 
 * Usage: 
 *   npm run db:import                    # Default path: data/oracle-cards.json
 *   npm run db:import /path/to/file.json # Custom path
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
const DEFAULT_JSON_PATH = path.join(__dirname, '..', '..', 'data', 'oracle-cards.json');

interface ScryfallCard {
  id: string;
  oracle_id?: string;
  name: string;
  lang?: string;
  mana_cost?: string;
  cmc?: number;
  type_line?: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  defense?: string;
  colors?: string[];
  color_identity?: string[];
  color_indicator?: string[];
  keywords?: string[];
  produced_mana?: string[];
  released_at?: string;
  layout?: string;
  rarity?: string;
  set?: string;
  set_name?: string;
  collector_number?: string;
  reserved?: boolean;
  foil?: boolean;
  nonfoil?: boolean;
  oversized?: boolean;
  promo?: boolean;
  reprint?: boolean;
  variation?: boolean;
  digital?: boolean;
  full_art?: boolean;
  textless?: boolean;
  booster?: boolean;
  story_spotlight?: boolean;
  finishes?: string[];
  games?: string[];
  legalities?: Record<string, string>;
  prices?: Record<string, string | null>;
  image_uris?: Record<string, string>;
  card_faces?: unknown[];
  all_parts?: unknown[];
  related_uris?: Record<string, string>;
  purchase_uris?: Record<string, string>;
  uri?: string;
  scryfall_uri?: string;
  rulings_uri?: string;
  prints_search_uri?: string;
  artist?: string;
  artist_ids?: string[];
  illustration_id?: string;
  border_color?: string;
  frame?: string;
  frame_effects?: string[];
  security_stamp?: string;
  preview?: unknown;
  flavor_text?: string;
  edhrec_rank?: number;
  penny_rank?: number;
  arena_id?: number;
  mtgo_id?: number;
  mtgo_foil_id?: number;
  tcgplayer_id?: number;
  cardmarket_id?: number;
  multiverse_ids?: number[];
}

function jsonStringify(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}

function boolToInt(value: boolean | undefined): number {
  return value ? 1 : 0;
}

async function importCards(jsonPath: string): Promise<void> {
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

  // Get current card count before import
  let existingCount = 0;
  try {
    const result = db.prepare('SELECT COUNT(*) as count FROM cards').get() as { count: number };
    existingCount = result.count;
    console.log(`Existing cards in database: ${existingCount.toLocaleString()}`);
  } catch {
    console.log('Cards table is empty or new');
  }

  // Optimize for bulk inserts
  db.pragma('synchronous = OFF');
  db.pragma('journal_mode = MEMORY');
  db.pragma('cache_size = -64000'); // 64MB cache

  // Check if card exists (to track new vs updated)
  const checkExistsStmt = db.prepare('SELECT 1 FROM cards WHERE id = ?');

  // Prepare insert/update statement using id as unique key
  // INSERT OR REPLACE will:
  // - Insert new cards (new id)
  // - Replace existing cards (same id) with new data
  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO cards (
      id, oracle_id, name, lang,
      mana_cost, cmc, type_line, oracle_text,
      power, toughness, loyalty, defense,
      colors, color_identity, color_indicator,
      keywords, produced_mana,
      released_at, layout, rarity, set_code, set_name, collector_number,
      reserved, foil, nonfoil, oversized, promo, reprint,
      variation, digital, full_art, textless, booster, story_spotlight,
      finishes, games, legalities, prices, image_uris,
      card_faces, all_parts, related_uris, purchase_uris,
      uri, scryfall_uri, rulings_uri, prints_search_uri,
      artist, artist_ids, illustration_id, border_color, frame, frame_effects,
      security_stamp, preview, flavor_text,
      edhrec_rank, penny_rank, arena_id, mtgo_id, mtgo_foil_id,
      tcgplayer_id, cardmarket_id, multiverse_ids,
      updated_at
    ) VALUES (
      @id, @oracle_id, @name, @lang,
      @mana_cost, @cmc, @type_line, @oracle_text,
      @power, @toughness, @loyalty, @defense,
      @colors, @color_identity, @color_indicator,
      @keywords, @produced_mana,
      @released_at, @layout, @rarity, @set_code, @set_name, @collector_number,
      @reserved, @foil, @nonfoil, @oversized, @promo, @reprint,
      @variation, @digital, @full_art, @textless, @booster, @story_spotlight,
      @finishes, @games, @legalities, @prices, @image_uris,
      @card_faces, @all_parts, @related_uris, @purchase_uris,
      @uri, @scryfall_uri, @rulings_uri, @prints_search_uri,
      @artist, @artist_ids, @illustration_id, @border_color, @frame, @frame_effects,
      @security_stamp, @preview, @flavor_text,
      @edhrec_rank, @penny_rank, @arena_id, @mtgo_id, @mtgo_foil_id,
      @tcgplayer_id, @cardmarket_id, @multiverse_ids,
      CURRENT_TIMESTAMP
    )
  `);

  let totalCount = 0;
  let newCount = 0;
  let updatedCount = 0;
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

    pipeline.on('data', ({ value }: { value: ScryfallCard }) => {
      try {
        const card = value;

        // Check if this card already exists
        const exists = checkExistsStmt.get(card.id);

        insertStmt.run({
          id: card.id,
          oracle_id: card.oracle_id || null,
          name: card.name,
          lang: card.lang || null,
          mana_cost: card.mana_cost || null,
          cmc: card.cmc ?? null,
          type_line: card.type_line || null,
          oracle_text: card.oracle_text || null,
          power: card.power || null,
          toughness: card.toughness || null,
          loyalty: card.loyalty || null,
          defense: card.defense || null,
          colors: jsonStringify(card.colors),
          color_identity: jsonStringify(card.color_identity),
          color_indicator: jsonStringify(card.color_indicator),
          keywords: jsonStringify(card.keywords),
          produced_mana: jsonStringify(card.produced_mana),
          released_at: card.released_at || null,
          layout: card.layout || null,
          rarity: card.rarity || null,
          set_code: card.set || null,
          set_name: card.set_name || null,
          collector_number: card.collector_number || null,
          reserved: boolToInt(card.reserved),
          foil: boolToInt(card.foil),
          nonfoil: boolToInt(card.nonfoil),
          oversized: boolToInt(card.oversized),
          promo: boolToInt(card.promo),
          reprint: boolToInt(card.reprint),
          variation: boolToInt(card.variation),
          digital: boolToInt(card.digital),
          full_art: boolToInt(card.full_art),
          textless: boolToInt(card.textless),
          booster: boolToInt(card.booster),
          story_spotlight: boolToInt(card.story_spotlight),
          finishes: jsonStringify(card.finishes),
          games: jsonStringify(card.games),
          legalities: jsonStringify(card.legalities),
          prices: jsonStringify(card.prices),
          image_uris: jsonStringify(card.image_uris),
          card_faces: jsonStringify(card.card_faces),
          all_parts: jsonStringify(card.all_parts),
          related_uris: jsonStringify(card.related_uris),
          purchase_uris: jsonStringify(card.purchase_uris),
          uri: card.uri || null,
          scryfall_uri: card.scryfall_uri || null,
          rulings_uri: card.rulings_uri || null,
          prints_search_uri: card.prints_search_uri || null,
          artist: card.artist || null,
          artist_ids: jsonStringify(card.artist_ids),
          illustration_id: card.illustration_id || null,
          border_color: card.border_color || null,
          frame: card.frame || null,
          frame_effects: jsonStringify(card.frame_effects),
          security_stamp: card.security_stamp || null,
          preview: jsonStringify(card.preview),
          flavor_text: card.flavor_text || null,
          edhrec_rank: card.edhrec_rank ?? null,
          penny_rank: card.penny_rank ?? null,
          arena_id: card.arena_id ?? null,
          mtgo_id: card.mtgo_id ?? null,
          mtgo_foil_id: card.mtgo_foil_id ?? null,
          tcgplayer_id: card.tcgplayer_id ?? null,
          cardmarket_id: card.cardmarket_id ?? null,
          multiverse_ids: jsonStringify(card.multiverse_ids),
        });

        totalCount++;
        if (exists) {
          updatedCount++;
        } else {
          newCount++;
        }
        batchCount++;

        // Commit and start new transaction every BATCH_SIZE cards
        if (batchCount >= BATCH_SIZE) {
          db.exec('COMMIT');
          db.exec('BEGIN TRANSACTION');
          batchCount = 0;

          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          const rate = (totalCount / parseFloat(elapsed)).toFixed(0);
          process.stdout.write(
            `\rProcessed ${totalCount.toLocaleString()} cards... ` +
            `(${newCount.toLocaleString()} new, ${updatedCount.toLocaleString()} updated) ` +
            `[${rate}/sec]`
          );
        }
      } catch (err) {
        console.error(`\nError processing card:`, err);
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
      console.log(`Total cards processed: ${totalCount.toLocaleString()}`);
      console.log(`  - New cards:         ${newCount.toLocaleString()}`);
      console.log(`  - Updated cards:     ${updatedCount.toLocaleString()}`);
      console.log(`Time elapsed:          ${elapsed} seconds`);
      console.log(`Average rate:          ${rate} cards/second`);
      console.log(`Database size:         ${(fs.statSync(DB_PATH).size / (1024 * 1024)).toFixed(2)} MB`);
      console.log('');

      // Get final counts
      const finalCount = db.prepare('SELECT COUNT(*) as count FROM cards').get() as { count: number };
      const uniqueOracles = db.prepare('SELECT COUNT(DISTINCT oracle_id) as count FROM cards').get() as { count: number };

      console.log('Database stats:');
      console.log(`  Total cards:         ${finalCount.count.toLocaleString()}`);
      console.log(`  Unique oracle IDs:   ${uniqueOracles.count.toLocaleString()}`);
      console.log('');

      // Optimize database after import
      console.log('Optimizing database...');
      db.exec('ANALYZE');
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
  console.log('Scryfall Cards Importer');
  console.log('='.repeat(60));
  console.log('');
  console.log('Key: id (unique per printing)');
  console.log('Mode: INSERT OR REPLACE (upsert)');
  console.log('');

  importCards(jsonPath)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Import failed:', err);
      process.exit(1);
    });
}

export { importCards };
