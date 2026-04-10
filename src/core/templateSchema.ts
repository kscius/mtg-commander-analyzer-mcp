/**
 * templateSchema.ts
 *
 * Zod schema for Bracket 3 deck template validation and meta_adaptations.
 * Supports full template structure: policies, mana_base, curve, categories with constraints, etc.
 */

import { z } from 'zod';

/** =========================
 *  Basic building blocks
 *  ========================= */

const MinMaxSchema = z
  .object({
    min: z.number().int().nonnegative(),
    max: z.number().int().nonnegative(),
  })
  .refine((v) => v.min <= v.max, { message: 'min must be <= max' });

const BudgetModeSchema = z.enum(['cap', 'no_cap']);

/** =========================
 *  policies
 *  ========================= */

const PoliciesSchema = z.object({
  max_game_changers: z.number().int().nonnegative(),
  max_extra_turn_cards: z.number().int().nonnegative(),
  ban_mass_land_denial: z.boolean(),
  ban_extra_turn_chains: z.boolean(),
  ban_2card_gameenders_before_turn: z.number().int().nonnegative(),
  budget: z.object({
    mode: BudgetModeSchema.default('cap'),
    tier: z.string().default('expensive'),
    max_card_price_usd: z.number().nonnegative(),
    max_total_price_usd: z.number().nonnegative(),
    allow_reserve_list: z.boolean(),
  }),
  deck_sizes: z.object({
    main_deck: MinMaxSchema,
    commanders: MinMaxSchema,
    total_deck: z.array(z.number().int().positive()),
  }),
  legality: z
    .object({
      format: z.string().default('commander'),
      enforce_color_identity: z.boolean().default(true),
      allow_acorn: z.boolean().default(false),
    })
    .optional(),
});

/** =========================
 *  mana_base
 *  ========================= */

const LandMixSchema = z
  .object({
    basics: MinMaxSchema,
    utility_lands: MinMaxSchema,
    colorless_lands: MinMaxSchema,
    mdfc_lands: MinMaxSchema,
    fetches: MinMaxSchema,
    typed_duals: MinMaxSchema,
    shock_lands: MinMaxSchema,
    tricycle_lands: MinMaxSchema,
    verge_lands: MinMaxSchema,
    surveil_lands: MinMaxSchema,
    bond_lands: MinMaxSchema.optional(),
    pain_lands: MinMaxSchema.optional(),
    check_lands: MinMaxSchema.optional(),
    slow_lands: MinMaxSchema.optional(),
    fast_lands: MinMaxSchema.optional(),
    filter_lands: MinMaxSchema.optional(),
  })
  .passthrough();

const ManaBaseSchema = z.object({
  land_count: MinMaxSchema,
  land_mix: LandMixSchema,
  tapped_lands: z
    .object({
      max_total: z.number().int().nonnegative().default(8),
      max_etb_tapped_unconditional: z.number().int().nonnegative().default(2),
      count_conditional_as_tapped_when_unmet: z.boolean().default(true),
    })
    .optional(),
  early_untapped: z
    .object({
      min_turn1_total: z.number().int().nonnegative().default(10),
      min_turn2_total: z.number().int().nonnegative().default(16),
      min_turn3_total: z.number().int().nonnegative().default(20),
      min_turn1_by_color: z
        .union([z.literal('auto'), z.record(z.string(), z.number().int().nonnegative())])
        .default('auto'),
      min_turn2_by_color: z
        .union([z.literal('auto'), z.record(z.string(), z.number().int().nonnegative())])
        .default('auto'),
    })
    .optional(),
  fetch_policy: z
    .object({
      min_fetch_targets_per_fetch: z.number().int().nonnegative().default(2),
      min_typed_duals_total: z.number().int().nonnegative().default(4),
      require_basic_targets: z.boolean().default(true),
      allow_nonbasic_only_fetch_plan: z.boolean().default(false),
    })
    .optional(),
  source_counting: z
    .object({
      count_nonlands_as_sources: z.boolean().default(true),
      any_color_rocks_weight: z.number().min(0).max(1).default(0.85),
      fetch_weight: z.number().min(0).max(1).default(0.75),
      mox_like_fast_mana_weight: z.number().min(0).max(1).default(0.9),
      dorks_weight: z.number().min(0).max(1).default(0.8),
      rituals_weight: z.number().min(0).max(1).default(0.3),
      tapped_land_weight_for_t1: z.number().min(0).max(1).default(0),
      tapped_land_weight_for_t2: z.number().min(0).max(1).default(0.5),
    })
    .optional(),
});

/** =========================
 *  color_model
 *  ========================= */

const ColorModelSchema = z.object({
  targets: z.object({
    method: z.enum(['pip_weighted']).default('pip_weighted'),
    base_sources_per_color: z.number().int().nonnegative().default(10),
    base_sources_per_color_by_colors: z
      .record(z.string(), z.number().int().nonnegative())
      .optional(),
    pip_weight: z.number().nonnegative().default(1.3),
    early_turn_weight: z.number().nonnegative().default(1.6),
    commander_weight: z.number().nonnegative().default(1.2),
    mv_weights: z
      .object({
        '0_2': z.number().nonnegative().default(1.6),
        '3_4': z.number().nonnegative().default(1.2),
        '5_plus': z.number().nonnegative().default(1.0),
      })
      .optional(),
    hybrid_pip_split: z.enum(['share', 'full']).default('share'),
    phyrexian_counts_as_color: z.boolean().default(true),
  }),
  commander_cast_targets: z
    .object({
      target_turn: z.number().int().positive().default(3),
      reliability: z.number().min(0).max(1).default(0.8),
    })
    .optional(),
  early_game: z.object({
    need_turn1_play: z.boolean().default(true),
    need_turn2_double_spell: z.boolean().default(false),
    min_untapped_sources_turn1: z.number().int().nonnegative().default(10),
    min_untapped_sources_turn2: z.number().int().nonnegative().default(16),
  }),
  constraints: z.object({
    max_colorless_sources: z.number().int().nonnegative().default(6),
    max_tapped_lands: z.number().int().nonnegative().default(8),
    max_utility_lands_by_colors: z
      .record(z.string(), z.number().int().nonnegative())
      .default({ '2': 6, '3': 4, '4': 3, '5': 2 }),
    max_colorless_lands_by_colors: z
      .record(z.string(), z.number().int().nonnegative())
      .optional(),
    max_tapped_lands_by_colors: z
      .record(z.string(), z.number().int().nonnegative())
      .optional(),
  }),
});

/** =========================
 *  curve
 *  ========================= */

const CurveSchema = z.object({
  max_avg_mv: z.number().positive().default(3.2),
  min_early_plays_mv2_or_less: z.number().int().nonnegative().default(12),
  max_mv5plus_total: z.number().int().nonnegative().default(10),
  limit_pip_heavy_spells_in_4plus_colors: z
    .object({
      pip_threshold_same_color: z.number().int().positive().default(3),
      max_cards: z.number().int().nonnegative().default(6),
    })
    .optional(),
  mv_distribution: z.object({
    '0_1': MinMaxSchema,
    '2': MinMaxSchema,
    '3': MinMaxSchema,
    '4': MinMaxSchema,
    '5_plus': MinMaxSchema,
  }),
});

/** =========================
 *  interaction_coverage
 *  ========================= */

const InteractionCoverageSchema = z.object({
  min_instant_speed_total: z.number().int().nonnegative().default(8),
  min_cheap_interaction_mv2_or_less: z.number().int().nonnegative().default(5),
  coverage_minimums: z.object({
    creature_answers: z.number().int().nonnegative().default(6),
    artifact_answers: z.number().int().nonnegative().default(3),
    enchantment_answers: z.number().int().nonnegative().default(2),
    graveyard_hate: z.number().int().nonnegative().default(2),
    stack_interaction: z
      .union([z.literal('auto'), z.number().int().nonnegative()])
      .default('auto'),
  }),
  quality_constraints: z
    .object({
      min_exile_effects: z.number().int().nonnegative().default(2),
      min_unconditional_removal: z.number().int().nonnegative().default(2),
    })
    .optional(),
});

/** =========================
 *  categories
 *  ========================= */

const CategorySchema = z
  .object({
    name: z.string(),
    min: z.number().int().nonnegative(),
    max: z.number().int().nonnegative(),
    constraints: z.record(z.string(), z.any()).optional(),
  })
  .refine((c) => c.min <= c.max, { message: 'category min must be <= max' });

/** =========================
 *  combo_rules
 *  ========================= */

const ComboRulesSchema = z.object({
  allow_infinite_combos: z.boolean(),
  max_tutors_total: z.number().int().nonnegative(),
  max_unconditional_tutors: z.number().int().nonnegative(),
  max_conditional_tutors: z.number().int().nonnegative().optional(),
  max_transmute_effects: z.number().int().nonnegative().optional(),
  max_fast_mana: z.number().int().nonnegative().optional(),
  max_free_interaction: z.number().int().nonnegative().optional(),
  require_combo_piece_overlap: z.boolean().default(true),
  combo_speed_policy: z
    .object({
      min_turn_to_present_lethal: z.number().int().positive().default(6),
      ban_2card_gameenders_before_turn: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

/** =========================
 *  packages
 *  ========================= */

const PackageSchema = z
  .object({
    name: z.string(),
    min: z.number().int().nonnegative(),
    max: z.number().int().nonnegative(),
    tags: z.array(z.string()).default([]),
  })
  .refine((p) => p.min <= p.max, { message: 'package min must be <= max' });

/** =========================
 *  meta + meta_adaptations
 *  ========================= */

const MetaSchema = z.object({
  average_power_level: z.number().min(1).max(10).default(10),
  fast_combo_density: z.enum(['low', 'mid', 'high']).default('mid'),
  stax_tolerance: z.enum(['low', 'mid', 'high']).default('low'),
  graveyard_meta_share: z.number().min(0).max(1).default(0.3),
  creature_meta_share: z.number().min(0).max(1).default(0.6),
});

const AdaptationIfSchema = z.object({
  field: z.string(),
  op: z.enum(['>', '>=', '<', '<=', '==', '!=', 'in']),
  value: z.any(),
});

const AdaptationThenSchema = z.object({
  set: z.string(),
  value: z.any(),
});

const MetaAdaptationSchema = z.object({
  if: AdaptationIfSchema,
  then: z.array(AdaptationThenSchema).min(1),
});

/** =========================
 *  validation + generator_hints
 *  ========================= */

const ValidationSchema = z.object({
  strictness: z.enum(['hard', 'soft', 'mixed']).default('mixed'),
  hard_constraints: z.array(z.string()).default([]),
  soft_constraints: z.array(z.string()).default([]),
  fail_policy: z
    .object({
      on_hard_fail: z.enum(['regen_section', 'regen_all', 'accept_with_penalty']).default('regen_section'),
      on_soft_fail: z.enum(['regen_section', 'regen_all', 'accept_with_penalty']).default('accept_with_penalty'),
      regen_priority: z.array(z.string()).default(['mana_base']),
    })
    .default({
      on_hard_fail: 'regen_section',
      on_soft_fail: 'accept_with_penalty',
      regen_priority: ['mana_base'],
    }),
});

const GeneratorHintsSchema = z
  .object({
    prefer_on_theme_cards: z.boolean().default(true),
    on_theme_ratio_target: z.number().min(0).max(1).default(0.65),
    max_generic_staples: z.number().int().nonnegative().default(12),
    avoid_cards_mode: z.enum(['hard_ban', 'deprioritize']).default('hard_ban'),
    avoid_cards: z.string().optional(),
    staples_policy: z
      .object({
        mode: z.enum(['low', 'balanced', 'high']).default('balanced'),
        max_edhrec_inclusion_rate: z.number().min(0).max(1).default(0.7),
        min_synergy_score: z.union([z.literal('auto'), z.number()]).default('auto'),
      })
      .optional(),
    scryfall_filters: z
      .object({
        prefer_legal_printings_only: z.boolean().default(true),
        prefer_cheapest_printing: z.boolean().default(false),
        avoid_digital_only: z.boolean().default(true),
      })
      .optional(),
    notes: z.string().optional(),
  })
  .passthrough();

/** =========================
 *  Full template schema (bracket3-style)
 *  ========================= */

export const DeckTemplateSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    policies: PoliciesSchema,
    mana_base: ManaBaseSchema,
    color_model: ColorModelSchema,
    curve: CurveSchema,
    interaction_coverage: InteractionCoverageSchema.optional(),
    categories: z.array(CategorySchema).min(1),
    combo_rules: ComboRulesSchema.optional(),
    packages: z.array(PackageSchema).optional(),
    meta: MetaSchema.optional(),
    meta_adaptations: z.array(MetaAdaptationSchema).optional(),
    validation: ValidationSchema.optional(),
    generator_hints: GeneratorHintsSchema.optional(),
  })
  .passthrough();

export type DeckTemplateValidated = z.infer<typeof DeckTemplateSchema>;

/** =========================
 *  Path helpers
 *  ========================= */

function deepClone<T>(obj: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(obj) as T;
  }
  return JSON.parse(JSON.stringify(obj)) as T;
}

/**
 * Get a value at a dot-separated path (e.g. "meta.graveyard_meta_share").
 */
export function getByPath(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

/**
 * Set a value at a dot-separated path; creates intermediate objects as needed.
 */
export function setByPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    const next = cur[key];
    if (next == null || typeof next !== 'object') {
      cur[key] = {};
    }
    cur = cur[key] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]!] = value;
}

/**
 * setByPath with selector support: "categories[name=board_wipes].min" finds the category with name "board_wipes" and sets "min".
 */
export function setByPathWithSelectors(obj: Record<string, unknown>, path: string, value: unknown): void {
  const selMatch = path.match(/^categories\[name=([^\]]+)\]\.(.+)$/);
  if (selMatch) {
    const name = selMatch[1];
    const rest = selMatch[2];
    const categories = obj.categories;
    if (!Array.isArray(categories)) return;
    const cat = categories.find((c: unknown) => (c as { name?: string })?.name === name);
    if (!cat || typeof cat !== 'object') return;
    const catObj = cat as Record<string, unknown>;
    if (rest.includes('.')) {
      setByPath(catObj, rest, value);
    } else {
      catObj[rest] = value;
    }
    return;
  }
  setByPath(obj, path, value);
}

/** =========================
 *  applyMetaAdaptations
 *  ========================= */

function evalCondition(obj: unknown, cond: z.infer<typeof AdaptationIfSchema>): boolean {
  const left = getByPath(obj, cond.field);
  switch (cond.op) {
    case '>':
      return Number(left) > Number(cond.value);
    case '>=':
      return Number(left) >= Number(cond.value);
    case '<':
      return Number(left) < Number(cond.value);
    case '<=':
      return Number(left) <= Number(cond.value);
    case '==':
      return left === cond.value;
    case '!=':
      return left !== cond.value;
    case 'in':
      return Array.isArray(cond.value) ? cond.value.includes(left) : false;
    default:
      return false;
  }
}

/**
 * Apply meta_adaptations to a template: evaluate each rule's condition and apply then-actions.
 * Optionally merge metaOverride into template.meta before evaluating.
 */
export function applyMetaAdaptations<T extends DeckTemplateValidated>(
  template: T,
  metaOverride?: Partial<z.infer<typeof MetaSchema>>
): T {
  const cloned = deepClone(template) as DeckTemplateValidated & { meta?: z.infer<typeof MetaSchema> };
  if (metaOverride && cloned.meta) {
    cloned.meta = { ...cloned.meta, ...metaOverride };
  } else if (metaOverride) {
    cloned.meta = metaOverride as z.infer<typeof MetaSchema>;
  }
  const adaptations = cloned.meta_adaptations ?? [];
  for (const rule of adaptations) {
    if (evalCondition(cloned, rule.if)) {
      for (const action of rule.then) {
        setByPathWithSelectors(cloned as unknown as Record<string, unknown>, action.set, action.value);
      }
    }
  }
  return cloned as T;
}

/** =========================
 *  parseTemplate
 *  ========================= */

/**
 * Parse and validate a template JSON; applies Zod defaults.
 * Use for bracket3 and any full template. For minimal templates (e.g. default), use loadDeckTemplate which may skip this.
 */
export function parseTemplate(input: unknown): DeckTemplateValidated {
  return DeckTemplateSchema.parse(input) as DeckTemplateValidated;
}

/**
 * Safe parse: returns { success: true, data } or { success: false, error }.
 */
export function safeParseTemplate(
  input: unknown
): { success: true; data: DeckTemplateValidated } | { success: false; error: z.ZodError } {
  const result = DeckTemplateSchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data as DeckTemplateValidated };
  }
  return { success: false, error: result.error };
}
