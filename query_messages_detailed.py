#!/usr/bin/env python3
"""
Script to query detailed iMessage stats for advanced visualizations.
Outputs:
  - message_stats_sent_recv.csv: sent/received breakdown by month per contact
  - message_response_times.csv: response time stats per contact per month
  - message_day_hour.csv: day/hour heatmap data per contact
Usage: python3 query_messages_detailed.py
"""

import csv
import glob
import json
import os
import re
import sqlite3
from datetime import datetime
from collections import defaultdict

IMESSAGE_DB = os.path.expanduser("~/Library/Messages/chat.db")
ADDRESSBOOK_DIR = os.path.expanduser("~/Library/Application Support/AddressBook")

# Apple Cocoa epoch offset (seconds between 1970 and 2001)
APPLE_EPOCH_OFFSET = 978307200


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
            people = {}
            for row in conn.execute(
                "SELECT ROWID, ZFIRSTNAME, ZLASTNAME FROM ZABCDRECORD WHERE ZFIRSTNAME IS NOT NULL OR ZLASTNAME IS NOT NULL"
            ):
                name = f"{row[1] or ''} {row[2] or ''}".strip()
                if name:
                    people[row[0]] = name

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


def ns_to_datetime(ns_timestamp):
    """Convert iMessage nanoseconds timestamp to datetime."""
    if ns_timestamp is None or ns_timestamp == 0:
        return None
    unix_seconds = (ns_timestamp / 1_000_000_000) + APPLE_EPOCH_OFFSET
    try:
        return datetime.fromtimestamp(unix_seconds)
    except (ValueError, OSError):
        return None


def main():
    print("Loading contacts...")
    contacts = load_contacts()
    print(f"  {len(contacts)} contact mappings loaded\n")

    print("Querying iMessage database for detailed stats...")
    conn = sqlite3.connect(IMESSAGE_DB)

    # Get start timestamp for Jan 2019
    start_date = datetime(2019, 1, 1)
    start_ns = (int(start_date.timestamp()) - APPLE_EPOCH_OFFSET) * 1_000_000_000

    # ============================================
    # 1. Sent vs Received by month per contact
    # ============================================
    print("  Fetching sent/received data...")

    sent_recv_query = """
        WITH chat_participant_count AS (
            SELECT chat_id, COUNT(DISTINCT handle_id) as participant_count
            FROM chat_handle_join
            GROUP BY chat_id
        )
        SELECT
            h.id AS handle_id,
            m.is_from_me,
            m.date
        FROM message m
        JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
        JOIN chat_handle_join chj ON chj.chat_id = cmj.chat_id
        JOIN handle h ON h.ROWID = chj.handle_id
        JOIN chat_participant_count cpc ON cpc.chat_id = cmj.chat_id
        WHERE cpc.participant_count = 1 AND m.date >= ?
        ORDER BY h.id, m.date
    """

    # Aggregate by contact and month
    sent_recv_data = defaultdict(lambda: defaultdict(lambda: {"sent": 0, "recv": 0}))

    for handle, is_from_me, date_ns in conn.execute(sent_recv_query, (start_ns,)):
        name = resolve_name(handle, contacts)
        if name == handle:  # Skip unresolved
            continue
        dt = ns_to_datetime(date_ns)
        if dt is None:
            continue
        month_key = dt.strftime("%Y-%m")
        if is_from_me:
            sent_recv_data[name][month_key]["sent"] += 1
        else:
            sent_recv_data[name][month_key]["recv"] += 1

    # ============================================
    # 2. Response times per contact per month
    # ============================================
    print("  Calculating response times...")

    response_query = """
        WITH chat_participant_count AS (
            SELECT chat_id, COUNT(DISTINCT handle_id) as participant_count
            FROM chat_handle_join
            GROUP BY chat_id
        )
        SELECT
            h.id AS handle_id,
            m.is_from_me,
            m.date,
            cmj.chat_id
        FROM message m
        JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
        JOIN chat_handle_join chj ON chj.chat_id = cmj.chat_id
        JOIN handle h ON h.ROWID = chj.handle_id
        JOIN chat_participant_count cpc ON cpc.chat_id = cmj.chat_id
        WHERE cpc.participant_count = 1 AND m.date >= ?
        ORDER BY cmj.chat_id, m.date
    """

    # Group messages by chat
    chat_messages = defaultdict(list)
    chat_to_name = {}

    for handle, is_from_me, date_ns, chat_id in conn.execute(response_query, (start_ns,)):
        name = resolve_name(handle, contacts)
        if name == handle:
            continue
        dt = ns_to_datetime(date_ns)
        if dt is None:
            continue
        chat_messages[chat_id].append({
            "is_from_me": is_from_me,
            "datetime": dt,
            "name": name
        })
        chat_to_name[chat_id] = name

    # Calculate response times
    # my_response_times: time for me to reply after they message
    # their_response_times: time for them to reply after I message
    response_times = defaultdict(lambda: defaultdict(lambda: {
        "my_response_times": [],
        "their_response_times": []
    }))

    for chat_id, messages in chat_messages.items():
        name = chat_to_name[chat_id]
        messages.sort(key=lambda x: x["datetime"])

        for i in range(1, len(messages)):
            prev = messages[i - 1]
            curr = messages[i]

            # Calculate time difference in minutes
            time_diff = (curr["datetime"] - prev["datetime"]).total_seconds() / 60

            # Only count responses within 24 hours
            if time_diff > 24 * 60:
                continue

            month_key = curr["datetime"].strftime("%Y-%m")

            if prev["is_from_me"] == 0 and curr["is_from_me"] == 1:
                # They messaged, I replied
                response_times[name][month_key]["my_response_times"].append(time_diff)
            elif prev["is_from_me"] == 1 and curr["is_from_me"] == 0:
                # I messaged, they replied
                response_times[name][month_key]["their_response_times"].append(time_diff)

    # ============================================
    # 3. Day/Hour heatmap per contact
    # ============================================
    print("  Building day/hour heatmap data...")

    day_hour_data = defaultdict(lambda: defaultdict(lambda: [[0]*24 for _ in range(7)]))

    day_hour_query = """
        WITH chat_participant_count AS (
            SELECT chat_id, COUNT(DISTINCT handle_id) as participant_count
            FROM chat_handle_join
            GROUP BY chat_id
        )
        SELECT
            h.id AS handle_id,
            m.date
        FROM message m
        JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
        JOIN chat_handle_join chj ON chj.chat_id = cmj.chat_id
        JOIN handle h ON h.ROWID = chj.handle_id
        JOIN chat_participant_count cpc ON cpc.chat_id = cmj.chat_id
        WHERE cpc.participant_count = 1 AND m.date >= ?
    """

    for handle, date_ns in conn.execute(day_hour_query, (start_ns,)):
        name = resolve_name(handle, contacts)
        if name == handle:
            continue
        dt = ns_to_datetime(date_ns)
        if dt is None:
            continue

        day_of_week = dt.weekday()  # 0=Monday, 6=Sunday
        hour = dt.hour
        year = dt.year

        day_hour_data[name][year][day_of_week][hour] += 1

    conn.close()

    # ============================================
    # Write CSV files
    # ============================================

    # Get all months from Jan 2019 to Feb 2026
    months = []
    for year in range(2019, 2027):
        for month in range(1, 13):
            if (year, month) <= (2026, 2):
                months.append(f"{year}-{month:02d}")

    # Get top contacts by total messages
    contact_totals = {}
    for name, month_data in sent_recv_data.items():
        total = sum(d["sent"] + d["recv"] for d in month_data.values())
        contact_totals[name] = total

    top_contacts = sorted(contact_totals.keys(), key=lambda x: contact_totals[x], reverse=True)[:50]

    # 1. Write sent/received CSV
    print("\nWriting message_stats_sent_recv.csv...")
    with open("message_stats_sent_recv.csv", "w", newline="") as f:
        # Format: name, total_sent, total_recv, YYYY-MM_sent, YYYY-MM_recv, ...
        fieldnames = ["name", "total_sent", "total_recv"]
        for m in months:
            fieldnames.extend([f"{m}_sent", f"{m}_recv"])

        writer = csv.writer(f)
        writer.writerow(fieldnames)

        for name in top_contacts:
            total_sent = sum(sent_recv_data[name][m]["sent"] for m in months)
            total_recv = sum(sent_recv_data[name][m]["recv"] for m in months)
            row = [name, total_sent, total_recv]
            for m in months:
                row.extend([sent_recv_data[name][m]["sent"], sent_recv_data[name][m]["recv"]])
            writer.writerow(row)

    # 2. Write response times CSV
    print("Writing message_response_times.csv...")
    with open("message_response_times.csv", "w", newline="") as f:
        # Format: name, month, my_median_mins, their_median_mins, my_count, their_count
        writer = csv.writer(f)
        writer.writerow(["name", "month", "my_median_mins", "their_median_mins", "my_count", "their_count"])

        for name in top_contacts:
            for m in months:
                my_times = response_times[name][m]["my_response_times"]
                their_times = response_times[name][m]["their_response_times"]

                my_median = sorted(my_times)[len(my_times)//2] if my_times else None
                their_median = sorted(their_times)[len(their_times)//2] if their_times else None

                if my_times or their_times:
                    writer.writerow([
                        name, m,
                        round(my_median, 1) if my_median else "",
                        round(their_median, 1) if their_median else "",
                        len(my_times),
                        len(their_times)
                    ])

    # 3. Write day/hour heatmap CSV (as JSON per contact)
    print("Writing message_day_hour.json...")
    day_hour_output = {}
    for name in top_contacts:
        day_hour_output[name] = {
            "all_time": [[0]*24 for _ in range(7)],
            "by_year": {}
        }
        for year, grid in day_hour_data[name].items():
            day_hour_output[name]["by_year"][year] = grid
            for day in range(7):
                for hour in range(24):
                    day_hour_output[name]["all_time"][day][hour] += grid[day][hour]

    with open("message_day_hour.json", "w") as f:
        json.dump(day_hour_output, f)

    print(f"\nDone! Generated data for {len(top_contacts)} contacts.")


if __name__ == "__main__":
    main()
