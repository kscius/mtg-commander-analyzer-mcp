#!/usr/bin/env bash
# CI helper: download Scryfall oracle bulk data and import cards.db
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bash "$SCRIPT_DIR/download-oracle-cards.sh"

npm run db:create
npm run db:import

# Fail fast before mcp-smoke / golden / benchmark if import produced a partial DB.
MIN_CARDS=35000
CARD_COUNT=$(sqlite3 data/cards.db "SELECT COUNT(*) FROM cards;")
if [ "$CARD_COUNT" -lt "$MIN_CARDS" ]; then
  echo "ci-setup-db: expected >= ${MIN_CARDS} cards in data/cards.db, got ${CARD_COUNT}"
  exit 1
fi
echo "ci-setup-db: cards.db OK (${CARD_COUNT} cards)"
