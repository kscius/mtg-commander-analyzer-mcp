/**
 * templates.ts
 *
 * Deck template loader and cache.
 * Templates define expected category distributions for different deck archetypes.
 * For bracket3, uses Zod validation and parseTemplate from templateSchema.
 */

import * as fs from 'fs';
import * as path from 'path';
import { DeckTemplate } from './types';
import { parseTemplate, safeParseTemplate, type DeckTemplateValidated } from './templateSchema';

/**
 * Cache for loaded templates (stores minimal DeckTemplate shape for compatibility)
 */
const templateCache: Map<string, DeckTemplate | DeckTemplateValidated> = new Map();

/**
 * Template IDs that use the full Zod schema (bracket3). Others use basic validation only.
 */
const FULL_SCHEMA_TEMPLATE_IDS = new Set(['bracket3']);

/**
 * Loads a deck template by ID.
 * For bracket3, validates with full Zod schema (parseTemplate). For others, validates id + categories only.
 *
 * @param templateId - Template identifier (e.g., "default", "bracket3")
 * @returns DeckTemplate (or DeckTemplateValidated for bracket3) with category configurations
 * @throws Error if template file cannot be loaded or validation fails
 */
export function loadDeckTemplate(templateId: string | undefined): DeckTemplate | DeckTemplateValidated {
  const id = templateId || 'default';

  if (templateCache.has(id)) {
    return templateCache.get(id)!;
  }

  try {
    const fileName = `deck-template-${id}.json`;
    const filePath = path.join(__dirname, '..', '..', 'data', fileName);
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;

    if (FULL_SCHEMA_TEMPLATE_IDS.has(id)) {
      const result = safeParseTemplate(parsed);
      if (!result.success) {
        const err = result.error as { issues?: Array<{ path: (string | number)[]; message: string }>; message?: string };
      const msg = err.issues?.length
        ? err.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ')
        : err.message ?? String(result.error);
        throw new Error(`Template "${id}" validation failed: ${msg}`);
      }
      const template = result.data;
      templateCache.set(id, template);
      return template;
    }

    // Minimal validation for other templates (e.g. default)
    const template = parsed as DeckTemplate;
    if (!template.id || !Array.isArray(template.categories)) {
      throw new Error(`Invalid template structure in ${fileName}`);
    }
    templateCache.set(id, template);
    return template;
  } catch (error) {
    if (error instanceof Error) {
      if (id !== 'default' && error.message.includes('ENOENT')) {
        console.warn(`Template "${id}" not found, falling back to "default"`);
        return loadDeckTemplate('default');
      }
      throw new Error(
        `Failed to load deck template "${id}": ${error.message}\n` +
          `Make sure data/deck-template-${id}.json exists.`
      );
    }
    throw error;
  }
}

/**
 * Clears the template cache (useful for testing)
 */
export function clearTemplateCache(): void {
  templateCache.clear();
}

