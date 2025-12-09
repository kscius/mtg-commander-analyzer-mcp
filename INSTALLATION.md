# Installation Guide - MTG Commander Analyzer MCP

## 📋 Prerequisites

- **Node.js** 18.0.0 or higher
- **npm** (included with Node.js)
- Internet connection to download Scryfall data

---

## 🚀 Step-by-Step Installation

### 1. Clone the Repository

```bash
git clone https://github.com/kscius/mtg-commander-analyzer-mcp.git
cd mtg-commander-analyzer-mcp
```

---

### 2. Run Automated Setup

The project includes setup scripts that install dependencies and download required data automatically.

#### **Linux / macOS**

```bash
chmod +x setup.sh
./setup.sh
```

#### **Windows PowerShell**

```powershell
.\setup.ps1
```

The script performs the following actions:
1. ✅ Installs npm dependencies (`npm install`)
2. ✅ Queries Scryfall API for the latest download URL
3. ✅ Downloads `oracle-cards.json` (~158 MB)
4. ✅ Saves the file to `data/oracle-cards.json`

---

### 3. Verify Installation

After running setup, you should have:

```
mtg-commander-analyzer-mcp/
├── node_modules/          ✅ Dependencies installed
├── data/
│   └── oracle-cards.json  ✅ Scryfall data downloaded (~158 MB)
├── src/
├── package.json
└── ...
```

**Manual verification:**

```bash
# Linux/macOS
ls -lh data/oracle-cards.json

# Windows PowerShell
Get-Item data/oracle-cards.json | Select-Object Name, Length
```

You should see a file approximately **158 MB** in size.

---

## ⚙️ Manual Installation (Alternative)

If automated setup fails or you prefer manual installation:

### Step 1: Install Dependencies

```bash
npm install
```

### Step 2: Download Scryfall Data Manually

#### **Option A - Download from website:**

1. Visit [Scryfall Bulk Data](https://scryfall.com/docs/api/bulk-data)
2. Find the **"Oracle Cards"** section
3. Click **"Download"** to get the latest JSON file
4. Save the downloaded file as `data/oracle-cards.json`

#### **Option B - Command line:**

**Linux/macOS (with curl):**

```bash
# Get URL from API and download
curl -L $(curl -s https://api.scryfall.com/bulk-data/oracle-cards | grep -o '"download_uri":"[^"]*' | cut -d'"' -f4) -o data/oracle-cards.json
```

**Windows PowerShell:**

```powershell
# Get URL from API and download
$url = (Invoke-RestMethod "https://api.scryfall.com/bulk-data/oracle-cards").download_uri
Invoke-WebRequest -Uri $url -OutFile "data/oracle-cards.json"
```

**Windows (with curl in CMD):**

```cmd
REM Download using direct link (update date as needed)
curl -o data/oracle-cards.json https://data.scryfall.io/oracle-cards/oracle-cards-20251209102455.json
```

> **Note**: The link changes daily. Check the date at [Scryfall Bulk Data](https://scryfall.com/docs/api/bulk-data).

---

## 🧪 Test the Installation

### Option 1: Local Testing

```bash
npm run test:local
```

You should see output similar to:

```
=== MTG Commander Deck Analyzer - Template & Role Classification Test ===

📥 Input:
  Template ID: bracket3
  Banlist ID: commander
  ...

📊 Complete Result (AnalyzeDeckResult):
...
```

### Option 2: MCP Server

```bash
npm run mcp
```

You should see:

```
MTG Commander Analyzer MCP Server starting...
Listening for MCP messages on stdio
```

---

## 🐛 Troubleshooting

### Error: "Cannot find module 'oracle-cards.json'"

**Cause**: The `data/oracle-cards.json` file is not present.

**Solution**:
1. Verify the file exists: `ls data/oracle-cards.json`
2. If missing, run setup: `./setup.sh` or `.\setup.ps1`
3. Or download manually from [Scryfall](https://scryfall.com/docs/api/bulk-data)

---

### Error: Setup script fails on Windows

**Cause**: PowerShell execution policies.

**Solution**:

```powershell
# Allow local scripts temporarily
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\setup.ps1
```

---

### Error: "ENOENT: no such file or directory, open 'data/oracle-cards.json'"

**Cause**: The `data/` directory doesn't exist or the file wasn't downloaded correctly.

**Solution**:

```bash
# Create directory if it doesn't exist
mkdir -p data

# Download file manually
# (see "Manual Installation" section above)
```

---

### Download is very slow or interrupted

**Cause**: The file is large (~158 MB) and may take time on slow connections.

**Solution**:
1. Use a download manager (wget, curl with resume, etc.)
2. Download via browser with a better connection
3. Download to temporary location and copy to project

**With wget (Linux/macOS):**

```bash
# Allows resuming interrupted downloads
wget -c -O data/oracle-cards.json $(curl -s https://api.scryfall.com/bulk-data/oracle-cards | grep -o '"download_uri":"[^"]*' | cut -d'"' -f4)
```

---

## 📚 Next Steps

Once successfully installed:

1. **Configure in Cursor**: See [CURSOR_CONFIG.md](./CURSOR_CONFIG.md)
2. **Run tests**: `npm run test:local` or `npm run test:build`
3. **Start MCP server**: `npm run mcp`

---

## 🔄 Data Updates

Scryfall updates data daily. To get the latest version:

```bash
# Re-run setup
./setup.sh  # or .\setup.ps1 on Windows
```

Or download manually following "Manual Installation" instructions.

---

## 📞 Support

If you encounter issues:

1. Review this complete guide
2. Verify Node.js is installed: `node --version`
3. Verify npm is installed: `npm --version`
4. Open an issue on GitHub with error details

---

## 📝 Important Notes

- ⚠️ The `oracle-cards.json` file is **NOT** in the Git repository due to its size (158 MB > GitHub's 100 MB limit)
- ✅ You must download it each time you clone the repository to a new location
- 🔄 Data updates daily on Scryfall but updating so frequently isn't necessary (once per week is sufficient)
- 💾 The file downloads in uncompressed JSON format for better performance

---

**Ready to analyze Commander decks!** 🎉
