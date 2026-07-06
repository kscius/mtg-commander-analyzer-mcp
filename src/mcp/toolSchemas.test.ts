import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { SAFE_RESOURCE_ID_PATTERN } from '../core/safePath';
import { buildMcpTools } from './toolSchemas';
import {
  AnalyzeDeckInputSchema,
  ApplyDeckChangesInputSchema,
  BuildDeckInputSchema,
  BRACKET3_TEMPLATE_CATEGORY_NAMES,
  CARD_NAME_LIST_MAX_COUNT,
  CARD_NAME_MAX_LENGTH,
  COMMANDER_NAME_MAX_LENGTH,
  DECK_TEXT_MAX_LENGTH,
  EvaluateCardSwapInputSchema,
  FOCUS_CATEGORIES_MAX_COUNT,
  GetCategoryCandidatesInputSchema,
  GetStrategyGuideInputSchema,
  GetSynergiesInputSchema,
  GetUserDeckStyleInputSchema,
  OptimizeDeckInputSchema,
  ResolveCardInputSchema,
  RESOURCE_ID_MAX_LENGTH,
  SEARCH_QUERY_MAX_LENGTH,
  SearchCardsInputSchema,
  SEED_CARDS_MAX_COUNT,
  STYLE_QUESTION_MAX_LENGTH,
  SWAPS_MAX_COUNT,
} from '../core/schemas';

/** Extract top-level object keys from a Zod input schema (unwraps default/effects wrappers). */
function zodInputKeys(schema: z.ZodType): string[] {
  if (schema instanceof z.ZodObject) {
    return Object.keys(schema.shape);
  }
  const def = (schema as unknown as { _zod?: { def?: { type?: string; innerType?: z.ZodType } } })
    ._zod?.def;
  if ((def?.type === 'default' || def?.type === 'effects') && def.innerType) {
    return zodInputKeys(def.innerType);
  }
  throw new Error(`Unsupported Zod schema type for MCP contract test: ${schema.constructor.name}`);
}

function mcpPropertyKeys(toolName: string): string[] {
  const tool = buildMcpTools().find((t) => t.name === toolName);
  if (!tool?.inputSchema || typeof tool.inputSchema !== 'object') {
    throw new Error(`Tool not found or missing inputSchema: ${toolName}`);
  }
  const props = (tool.inputSchema as { properties?: Record<string, unknown> }).properties;
  return props ? Object.keys(props).sort() : [];
}

function mcpProperty(toolName: string, propName: string): Record<string, unknown> {
  const tool = buildMcpTools().find((t) => t.name === toolName);
  const props = (tool?.inputSchema as { properties?: Record<string, Record<string, unknown>> })
    ?.properties;
  const prop = props?.[propName];
  if (!prop) {
    throw new Error(`Property ${propName} not found on ${toolName}`);
  }
  return prop;
}

const TOOL_ZOD_SCHEMAS: Record<string, z.ZodType> = {
  analyze_deck: AnalyzeDeckInputSchema,
  build_deck_from_commander: BuildDeckInputSchema,
  get_category_candidates: GetCategoryCandidatesInputSchema,
  search_cards: SearchCardsInputSchema,
  optimize_deck: OptimizeDeckInputSchema,
  apply_deck_changes: ApplyDeckChangesInputSchema,
  resolve_card: ResolveCardInputSchema,
  get_synergies: GetSynergiesInputSchema,
  evaluate_card_swap: EvaluateCardSwapInputSchema,
  get_strategy_guide: GetStrategyGuideInputSchema,
  get_user_deck_style: GetUserDeckStyleInputSchema,
};

describe('buildMcpTools Zod contract', () => {
  it('registers exactly 11 tools', () => {
    expect(buildMcpTools()).toHaveLength(11);
  });

  it.each(Object.entries(TOOL_ZOD_SCHEMAS))(
    '%s discovery schema matches Zod input keys',
    (toolName, zodSchema) => {
      expect(mcpPropertyKeys(toolName)).toEqual(zodInputKeys(zodSchema).sort());
    }
  );

  it('analyze_deck exposes inferCommander for MCP discovery', () => {
    expect(mcpPropertyKeys('analyze_deck')).toContain('inferCommander');
  });

  it('optimize_deck exposes banlistId for MCP discovery', () => {
    expect(mcpPropertyKeys('optimize_deck')).toContain('banlistId');
  });

  it('category fields expose bracket3 template category enum', () => {
    const tools = buildMcpTools();
    const categoryEnum = [...BRACKET3_TEMPLATE_CATEGORY_NAMES];
    for (const toolName of ['get_category_candidates', 'search_cards'] as const) {
      const tool = tools.find((t) => t.name === toolName);
      const category = (
        tool?.inputSchema as { properties?: { category?: { enum?: string[] } } }
      )?.properties?.category;
      expect(category?.enum).toEqual(categoryEnum);
    }
    const optimize = tools.find((t) => t.name === 'optimize_deck');
    const focusItems = (
      optimize?.inputSchema as {
        properties?: { focusCategories?: { items?: { enum?: string[] } } };
      }
    )?.properties?.focusCategories?.items;
    expect(focusItems?.enum).toEqual(categoryEnum);
  });

  describe('Zod constraint parity (DoS bounds in MCP discovery schema)', () => {
    it('analyze_deck deckText matches DeckTextSchema bounds', () => {
      const deckText = mcpProperty('analyze_deck', 'deckText');
      expect(deckText.minLength).toBe(1);
      expect(deckText.maxLength).toBe(DECK_TEXT_MAX_LENGTH);
    });

    it('apply_deck_changes swaps matches SwapItemSchema array bounds', () => {
      const swaps = mcpProperty('apply_deck_changes', 'swaps');
      expect(swaps.minItems).toBe(1);
      expect(swaps.maxItems).toBe(SWAPS_MAX_COUNT);
    });

    it('build_deck_from_commander seedCards matches SeedCardsSchema maxItems', () => {
      const seedCards = mcpProperty('build_deck_from_commander', 'seedCards');
      expect(seedCards.maxItems).toBe(SEED_CARDS_MAX_COUNT);
    });

    it('optimize_deck preserveCards and focusCategories match Zod list caps', () => {
      expect(mcpProperty('optimize_deck', 'preserveCards').maxItems).toBe(
        CARD_NAME_LIST_MAX_COUNT
      );
      expect(mcpProperty('optimize_deck', 'focusCategories').maxItems).toBe(
        FOCUS_CATEGORIES_MAX_COUNT
      );
      expect(mcpProperty('optimize_deck', 'maxIterations')).toMatchObject({
        minimum: 1,
        maximum: 12,
      });
      expect(mcpProperty('optimize_deck', 'stopWhenScore')).toMatchObject({
        minimum: 0,
        maximum: 100,
      });
    });

    it('search_cards query and card fields match Zod string bounds', () => {
      expect(mcpProperty('search_cards', 'query').maxLength).toBe(SEARCH_QUERY_MAX_LENGTH);
      expect(mcpProperty('search_cards', 'commanderName').maxLength).toBe(
        COMMANDER_NAME_MAX_LENGTH
      );
      expect(mcpProperty('search_cards', 'excludeNames').maxItems).toBe(
        CARD_NAME_LIST_MAX_COUNT
      );
    });

    it('resolve_card cardName matches CardNameSchema bounds', () => {
      expect(mcpProperty('resolve_card', 'cardName')).toMatchObject({
        minLength: 1,
        maxLength: CARD_NAME_MAX_LENGTH,
      });
    });

    it('get_user_deck_style question matches STYLE_QUESTION_MAX_LENGTH', () => {
      expect(mcpProperty('get_user_deck_style', 'question').maxLength).toBe(
        STYLE_QUESTION_MAX_LENGTH
      );
    });

    it('get_category_candidates limit matches Zod int bounds', () => {
      expect(mcpProperty('get_category_candidates', 'limit')).toMatchObject({
        minimum: 1,
        maximum: 30,
      });
    });

    it('resource id fields match SafeResourceIdSchema bounds', () => {
      const resourceIdShape = {
        pattern: SAFE_RESOURCE_ID_PATTERN,
        maxLength: RESOURCE_ID_MAX_LENGTH,
      };
      for (const toolName of [
        'analyze_deck',
        'build_deck_from_commander',
        'optimize_deck',
        'evaluate_card_swap',
      ] as const) {
        expect(mcpProperty(toolName, 'templateId')).toMatchObject(resourceIdShape);
        expect(mcpProperty(toolName, 'bracketId')).toMatchObject(resourceIdShape);
      }
      for (const toolName of [
        'analyze_deck',
        'build_deck_from_commander',
        'get_category_candidates',
        'search_cards',
        'optimize_deck',
        'evaluate_card_swap',
        'get_strategy_guide',
        'get_user_deck_style',
      ] as const) {
        expect(mcpProperty(toolName, 'preferredStrategy')).toMatchObject(resourceIdShape);
      }
      expect(mcpProperty('optimize_deck', 'banlistId')).toMatchObject(resourceIdShape);
    });

    it('build_deck_from_commander metaOverride numeric fields match MetaOverrideSchema', () => {
      const meta = mcpProperty('build_deck_from_commander', 'metaOverride');
      const props = meta.properties as Record<string, { minimum?: number; maximum?: number }>;
      expect(props.graveyard_meta_share).toMatchObject({ minimum: 0, maximum: 1 });
      expect(props.creature_meta_share).toMatchObject({ minimum: 0, maximum: 1 });
    });
  });
});
