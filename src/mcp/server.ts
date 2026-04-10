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
import { runBuildDeckWithLLM } from "./buildDeckWithLLMTool";

import {
  AnalyzeDeckInputSchema,
  BuildDeckInputSchema,
} from "../core/schemas";
import { isLLMAvailable, getLLMConfigForLogging } from "../core/llmConfig";

/**
 * Create MCP server instance
 */
const server = new Server(
  {
    name: "mtg-commander-analyzer-mcp",
    version: "0.4.0",
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
          description: "Bracket ID for rule enforcement (e.g., 'bracket3'). Used with templateId when set.",
        },
        preferredStrategy: {
          type: "string",
          description:
            "Optional synergy/theme (e.g. tokens, voltron), same idea as build_deck preferredStrategy; echoed in analysis notes for review (not auto-scored).",
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
            useLLMFallbackForCategories: {
              type: "boolean",
              description: "When true and OPENAI_API_KEY is set, use LLM to tag cards that heuristics leave uncategorized.",
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
      "Build a Commander deck from a commander name. " +
      "With templateId bracket3 and useTemplateGenerator true: builds a full 99-card deck using " +
      "template (mana_base, curve, categories, combo_rules), EDHREC as primary source and OpenAI as fallback. " +
      "Otherwise: skeleton + lands + optional EDHREC autofill. " +
      "By default (refineUntilStable), repeats EDHREC category autofill until template category deficits clear or no progress (maxRefinementIterations). " +
      "Respects Bracket 3 and banlist. Returns built deck and analysis.",
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
        useTemplateGenerator: {
          type: "boolean",
          description: "When true with templateId bracket3, use template-driven generator for full 99-card deck (mana_base, categories, EDHREC + OpenAI fallback). Defaults to false.",
        },
        refineUntilStable: {
          type: "boolean",
          description:
            "When true (default), repeat EDHREC category autofill passes until deficits resolve or iteration cap. When false, only one autofill pass.",
        },
        maxRefinementIterations: {
          type: "number",
          description: "Maximum EDHREC autofill passes when refineUntilStable is true (default 5, max 12).",
        },
      },
      required: ["commanderName"],
    },
  },
  {
    name: "build_deck_with_llm",
    description:
      "Build a COMPLETE 99-card Commander deck using GPT-4.1 AI. " +
      "This tool is FULLY AUTONOMOUS and builds the entire deck without human intervention. " +
      "Uses EDHREC suggestions, respects the custom banlist, and enforces Bracket 3 rules. " +
      "After the LLM list, optionally runs iterative EDHREC category refinement (refineUntilStable, same as build_deck_from_commander). " +
      "Requires OPENAI_API_KEY to be configured in .env file. " +
      "Returns a complete, playable 99-card deck with analysis.",
    inputSchema: {
      type: "object",
      properties: {
        commanderName: {
          type: "string",
          description: "Commander card name (e.g., \"Atraxa, Praetors' Voice\")",
        },
        seedCards: {
          type: "array",
          items: { type: "string" },
          description: "Optional cards to include in the deck (e.g., ['Sol Ring', 'Arcane Signet'])",
        },
        useEdhrec: {
          type: "boolean",
          description: "Whether to fetch EDHREC suggestions to inform card choices. Defaults to true.",
        },
        useEdhrecAutofill: {
          type: "boolean",
          description:
            "When true (default), after the LLM decklist, run iterative EDHREC category autofill to close template deficits. Set false to skip.",
        },
        refineUntilStable: {
          type: "boolean",
          description: "Repeat EDHREC autofill until deficits clear or no progress (default true).",
        },
        maxRefinementIterations: {
          type: "number",
          description: "Max autofill passes (default 5).",
        },
        templateId: { type: "string", description: "Template ID for analysis/refinement (default bracket3)." },
        bracketId: { type: "string", description: "Bracket ID (default bracket3)." },
        banlistId: { type: "string", description: "Banlist ID for analysis." },
        preferredStrategy: { type: "string", description: "Optional EDHREC theme slug." },
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
    } else if (name === "build_deck_with_llm") {
      // Check if LLM is available
      if (!isLLMAvailable()) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: "OpenAI API key not configured",
                message: "Set OPENAI_API_KEY in .env file. See .env.example for template.",
                config: getLLMConfigForLogging(),
              }, null, 2),
            },
          ],
          isError: true,
        };
      }

      // Validate input with zod schema
      const validatedInput = BuildDeckInputSchema.parse(args);
      
      // Execute the LLM-powered tool
      const result = await runBuildDeckWithLLM(validatedInput);

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
