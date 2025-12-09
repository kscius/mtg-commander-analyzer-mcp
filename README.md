# MTG Commander Deck Analyzer - MCP

> 🎉 **Estado actual:** v0.2.0 - MCP Server completo con análisis avanzado, EDHREC integration, y deck building con autofill

Biblioteca TypeScript de código abierto y servidor MCP para analizar y construir mazos Commander (EDH) de Magic: The Gathering.

## 🎯 Objetivo del Proyecto

Proporcionar herramientas automatizadas para:
- **Analizar mazos existentes**: validación de formato, categorización de cartas, análisis de brackets
- **Construir mazos desde cero**: generación basada en comandante con EDHREC autofill
- **Sugerir optimizaciones**: recomendaciones basadas en datos de EDHREC y Bracket 3

## 🏗️ Arquitectura

```
mtg-commander-analyzer-mcp/
├── src/
│   ├── core/                    # Lógica de negocio
│   │   ├── deckParser.ts        # Parser de decklists
│   │   ├── analyzer.ts          # Análisis avanzado de mazos
│   │   ├── deckBuilder.ts       # Constructor de mazos
│   │   ├── scryfall.ts          # Integración Scryfall
│   │   ├── edhrec.ts            # Integración EDHREC
│   │   ├── roles.ts             # Clasificación de roles
│   │   ├── templates.ts         # Templates de deck
│   │   ├── brackets.ts          # Reglas de brackets
│   │   ├── bracketCards.ts      # Listas de cartas por bracket
│   │   ├── categoryUtils.ts     # Utilidades de categorías
│   │   ├── types.ts             # TypeScript interfaces
│   │   └── schemas.ts           # Zod schemas para MCP
│   ├── mcp/                     # MCP server implementation
│   │   ├── server.ts            # MCP server (stdio transport)
│   │   ├── analyzeDeckTool.ts   # Herramienta analyze_deck
│   │   └── buildDeckFromCommanderTool.ts  # Herramienta build_deck
│   ├── testLocal.ts             # Testing de análisis
│   └── testBuildLocal.ts        # Testing de construcción
├── data/                        # Datos Scryfall, EDHREC, templates
│   ├── oracle-cards.json        # Base de datos Scryfall
│   ├── templates/               # Deck templates (Bracket 3)
│   ├── brackets/                # Reglas de brackets
│   ├── bracket3-*.json          # Listas de cartas Bracket 3
│   └── edhrec_structures/       # Ejemplos de EDHREC JSON
└── package.json
```

## 🚀 Instalación

```bash
# Clonar el repositorio
git clone https://github.com/yourusername/mtg-commander-analyzer-mcp.git
cd mtg-commander-analyzer-mcp

# Instalar dependencias
npm install

# Compilar TypeScript (opcional)
npm run build
```

## 📖 Uso

### MCP Server (Recomendado)

El servidor MCP expone dos herramientas para clientes compatibles (Cursor, Claude Desktop, etc.):

**Iniciar el servidor:**
```bash
npm run mcp
```

El servidor escucha mensajes MCP sobre stdio (stdin/stdout) y permanece activo esperando solicitudes.

### Herramientas MCP Disponibles

#### 1. `analyze_deck`

Analiza un decklist Commander existente con validación de Bracket 3.

**Input:**
```json
{
  "deckText": "1 Sol Ring\n1 Arcane Signet\n1 Rhystic Study\n37 Island\n...",
  "templateId": "bracket3",
  "bracketId": "bracket3"
}
```

**Output:**
```json
{
  "input": { "deckText": "...", "templateId": "bracket3" },
  "analysis": {
    "commanderName": "Atraxa, Praetors' Voice",
    "totalCards": 99,
    "uniqueCards": 99,
    "categories": [
      { "name": "lands", "count": 37, "min": 35, "max": 38, "status": "within" },
      { "name": "ramp", "count": 9, "min": 8, "max": 10, "status": "within" },
      { "name": "card_draw", "count": 8, "min": 8, "max": 10, "status": "within" },
      { "name": "target_removal", "count": 6, "min": 6, "max": 8, "status": "within" },
      { "name": "board_wipes", "count": 3, "min": 3, "max": 4, "status": "within" }
    ],
    "bracketWarnings": [
      "This deck uses 2 Game Changers (max allowed for Bracket bracket3: 3)."
    ],
    "notes": ["..."]
  },
  "bracketId": "bracket3",
  "bracketLabel": "Bracket 3 (Upgraded)"
}
```

**Características:**
- ✅ Validación de formato Commander (99 + 1 comandante)
- ✅ Categorización automática (lands, ramp, draw, removal, wipes)
- ✅ Detección de roles usando Scryfall oracle text
- ✅ Validación de Bracket 3 (Game Changers, mass land denial, extra turns)
- ✅ Recomendaciones por categoría

#### 2. `build_deck_from_commander`

Construye un deck Commander desde un nombre de comandante con EDHREC autofill opcional.

**Input:**
```json
{
  "commanderName": "Atraxa, Praetors' Voice",
  "templateId": "bracket3",
  "bracketId": "bracket3",
  "seedCards": ["Sol Ring", "Arcane Signet"],
  "useEdhrec": true,
  "useEdhrecAutofill": true
}
```

**Output:**
```json
{
  "input": { "commanderName": "Atraxa, Praetors' Voice", ... },
  "deck": {
    "commanderName": "Atraxa, Praetors' Voice",
    "cards": [
      { "name": "Sol Ring", "quantity": 1, "roles": ["ramp"] },
      { "name": "Island", "quantity": 9, "roles": ["land"] },
      { "name": "Talisman of Dominance", "quantity": 1, "roles": ["ramp"] },
      ...
    ]
  },
  "analysis": {
    "totalCards": 99,
    "categories": [ ... ],
    "bracketWarnings": [ ... ]
  },
  "edhrecContext": {
    "sourcesUsed": ["top/multicolor.json", "lands/mono-blue.json", ...],
    "suggestions": [
      { "name": "Assassin's Trophy", "rank": 467886, "category": "top/multicolor" },
      ...
    ]
  },
  "notes": [
    "Commander: Atraxa, Praetors' Voice (Color Identity: BGUW)",
    "✓ EDHREC: Fetched 50 top cards and 50 lands (100 total suggestions).",
    "EDHREC Autofill enabled. Attempting to fill category deficits...",
    "✓ EDHREC Autofill complete: added 16 cards (6 ramp, 4 draw, 5 removal, 1 wipes)",
    ...
  ]
}
```

**Características:**
- ✅ Resolución automática de comandante desde Scryfall
- ✅ Generación de base de lands según color identity
- ✅ Integración con EDHREC (top cards + lands por color)
- ✅ Autofill inteligente de categorías deficitarias
- ✅ Respeto a constraints de Bracket 3
- ✅ Validación de color identity
- ✅ Clasificación de roles para todas las cartas

### Testing Local

**Análisis de deck:**
```bash
npm run test:local
```

**Construcción de deck:**
```bash
npm run test:build
```

Ambos scripts muestran resultados detallados en la consola.

## 🔧 Configuración en Clientes MCP

### Cursor

Agrega esto a tu configuración de MCP en Cursor:

```json
{
  "mcpServers": {
    "mtg-commander-analyzer": {
      "command": "npm",
      "args": ["run", "mcp"],
      "cwd": "/path/to/mtg-commander-analyzer-mcp"
    }
  }
}
```

### Claude Desktop

En `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "mtg-commander-analyzer": {
      "command": "npm",
      "args": ["run", "mcp"],
      "cwd": "/path/to/mtg-commander-analyzer-mcp"
    }
  }
}
```

## 🛠️ Funcionalidad Actual (v0.2.0)

### ✅ Implementado

**Core:**
- ✅ Parser de decklists en formato `<cantidad> <nombre>`
- ✅ Integración completa con Scryfall (oracle-cards.json local)
- ✅ Clasificación de roles por tipo y oracle text (ramp, draw, removal, wipes)
- ✅ Sistema de templates (Bracket 3)
- ✅ Reglas de Bracket 3 con listas de cartas
- ✅ Integración con EDHREC JSON endpoints (top cards, lands por color)
- ✅ Caching in-memory de EDHREC requests

**Análisis:**
- ✅ Validación de tamaño de deck (99 + comandante)
- ✅ Categorización automática (lands, ramp, card_draw, removal, board_wipes)
- ✅ Detección de Game Changers, mass land denial, extra turns
- ✅ Comparación vs template Bracket 3
- ✅ Warnings y recomendaciones detalladas

**Construcción:**
- ✅ Generación de skeleton desde comandante
- ✅ Distribución automática de basic lands por color identity
- ✅ EDHREC suggestions (top 50 cards + top 50 lands)
- ✅ Autofill inteligente de categorías deficitarias
- ✅ Validación de color identity
- ✅ Respeto a Bracket 3 constraints en autofill
- ✅ Re-análisis post-autofill

**MCP Server:**
- ✅ Servidor MCP completo con @modelcontextprotocol/sdk
- ✅ Stdio transport para compatibilidad universal
- ✅ Dos herramientas: `analyze_deck`, `build_deck_from_commander`
- ✅ Validación de inputs con zod schemas
- ✅ Manejo de errores graceful

### 🔜 Próximos Pasos (v0.3.0+)

- [ ] Commander-specific EDHREC endpoints (`commanders/atraxa.json`)
- [ ] Theme detection y autofill temático
- [ ] Análisis de curva de maná
- [ ] Detección de combos infinitos
- [ ] Soporte para otros brackets (1, 2, 4)
- [ ] Herramienta MCP adicional: `optimize_deck`
- [ ] Recursos MCP: acceso directo a Scryfall data
- [ ] Prompts MCP: sugerencias contextuales

## 📋 Reglas de Formato Commander (EDH)

- **Tamaño del deck:** Exactamente 100 cartas (1 comandante + 99 cartas del mazo)
- **Singleton:** Máximo 1 copia de cada carta (excepto básicas)
- **Identidad de color:** Todas las cartas deben coincidir con la identidad de color del comandante
- **Bracket 3 (Upgraded):**
  - Max 3 Game Changers
  - No mass land destruction
  - Limited extra turn cards

## 🤝 Contribución

Este es un proyecto de código abierto. Contribuciones bienvenidas:

1. Fork del repositorio
2. Crea una rama feature: `git checkout -b feature/nueva-funcionalidad`
3. Commit con mensajes claros: `git commit -m "feat: agregar detección de curva de maná"`
4. Push: `git push origin feature/nueva-funcionalidad`
5. Abre un Pull Request

## 📝 Convenciones de Código

- **TypeScript strict mode** habilitado
- **Funciones puras** cuando sea posible
- **Comentarios JSDoc** para APIs públicas
- **Separación de responsabilidades:** core (lógica) vs mcp (protocolo)
- **Testing:** Scripts locales antes de cada commit

## 📄 Licencia

MIT License - ver archivo LICENSE para detalles

## 🔗 Referencias

- [Scryfall API](https://scryfall.com/docs/api)
- [EDHREC](https://edhrec.com/)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Commander Format Rules](https://mtgcommander.net/index.php/rules/)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)

---

**Nota:** Este proyecto es funcional y listo para usar. El MCP server está completamente implementado y compatible con cualquier cliente MCP.
