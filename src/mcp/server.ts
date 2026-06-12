#!/usr/bin/env node

/**

 * MCP (Model Context Protocol) server for MTG Commander Deck Analysis.

 */



import { Server } from '@modelcontextprotocol/sdk/server/index.js';

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import {

  CallToolRequestSchema,

  ListToolsRequestSchema,

  ListResourcesRequestSchema,

  ReadResourceRequestSchema,

  ListPromptsRequestSchema,

  GetPromptRequestSchema,

} from '@modelcontextprotocol/sdk/types.js';

import { ZodError } from 'zod';



import { runAnalyzeDeck } from './analyzeDeckTool';

import { runBuildDeckFromCommander } from './buildDeckFromCommanderTool';

import { runSearchCards } from './searchCardsTool';

import { runGetSynergies } from './getSynergiesByCommanderTool';

import { runEvaluateCardSwap } from './evaluateCardSwapTool';

import { runGetStrategyGuide } from './getStrategyGuideTool';

import { runOptimizeDeck } from './optimizeDeckTool';

import { runResolveCard } from './resolveCardTool';

import { buildMcpTools } from './toolSchemas';
import { listMcpResources, readMcpResource } from './mcpResources';
import { getMcpPrompt, listMcpPrompts } from './mcpPrompts';

import { formatZodValidationError } from './mcpOutputHelpers';
import { formatAuxiliaryMcpJson, formatMcpToolJson, type McpResponseMode } from './mcpResponseFormat';
import { runApplyDeckChanges } from './applyDeckChangesTool';
import { runGetCategoryCandidates } from './getCategoryCandidatesTool';
import { runGetUserDeckStyle } from './getUserDeckStyleTool';

import { isDatabaseReady } from '../core/cardDatabase';
import { getEdhrecCacheStats } from '../core/edhrec';
import { getOpenAIConfigForLogging, isOpenAIAvailable } from '../core/llmConfig';



import {

  AnalyzeDeckInputSchema,

  ApplyDeckChangesInputSchema,

  GetCategoryCandidatesInputSchema,

  GetUserDeckStyleInputSchema,

  BuildDeckInputSchema,

  SearchCardsInputSchema,

  GetSynergiesInputSchema,

  EvaluateCardSwapInputSchema,

  GetStrategyGuideInputSchema,

  OptimizeDeckInputSchema,

  ResolveCardInputSchema,

} from '../core/schemas';



function toolTextResponse(result: unknown, responseMode: McpResponseMode = 'brief') {
  const text =
    result &&
    typeof result === 'object' &&
    (('parsedDeck' in result && 'analysis' in result) ||
      ('deck' in result && 'analysis' in result) ||
      ('changes' in result && 'metricsBefore' in result))
      ? formatMcpToolJson(result, responseMode)
      : formatAuxiliaryMcpJson(result, responseMode);
  return {
    content: [{ type: 'text', text }],
  };
}



const server = new Server(

  {

    name: 'mtg-commander-analyzer-mcp',

    version: '0.7.0',

  },

  {

    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
    },

  }

);



const TOOLS = buildMcpTools();



server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: listMcpResources(),
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;
  try {
    const content = readMcpResource(uri);
    return {
      contents: [
        {
          uri: content.uri,
          mimeType: content.mimeType,
          text: content.text,
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to read resource ${uri}: ${message}`);
  }
});

server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: listMcpPrompts(),
}));

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    return getMcpPrompt(name, args);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to get prompt ${name}: ${message}`);
  }
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {

  const { name, arguments: args } = request.params;



  try {

    if (name === 'analyze_deck') {

      const validatedInput = AnalyzeDeckInputSchema.parse(args);

      const result = await runAnalyzeDeck(validatedInput);

      return toolTextResponse(result, validatedInput.responseMode);

    }



    if (name === 'build_deck_from_commander') {

      const validatedInput = BuildDeckInputSchema.parse(args);

      const result = await runBuildDeckFromCommander(validatedInput);

      return toolTextResponse(result, validatedInput.responseMode);

    }



    if (name === 'get_category_candidates') {
      const validatedInput = GetCategoryCandidatesInputSchema.parse(args);
      const { responseMode, ...toolInput } = validatedInput;
      const result = await runGetCategoryCandidates(toolInput);
      return toolTextResponse(result, responseMode);
    }

    if (name === 'search_cards') {

      const validatedInput = SearchCardsInputSchema.parse(args);

      const { responseMode, ...toolInput } = validatedInput;

      const result = await runSearchCards(toolInput);

      return toolTextResponse(result, responseMode);

    }



    if (name === 'get_synergies') {

      const validatedInput = GetSynergiesInputSchema.parse(args);

      const { responseMode, ...toolInput } = validatedInput;

      const result = await runGetSynergies(toolInput);

      return toolTextResponse(result, responseMode);

    }



    if (name === 'optimize_deck') {

      const validatedInput = OptimizeDeckInputSchema.parse(args);

      const result = await runOptimizeDeck(validatedInput);

      return toolTextResponse(result, validatedInput.responseMode);

    }



    if (name === 'apply_deck_changes') {

      const validatedInput = ApplyDeckChangesInputSchema.parse(args);

      const result = await runApplyDeckChanges(validatedInput);

      return toolTextResponse(result, 'brief');

    }



    if (name === 'resolve_card') {

      const validatedInput = ResolveCardInputSchema.parse(args);

      const { responseMode, ...toolInput } = validatedInput;

      const result = await runResolveCard(toolInput);

      return toolTextResponse(result, responseMode);

    }



    if (name === 'evaluate_card_swap') {

      const validatedInput = EvaluateCardSwapInputSchema.parse(args);

      const { responseMode, ...toolInput } = validatedInput;

      const result = await runEvaluateCardSwap(toolInput);

      return toolTextResponse(result, responseMode);

    }



    if (name === 'get_strategy_guide') {

      const validatedInput = GetStrategyGuideInputSchema.parse(args);

      const { responseMode, ...toolInput } = validatedInput;

      const result = await runGetStrategyGuide(toolInput);

      return toolTextResponse(result, responseMode);

    }

    if (name === 'get_user_deck_style') {
      const validatedInput = GetUserDeckStyleInputSchema.parse(args);
      const result = await runGetUserDeckStyle(validatedInput);
      return toolTextResponse(result, validatedInput.responseMode);
    }



    throw new Error(`Unknown tool: ${name}`);

  } catch (error) {

    if (error instanceof ZodError) {

      return {

        content: [

          {

            type: 'text',

            text: JSON.stringify(

              {

                error: 'Validation failed',

                message: formatZodValidationError(error),

                issues: error.issues,

              },

              null,

              2

            ),

          },

        ],

        isError: true,

      };

    }



    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    const errorStack = error instanceof Error ? error.stack : undefined;



    return {

      content: [

        {

          type: 'text',

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



/** Stdio MCP servers must log to stderr (stdout is JSON-RPC). Single write avoids Cursor logging `undefined` per console.error return value. */
function logStartup(lines: string[]): void {
  process.stderr.write(`${lines.join('\n')}\n`);
}

async function main() {
  const dbReady = isDatabaseReady();
  const edhrecCache = getEdhrecCacheStats();
  const openaiLog = getOpenAIConfigForLogging();
  const transport = new StdioServerTransport();
  await server.connect(transport);

  logStartup([
    'MTG Commander Analyzer MCP Server starting...',
    `OpenAI: ${isOpenAIAvailable() ? 'CONFIGURED' : 'NOT CONFIGURED'} (key=${openaiLog.apiKey}, model=${openaiLog.model}, fast=${openaiLog.modelFast})`,
    'OpenAI usage: only build_deck_from_commander (useOpenAIEnhancement≠false). MCP log lines tagged [OpenAI] on each API call or skip.',
    `Card database: ${dbReady ? 'ready' : 'NOT READY — run npm run db:create && npm run db:import'}`,
    `EDHREC disk cache: ${edhrecCache.diskEntries} entries (${edhrecCache.diskBytes} bytes), TTL ${Math.round(edhrecCache.ttlMs / 3600000)}h → ${edhrecCache.diskDir}`,
    `MCP resources: ${listMcpResources().length} (template, banlist, strategy guides, AGENTS.md)`,
    `MCP prompts: ${listMcpPrompts().length} (build-commander-deck, optimize-decklist)`,
    'Tools: 11 — analyze_deck, build_deck_from_commander, get_category_candidates, search_cards, optimize_deck, apply_deck_changes, resolve_card, get_synergies, evaluate_card_swap, get_strategy_guide, get_user_deck_style',
    'Listening for MCP messages on stdio',
    'MCP Server ready. Waiting for client connections...',
  ]);

}



main().catch((error) => {

  console.error('Fatal error starting MCP server:', error);

  process.exit(1);

});

