#!/usr/bin/env bash
# Setup script for MTG Commander Analyzer MCP
# Downloads required Scryfall data and installs dependencies

set -euo pipefail

echo "🎯 MTG Commander Analyzer MCP - Setup"
echo "======================================"
echo ""

# Install dependencies
echo "📦 Installing npm dependencies..."
npm install
echo "✓ Dependencies installed"
echo ""

mkdir -p data

# Download Scryfall data
echo "📥 Downloading Scryfall Oracle Cards data..."
echo "   (This may take a few minutes - file is ~158 MB)"
echo ""

# Parse download_uri with Node JSON (avoid brittle grep/cut on Scryfall bulk-data JSON).
echo "   Fetching latest download URL..."
ORACLE_URL=$(
  curl -fsSL "https://api.scryfall.com/bulk-data/oracle-cards" | node -e '
    let raw = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { raw += chunk; });
    process.stdin.on("end", () => {
      try {
        const data = JSON.parse(raw);
        const uri = data && typeof data.download_uri === "string" ? data.download_uri : "";
        if (!uri || !/^https:\/\//i.test(uri)) {
          console.error("Scryfall bulk-data response missing https download_uri");
          process.exit(1);
        }
        process.stdout.write(uri);
      } catch (err) {
        console.error("Failed to parse Scryfall bulk-data JSON:", err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });
  '
)

if [ -z "$ORACLE_URL" ]; then
  echo "❌ Error: Could not fetch download URL from Scryfall API"
  echo ""
  echo "Please download manually from:"
  echo "https://scryfall.com/docs/api/bulk-data"
  echo ""
  echo "Save the Oracle Cards file as: data/oracle-cards.json"
  exit 1
fi

echo "   Downloading from: $ORACLE_URL"
curl -fsSL -o data/oracle-cards.json "$ORACLE_URL"

# Sanity-check: truncated downloads break db:import silently or with opaque errors.
MIN_ORACLE_BYTES=50000000
ORACLE_BYTES=$(wc -c < data/oracle-cards.json | tr -d ' ')
if [ "$ORACLE_BYTES" -lt "$MIN_ORACLE_BYTES" ]; then
  echo "❌ Error: oracle-cards.json too small (${ORACLE_BYTES} bytes; expected >= ${MIN_ORACLE_BYTES}). Download may be truncated."
  exit 1
fi

# Confirm the file is JSON (array or object start) before calling it done.
node -e '
  const fs = require("fs");
  const buf = Buffer.alloc(1);
  const fd = fs.openSync("data/oracle-cards.json", "r");
  fs.readSync(fd, buf, 0, 1, 0);
  fs.closeSync(fd);
  const first = String.fromCharCode(buf[0]);
  if (first !== "[" && first !== "{") {
    console.error("oracle-cards.json does not look like JSON (first byte:", JSON.stringify(first) + ")");
    process.exit(1);
  }
'

FILE_SIZE=$(du -h data/oracle-cards.json | cut -f1)
echo "✓ Oracle Cards data downloaded successfully ($FILE_SIZE)"

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Create and import the card DB: npm run db:create && npm run db:import"
echo "  2. Start the MCP server: npm run mcp"
echo "  3. Or run local tests: npm run test:local"
echo ""
