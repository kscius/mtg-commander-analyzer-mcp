/**
 * templates.ts
 * 
 * Deck template loader and cache.
 * Templates define expected category distributions for different deck archetypes.
 */

import * as fs from 'fs';
import * as path from 'path';
import { DeckTemplate } from './types';

/**
 * Cache for loaded templates
 */
const templateCache: Map<string, DeckTemplate> = new Map();

/**
 * Loads a deck template by ID
 * 
 * @param templateId - Template identifier (e.g., "default", "aggro", "control")
 * @returns DeckTemplate with category configurations
 * @throws Error if template file cannot be loaded
 * 
 * @example
 * ```typescript
 * const template = loadDeckTemplate("default");
 * console.log(template.categories); // [{ name: "lands", min: 34, max: 41 }, ...]
 * ```
 */
export function loadDeckTemplate(templateId: string | undefined): DeckTemplate {
  // Default to "default" template if no ID provided
  const id = templateId || 'default';

  // Check cache first
  if (templateCache.has(id)) {
    return templateCache.get(id)!;
  }

  try {
    // Resolve path relative to compiled output (dist/core)
    // Path: dist/core -> dist -> project root -> data
    const fileName = `deck-template-${id}.json`;
    const filePath = path.join(__dirname, '..', '..', 'data', fileName);

    // Read and parse the template file
    const raw = fs.readFileSync(filePath, 'utf8');
    const template = JSON.parse(raw) as DeckTemplate;

    // Validate basic structure
    if (!template.id || !Array.isArray(template.categories)) {
      throw new Error(`Invalid template structure in ${fileName}`);
    }

    // Cache the template
    templateCache.set(id, template);

    return template;
  } catch (error) {
    if (error instanceof Error) {
      // If the requested template doesn't exist and it's not "default", try default
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

