# MTG Commander Deck Analyzer - MCP

> 🎉 **Current Status:** v0.2.0 - Complete MCP Server with advanced analysis, EDHREC integration, and deck building with autofill

Open-source TypeScript library and MCP server for analyzing and building Magic: The Gathering Commander (EDH) decks.

## 🎯 Project Goals

Provide automated tools to:
- **Analyze existing decks**: format validation, card categorization, bracket analysis
- **Build decks from scratch**: commander-based generation with EDHREC autofill
- **Suggest optimizations**: recommendations based on EDHREC data and Bracket 3 rules

## 🏗️ Architecture

```
mtg-commander-analyzer-mcp/
├── src/
│   ├── core/                    # Business logic
│   │   ├── deckParser.ts        # Decklist parser
│   │   ├── analyzer.ts          # Advanced deck analysis
│   │   ├── deckBuilder.ts       # Deck builder
│   │   ├── scryfall.ts          # Scryfall integration
│   │   ├── edhrec.ts            # EDHREC integration
│   │   ├── roles.ts             # Role classification
│   │   ├── templates.ts         # Deck templates
│   │   ├── brackets.ts          # Bracket rules
│   │   ├── bracketCards.ts      # Card lists by bracket
│   │   ├── categoryUtils.ts     # Category utilities
│   │   ├── types.ts             # TypeScript interfaces
│   │   └── schemas.ts           # Zod schemas for MCP
│   ├── mcp/                     # MCP server implementation
│   │   ├── server.ts            # MCP server (stdio transport)
│   │   ├── analyzeDeckTool.ts   # analyze_deck tool
│   │   └── buildDeckFromCommanderTool.ts  # build_deck tool
│   ├── testLocal.ts             # Analysis testing
│   └── testBuildLocal.ts        # Build testing
├── data/                        # Scryfall data, EDHREC, templates
│   ├── oracle-cards.json        # Scryfall database (download separately)
│   ├── templates/               # Deck templates (Bracket 3)
│   ├── brackets/                # Bracket rules
│   ├── bracket3-*.json          # Bracket 3 card lists
│   └── edhrec_structures/       # EDHREC JSON examples
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

### 2. Download Scryfall Data (REQUIRED)

⚠️ **IMPORTANT**: The `oracle-cards.json` file (158 MB) is not included in the repository as it exceeds GitHub's file size limit.

**Option A - Automated Setup (Recommended):**

```bash
# Linux/macOS
chmod +x setup.sh
./setup.sh

# Windows PowerShell
.\setup.ps1
```

The script automatically:
- ✅ Installs npm dependencies
- ✅ Downloads the latest Oracle Cards from Scryfall
- ✅ Saves the file to `data/oracle-cards.json`

**Option B - Manual Download:**

1. Visit [Scryfall Bulk Data](https://scryfall.com/docs/api/bulk-data)
2. In the **Oracle Cards** section, download the latest JSON file
3. Save the file as `data/oracle-cards.json` in your project

**Option C - Direct Command (Linux/macOS/Windows with curl):**

```bash
# Automatically download the latest version
curl -L $(curl -s https://api.scryfall.com/bulk-data/oracle-cards | grep -o '"download_uri":"[^"]*' | cut -d'"' -f4) -o data/oracle-cards.json
```

**Windows PowerShell (Option C):**

```powershell
# Download with PowerShell
$url = (Invoke-RestMethod "https://api.scryfall.com/bulk-data/oracle-cards").download_uri
Invoke-WebRequest -Uri $url -OutFile "data/oracle-cards.json"
```

### 3. Build (Optional)

```bash
npm run build
```

## 📖 Usage

### MCP Server (Recommended)

The MCP server exposes two tools for compatible clients (Cursor, Claude Desktop, etc.):

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

## 🛠️ Current Functionality (v0.2.0)

### ✅ Implemented

**Core:**
- ✅ Decklist parser for `<quantity> <name>` format
- ✅ Complete Scryfall integration (local oracle-cards.json)
- ✅ Role classification by type and oracle text (ramp, draw, removal, wipes)
- ✅ Template system (Bracket 3)
- ✅ Bracket 3 rules with card lists
- ✅ EDHREC JSON endpoints integration (top cards, lands by color)
- ✅ In-memory caching for EDHREC requests

**Analysis:**
- ✅ Deck size validation (99 + commander)
- ✅ Automatic categorization (lands, ramp, card_draw, removal, board_wipes)
- ✅ Game Changer, mass land denial, and extra turn detection
- ✅ Comparison vs Bracket 3 template
- ✅ Detailed warnings and recommendations

**Building:**
- ✅ Skeleton generation from commander
- ✅ Automatic basic land distribution by color identity
- ✅ EDHREC suggestions (top 50 cards + top 50 lands)
- ✅ Intelligent autofill for deficit categories
- ✅ Color identity validation
- ✅ Bracket 3 constraint enforcement in autofill
- ✅ Post-autofill re-analysis

**MCP Server:**
- ✅ Complete MCP server with @modelcontextprotocol/sdk
- ✅ Stdio transport for universal compatibility
- ✅ Two tools: `analyze_deck`, `build_deck_from_commander`
- ✅ Input validation with zod schemas
- ✅ Graceful error handling

### 🔜 Next Steps (v0.3.0+)

- [ ] Commander-specific EDHREC endpoints (`commanders/atraxa.json`)
- [ ] Theme detection and thematic autofill
- [ ] Mana curve analysis
- [ ] Infinite combo detection
- [ ] Support for other brackets (1, 2, 4)
- [ ] Additional MCP tool: `optimize_deck`
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
