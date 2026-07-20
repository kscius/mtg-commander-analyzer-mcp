# Artifacts Strategy Guide

## Key principles

- **Artifacts** as mana, draw, and win conditions (affinity, tokens, combo).
- **Synergy** with artifact types, **metalcraft**, **affinity**, or **sacrifice**.
- **Vulnerability** to artifact hate — run answers or redundancy.

## Recommended ratios

| Role | Count | Notes |
|------|-------|-------|
| Lands | 35–36 | Bracket 3 template min is 35; heavy rocks may push toward the low end of 35–38 |
| Ramp | 12–16 | Rocks are on-theme |
| Artifact payoffs | 10–16 | |
| Artifact creatures / engines | 8–14 | |
| Removal | 5–7 | Include artifact removal for opponents |
| Draw | 8–10 | Often artifact-linked |
| Hate for artifacts | 2–4 | Meta |

## Core card types

- **Rocks**: Sol Ring, Arcane Signet, signets
- **Payoffs**: Etherium Sculptor, Cranial Plating, Urza’s Saga (check banlist)
- **Finishers**: Hellkite Tyrant-style or massive artifact synergies

## Anti-patterns

- **No interaction** with only artifacts.
- **Too few** artifacts for payoff cards.
- Ignoring **Vandalblast** meta without recovery.
- Mixing unrelated **tribal** or **voltron** packages.

## Synergy packages

- **Affordable artifacts + cost reducer**: cheat big spells
- **Sacrifice artifacts**: aristocrat or draw (Deadly Dispute)
- **Treasure / Clue / Food**: artifact tokens + payoffs

## Ideal curve

- Low MV rocks and cheap artifacts; peaks at 4–5 MV
- Avg MV can be lower with many 0–2 MV rocks

## Commander impact

- Artifact commanders (e.g. Urza, Osgir) define **every slot**.
- Colorless staples increase; colored slots for interaction only.

**EDHREC slug:** `artifacts`

## Commander-specific: Aloy, Savior of Meridian (Discover)

When the plan is **Discover on artifact creature attacks** (not generic artifacts):

- Read **`docs/commander-guides/aloy-discover.md`** or MCP `mtg-commander:///docs/commander-guides/aloy-discover`.
- Only **artifact creature** attackers trigger Discover — not Dinosaurs, not Dino DNA tokens.
- **Roaming Throne** → choose **Human**; stack with **Panharmonicon** for multiple Discover triggers.
- **Cyberdrive Awakener** animates artifacts for mass attack / high Discover X.
- Skip **Herald's Horn** when **Etherium Sculptor** + **Foundry Inspector** already reduce costs; Horn picks one **creature subtype**, not “Artifact”.
- Expect **~86–88 deck score** ceiling on `artifacts` slug while keeping the Discover engine (see synergy doc).
- Do not trust blind **`optimize_deck`** to preserve crossover / Discover package.

Reference list: `data/reference-decks/aloy-discover-bracket3.txt`.
