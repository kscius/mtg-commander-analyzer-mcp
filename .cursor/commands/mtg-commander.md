---
description: Construir u optimizar mazos Commander (Bracket 3) con MCP del proyecto, validación iterativa y sinergia única.
---

# /mtg-commander

Actúas como orquestador **end-to-end** para este repositorio (`mtg-commander-analyzer-mcp`). Debes **ejecutar** el flujo (no solo describirlo): invocar el MCP del proyecto, validar con las mismas reglas que el código (`data/`, plantilla Bracket 3, banlist), y **iterar** hasta un resultado estable o hasta agotar el presupuesto de iteraciones indicado abajo.

**Alcance:** solo este proyecto. No inventes nombres de cartas ni legalidad; toda carta debe resolverse contra el MCP / `data/cards.db`.

### Ruta mínima (6 pasos)

1. `get_synergies` → usuario elige slug  
2. *(Opcional)* `get_user_deck_style` (`commanderName`) — perfil de mana desde `data/my_decks`  
3. `get_strategy_guide` (`preferredStrategy`)  
4. `build_deck_from_commander` (`useTemplateGenerator: true`, `useUserStyleReference: true`, `refineUntilStable: true`)  
5. `analyze_deck` → leer `qualityGate.readyToShip`, `converged`, `remainingGaps`  
6. Si no converged: **`optimize_deck`** (max 4) antes de ediciones manuales  
7. Entregar `decklistText` + checklist (`.cursor/rules/deck-quality-checklist.mdc`)

**`data/my_decks`:** solo imports del usuario (Moxfield). **Nunca** guardar mazos generados ahí. Guía: `docs/user-deck-style-reference.md`.

Canonical reference: **`AGENTS.md`** en la raíz.

---

## 0) Interpretar la petición del usuario

Detecta el **modo** a partir del contenido del mensaje (y del bloque que pegue en el chat):

| Modo | Señales | Objetivo |
|------|---------|----------|
| **A — Crear mazo** | Texto de carta Oracle (nombre en la primera línea, maná `{2}{B}{R}`, tipo, reglas, P/T) **o** solo nombre de comandante | Obtener un mazo de **99** cartas + comandante, Bracket 3, una sinergia. |
| **B — Optimizar mazo** | Decklist con líneas `1 Nombre` y sección comandante / mazo (como en los ejemplos del usuario) | Partir del mazo actual, **analizar** con MCP, proponer mejoras alineadas a sinergia, **re-analizar** tras cambios hasta convergencia. |

Si el usuario mezcla ambos, prioriza lo que pida explícitamente; si no, el decklist completo gana (**modo B**).

---

## 1) Sinergia única (obligatorio antes de construir o fijar optimización)

Cumple `.cursor/rules/deck-synergy.mdc` y el agente `mtg-deck-specialist`:

1. **Detecta** 2–5 sinergias plausibles (comandante + contexto EDHREC si ya lo tienes del MCP).
2. **Lista** nombre corto + una línea cada una.
3. **Pregunta**: *¿Con qué sinergia quieres que construya/optimice el mazo?*

**Excepción:** si el usuario **ya** nombró una sinergia inequívoca en el mismo mensaje, úsala y confírmala en una sola frase (sin repetir la pregunta).

Pasa `preferredStrategy` (slug temático EDHREC cuando encaje) a las herramientas de build que lo soporten, y usa **seed cards** temáticas solo si encajan en identidad de color y banlist.

---

## 2) Extraer datos de entrada

### Modo A — Comandante desde Oracle / texto de carta

- El **nombre del comandante** suele ser la **primera línea** del bloque (ej. `Prosper, Tome-Bound`). Normaliza comillas tipográficas y espacios.
- Si solo hay nombre sin Oracle, úsalo tal cual para el MCP.
- No inventes cartas: el nombre debe ser el de Scryfall; si hay ambigüedad, pregunta o resuelve con búsqueda en DB/MCP.

### Modo B — Decklist existente

- Construye `deckText` en texto plano: **una carta por línea**, formato `cantidad nombre` (ej. `1 Sol Ring`). Incluye comandante y 99 del mazo según el pegado del usuario.
- Si el usuario etiqueta secciones (`Comandante` / `Deck`), respétalas al ensamblar el string para `analyze_deck`.

---

## 3) Herramientas MCP (orden lógico)

Usa **siempre** las herramientas del servidor MCP de este proyecto (nombres exactos):

| Herramienta | Cuándo | Parámetros base |
|-------------|--------|------------------|
| `get_synergies` | Siempre antes de construir u optimizar con tema fijo | `commanderName` |
| `get_user_deck_style` | Opcional — cómo armás mana base (imports en `data/my_decks`) | `commanderName`, `useOpenAI` (default false) |
| `get_strategy_guide` | Tras elegir sinergia — ratios, paquetes, anti-patrones | `commanderName`, `preferredStrategy` (slug). `summaryOnly: true` para contexto compacto |
| `get_category_candidates` | Categoría `below` — candidatos temáticos desde EDHREC/DB | `commanderName`, `preferredStrategy`, `category` |
| `analyze_deck` | Modo B al inicio y tras cada cambio; Modo A al final | `deckText`, `templateId: "bracket3"`, `commanderName` o línea `Commander:` o `inferCommander` (default true), `preferredStrategy`, `responseMode: "brief"` |
| `optimize_deck` | Varios déficits — cortes/añadidos automáticos + autofill | `deckText`, `commanderName`, `preferredStrategy`, `maxIterations: 4` |
| `apply_deck_changes` | Aplicar cortes/añadidos ya validados en lote | `deckText`, `commanderName`, `cuts[]`, `adds[]` |
| `evaluate_card_swap` | Antes de cada cambio puntual en modo B | `deckText`, `commanderName`, `cardToRemove`, `cardToAdd`, `preferredStrategy` opcional |
| `search_cards` | Añadir cartas reales por categoría/color | `query`, `category`, `commanderName` (color identity), `limit` |
| `build_deck_from_commander` | Modo A (única vía de build MCP) | `commanderName`, `preferredStrategy`, `useTemplateGenerator: true`, `useUserStyleReference: true` (default), `refineUntilStable: true`. Revisar `qualityGate`, `buildQualityReport` |
| `resolve_card` | Comprobar nombre exacto antes de un add manual | `cardName`, `commanderName` opcional |

**Política (modo A):** usa **`build_deck_from_commander`** con `useTemplateGenerator: true` (plantilla + EDHREC + SQLite). Las elecciones temáticas y el cierre de huecos los hace **tú** (agente) con `search_cards`, `optimize_deck` y `analyze_deck` — no hay herramienta MCP `build_deck_with_llm`.

---

## 4) Validación y reglas (mismo criterio que el código)

Tras cada `analyze_deck` o resultado de build, comprueba explícitamente en tu resumen:

1. **100 cartas** totales: 1 comandante + 99 en el mazo.
2. **Identidad de color** coherente.
3. **Singleton** (salvo básicas).
4. **Banlist** (`data/Banlist.txt`) — el MCP ya la integra; reporta hallazgos.
5. **Bracket 3**: Game Changers ≤3, turnos extra ≤3, sin MLD donde el analizador lo marque, combos 2-cartas prohibidos antes de T6 según reglas del proyecto.

Usa el JSON del MCP (`analysis`, `bracketWarnings`, categorías, etc.) como fuente de verdad.

---

## 5) Bucle de optimización (modo B)

Objetivo: acercar categorías al template Bracket 3 y alinear con la **sinergia elegida**, sin violar reglas.

1. **`analyze_deck`** → registra `qualityGate`, `remainingGaps`, categorías `below`, `bracketWarnings`, bans.
2. Si hay varios déficits: **`optimize_deck`** (`maxIterations: 4`, `preferredStrategy`) antes de cortes manuales.
3. Para un solo cambio: **`evaluate_card_swap`** → aplicar solo si `recommendation === "proceed"`.
4. Gaps restantes: **`search_cards`** con `category` + `suggestedSearch` de `prioritizedActions`.
5. Vuelve a **`analyze_deck`** hasta:
   - `qualityGate.readyToShip === true` **o** `converged === true`, **o**
   - **máximo 4 iteraciones** (ajusta si el usuario pide más/menos), **o**
   - el usuario corta.

Si en una iteración no mejoras métricas clave, cambia candidatos (EDHREC / `search_cards`) antes de seguir.

---

## 6) Paralelización y delegación (opcional)

- **`Task` / subagent `explore`**: solo si necesitas localizar rápido en el repo cómo se calcula una categoría o validación (poco frecuente).
- **Subagent `mtg-deck-specialist`**: útil para una pasada paralela de revisión de sinergia o segundo parecer sobre cortes/añadidos; **no** sustituye llamar al MCP tú mismo.
- **Sequential Thinking MCP (`sequentialthinking`)**: cuando haya **varias** estrategias de optimización incompatibles o clasificación ambigua de sinergias; termina con una recomendación clara.
- **Cursor CLI / `agent-dispatch`**: solo si el usuario o las reglas del workspace lo exigen para batches mecánicos; **no** es necesario para una sesión interactiva normal.

---

## 7) Checklist de calidad

Antes de entregar el mazo, aplica `.cursor/rules/deck-quality-checklist.mdc` (100 cartas, categorías, Bracket 3, synergyScore ≥ 60 si hay estrategia, cartas en DB).

## 8) Formato de respuesta al usuario

1. **Modo** (crear / optimizar) y **sinergia** elegida.
2. **Resumen MCP**: formato OK o lista de errores.
3. **Tabla o lista breve de categorías** (estado vs template).
4. **Alertas** Bracket 3 y banlist; `recommendations.prioritizedActions` / `swaps` si optimizaste.
5. **Decklist final** en texto plano (`1 Carta` por línea) si aplica.
6. **Iteraciones** realizadas (N) y criterio de parada.

---

## 9) Fallos y degradación

- **EDHREC** falla a veces: el código tiene fallbacks; reporta notas del MCP.
- **Nombre de comandante** no resuelve en DB: no continúes construyendo; pide corrección o nombre exacto Scryfall.

---

**Recordatorio:** Este comando es la “macro” de comportamiento; la corrección real viene de **llamar al MCP** y de las reglas en `data/` y `.cursor/rules/`.
