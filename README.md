# MTG Commander Deck Analyzer - MCP

> **Current status:** v0.7.0 — Template + EDHREC deck builder for Cursor and other MCP clients (see **[AGENTS.md](./AGENTS.md)**). **No API key required** — the host agent is the LLM; MCP provides data and validation. **Agent chat setup:** [docs/agent-chat-setup.md](./docs/agent-chat-setup.md).

Open-source TypeScript library and MCP server for analyzing and building Magic: The Gathering Commander (EDH) decks.

## 🎯 Project Goals

Provide automated tools to:
- **Analyze existing decks**: format validation, card categorization, bracket analysis, banlist validation
- **Build decks from scratch**: commander-based generation with EDHREC autofill (no budget restrictions)
- **Suggest optimizations**: recommendations based on EDHREC data and Bracket 3 rules
- **Enforce custom banlist**: uses `data/Banlist.txt` to block banned cards from deck building

## 🏗️ Architecture

```
mtg-commander-analyzer-mcp/
├── src/
│   ├── core/                    # Business logic
│   │   ├── deckParser.ts        # Decklist parser
│   │   ├── analyzer.ts          # Advanced deck analysis
│   │   ├── deckBuilder.ts       # Deck builder
│   │   ├── scryfall.ts          # Scryfall integration (auto-uses DB or JSON)
│   │   ├── cardDatabase.ts      # SQLite database queries
│   │   ├── banlist.ts           # Custom banlist enforcement
│   │   ├── edhrec.ts            # EDHREC integration
│   │   ├── autoTags.ts          # Primary-category tagging (roles.ts deprecated shim)
│   │   ├── templates.ts         # Deck templates
│   │   ├── brackets.ts          # Bracket rules
│   │   ├── bracketCards.ts      # Card lists by bracket
│   │   ├── categoryUtils.ts     # Category utilities
│   │   ├── types.ts             # TypeScript interfaces
│   │   └── schemas.ts           # Zod schemas for MCP
│   ├── scripts/                 # Database management scripts
│   │   ├── createDatabase.ts    # Create SQLite schema
│   │   └── importCards.ts       # Stream-import from JSON
│   ├── mcp/                     # MCP server implementation
│   │   ├── server.ts            # MCP server (stdio transport)
│   │   ├── analyzeDeckTool.ts   # analyze_deck tool
│   │   ├── buildDeckFromCommanderTool.ts  # build_deck_from_commander
│   │   ├── searchCardsTool.ts             # search_cards
│   │   └── ...                            # analyze, optimize, synergies, etc.
│   ├── testLocal.ts             # Analysis testing
│   ├── testBuildLocal.ts        # Build testing
│   └── testEndToEnd.ts          # End-to-end testing
├── data/                        # Card data, rules, templates
│   ├── cards.db                 # SQLite database (primary card source)
│   ├── rulings.json             # Card rulings from Scryfall (by oracle_id)
│   ├── MagicCompRules.txt       # Official MTG Comprehensive Rules
│   ├── Banlist.txt              # Custom banlist (one card per line)
│   ├── deck-template-*.json     # Deck templates (Bracket 3)
│   ├── bracket-rules.json       # Bracket rules
│   ├── bracket3-*.json          # Bracket 3 card lists
│   └── edhrec_structures/       # EDHREC JSON data
└── package.json
```

## 🚀 Quick Installation

> 📖 **Detailed Guide**: See [INSTALLATION.md](./INSTALLATION.md) for complete instructions and troubleshooting.

### 1. Clone and Install Dependencies

```bash
# Clone the repository
git clone https://github.com/kscius/mtg-commander-analyzer-mcp.git
cd mtg-commander-analyzer-mcp

# Install dependencies
npm install
```

### 2. Set Up Card Database (REQUIRED)

The project uses SQLite to efficiently query card data. This supports files of any size, including the full Scryfall "All Cards" database (2GB+).

**Option A - Use Pre-existing oracle-cards.json:**

If you already have `data/oracle-cards.json`:

```bash
# Create the database schema
npm run db:create

# Import cards (supports streaming, handles 2GB+ files)
npm run db:import
```

The import script:
- ✅ Uses streaming JSON parsing (never loads full file in memory)
- ✅ Processes ~2,800 cards/second
- ✅ Creates indexes for fast lookups
- ✅ Full-text search support

**Option B - Download Fresh Scryfall Data:**

```bash
# Linux/macOS
chmod +x setup.sh
./setup.sh

# Windows PowerShell
.\setup.ps1
```

Then run the database setup:
```bash
npm run db:create
npm run db:import
```

**Option C - Manual Download:**

1. Visit [Scryfall Bulk Data](https://scryfall.com/docs/api/bulk-data)
2. Download "Oracle Cards" (unique cards) or "All Cards" (all printings)
3. Save as `data/oracle-cards.json`
4. Run `npm run db:create && npm run db:import`

**Database Commands:**

| Command | Description |
|---------|-------------|
| `npm run db:create` | Create empty SQLite database with schema |
| `npm run db:import` | Import cards from `data/oracle-cards.json` |
| `npm run db:import /path/to/file.json` | Import from custom path |

### 2.5 Custom Banlist (Optional)

Edit `data/Banlist.txt` to customize which cards are banned. One card name per line:

```
Mana Crypt
Dockside Extortionist
Black Lotus
Jeweled Lotus
```

**Features:**
- ✅ Banned cards are automatically excluded from deck building autofill
- ✅ Banned seed cards are filtered with a warning
- ✅ Deck analysis shows banlist violations
- ✅ No budget restrictions (only the banlist controls card legality)
- ✅ Case-insensitive matching
- ✅ Supports quantity prefixes (e.g., "1 Mana Crypt")

The default banlist includes 74 cards commonly considered problematic for casual Commander play.

### 2.6 Reference Files for LLM/AI Agents

When using this MCP with an AI agent (Cursor, Claude Desktop, etc.), the agent should always reference these resources for accurate deck building:

| Resource | Purpose |
|----------|---------|
| `data/cards.db` | SQLite database with all card data (use MCP tools to query) |
| `data/rulings.json` | Card-specific rulings from Scryfall (indexed by `oracle_id`) |
| `data/MagicCompRules.txt` | Official Magic: The Gathering Comprehensive Rules |
| `data/Banlist.txt` | Custom banned cards list |

**⚠️ IMPORTANT: Deck Validation Rules**

The AI agent MUST always validate:

1. **Exactly 100 cards** (99 + 1 commander)
2. **All cards within commander's color identity**
3. **No banned cards** (from `data/Banlist.txt`)
4. **Singleton rule** (only 1 copy of each card, except basic lands)
5. **Commander legality** (commander must be a legendary creature or have "can be your commander")

**For card lookups**, the agent should:
- Use the MCP `analyze_deck` or `build_deck_from_commander` tools (they query `cards.db` automatically)
- The SQLite database contains all Scryfall card data with full-text search support

**For complex card interactions**, the agent should:
- Check `data/rulings.json` for official rulings on specific cards
- Reference `data/MagicCompRules.txt` for rules questions (e.g., layers, priority, replacement effects)

### 3. Build (Optional)

```bash
npm run build
```

### 4. Unit tests (Vitest)

```bash
npm test
npm run test:watch   # watch mode during development
```

Pull requests and pushes to `main` / `master` run `npm ci`, `npm run build`, and `npm test` on Node 20 via GitHub Actions (see `.github/workflows/ci.yml`).

## 📖 Usage

### MCP Server (Recommended)

The MCP server exposes **eleven tools** for compatible clients (Cursor, Claude Desktop, etc.):

| Tool | Purpose |
|------|---------|
| `get_synergies` | List EDHREC themes for a commander |
| `get_user_deck_style` | Aggregated mana base / category stats from your imported decks (`data/my_decks`) |
| `get_strategy_guide` | Markdown construction guide for a synergy slug |
| `build_deck_from_commander` | Build 99-card mainboard (template + EDHREC; **preferred**; biases mana toward `data/my_decks` by default) |
| `get_category_candidates` | Ranked DB candidates for a template category (gap-fill without guessing names) |
| `analyze_deck` | Validate decklist, categories, Bracket 3, `qualityGate`, `agentBrief` |
| `optimize_deck` | Iterative analyze → cut/add → EDHREC autofill |
| `apply_deck_changes` | Apply cut/add swaps to `deckText` without re-pasting 99 lines |
| `evaluate_card_swap` | Preview impact of one card swap |
| `search_cards` | Query `cards.db` with synergy-aware sorting |
| `resolve_card` | Resolve one card name + legality/color fit |

See **[AGENTS.md](./AGENTS.md)** for the recommended agent workflow.

**MCP resources** (read-only docs/data via `resources/list` and `resources/read`):

| URI | Content |
|-----|---------|
| `mtg-commander:///template/bracket3` | Bracket 3 deck template JSON |
| `mtg-commander:///banlist` | Project banlist |
| `mtg-commander:///agents` | AGENTS.md |
| `mtg-commander:///strategy-guide/{slug}` | Archetype markdown guides |
| `mtg-commander:///user-decks/index` | Imported deck manifest |
| `mtg-commander:///user-decks/style-profile` | Aggregated user mana-base profile |
| `mtg-commander:///docs/user-deck-style-reference` | Agent guide for personal deck library |

**User deck library:** import your Moxfield lists to `data/my_decks` (`npm run decks:download-moxfield`). Builds use `useUserStyleReference: true` (default) to bias land count and staples — generated decks are **never** saved there. See [docs/user-deck-style-reference.md](./docs/user-deck-style-reference.md).

EDHREC responses are cached on disk at `data/cache/edhrec/` (24h TTL) to speed up repeated builds.

**MCP prompts** (workflow templates via `prompts/list` and `prompts/get`):

| Prompt | Arguments | Purpose |
|--------|-----------|---------|
| `build-commander-deck` | `commanderName` (required), `preferredStrategy` (optional) | Full build workflow + Bracket 3 checklist |
| `optimize-decklist` | `commanderName`, `preferredStrategy` (required), `deckText` (optional) | Optimize loop + quality gate |

**Start the server:**
```bash
npm run mcp
```

The server listens for MCP messages over stdio (stdin/stdout) and remains active awaiting requests.

### Available MCP Tools

#### 1. `analyze_deck`

Analyzes an existing Commander decklist with Bracket 3 validation.

**Input:**
```json
{
  "deckText": "1 Sol Ring\n1 Arcane Signet\n1 Rhystic Study\n37 Island\n...",
  "templateId": "bracket3",
  "bracketId": "bracket3"
}
```

**Output:**
```json
{
  "input": { "deckText": "...", "templateId": "bracket3" },
  "analysis": {
    "commanderName": "Atraxa, Praetors' Voice",
    "totalCards": 99,
    "uniqueCards": 99,
    "categories": [
      { "name": "lands", "count": 37, "min": 35, "max": 38, "status": "within" },
      { "name": "ramp", "count": 9, "min": 9, "max": 12, "status": "within" },
      { "name": "card_draw", "count": 8, "min": 8, "max": 11, "status": "within" },
      { "name": "spot_removal", "count": 6, "min": 4, "max": 7, "status": "within" },
      { "name": "board_wipes", "count": 3, "min": 2, "max": 4, "status": "within" }
    ],
    "bracketWarnings": [
      "This deck uses 2 Game Changers (max allowed for Bracket bracket3: 3)."
    ],
    "notes": ["..."]
  },
  "bracketId": "bracket3",
  "bracketLabel": "Bracket 3 (Upgraded)"
}
```

**Features:**
- ✅ Commander format validation (99 + 1 commander)
- ✅ Automatic categorization (lands, ramp, draw, removal, wipes)
- ✅ Role detection using Scryfall oracle text
- ✅ Bracket 3 validation (Game Changers, mass land denial, extra turns)
- ✅ Category-based recommendations

#### 2. `build_deck_from_commander`

Builds a Commander deck from a commander name with optional EDHREC autofill.

**Input:**
```json
{
  "commanderName": "Atraxa, Praetors' Voice",
  "templateId": "bracket3",
  "bracketId": "bracket3",
  "seedCards": ["Sol Ring", "Arcane Signet"],
  "useEdhrec": true,
  "useEdhrecAutofill": true
}
```

**Output:**
```json
{
  "input": { "commanderName": "Atraxa, Praetors' Voice", ... },
  "deck": {
    "commanderName": "Atraxa, Praetors' Voice",
    "cards": [
      { "name": "Sol Ring", "quantity": 1, "roles": ["ramp"] },
      { "name": "Island", "quantity": 9, "roles": ["land"] },
      { "name": "Talisman of Dominance", "quantity": 1, "roles": ["ramp"] },
      ...
    ]
  },
  "analysis": {
    "totalCards": 99,
    "categories": [ ... ],
    "bracketWarnings": [ ... ]
  },
  "edhrecContext": {
    "sourcesUsed": ["top/multicolor.json", "lands/mono-blue.json", ...],
    "suggestions": [
      { "name": "Assassin's Trophy", "rank": 467886, "category": "top/multicolor" },
      ...
    ]
  },
  "notes": [
    "Commander: Atraxa, Praetors' Voice (Color Identity: BGUW)",
    "✓ EDHREC: Fetched 50 top cards and 50 lands (100 total suggestions).",
    "EDHREC Autofill enabled. Attempting to fill category deficits...",
    "✓ EDHREC Autofill complete: added 16 cards (6 ramp, 4 draw, 5 removal, 1 wipes)",
    ...
  ]
}
```

**Features:**
- ✅ Automatic commander resolution from Scryfall
- ✅ Land base generation based on color identity
- ✅ EDHREC integration (top cards + lands by color)
- ✅ Intelligent autofill for deficit categories
- ✅ Bracket 3 constraint enforcement
- ✅ Color identity validation
- ✅ Role classification for all cards

### Local Testing

**Deck analysis:**
```bash
npm run test:local
```

**Deck building:**
```bash
npm run test:build
```

Both scripts display detailed results in the console.

## 🤖 Agent / LLM (no API key in MCP)

Deck construction and card choices are made by the **host agent** (e.g. Cursor). The MCP server exposes **eleven tools** for building, validation, gap-fill (`get_category_candidates`), incremental edits (`apply_deck_changes`), and optimization. **No OpenAI API key required** — optional `OPENAI_API_KEY` enables narrative `get_user_deck_style` and build category enhancement (`useOpenAIEnhancement`, default true).

Template generation fills category gaps with **EDHREC** plus **local SQLite** lookups (`searchCardsFiltered`, same database as `search_cards`). Build/analyze/optimize default to **`responseMode: "brief"`** (`agentBrief`, `qualityGate`); pass `responseMode: "full"` when you need the complete `analysis` object. Use `get_category_candidates`, `search_cards`, `apply_deck_changes`, or `optimize_deck` when gaps remain after a build.

## 🔧 MCP Client Configuration

### Cursor

Add this to your MCP configuration in Cursor:

```json
{
  "mcpServers": {
    "mtg-commander-analyzer": {
      "command": "npm",
      "args": ["run", "mcp"],
      "cwd": "/path/to/mtg-commander-analyzer-mcp"
    }
  }
}
```

### Claude Desktop

In `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "mtg-commander-analyzer": {
      "command": "npm",
      "args": ["run", "mcp"],
      "cwd": "/path/to/mtg-commander-analyzer-mcp"
    }
  }
}
```

## 🛠️ Current Functionality (v0.7.0)

### ✅ Implemented

**Core:**
- ✅ Decklist parser for `<quantity> <name>` format
- ✅ **SQLite database** for efficient card lookups (supports 2GB+ datasets)
- ✅ **Streaming JSON import** - never loads full file in memory
- ✅ Automatic fallback to JSON file if database unavailable
- ✅ Role classification by type and oracle text (ramp, draw, removal, wipes)
- ✅ Template system (Bracket 3)
- ✅ Bracket 3 rules with card lists
- ✅ **Always-on EDHREC integration** (enabled by default)
- ✅ In-memory caching for EDHREC requests
- ✅ **Custom banlist** (`data/Banlist.txt`) - 74 banned cards
- ✅ **Template deck generator** — EDHREC + SQLite fill for complete 99-card decks

**Database:**
- ✅ Full Scryfall schema with 60+ columns
- ✅ Optimized indexes for common queries
- ✅ Full-text search (FTS5) for card names and oracle text
- ✅ JSON columns for complex data (legalities, prices, images)
- ✅ ~38,000 oracle-unique cards from `data/oracle-cards.json` (default `npm run db:import` path)

**Analysis:**
- ✅ Deck size validation (99 + commander)
- ✅ Automatic categorization (lands, ramp, card_draw, removal, board_wipes)
- ✅ Game Changer, mass land denial, and extra turn detection
- ✅ Comparison vs Bracket 3 template
- ✅ Detailed warnings and recommendations

**Building:**
- ✅ Skeleton generation from commander
- ✅ Automatic basic land distribution by color identity
- ✅ **EDHREC always enabled by default** (can be disabled)
- ✅ EDHREC suggestions (top 50 cards + top 50 lands)
- ✅ Intelligent autofill for deficit categories
- ✅ Color identity validation
- ✅ Bracket 3 constraint enforcement in autofill
- ✅ Post-autofill re-analysis

**MCP Server:**
- ✅ Complete MCP server with @modelcontextprotocol/sdk
- ✅ Stdio transport for universal compatibility
- ✅ Eleven MCP tools: `get_synergies`, `get_user_deck_style`, `get_strategy_guide`, `get_category_candidates`, `search_cards`, `resolve_card`, `build_deck_from_commander`, `analyze_deck`, `optimize_deck`, `apply_deck_changes`, `evaluate_card_swap`. Agent entry: **AGENTS.md**
- ✅ User deck style reference (`data/my_decks`, `useUserStyleReference`, optional OpenAI narrative)
- ✅ Input validation with zod schemas
- ✅ Graceful error handling

### 🔜 Next Steps (v0.4.0+)

- [ ] Commander-specific EDHREC endpoints (`commanders/atraxa.json`)
- [ ] Theme detection and thematic autofill
- [ ] Mana curve analysis
- [ ] Infinite combo detection
- [ ] Support for other brackets (1, 2, 4)
- [x] MCP tool: `optimize_deck` — shipped
- [x] MCP tool: `evaluate_card_swap` — shipped
- [x] MCP tool: `get_strategy_guide` — shipped
- [x] MCP tool: `search_cards` (SQL-powered search + synergy relevance) — shipped
- [x] MCP tool: `get_synergies` — shipped
- [x] MCP Resources: template, banlist, strategy guides, AGENTS.md (`mtg-commander:///` URIs)
- [x] MCP Prompts: `build-commander-deck`, `optimize-decklist` (AGENTS checklist embedded)
- [x] Golden-deck CI artifact: `data/golden/shadrix-group-slug-analyze.expected.json` + `npm run test:golden`
- [ ] MCP Resources: direct Scryfall data access

## 📋 Commander (EDH) Format Rules

- **Deck Size:** Exactly 100 cards (1 commander + 99 deck cards)
- **Singleton:** Maximum 1 copy of each card (except basic lands)
- **Color Identity:** All cards must match the commander's color identity
- **Bracket 3 (Upgraded):**
  - Max 3 Game Changers
  - No mass land destruction
  - Limited extra turn cards

## 🤝 Contributing

This is an open-source project. Contributions welcome:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/new-feature`
3. Commit with clear messages: `git commit -m "feat: add mana curve detection"`
4. Push: `git push origin feature/new-feature`
5. Open a Pull Request

## 📝 Code Conventions

- **TypeScript strict mode** enabled
- **Pure functions** where possible
- **JSDoc comments** for public APIs
- **Separation of concerns:** core (logic) vs mcp (protocol)
- **Testing:** Local scripts before each commit

## 📄 License

MIT License - see LICENSE file for details

## 🔗 References

- [Scryfall API](https://scryfall.com/docs/api)
- [EDHREC](https://edhrec.com/)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Commander Format Rules](https://mtgcommander.net/index.php/rules/)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)

---

**Note:** This project is functional and ready to use. The MCP server is fully implemented and compatible with any MCP client.
