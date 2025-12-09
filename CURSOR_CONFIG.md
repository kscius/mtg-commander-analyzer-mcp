# MCP Server Configuration in Cursor

## For Windows

### 1. Open Cursor Settings
- Press `Ctrl + ,` or go to File > Preferences > Settings
- Search for "MCP"
- Click **"Edit in settings.json"** in the **"Mcp: Servers"** option

### 2. Add this configuration

**In `settings.json` (User Settings):**

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

⚠️ **IMPORTANT**: 
- Use **double backslashes** (`\\`) in Windows paths
- Adjust `cwd` to the path where you cloned this project
- Make sure npm is in your system PATH

### 3. Restart Cursor
- Close Cursor completely
- Open again

### 4. Verify it works
- Open a new chat in Cursor
- Ask: "What MCP tools do you have available?"
- You should see `analyze_deck` and `build_deck_from_commander`

---

## For Linux/macOS

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

### Error: "npm not found"

**Solution 1:** Use full npm path

In PowerShell, find the path:
```powershell
(Get-Command npm).Source
```

Then use it in configuration:
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

**Solution 2:** Install Node.js
- Download from [nodejs.org](https://nodejs.org)
- Install LTS version
- Restart Cursor

### Error: "ts-node not found"

Make sure you've installed dependencies:
```bash
cd C:\Development\mtg-commander-analyzer-mcp
npm install
```

### Server doesn't respond

1. Verify the server runs manually:
   ```bash
   cd C:\Development\mtg-commander-analyzer-mcp
   npm run mcp
   ```
   You should see: "MTG Commander Analyzer MCP Server starting..."

2. Check Cursor logs:
   - Help > Toggle Developer Tools > Console

---

## Available Tools

Once configured, you'll have access to:

### 1. `analyze_deck`
Analyzes an existing Commander decklist with Bracket 3 validation.

**Example usage in Cursor:**
```
Analyze this deck using analyze_deck:
1 Sol Ring
1 Command Tower
...
```

### 2. `build_deck_from_commander`
Builds a deck from a commander with EDHREC autofill.

**Example usage in Cursor:**
```
Build a deck for Atraxa, Praetors' Voice using build_deck_from_commander
with bracket3 template and EDHREC autofill
```

---

## Alternative Configuration (Claude Desktop)

If using Claude Desktop instead of Cursor, edit:

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

## References

- [Model Context Protocol](https://modelcontextprotocol.io/)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Cursor Documentation](https://cursor.sh/docs)
