#!/bin/bash
#
# iMessage Dashboard - Quick Start
# Use this to refresh data and restart the dashboard
#
# Usage: cd ~/imessage-dashboard && ./run.sh
#

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

cd "$(dirname "$0")"

echo ""
echo -e "${BOLD}${BLUE}iMessage Dashboard${NC}"
echo ""

# Check if data refresh is requested
if [ "$1" = "--refresh" ] || [ "$1" = "-r" ]; then
    echo -e "${BOLD}Refreshing message data...${NC}"
    echo ""
    python3 query_messages_monthly.py
    echo ""
    python3 query_messages_detailed.py
    echo ""
fi

echo -e "${GREEN}Starting dashboard at http://localhost:8000/chart/${NC}"
echo "Press Ctrl+C to stop"
echo ""

python3 chart/serve.py
