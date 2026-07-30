# Setup script for MTG Commander Analyzer MCP (Windows PowerShell)
# Downloads required Scryfall data and installs dependencies.
# Supports legacy download_uri (JSON array) and current jsonl_download_uri (.jsonl.gz).

$ErrorActionPreference = "Stop"

Write-Host "🎯 MTG Commander Analyzer MCP - Setup" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Install dependencies
Write-Host "📦 Installing npm dependencies..." -ForegroundColor Yellow
npm install
Write-Host "✓ Dependencies installed" -ForegroundColor Green
Write-Host ""

New-Item -ItemType Directory -Force -Path "data" | Out-Null

# Download Scryfall data
Write-Host "📥 Downloading Scryfall Oracle Cards data..." -ForegroundColor Yellow
Write-Host "   (This may take a few minutes — Scryfall now ships gzipped JSONL)" -ForegroundColor Gray
Write-Host ""

try {
    Write-Host "   Fetching latest download URL..." -ForegroundColor Gray
    $headers = @{ "User-Agent" = "mtg-commander-analyzer-mcp/0.7.0" }
    $response = Invoke-RestMethod -Uri "https://api.scryfall.com/bulk-data/oracle-cards" -Headers $headers

    $legacyUrl = $response.download_uri
    $jsonlUrl = $response.jsonl_download_uri
    $oracleUrl = if ($legacyUrl) { $legacyUrl } else { $jsonlUrl }
    $isJsonlGz = -not $legacyUrl -and [bool]$jsonlUrl

    if (-not $oracleUrl -or $oracleUrl -notmatch '^https://') {
        throw "Scryfall bulk-data response missing https download_uri or jsonl_download_uri"
    }

    Write-Host "   Downloading from: $oracleUrl" -ForegroundColor Gray

    if ($isJsonlGz) {
        $gzPath = "data/oracle-cards.jsonl.gz"
        Invoke-WebRequest -Uri $oracleUrl -OutFile $gzPath -Headers $headers
        $gzBytes = (Get-Item $gzPath).Length
        if ($gzBytes -lt 1000000) {
            throw "oracle-cards.jsonl.gz too small ($gzBytes bytes). Download may be truncated."
        }

        # Prefer gzip.exe (Git for Windows / WSL tools); fall back to .NET DeflateStream for raw deflate after gzip header.
        $jsonlPath = "data/oracle-cards.jsonl"
        if (Get-Command gzip -ErrorAction SilentlyContinue) {
            # gzip -dc writes uncompressed JSONL to stdout
            & gzip -dc $gzPath | Set-Content -Path $jsonlPath -Encoding utf8NoBOM
        } else {
            # Manual gzip decompress via .NET
            Add-Type -AssemblyName System.IO.Compression
            $inStream = [System.IO.File]::OpenRead((Resolve-Path $gzPath))
            try {
                # Skip 10-byte gzip header (minimal); use GZipStream which handles header
                $gzip = New-Object System.IO.Compression.GZipStream($inStream, [System.IO.Compression.CompressionMode]::Decompress)
                $outStream = [System.IO.File]::Create((Join-Path (Get-Location) $jsonlPath))
                try {
                    $gzip.CopyTo($outStream)
                } finally {
                    $outStream.Close()
                    $gzip.Close()
                }
            } finally {
                $inStream.Close()
            }
        }

        # Convert JSONL → JSON array for existing db:import / scryfall fallback
        node -e @"
const fs = require('fs');
const readline = require('readline');
const input = fs.createReadStream('data/oracle-cards.jsonl');
const out = fs.createWriteStream('data/oracle-cards.json');
out.write('[\n');
let first = true;
let lines = 0;
const rl = readline.createInterface({ input, crlfDelay: Infinity });
rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  JSON.parse(trimmed);
  if (!first) out.write(',\n');
  first = false;
  out.write(trimmed);
  lines++;
});
rl.on('close', () => {
  out.write('\n]\n');
  out.end(() => {
    if (lines < 1000) {
      console.error('Too few JSONL records (' + lines + ')');
      process.exit(1);
    }
    console.error('Converted ' + lines + ' JSONL records → data/oracle-cards.json');
  });
});
"@
        Remove-Item -Force $gzPath, $jsonlPath -ErrorAction SilentlyContinue
    } else {
        Invoke-WebRequest -Uri $oracleUrl -OutFile "data/oracle-cards.json" -Headers $headers
    }

    if (-not (Test-Path "data/oracle-cards.json")) {
        throw "Download failed"
    }

    $minOracleBytes = 50000000
    $oracleBytes = (Get-Item "data/oracle-cards.json").Length
    if ($oracleBytes -lt $minOracleBytes) {
        throw "oracle-cards.json too small ($oracleBytes bytes; expected >= $minOracleBytes). Download may be truncated."
    }

    $fs = [System.IO.File]::OpenRead((Resolve-Path "data/oracle-cards.json"))
    try {
        $first = [char]$fs.ReadByte()
    } finally {
        $fs.Close()
    }
    if ($first -ne '[') {
        throw "oracle-cards.json does not look like a JSON array (first byte: $first)"
    }

    $fileSizeMb = [math]::Round($oracleBytes / 1MB, 2)
    Write-Host "✓ Oracle Cards data downloaded successfully ($fileSizeMb MB)" -ForegroundColor Green
}
catch {
    Write-Host "❌ Error: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please download manually from:" -ForegroundColor Yellow
    Write-Host "https://scryfall.com/docs/api/bulk-data" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Save the Oracle Cards file as: data/oracle-cards.json (JSON array)" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "✅ Setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Create and import the card DB: npm run db:create && npm run db:import" -ForegroundColor White
Write-Host "  2. Start the MCP server: npm run mcp" -ForegroundColor White
Write-Host "  3. Or run local tests: npm run test:local" -ForegroundColor White
Write-Host ""
