import { describe, it, expect } from 'vitest';
import * as path from 'path';
import {
  assertSafeResourceId,
  isSafeResourceId,
  resolvePathUnderRoot,
  resolveProjectRelativePath,
} from './safePath';

describe('safePath', () => {
  describe('isSafeResourceId', () => {
    it('accepts known template and strategy slugs', () => {
      expect(isSafeResourceId('bracket3')).toBe(true);
      expect(isSafeResourceId('default')).toBe(true);
      expect(isSafeResourceId('group-slug')).toBe(true);
      expect(isSafeResourceId('tokens')).toBe(true);
    });

    it('rejects traversal and separator characters', () => {
      expect(isSafeResourceId('../.env')).toBe(false);
      expect(isSafeResourceId('foo/bar')).toBe(false);
      expect(isSafeResourceId('..')).toBe(false);
      expect(isSafeResourceId('')).toBe(false);
    });

    it('rejects ids exceeding RESOURCE_ID_MAX_LENGTH', () => {
      const longSlug = 'a'.repeat(65);
      expect(isSafeResourceId(longSlug)).toBe(false);
    });
  });

  describe('assertSafeResourceId', () => {
    it('throws on malicious ids', () => {
      expect(() => assertSafeResourceId('../../../etc/passwd', 'templateId')).toThrow(
        /Invalid templateId/
      );
    });

    it('throws when id exceeds max length', () => {
      expect(() => assertSafeResourceId('a'.repeat(65), 'preferredStrategy')).toThrow(
        /exceeds maximum length/
      );
    });
  });

  describe('resolvePathUnderRoot', () => {
    const root = path.join('/workspace', 'docs', 'strategy-guides');

    it('resolves a file under the root', () => {
      const resolved = resolvePathUnderRoot(root, 'tokens.md');
      expect(resolved).toBe(path.join(root, 'tokens.md'));
    });

    it('strips directory components from fileName', () => {
      const resolved = resolvePathUnderRoot(root, '../../../.env');
      expect(resolved).toBe(path.join(root, '.env'));
    });

    it('rejects empty basename', () => {
      expect(() => resolvePathUnderRoot(root, '../')).toThrow(/Invalid file name/);
    });
  });

  describe('resolveProjectRelativePath', () => {
    const root = '/workspace';

    it('allows normal project-relative paths', () => {
      const resolved = resolveProjectRelativePath(root, 'data/Banlist.txt');
      expect(resolved).toBe(path.join(root, 'data', 'Banlist.txt'));
    });

    it('blocks parent traversal', () => {
      expect(() => resolveProjectRelativePath(root, '../.env')).toThrow(/Invalid resource path/);
      expect(() => resolveProjectRelativePath(root, 'data/../../.env')).toThrow(
        /Invalid resource path/
      );
    });
  });
});
