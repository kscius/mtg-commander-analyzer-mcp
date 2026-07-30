#!/usr/bin/env bash
# Setup script for MTG Commander Analyzer MCP
# Downloads required Scryfall data and installs dependencies

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🎯 MTG Commander Analyzer MCP - Setup"
echo "======================================"
echo ""

# Install dependencies
echo "📦 Installing npm dependencies..."
npm install
echo "✓ Dependencies installed"
echo ""

echo "📥 Downloading Scryfall Oracle Cards data..."
echo "   (This may take a few minutes — Scryfall now ships gzipped JSONL)"
echo ""

if ! bash "$SCRIPT_DIR/scripts/download-oracle-cards.sh"; then
  echo "❌ Error: Could not download Oracle Cards from Scryfall"
  echo ""
  echo "Please download manually from:"
  echo "https://scryfall.com/docs/api/bulk-data"
  echo ""
  echo "Save the Oracle Cards file as: data/oracle-cards.json (JSON array)"
  exit 1
fi

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
