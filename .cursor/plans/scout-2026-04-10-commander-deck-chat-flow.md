---
date: 2026-04-10
task: commander-deck-chat-flow
classification: SIMPLE
confidence: HIGH
workflow_type: research
next_command: /plan
---

## Stack summary

- **Proyecto:** `mtg-commander-analyzer-mcp` — servidor MCP en TypeScript (`@modelcontextprotocol/sdk`), stdio, SQLite (`data/cards.db`), Zod.
- **Entrada al “chat”:** El cliente (p. ej. Cursor) envía el mensaje del usuario al modelo; si el MCP del proyecto está habilitado, el modelo puede invocar herramientas `build_deck_from_commander` o `build_deck_with_llm`.
- **Implementación:** `src/mcp/server.ts` registra herramientas y en `CallToolRequestSchema` enruta a `runBuildDeckFromCommander` / `runBuildDeckWithLLM` tras validar con `BuildDeckInputSchema` (`src/core/schemas.ts`).

## Workflow type detected

**research** — documentar el flujo end-to-end (código + capa de agente), sin cambios de implementación.

## Flujo exacto: chat → mazo Commander

### Capa 1 — Chat y política del agente (no ejecutada por el servidor MCP)

1. El usuario pide crear un mazo en el chat de Cursor.
2. Las reglas del repo (p. ej. `.cursor/rules/deck-synergy.mdc`) indican al asistente que **detecte sinergias**, **las liste** y **pregunte cuál elegir** antes de fijar el mazo — es política del asistente; **no** está codificada en `server.ts`.
3. El asistente, si usa el MCP, elige una herramienta y argumentos (`commanderName`, `useTemplateGenerator`, `useEdhrec`, etc.).

### Capa 2 — Servidor MCP (`server.ts`)

4. El cliente MCP envía `tools/call` con el nombre de herramienta y argumentos JSON.
5. **Validación:** `BuildDeckInputSchema.parse(args)` (Zod).
6. **Rama A — `build_deck_with_llm`:**
   - Si `!isLLMAvailable()` → respuesta de error (falta `OPENAI_API_KEY`), `isError: true`.
   - Si hay API key → `runBuildDeckWithLLM` → `src/core/llmDeckBuilder.ts` → `buildDeckWithLLM`.
7. **Rama B — `build_deck_from_commander`:**
   - `runBuildDeckFromCommander` → `src/mcp/buildDeckFromCommanderTool.ts`.
   - Si `useTemplateGenerator === true` y `templateId === 'bracket3'` → `generateDeckFromTemplate` (`templateDeckGenerator.ts`), luego opcionalmente `runIterativeEdhrecAutofill` (`edhrecAutofill.ts`).
   - Si no → `buildDeckFromCommander` (`deckBuilder.ts`): esqueleto + tierras + EDHREC según flags.

### Capa 3 — Qué hace cada camino (resumen técnico)

| Herramienta | Núcleo | Datos / IA |
|-------------|--------|------------|
| `build_deck_from_commander` (template) | `generateDeckFromTemplate` | Plantilla Bracket 3, EDHREC primario, OpenAI fallback en categorías; refinamiento iterativo EDHREC si `useEdhrecAutofill` + contexto EDHREC. |
| `build_deck_from_commander` (legacy) | `buildDeckFromCommander` | Resuelve comandante (`getCardByName`), plantilla, tierras básicas, seed cards, EDHREC opcional y autofill iterativo. |
| `build_deck_with_llm` | `buildDeckWithLLM` | Perfil EDHREC → prompt → OpenAI (`json_object`) → parse JSON 99 cartas → `validateDeck` → `runIterativeEdhrecAutofill` o `analyzeDeckBasic`. |

8. **Salida:** JSON stringificado en `content[0].text` (`BuildDeckResult`: `deck`, `analysis`, `notes`, `edhrecContext`, etc.).

## Relevant files (dependencias)

| Archivo | Depende de | Lo usan |
|---------|------------|---------|
| `src/mcp/server.ts` | `analyzeDeckTool`, `buildDeckFromCommanderTool`, `buildDeckWithLLMTool`, `schemas`, `llmConfig` | Proceso MCP (stdio) |
| `src/mcp/buildDeckFromCommanderTool.ts` | `deckBuilder`, `templateDeckGenerator`, `edhrec`, `edhrecAutofill`, `analyzer` | `server.ts` |
| `src/mcp/buildDeckWithLLMTool.ts` | `llmDeckBuilder` | `server.ts` |
| `src/core/llmDeckBuilder.ts` | `openai`, `edhrec`, `banlist`, `analyzer`, `edhrecAutofill` | `buildDeckWithLLMTool` |
| `src/core/deckBuilder.ts` | `scryfall`, `templates`, `edhrec`, `edhrecAutofill` | `buildDeckFromCommanderTool` |
| `src/core/templateDeckGenerator.ts` | `edhrec`, `autoTags`, `bracket3Validation`, `banlist` | `buildDeckFromCommanderTool` |
| `src/core/edhrecAutofill.ts` | `analyzer`, `categoryUtils`, `bracket3Validation` | Ambos builders |

## Validation commands (verificados en `package.json`)

- `npm run build` — `tsc`
- `npm run dev` / `npm run mcp` — `ts-node src/mcp/server.ts`
- `npm run test:e2e` — `ts-node src/testEndToEnd.ts`
- No hay script `lint` declarado en `package.json`.

## Memory findings

- **devcontext:** Inicializado; contexto de código vacío en la respuesta; intent `implementation_request`.
- **cursor10x `getComprehensiveContext`:** Sin milestones/decisions del repo; episodios similares no relacionados con este MCP.

## Recommended skill / subagent

- **Skill:** `.cursor/skills/mtg-deck-analysis/SKILL.md` para uso operativo de herramientas MCP con usuarios finales.
- **Subagent:** `explore` no necesario — flujo ya trazado desde `server.ts` y core.

## Classification & confidence

- **SIMPLE** — pregunta de comprensión de flujo, un solo hilo causal en el código.
- **Confidence: HIGH** — evidencia directa en `server.ts` y módulos core.

## SequentialThinking

**Skipped** — clasificación clara (research / SIMPLE), un único mapa de flujo sin bifurcaciones de diseño ambiguas.

## Conditional review flags

- **security-review:** no — solo lectura de flujo (superficie: API key en `.env` para LLM; ya documentada en código).
- **database-schema-designer:** no.
- **write-unit-tests:** no — tarea de documentación.
- **humanizer:** no.
- **reducing-entropy:** no.

## Risks / constraints

- El comportamiento “preguntar sinergia” depende del asistente y reglas Cursor, no del binario MCP.
- `build_deck_with_llm` falla sin `OPENAI_API_KEY` antes de construir.

## Parallelization

N/A (scout de flujo).

## Cursor CLI routing

**recommended_cli: no** — la tarea es entender el flujo; no hay lote mecánico de archivos ni `agent-dispatch.js` en este repo (ruta de hooks del usuario no aplicable al workspace).
