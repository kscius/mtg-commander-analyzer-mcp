# Mana Base Guide (Commander / Bracket 3)

Use with `analyze_deck` (`manaBaseQuality`, `lintReport`) and `data/deck-template-bracket3.json`.

## Land counts by deck speed

| Deck profile | Lands (mainboard) | Notes |
|--------------|-------------------|--------|
| Low curve (avg MV ≤ 2.8) | 34–36 | More cheap spells, fewer top-end |
| Mid (avg MV ~3.0–3.2) | 35–38 | Bracket 3 default |
| High curve / ramp-heavy | 36–38 | Extra ramp can justify 35 |

## Color sources (2–5 colors)

- **2 colors**: ~12+ sources of each primary color; prioritize untapped duals and fetches.
- **3 colors**: ~10 sources per color; accept some tapped duals but cap unconditional ETB tapped (template: max 2).
- **4–5 colors**: Lower per-color targets; lean on fetches, shocks, bond lands, and **mana rocks** for fixing.

## Fetch vs dual vs basic

- **Fetches** (if allowed): Pair with at least 2+ fetchable duals/basics per fetch (template `fetch_policy`).
- **Shock / pain / bond / slow lands**: Primary fixing; prefer untapped when possible for turn-1–2 plays.
- **Basics**: 5–16 in Bracket 3 template; enough to support fetch plans and basic-only search effects.

## Tapped lands

- Bracket 3 soft cap: **8 tapped lands** total; **2** unconditional ETB tapped.
- Conditional tapped (e.g. checklands) count as tapped when condition not met.
- Penalize `[tapped]` sources for turn-1 plays in `lintReport`.

## Mana rocks and dorks

| Role | Typical count |
|------|----------------|
| Rocks (MV ≤2) | 6–10 in ramp category |
| Fast mana (Sol Ring, etc.) | ≤3 per template |
| Dorks | 0–6 depending on strategy |

Artifact-heavy strategies can shift ramp toward rocks; creature-heavy toward dorks.

## Common mistakes

- Too few lands with many MV 4+ spells.
- Too many taplands for a low curve.
- Fixing only in green when commander is 4+ colors.
- Counting every rock as untapped colored source (template weights rocks < 1.0 for color pips).

## User style reference (`data/my_decks`)

When **building** new lists, `build_deck_from_commander` defaults to **`useUserStyleReference: true`**, blending template land targets with averages from your imported Moxfield decks and prioritizing lands you use often.

- Profile tool: `get_user_deck_style` (optional `commanderName`, optional `useOpenAI` for narrative).
- Resource: `mtg-commander:///user-decks/style-profile`
- Guide: `docs/user-deck-style-reference.md`

Set `useUserStyleReference: false` to ignore personal imports.

## Agent workflow

1. *(Build)* Keep `useUserStyleReference: true` unless the user wants generic mana.
2. Run `analyze_deck` and read `analysis.manaBaseQuality` and `lintReport` issues keyed `mana_base:*`.
3. Use `search_cards` with `category=lands` and `colorIdentity` matching commander.
4. Re-analyze after changes; stop when `manaBaseQuality.score` ≥ 75 and no hard mana lint issues.
