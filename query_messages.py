#!/usr/bin/env python3
"""
Simple script to query iMessage stats with contact name resolution.
Usage: python3 query_messages.py
"""

import csv
import glob
import os
import re
import sqlite3

IMESSAGE_DB = os.path.expanduser("~/Library/Messages/chat.db")
ADDRESSBOOK_DIR = os.path.expanduser("~/Library/Application Support/AddressBook")


def load_contacts():
    """Load contacts from macOS AddressBook."""
    contacts = {}
    db_paths = glob.glob(
        os.path.join(ADDRESSBOOK_DIR, "Sources", "*", "AddressBook-v22.abcddb")
    )
    main_db = os.path.join(ADDRESSBOOK_DIR, "AddressBook-v22.abcddb")
    if os.path.exists(main_db):
        db_paths.append(main_db)

    for db_path in db_paths:
        try:
            conn = sqlite3.connect(db_path)
            # Get names
            people = {}
            for row in conn.execute(
                "SELECT ROWID, ZFIRSTNAME, ZLASTNAME FROM ZABCDRECORD WHERE ZFIRSTNAME IS NOT NULL OR ZLASTNAME IS NOT NULL"
            ):
                name = f"{row[1] or ''} {row[2] or ''}".strip()
                if name:
                    people[row[0]] = name

            # Map phone numbers to names
            for owner, phone in conn.execute(
                "SELECT ZOWNER, ZFULLNUMBER FROM ZABCDPHONENUMBER WHERE ZFULLNUMBER IS NOT NULL"
            ):
                if owner in people:
                    digits = re.sub(r"\D", "", str(phone))
                    if digits:
                        contacts[digits] = people[owner]
                        if len(digits) >= 10:
                            contacts[digits[-10:]] = people[owner]
                        if len(digits) == 11 and digits.startswith("1"):
                            contacts[digits[1:]] = people[owner]

            # Map emails to names
            for owner, email in conn.execute(
                "SELECT ZOWNER, ZADDRESS FROM ZABCDEMAILADDRESS WHERE ZADDRESS IS NOT NULL"
            ):
                if owner in people:
                    contacts[email.lower().strip()] = people[owner]

            conn.close()
        except Exception:
            pass

    return contacts


def resolve_name(handle, contacts):
    """Resolve a handle (phone/email) to a contact name."""
    if "@" in handle:
        return contacts.get(handle.lower().strip(), handle)

    digits = re.sub(r"\D", "", str(handle))
    if digits in contacts:
        return contacts[digits]
    if len(digits) == 11 and digits.startswith("1") and digits[1:] in contacts:
        return contacts[digits[1:]]
    if len(digits) >= 10 and digits[-10:] in contacts:
        return contacts[digits[-10:]]
    return handle


def main():
    print("Loading contacts...")
    contacts = load_contacts()
    print(f"  {len(contacts)} contact mappings loaded\n")

    print("Querying iMessage database...")
    conn = sqlite3.connect(IMESSAGE_DB)

    # Determine which chats are group chats (more than one handle)
    # Your query - top contacts by message count, split by group vs direct
    rows = conn.execute("""
        WITH chat_participant_count AS (
            SELECT chat_id, COUNT(DISTINCT handle_id) as participant_count
            FROM chat_handle_join
            GROUP BY chat_id
        )
        SELECT
            h.id AS recipient_id,
            SUM(CASE WHEN m.is_from_me = 1 AND cpc.participant_count = 1 THEN 1 ELSE 0 END) AS sent_direct,
            SUM(CASE WHEN m.is_from_me = 0 AND cpc.participant_count = 1 THEN 1 ELSE 0 END) AS received_direct,
            SUM(CASE WHEN cpc.participant_count = 1 THEN 1 ELSE 0 END) AS total_direct,
            SUM(CASE WHEN m.is_from_me = 1 AND cpc.participant_count > 1 THEN 1 ELSE 0 END) AS sent_group,
            SUM(CASE WHEN m.is_from_me = 0 AND cpc.participant_count > 1 THEN 1 ELSE 0 END) AS received_group,
            SUM(CASE WHEN cpc.participant_count > 1 THEN 1 ELSE 0 END) AS total_group
        FROM message m
        JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
        JOIN chat_handle_join chj ON chj.chat_id = cmj.chat_id
        JOIN handle h ON h.ROWID = chj.handle_id
        JOIN chat_participant_count cpc ON cpc.chat_id = cmj.chat_id
        GROUP BY h.id
        ORDER BY total_direct DESC
        LIMIT 300
    """).fetchall()
    conn.close()

    # Build results with resolved names, aggregating by contact name
    by_name = {}
    for (
        handle,
        sent_direct,
        recv_direct,
        total_direct,
        sent_group,
        recv_group,
        total_group,
    ) in rows:
        name = resolve_name(handle, contacts)
        # Skip if no contact match (name is still the raw handle)
        if name == handle:
            continue
        if name not in by_name:
            by_name[name] = {
                "name": name,
                "handles": [],
                "sent_dm": 0,
                "recv_dm": 0,
                "total_dm": 0,
                "sent_gc": 0,
                "recv_gc": 0,
                "total_gc": 0,
            }
        by_name[name]["handles"].append(handle)
        by_name[name]["sent_dm"] += sent_direct
        by_name[name]["recv_dm"] += recv_direct
        by_name[name]["total_dm"] += total_direct
        by_name[name]["sent_gc"] += sent_group
        by_name[name]["recv_gc"] += recv_group
        by_name[name]["total_gc"] += total_group

    # Sort by total_dm descending
    results = sorted(by_name.values(), key=lambda x: x["total_dm"], reverse=True)

    # Write to CSV
    csv_path = "message_stats.csv"
    with open(csv_path, "w", newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "name",
                "handles",
                "sent_dm",
                "recv_dm",
                "total_dm",
                "sent_gc",
                "recv_gc",
                "total_gc",
            ],
        )
        writer.writeheader()
        for r in results:
            row = r.copy()
            row["handles"] = "; ".join(r["handles"])
            writer.writerow(row)
    print(f"Results written to {csv_path}\n")

    # Print results to terminal
    print(
        f"{'Name':<30} {'Sent DM':>10} {'Recv DM':>10} {'Total DM':>10} {'Sent GC':>10} {'Recv GC':>10} {'Total GC':>10}"
    )
    print("-" * 100)

    for r in results:
        name_display = r["name"][:29] if len(r["name"]) > 29 else r["name"]
        print(
            f"{name_display:<30} {r['sent_dm']:>10,} {r['recv_dm']:>10,} {r['total_dm']:>10,} {r['sent_gc']:>10,} {r['recv_gc']:>10,} {r['total_gc']:>10,}"
        )


if __name__ == "__main__":
    main()
