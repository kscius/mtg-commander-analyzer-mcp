import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  clearEdhrecDiskCache,
  readEdhrecDiskCache,
  writeEdhrecDiskCache,
  getEdhrecDiskCacheStats,
} from './edhrecDiskCache';

describe('edhrecDiskCache', () => {
  let tempDir: string;
  let prevDir: string | undefined;
  let prevTtl: string | undefined;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edhrec-cache-'));
    prevDir = process.env.EDHREC_CACHE_DIR;
    prevTtl = process.env.EDHREC_CACHE_TTL_MS;
    process.env.EDHREC_CACHE_DIR = tempDir;
    process.env.EDHREC_CACHE_TTL_MS = String(60 * 60 * 1000);
  });

  afterEach(() => {
    clearEdhrecDiskCache();
    fs.rmSync(tempDir, { recursive: true, force: true });
    if (prevDir === undefined) delete process.env.EDHREC_CACHE_DIR;
    else process.env.EDHREC_CACHE_DIR = prevDir;
    if (prevTtl === undefined) delete process.env.EDHREC_CACHE_TTL_MS;
    else process.env.EDHREC_CACHE_TTL_MS = prevTtl;
  });

  it('writes and reads cached JSON by URL', () => {
    const url = 'https://json.edhrec.com/pages/commanders/test-slug.json';
    const payload = { container: { json_dict: { cardlists: [] } } };
    expect(writeEdhrecDiskCache(url, payload)).toBe(true);
    expect(readEdhrecDiskCache(url)).toEqual(payload);
    const stats = getEdhrecDiskCacheStats();
    expect(stats.entries).toBe(1);
    expect(stats.bytes).toBeGreaterThan(0);
  });

  it('returns null for unknown URL', () => {
    expect(readEdhrecDiskCache('https://json.edhrec.com/pages/missing.json')).toBeNull();
  });

  it('clearEdhrecDiskCache removes entries', () => {
    writeEdhrecDiskCache('https://json.edhrec.com/pages/top/white.json', { ok: true });
    clearEdhrecDiskCache();
    expect(getEdhrecDiskCacheStats().entries).toBe(0);
  });

  it('write failure returns false and does not throw', () => {
    // Point cache at a path that cannot be a writable directory.
    const blocked = path.join(tempDir, 'not-a-dir');
    fs.writeFileSync(blocked, 'file-not-dir', 'utf8');
    process.env.EDHREC_CACHE_DIR = blocked;
    try {
      expect(() =>
        writeEdhrecDiskCache('https://json.edhrec.com/pages/commanders/fail-write.json', { x: 1 })
      ).not.toThrow();
      expect(
        writeEdhrecDiskCache('https://json.edhrec.com/pages/commanders/fail-write.json', { x: 1 })
      ).toBe(false);
    } finally {
      // Restore writable temp dir before afterEach clearEdhrecDiskCache.
      process.env.EDHREC_CACHE_DIR = tempDir;
    }
  });

  it('atomic write leaves no .tmp siblings after success', () => {
    const url = 'https://json.edhrec.com/pages/commanders/atomic.json';
    expect(writeEdhrecDiskCache(url, { ok: true })).toBe(true);
    const leftovers = fs.readdirSync(tempDir).filter((n) => n.endsWith('.tmp'));
    expect(leftovers).toEqual([]);
    expect(readEdhrecDiskCache(url)).toEqual({ ok: true });
  });

  it('clearEdhrecDiskCache also removes stray .tmp files', () => {
    fs.writeFileSync(path.join(tempDir, 'orphan.tmp'), '{}', 'utf8');
    clearEdhrecDiskCache();
    expect(fs.readdirSync(tempDir)).toEqual([]);
  });
});
