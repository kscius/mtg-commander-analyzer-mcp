---
date: 2026-04-10
task: analiza-busca-mejores
classification: STANDARD
confidence: MEDIUM
workflow_type: research
next_command: /ks-conductor
---

# Scout: analizar proyecto y buscar mejoras

## Stack summary

- **Runtime:** Node.js ≥18, TypeScript estricto (`tsconfig.json`), CommonJS, salida `dist/`.
- **Dominio:** servidor MCP stdio (`src/mcp/server.ts`, `@modelcontextprotocol/sdk`), SQLite (`better-sqlite3`), Zod v4, OpenAI opcional (`build_deck_with_llm`), datos en `data/`.
- **Pruebas:** Vitest (`npm test`, `vitest.config.ts`), tests colocados como `src/**/*.test.ts`; CI en GitHub Actions.
- **Entradas principales:** `src/core/*` (lógica), `src/mcp/*` (herramientas), `src/scripts/*` (DB/import).

## Workflow type

**research** — auditoría de mejoras sin implementación en este paso.

## Relevant files (dependencias)

| Área | Ruta | Importa (depende de) | Importado por |
|------|------|----------------------|---------------|
| MCP | `src/mcp/server.ts` | tools, `schemas`, `llmConfig` | — (entry) |
| Herramientas | `analyzeDeckTool.ts`, `buildDeckFromCommanderTool.ts`, `buildDeckWithLLMTool.ts` | core, schemas | `server.ts` |
| Contratos | `src/core/schemas.ts` | Zod | MCP tools |
| Análisis | `analyzer.ts`, `deckParser.ts`, `bracket3Validation.ts` | DB, templates | tools, tests parciales |
| LLM | `llmDeckBuilder.ts`, `llmConfig.ts` | OpenAI | `buildDeckWithLLMTool` |
| CI | `.github/workflows/ci.yml` | npm scripts | — |

## Validation commands (verificadas en repo)

| Comando | Evidencia |
|---------|-----------|
| `npm install` / `npm ci` | `package.json`, CI |
| `npm run build` | `tsc` |
| `npm test` | `vitest run` |
| `npm run test:watch` | Vitest watch |
| `npm run dev` / `npm run mcp` | servidor MCP |
| `npm run test:local` / `test:build` / `test:e2e` | scripts ts-node, requieren DB según `docs/testing.md` |

**Nota:** no hay script `lint` / `format` en `package.json` (mejora potencial).

## Memory findings

- **DevContext:** conversación inicializada (`7a92d646-de8e-4568-9fd2-81229a4c1d13`); resumen de código/arquitectura vacío para este workspace (sin ítems recientes en ese MCP).
- **Cursor10x (`getComprehensiveContext`):** sin milestones/decisions/requirements de este repo; similares semánticos apuntan a otros proyectos — no usar como verdad de este codebase.
- **Brainstorming:** omitido — alcance es inventario basado en evidencia de repositorio, no ideación de producto sin criterios.

## Mejoras propuestas (evidencia actual)

### Calidad y CI

1. **Cobertura de tests:** solo `deckParser.test.ts` y `bracket3Validation.test.ts`; falta cobertura sobre `analyzer.ts`, herramientas MCP, `deckBuilder`, EDHREC/Scryfall (mocks), y regresiones de schemas.
2. **Lint/format:** añadir ESLint y/o Prettier (o Biome) y paso opcional en CI — hoy solo `build` + `test`.
3. **Scripts de integración:** `test:local` / `test:e2e` no están en CI (dependen de `data/cards.db`); valorar job opcional con artefacto de DB o documentar exclusión explícita.

### Documentación y consistencia

4. **`docs/testing.md`:** ya describe Vitest y CI — alineado con `package.json` (corrige inventarios antiguos que decían que no había runner estándar).
5. **Reglas del proyecto:** documentación durable en `/docs/` — existe `docs/testing.md`; ampliar con arquitectura MCP o operación si el README crece demasiado.
6. **Versiones:** `server.ts` usa `version: "0.4.0"` junto a `package.json` — consistente en revisión actual.

### Producto / contratos MCP

7. **Campos reservados** en schemas (`banlistId`, etc.): implementar o documentar limitaciones para integradores.
8. **Sinergia única** (`.cursor/rules`): si se exige en producto, reflejar validación o mensajes claros en `analyze_deck` / build tools.

### Datos y repo

9. **Archivos grandes / untracked:** `git status` muestra `data/cards.db`, `data/rulings.json` y decklists como no versionados — definir política (LFS, generación local, documentar en INSTALLATION).

## Recommended routing

| Rol | Sugerencia |
|-----|------------|
| Skill | `repo-discovery` (hecho), luego `requirements-gathering` para priorizar backlog |
| Subagent | `explore` solo si el alcance crece a monorepo o módulos no listados |
| Validación posterior | `npm run build` + `npm test` tras cambios de código |

## Classification & confidence

- **STANDARD:** varias áreas de mejora, sin compromiso de implementación única; patrones del repo claros.
- **Confidence MEDIUM:** priorización depende de objetivos del mantenedor (OSS, uso interno, peso LLM).

## SequentialThinking

Conclusión: clasificación **STANDARD** para el entregable scout; ejes de mejora: tests ampliados, lint en CI, política de datos/DB, contratos MCP. **COMPLEX** aplicaría solo si se ejecuta un programa grande que toque todo a la vez. CLI batch no recomendado para esta fase.

## Conditional flags

| Flag | ¿Activar? | Motivo |
|------|------------|--------|
| security-review | condicional | LLM, red (EDHREC/Scryfall/OpenAI), paths de datos |
| database-schema-designer | no | salvo cambios de esquema SQLite |
| write-unit-tests | sí | si se implementan mejoras en core/MCP |
| humanizer | no | salvo trabajo de copy/docs |
| reducing-entropy | no | salvo tarea explícita de simplificación |

## Risks / constraints

- Mejoras en contratos MCP = impacto en clientes; cambios en DB = reproducibilidad local/CI.
- Sin criterios de negocio, el backlog de “mejoras” puede divergir — conviene priorizar con el usuario.

## Parallelization

- Auditoría de tests (listar gaps) y auditoría de CI/docs pueden hacerse en paralelo; implementación conviene secuencial por dependencias.

## Cursor CLI routing

**`recommended_cli: no`**

- La tarea es análisis y recomendaciones, no batch mecánico ni `agent -p` headless de mismo patrón.
- No se encontró `agent-dispatch.js` en el workspace ni en `~/.cursor/hooks/` en este entorno; no aplica ejecutar dispatch aquí.
