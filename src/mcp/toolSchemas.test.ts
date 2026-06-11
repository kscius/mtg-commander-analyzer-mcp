import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { buildMcpTools } from './toolSchemas';
import {
  AnalyzeDeckInputSchema,
  ApplyDeckChangesInputSchema,
  BuildDeckInputSchema,
  EvaluateCardSwapInputSchema,
  GetCategoryCandidatesInputSchema,
  GetStrategyGuideInputSchema,
  GetSynergiesInputSchema,
  GetUserDeckStyleInputSchema,
  OptimizeDeckInputSchema,
  ResolveCardInputSchema,
  SearchCardsInputSchema,
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
});
