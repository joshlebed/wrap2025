# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Wrapped 2025 is a Spotify Wrapped-style visualization tool for iMessage and WhatsApp messaging habits. It's 100% local, privacy-first, and runs entirely on macOS with Python backend and HTML/CSS/JS frontend. No external dependencies (Python stdlib only), no network requests, no cloud services.

## Machine-Specific Notes

**This machine**: Only run `imessage_wrapped.py`. Do not run `whatsapp_wrapped.py` or `combined_wrapped.py`.

## Running the Scripts

```bash
# iMessage analysis (USE THIS ONE)
python3 imessage_wrapped.py

# WhatsApp analysis (DO NOT USE on this machine)
python3 whatsapp_wrapped.py

# Combined iMessage + WhatsApp analysis (DO NOT USE on this machine)
python3 combined_wrapped.py

# AI-powered per-contact summaries (requires Claude Code)
python3 people_wrapped.py

# Local macOS dashboard
python3 localbrief.py
```

**Options:**
- `--use-2024` - Analyze 2024 data instead of 2025
- `-o filename.html` - Custom output filename

Output HTML files open automatically in the browser.

## Architecture

### Data Flow
1. **Permission Check** → Verify Full Disk Access to message databases
2. **Contact Resolution** → Extract names from macOS AddressBook, normalize phone/email
3. **Message Analysis** → SQLite CTEs for metrics (counts, response times, streaks, etc.)
4. **HTML Generation** → Embed data JSON + template HTML in single self-contained file
5. **Auto-open** → Launch browser to view results

### Key Data Sources (macOS Local)
- iMessage: `~/Library/Messages/chat.db`
- WhatsApp: `~/Library/Group Containers/group.net.whatsapp.WhatsApp.shared/ChatStorage.sqlite`
- Contacts: `~/Library/Application Support/AddressBook/*.abcddb`

### Timestamp Formats
- **iMessage**: Unix timestamp (seconds since 1970)
- **WhatsApp**: Cocoa Core Data timestamp (Unix + 978307200)
- Key 2025 boundaries: Jan 1 (1735689600), Jun 1 (1748736000), Dec 31 23:59:59 (1767225599)

## Code Structure

| File | Purpose |
|------|---------|
| `imessage_wrapped.py` | iMessage analysis engine (~2100 lines) |
| `whatsapp_wrapped.py` | WhatsApp analysis engine (~1750 lines) |
| `combined_wrapped.py` | Unified iMessage + WhatsApp analysis (~2160 lines) |
| `people_wrapped.py` | AI-powered per-contact summaries via Claude Code |
| `localbrief.py` | Local macOS dashboard (Tkinter GUI) |
| `index.html` | Landing page & template |

### Python Script Pattern
Each analysis script follows the same structure:
- `Spinner` class for terminal UI
- `normalize_phone()` / `extract_contacts()` for contact resolution
- `analyze()` function with complex SQLite CTEs
- `generate_html()` to create self-contained output

### Frontend
- Vanilla JavaScript (no frameworks)
- CSS custom properties for dark/light theming
- Swipeable gallery carousel with keyboard/touch support
- Color palette: green (#4ade80), cyan (#22d3ee), pink (#f472b6), orange (#fb923c), purple (#a78bfa)

## Contact Resolution

Phone normalization handles multiple formats:
- US numbers with/without +1
- International formats
- Email addresses as fallback
- AddressBook lookups across multiple .abcddb files

The `contact_key_and_label()` function deduplicates handles (phone/email) to resolve to a single person.

## people_wrapped.py Special Notes

This script delegates AI analysis to Claude Code itself:
1. Extracts top 25 contacts from both databases
2. Writes message JSON files for Claude Code to read
3. Claude Code generates 3-4 paragraph summaries with specific quotes/events
4. Requires `claude --dangerously-skip-permissions` for file writes
