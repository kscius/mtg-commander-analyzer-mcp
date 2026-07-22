# User deck style reference (`data/my_decks`)

Read-only library of **your real Commander decks** (imported from Moxfield). The build pipeline uses it to bias **land count** and **mana base staples** toward how you actually build — without copying full lists or mixing EDHREC themes.

## What this is (and is not)

| Yes | No |
|-----|-----|
| Import your Moxfield decks for analysis | Save **generated** decks here |
| Aggregate stats: lands, mix, category averages | Replace Bracket 3 template minimums |
| Bias `build_deck_from_commander` mana base | Auto-pick synergy slug from your history |
| Optional OpenAI narrative on request | Require OpenAI for normal builds |

**Rule:** `data/my_decks` is **import-only**. Generated decklists must never be written to this folder (`assertNotUserDeckLibraryWrite` in code).

## Layout

```
data/my_decks/
  index.json          # manifest (deck names, commanders, paths)
  urls.txt            # source URLs for re-download
  *.txt               # MCP-format lists (Commander: + 1 Card lines)
  *.json              # raw Moxfield payloads
```

Refresh imports:

```bash
npm run decks:download-moxfield
```

Inspect aggregated profile locally:

```bash
npm run decks:user-style-profile
```

## MCP tools

### `get_user_deck_style`

Returns aggregated stats from all imported decks under a nested **`profile`** object (plus top-level `summary`, `deckCount`, `commanderHints`, `nextSuggestedAction`):

- `profile.landCount` (avg, min, max, percentiles)
- `profile.landMixAverages` (basics, fetches, utility lands, …)
- `profile.categoryAverages` (template categories)
- `profile.topLandStaples` — lands you use often (brief mode caps at 12)
- `commanderHints` (top-level) — when `commanderName` is passed, land target + staples for that color identity

| Param | Default | Purpose |
|-------|---------|---------|
| `commanderName` | — | Tailor land target and staple hints |
| `preferredStrategy` | — | Passed through for OpenAI context only |
| `useOpenAI` | **false** | Narrative analysis (needs `OPENAI_API_KEY`) |
| `question` | — | Custom question when `useOpenAI` is true |
| `responseMode` | `brief` | `full` for complete JSON |

**When to call (agent workflow):**

1. User asks how they build decks / mana base preferences.
2. Before a big mana-base overhaul in modo optimizar.
3. Optional context step before first `build_deck_from_commander` if user wants decks “like mine”.

### `build_deck_from_commander` — `useUserStyleReference`

| Value | Behavior |
|-------|----------|
| **true** (default) | Blend template land targets with your historical averages by color identity; prioritize your frequent non-basic lands in mana fill |
| **false** | Template + EDHREC only (ignore `data/my_decks`) |

Leave **true** unless the user asks for a generic or experimental mana base.

## MCP resources

| URI | Content |
|-----|---------|
| `mtg-commander:///user-decks/index` | `data/my_decks/index.json` |
| `mtg-commander:///user-decks/style-profile` | Aggregated `UserDeckStyleProfile` JSON |
| `mtg-commander:///docs/user-deck-style-reference` | This document |

## OpenAI (optional)

- **Build path:** no OpenAI required; bias is deterministic from aggregated stats.
- **Analysis path:** set `OPENAI_API_KEY` in the MCP server environment, then `get_user_deck_style` with `useOpenAI: true` for a natural-language summary of your construction habits.

## Recommended build flow (with style reference)

1. `get_synergies` → user picks **one** slug.
2. *(Optional)* `get_user_deck_style` with `commanderName` — skim land target and staples.
3. `get_strategy_guide` for the slug.
4. `build_deck_from_commander` with `useUserStyleReference: true` (default).
5. `analyze_deck` → `optimize_deck` if needed.

## Implementation map

| Module | Role |
|--------|------|
| `src/core/userDeckPaths.ts` | Library path + write guard |
| `src/core/userDeckLibrary.ts` | Load decks, compute profile |
| `src/core/userDeckStyleLlm.ts` | Optional OpenAI narrative |
| `src/core/templateDeckGenerator.ts` | Land count blend + staple hints |
| `src/core/manabaseLandHeuristics.ts` | Sort land candidates with user staples |

See also: [mana-base-guide.md](./mana-base-guide.md), [AGENTS.md](../AGENTS.md).
