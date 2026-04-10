# EDHREC API response examples

This folder holds sample JSON responses from the EDHREC JSON API for documentation and tests.

## Base URL

`https://json.edhrec.com/pages/` — requests use paths like `top/white.json` (see [`src/core/edhrec.ts`](../../src/core/edhrec.ts)).

## Card list parsing

`extractEdhrecSuggestionsFromJson()` accepts:

- `container.json_dict.cardlists[].cardviews` (common EDHREC shape)
- or `cardlists[].cardviews`
- or top-level `cardviews`
- or top-level `cards`

Each card entry should have at least `name`. Optional fields mapped into `EdhrecCardSuggestion`: `url`, `rank` (else 1-based index), `inclusion` / `inclusion_rate` / `stats.inclusion` → `inclusionRate` (0–1 or whole percent), `salt_score` / `salt`, `synergy_score` / `synergy`, `num_decks` / `numDecks`, `label` (or `labels[0]`).

## Endpoints used by this project

The client builds URLs as `{base}/{path}` where `path` always includes the `.json` suffix.

### Top cards by color

| Path | Used for |
| ---- | -------- |
| `top/colorless.json` | Color identity ∅ |
| `top/white.json` … `top/green.json` | Monocolor or as part of multicolor merge |
| `top/multicolor.json` | Multicolor identities (combined with mono pages) |

### Lands

| Path | Used for |
| ---- | -------- |
| `lands/colorless.json` | Color identity ∅ |
| `lands/mono-white.json` … `lands/mono-green.json` | Per-color land staples (`lands/mono-{color}`) |
| `lands/lands.json` | Generic utility lands (always merged for non-colorless) |
| `lands/{guild-or-shard}.json` | Two+ colors: guild / shard / wedge / etc. name from internal map (e.g. `azorius`, `esper`, `five-color`) |

### Commander pages

| Path | Used for |
| ---- | -------- |
| `commanders/{slug}.json` | Main commander page: card suggestions + theme discovery (`getCardsForCommander`, `getThemesForCommander`) |
| `commanders/{slug}/{theme}.json` | Theme slice (e.g. tokens, voltron); `theme` comes from `getThemesForCommander` or user input |

### Combos

| Path | Used for |
| ---- | -------- |
| `combos/{slug}.json` | Combo sections parsed from `container.json_dict.cardlists` (or top-level `cardlists`) |

## Theme discovery shapes (not cardlists)

`getThemesForCommander` reads:

- `panels[]` where `panel.tag === "themes"` and `panel.entries[]` with `name` + `slug`
- or `container.json_dict.header.themes[]` / `header.themes[]` with `value` (slug) and `label` (name)

See `commander-themes-panels-sample.json` and `commander-themes-header-sample.json`.

## Combo parsing shape

`getCombosForCommander` expects list-shaped `cardlists` entries with `cardviews[].name`; only lists with **≥ 2** card names are kept. Optional: `header` / `description`, `color_identity`.

See `combos-sample.json`.

## Sample files

| File | Purpose |
| ---- | ------- |
| `top-color-sample.json` | Minimal `container.json_dict.cardlists` + `cardviews` |
| `top-color-rich-sample.json` | Rich `cardviews` (inclusion %, salt, synergy, labels) |
| `top-cards-root-sample.json` | Top-level `cards` array (alternative to `cardviews`) |
| `commander-themes-panels-sample.json` | `panels` + `themes` entries |
| `commander-themes-header-sample.json` | `header.themes` fallback |
| `combos-sample.json` | Combo `cardlists` with multi-card combos |

Tests: `src/core/edhrec.test.ts`.
