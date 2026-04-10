# EDHREC API response examples

This folder holds sample JSON responses from the EDHREC JSON API for documentation and tests.

- **URL base:** `https://json.edhrec.com/pages/`
- **Parsing:** `src/core/edhrec.ts` exports `extractEdhrecSuggestionsFromJson()` which accepts:
  - `container.json_dict.cardlists[].cardviews` (common EDHREC shape)
  - or `cardlists[].cardviews`
  - or `cardviews`
  - or `cards`

Each card entry should have at least `name`. Optional fields mapped into `EdhrecCardSuggestion`: `url`, `rank` (else 1-based index), `inclusion` → `inclusionRate` (0–1 or whole percent), `salt_score` / `salt`, `synergy_score` / `synergy`, `num_decks` / `numDecks`, `label` (or `labels[0]`).

## Example endpoints


| Path                     | Description                                        |
| ------------------------ | -------------------------------------------------- |
| `top/white.json`         | Top cards in white                                 |
| `top/multicolor.json`    | Top multicolor cards                               |
| `lands/mono-green.json`  | Green lands                                        |
| `lands/lands.json`       | Generic lands                                      |
| `commanders/{slug}.json` | Cards for commander (e.g. `atraxa-praetors-voice`) |


## Sample files

- `top-color-sample.json` – minimal structure matching `container.json_dict.cardlists` + `cardviews`.
- `top-color-rich-sample.json` – includes `inclusion`, `salt_score`, `synergy_score`, `num_decks`, `label`, and percent-style `inclusion` for parser tests.