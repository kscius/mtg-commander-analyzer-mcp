---
date: 2026-04-10
task: mejoras-proyecto
classification: STANDARD
confidence: MEDIUM
workflow_type: research
next_command: /plan
---

# Scout: inventario de mejoras — MTG Commander Analyzer MCP

## Stack summary

- **Runtime:** Node.js ≥18, TypeScript estricto, CommonJS, salida `dist/`.
- **Dominio:** MCP (`@modelcontextprotocol/sdk` stdio), SQLite (`better-sqlite3`), validación Zod v4, OpenAI opcional, streaming JSON para import.
- **Entradas:** `src/mcp/server.ts` (herramientas MCP); lógica en `src/core/*`; datos en `data/`; scripts DB en `src/scripts/*`.
- **Pruebas manuales:** `src/testLocal.ts`, `testBuildLocal.ts`, `testEndToEnd.ts` vía `npm run test:*` (no framework de tests declarado en `package.json`).

## Workflow type

**research** — auditoría y catálogo de mejoras (sin implementación en este paso).

## Relevant files (dependencias breves)

| Área | Archivo / carpeta | Depende de | Le importan |
|------|-------------------|------------|-------------|
| MCP | `src/mcp/server.ts` | herramientas MCP, `schemas`, `llmConfig` | Clientes MCP |
| Análisis | `src/mcp/analyzeDeckTool.ts`, `src/core/analyzer.ts` | `deckParser`, `templates`, `bracket3Validation`, DB | `server.ts` |
| Build | `src/mcp/buildDeckFromCommanderTool.ts`, `src/core/deckBuilder.ts`, `templateDeckGenerator.ts` | EDHREC, Scryfall/DB, plantillas | `server.ts` |
| LLM | `src/mcp/buildDeckWithLLMTool.ts`, `src/core/llmDeckBuilder.ts`, `llmConfig.ts` | OpenAI, schemas | `server.ts` |
| Contratos | `src/core/schemas.ts`, `types.ts` | Zod | Todas las herramientas MCP |
| Datos | `src/core/cardDatabase.ts`, `scripts/*`, `data/*` | SQLite, JSON Scryfall | Core + scripts |
| Doc raíz | `README.md`, `INSTALLATION.md` | — | Contribuidores |

## Validation commands (verificadas en repo)

| Comando | Evidencia |
|---------|-----------|
| `npm install` | `package.json` |
| `npm run build` | `package.json` → `tsc` (**ejecutado OK** en sesión) |
| `npm run dev` / `npm run mcp` | `package.json` |
| `npm run test:local` / `test:build` / `test:e2e` | `package.json` (scripts ts-node) |
| `npm run db:create`, `db:import`, etc. | `package.json` |

**No** hay scripts `lint` ni `test` con runner estándar en `package.json`.

## Memory findings

- **DevContext:** conversación inicializada; contexto de código/arquitectura devuelto vacío (sin ítems recientes en ese MCP para este workspace).
- **Cursor10x:** sin milestones/decisions/requirements relevantes para este repo; similares semánticos apuntan a otros proyectos (no usar como verdad de este repo).
- **Brainstorming:** omitido — el alcance es inventario de mejoras basado en evidencia de repositorio, no diseño de feature ambiguo sin criterios.

## Mejoras propuestas (por categoría)

### Calidad de ingeniería y CI

1. **Añadir runner de tests** (Jest/Vitest o similar) y aserciones sobre parsers, validación Bracket 3, y regresiones MCP; los `test*.ts` actuales son scripts demostrativos, no suite reproducible tipica.
2. **CI en GitHub Actions** (no hay `.github/`): `npm ci`, `npm run build`, y tests cuando existan.
3. **ESLint + Prettier** (no figuran en `package.json`; solo comentarios `eslint-disable` en scripts de import).
4. **Política de lockfile:** `.gitignore` incluye `package-lock.json` — suele preferirse versionar el lock para instalaciones reproducibles (salvo decisión explícita monorepo/yarn distinta).

### Documentación y gobernanza

5. **Carpeta `/docs/`:** las reglas del proyecto piden documentación bajo `/docs/`; el repo se apoya en `README.md` + `INSTALLATION.md` sin `/docs/`.
6. **Alinear README con el código:** el diagrama de arquitectura en `README.md` lista solo dos herramientas MCP; `server.ts` expone tres (`build_deck_with_llm`).
7. **Sincronizar versiones:** `package.json` `0.4.0` vs `server.ts` `version: "0.1.0"` en el constructor del `Server`.
8. **CLAUDE.md** referencia `tasks/todo.md` y `tasks/lessons.md`; no existe carpeta `tasks/` en el árbol actual — crear o actualizar la guía.

### Contratos MCP y tipos

9. **`build_deck_with_llm` reutiliza `BuildDeckInputSchema`:** valorar un schema dedicado si los campos válidos difieren de `build_deck_from_commander` (menos confusión en clientes y documentación).
10. **Schemas de salida:** comentario en `schemas.ts` sobre refinar `AnalyzeDeckResultSchema` con Zod estricto para contratos estables.

### Operación, seguridad y datos

11. **Variables de entorno:** documentar en `/docs/` o README los requisitos (`OPENAI_API_KEY`, rutas a DB, etc.) y riesgos (no loguear claves — revisar `getLLMConfigForLogging`).
12. **Revisión de seguridad** en rutas que llaman a red (Scryfall, EDHREC, OpenAI): timeouts, límites, manejo de errores, entradas grandes.
13. **Estrategia de binarios grandes:** `data/cards.db` y JSONs aparecen como cambios locales frecuentes; definir qué se versiona, qué se genera localmente, y tamaños (ya se ignora `oracle-cards.json`).

### Dominio MTG / producto

14. **Mantenimiento de datos:** banlist, game changers Bracket 3, plantillas — proceso documentado y posiblemente scripts de verificación.
15. **Campos “reserved for future use”** en tool schemas (`banlistId`, `edhrecUrls`, `preferredStrategy`): implementar o acotar documentación para no frustrar a integradores.
16. **Sinergia única (regla `.cursor`):** si el producto debe forzar una sinergia por mazo, evaluar si `preferredStrategy` y validación en analizador deben ser obligatorios u opcionales con UX clara en las herramientas.

## Recommended skill / subagent routing

- **Siguiente fase de priorización:** `requirements-gathering` o Plan Mode para ordenar el backlog con criterios (esfuerzo, riesgo, valor).
- **Si se implementa CI/tests:** `deployment-engineer` / `test-runner` / `backend-developer` según tarea concreta.
- **Recon amplio paralelo:** subagente `explore` (no usado aquí; repo ya mapeado).

## Classification & confidence

- **STANDARD** para este entregable de scout (varias áreas, sin cambio de código).
- **COMPLEX** sería aplicable si el usuario pide ejecutar *todo* el backlog en una sola iniciativa.
- **Confidence MEDIUM:** la priorización de “mejoras” depende de objetivos del mantenedor (OSS vs uso interno, peso de LLM, etc.).

## SequentialThinking

Conclusión: agrupar mejoras en ejes (CI/calidad, docs/consistencia, contratos MCP, seguridad/ops, datos MTG); priorizar con el usuario; no hay un único camino arquitectónico impuesto por el repo. Prioridad sugerida por riesgo/reproducibilidad: **tests + CI + lockfile**, luego **documentación y alineación de versiones/schemas**, luego **hardening de integraciones externas**.

## Conditional review flags

| Flag | ¿Aplicar? | Por qué |
|------|-----------|---------|
| security-review | **Sí** (cuando se toquen LLM/red/env) | APIs externas y secretos |
| database-schema-designer | **Condicional** | Solo si cambia esquema SQLite o migraciones |
| write-unit-tests | **Sí** | Gap claro frente a scripts manuales |
| humanizer | **No** | No es el foco del scout |
| reducing-entropy | **Opcional** | Si hay duplicación real tras auditoría de código |

## Risks / constraints

- Inventario amplio puede parecer “todo a la vez”; sin priorización se paraliza.
- Cambiar contratos MCP rompe clientes; versionar servidor o documentar breaking changes.
- `better-sqlite3` es nativo: CI debe usar matriz OS/Node compatible.

## Parallelization

- Redacción de `/docs/` + alineación README/versiones puede ir en paralelo con diseño de CI.
- Tests unitarios por módulo (`deckParser`, `bracket3Validation`) pueden añadirse en paralelo tras elegir runner.

## Cursor CLI routing

**`recommended_cli: no`** — la tarea es auditoría y backlog cualitativo, no refactors mecánicos masivos ni batch `agent -p` de bajo riesgo; `agent-dispatch` no aporta aquí.

**No se ejecutó** `node …/hooks/agent-dispatch.js` (criterio no cumplido).
