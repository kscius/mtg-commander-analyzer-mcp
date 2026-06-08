# Card Evaluation Criteria (Commander / Bracket 3)

Use this guide when choosing adds, cuts, or swaps. Every card should earn its slot against the deck’s **one chosen synergy** and the Bracket 3 template.

## Core dimensions

### Mana efficiency (CMC vs effect)

- Compare effect to mana spent at the speed your deck needs.
- Low-curve interaction and ramp are premium in multiplayer; expensive cards must justify being late-game only.
- Avoid redundant high-CMC cards that overlap without improving consistency.

### Versatility

- Modal spells, creatures with ETB + body, and removal that hits multiple types score higher.
- Narrow answers are fine in small numbers if your meta demands them; do not fill the deck with dead cards in most games.

### Commander synergy

- Does the card advance what the commander does every turn?
- Does it protect, enable, or pay off the commander’s strategy?
- Off-theme “goodstuff” dilutes synergy score and confuses the deck’s game plan.

### Redundancy

- Some redundancy is good (multiple draw engines, several removal spells).
- Too many cards that do the **same job at the same cost** waste slots.
- Prefer effects that complement each other (enabler + payoff) over duplicates.

### Speed (early vs late)

- Bracket 3 expects enough early plays (MV ≤2) and interaction; see template curve targets.
- Win conditions can be higher MV if the deck reliably reaches that stage.

### Resilience to removal

- One-shot effects that leave no board presence are weaker than engines that rebuild.
- Protection matters more in voltron; recursion matters more in reanimator/aristocrats.

### Board impact vs card advantage

- Trading 1-for-1 is often losing in multiplayer unless you also develop your plan.
- Prefer cards that affect multiple opponents or generate ongoing advantage.

## Bracket 3–specific checks

- No mass land destruction.
- ≤3 Game Changers and ≤3 extra-turn cards.
- No two-card combos that end the game before turn 6.
- Avoid salt-heavy staples that work against your stated synergy unless the user explicitly wants them.
- Respect project banlist (`data/Banlist.txt`) — automatic in MCP tools.

## Scoring alignment (MCP)

When `analyze_deck` runs with `preferredStrategy`:

- **`synergyScore`** (0–100): thematic fit vs the EDHREC slug.
- **`deckScore`**: composite of synergy, category coverage, and lint/format health.
- **`offThemeCards`**: cards with per-card score &lt; 0.42 — verify before cutting; engine pieces may appear off-theme on the wrong slug (e.g. Roaming Throne on `artifacts` for Aloy Discover).

### Commander ability check

Before adding a card “for synergy”, confirm it interacts with the **commander’s actual trigger or payoff**:

- **Aloy:** only **artifact creatures that attack** trigger Discover — see `docs/commander-guides/aloy-discover.md`.
- **Herald's Horn:** reduces cost for one **creature subtype**, not all artifacts — poor fit for mixed crossover lists with global reducers already present.

## Quick pass/fail

| Question | If “no”, deprioritize the card |
|----------|-------------------------------|
| Does it support the chosen synergy? | Yes |
| Is it within commander color identity? | Yes |
| Is it Commander-legal and not banlisted? | Yes |
| Does it fill a template deficit without breaking another category? | Yes |
| Is the CMC appropriate for the role? | Yes |

## Anti-patterns

- Adding a card only because it is “powerful” in other decks.
- Cutting interaction to fit more synergy pieces without fixing category `below` status.
- Chasing `synergyScore` while ignoring mana base or curve soft failures.
- Inventing card names — always confirm via `search_cards` or build output.
