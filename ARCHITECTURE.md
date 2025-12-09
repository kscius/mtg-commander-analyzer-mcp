# Arquitectura del Proyecto

## Visión General

`mtg-commander-analyzer-mcp` es una biblioteca TypeScript modular diseñada para analizar y construir mazos Commander de Magic: The Gathering, con capacidad de exposición como servidor MCP.

## Principios de Diseño

### 1. Separación de Responsabilidades

- **`src/core/`**: Lógica de negocio pura, independiente de protocolos
  - Sin dependencias de MCP
  - Funciones puras y testables
  - Puede usarse como biblioteca standalone

- **`src/mcp/`**: Capa de protocolo/servidor
  - Orquesta llamadas a `core/`
  - Maneja I/O (stdin/stdout)
  - Futura implementación completa de MCP SDK

### 2. Tipado Estricto

- TypeScript en modo `strict`
- Interfaces explícitas para todos los contratos de datos
- Type guards para validación en runtime cuando sea necesario

### 3. Modularidad

Cada módulo tiene una responsabilidad única:

```
deckParser.ts    → Parsing de texto plano a estructura de datos
analyzer.ts      → Análisis y validación de mazos
scryfall.ts      → (futuro) Integración con API Scryfall
rulesEngine.ts   → (futuro) Motor de reglas de formato
edhrec.ts        → (futuro) Integración con datos EDHREC
```

## Flujo de Datos (v0.1.0)

```
Entrada (stdin)
    ↓
[server.ts] - Lee stdin completo
    ↓
[deckParser.ts] - parseDeckText(deckText)
    ↓
ParsedDeck { cards[], commanderName? }
    ↓
[analyzer.ts] - basicAnalyzeDeck(parsed)
    ↓
DeckAnalysis { totalCards, uniqueCards, categoryCounts, notes }
    ↓
[server.ts] - Formatea como JSON + metadata
    ↓
Salida (stdout)
```

## Tipos de Datos Principales

### ParsedCardEntry
```typescript
{
  rawLine: string;      // Línea original del deck
  quantity: number;     // Cantidad de copias
  name: string;         // Nombre de la carta
}
```

### ParsedDeck
```typescript
{
  commanderName?: string;          // Comandante (futuro)
  cards: ParsedCardEntry[];        // Cartas del mazo
}
```

### DeckAnalysis
```typescript
{
  totalCards: number;              // Total de cartas
  uniqueCards: number;             // Cartas únicas
  categoryCounts: {
    lands: CategoryCount;          // Análisis de tierras
  };
  notes: string[];                 // Notas y advertencias
}
```

### CategoryCount
```typescript
{
  count: number;                   // Cantidad actual
  min: number;                     // Mínimo recomendado
  max: number;                     // Máximo recomendado
}
```

## Dependencias

### Producción
- (Ninguna aún - core es puro TypeScript)

### Desarrollo
- `typescript` ^5.0.0
- `ts-node` ^10.9.0
- `@types/node` ^20.0.0

### Futuras
- `@modelcontextprotocol/sdk` - Para MCP completo
- Cliente HTTP para Scryfall API
- Sistema de cache para datos de Scryfall

## Scripts NPM

```json
{
  "build": "tsc",                    // Compilar a dist/
  "dev": "ts-node src/mcp/server.ts", // Servidor pseudo-MCP
  "test:local": "ts-node src/testLocal.ts" // Demo local
}
```

## Roadmap Técnico

### v0.2.0 - Integración Scryfall
- Descargar y cachear `oracle-cards.json`
- Implementar búsqueda de cartas por nombre
- Detectar tipos de carta (land, creature, etc.)
- Validar identidad de color

### v0.3.0 - Análisis Avanzado
- Curva de maná
- Distribución por tipo
- Detección de sinergias básicas
- Motor de reglas de formato

### v0.4.0 - Constructor de Mazos
- Templates por arquetipos
- Generación desde comandante + estrategia
- Integración con datos EDHREC

### v1.0.0 - MCP Server Completo
- Implementación completa de MCP SDK
- Tools: `analyze_deck`, `build_deck_from_commander`, `get_commander_strategies`
- Resources: base de datos Scryfall
- Prompts: sugerencias inteligentes

## Testing Strategy

### v0.1.0 (Actual)
- Testing manual con `testLocal.ts`
- Validación con ejemplos conocidos

### Futuro
- Unit tests con Jest
- Integration tests para MCP tools
- Snapshots de análisis para regresión
- Property-based testing para parser

## Decisiones de Diseño

### ¿Por qué no detectar el comandante automáticamente?
**Decisión**: Pospuesto a v0.2.0 (requiere Scryfall)

Necesitamos validar que una carta es legendaria y de tipo criatura/planeswalker. Esto requiere acceso a los tipos de carta desde Scryfall.

### ¿Por qué stdin/stdout en lugar de MCP completo?
**Decisión**: Iteración progresiva

- v0.1.0: Pseudo-servidor para validar lógica core
- v0.2.0+: Migración a MCP SDK real

Esto permite desarrollo incremental sin bloquear en integración de SDK.

### ¿Por qué TypeScript y no JavaScript?
**Decisión**: Seguridad de tipos + DX

El análisis de mazos requiere manipulación compleja de datos. TypeScript previene errores en compilación y mejora la experiencia de desarrollo.

## Convenciones de Código

### Naming
- **Interfaces**: PascalCase (ej: `ParsedDeck`)
- **Funciones**: camelCase (ej: `parseDeckText`)
- **Constantes**: UPPER_SNAKE_CASE (ej: `COMMANDER_DECK_SIZE`)

### Comentarios
- JSDoc para funciones exportadas
- Inline comments para lógica compleja
- Ejemplos en JSDoc cuando sea útil

### Imports
- Preferir imports nombrados
- Agrupar por: externos → internos → tipos

### Manejo de Errores
- Por ahora: validación permisiva (ignorar líneas inválidas)
- Futuro: errores tipados y recuperación explícita

## Referencias

- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Scryfall API Docs](https://scryfall.com/docs/api)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [EDHREC](https://edhrec.com/)

