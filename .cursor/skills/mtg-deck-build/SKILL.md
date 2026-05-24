---
name: mtg-deck-build
description: Build a full Bracket 3 Commander deck from a commander using project MCP tools. Use when the user wants a new deck, commander-only input, or build_deck_from_commander flow with one confirmed synergy.
---

# Build Commander deck (this project)

## Flow

1. **`get_synergies`** with `commanderName` — list 2–5 slugs; ask user to pick one.
2. **`get_strategy_guide`** with `commanderName` + `preferredStrategy` — read ratios, packages, anti-patterns before picking cards.
3. **`build_deck_from_commander`** with:
   - `templateId` / `bracketId`: `bracket3`
   - `preferredStrategy`: chosen slug
   - `useTemplateGenerator`: true (default)
   - `useEdhrec` / `useEdhrecAutofill` / `refineUntilStable`: true (defaults)
4. **`analyze_deck`** on the returned list — confirm 100 cards, categories, Bracket 3.
5. If categories are `below` or synergy is weak → **`optimize_deck`** (`maxIterations: 4`) then re-analyze.
6. Review **`buildQualityReport`** and **`suggestedUpgrades`** in the build response for next iterations.

## Rules

- One synergy per deck (`.cursor/rules/deck-synergy.mdc`).
- Never invent card names — use `get_category_candidates`, `search_cards`, or build output only.
- After build, use `get_category_candidates` for category gaps from `prioritizedActions`; apply fixes with `apply_deck_changes` then `analyze_deck`.

## Quality gate before delivery

See `.cursor/rules/deck-quality-checklist.mdc`.
