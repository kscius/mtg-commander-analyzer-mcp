# Bracket 3 — official rules reference (agents)

Canonical machine-readable policy: **`data/bracket3-policy-reference.json`**.  
Enforcement in this repo: **`data/bracket-rules.json`**, **`data/bracket3-game-changers.json`**, **`src/core/bracket3Validation.ts`**.

## Official sources (review regularly)

| Source | URL | Role |
|--------|-----|------|
| **Moxfield Commander Brackets** | https://moxfield.com/commanderbrackets | UI + community bracket tooling |
| **Wizards — Introducing Brackets** | https://magic.wizards.com/en/news/announcements/introducing-commander-brackets-beta | Canonical Bracket 3 deck-building text |
| **Wizards — April 2025 update** | https://magic.wizards.com/en/news/announcements/commander-brackets-beta-update-april-22-2025 | Game Changers list changes |

**Maintenance:** run `npm run brackets:check-official` at least monthly or after Wizards bracket articles. Updates `data/bracket-official-sources.json` → `lastCheckedAt`.

- **Hard check:** Wizards articles (canonical policy text).
- **Soft check:** [Moxfield Commander Brackets](https://moxfield.com/commanderbrackets) — open in browser if the script reports Cloudflare block; agents should still cite this URL for players.

## What Bracket 3 restricts (hard rules)

From Wizards **Bracket 3: Upgraded**:

- **Up to 3** cards from the official **Game Changers** list
- **No mass land denial**
- **No intentional early-game two-card infinite combos**
- **Extra-turn cards** only in low quantity; not chained or looped

This project mirrors those limits in `analyze_deck` (Game Changers, MLD, extra turns, combo checks).

## Fast mana — allowed (important)

**Bracket 3 does not prohibit fast mana.** Do not reject Sol Ring, Mana Vault, Ancient Tomb, Mox Opal, etc. as “illegal for Bracket 3”.

Nuances from official guidance:

| Card / group | Bracket 3 status |
|--------------|------------------|
| **Sol Ring** | Allowed; **not** a Game Changer (does not use a GC slot) |
| **Mana Vault, Ancient Tomb, Chrome Mox, Grim Monolith, Mox Diamond, …** | Allowed **if** total Game Changers ≤ 3 — these **are** on the GC list |
| **Mox Opal** | Allowed; **not** on the official Game Changers list (does not use a GC slot by default) |
| **Mana Crypt** | Banned in **this project** only (`data/Banlist.txt`), not a Bracket 3 rule |

When optimizing decks, cutting fast mana is a **strategy** choice (curve, synergy, GC budget), **not** bracket compliance.

## Game Changers vs project banlist

- **Game Changers** (`data/bracket3-game-changers.json`) — cap at 3 in Bracket 3; sync when Wizards updates the list (see check script output).
- **Project banlist** (`data/Banlist.txt`) — always illegal in this MCP regardless of bracket.

## Intent over checklist

Wizards stresses that bracket choice includes **deck intent and power**, not checklist alone. A deck with zero Game Changers can still be Bracket 4 if it plays like it. MCP tools enforce measurable rules; agents should not claim Bracket 3 compliance failed solely because a deck is “too strong” without a specific rule violation.

## Related

- [bracket3-template-for-agents.md](./bracket3-template-for-agents.md) — category template
- [AGENTS.md](../AGENTS.md) — quality checklist
- MCP: `mtg-commander:///docs/bracket3-official-rules`, `mtg-commander:///bracket3/policy-reference`
