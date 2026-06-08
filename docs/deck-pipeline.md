# Pipeline: analizar y construir mazos Commander

Este documento describe los **flujos de proceso** del proyecto (no sustituye al código ni a `README.md`).

## Analizar un mazo (`analyze_deck`)

1. **Entrada:** texto de lista (`deckText`), opcionalmente `templateId`, `bracketId`, `preferredStrategy` (slug EDHREC).
2. **Plantilla efectiva:** `templateId ?? bracketId ?? 'bracket3'` (alineado con Bracket 3 por defecto en este repo).
3. **Reglas de bracket:** se cargan con `bracketId ??` plantilla efectiva; si el id no existe en `data/bracket-rules.json`, el análisis sigue sin etiquetas de bracket en metadata.
4. **Salida:** categorías, singleton/legality checks, Bracket 3, banlist, lint, **`synergyScore`** y **`recommendations`** (cuts/adds) si hay `preferredStrategy`, y **`decklistText`**.

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
- `analyze_deck` devuelve **`synergyScore`** (0–100) y sugerencias **`recommendations`** cuando el slug está presente.

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

## Agente LLM (Cursor u otro cliente MCP)

El **modelo del cliente** elige cartas temáticas y cierra huecos. OpenAI solo si se pide análisis narrativo con `get_user_deck_style`. Flujo recomendado: `get_synergies` → (opcional `get_user_deck_style`) → `build_deck_from_commander` → `analyze_deck` → `optimize_deck` / `search_cards` hasta `qualityGate.readyToShip` o convergencia.

## Validación local

- `npm run build` — compilación TypeScript.
- `npm test` — Vitest (tests en `src/**/*.test.ts`).

Ver también [testing.md](./testing.md).
