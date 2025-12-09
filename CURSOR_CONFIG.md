# Configuración del MCP Server en Cursor

## Para Windows

### 1. Abrir Cursor Settings
- Presiona `Ctrl + ,` o ve a File > Preferences > Settings
- Busca "MCP" en el buscador
- Click en **"Edit in settings.json"** en la opción **"Mcp: Servers"**

### 2. Agregar esta configuración

**En `settings.json` (User Settings):**

```json
{
  "mcp.servers": {
    "mtg-commander-analyzer": {
      "command": "npm",
      "args": ["run", "mcp"],
      "cwd": "C:\\Development\\mtg-commander-analyzer-mcp"
    }
  }
}
```

⚠️ **IMPORTANTE**: 
- Usa **doble backslash** (`\\`) en rutas de Windows
- Ajusta `cwd` a la ruta donde clonaste este proyecto
- Asegúrate de que npm esté en el PATH del sistema

### 3. Reiniciar Cursor
- Cierra Cursor completamente
- Vuelve a abrir

### 4. Verificar que funciona
- Abre un nuevo chat en Cursor
- Pregunta: "¿Qué herramientas MCP tienes disponibles?"
- Deberías ver `analyze_deck` y `build_deck_from_commander`

---

## Para Linux/macOS

```json
{
  "mcp.servers": {
    "mtg-commander-analyzer": {
      "command": "npm",
      "args": ["run", "mcp"],
      "cwd": "/path/to/mtg-commander-analyzer-mcp"
    }
  }
}
```

---

## Troubleshooting

### Error: "npm no encontrado"

**Solución 1:** Usar ruta completa de npm

En PowerShell, encuentra la ruta:
```powershell
(Get-Command npm).Source
```

Luego úsala en la configuración:
```json
{
  "mcp.servers": {
    "mtg-commander-analyzer": {
      "command": "C:\\Program Files\\nodejs\\npm.cmd",
      "args": ["run", "mcp"],
      "cwd": "C:\\Development\\mtg-commander-analyzer-mcp"
    }
  }
}
```

**Solución 2:** Instalar Node.js
- Descarga desde [nodejs.org](https://nodejs.org)
- Instala la versión LTS
- Reinicia Cursor

### Error: "ts-node no encontrado"

Asegúrate de haber instalado las dependencias:
```bash
cd C:\Development\mtg-commander-analyzer-mcp
npm install
```

### El servidor no responde

1. Verifica que el servidor corre manualmente:
   ```bash
   cd C:\Development\mtg-commander-analyzer-mcp
   npm run mcp
   ```
   Deberías ver: "MTG Commander Analyzer MCP Server starting..."

2. Revisa los logs de Cursor:
   - Help > Toggle Developer Tools > Console

---

## Herramientas Disponibles

Una vez configurado, tendrás acceso a:

### 1. `analyze_deck`
Analiza un decklist Commander existente con validación de Bracket 3.

**Ejemplo de uso en Cursor:**
```
Analiza este deck usando analyze_deck:
1 Sol Ring
1 Command Tower
...
```

### 2. `build_deck_from_commander`
Construye un deck desde un comandante con EDHREC autofill.

**Ejemplo de uso en Cursor:**
```
Construye un deck de Atraxa, Praetors' Voice usando build_deck_from_commander
con template bracket3 y autofill de EDHREC
```

---

## Configuración Alternativa (Claude Desktop)

Si usas Claude Desktop en lugar de Cursor, edita:

**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "mtg-commander-analyzer": {
      "command": "npm",
      "args": ["run", "mcp"],
      "cwd": "C:\\Development\\mtg-commander-analyzer-mcp"
    }
  }
}
```

---

## Referencias

- [Model Context Protocol](https://modelcontextprotocol.io/)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Cursor Documentation](https://cursor.sh/docs)

