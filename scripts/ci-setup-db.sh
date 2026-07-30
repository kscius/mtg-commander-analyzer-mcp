#!/usr/bin/env bash
# CI helper: download Scryfall oracle bulk data and import cards.db
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bash "$SCRIPT_DIR/download-oracle-cards.sh"

npm run db:create
npm run db:import
