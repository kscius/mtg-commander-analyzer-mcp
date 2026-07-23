# Setup script for MTG Commander Analyzer MCP (Windows PowerShell)
# Downloads required Scryfall data and installs dependencies

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
Write-Host "   (This may take a few minutes - file is ~158 MB)" -ForegroundColor Gray
Write-Host ""

# Fetch the latest bulk data info from Scryfall API (JSON-parsed; reject non-https)
Write-Host "   Fetching latest download URL..." -ForegroundColor Gray
try {
    $response = Invoke-RestMethod -Uri "https://api.scryfall.com/bulk-data/oracle-cards"
    $oracleUrl = $response.download_uri

    if (-not $oracleUrl -or $oracleUrl -notmatch '^https://') {
        throw "Scryfall bulk-data response missing https download_uri"
    }

    Write-Host "   Downloading from: $oracleUrl" -ForegroundColor Gray
    Invoke-WebRequest -Uri $oracleUrl -OutFile "data/oracle-cards.json"

    if (-not (Test-Path "data/oracle-cards.json")) {
        throw "Download failed"
    }

    # Sanity-check: truncated downloads break db:import silently or with opaque errors.
    $minOracleBytes = 50000000
    $oracleBytes = (Get-Item "data/oracle-cards.json").Length
    if ($oracleBytes -lt $minOracleBytes) {
        throw "oracle-cards.json too small ($oracleBytes bytes; expected >= $minOracleBytes). Download may be truncated."
    }

    # Confirm the file looks like JSON (array or object start).
    $fs = [System.IO.File]::OpenRead((Resolve-Path "data/oracle-cards.json"))
    try {
        $first = [char]$fs.ReadByte()
    } finally {
        $fs.Close()
    }
    if ($first -ne '[' -and $first -ne '{') {
        throw "oracle-cards.json does not look like JSON (first byte: $first)"
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
    Write-Host "Save the Oracle Cards file as: data/oracle-cards.json" -ForegroundColor Yellow
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
