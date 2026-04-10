# EDHREC API response examples

This folder holds sample JSON responses from the EDHREC JSON API for documentation and tests.

- **URL base:** `https://json.edhrec.com/pages/`
- **Parsing:** `src/core/edhrec.ts` uses `extractSuggestionsFromJson()` which accepts:
  - `container.json_dict.cardlists[].cardviews` (common EDHREC shape)
  - or `cardlists[].cardviews`
  - or `cardviews`
  - or `cards`

Each card entry should have at least `name`; optional: `url`, `rank`, `inclusion`, `salt_score`, `synergy_score`.

## Example endpoints

| Path | Description |
|------|-------------|
| `top/white.json` | Top cards in white |
| `top/multicolor.json` | Top multicolor cards |
| `lands/mono-green.json` | Green lands |
| `lands/lands.json` | Generic lands |
| `commanders/{slug}.json` | Cards for commander (e.g. `atraxa-praetors-voice`) |

## Sample files

- `top-color-sample.json` – minimal structure matching `container.json_dict.cardlists` + `cardviews`.
