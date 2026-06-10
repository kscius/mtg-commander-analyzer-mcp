#!/usr/bin/env bash
# CI helper: download Scryfall oracle bulk data and import cards.db
set -euo pipefail

mkdir -p data

ORACLE_URL=$(curl -fsSL "https://api.scryfall.com/bulk-data/oracle-cards" | grep -o '"download_uri":"[^"]*' | cut -d'"' -f4)
if [ -z "$ORACLE_URL" ]; then
  echo "Failed to resolve Scryfall oracle-cards download URL"
  exit 1
fi

echo "Downloading oracle-cards.json..."
curl -fsSL -o data/oracle-cards.json "$ORACLE_URL"

npm run db:create
npm run db:import
