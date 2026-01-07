# Wrapped 2025

Your texting habits, visualized. Interactive charts and Spotify Wrapped-style reports for your iMessage and WhatsApp history.

**100% Local** - Your data never leaves your computer.

---

## Interactive Dashboard (New!)

Beautiful D3.js visualizations of your messaging patterns over time.

### One-Command Setup

Open **Terminal** (find it in Applications → Utilities) and paste this:

```bash
curl -fsSL https://raw.githubusercontent.com/joshlebed/wrap2025/main/setup.sh | bash
```

That's it! The script will:

1. **Check for Python** - installs from python.org if needed
2. **Check permissions** - guides you through enabling Full Disk Access
3. **Download everything** - all dashboard files to `~/imessage-dashboard`
4. **Analyze your messages** - extracts stats from your iMessage database
5. **Launch the dashboard** - opens in your browser automatically

### What You Get

| Chart | Description |
|-------|-------------|
| **Line** | Monthly message trends per contact |
| **Race** | Animated bar chart race of top contacts over time |
| **Bump** | Ranking changes - see who rose and fell |
| **Stream** | Stacked area chart of messaging volume |
| **Heatmap** | GitHub-style activity calendar |
| **Scatter** | Sent vs received message patterns |
| **Response** | How fast you reply vs how fast they reply |
| **Day/Hour** | When do you message most? 7×24 heatmap |

### Running Again Later

After initial setup, restart the dashboard anytime:

```bash
cd ~/imessage-dashboard && python3 chart/serve.py
```

To refresh your data (pull latest messages):

```bash
cd ~/imessage-dashboard && ./run.sh --refresh
```

---

## Troubleshooting

### "Permission denied" or empty data

You need Full Disk Access enabled for Terminal:

1. Open **System Settings** (or System Preferences on older macOS)
2. Go to **Privacy & Security** → **Full Disk Access**
3. Click the **+** button
4. Navigate to **Applications** → **Utilities** → **Terminal**
5. Restart Terminal completely (Cmd+Q, then reopen)

### "Python not found"

The setup script should handle this automatically. If it doesn't:

1. Go to https://www.python.org/downloads/
2. Download the macOS installer
3. Run the installer
4. Run the setup script again

### Charts show no data

Make sure you have iMessage history on this Mac. The dashboard analyzes your local Messages database - it can't access messages stored only on your iPhone.

---

## Wrapped Reports

In addition to the interactive dashboard, generate Spotify Wrapped-style reports:

### iMessage Wrapped

```bash
curl -O https://raw.githubusercontent.com/joshlebed/wrap2025/main/imessage_wrapped.py
python3 imessage_wrapped.py
```

### WhatsApp Wrapped

```bash
curl -O https://raw.githubusercontent.com/joshlebed/wrap2025/main/whatsapp_wrapped.py
python3 whatsapp_wrapped.py
```

### Combined (iMessage + WhatsApp)

```bash
curl -O https://raw.githubusercontent.com/joshlebed/wrap2025/main/combined_wrapped.py
python3 combined_wrapped.py
```

### Options

```bash
python3 imessage_wrapped.py --use-2024    # Analyze 2024 instead
python3 imessage_wrapped.py -o custom.html # Custom output filename
```

### Wrapped Features

- **Total messages + words** - sent, received, per day
- **Inner circle** - top person + top 10 contacts
- **Group chats** - overview + expandable top 10
- **Personality diagnosis** - starter %, reply time, peak hours
- **Who texts first** - conversation initiator %
- **Response time** - how fast you reply
- **3AM bestie** - late night conversations
- **Busiest day** - wildest day with top contacts
- **Grind + marathon** - longest streak, biggest single-day convo
- **Vibe check** - heating up vs ghosted contacts
- **GitHub-style heatmap** - activity contribution graph
- **Top emojis** - your most-used lineup

---

## Privacy & Security

**Your data stays on your computer.** These scripts:

- Make **zero network requests**
- Have **no external dependencies** (Python stdlib only)
- Read only local macOS databases
- Output self-contained HTML files
- Are fully open source - read every line yourself

---

## How It Works

The scripts read your local macOS databases using SQLite:

- **iMessage**: `~/Library/Messages/chat.db`
- **WhatsApp**: `~/Library/Group Containers/group.net.whatsapp.WhatsApp.shared/ChatStorage.sqlite`
- **Contacts**: `~/Library/Application Support/AddressBook/*.abcddb`

Phone numbers and emails are resolved to contact names using your AddressBook.

---

## Requirements

- macOS (uses local message databases)
- Full Disk Access for Terminal
- For WhatsApp: WhatsApp desktop app with synced history

---

## Credits

Made by [@nikunj](https://x.com/nikunj)

Not affiliated with Apple, Meta, Spotify, or WhatsApp.

## License

MIT
