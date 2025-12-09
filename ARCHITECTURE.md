# Project Architecture

## Overview

`mtg-commander-analyzer-mcp` is a modular TypeScript library designed to analyze and build Magic: The Gathering Commander decks, with the capability to be exposed as an MCP server.

## Design Principles

### 1. Separation of Concerns

- **`src/core/`**: Pure business logic, protocol-independent
  - No MCP dependencies
  - Pure and testable functions
  - Can be used as a standalone library

- **`src/mcp/`**: Protocol/server layer
  - Orchestrates calls to `core/`
  - Handles I/O (stdin/stdout)
  - Full MCP SDK implementation

### 2. Strict Typing

- TypeScript in `strict` mode
- Explicit interfaces for all data contracts
- Type guards for runtime validation when necessary

### 3. Modularity

Each module has a single responsibility:

```
deckParser.ts    → Parsing plain text to data structures
analyzer.ts      → Deck analysis and validation
scryfall.ts      → Scryfall API integration
rulesEngine.ts   → Format rules engine (future)
edhrec.ts        → EDHREC data integration
```

## Data Flow (v0.2.0)

```
Input (stdin)
    ↓
[server.ts] - Reads complete stdin
    ↓
[deckParser.ts] - parseDeckText(deckText)
    ↓
ParsedDeck { cards[], commanderName? }
    ↓
[analyzer.ts] - analyzeDeckBasic(parsed)
    ↓
DeckAnalysis { totalCards, uniqueCards, categoryCounts, notes }
    ↓
[server.ts] - Formats as JSON + metadata
    ↓
Output (stdout)
```

## Main Data Types

### ParsedCardEntry
```typescript
{
  rawLine: string;      // Original deck line
  quantity: number;     // Number of copies
  name: string;         // Card name
}
```

### ParsedDeck
```typescript
{
  commanderName?: string;          // Commander (future)
  cards: ParsedCardEntry[];        // Deck cards
}
```

### DeckAnalysis
```typescript
{
  totalCards: number;              // Total cards
  uniqueCards: number;             // Unique cards
  categoryCounts: {
    lands: CategoryCount;          // Land analysis
  };
  notes: string[];                 // Notes and warnings
}
```

### CategoryCount
```typescript
{
  count: number;                   // Current quantity
  min: number;                     // Recommended minimum
  max: number;                     // Recommended maximum
}
```

## Dependencies

### Production
- `@modelcontextprotocol/sdk` ^1.24.3 - MCP protocol
- `zod` ^4.1.13 - Schema validation

### Development
- `typescript` ^5.0.0
- `ts-node` ^10.9.0
- `@types/node` ^20.0.0

### Future
- HTTP client for Scryfall API
- Caching system for Scryfall data

## NPM Scripts

```json
{
  "build": "tsc",                     // Compile to dist/
  "dev": "ts-node src/mcp/server.ts",  // MCP server
  "mcp": "ts-node src/mcp/server.ts",  // MCP server
  "test:local": "ts-node src/testLocal.ts",      // Local demo
  "test:build": "ts-node src/testBuildLocal.ts", // Build demo
  "test:e2e": "ts-node src/testEndToEnd.ts"      // End-to-end test
}
```

## Technical Roadmap

### v0.3.0+ - Advanced Features
- Commander-specific EDHREC endpoints
- Theme detection and thematic autofill
- Mana curve analysis
- Infinite combo detection
- Support for other brackets (1, 2, 4)
- Additional MCP tool: `optimize_deck`
- MCP Resources: direct Scryfall data access
- MCP Prompts: contextual suggestions

## Testing Strategy

### Current (v0.2.0)
- Manual testing with `testLocal.ts`, `testBuildLocal.ts`
- Validation with known examples
- End-to-end testing with `testEndToEnd.ts`

### Future
- Unit tests with Jest
- Integration tests for MCP tools
- Analysis snapshots for regression
- Property-based testing for parser

## Design Decisions

### Why not auto-detect the commander?
**Decision**: Implemented in v0.2.0

Commander detection requires validation that a card is legendary and of type creature/planeswalker. This requires access to card types from Scryfall.

### Why MCP over REST API?
**Decision**: MCP for AI integration

- MCP provides native integration with AI assistants (Cursor, Claude)
- Standardized protocol for tool discovery and invocation
- Better suited for conversational interfaces
- Can still expose REST API in parallel if needed

### Why TypeScript and not JavaScript?
**Decision**: Type safety + Developer Experience

Deck analysis requires complex data manipulation. TypeScript prevents errors at compile time and improves the development experience.

## Code Conventions

### Naming
- **Interfaces**: PascalCase (e.g., `ParsedDeck`)
- **Functions**: camelCase (e.g., `parseDeckText`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `COMMANDER_DECK_SIZE`)

### Comments
- JSDoc for exported functions
- Inline comments for complex logic
- Examples in JSDoc when useful

### Imports
- Prefer named imports
- Group by: external → internal → types

### Error Handling
- Typed errors and explicit recovery
- Graceful degradation when possible
- Clear error messages for users

## References

- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Scryfall API Docs](https://scryfall.com/docs/api)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [EDHREC](https://edhrec.com/)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
