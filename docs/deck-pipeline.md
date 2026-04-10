# Pipeline: analizar y construir mazos Commander

Este documento describe los **flujos de proceso** del proyecto (no sustituye al código ni a `README.md`).

## Analizar un mazo (`analyze_deck`)

1. **Entrada:** texto de lista (`deckText`), opcionalmente `templateId`, `bracketId`, `preferredStrategy`, `banlistId`, `options` (p. ej. `useLLMFallbackForCategories` si hay `OPENAI_API_KEY`).
2. **Plantilla efectiva:** `templateId ?? bracketId ?? 'bracket3'` (alineado con Bracket 3 por defecto en este repo).
3. **Reglas de bracket:** se cargan con `bracketId ??` plantilla efectiva; si el id no existe en `data/bracket-rules.json`, el análisis sigue sin etiquetas de bracket en metadata.
4. **Salida:** categorías, validación Bracket 3, banlist, lint de plantilla cuando aplica, y **notas**. Si indicas `preferredStrategy`, se añade una nota recordando revisar coherencia temática (no hay puntuación automática de “sinergia”).

### Plantilla por defecto: `bracket3` vs `default`

Si **no** envías `templateId` ni `bracketId`, el analizador usa la plantilla **`bracket3`** (`data/deck-template-bracket3.json`), coherente con las reglas del proyecto (Bracket 3).

Para analizar con el template **`default`** (`data/deck-template-default.json`), debes pasarlo explícitamente:

```json
{ "deckText": "...", "templateId": "default" }
```

Quien antes dependiera del template “default” implícito debe fijar `templateId: "default"` en la llamada.

### Sinergia / `preferredStrategy` (alcance)

- **Dentro de alcance:** el valor se **repite** en `result.input.preferredStrategy` y, si está presente, se añade una **nota** en `analysis.notes` para revisión humana.
- **Fuera de alcance:** no existe **puntuación automática de sinergia** ni validación temática contra el texto de las cartas; el proyecto no asigna un “score” de coherencia. Cualquier mejora futura en ese sentido sería un cambio de producto explícito.

## Construir desde comandante (`build_deck_from_commander`)

- **`useTemplateGenerator: false` (por defecto):** esqueleto + tierras básicas + opcional EDHREC/autofill según flags (`useEdhrec`, `useEdhrecAutofill`, `refineUntilStable`, etc.). Ver `src/core/deckBuilder.ts`.
- **`useTemplateGenerator: true` y `templateId: bracket3`:** generación guiada por plantilla (`templateDeckGenerator`), con EDHREC y fallback LLM para huecos de categorías cuando corresponde.

**Tierras (manabase) con plantilla `bracket3`:** los objetivos de mezcla y límites salen de `data/deck-template-bracket3.json` → `mana_base` (`land_mix` por buckets alineados con el analizador, `tapped_lands`, `fetch_policy`). El relleno usa un solo perfil EDHREC del comandante (cartas + tierras sugeridas), básicas ponderadas por pips del coste de maná del comandante, asignación por buckets con redondeo, orden por prioridad de página / sinergia / ranking, y reglas de tope de entrando giradas y mínimo de duals tipados antes de permitir fetches. Implementación: `src/core/templateDeckGenerator.ts`, `src/core/manabaseLandHeuristics.ts`.

Tras construir, el mazo se **re-analiza** con el mismo analizador que `analyze_deck` para devolver categorías y avisos.

## Construir con LLM (`build_deck_with_llm`)

Requiere **OpenAI**. Genera 99 cartas vía modelo configurado; el servidor exige **exactamente 99** nombres en la respuesta JSON inicial y, si la validación falla (conteo, banlist, identidad de color, duplicados no básicos), se envían hasta **2** pasadas de reparación al modelo antes de devolver error. La banlist completa se aplica en servidor (el prompt solo muestra una muestra). Luego se valida Bracket 3 y se analiza el resultado. Usa `BuildDeckInput` (incluye `preferredStrategy` para contexto EDHREC en el flujo interno).

## Variables de entorno (OpenAI / LLM)

Definidas en `src/core/llmConfig.ts` y cargadas desde `.env` en la raíz del proyecto:

| Variable | Rol | Por defecto |
|----------|-----|----------------|
| `OPENAI_API_KEY` | Obligatoria para herramientas LLM | — |
| `OPENAI_MODEL` | Modelo | `gpt-4.1` |
| `OPENAI_TEMPERATURE` | Temperatura | `0.7` |
| `OPENAI_MAX_TOKENS` | Máximo de tokens de respuesta | `4096` |
| `OPENAI_BASE_URL` | URL base de la API (proxies compatibles con OpenAI) | (por defecto cliente OpenAI) |

Copia `.env.example` a `.env` y rellena la clave. No subas `.env` al repositorio (está en `.gitignore`).

## Validación local

- `npm run build` — compilación TypeScript.
- `npm test` — Vitest (tests en `src/**/*.test.ts`).

Ver también [testing.md](./testing.md).
