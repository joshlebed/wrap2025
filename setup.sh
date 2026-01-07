#!/bin/bash
#
# iMessage Dashboard Setup Script
# One-command setup for non-technical macOS users
#
# Usage: curl -fsSL https://raw.githubusercontent.com/joshlebed/wrap2025/main/setup.sh | bash
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

echo ""
echo -e "${BOLD}${BLUE}╔════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${BLUE}║     iMessage Dashboard - Setup Script      ║${NC}"
echo -e "${BOLD}${BLUE}╚════════════════════════════════════════════╝${NC}"
echo ""

# Step 1: Check for Python 3
echo -e "${BOLD}Step 1/4: Checking for Python 3...${NC}"

# Check for real Python installations (avoid /usr/bin/python3 shim that triggers CLT installer)
PYTHON_CMD=""

# Check Homebrew locations first
if [ -x "/opt/homebrew/bin/python3" ]; then
    PYTHON_CMD="/opt/homebrew/bin/python3"
elif [ -x "/usr/local/bin/python3" ]; then
    PYTHON_CMD="/usr/local/bin/python3"
# Check python.org installation
elif [ -x "/Library/Frameworks/Python.framework/Versions/3.12/bin/python3" ]; then
    PYTHON_CMD="/Library/Frameworks/Python.framework/Versions/3.12/bin/python3"
elif [ -x "/Library/Frameworks/Python.framework/Versions/3.11/bin/python3" ]; then
    PYTHON_CMD="/Library/Frameworks/Python.framework/Versions/3.11/bin/python3"
elif [ -x "/Library/Frameworks/Python.framework/Versions/3.10/bin/python3" ]; then
    PYTHON_CMD="/Library/Frameworks/Python.framework/Versions/3.10/bin/python3"
# Check if Xcode CLT python exists and works (not just the shim)
elif [ -x "/Library/Developer/CommandLineTools/usr/bin/python3" ]; then
    PYTHON_CMD="/Library/Developer/CommandLineTools/usr/bin/python3"
fi

if [ -n "$PYTHON_CMD" ]; then
    PYTHON_VERSION=$($PYTHON_CMD --version 2>&1)
    echo -e "${GREEN}✓ Found: $PYTHON_VERSION${NC}"
else
    echo -e "${YELLOW}Python 3 not found. Installing from python.org...${NC}"
    echo ""

    # Download Python installer
    PYTHON_PKG="/tmp/python-installer.pkg"
    PYTHON_URL="https://www.python.org/ftp/python/3.12.4/python-3.12.4-macos11.pkg"

    echo "  Downloading Python 3.12..."
    curl -fsSL "$PYTHON_URL" -o "$PYTHON_PKG"

    echo "  Installing Python (you may need to enter your password)..."
    sudo installer -pkg "$PYTHON_PKG" -target /

    rm -f "$PYTHON_PKG"

    # Update PATH for this session
    export PATH="/Library/Frameworks/Python.framework/Versions/3.12/bin:$PATH"
    PYTHON_CMD="/Library/Frameworks/Python.framework/Versions/3.12/bin/python3"

    # Verify installation
    if [ -x "$PYTHON_CMD" ]; then
        PYTHON_VERSION=$($PYTHON_CMD --version 2>&1)
        echo -e "${GREEN}✓ Installed: $PYTHON_VERSION${NC}"
    else
        echo -e "${RED}✗ Python installation failed.${NC}"
        echo "Please install manually from https://www.python.org/downloads/"
        exit 1
    fi
fi
echo ""

# Step 2: Check Full Disk Access
echo -e "${BOLD}Step 2/4: Checking permissions...${NC}"

# Try to access the Messages database
MESSAGES_DB="$HOME/Library/Messages/chat.db"
if [ -r "$MESSAGES_DB" ]; then
    echo -e "${GREEN}✓ Full Disk Access is enabled${NC}"
else
    echo -e "${YELLOW}⚠ Full Disk Access required${NC}"
    echo ""
    echo "To grant access:"
    echo "  1. Open System Settings (or System Preferences)"
    echo "  2. Go to Privacy & Security → Full Disk Access"
    echo "  3. Click the + button"
    echo "  4. Add Terminal (in Applications → Utilities)"
    echo "  5. Restart Terminal and run this script again"
    echo ""
    echo -e "${BLUE}Opening System Settings...${NC}"
    open "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles" 2>/dev/null || \
        open "/System/Library/PreferencePanes/Security.prefPane" 2>/dev/null || true
    echo ""
    echo "After enabling Full Disk Access, restart Terminal and run:"
    echo -e "${BOLD}curl -fsSL https://raw.githubusercontent.com/joshlebed/wrap2025/main/setup.sh | bash${NC}"
    exit 1
fi
echo ""

# Step 3: Download files
echo -e "${BOLD}Step 3/4: Downloading dashboard files...${NC}"

# Create directory
INSTALL_DIR="$HOME/imessage-dashboard"
mkdir -p "$INSTALL_DIR/chart"
cd "$INSTALL_DIR"

BASE_URL="https://raw.githubusercontent.com/joshlebed/wrap2025/main"

# Cache buster to bypass GitHub's CDN cache
CB="?$(date +%s)"

# Download Python scripts
echo "  Downloading data scripts..."
curl -fsSL "$BASE_URL/query_messages_monthly.py$CB" -o query_messages_monthly.py
curl -fsSL "$BASE_URL/query_messages_detailed.py$CB" -o query_messages_detailed.py

# Download chart files
echo "  Downloading chart files..."
curl -fsSL "$BASE_URL/chart/serve.py$CB" -o chart/serve.py
curl -fsSL "$BASE_URL/chart/index.html$CB" -o chart/index.html
curl -fsSL "$BASE_URL/chart/chart.js$CB" -o chart/chart.js
curl -fsSL "$BASE_URL/chart/race.html$CB" -o chart/race.html
curl -fsSL "$BASE_URL/chart/race.js$CB" -o chart/race.js
curl -fsSL "$BASE_URL/chart/bump.html$CB" -o chart/bump.html
curl -fsSL "$BASE_URL/chart/bump.js$CB" -o chart/bump.js
curl -fsSL "$BASE_URL/chart/stream.html$CB" -o chart/stream.html
curl -fsSL "$BASE_URL/chart/stream.js$CB" -o chart/stream.js
curl -fsSL "$BASE_URL/chart/heatmap.html$CB" -o chart/heatmap.html
curl -fsSL "$BASE_URL/chart/heatmap.js$CB" -o chart/heatmap.js
curl -fsSL "$BASE_URL/chart/scatter.html$CB" -o chart/scatter.html
curl -fsSL "$BASE_URL/chart/scatter.js$CB" -o chart/scatter.js
curl -fsSL "$BASE_URL/chart/response.html$CB" -o chart/response.html
curl -fsSL "$BASE_URL/chart/response.js$CB" -o chart/response.js
curl -fsSL "$BASE_URL/chart/dayhour.html$CB" -o chart/dayhour.html
curl -fsSL "$BASE_URL/chart/dayhour.js$CB" -o chart/dayhour.js
curl -fsSL "$BASE_URL/chart/style.css$CB" -o chart/style.css

echo -e "${GREEN}✓ Files downloaded to $INSTALL_DIR${NC}"
echo ""

# Step 4: Generate data and start server
echo -e "${BOLD}Step 4/4: Analyzing your messages...${NC}"
echo "(This may take 30-60 seconds)"
echo ""

$PYTHON_CMD query_messages_monthly.py
echo ""
$PYTHON_CMD query_messages_detailed.py
echo ""

echo -e "${GREEN}${BOLD}╔════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}║           Setup Complete!                  ║${NC}"
echo -e "${GREEN}${BOLD}╚════════════════════════════════════════════╝${NC}"
echo ""
echo -e "Dashboard installed to: ${BOLD}$INSTALL_DIR${NC}"
echo ""
echo -e "${BOLD}Starting the dashboard...${NC}"
echo ""

$PYTHON_CMD chart/serve.py
