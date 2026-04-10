---
description: Construir u optimizar mazos Commander (Bracket 3) con MCP del proyecto, validación iterativa y sinergia única.
---

# /mtg-commander

Actúas como orquestador **end-to-end** para este repositorio (`mtg-commander-analyzer-mcp`). Debes **ejecutar** el flujo (no solo describirlo): invocar el MCP del proyecto, validar con las mismas reglas que el código (`data/`, plantilla Bracket 3, banlist), y **iterar** hasta un resultado estable o hasta agotar el presupuesto de iteraciones indicado abajo.

**Alcance:** solo este proyecto. No inventes nombres de cartas ni legalidad; toda carta debe resolverse contra el MCP / `data/cards.db`.

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
| `analyze_deck` | Modo B siempre al inicio y después de cada versión de lista; Modo A al final para validar el mazo generado | `deckText`, `templateId: "bracket3"`, `bracketId: "bracket3"`. Si falta comandante en texto: `options.inferCommander: true` cuando aplique. |
| `build_deck_from_commander` | Modo A sin depender solo del LLM, o como alternativa | `commanderName`, `templateId: "bracket3"`, `bracketId: "bracket3"`, `useEdhrec: true`, `useEdhrecAutofill: true`, `useTemplateGenerator: true` (generación completa tipo Bracket 3 con plantilla), `refineUntilStable: true`, `maxRefinementIterations` entre 5 y 8 si el usuario quiere más refinamiento. Añade `preferredStrategy` y `seedCards` según sinergia. |
| `build_deck_with_llm` | Modo A si el usuario pide mazo completo por IA **y** hay `OPENAI_API_KEY` (el MCP fallará sin clave) | Mismos defaults de template/bracket; `useEdhrec: true`, `useEdhrecAutofill: true` salvo que el usuario pida lo contrario. |

**Política de elección (modo A):**

1. Preferencia por **`build_deck_from_commander`** con `useTemplateGenerator: true` para alineación fuerte con plantilla y refinamiento EDHREC iterativo ya implementado en código.
2. Si el usuario pide explícitamente “por IA / GPT / lista completa generada por modelo”, usa **`build_deck_with_llm`** (tras confirmar sinergia).

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

1. **`analyze_deck`** → registra déficits (`below`), excesos, `bracketWarnings`, bans.
2. Propón un conjunto **acotado** de cambios: *corta X, añade Y* con nombres verificables (MCP/DB).
3. Aplica mentalmente al decklist y construye **nuevo `deckText`**.
4. Vuelve a **`analyze_deck`**.
5. Repite hasta que:
   - no haya `analysisHasAutomatableGaps` equivalente (déicits críticos resueltos o sin mejoras razonables), **o**
   - **máximo 4 iteraciones** de optimización (ajusta si el usuario pide más/menos), **o**
   - el usuario corta.

Si en una iteración no mejoras métricas clave (categorías / warnings), cambia de estrategia (otros candidatos desde EDHREC/sinergia) antes de seguir a lo loco.

---

## 6) Paralelización y delegación (opcional)

- **`Task` / subagent `explore`**: solo si necesitas localizar rápido en el repo cómo se calcula una categoría o validación (poco frecuente).
- **Subagent `mtg-deck-specialist`**: útil para una pasada paralela de revisión de sinergia o segundo parecer sobre cortes/añadidos; **no** sustituye llamar al MCP tú mismo.
- **Sequential Thinking MCP (`sequentialthinking`)**: cuando haya **varias** estrategias de optimización incompatibles o clasificación ambigua de sinergias; termina con una recomendación clara.
- **Cursor CLI / `agent-dispatch`**: solo si el usuario o las reglas del workspace lo exigen para batches mecánicos; **no** es necesario para una sesión interactiva normal.

---

## 7) Formato de respuesta al usuario

1. **Modo** (crear / optimizar) y **sinergia** elegida.
2. **Resumen MCP**: formato OK o lista de errores.
3. **Tabla o lista breve de categorías** (estado vs template).
4. **Alertas** Bracket 3 y banlist.
5. **Decklist final** en texto plano (`1 Carta` por línea) si aplica.
6. **Iteraciones** realizadas (N) y criterio de parada.

---

## 8) Fallos y degradación

- Sin **OPENAI** y el usuario pidió solo `build_deck_with_llm`: informa y usa `build_deck_from_commander` con `useTemplateGenerator: true`.
- **EDHREC** falla a veces: el código tiene fallbacks; reporta notas del MCP.
- **Nombre de comandante** no resuelve en DB: no continúes construyendo; pide corrección o nombre exacto Scryfall.

---

**Recordatorio:** Este comando es la “macro” de comportamiento; la corrección real viene de **llamar al MCP** y de las reglas en `data/` y `.cursor/rules/`.
