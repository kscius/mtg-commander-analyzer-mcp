# Synergy scoring explained

How **`synergyScore`** (0–100) is computed when `analyze_deck` or `evaluate_card_swap` receives a valid **`preferredStrategy`** EDHREC slug.

## Overview

```
per-card score (0–1)  →  average across nonland mainboard  →  synergyScore (0–100)
```

Implementation: `src/core/synergyScorer.ts`, profiles in `data/strategy-profiles.json`, rules in `data/strategy-scoring-rules.json`.

## Per-card score ingredients

| Signal | Source | Effect |
|--------|--------|--------|
| Base | constant | Starts ~0.2 |
| Primary category boost | `STRATEGY_TAG_BOOST[slug]` | +0.2 if primary tag matches strategy |
| Oracle regex | `strategy-scoring-rules.json` → `oracleBoost` | +weight per match |
| Tag boost | `tagBoost` in rules | +0.08 per matching auto-tag |
| Profile key patterns | `strategy-profiles.json` → `keyPatterns` | +0.18 (first match) |
| Commander overlap | commander oracle text | +0.05–0.15 |
| Anti-patterns | `strategy-profiles.json` → `antisynergyPatterns` | penalty via `strategyAntisynergyPenalty` |
| Scoring anti-patterns | `strategy-scoring-rules.json` → `antiPatterns` | subtract penalty |
| Off-theme tags | `mass_land_denial`, `extra_turn`, `game_changer` | −0.15 (except `group-slug`) |

Lands are **excluded** from the average.

Cards scoring **&lt; 0.42** are flagged as off-theme (up to 12 names). In **`analyze_deck`** output they appear in **`analysis.notes`** as `Possible off-theme cards: …` — there is **no** top-level `analysis.offThemeCards` JSON field.

## Deck-level score

```text
synergyScore = round(100 * sum(cardScore * quantity) / totalNonlandCards)
```

If `preferredStrategy` is omitted, the tool returns **50** (neutral) and does not flag off-theme cards.

## `deckScore` (composite)

When computed (see `src/core/deckQualityReport.ts`):

```text
deckScore ≈ synergyScore×0.4 + categoryCoverage×0.4 + lintHealth×0.2
```

- **Category coverage** rewards all Bracket 3 categories within min–max (primary tag only per card).
- **Lint health** penalizes hard format/bracket/banlist issues.
- A deck can be **`readyToShip`** with **deck score ~86–88** if synergy is capped by slug mismatch — e.g. **Aloy Discover** staples score low on `artifacts` but are required for the strategy. See `docs/commander-guides/aloy-discover.md`.

Chasing **deck score 95** by cutting engine cards usually breaks the deck; fix categories and legality first, then accept realistic synergy ceilings.

## `evaluate_card_swap` usage

Swap evaluation runs `analyze_deck` before and after a simulated cut/add:

- `synergyScoreBefore` / `synergyScoreAfter` / `synergyScoreDelta`
- `recommendation`: **`proceed`** when synergy improves or category fixes outweigh small synergy loss (see `cardSwapEvaluator.ts`)

Always pass the same **`preferredStrategy`** slug used for the deck.

## `search_cards` relevance

With `preferredStrategy` + `commanderName`, results include `synergyRelevance` (`high` | `medium` | `low`) from the same per-card scorer, blended with EDHREC theme data when available.

## Group slug and lifegain

`group-slug` **does not** penalize “you gain life equal to” text (that pattern was removed — it incorrectly downgraded cards like **Sanguine Bond**). Antisynergy targets **symmetric** lifegain that helps opponents (`each opponent gains`, `each player gains life`).

## Improving a low score

1. Fix **legality and categories** first (`lintReport`, `below` slots).
2. Cut cards listed in **`analysis.notes`** (`Possible off-theme cards: …`) or `recommendations.cuts` when using **`responseMode: "full"`**.
3. Add from **`recommendations.synergyPackages`** (full mode) or follow **`analysis.prioritizedActions`** (brief mode, default); see `get_strategy_guide` packages for thematic adds.
4. Use **`search_cards`** with `category` + `preferredStrategy` — never invent names.

> **Brief vs full:** default `responseMode: "brief"` omits `recommendations.cuts`/`adds`/`swaps` and `synergyPackages`. Use `analysis.prioritizedActions` and `qualityGate`, or pass `responseMode: "full"` for thematic cut/add pairs.

## Related

- [strategy-guides/](./strategy-guides/) — construction ratios per slug
- [card-evaluation-criteria.md](./card-evaluation-criteria.md) — qualitative card picks
- [optimization-playbook.md](./optimization-playbook.md) — when to stop optimizing
