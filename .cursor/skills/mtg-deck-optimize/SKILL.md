---
name: mtg-deck-optimize
description: Optimize an existing Commander decklist with MCP analyze, evaluate_card_swap, search_cards, and strategy guides. Use when the user has a deck to improve for Bracket 3 and a chosen synergy.
---

# Optimize Commander deck (this project)

## Flow

1. Confirm **sinergia** (`get_synergies` if not set).
2. **`get_strategy_guide`** for construction context.
3. **`analyze_deck`** — read `agentBrief` and `qualityGate` first (default `responseMode: "brief"`). Note `categories` (below/above), `synergyScore`, and `analysis.prioritizedActions`.
4. **`optimize_deck`** when multiple categories are `below` or you want automated cut/add + EDHREC autofill:
   - `deckText`, `commanderName`, `preferredStrategy`, `maxIterations: 4` (default)
   - Use returned `decklistText` / updated list for the next step.
5. For **manual** changes, **`evaluate_card_swap`** before editing:
   - Apply only when `recommendation` is `proceed`.
6. **`search_cards`** for gaps (real names, `category`, `colorIdentity`, `preferredStrategy`).
7. Re-**`analyze_deck`** — cap total passes at ~4 unless user asks for more.

## Use rich recommendations

Default **brief** mode keeps `analysis.prioritizedActions` (up to 8 items) and omits full `recommendations` payloads. For paired cut/add lists or synergy packages, call **`analyze_deck`** with `responseMode: "full"`:

- **`recommendations.swaps`**: paired cut → add with impact.
- **`recommendations.synergyPackages`**: add missing package cards from strategy profile.
- **`prioritizedActions`**: tackle highest-impact items first (mana base → interaction → synergy).

## Stop when

- No critical `below` categories, no new Bracket warnings, synergy stable or improved.
