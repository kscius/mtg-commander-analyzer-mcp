# Pipeline: analizar y construir mazos Commander

Este documento describe los **flujos de proceso** del proyecto (no sustituye al código ni a `README.md`).

## Analizar un mazo (`analyze_deck`)

1. **Entrada:** texto de lista (`deckText`), opcionalmente `templateId`, `bracketId`, `preferredStrategy` (slug EDHREC).
2. **Plantilla efectiva:** `templateId ?? bracketId ?? 'bracket3'` (alineado con Bracket 3 por defecto en este repo).
3. **Reglas de bracket:** se cargan con `bracketId ??` plantilla efectiva; si el id no existe en `data/bracket-rules.json`, el análisis sigue sin etiquetas de bracket en metadata.
4. **Salida:** categorías, singleton/legality checks, Bracket 3, banlist, lint, **`synergyScore`** cuando hay `preferredStrategy`, **`analysis.prioritizedActions`** (hasta 8 en modo brief), **`qualityGate`**, **`agentBrief`**, y **`decklistText`**. Con **`responseMode: "full"`** también devuelve `recommendations.cuts`/`adds`/`swaps` y `synergyPackages`; en **brief** (por defecto) esos campos están vacíos u omitidos — usar `prioritizedActions`.

### Plantilla por defecto: `bracket3` vs `default`

Si **no** envías `templateId` ni `bracketId`, el analizador usa la plantilla **`bracket3`** (`data/deck-template-bracket3.json`), coherente con las reglas del proyecto (Bracket 3).

Para analizar con el template **`default`** (`data/deck-template-default.json`), debes pasarlo explícitamente:

```json
{ "deckText": "...", "templateId": "default" }
```

Quien antes dependiera del template “default” implícito debe fijar `templateId: "default"` en la llamada.

### Sinergia / `preferredStrategy`

- Usar **`get_synergies`** para listar slugs; el usuario elige **una** sinergia.
- `preferredStrategy` debe ser un **slug EDHREC** (p. ej. `tokens`, `blink`).
- `analyze_deck` devuelve **`synergyScore`** (0–100) cuando el slug está presente. Las sugerencias de corte/añadido están en **`analysis.prioritizedActions`** (brief, default) o **`recommendations`** (solo con `responseMode: "full"`).

## Buscar cartas (`search_cards`)

Consulta `data/cards.db` con FTS y filtros (`colorIdentity`, `category`, `type`, `maxMV`). Los agentes deben usarla para **adds** concretos — no inventar nombres.

## Perfil de estilo del usuario (`get_user_deck_style`)

- **Fuente:** mazos importados en `data/my_decks/` (Moxfield → `npm run decks:download-moxfield`).
- **Solo lectura:** el sistema **no** guarda mazos generados en esa carpeta.
- **Salida:** promedios de tierras, mix de mana, categorías, tierras frecuentes; con `commanderName`, hints por identidad de color.
- **OpenAI opcional:** `useOpenAI: true` + `OPENAI_API_KEY` para análisis narrativo.
- Ver `docs/user-deck-style-reference.md`.

## Construir desde comandante (`build_deck_from_commander`)

- **`useUserStyleReference: true` (por defecto):** mezcla objetivos de tierras de plantilla con promedios de tus mazos importados y prioriza tierras no básicas que usas a menudo (`userDeckLibrary` → `templateDeckGenerator` → `manabaseLandHeuristics`).
- **`useTemplateGenerator: true` (por defecto con `templateId: bracket3`):** generación guiada por plantilla (`templateDeckGenerator`), mana base de cuatro sistemas, EDHREC (perfil reutilizado en el wrapper MCP, sin doble fetch), scoring por `preferredStrategy`, relleno con crédito multi-categoría ponderado y curva; déficits restantes con **SQLite** (`searchCardsFiltered`, misma DB que `search_cards`).
- **`useTemplateGenerator: false`:** esqueleto legacy; con plantilla `bracket3` aún usa mana base multi-sistema en tierras, pero no completa 99 cartas no-tierra. Ver `src/core/deckBuilder.ts`.

**Tierras (manabase) con plantilla `bracket3`:** los objetivos de mezcla y límites salen de `data/deck-template-bracket3.json` → `mana_base` (`land_mix` por buckets alineados con el analizador, `tapped_lands`, `fetch_policy`). El relleno usa un solo perfil EDHREC del comandante (cartas + tierras sugeridas), básicas ponderadas por pips del coste de maná del comandante, asignación por buckets con redondeo, orden por prioridad de página / sinergia / ranking, y reglas de tope de entrando giradas y mínimo de duals tipados antes de permitir fetches. Implementación: `src/core/templateDeckGenerator.ts`, `src/core/manabaseLandHeuristics.ts`.

Tras construir, el mazo se **re-analiza** con el mismo analizador que `analyze_deck` para devolver categorías y avisos.

## Descubrir sinergias (`get_synergies`)

Dado `commanderName`, devuelve temas EDHREC + heurísticas y un `recommendedStrategy` opcional. Ejecutar **antes** de `build_deck_from_commander`.

## Optimizar mazo (`optimize_deck`)

Mejora iterativa: cortes temáticos, autofill EDHREC/tierras, devuelve `converged`, `remainingGaps`, `qualityGate` y `decklistText`.

- **Requiere** `commanderName` explícito (no hay `inferCommander`; usar `analyze_deck` antes si solo tienes la lista).
- **Parámetros clave:** `preferredStrategy` (slug EDHREC), `maxIterations` (default **4**), `focusCategories` (solo optimizar categorías concretas), `stopWhenScore` (parar al alcanzar `synergyScore`), `preserveCards` (nombres que no deben cortarse), `banlistId` (default **`commander`**).
- Preferir **`optimize_deck`** para varios huecos a la vez; usar las herramientas incrementales de abajo para cambios puntuales verificados.

Ver [optimization-playbook.md](./optimization-playbook.md) para orden de prioridad (formato → mana → interacción → categorías → sinergia).

## Candidatos por categoría (`get_category_candidates`)

Ranking de cartas reales en `cards.db` para rellenar **una** categoría `below` tras leer `analysis.prioritizedActions`.

- **Entrada:** `commanderName`, `category` (p. ej. `card_draw`, `ramp`), `preferredStrategy`, opcional `limit` (default **15**), `maxMV`, `excludeNames`.
- Ejecutar **después** de `analyze_deck` cuando `prioritizedActions` señala un déficit concreto — antes de búsquedas amplias con `search_cards`.

## Previsualizar cambio (`evaluate_card_swap`)

Simula un corte/añadido (`cardToRemove` / `cardToAdd`) sin mutar la lista.

- Devuelve `recommendation` (`proceed` / `skip`), deltas de categoría y `synergyScoreBefore` / `After`.
- **Requiere** `commanderName` explícito.
- Usar antes de `apply_deck_changes` cuando no estés seguro de un swap.

## Aplicar cambios (`apply_deck_changes`)

Aplica swaps validados (`swaps[]` con `remove` / `add` por par) y devuelve `decklistText` actualizado — evita re-pegar 99 líneas.

- Opcional `commanderName` para validar identidad de color y legalidad.
- Tras aplicar, **re-analizar** con `analyze_deck` hasta `qualityGate.readyToShip`.

## Resolver carta (`resolve_card`)

Resuelve un nombre contra `cards.db` y, con `commanderName`, comprueba legalidad Commander e identidad de color.

- Usar **antes** de añadir manualmente cuando el nombre exacto o la legalidad son dudosos.
- No sustituye `search_cards` para descubrir candidatos temáticos.

## Agente LLM (Cursor u otro cliente MCP)

El **modelo del cliente** elige cartas temáticas y cierra huecos. OpenAI solo si se pide análisis narrativo con `get_user_deck_style`.

Flujo recomendado:

```
get_synergies → (opcional get_user_deck_style) → build_deck_from_commander
→ analyze_deck → optimize_deck
   OR get_category_candidates + evaluate_card_swap + apply_deck_changes
   OR search_cards / resolve_card
→ analyze_deck de nuevo hasta qualityGate.readyToShip o convergencia
```

Ver [optimization-playbook.md](./optimization-playbook.md) y `AGENTS.md` (contrato de herramientas MCP).

## Validación local

- `npm run build` — compilación TypeScript.
- `npm test` — Vitest (tests en `src/**/*.test.ts`).
- `npm run test:golden` — regresión analyze (fixture Shadrix).
- `npm run test:mcp-smoke` — arranque stdio MCP + `tools/list` (11 herramientas).

En CI (Node 20): ver pasos completos en [testing.md](./testing.md) (`build` → `test:mcp-smoke` → `test` → `test:golden` → `benchmark:decks`).
