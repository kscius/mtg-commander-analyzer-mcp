/**
 * Path-safety helpers for filesystem reads driven by MCP/user inputs.
 * Blocks directory traversal via `..`, absolute paths, or path separators in ids.
 */

import * as path from 'path';
import { RESOURCE_ID_MAX_LENGTH } from './schemas';

/** Lowercase slug safe for template/bracket/strategy ids (e.g. bracket3, group-slug). */
export const SAFE_RESOURCE_ID_REGEX = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;

/** JSON Schema pattern string — keep in sync with SAFE_RESOURCE_ID_REGEX. */
export const SAFE_RESOURCE_ID_PATTERN = '^[a-z0-9]+(?:[-_][a-z0-9]+)*$';

/**
 * Returns true when `id` is safe to embed in a filename segment.
 */
export function isSafeResourceId(id: string): boolean {
  return id.length <= RESOURCE_ID_MAX_LENGTH && SAFE_RESOURCE_ID_REGEX.test(id);
}

/**
 * @throws Error when `id` contains traversal or path separator characters.
 */
export function assertSafeResourceId(id: string, label = 'resource id'): void {
  if (id.length > RESOURCE_ID_MAX_LENGTH) {
    throw new Error(
      `Invalid ${label}: exceeds maximum length (${RESOURCE_ID_MAX_LENGTH} characters).`
    );
  }
  if (!SAFE_RESOURCE_ID_REGEX.test(id)) {
    throw new Error(
      `Invalid ${label}: "${id}". Use lowercase letters, digits, and hyphens only.`
    );
  }
}

/**
 * Resolves `fileName` under `rootDir` and verifies the result stays inside the root.
 * `fileName` is passed through `path.basename` to strip directory components.
 */
export function resolvePathUnderRoot(rootDir: string, fileName: string): string {
  const root = path.resolve(rootDir);
  const safeName = path.basename(fileName);
  if (!safeName || safeName === '.' || safeName === '..') {
    throw new Error(`Invalid file name: ${fileName}`);
  }
  const resolved = path.resolve(root, safeName);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`Path escapes allowed directory: ${fileName}`);
  }
  return resolved;
}

/**
 * Resolves a project-relative path and verifies it stays under `projectRoot`.
 */
export function resolveProjectRelativePath(projectRoot: string, relativePath: string): string {
  if (relativePath.includes('..')) {
    throw new Error(`Invalid resource path: ${relativePath}`);
  }
  const root = path.resolve(projectRoot);
  const resolved = path.resolve(root, relativePath);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`Resource path escapes project root: ${relativePath}`);
  }
  return resolved;
}
