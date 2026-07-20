# Agent guide: Commander deck system (MCP)

**Canonical entry:** [`AGENTS.md`](../AGENTS.md) — tool table, `agentBrief`, `qualityGate`, `responseMode`, and delivery checklist.

This document adds **implementation detail** (mana base, tagging, data files). Do not duplicate the full MCP workflow here; follow AGENTS.md for build → analyze → optimize loops.

## Format rules (non-negotiable)

| Rule | Requirement |
|------|-------------|
| Deck size | **1 commander + 99 mainboard** = 100 cards total |
| Singleton | Max 1 copy per card (basic lands exempt) |
| Color identity | Every mainboard card must fit commander color identity |
| Banlist | `data/Banlist.txt` — tools enforce automatically |
| Bracket 3 | Template `bracket3`, max 3 Game Changers, max 3 extra turns, no MLD, no 2-card wins before T6 |
| Sinergia | **One synergy per deck** — ask the user which theme before optimizing |

## MCP tools (11)

| Tool | When to use |
|------|-------------|
| `get_synergies` | Before building — list theme slugs; ask user to pick one |
| `get_user_deck_style` | Optional — aggregated stats from `data/my_decks` (your imports); land count, mix, staples. `useOpenAI: true` for narrative (needs `OPENAI_API_KEY`) |
| `get_strategy_guide` | After slug chosen — ratios, packages, anti-patterns (`summaryOnly` or `responseMode: brief` for tokens) |
| `build_deck_from_commander` | Generate 99 cards (default path); `useUserStyleReference: true` biases mana base toward your imports |
| `get_category_candidates` | Ranked DB picks for one `below` category |
| `analyze_deck` | Validate, `qualityGate`, `prioritizedActions`, `decklistText` |
| `optimize_deck` | Automated cut/add + EDHREC autofill (up to 4 passes) |
| `apply_deck_changes` | Apply swaps without re-pasting 99 lines |
| `evaluate_card_swap` | Preview one cut/add before applying |
| `search_cards` | Find real cards for adds (FTS + category filters) |
| `resolve_card` | Resolve one name; legality and color fit vs commander |

Tools with **`responseMode`** default to **`"brief"`** (compact JSON). `apply_deck_changes` has no `responseMode` — responses are always compact. Use **`responseMode: "full"`** when you need complete payloads (e.g. full `guideMarkdown`, oracle text, or `recommendations.swaps`).

### `get_synergies`

```json
{ "commanderName": "Shadrix Silverquill" }
```

Returns `synergies[]` with `slug`, `name`, `description`, `exampleCards`, and optional `recommendedStrategy`.

### `search_cards`

```json
{
  "query": "draw",
  "colorIdentity": ["W", "B"],
  "category": "card_draw",
  "commanderLegal": true,
  "limit": 15
}
```

### `analyze_deck`

```json
{
  "deckText": "Commander: Atraxa, Praetors' Voice\n1 Sol Ring\n...",
  "templateId": "bracket3",
  "bracketId": "bracket3",
  "commanderName": "Atraxa, Praetors' Voice",
  "preferredStrategy": "counters"
}
```

- Parses `Commander: <name>` lines in `deckText`.
- Resolves card names to canonical Scryfall names via `data/cards.db` (never invent names).
- Validates **99 mainboard** count and **color identity** when commander is known.
- Returns categories, Bracket 3 warnings, banlist hits, lint report, **`synergyScore`**, **`analysis.prioritizedActions`**, **`qualityGate`**, **`agentBrief`**, and **`decklistText`**. Default **`responseMode: "brief"`** empties `recommendations.cuts`/`adds` and omits `swaps`/`synergyPackages` — use `prioritizedActions`, or pass `responseMode: "full"` for thematic cut/add pairs.

### `build_deck_from_commander`

```json
{
  "commanderName": "Y'shtola, Night's Blessed",
  "templateId": "bracket3",
  "useTemplateGenerator": true,
  "preferredStrategy": "blink",
  "useEdhrecAutofill": true,
  "useUserStyleReference": true,
  "refineUntilStable": true
}
```

- **`useTemplateGenerator`** defaults to **true** for `bracket3` (full 99-card pipeline).
- **`useUserStyleReference`** defaults to **true** — blends land count and prioritizes staple lands from read-only imports in `data/my_decks`. Set **false** for template-only mana. Never write generated decks to `data/my_decks`.
- Legacy skeleton (`useTemplateGenerator: false`) still builds a multi-system mana base for `bracket3`, but does **not** complete a full 99-card non-land list — avoid for production decks. Prefer the default template generator.

### `get_user_deck_style`

```json
{
  "commanderName": "Prosper, Tome-Bound",
  "useOpenAI": false,
  "responseMode": "brief"
}
```

Returns nested `profile` (`landCount`, `landMixAverages`, `categoryAverages`, `topLandStaples`) plus optional top-level `commanderHints`. See `docs/user-deck-style-reference.md`.

### `optimize_deck`

```json
{
  "deckText": "Commander: Shadrix Silverquill\n1 Sol Ring\n...",
  "commanderName": "Shadrix Silverquill",
  "preferredStrategy": "group-slug",
  "templateId": "bracket3",
  "maxIterations": 4
}
```

- Runs **`analyze_deck`** → applies cuts/adds from recommendations and EDHREC autofill → re-analyzes until categories stabilize or `maxIterations` is reached.
- Use when `categories[].status === "below"`, weak `synergyScore`, or after a partial manual edit.
- Always re-check **`decklistText`** and card count (99 mainboard) after optimization.

### `evaluate_card_swap`

```json
{
  "deckText": "...",
  "commanderName": "Shadrix Silverquill",
  "cardToRemove": "Divination",
  "cardToAdd": "Phyrexian Arena",
  "preferredStrategy": "group-slug"
}
```

- Returns `recommendation`: **`proceed`** or **`skip`**, plus `synergyScoreDelta` and `categoryDeltas`.
- Apply manual edits only when `recommendation` is `proceed` unless the user overrides.

### `get_strategy_guide`

```json
{
  "commanderName": "Atraxa, Praetors' Voice",
  "preferredStrategy": "counters"
}
```

- Returns `keyRatios` from `data/strategy-guides.json`. Default **`responseMode: "brief"`** clears `guideMarkdown` (empty string); pass `responseMode: "full"` for the full markdown from `docs/strategy-guides/{slug}.md`, or read the MCP resource `mtg-commander:///strategy-guide/{slug}`.

## Agent vs MCP

- **Cursor (or any MCP host)** is the LLM: thematic picks, explanations, manual swaps.
- **MCP** supplies Scryfall/EDHREC data, template build, validation, and optimization. **OpenAI is optional** (needs `OPENAI_API_KEY`): `get_user_deck_style` + `useOpenAI: true` for narrative, and `build_deck_from_commander` + `useOpenAIEnhancement: true` (default) for category gap-fill from DB candidates. Build bias from `data/my_decks` (`useUserStyleReference`) is deterministic and does not require a key.

## User deck style reference

Imported Moxfield decks live in **`data/my_decks`** (read-only for generated output). The build pipeline reads aggregated stats to bias mana base — not full list cloning.

| Action | Command / tool |
|--------|----------------|
| Re-download from Moxfield | `npm run decks:download-moxfield` |
| Print profile JSON | `npm run decks:user-style-profile` |
| MCP profile | `get_user_deck_style` or resource `mtg-commander:///user-decks/style-profile` |
| Agent guide | `docs/user-deck-style-reference.md` |

## Mana base: four systems

Implemented in `src/core/manaBaseGenerator.ts` and used by `templateDeckGenerator` / bracket3 skeleton:

| System | Role |
|--------|------|
| **curve_land_count** | Land total from template `land_count` range adjusted by average nonland CMC |
| **template_mix** | Bucket targets from `data/deck-template-bracket3.json` → `mana_base.land_mix` |
| **pip_basics** | Basics split by commander mana pip weights (`allocateBasicsByPips`) |
| **edhrec_synergy** | Non-basic lands from EDHREC commander/color pages with tap caps and fetch policy |

Never ship a bracket3 deck as **basics-only** unless the user explicitly requests it.

## Card name resolution

1. Local DB exact match (`findCardByName`)
2. SQLite FTS on card name (`resolveCardNameSync` / `resolveCardNamesBatch`)
3. Optional Scryfall exact/fuzzy (`getCardByNameWithFallback`) for async flows

`build_deck_from_commander` resolves every added name via the local DB; unresolved names surface in build/analysis notes. Use **`search_cards`** or **`resolve_card`** before manual adds.

Agents must **not** hallucinate card names. If a name does not resolve, report it in analysis notes.

## Primary category tagging

- Heuristics in `autoTags.ts` assign multiple tags; **only one primary** template category counts per card (`getPrimaryTemplateCategory`).
- Analyzer, template generator, and EDHREC autofill share this model (avoids multi-tag category inflation).
- Template fill uses heuristics + EDHREC + SQLite category search; optional OpenAI enhancement only picks names from those DB candidates when `useOpenAIEnhancement` is on and a key is set.

## Data files

| Path | Purpose |
|------|---------|
| `data/cards.db` | Scryfall oracle (source of truth) |
| `data/deck-template-bracket3.json` | Categories, curve, mana_base |
| `data/bracket-rules.json` | Bracket 3 limits |
| `data/Banlist.txt` | Project banlist |
| `data/MagicCompRules.txt` | Rules reference |
| `data/rulings.json` | Rulings |

## Validation commands

```bash
npm run build
npm test
npm run test:golden
npm run benchmark:decks
npm run benchmark:decks -- --json   # writes data/benchmark-latest.json
```

## Related docs

- [deck-pipeline.md](./deck-pipeline.md) — tool flow diagrams
- [optimization-playbook.md](./optimization-playbook.md) — iterative improve loop
- [bracket3-template-for-agents.md](./bracket3-template-for-agents.md) — category mins/maxes
- [synergy-scoring-explained.md](./synergy-scoring-explained.md) — how `synergyScore` is computed
- [scryfall-edhrec-audit.md](./scryfall-edhrec-audit.md) — API coverage and gaps
- [strategy-guides/](./strategy-guides/) — per-slug construction guides
- [.cursor/skills/mtg-deck-analysis/SKILL.md](../.cursor/skills/mtg-deck-analysis/SKILL.md) — agent skill entry point
