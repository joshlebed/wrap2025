#!/usr/bin/env python3
"""
Script to query iMessage stats with monthly DM totals by contact.
Outputs: message_stats_monthly.csv
Usage: python3 query_messages_monthly.py
"""

import csv
import glob
import os
import re
import sqlite3
from datetime import datetime

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


def generate_months(start_year, start_month, end_year, end_month):
    """Generate list of (year, month) tuples."""
    months = []
    year, month = start_year, start_month
    while (year, month) <= (end_year, end_month):
        months.append((year, month))
        month += 1
        if month > 12:
            month = 1
            year += 1
    return months


def get_month_timestamps(year, month):
    """Get iMessage timestamps (nanoseconds since 2001-01-01) for start and end of a month."""
    # Apple Cocoa epoch is 978307200 seconds after Unix epoch
    APPLE_EPOCH_OFFSET = 978307200

    start = datetime(year, month, 1)
    if month == 12:
        end = datetime(year + 1, 1, 1)
    else:
        end = datetime(year, month + 1, 1)

    # Convert to iMessage format: nanoseconds since 2001-01-01
    start_ns = (int(start.timestamp()) - APPLE_EPOCH_OFFSET) * 1_000_000_000
    end_ns = (int(end.timestamp()) - APPLE_EPOCH_OFFSET) * 1_000_000_000
    return start_ns, end_ns


def get_date_range(conn):
    """Get the date range of messages in the database."""
    APPLE_EPOCH_OFFSET = 978307200

    result = conn.execute("SELECT MIN(date), MAX(date) FROM message WHERE date > 0").fetchone()
    if not result or not result[0]:
        # Default fallback
        return datetime(2019, 1, 1), datetime.now()

    min_ns, max_ns = result
    min_date = datetime.fromtimestamp((min_ns / 1_000_000_000) + APPLE_EPOCH_OFFSET)
    max_date = datetime.fromtimestamp((max_ns / 1_000_000_000) + APPLE_EPOCH_OFFSET)

    return min_date, max_date


def main():
    print("Loading contacts...")
    contacts = load_contacts()
    print(f"  {len(contacts)} contact mappings loaded\n")

    print("Querying iMessage database...")
    conn = sqlite3.connect(IMESSAGE_DB)

    # Get date range from user's actual messages
    min_date, max_date = get_date_range(conn)
    start_year, start_month = min_date.year, min_date.month
    # End at next month to include current month's data
    end_year = max_date.year
    end_month = max_date.month + 1
    if end_month > 12:
        end_month = 1
        end_year += 1

    print(f"  Message date range: {min_date.strftime('%Y-%m')} to {max_date.strftime('%Y-%m')}\n")

    # Generate month columns based on actual data range
    months = generate_months(start_year, start_month, end_year, end_month)
    month_labels = [f"{y}-{m:02d}" for y, m in months]

    # Build dynamic SQL for monthly counts
    month_cases = []
    for y, m in months:
        start_ts, end_ts = get_month_timestamps(y, m)
        label = f"{y}_{m:02d}"
        month_cases.append(
            f"SUM(CASE WHEN cpc.participant_count = 1 AND m.date >= {start_ts} AND m.date < {end_ts} THEN 1 ELSE 0 END) AS dm_{label}"
        )

    month_sql = ",\n            ".join(month_cases)

    query = f"""
        WITH chat_participant_count AS (
            SELECT chat_id, COUNT(DISTINCT handle_id) as participant_count
            FROM chat_handle_join
            GROUP BY chat_id
        )
        SELECT
            h.id AS recipient_id,
            SUM(CASE WHEN cpc.participant_count = 1 THEN 1 ELSE 0 END) AS total_dm,
            {month_sql}
        FROM message m
        JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
        JOIN chat_handle_join chj ON chj.chat_id = cmj.chat_id
        JOIN handle h ON h.ROWID = chj.handle_id
        JOIN chat_participant_count cpc ON cpc.chat_id = cmj.chat_id
        GROUP BY h.id
        ORDER BY total_dm DESC
        LIMIT 100
    """

    rows = conn.execute(query).fetchall()
    conn.close()

    # Build results with resolved names, aggregating by contact name
    by_name = {}
    for row in rows:
        handle = row[0]
        total_dm = row[1]
        monthly_counts = row[2:]

        name = resolve_name(handle, contacts)
        # Skip if no contact match
        if name == handle:
            continue

        if name not in by_name:
            by_name[name] = {
                "name": name,
                "total_dm": 0,
                "months": [0] * len(months),
            }
        by_name[name]["total_dm"] += total_dm
        for i, count in enumerate(monthly_counts):
            by_name[name]["months"][i] += count

    # Sort by total_dm descending and take top 50
    results = sorted(by_name.values(), key=lambda x: x["total_dm"], reverse=True)[:50]

    # Write monthly CSV
    csv_path = "message_stats_monthly.csv"
    fieldnames = ["name", "total_dm"] + month_labels
    with open(csv_path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(fieldnames)
        for r in results:
            row = [r["name"], r["total_dm"]] + r["months"]
            writer.writerow(row)
    print(f"Results written to {csv_path}")
    print(f"  {len(results)} contacts, {len(month_labels)} month columns")

    # Generate quarterly data based on actual date range
    quarters = []
    quarter_labels = []
    end_quarter = (end_month - 1) // 3 + 1
    for y in range(start_year, end_year + 1):
        for q in range(1, 5):
            quarters.append((y, q))
            quarter_labels.append(f"{y}-Q{q}")
    # Filter to valid range
    start_quarter = (start_month - 1) // 3 + 1
    quarters = [(y, q) for y, q in quarters if (y, q) >= (start_year, start_quarter) and (y, q) <= (end_year, end_quarter)]
    quarter_labels = [f"{y}-Q{q}" for y, q in quarters]

    # Map months to quarters
    def month_to_quarter_idx(month_label):
        y, m = int(month_label[:4]), int(month_label[5:7])
        q = (m - 1) // 3 + 1
        try:
            return quarters.index((y, q))
        except ValueError:
            return None

    # Aggregate monthly data to quarterly
    quarterly_results = []
    for r in results:
        q_totals = [0] * len(quarters)
        for i, month_val in enumerate(r["months"]):
            q_idx = month_to_quarter_idx(month_labels[i])
            if q_idx is not None:
                q_totals[q_idx] += month_val
        quarterly_results.append({
            "name": r["name"],
            "total_dm": r["total_dm"],
            "quarters": q_totals
        })

    # Write quarterly CSV
    csv_path_q = "message_stats_quarterly.csv"
    fieldnames_q = ["name", "total_dm"] + quarter_labels
    with open(csv_path_q, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(fieldnames_q)
        for r in quarterly_results:
            row = [r["name"], r["total_dm"]] + r["quarters"]
            writer.writerow(row)
    print(f"Results written to {csv_path_q}")
    print(f"  {len(quarterly_results)} contacts, {len(quarter_labels)} quarter columns")


if __name__ == "__main__":
    main()
