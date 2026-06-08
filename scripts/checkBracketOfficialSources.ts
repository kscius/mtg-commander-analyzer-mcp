#!/usr/bin/env ts-node
/**
 * checkBracketOfficialSources.ts
 *
 * Fetches official Commander Brackets pages and verifies expected policy phrases
 * still appear. Updates data/bracket-official-sources.json lastCheckedAt.
 *
 * Hard validation: Wizards articles (canonical policy text).
 * Soft validation: Moxfield UI (may block headless browsers — open URL manually).
 *
 * Usage:
 *   npm run brackets:check-official
 *   npm run brackets:check-official -- --skip-moxfield
 */

import {
  loadBracketOfficialSources,
  saveBracketOfficialSources,
  type BracketOfficialSource,
  type BracketOfficialSourcesFile,
} from '../src/core/bracketOfficialSources';

const SKIP_MOXFIELD = process.argv.includes('--skip-moxfield');

async function fetchHttpsText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'mtg-commander-analyzer-mcp/brackets-check',
      Accept: 'text/html,application/xhtml+xml',
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return res.text();
}

async function fetchPlaywrightText(url: string): Promise<string> {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(5000);
    return await page.locator('body').innerText();
  } finally {
    await browser.close();
  }
}

function isBlocked(text: string, indicators: string[] | undefined): boolean {
  if (!indicators?.length) return false;
  const lower = text.toLowerCase();
  return indicators.some((i) => lower.includes(i.toLowerCase()));
}

function checkPhrases(text: string, phrases: string[], sourceId: string): string[] {
  const lower = text.toLowerCase();
  const missing: string[] = [];
  for (const phrase of phrases) {
    if (!lower.includes(phrase.toLowerCase())) {
      missing.push(phrase);
    }
  }
  if (missing.length > 0) {
    console.warn(`[${sourceId}] missing phrases: ${missing.join(', ')}`);
  }
  return missing;
}

async function checkSource(source: BracketOfficialSource): Promise<{
  sourceId: string;
  ok: boolean;
  missingPhrases?: string[];
  error?: string;
  checkedAt: string;
}> {
  const checkedAt = new Date().toISOString();
  const mode = source.validationMode ?? 'hard';

  if (source.id === 'moxfield-brackets' && SKIP_MOXFIELD) {
    return { sourceId: source.id, ok: true, checkedAt, error: 'skipped (--skip-moxfield)' };
  }

  try {
    const text =
      source.fetchMethod === 'playwright'
        ? await fetchPlaywrightText(source.url)
        : await fetchHttpsText(source.url);

    if (isBlocked(text, source.blockedIndicators)) {
      const msg =
        'Cloudflare/bot block — open URL in browser for manual review (soft source)';
      if (mode === 'soft') {
        console.warn(`[${source.id}] ${msg}`);
        return { sourceId: source.id, ok: true, checkedAt, error: msg };
      }
      return { sourceId: source.id, ok: false, checkedAt, error: msg };
    }

    if (text.length < 200) {
      const err = `Response too short (${text.length} chars)`;
      if (mode === 'soft') {
        console.warn(`[${source.id}] ${err}`);
        return { sourceId: source.id, ok: true, checkedAt, error: err };
      }
      return { sourceId: source.id, ok: false, checkedAt, error: err };
    }

    const missing = checkPhrases(text, source.expectedPhrases, source.id);
    if (missing.length > 0 && mode === 'soft') {
      console.warn(`[${source.id}] soft check: missing phrases (non-fatal)`);
      return {
        sourceId: source.id,
        ok: true,
        checkedAt,
        missingPhrases: missing,
        error: 'soft validation — verify in browser',
      };
    }

    return {
      sourceId: source.id,
      ok: missing.length === 0,
      missingPhrases: missing.length ? missing : undefined,
      checkedAt,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (mode === 'soft') {
      console.warn(`[${source.id}] soft fetch failed: ${message}`);
      return { sourceId: source.id, ok: true, checkedAt, error: message };
    }
    return { sourceId: source.id, ok: false, checkedAt, error: message };
  }
}

async function main(): Promise<void> {
  const data = loadBracketOfficialSources();
  const results = [];

  console.log('Checking Commander Brackets official sources...\n');

  for (const source of data.sources) {
    console.log(`→ ${source.label} [${source.validationMode ?? 'hard'}]\n  ${source.url}`);
    const result = await checkSource(source);
    results.push(result);
    if (result.ok) {
      console.log(`  ✓ OK${result.error ? ` (${result.error})` : ''}`);
    } else {
      console.log(`  ✗ FAIL${result.error ? `: ${result.error}` : ''}`);
      if (result.missingPhrases?.length) {
        console.log(`    Missing: ${result.missingPhrases.join('; ')}`);
      }
    }
    console.log('');
  }

  const updated: BracketOfficialSourcesFile = {
    ...data,
    lastCheckedAt: new Date().toISOString(),
    lastCheckResults: results,
  };
  saveBracketOfficialSources(updated);

  const failed = results.filter(
    (r) => !r.ok && r.error !== 'skipped (--skip-moxfield)'
  );
  if (failed.length > 0) {
    console.error(
      `${failed.length} hard source(s) failed. Review docs/bracket3-official-rules.md and update policy files if Wizards changed.`
    );
    process.exit(1);
  }

  console.log('Validation complete. Updated data/bracket-official-sources.json');
  console.log('Manual: open https://moxfield.com/commanderbrackets when Moxfield soft-check warns.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
