/**
 * Disk cache for EDHREC JSON API responses.
 * Reduces repeated network calls across MCP sessions and deck builds.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

interface DiskCacheEntry {
  url: string;
  fetchedAt: string;
  data: unknown;
}

export interface EdhrecDiskCacheStats {
  entries: number;
  bytes: number;
  dir: string;
  ttlMs: number;
}

/** Cache directory (override with EDHREC_CACHE_DIR for tests). */
export function getEdhrecCacheDir(): string {
  return process.env.EDHREC_CACHE_DIR ?? path.join(process.cwd(), 'data', 'cache', 'edhrec');
}

/** TTL for disk entries (default 24h). Override with EDHREC_CACHE_TTL_HOURS or EDHREC_CACHE_TTL_MS. */
export function getEdhrecCacheTtlMs(): number {
  const hours = process.env.EDHREC_CACHE_TTL_HOURS;
  if (hours) {
    const parsed = Number.parseInt(hours, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      return parsed * 60 * 60 * 1000;
    }
  }
  const ms = process.env.EDHREC_CACHE_TTL_MS;
  if (ms) {
    const parsed = Number.parseInt(ms, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return DEFAULT_TTL_MS;
}

function urlToCachePath(url: string): string {
  const hash = crypto.createHash('sha256').update(url).digest('hex').slice(0, 40);
  return path.join(getEdhrecCacheDir(), `${hash}.json`);
}

function isFresh(fetchedAt: string, ttlMs: number): boolean {
  const t = Date.parse(fetchedAt);
  if (Number.isNaN(t)) return false;
  return Date.now() - t < ttlMs;
}

/** Read cached JSON for a full EDHREC URL, or null if missing/expired. */
export function readEdhrecDiskCache(url: string): unknown | null {
  const filePath = urlToCachePath(url);
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    const entry = JSON.parse(raw) as DiskCacheEntry;
    if (entry.url !== url || entry.data === undefined) return null;
    if (!isFresh(entry.fetchedAt, getEdhrecCacheTtlMs())) return null;
    return entry.data;
  } catch {
    return null;
  }
}

/**
 * Persist JSON response for a full EDHREC URL.
 * Uses sibling temp + rename so readers never see a partial write.
 * Disk/permission failures are swallowed (returns false) so a successful
 * network fetch can still populate the in-memory cache and return JSON.
 */
export function writeEdhrecDiskCache(url: string, data: unknown): boolean {
  const dir = getEdhrecCacheDir();
  const targetPath = urlToCachePath(url);
  const tmpPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.mkdirSync(dir, { recursive: true });
    const entry: DiskCacheEntry = {
      url,
      fetchedAt: new Date().toISOString(),
      data,
    };
    fs.writeFileSync(tmpPath, JSON.stringify(entry), 'utf8');
    fs.renameSync(tmpPath, targetPath);
    return true;
  } catch {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {
      // Best-effort temp cleanup; ignore secondary failures.
    }
    return false;
  }
}

/** Remove all disk cache files and stray write temps (for tests or manual refresh). */
export function clearEdhrecDiskCache(): void {
  const dir = getEdhrecCacheDir();
  try {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return;
  } catch {
    return;
  }
  for (const name of fs.readdirSync(dir)) {
    if (name.endsWith('.json') || name.endsWith('.tmp')) {
      fs.unlinkSync(path.join(dir, name));
    }
  }
}

/** Disk cache size summary for startup logs and diagnostics. */
export function getEdhrecDiskCacheStats(): EdhrecDiskCacheStats {
  const dir = getEdhrecCacheDir();
  let entries = 0;
  let bytes = 0;
  if (fs.existsSync(dir)) {
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.json')) continue;
      const stat = fs.statSync(path.join(dir, name));
      entries++;
      bytes += stat.size;
    }
  }
  return { entries, bytes, dir, ttlMs: getEdhrecCacheTtlMs() };
}
