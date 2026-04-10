# MTG Commander Deck Analyzer - MCP

> 🎉 **Current Status:** v0.4.0 - GPT-4.1 LLM deck builder, SQLite database, EDHREC integration, custom banlist

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
│   │   ├── roles.ts             # Role classification
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
│   │   └── buildDeckWithLLMTool.ts        # build_deck_with_llm
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

Pull requests and pushes to `main` / `master` run `npm ci`, `npm run build`, and `npm test` on Node 18 and 20 via GitHub Actions (see `.github/workflows/ci.yml`).

## 📖 Usage

### MCP Server (Recommended)

The MCP server exposes three tools for compatible clients (Cursor, Claude Desktop, etc.): `analyze_deck`, `build_deck_from_commander`, and `build_deck_with_llm` (requires `OPENAI_API_KEY`).

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
      { "name": "ramp", "count": 9, "min": 8, "max": 10, "status": "within" },
      { "name": "card_draw", "count": 8, "min": 8, "max": 10, "status": "within" },
      { "name": "target_removal", "count": 6, "min": 6, "max": 8, "status": "within" },
      { "name": "board_wipes", "count": 3, "min": 3, "max": 4, "status": "within" }
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

#### 3. `build_deck_with_llm` ⭐ NEW

**FULLY AUTONOMOUS** deck builder using GPT-4.1. Builds a complete 99-card deck without human intervention.

> ⚠️ **Requires OpenAI API key.** See [LLM Configuration](#llm-configuration-openai) below.

**Input:**
```json
{
  "commanderName": "Atraxa, Praetors' Voice",
  "seedCards": ["Doubling Season", "Deepglow Skate"]
}
```

**Output:**
```json
{
  "deck": {
    "commanderName": "Atraxa, Praetors' Voice",
    "cards": [
      { "name": "Sol Ring", "quantity": 1, "roles": ["ramp"] },
      { "name": "Breeding Pool", "quantity": 1, "roles": ["land"] },
      ... // EXACTLY 99 cards
    ]
  },
  "analysis": {
    "totalCards": 99,
    "banlistValid": true,
    "categories": [ ... ]
  },
  "notes": [
    "[LLM] Using gpt-4.1 for deck building",
    "Commander: Atraxa, Praetors' Voice (Color Identity: BGUW)",
    "✓ EDHREC: Fetched 100 card suggestions",
    "✓ LLM response received (2847 in, 1923 out)",
    "Strategy: Superfriends/Planeswalker deck focusing on proliferate..."
  ]
}
```

**Features:**
- ✅ **Complete 99-card deck** (not a skeleton)
- ✅ AI-powered card selection based on commander synergy
- ✅ Uses EDHREC data for informed choices
- ✅ Respects custom banlist
- ✅ Validates color identity and singleton rule
- ✅ Bracket 3 power level
- ✅ Cost: ~$0.002-0.01 per deck

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

## 🤖 LLM Configuration (OpenAI)

To use the `build_deck_with_llm` tool, you need to configure an OpenAI API key.

### 1. Get an API Key

1. Go to [OpenAI Platform](https://platform.openai.com/api-keys)
2. Create a new API key
3. Copy the key (starts with `sk-`)

### 2. Configure the Key

Copy the example environment file and add your key:

```bash
cp .env.example .env
```

Edit `.env`:
```env
# Required
OPENAI_API_KEY=sk-your-actual-api-key-here

# Optional (defaults shown)
OPENAI_MODEL=gpt-4.1
OPENAI_TEMPERATURE=0.7
OPENAI_MAX_TOKENS=4096
# OPENAI_BASE_URL=https://api.openai.com/v1
```

### 3. Available Models

| Model | Speed | Cost | Recommendation |
|-------|-------|------|----------------|
| `gpt-4.1` | Fast | ~$0.005/deck | ⭐ **Default** - Best balance |
| `gpt-4o` | Fast | ~$0.01/deck | More creative |
| `gpt-4o-mini` | Fastest | ~$0.001/deck | Most economical |
| `o3-mini` | Slow | ~$0.02/deck | Deep reasoning |

### 4. Verify Configuration

```bash
npm run build
npm run mcp
```

If configured correctly, the `build_deck_with_llm` tool will be available.

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

## 🛠️ Current Functionality (v0.4.0)

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
- ✅ **LLM-powered deck builder** (GPT-4.1) - builds complete 99-card decks

**Database:**
- ✅ Full Scryfall schema with 60+ columns
- ✅ Optimized indexes for common queries
- ✅ Full-text search (FTS5) for card names and oracle text
- ✅ JSON columns for complex data (legalities, prices, images)
- ✅ ~520,000+ cards from "All Cards" bulk data

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
- ✅ Three tools: `analyze_deck`, `build_deck_from_commander`, `build_deck_with_llm` (optional OpenAI)
- ✅ Input validation with zod schemas
- ✅ Graceful error handling

### 🔜 Next Steps (v0.4.0+)

- [ ] Commander-specific EDHREC endpoints (`commanders/atraxa.json`)
- [ ] Theme detection and thematic autofill
- [ ] Mana curve analysis
- [ ] Infinite combo detection
- [ ] Support for other brackets (1, 2, 4)
- [ ] Additional MCP tool: `optimize_deck`
- [ ] Additional MCP tool: `search_cards` (SQL-powered search)
- [ ] MCP Resources: direct Scryfall data access
- [ ] MCP Prompts: contextual suggestions

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
