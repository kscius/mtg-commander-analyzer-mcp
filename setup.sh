#!/bin/bash
# Setup script for MTG Commander Analyzer MCP
# Downloads required Scryfall data and installs dependencies

set -e

echo "🎯 MTG Commander Analyzer MCP - Setup"
echo "======================================"
echo ""

# Install dependencies
echo "📦 Installing npm dependencies..."
npm install
echo "✓ Dependencies installed"
echo ""

# Download Scryfall data
echo "📥 Downloading Scryfall Oracle Cards data..."
echo "   (This may take a few minutes - file is ~158 MB)"
echo ""

# Fetch the latest bulk data info from Scryfall API
echo "   Fetching latest download URL..."
ORACLE_URL=$(curl -s "https://api.scryfall.com/bulk-data/oracle-cards" | grep -o '"download_uri":"[^"]*' | cut -d'"' -f4)

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
curl -o data/oracle-cards.json "$ORACLE_URL"

if [ -f "data/oracle-cards.json" ]; then
    FILE_SIZE=$(du -h data/oracle-cards.json | cut -f1)
    echo "✓ Oracle Cards data downloaded successfully ($FILE_SIZE)"
else
    echo "❌ Error: Download failed"
    exit 1
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Start the MCP server: npm run mcp"
echo "  2. Or run local tests: npm run test:local"
echo ""
