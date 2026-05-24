# Bracket 3 template reference (agents)

Canonical source: **`data/deck-template-bracket3.json`**. Use this page for quick lookups when reading `analyze_deck` category output.

## Deck size and policies

| Rule | Value |
|------|--------|
| Mainboard | **99** cards (singleton except basics) |
| Commander | **1** (separate from mainboard count in tools) |
| Game Changers | **0–3** |
| Extra turn cards | **0–3** |
| Mass land denial | **Banned** |
| 2-card wins before turn 6 | **Banned** |
| Extra turn chains | **Banned** |

## Category mins and maxes

Each card counts in **one primary category** (`getPrimaryTemplateCategory` in `autoTags.ts`).

| Category | Min | Max | Role |
|----------|-----|-----|------|
| `lands` | 35 | 38 | Mana base (EDHREC + template mix) |
| `ramp` | 9 | 12 | Rocks, dorks, land ramp |
| `card_draw` | 8 | 11 | Repeatable + burst draw |
| `card_selection` | 3 | 6 | Scry, surveil, filter |
| `spot_removal` | 4 | 7 | Single-target (instant-heavy) |
| `artifact_enchantment_hate` | 2 | 5 | Disenchant effects |
| `graveyard_hate` | 1 | 3 | Grave hate |
| `board_wipes` | 2 | 4 | Mass removal |
| `protection` | 3 | 6 | Save commander / key pieces |
| `value_engines` | 3 | 7 | Repeatable advantage |
| `win_conditions` | 2 | 4 | On-theme finishers |
| `game_changers` | 0 | 3 | Hard cap |
| `extra_turns` | 0 | 3 | Hard cap |

## Status fields in `analyze_deck`

| `status` | Meaning |
|----------|---------|
| `below` | Count &lt; `min` — add cards in this category |
| `within` | Count between `min` and `max` |
| `above` | Count &gt; `max` — consider cuts |

## Mana base (template section)

- **Land count** target: 35–38 (lands-matter decks may exceed via strategy guide, not template default).
- **Tapped land budget**: see `mana_base.tapped_lands` in JSON.
- Four generation systems: see [agent-deck-system.md](./agent-deck-system.md#mana-base-four-systems).

## Archetype-specific ratios

Bracket 3 categories are **shared across all decks**. Archetype-specific counts (token makers, blink spells, etc.) live in:

- `data/strategy-guides.json` → `keyRatios`
- `docs/strategy-guides/{slug}.md`

Use **`get_strategy_guide`** after the user picks a synergy slug.

## Related

- [AGENTS.md](../AGENTS.md) — tool flow and quality checklist
- [mana-base-guide.md](./mana-base-guide.md) — land mix and pip basics
- [optimization-playbook.md](./optimization-playbook.md) — fix order when optimizing
