---
date: 2026-04-10
task: mejoras-proceso-analisis-construccion-decks
classification: STANDARD
confidence: MEDIUM
workflow_type: research
next_command: /ks-conductor
---

# Scout: mejoras del proceso — análisis y construcción de mazos

## Stack summary (relevante al proceso)

- **Analizar:** `runAnalyzeDeck` → `parseDeckText` → `analyzeDeckBasic` (`analyzer.ts`): plantilla Bracket 3, banlist, validación Bracket 3, lint con plantilla completa, clasificación de roles/tags, opcional clasificador LLM.
- **Construir:** dos caminos — (A) `useTemplateGenerator` + `generateDeckFromTemplate` + refinamiento EDHREC; (B) `buildDeckFromCommander` legacy (esqueleto + tierras + EDHREC autofill). Tercer camino: `buildDeckWithLLM` → `buildDeckWithLLM` en `llmDeckBuilder.ts` (GPT, EDHREC en prompt, reintentos).
- **Entrada común:** `preferredStrategy` en builds (EDHREC theme); no hay espejo explícito en `analyze_deck` para validar “una sinergia” frente a reglas del proyecto.

## Workflow type

**research** — inventario de mejoras de **proceso de producto** (flujos analizar/construir), sin implementación en este paso.

## Relevant files (proceso)

| Paso | Archivo | Notas de proceso |
|------|---------|------------------|
| Análisis MCP | `src/mcp/analyzeDeckTool.ts` | Orquestación mínima parse → analyze |
| Núcleo análisis | `src/core/analyzer.ts` | Comentario línea ~6: futuro color identity / curva / sinergia / EDHREC en análisis |
| Construcción template | `src/mcp/buildDeckFromCommanderTool.ts`, `templateDeckGenerator.ts` | Rama `useTemplateGenerator` |
| Construcción legacy | `src/core/deckBuilder.ts` | Comentarios “Future improvements” (EDHREC inteligente, tema, curva) |
| LLM | `src/core/llmDeckBuilder.ts`, `src/mcp/buildDeckWithLLMTool.ts` | Prompt fuerte Bracket 3, EDHREC enriquecido, `MAX_LLM_RETRIES` |
| Contratos | `src/core/schemas.ts` | `preferredStrategy` opcional en build |
| Parser | `src/core/deckParser.ts` | Comentario: futuros formatos MTGO/Arena |

## Validation commands (repo)

`npm run build`, `npm test`, `npm run mcp`; scripts manuales `test:local` / `test:e2e` con DB — ver `docs/testing.md`.

## Memory findings

- **DevContext:** inicializado; contexto de código/arquitectura vacío para este workspace.
- **Cursor10x:** sin decisiones previas específicas de este repo en memoria larga.
- **Brainstorming:** omitido — la petición acotó el dominio a **proceso de análisis y construcción de mazos** (no greenfield abierto sin eje).

## Mejoras de proceso propuestas (por flujo)

### A. Proceso de **analizar deck**

1. **Cerrar el gap declarado en código:** `analyzer.ts` menciona futuro trabajo en identidad de color, curva, sinergia y EDHREC “en el análisis” — hoy el análisis es rico en categorías y Bracket 3, pero no hay comparación EDHREC ni “score de coherencia temática” explícito.
2. **Alinear con la regla de proyecto “una sinergia”:** si el usuario indica una sinergia esperada (nuevo campo opcional o convención sobre `deckText`), el sistema podría marcartes fuera de tema o listar cartas poco alineadas (hoy eso no está modelado en `analyze_deck` como `preferredStrategy` en build).
3. **Cartas no resueltas / nombres ambiguos:** mejorar feedback cuando `getCardByName` falla (conteo de “unknown”, sugerencias) — reduce fricción en el pipeline de análisis.
4. **Parser:** ampliar formatos (MTGO, Arena) mencionados como futuro en `deckParser.ts` — mejora el proceso de entrada real de usuarios.

### B. Proceso de **construir deck**

1. **Claridad de dos mundos:** rama template (`useTemplateGenerator`) vs legacy en `deckBuilder.ts` — documentar en herramientas MCP **cuándo** usar cada una y qué calidad esperar (el legacy sigue descrito como esqueleto con mejoras futuras).
2. **Estrategia preferida:** `preferredStrategy` ya alimenta EDHREC en perfiles; reforzar validación post-build (mismo `analyzeDeckBasic`) y notas de builder que expliquen si el tema se reflejó en las cartas elegidas.
3. **Resiliencia EDHREC:** en `buildDeckFromCommanderTool` hay fallbacks (catch con mensajes en notas) — proceso más robusto = códigos de causa, reintentos, o límites de tiempo documentados para integradores.
4. **Camino LLM:** reintentos ya acotados (`MAX_LLM_RETRIES`); mejora de proceso = exponer en resultado (intentos, último error no sensible) para depuración sin exponer secretos.

### C. **Cruzado** (análisis ↔ construcción)

1. **Misma “fuente de verdad” de reglas:** Bracket 3 y banlist ya se comparten; asegurar que cualquier cambio en validación se pruebe en los tres caminos (analyze, build template, build LLM).
2. **Métricas de proceso:** tiempos por fase (parse, DB, EDHREC, OpenAI) en modo debug o logs estructurados — ayuda a optimizar cuellos de botella reales.

## Recommended skill / subagent

- **Priorización:** `requirements-gathering` o Plan Mode para ordenar por impacto (jugadores vs integradores MCP).
- **Implementación futura:** `backend-developer` en core/analyzer y herramientas MCP; revisar **seguridad** en rutas LLM/red al tocar prompts o timeouts.

## Classification & confidence

- **STANDARD:** varios frentes de producto (análisis vs build) con patrones ya presentes.
- **MEDIUM:** priorización depende de si el foco es precisión de análisis, calidad de mazos generados, o DX del consumidor MCP.

## SequentialThinking

Conclusión: mejoras de proceso agrupadas en **enriquecer análisis** (coherencia/sinergia, EDHREC comparativo, parsing), **unificar/comprender caminos de build** (template vs legacy vs LLM), y **observabilidad y errores accionables**. No hay un único cambio arquitectónico obligatorio; sí decisiones de producto (p. ej. sinergia explícita en analyze).

## Conditional flags

| Flag | ¿Activar? | Motivo |
|------|------------|--------|
| security-review | condicional | LLM, llamadas HTTP, datos locales |
| database-schema-designer | no | salvo nuevas tablas/queries de métricas |
| write-unit-tests | sí | si se cambian reglas de análisis o builders |
| humanizer | condicional | textos de error/recomendaciones al usuario final |
| reducing-entropy | condicional | si se fusionan caminos legacy/template |

## Risks

- Añadir “sinergia esperada” al análisis sin definición clara puede dar falsos positivos — requiere criterio de producto.
- EDHREC como dependencia: mejoras de proceso no eliminan rate limits o indisponibilidad externa.

## Parallelization

- Investigación de gaps en `analyzer.ts` vs `deckBuilder.ts` / `templateDeckGenerator.ts` puede hacerse en paralelo; implementación conviene secuencial por dependencia de `schemas` y tipos compartidos.

## Cursor CLI routing

**`recommended_cli: no`**

- Mejora de proceso y priorización de backlog, no batch mecánico de mismo patrón en muchos archivos; no se invoca `agent-dispatch`.
