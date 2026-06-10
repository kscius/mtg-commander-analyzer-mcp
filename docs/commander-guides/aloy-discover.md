# Aloy, Savior of Meridian — Discover / Artifacts (agent guide)

Commander-specific construction notes for **Discover** engines built around **Aloy, Savior of Meridian** (GU). Use with EDHREC slug **`artifacts`** (no separate `discover` slug).

Reference list: `data/reference-decks/aloy-discover-bracket3.txt`

## Commander ability

> Whenever one or more **artifact creatures** you control attack, **discover X**, where X is the greatest power among them.

**Implication:** Only **artifact creature** attackers count. Non-artifact creatures, dinosaur tokens, animated non-artifacts without the artifact creature type, etc. **do not** trigger Discover.

## EDHREC slug

- Use **`preferredStrategy: "artifacts"`** on all MCP tools.
- Discover is expressed through **artifact creatures**, cost reducers, and combat / power payoffs — not a separate slug.

## Core Discover package (do not cut for “synergy score” alone)

| Card | Role |
|------|------|
| **Roaming Throne** | Choose **Human** — Aloy is Human Scout; doubles Discover triggers |
| **Cyberdrive Awakener** | Animates noncreature artifacts as 4/4 flyers → mass attack → high X |
| **Garruk's Uprising** | Trample on attackers; draw when a creature with power 4+ enters |
| **Blightsteel Colossus** / colossi | High power → high Discover X |
| **Etherium Sculptor** / **Foundry Inspector** | Global artifact cost reduction (better than tribal horns) |
| **Panharmonicon** | Doubles triggered abilities → extra Discover on attack |
| **Sensei's Divining Top** | Selection for the whole deck (preferred over narrow tribal filters) |

### Trigger stacking (simplified)

On a combat where artifact creatures attack:

1. Aloy’s ability triggers (Discover X).
2. **Panharmonicon** → that trigger happens an **additional** time.
3. **Roaming Throne** (Human) → each of Aloy’s triggers happens an **additional** time.

Opponents can respond between triggers. This is the deck’s primary explosive line.

## Cards that look good but fail Discover

| Card | Problem |
|------|---------|
| **Herald's Horn** | Chooses a **creature subtype** (Construct, Golem, …), **not** “Artifact”. In crossover lists only ~5–6 cards match **one** choice. Redundant with Sculptor + Inspector. |
| **Scion of Calamity** | Dinosaur — no Discover |
| **Dino DNA** | Token is Dinosaur, not artifact creature — no Discover |
| **Nature's Lore / Three Visits / Farseek / Birds** | Often **no `ramp` primary tag** in this project’s counter (tutor tag or null primary) — do not rely on them for template `ramp` mins |

## Herald's Horn — when to skip

Skip Horn when:

- The list already has **Etherium Sculptor** and **Foundry Inspector** (global `{1}` reduction on artifacts).
- The deck mixes **crossover subtypes** (Alien, Cyberman, Robot, Spider, …) — Horn helps only one narrow band.
- You need **Discover** speed, not tribal filtering → prefer **Sensei's Divining Top** and/or **Panharmonicon**.

If you still run Horn: choose **Construct** (most artifact creatures in typical lists) or **Golem** (Throne, Blightsteel, Karn) — never “Artifact” as a type.

## Category / scoring caveats (MCP analyzer)

### Primary category only

Template counts use **one primary category per card** (`getPrimaryTemplateCategory`). A card may “functionally” remove or draw but count elsewhere or nowhere.

Examples:

- **Soul-Guide Lantern** → often `card_draw` primary, not `graveyard_hate`
- **Cyclonic Rift** → `game_changers`, not `board_wipes`
- **Beast Within** → may have **null** primary (only `combo_piece` tag)

### `win_conditions` in GU

Almost no high-synergy GU cards have `win_condition` as **primary**. Valid primaries include **Biovisionary**, **Luck Bobblehead**, **Maze's End**. Template min is 2 — budget slots even if synergy score is low.

### Deck score vs Discover purity

```
deckScore ≈ synergy×0.4 + categoryCoverage×0.4 + lintHealth×0.2
```

**~95 deck score** needs ~**88+ synergy** plus all categories within range and clean lint. Discover staples (**Roaming Throne**, **Garruk's Uprising**, **Blightsteel**, required wincons) score **low** on `artifacts` slug → **~86–88 deck score** is a realistic ceiling while keeping the strategy.

Do not `optimize_deck` blindly: it may cut Discover pieces or add off-color cards.

## Recommended swaps (validated session 2026-06)

| Out | In | Why |
|-----|-----|-----|
| Herald's Horn | Sensei's Divining Top | Global selection |
| Scion of Calamity | Panharmonicon | Discover triggers, artifact-themed |
| Dino DNA | Pongify | Real instant removal; maintains `spot_removal` |

## Crossover flavor (optional)

Keep if user wants Moxfield flavor: Auton Soldier, Cybermen Squadron, Canoptek Spyder, Diamond Weapon, Iron Spider, Emissary Escort, Simulacrum Synthesizer, Uthros Research Craft, Uthros Titanic Godcore. Most score well on `artifacts`; they spread creature **subtypes** (weakens Herald's Horn).

## Fast mana (Bracket 3)

**Allowed** — not banned by Commander Brackets. Original Aloy import included **Sol Ring**, **Mox Opal**, **Ancient Tomb**, **Mana Vault**; cutting them was a **deck-building** choice, not bracket compliance.

| Card | GC slot? | Notes |
|------|---------|-------|
| Sol Ring | No | Always fine in Bracket 3 |
| Mox Opal | No | Not on official GC list |
| Ancient Tomb, Mana Vault | Yes (each) | Count toward max 3 Game Changers with Cyclonic Rift |
| Mana Crypt | — | **Project banlist** only |

When tuning the list, re-add fast mana if you want speed — watch total Game Changers ≤ 3.

## Anti-patterns

- Adding **non-artifact creatures** for “value” that never trigger Discover.
- Picking **Herald's Horn** thinking it counts all artifact creatures.
- Chasing **deck score 95** by cutting Roaming Throne / Awakener / Garruk (breaks the deck).
- Trusting **`optimize_deck`** without reviewing cuts (may remove key pieces).
- Using **Bane of Progress**-style wipes that destroy your own artifact board.

## MCP workflow

1. `get_synergies` → user confirms **`artifacts`**.
2. Manual list or `build_deck_from_commander` with seeds — **review** output; generator may infer wrong commander or add illegal colors.
3. `analyze_deck` with `preferredStrategy: "artifacts"`.
4. Fix categories with targeted adds (`search_cards` / `get_category_candidates`), not blind optimize.
5. Read **`agentBrief`**, **`qualityGate`**, **`offThemeCards`** in notes — low-scoring Discover staples are expected.

## Related

- [Strategy guide: artifacts](../strategy-guides/artifacts.md)
- [Synergy scoring](../synergy-scoring-explained.md) — deck score formula
- [Card evaluation](../card-evaluation-criteria.md) — commander trigger check
- MCP resource: `mtg-commander:///docs/commander-guides/aloy-discover`
- Structured rules: `data/deck-knowledge/discover-artifact-heuristics.json`
