#!/usr/bin/env node
/**
 * server.ts
 * 
 * MCP (Model Context Protocol) server for MTG Commander Deck Analysis.
 * Exposes deck analysis and deck building tools over stdio transport.
 * 
 * Compatible with MCP clients like Cursor, Claude Desktop, and other AI tools.
 * 
 * Usage:
 *   npm run mcp
 * 
 * Or configure in your MCP client with:
 *   Command: npm
 *   Args: ["run", "mcp"]
 *   Working Directory: /path/to/mtg-commander-analyzer-mcp
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

import { runAnalyzeDeck } from "./analyzeDeckTool";
import { runBuildDeckFromCommander } from "./buildDeckFromCommanderTool";

import {
  AnalyzeDeckInputSchema,
  BuildDeckInputSchema,
} from "../core/schemas";

/**
 * Create MCP server instance
 */
const server = new Server(
  {
    name: "mtg-commander-analyzer-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * Tool definitions
 */
const TOOLS: Tool[] = [
  {
    name: "analyze_deck",
    description: 
      "Analyze a Commander (EDH) decklist using Bracket 3 templates and rules. " +
      "Validates card counts, categorizes cards by role (ramp, draw, removal, etc.), " +
      "checks bracket constraints (Game Changers, mass land denial, extra turns), " +
      "and provides detailed recommendations. Input is raw deck text with one card per line.",
    inputSchema: {
      type: "object",
      properties: {
        deckText: {
          type: "string",
          description: "Raw decklist text, one card per line with quantity (e.g., '1 Sol Ring\\n1 Island')",
        },
        templateId: {
          type: "string",
          description: "Template ID for deck analysis (e.g., 'bracket3'). Defaults to 'bracket3'.",
        },
        banlistId: {
          type: "string",
          description: "Banlist ID (e.g., 'commander'). Reserved for future use.",
        },
        edhrecUrls: {
          type: "array",
          items: { type: "string" },
          description: "EDHREC URLs for additional context. Reserved for future use.",
        },
        bracketId: {
          type: "string",
          description: "Bracket ID for rule enforcement (e.g., 'bracket3'). Defaults to 'bracket3'.",
        },
        options: {
          type: "object",
          properties: {
            inferCommander: {
              type: "boolean",
              description: "Whether to infer commander from decklist. Defaults to true.",
            },
            language: {
              type: "string",
              description: "Language for card names (e.g., 'en'). Reserved for future use.",
            },
          },
        },
      },
      required: ["deckText"],
    },
  },
  {
    name: "build_deck_from_commander",
    description:
      "Build a Commander deck skeleton from a commander name. " +
      "Resolves commander from Scryfall, fills lands based on color identity, " +
      "optionally fetches EDHREC suggestions, and can autofill missing categories " +
      "(ramp, card draw, removal, board wipes) while respecting Bracket 3 constraints. " +
      "Returns a built deck with analysis and recommendations.",
    inputSchema: {
      type: "object",
      properties: {
        commanderName: {
          type: "string",
          description: "Commander card name (e.g., \"Atraxa, Praetors' Voice\")",
        },
        templateId: {
          type: "string",
          description: "Template ID for deck building (e.g., 'bracket3'). Defaults to 'bracket3'.",
        },
        banlistId: {
          type: "string",
          description: "Banlist ID (e.g., 'commander'). Reserved for future use.",
        },
        bracketId: {
          type: "string",
          description: "Bracket ID for rule enforcement (e.g., 'bracket3'). Defaults to 'bracket3'.",
        },
        preferredStrategy: {
          type: "string",
          description: "Preferred strategy or theme (e.g., 'tokens', 'voltron'). Reserved for future use.",
        },
        seedCards: {
          type: "array",
          items: { type: "string" },
          description: "Optional seed cards to include (e.g., ['Sol Ring', 'Arcane Signet'])",
        },
        useEdhrec: {
          type: "boolean",
          description: "Whether to fetch EDHREC suggestions for card recommendations. Defaults to false.",
        },
        useEdhrecAutofill: {
          type: "boolean",
          description: "Whether to autofill missing categories (ramp, draw, removal, wipes) using EDHREC suggestions. Defaults to false.",
        },
      },
      required: ["commanderName"],
    },
  },
];

/**
 * Handler for listing available tools
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: TOOLS,
  };
});

/**
 * Handler for tool execution
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "analyze_deck") {
      // Validate input with zod schema
      const validatedInput = AnalyzeDeckInputSchema.parse(args);
      
      // Execute the tool
      const result = await runAnalyzeDeck(validatedInput);

      // Return MCP-compliant response
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } else if (name === "build_deck_from_commander") {
      // Validate input with zod schema
      const validatedInput = BuildDeckInputSchema.parse(args);
      
      // Execute the tool
      const result = await runBuildDeckFromCommander(validatedInput);

      // Return MCP-compliant response
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } else {
      throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    // Handle errors gracefully
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorStack = error instanceof Error ? error.stack : undefined;

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              error: errorMessage,
              stack: errorStack,
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }
});

/**
 * Main server initialization
 */
async function main() {
  // Log startup message to stderr (so it doesn't interfere with stdio protocol)
  console.error("MTG Commander Analyzer MCP Server starting...");
  console.error("Listening for MCP messages on stdio");

  // Create stdio transport
  const transport = new StdioServerTransport();

  // Connect server to transport
  await server.connect(transport);

  console.error("MCP Server ready. Waiting for client connections...");
}

// Start the server
main().catch((error) => {
  console.error("Fatal error starting MCP server:", error);
  process.exit(1);
});
