# Optimization Playbook (LLM agents)

Iterative workflow for improving a Commander deck using this MCP. Prefer template + EDHREC build first; optimize an existing list with this loop.

## Prerequisites

1. User has chosen **one** synergy slug (`get_synergies` → confirm with user).
2. **Commander resolution** depends on the tool:
   - **`analyze_deck`:** set via `commanderName`, a `Commander: Name` line in `deckText`, or **`inferCommander: true`** (default) to pick the first commander-eligible legendary in the list.
   - **`optimize_deck`** and **`evaluate_card_swap`:** require an explicit **`commanderName`** (no `inferCommander`). Run `analyze_deck` first if you only have a decklist line.
   - **`apply_deck_changes`:** `commanderName` is **optional** — color/legality checks fall back to a `Commander: Name` line in `deckText` when omitted.
3. Prefer **`optimize_deck`** for multi-gap fixes; use **`apply_deck_changes`** for batched cut/add after you have verified names.

## Priority order (what to fix first)

1. **Hard format errors** — deck size (99 mainboard), singleton, color identity, legality, banlist (`lintReport` keys `format:*`, `banlistValid`).
2. **Mana base** — land count, tapped land budget, early untapped sources (`manaBaseQuality`, `mana_base:*` lint keys).
3. **Interaction** — spot removal, wipes, graveyard hate, cheap instant-speed answers.
4. **Category deficits** — any `categories[].status === "below"` vs Bracket 3 template.
5. **Synergy** — raise `synergyScore` only after the deck is legal and structurally sound.
6. **Curve polish** — `curveAnalysis` and soft `curve:*` lint issues last.

## Reading `analyze_deck` output

| Field | Use it to |
|-------|-----------|
| `qualityGate.readyToShip` | **Delivery gate** — `blocking[]` must be empty before shipping |
| `qualityGate.blocking` / `polish` | Hard vs nice-to-have gaps |
| `converged` / `remainingGaps` | Whether another MCP pass is likely to help |
| `agentBrief` | Read first in `responseMode: brief` (default) |
| `analysis.deckScore` | Overall health (0–100); track before/after swaps |
| `analysis.strengthsAndWeaknesses` | Quick narrative for user |
| `analysis.prioritizedActions` | Up to 8 next steps (brief mode cap) |
| `analysis.categories` | `below` / `within` / `above` per template slot |
| `analysis.lintReport.ok` | `false` means hard or soft template issues |
| `analysis.lintReport.issues` | `severity: "hard"` must be fixed |
| `analysis.synergyScore` | Thematic fit when `preferredStrategy` set |
| `analysis.manaBaseQuality` | Land count, tapped ratio, early sources |
| `analysis.curveAnalysis` | MV distribution vs template |
| `analysis.recommendations` | Suggested cuts/adds — **brief mode omits swaps/packages**; use `prioritizedActions` or `responseMode: "full"` |
| `decklistText` | Copy-paste mainboard |

## Iteration loop

```
analyze_deck → read qualityGate + prioritizedActions
→ optimize_deck (maxIterations: 4) OR apply_deck_changes / evaluate_card_swap
→ search_cards for remaining gaps → analyze_deck again
```

### `get_category_candidates`

When you need on-theme adds for a **below** category, call `get_category_candidates` with `commanderName`, `preferredStrategy`, and `category` before wide `search_cards` queries.

### `search_cards` tips

- Pass `preferredStrategy` and `commanderName` for `synergyRelevance` and `edhrecInclusionRate`.
- Use `category` when filling template gaps (e.g. `spot_removal`, `card_draw`).
- Provide at least one of: `query`, `category`, `type`, `colorIdentity`, `commanderName`, `maxMV`, or `commanderLegal: false` — empty searches are rejected.

## When to stop (convergence)

Stop optimizing when **all** of the following hold:

- Every `categories[].status` is **`within`** (no `below` or `above` that matters to the user).
- `lintReport.ok` is **true**, or only acceptable soft warnings remain.
- No hard `format:*` issues; `banlistValid` is true.
- `synergyScore` **≥ 60** when a strategy slug is set (or user accepts a lower target).
- `deckScore` is stable across one full pass (no meaningful gain from last 3 swaps).

## Common mistakes

| Mistake | Fix |
|---------|-----|
| Over-cutting synergy pieces | Replace with on-theme cards, not only generic staples |
| Chasing synergy score only | Fix lands and removal first |
| Ignoring curve / avg MV | Add low-CMV ramp and interaction before 6+ MV haymakers |
| Inventing card names | `search_cards` or EDHREC/build output only |
| Mixing strategies | One slug per deck unless user explicitly requests hybrid |
| Too many iterations | Cap at ~4 full passes unless user wants more |

## Strategy context

Read `docs/strategy-guides/<slug>.md` for ratios, packages, and anti-patterns for the chosen archetype.

See also: `AGENTS.md`, `docs/agent-deck-system.md`, `docs/deck-pipeline.md`.
