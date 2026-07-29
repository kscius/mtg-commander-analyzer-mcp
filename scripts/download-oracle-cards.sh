#!/usr/bin/env bash
# Download Scryfall Oracle Cards bulk data into data/oracle-cards.json (JSON array).
# Supports legacy download_uri (JSON array) and current jsonl_download_uri (.jsonl.gz).
# Shared by setup.sh and ci-setup-db.sh — does not change cards.db schema or db:import.
set -euo pipefail

mkdir -p data

RESOLVED=$(
  curl -fsSL -A "mtg-commander-analyzer-mcp/0.7.0" \
    "https://api.scryfall.com/bulk-data/oracle-cards" | node -e '
    let raw = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { raw += chunk; });
    process.stdin.on("end", () => {
      try {
        const data = JSON.parse(raw);
        const legacy =
          data && typeof data.download_uri === "string" ? data.download_uri : "";
        const jsonl =
          data && typeof data.jsonl_download_uri === "string"
            ? data.jsonl_download_uri
            : "";
        const uri = legacy || jsonl;
        if (!uri || !/^https:\/\//i.test(uri)) {
          console.error(
            "Scryfall bulk-data response missing https download_uri or jsonl_download_uri"
          );
          process.exit(1);
        }
        const format = legacy ? "json" : "jsonl.gz";
        process.stdout.write(JSON.stringify({ uri, format }));
      } catch (err) {
        console.error(
          "Failed to parse Scryfall bulk-data JSON:",
          err instanceof Error ? err.message : err
        );
        process.exit(1);
      }
    });
  '
)

ORACLE_URL=$(node -e 'const j=JSON.parse(process.argv[1]); process.stdout.write(j.uri);' "$RESOLVED")
ORACLE_FORMAT=$(node -e 'const j=JSON.parse(process.argv[1]); process.stdout.write(j.format);' "$RESOLVED")

if [ -z "$ORACLE_URL" ]; then
  echo "Failed to resolve Scryfall oracle-cards download URL"
  exit 1
fi

echo "Downloading Oracle Cards from Scryfall ($ORACLE_FORMAT)..."
echo "  $ORACLE_URL"

if [ "$ORACLE_FORMAT" = "jsonl.gz" ]; then
  TMP_GZ="data/oracle-cards.jsonl.gz"
  curl -fsSL -A "mtg-commander-analyzer-mcp/0.7.0" -o "$TMP_GZ" "$ORACLE_URL"
  GZ_BYTES=$(wc -c < "$TMP_GZ" | tr -d ' ')
  if [ "$GZ_BYTES" -lt 1000000 ]; then
    echo "oracle-cards.jsonl.gz too small (${GZ_BYTES} bytes). Download may be truncated."
    exit 1
  fi
  # Stream gunzip → JSONL lines → JSON array file for existing db:import / scryfall fallback.
  # Wait for the write stream to finish so CI does not race on a partial file.
  gunzip -c "$TMP_GZ" | node -e '
    const fs = require("fs");
    const readline = require("readline");
    const outPath = "data/oracle-cards.json";
    const out = fs.createWriteStream(outPath);
    out.write("[\n");
    let first = true;
    let lines = 0;
    const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
    rl.on("line", (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      JSON.parse(trimmed); // fail fast on corrupt lines
      if (!first) out.write(",\n");
      first = false;
      out.write(trimmed);
      lines++;
    });
    rl.on("close", () => {
      out.write("\n]\n");
      out.end(() => {
        if (lines < 1000) {
          console.error("Too few JSONL records after gunzip (" + lines + ")");
          process.exit(1);
        }
        console.error("Converted " + lines + " JSONL records → " + outPath);
      });
    });
  '
  rm -f "$TMP_GZ"
else
  curl -fsSL -A "mtg-commander-analyzer-mcp/0.7.0" -o data/oracle-cards.json "$ORACLE_URL"
fi

MIN_ORACLE_BYTES=50000000
ORACLE_BYTES=$(wc -c < data/oracle-cards.json | tr -d ' ')
if [ "$ORACLE_BYTES" -lt "$MIN_ORACLE_BYTES" ]; then
  echo "oracle-cards.json too small (${ORACLE_BYTES} bytes; expected >= ${MIN_ORACLE_BYTES}). Download may be truncated."
  exit 1
fi

node -e '
  const fs = require("fs");
  const buf = Buffer.alloc(1);
  const fd = fs.openSync("data/oracle-cards.json", "r");
  fs.readSync(fd, buf, 0, 1, 0);
  fs.closeSync(fd);
  const first = String.fromCharCode(buf[0]);
  if (first !== "[") {
    console.error("oracle-cards.json does not look like a JSON array (first byte:", JSON.stringify(first) + ")");
    process.exit(1);
  }
'

echo "oracle-cards.json OK (${ORACLE_BYTES} bytes)"
