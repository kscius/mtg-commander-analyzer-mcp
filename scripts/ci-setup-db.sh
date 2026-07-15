#!/usr/bin/env bash
# CI helper: download Scryfall oracle bulk data and import cards.db
set -euo pipefail

mkdir -p data

# Parse download_uri with Node JSON (avoid brittle grep/cut on Scryfall bulk-data JSON).
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
  echo "Failed to resolve Scryfall oracle-cards download URL"
  exit 1
fi

echo "Downloading oracle-cards.json from Scryfall..."
curl -fsSL -o data/oracle-cards.json "$ORACLE_URL"

# Sanity-check: truncated downloads break db:import silently or with opaque errors.
MIN_ORACLE_BYTES=50000000
ORACLE_BYTES=$(wc -c < data/oracle-cards.json | tr -d ' ')
if [ "$ORACLE_BYTES" -lt "$MIN_ORACLE_BYTES" ]; then
  echo "oracle-cards.json too small (${ORACLE_BYTES} bytes; expected >= ${MIN_ORACLE_BYTES}). Download may be truncated."
  exit 1
fi

# Confirm the file is JSON (array or NDJSON-like start) before import.
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

echo "oracle-cards.json OK (${ORACLE_BYTES} bytes)"

npm run db:create
npm run db:import
