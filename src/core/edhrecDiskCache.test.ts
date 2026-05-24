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
    writeEdhrecDiskCache(url, payload);
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
});
