/**
 * Report primary-category tag coverage in cards.db.
 * Run: npm run db:tag-stats
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { autoTags, getPrimaryTemplateCategory, getDefaultBracket3Options, ScryCard } from '../core/autoTags';

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'cards.db');

function main(): void {
  if (!fs.existsSync(DB_PATH)) {
    console.error('cards.db not found. Run: npm run db:create && npm run db:import');
    process.exit(1);
  }

  const db = new Database(DB_PATH, { readonly: true });
  const rows = db
    .prepare(
      `SELECT oracle_id, name, type_line, oracle_text, mana_cost, cmc, color_identity, tags
       FROM cards WHERE lang = 'en' OR lang IS NULL`
    )
    .all() as Array<{
    oracle_id: string;
    name: string;
    type_line: string | null;
    oracle_text: string | null;
    mana_cost: string | null;
    cmc: number | null;
    color_identity: string | null;
    tags: string | null;
  }>;

  const opts = getDefaultBracket3Options('bracket3');
  let withTags = 0;
  let withPrimary = 0;
  const byCategory: Record<string, number> = {};

  for (const row of rows) {
    let tagList: string[] = [];
    if (row.tags) {
      try {
        const parsed = JSON.parse(row.tags) as unknown;
        if (Array.isArray(parsed)) tagList = parsed.filter((t) => typeof t === 'string') as string[];
      } catch {
        tagList = [];
      }
    }
    if (tagList.length > 0) withTags++;

    const scry: ScryCard = {
      name: row.name,
      type_line: row.type_line ?? '',
      oracle_text: row.oracle_text ?? '',
      mana_cost: row.mana_cost ?? '',
      cmc: row.cmc ?? 0,
      color_identity: row.color_identity ? JSON.parse(row.color_identity) : [],
    };
    const effectiveTags = tagList.length > 0 ? tagList : autoTags(scry, opts);
    const primary = getPrimaryTemplateCategory(effectiveTags);
    if (primary) {
      withPrimary++;
      byCategory[primary] = (byCategory[primary] ?? 0) + 1;
    }
  }

  const total = rows.length;
  console.log(`cards.db tag coverage (${total} English rows)\n`);
  console.log(`  rows with any tags column:     ${withTags} (${pct(withTags, total)}%)`);
  console.log(`  rows with bracket3 primary:    ${withPrimary} (${pct(withPrimary, total)}%)`);
  console.log('\n  primary category distribution (top 12):');
  const sorted = Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 12);
  for (const [cat, n] of sorted) {
    console.log(`    ${cat}: ${n}`);
  }
  console.log('\n  Run npm run db:tag to refresh tags after template/heuristic changes.');
  db.close();
}

function pct(n: number, total: number): string {
  if (total === 0) return '0';
  return ((100 * n) / total).toFixed(1);
}

main();
