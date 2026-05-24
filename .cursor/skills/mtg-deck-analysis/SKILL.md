---
name: mtg-deck-analysis
description: Guía el análisis de mazos Commander usando el MCP del proyecto (analyze_deck, validación formato, sinergia única). Usar cuando el usuario pida analizar un mazo, revisar un decklist, validar Bracket 3, o evaluar sinergia de un deck en este repositorio.
---

# Análisis de mazos Commander (agente)

Skill **solo para este proyecto** (mtg-commander-analyzer-mcp). Orienta al agente al analizar mazos con las herramientas MCP y las reglas del repo.

## Cuándo aplicar

- El usuario pide **analizar** un mazo o decklist.
- Pide **revisar** si un mazo cumple formato o Bracket 3.
- Pide **evaluar** la sinergia o coherencia temática del deck.
- Pide **recomendaciones** sobre un mazo existente.

## Flujo de análisis

### 1. Obtener el decklist

- Si el usuario pasa texto: usarlo tal cual (formato `cantidad nombre`, una línea por carta).
- Si indica un archivo: leer desde `data/` o la ruta indicada.
- Si falta el comandante: pasar `commanderName` en la herramienta o incluir línea `Commander: Nombre` en `deckText`.

### 2. Llamar al MCP

Usar **`analyze_deck`** con:

```json
{
  "deckText": "<decklist en texto plano>",
  "templateId": "bracket3",
  "bracketId": "bracket3",
  "commanderName": "<si aplica>",
  "preferredStrategy": "<slug EDHREC si el usuario eligió sinergia>"
}
```

- No inventar nombres de cartas.

### 3. Validar resultado del análisis

Comprobar y comunicar al usuario:

| Comprobación | Criterio |
|--------------|----------|
| Tamaño | 100 cartas total (1 comandante + 99 en mazo) |
| Color identity | Todas las cartas dentro de la identidad del comandante |
| Singleton | Máximo 1 copia por carta (salvo tierras básicas) |
| Banlist | Ninguna carta en `data/Banlist.txt` |
| Bracket 3 | Máx. 3 Game Changers, máx. 3 turnos extra, sin MLD, sin combos 2-carta antes T6 |

### 4. Campos útiles del JSON

| Campo | Uso |
|-------|-----|
| `analysis.categories[].status` | `below` / `within` / `above` vs plantilla |
| `analysis.synergyScore` | 0–100 con `preferredStrategy` |
| `analysis.recommendations.cuts` / `.adds` | Cambios sugeridos |
| `analysis.recommendations.swaps` | Pares cortar → añadir con impacto |
| `analysis.recommendations.synergyPackages` | Paquetes temáticos faltantes |
| `analysis.prioritizedActions` | Orden de mejoras (top 3–5) |
| `analysis.lintReport` | Curva, mana, formato (`format:*`) |
| `decklistText` | Lista lista para copiar |

### 5. Sinergia (si aplica)

1. **`get_synergies`** si no hay slug elegido.
2. **`get_strategy_guide`** para contexto de construcción.
3. Re-analizar con `preferredStrategy` y evaluar `synergyScore` + desvíos.

### 6. Optimización automática (opcional)

Si hay varias categorías `below`, usar **`optimize_deck`** con el mismo `preferredStrategy` antes de ediciones manuales.

### 7. Evaluar cambios antes de aplicarlos

Usar **`evaluate_card_swap`** para probar un reemplazo (`proceed`/`skip`, `categoryDeltas`, `synergyScoreDelta`).

## Fuentes de datos (solo este proyecto)

- Cartas: MCP / `data/cards.db`
- Banlist: `data/Banlist.txt`
- Plantilla: `data/deck-template-bracket3.json`
- Guías: `docs/strategy-guides/`, índice `data/strategy-guides.json`

## Qué no hacer

- No inventar cartas ni legalidad.
- No asumir sinergia sin confirmación del usuario.
- No omitir validación Commander + Bracket 3.
