/**
 * createDatabase.ts
 * 
 * Creates the SQLite database schema for storing Scryfall oracle cards and rulings.
 * 
 * Key design decisions:
 * - `id` is the PRIMARY KEY (unique per card printing/version)
 * - `oracle_id` groups all printings of the same card
 * - Rulings are linked by `oracle_id` (shared across all printings)
 * 
 * Usage: 
 *   npm run db:create          # Fresh database (drops existing)
 *   npm run db:create -- --keep # Keep existing data, only add missing tables
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'cards.db');

export function createDatabase(keepExisting: boolean = false): void {
  // Ensure data directory exists
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Handle existing database
  if (fs.existsSync(DB_PATH)) {
    if (keepExisting) {
      console.log(`Database exists at ${DB_PATH}, checking schema...`);
    } else {
      console.log(`Removing existing database at ${DB_PATH}...`);
      fs.unlinkSync(DB_PATH);
    }
  }

  console.log(`${keepExisting ? 'Opening' : 'Creating new'} database at ${DB_PATH}...`);
  const db = new Database(DB_PATH);

  // Enable WAL mode for better performance
  db.pragma('journal_mode = WAL');

  // Check if tables exist (for --keep mode)
  const tableExists = (name: string): boolean => {
    const result = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
    ).get(name);
    return !!result;
  };

  // Create the main cards table with all Scryfall fields
  if (!tableExists('cards')) {
    console.log('Creating cards table...');
    db.exec(`
      CREATE TABLE cards (
        -- Primary identifiers
        -- id: Unique ID for this specific printing/version
        -- oracle_id: Shared ID across all printings of the same card
        id TEXT PRIMARY KEY,
        oracle_id TEXT,
        name TEXT NOT NULL,
        lang TEXT,
        
        -- Gameplay information
        mana_cost TEXT,
        cmc REAL,
        type_line TEXT,
        oracle_text TEXT,
        power TEXT,
        toughness TEXT,
        loyalty TEXT,
        defense TEXT,
        
        -- Colors (stored as JSON arrays)
        colors TEXT,
        color_identity TEXT,
        color_indicator TEXT,
        
        -- Keywords and produced mana
        keywords TEXT,
        produced_mana TEXT,
        
        -- Set and release info
        released_at TEXT,
        layout TEXT,
        rarity TEXT,
        set_code TEXT,
        set_name TEXT,
        collector_number TEXT,
        
        -- Flags
        reserved INTEGER DEFAULT 0,
        foil INTEGER DEFAULT 0,
        nonfoil INTEGER DEFAULT 0,
        oversized INTEGER DEFAULT 0,
        promo INTEGER DEFAULT 0,
        reprint INTEGER DEFAULT 0,
        variation INTEGER DEFAULT 0,
        digital INTEGER DEFAULT 0,
        full_art INTEGER DEFAULT 0,
        textless INTEGER DEFAULT 0,
        booster INTEGER DEFAULT 0,
        story_spotlight INTEGER DEFAULT 0,
        
        -- Complex objects stored as JSON
        finishes TEXT,
        games TEXT,
        legalities TEXT,
        prices TEXT,
        image_uris TEXT,
        card_faces TEXT,
        all_parts TEXT,
        related_uris TEXT,
        purchase_uris TEXT,
        
        -- URIs
        uri TEXT,
        scryfall_uri TEXT,
        rulings_uri TEXT,
        prints_search_uri TEXT,
        
        -- Additional fields
        artist TEXT,
        artist_ids TEXT,
        illustration_id TEXT,
        border_color TEXT,
        frame TEXT,
        frame_effects TEXT,
        security_stamp TEXT,
        preview TEXT,
        flavor_text TEXT,
        edhrec_rank INTEGER,
        penny_rank INTEGER,
        arena_id INTEGER,
        mtgo_id INTEGER,
        mtgo_foil_id INTEGER,
        tcgplayer_id INTEGER,
        cardmarket_id INTEGER,
        multiverse_ids TEXT,
        
        -- Timestamps for tracking updates
        imported_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,

        -- Bracket 3 categorization (JSON array of tag strings, e.g. ["ramp","card_draw"])
        tags TEXT
      );

      -- Create indexes for common queries
      CREATE INDEX idx_cards_name ON cards(name);
      CREATE INDEX idx_cards_name_lower ON cards(lower(name));
      CREATE INDEX idx_cards_oracle_id ON cards(oracle_id);
      CREATE INDEX idx_cards_type_line ON cards(type_line);
      CREATE INDEX idx_cards_lang ON cards(lang);
      CREATE INDEX idx_cards_set_code ON cards(set_code);
      CREATE INDEX idx_cards_cmc ON cards(cmc);
      CREATE INDEX idx_cards_rarity ON cards(rarity);
      CREATE INDEX idx_cards_edhrec_rank ON cards(edhrec_rank);
      
      -- Full-text search virtual table for card names and oracle text
      CREATE VIRTUAL TABLE cards_fts USING fts5(
        name,
        oracle_text,
        type_line,
        content=cards,
        content_rowid=rowid
      );

      -- Trigger to keep FTS in sync on INSERT
      CREATE TRIGGER cards_ai AFTER INSERT ON cards BEGIN
        INSERT INTO cards_fts(rowid, name, oracle_text, type_line)
        VALUES (new.rowid, new.name, new.oracle_text, new.type_line);
      END;

      -- Trigger to keep FTS in sync on UPDATE
      CREATE TRIGGER cards_au AFTER UPDATE ON cards BEGIN
        UPDATE cards_fts 
        SET name = new.name, oracle_text = new.oracle_text, type_line = new.type_line
        WHERE rowid = old.rowid;
      END;

      -- Trigger to keep FTS in sync on DELETE
      CREATE TRIGGER cards_ad AFTER DELETE ON cards BEGIN
        DELETE FROM cards_fts WHERE rowid = old.rowid;
      END;
    `);
    console.log('  ✓ cards table created');
  } else {
    console.log('  ✓ cards table already exists');
  }

  // Migration: add tags column if missing (for --keep or existing DBs)
  const hasTagsColumn = (): boolean => {
    try {
      const row = db.prepare("PRAGMA table_info(cards)").all() as { name: string }[];
      return row.some(r => r.name === 'tags');
    } catch {
      return false;
    }
  };
  if (tableExists('cards') && !hasTagsColumn()) {
    console.log('Adding tags column to cards table...');
    db.exec('ALTER TABLE cards ADD COLUMN tags TEXT');
    console.log('  ✓ tags column added');
  }

  // Create rulings table
  if (!tableExists('rulings')) {
    console.log('Creating rulings table...');
    db.exec(`
      CREATE TABLE rulings (
        -- Composite primary key: oracle_id + published_at + comment hash
        -- This allows multiple rulings per card and prevents duplicates
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        oracle_id TEXT NOT NULL,
        source TEXT,
        published_at TEXT,
        comment TEXT NOT NULL,
        
        -- Timestamps
        imported_at TEXT DEFAULT CURRENT_TIMESTAMP,
        
        -- Unique constraint to prevent duplicate rulings
        UNIQUE(oracle_id, published_at, comment)
      );

      -- Create indexes for common queries
      CREATE INDEX idx_rulings_oracle_id ON rulings(oracle_id);
      CREATE INDEX idx_rulings_published_at ON rulings(published_at);
      CREATE INDEX idx_rulings_source ON rulings(source);

      -- Full-text search for ruling comments
      CREATE VIRTUAL TABLE rulings_fts USING fts5(
        comment,
        content=rulings,
        content_rowid=id
      );

      -- Trigger to keep FTS in sync
      CREATE TRIGGER rulings_ai AFTER INSERT ON rulings BEGIN
        INSERT INTO rulings_fts(rowid, comment)
        VALUES (new.id, new.comment);
      END;

      CREATE TRIGGER rulings_ad AFTER DELETE ON rulings BEGIN
        DELETE FROM rulings_fts WHERE rowid = old.id;
      END;
    `);
    console.log('  ✓ rulings table created');
  } else {
    console.log('  ✓ rulings table already exists');
  }

  // Create a view to easily join cards with their rulings
  const viewExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='view' AND name='cards_with_rulings'"
  ).get();

  if (!viewExists) {
    console.log('Creating cards_with_rulings view...');
    db.exec(`
      CREATE VIEW cards_with_rulings AS
      SELECT 
        c.id,
        c.oracle_id,
        c.name,
        c.type_line,
        c.oracle_text,
        c.color_identity,
        c.legalities,
        r.source AS ruling_source,
        r.published_at AS ruling_date,
        r.comment AS ruling_comment
      FROM cards c
      LEFT JOIN rulings r ON c.oracle_id = r.oracle_id;
    `);
    console.log('  ✓ cards_with_rulings view created');
  } else {
    console.log('  ✓ cards_with_rulings view already exists');
  }

  // Print summary
  console.log('');
  console.log('=' .repeat(60));
  console.log('Database schema ready!');
  console.log('=' .repeat(60));
  console.log('');
  console.log('Tables:');
  console.log('  - cards (main table with all Scryfall fields)');
  console.log('    Primary key: id (unique per printing)');
  console.log('    Foreign key: oracle_id (shared across printings)');
  console.log('');
  console.log('  - rulings (card rulings/clarifications)');
  console.log('    Linked by: oracle_id');
  console.log('    Unique: (oracle_id, published_at, comment)');
  console.log('');
  console.log('Views:');
  console.log('  - cards_with_rulings (cards joined with their rulings)');
  console.log('');
  console.log('FTS Indexes:');
  console.log('  - cards_fts (name, oracle_text, type_line)');
  console.log('  - rulings_fts (comment)');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Import cards:   npm run db:import');
  console.log('  2. Import rulings: npm run db:import-rulings');

  db.close();
}

// Run if called directly
if (require.main === module) {
  const keepExisting = process.argv.includes('--keep');
  createDatabase(keepExisting);
}
