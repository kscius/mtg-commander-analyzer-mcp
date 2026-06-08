/**
 * Download public Moxfield decks to data/my_decks/.
 *
 * Uses Playwright (browser context) because api2.moxfield.com blocks plain fetch (Cloudflare).
 *
 * Usage:
 *   npx ts-node scripts/downloadMoxfieldDecks.ts [url-or-id ...]
 *   npx ts-node scripts/downloadMoxfieldDecks.ts --file urls.txt
 *
 * Output per deck:
 *   data/my_decks/<slug>_<publicId>.txt   — analyze_deck-compatible list
 *   data/my_decks/<slug>_<publicId>.json — raw Moxfield payload
 *   data/my_decks/index.json             — manifest
 */

import * as fs from 'fs';
import * as path from 'path';
import { chromium, type Browser, type Page } from 'playwright';

const MOXFIELD_API = 'https://api2.moxfield.com';
const USER_AGENT = 'mtg-commander-analyzer-mcp/0.7.0';
const OUT_DIR = path.join(__dirname, '..', 'data', 'my_decks');
const DELAY_MS = 1200;

interface MoxfieldCardEntry {
  quantity?: number;
}

interface MoxfieldDeck {
  name?: string;
  publicId?: string;
  format?: string;
  commanders?: Record<string, MoxfieldCardEntry>;
  mainboard?: Record<string, MoxfieldCardEntry>;
  sideboard?: Record<string, MoxfieldCardEntry>;
  maybeboard?: Record<string, MoxfieldCardEntry>;
}

interface DeckManifestEntry {
  name: string;
  publicId: string;
  format?: string;
  sourceUrl: string;
  txtFile: string;
  jsonFile: string;
  commanderCount: number;
  mainboardCount: number;
  totalCards: number;
  downloadedAt: string;
  error?: string;
}

function extractPublicId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/moxfield\.com\/decks\/([^/?#]+)/i);
  if (match) return match[1];
  return trimmed.replace(/^https?:\/\//, '').split('/').pop() ?? trimmed;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'deck';
}

function boardToLines(board: Record<string, MoxfieldCardEntry> | undefined): string[] {
  if (!board) return [];
  return Object.entries(board)
    .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    .map(([cardName, entry]) => `${entry.quantity ?? 1} ${cardName}`);
}

function deckToText(deck: MoxfieldDeck): string {
  const lines: string[] = [];
  const commanders = deck.commanders ?? {};
  const commanderNames = Object.keys(commanders);
  if (commanderNames.length === 1) {
    lines.push(`Commander: ${commanderNames[0]}`);
  } else if (commanderNames.length > 1) {
    for (const name of commanderNames.sort()) {
      lines.push(`Commander: ${name}`);
    }
  }
  lines.push(...boardToLines(deck.mainboard));
  return lines.join('\n').trim() + '\n';
}

function countCards(board: Record<string, MoxfieldCardEntry> | undefined): number {
  if (!board) return 0;
  return Object.values(board).reduce((sum, c) => sum + (c.quantity ?? 1), 0);
}

async function fetchDeckJson(page: Page, publicId: string): Promise<MoxfieldDeck> {
  const raw = await page.evaluate(
    async ({ apiBase, deckId, ua }) => {
      const urls = [
        `${apiBase}/v3/decks/all/${deckId}`,
        `${apiBase}/v2/decks/all/${deckId}`,
      ];
      for (const url of urls) {
        const res = await fetch(url, {
          headers: { Accept: 'application/json', 'User-Agent': ua },
          credentials: 'omit',
        });
        if (!res.ok) continue;
        const data = await res.json();
        if (data && typeof data === 'object' && ('mainboard' in data || 'commanders' in data)) {
          return data as Record<string, unknown>;
        }
      }
      throw new Error(`Moxfield API failed for deck ${deckId}`);
    },
    { apiBase: MOXFIELD_API, deckId: publicId, ua: USER_AGENT },
  );
  return raw as MoxfieldDeck;
}

async function downloadDeck(
  page: Page,
  publicId: string,
): Promise<{ deck: MoxfieldDeck; sourceUrl: string }> {
  const sourceUrl = `https://www.moxfield.com/decks/${publicId}`;
  await page.goto(sourceUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(800);
  const deck = await fetchDeckJson(page, publicId);
  return { deck, sourceUrl };
}

function parseArgs(argv: string[]): string[] {
  const fileIdx = argv.indexOf('--file');
  if (fileIdx >= 0) {
    const filePath = argv[fileIdx + 1];
    if (!filePath) throw new Error('--file requires a path');
    const content = fs.readFileSync(path.resolve(filePath), 'utf8');
    return content
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
  }
  return argv.filter((a) => !a.startsWith('--'));
}

async function main(): Promise<void> {
  const inputs = parseArgs(process.argv.slice(2));
  if (inputs.length === 0) {
    console.error('Provide Moxfield deck URLs/IDs or --file urls.txt');
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const manifest: DeckManifestEntry[] = [];
  let browser: Browser | undefined;

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ userAgent: USER_AGENT });
    const page = await context.newPage();

    for (let i = 0; i < inputs.length; i++) {
      const publicId = extractPublicId(inputs[i]);
      process.stdout.write(`[${i + 1}/${inputs.length}] ${publicId} ... `);

      try {
        const { deck, sourceUrl } = await downloadDeck(page, publicId);
        const name = deck.name?.trim() || publicId;
        const slug = slugify(name);
        const baseName = `${slug}_${publicId}`;
        const txtPath = path.join(OUT_DIR, `${baseName}.txt`);
        const jsonPath = path.join(OUT_DIR, `${baseName}.json`);

        fs.writeFileSync(jsonPath, JSON.stringify(deck, null, 2), 'utf8');
        fs.writeFileSync(txtPath, deckToText(deck), 'utf8');

        const commanderCount = countCards(deck.commanders);
        const mainboardCount = countCards(deck.mainboard);
        manifest.push({
          name,
          publicId,
          format: deck.format,
          sourceUrl,
          txtFile: path.relative(path.join(__dirname, '..'), txtPath).replace(/\\/g, '/'),
          jsonFile: path.relative(path.join(__dirname, '..'), jsonPath).replace(/\\/g, '/'),
          commanderCount,
          mainboardCount,
          totalCards: commanderCount + mainboardCount,
          downloadedAt: new Date().toISOString(),
        });
        console.log(`OK — ${name} (${mainboardCount} main + ${commanderCount} cmd)`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        manifest.push({
          name: publicId,
          publicId,
          sourceUrl: `https://www.moxfield.com/decks/${publicId}`,
          txtFile: '',
          jsonFile: '',
          commanderCount: 0,
          mainboardCount: 0,
          totalCards: 0,
          downloadedAt: new Date().toISOString(),
          error: msg,
        });
        console.log(`FAIL — ${msg}`);
      }

      if (i < inputs.length - 1) {
        await page.waitForTimeout(DELAY_MS);
      }
    }

    const indexPath = path.join(OUT_DIR, 'index.json');
    fs.writeFileSync(
      indexPath,
      JSON.stringify(
        {
          downloadedAt: new Date().toISOString(),
          deckCount: manifest.length,
          successCount: manifest.filter((m) => !m.error).length,
          failureCount: manifest.filter((m) => m.error).length,
          decks: manifest,
        },
        null,
        2,
      ),
      'utf8',
    );

    const failures = manifest.filter((m) => m.error);
    console.log(`\nSaved to ${OUT_DIR}`);
    console.log(`Success: ${manifest.length - failures.length}/${manifest.length}`);
    if (failures.length > 0) {
      console.log('Failures:');
      for (const f of failures) console.log(`  - ${f.publicId}: ${f.error}`);
      process.exitCode = 1;
    }
  } finally {
    await browser?.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
