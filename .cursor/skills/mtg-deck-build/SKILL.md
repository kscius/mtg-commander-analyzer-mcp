---
name: mtg-deck-build
description: Build a full Bracket 3 Commander deck from a commander using project MCP tools. Use when the user wants a new deck, commander-only input, or build_deck_from_commander flow with one confirmed synergy.
---

# Build Commander deck (this project)

## Flow

1. **`get_synergies`** with `commanderName` — list 2–5 slugs; ask user to pick one.
2. *(Optional)* **`get_user_deck_style`** with `commanderName` — read land count / staple hints from imported decks in `data/my_decks`. Use `useOpenAI: true` only if the user wants a narrative “how I build” summary (`OPENAI_API_KEY` required).
3. **`get_strategy_guide`** with `commanderName` + `preferredStrategy` — read ratios, packages, anti-patterns before picking cards.
4. **`build_deck_from_commander`** with:
   - `templateId` / `bracketId`: `bracket3`
   - `preferredStrategy`: chosen slug
   - `useTemplateGenerator`: true (default)
   - `useEdhrec` / `useEdhrecAutofill` / `refineUntilStable`: true (defaults)
   - `useUserStyleReference`: **true** (default) — biases mana base toward `data/my_decks`; set **false** only if user wants generic template mana
5. **`analyze_deck`** on the returned list — confirm 100 cards, categories, Bracket 3.
6. If categories are `below` or synergy is weak → **`optimize_deck`** (`maxIterations: 4`) then re-analyze.
7. Review **`buildQualityReport`** and **`suggestedUpgrades`** in the build response for next iterations.

## User deck library

- **`data/my_decks`** = your real Moxfield imports (read-only for the system).
- **Never** save generated decklists to `data/my_decks`.
- Reimport: `npm run decks:download-moxfield`
- Local profile dump: `npm run decks:user-style-profile`
- Guide: `docs/user-deck-style-reference.md`

## Commander-specific guides

When building a commander with a validated guide under `docs/commander-guides/`:

1. Read the guide (or MCP resource `mtg-commander:///docs/commander-guides/{name}`) **before** `build_deck_from_commander`.
2. Use structured JSON in `data/deck-knowledge/` when present.
3. Compare final lists to `data/reference-decks/` when available.
4. Do not blind **`optimize_deck`** if the guide warns about false off-theme cuts.

**Aloy Discover:** `.cursor/rules/aloy-discover-deck.mdc`, slug `artifacts`, reference `data/reference-decks/aloy-discover-bracket3.txt`.

## Rules

- One synergy per deck (`.cursor/rules/deck-synergy.mdc`).
- Never invent card names — use `get_category_candidates`, `search_cards`, or build output only.
- After build, use `get_category_candidates` for category gaps from `prioritizedActions`; apply fixes with `apply_deck_changes` then `analyze_deck`.

## Quality gate before delivery

See `.cursor/rules/deck-quality-checklist.mdc`.
