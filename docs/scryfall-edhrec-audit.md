# Scryfall & EDHREC API audit

Audit date: 2026-05-22. Code references: `src/core/scryfall.ts`, `src/core/edhrec.ts`, `src/scripts/`.

## Scryfall — implemented

| Endpoint / feature | Code | Notes |
|--------------------|------|-------|
| Local `cards.db` | `cardDatabase.ts`, `getCardByName` | Primary path for agents |
| `/cards/named` exact | `fetchCardFromApi` | Online fallback |
| `/cards/named?fuzzy=` | `fetchCardFuzzy` | Typo correction |
| `/cards/search` | `searchScryfallApi` | Query builder for scripts |
| `/cards/autocomplete` | `autocompleteScryfallApi` | Partial name hints |
| `/cards/random` | `fetchRandomCommanderCard` | Exploration |
| Bulk import | `src/scripts/importCards.ts` | Builds `data/cards.db` |
| Rulings import | `src/scripts/importRulings.ts` | `data/rulings.json` |
| `/cards/collection` batch | `scryfallCollection.ts`, `resolveCardNamesBatch` | Up to 75 names per POST; used after local DB miss |

## Scryfall — gaps (high value)

| Gap | Suggested action |
|-----|------------------|
| No set/version preference | Optional `preferSet` when multiple printings |
| No price / image in MCP output | Optional fields for deck export tools |
| Rate limit not centralized in import scripts | Share `scryfallRateLimit()` in scripts |

Explore locally: `npx ts-node src/scripts/exploreScryfallApi.ts`

## EDHREC — implemented

| Feature | Code |
|---------|------|
| Commander page JSON | `getCardsForCommander`, `getFullCommanderProfile` |
| Color/guild land pages | `getTopLandsForColorIdentity`, `getLandsForColorCombination` |
| Color staples | `getTopCardsForColorIdentity` |
| Themes / tags | Profile `themes` |
| Salt filter | `saltThreshold` in profile |
| Combos list | `getCombosForCommander` |
| Synergy sort | `sortBySynergy` |
| **Disk cache** | `edhrecDiskCache.ts` → `data/cache/edhrec/` (24h TTL, env overrides) |

## EDHREC — gaps (high value)

| Gap | Suggested action |
|-----|------------------|
| ~~No HTTP cache headers / ETag~~ | **Done:** disk cache per URL (`src/core/edhrecDiskCache.ts`) |
| Theme slug discovery | Expose `themes[]` in MCP build input validation |
| Average deck / decklists | Parse average-decks JSON for comparison metrics |
| Card view pages | Cross-link card names → inclusion % in MCP analysis |

Explore locally: `npx ts-node src/scripts/exploreEdhrecApi.ts`

## OpenAI / LLM status

- **Removed** from this repo: `build_deck_with_llm`, `requestCardNamesForCategory`, `useLLMFallbackForCategories`, and `OPENAI_*` configuration.
- Template fill uses **EDHREC + local SQLite** (`searchCardsFiltered` in `templateDeckGenerator.ts`, same data as MCP `search_cards`).
- Recommended flow: **`build_deck_from_commander`** + host-agent reasoning + **`analyze_deck`** / **`optimize_deck`** / **`search_cards`** for gaps.
