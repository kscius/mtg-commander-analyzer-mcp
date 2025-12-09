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

# Download Scryfall data
Write-Host "📥 Downloading Scryfall Oracle Cards data..." -ForegroundColor Yellow
Write-Host "   (This may take a few minutes - file is ~158 MB)" -ForegroundColor Gray
Write-Host ""

# Fetch the latest bulk data info from Scryfall API
Write-Host "   Fetching latest download URL..." -ForegroundColor Gray
try {
    $response = Invoke-RestMethod -Uri "https://api.scryfall.com/bulk-data/oracle-cards"
    $oracleUrl = $response.download_uri
    
    if (-not $oracleUrl) {
        throw "Could not fetch download URL"
    }
    
    Write-Host "   Downloading from: $oracleUrl" -ForegroundColor Gray
    Invoke-WebRequest -Uri $oracleUrl -OutFile "data/oracle-cards.json"
    
    if (Test-Path "data/oracle-cards.json") {
        $fileSize = (Get-Item "data/oracle-cards.json").Length / 1MB
        Write-Host "✓ Oracle Cards data downloaded successfully ($([math]::Round($fileSize, 2)) MB)" -ForegroundColor Green
    } else {
        throw "Download failed"
    }
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
Write-Host "  1. Start the MCP server: npm run mcp" -ForegroundColor White
Write-Host "  2. Or run local tests: npm run test:local" -ForegroundColor White
Write-Host ""
