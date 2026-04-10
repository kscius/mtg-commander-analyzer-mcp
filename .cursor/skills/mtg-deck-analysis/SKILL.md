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
- Si falta el comandante: usar `options.inferCommander: true` en la herramienta o inferirlo del decklist cuando sea posible.

### 2. Llamar al MCP

Usar la herramienta **`analyze_deck`** con:

```json
{
  "deckText": "<decklist en texto plano>",
  "templateId": "bracket3",
  "bracketId": "bracket3"
}
```

- No inventar nombres de cartas. Si el decklist viene de fuera del proyecto, el MCP validará contra `data/cards.db` y banlist.

### 3. Validar resultado del análisis

Comprobar y comunicar al usuario:

| Comprobación | Criterio |
|--------------|----------|
| Tamaño | 100 cartas total (1 comandante + 99 en mazo) |
| Color identity | Todas las cartas dentro de la identidad del comandante |
| Singleton | Máximo 1 copia por carta (salvo tierras básicas) |
| Banlist | Ninguna carta en `data/Banlist.txt` |
| Bracket 3 | Máx. 3 Game Changers, máx. 3 turnos extra, sin MLD, sin combos 2-carta antes T6 |

Si el resultado del MCP incluye `categories`, `bracketWarnings` o `bannedCards`, resumirlos en la respuesta.

### 4. Sinergia (si aplica)

Si el usuario quiere evaluar **sinergia** o **coherencia temática**:

1. **Detectar** sinergias posibles a partir del comandante y de las cartas del mazo (tokens, voltron, +1/+1, reanimator, spellslinger, tierras, tribal, superfriends, etc.).
2. **Preguntar** al usuario con qué sinergia quiere que se evalúe el mazo (listar opciones breves).
3. **Evaluar** el mazo respecto a la sinergia elegida: señalar cartas alineadas y desvíos o cartas que no encajan.

No asumir una sinergia sin que el usuario la elija.

## Fuentes de datos (solo este proyecto)

- Cartas y legalidad: MCP y/o `data/cards.db`. No inventar nombres.
- Banlist: `data/Banlist.txt`.
- Plantilla y políticas: `data/deck-template-bracket3.json`, `data/bracket-rules.json`.
- Rulings: `data/rulings.json`, `data/MagicCompRules.txt` para dudas de reglas.

## Formato de respuesta sugerido

Al devolver el análisis al usuario:

1. **Resumen**: comandante, total de cartas, ¿cumple formato? (sí/no).
2. **Categorías**: estado vs template Bracket 3 (dentro/rango, por encima, por debajo).
3. **Alertas**: violaciones banlist, advertencias Bracket 3, duplicados, color identity.
4. **Sinergia** (si se pidió): sinergia elegida y valoración breve (coherente / con desvíos).

## Qué no hacer

- No usar este skill ni el MCP de este proyecto en otros repositorios.
- No inventar cartas ni legalidad; apoyarse en MCP y datos en `data/`.
- No omitir la validación de formato Commander al analizar.
- No asumir una sinergia sin listar opciones y preguntar al usuario.
