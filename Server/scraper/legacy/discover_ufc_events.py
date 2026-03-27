#!/usr/bin/env python3
import argparse
import csv
import os
import time
from typing import Dict, List, Optional

import requests

USER_AGENT = {"User-Agent": "Mozilla/5.0"}
DOMAINS = [
    "d29dxerjsp82wz.cloudfront.net",
    "live-api.ufc.com",
]
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))


def fetch_event_detail(event_id: int, timeout: float) -> Optional[Dict[str, str]]:
    for domain in DOMAINS:
        url = f"https://{domain}/api/v3/event/live/{event_id}.json"
        try:
            response = requests.get(url, headers=USER_AGENT, timeout=timeout)
        except requests.RequestException:
            continue

        if response.status_code == 404:
            continue

        try:
            response.raise_for_status()
            payload = response.json()
        except (requests.RequestException, ValueError):
            continue

        event = payload.get("LiveEventDetail")
        if not isinstance(event, dict) or not event:
            continue

        location = event.get("Location", {})
        if not isinstance(location, dict):
            location = {}

        return {
            "RequestedId": str(event_id),
            "EventId": str(event.get("EventId", "")),
            "LiveEventId": str(event.get("LiveEventId", "")),
            "EventName": str(event.get("Name", "")),
            "StartTime": str(event.get("StartTime", "")),
            "EventDate": str(event.get("StartTime", "")).split("T")[0] if event.get("StartTime") else "",
            "EventStatus": str(event.get("Status", "")),
            "TimeZone": str(event.get("TimeZone", "")),
            "Venue": str(location.get("Venue", "")),
            "Location_City": str(location.get("City", "")),
            "Location_State": str(location.get("State", "")),
            "Location_Country": str(location.get("Country", "")),
            "SourceURL": url,
        }

    return None


def discover_events(
    start_id: int,
    end_id: Optional[int],
    stop_after_misses: int,
    delay_seconds: float,
    timeout: float,
    max_ids: int,
) -> List[Dict[str, str]]:
    rows: List[Dict[str, str]] = []
    misses = 0
    current_id = start_id
    scanned = 0

    while True:
        if scanned >= max_ids:
            break
        if end_id is not None and current_id > end_id:
            break
        if misses >= stop_after_misses:
            break

        row = fetch_event_detail(current_id, timeout=timeout)
        scanned += 1
        if row:
            rows.append(row)
            misses = 0
            print(f"FOUND  {current_id}: {row['EventName']}")
        else:
            misses += 1
            print(f"MISSING {current_id}")

        current_id += 1
        if delay_seconds > 0:
            time.sleep(delay_seconds)

    return rows


def load_existing_rows(output_path: str) -> List[Dict[str, str]]:
    if not os.path.exists(output_path):
        return []

    with open(output_path, newline="", encoding="utf-8") as csv_file:
        reader = csv.DictReader(csv_file)
        return list(reader)


def next_start_id(existing_rows: List[Dict[str, str]], fallback_start_id: int) -> int:
    highest_seen: Optional[int] = None

    for row in existing_rows:
        for key in ("RequestedId", "EventId"):
            value = (row.get(key) or "").strip()
            if not value:
                continue
            try:
                numeric_value = int(value)
            except ValueError:
                continue
            if highest_seen is None or numeric_value > highest_seen:
                highest_seen = numeric_value

    if highest_seen is None:
        return fallback_start_id

    return max(fallback_start_id, highest_seen + 1)


def row_needs_backfill(row: Dict[str, str]) -> bool:
    required_fields = [
        "Venue",
        "Location_City",
        "Location_State",
        "Location_Country",
    ]
    return any(not (row.get(field) or "").strip() for field in required_fields)


def backfill_existing_rows(
    existing_rows: List[Dict[str, str]],
    delay_seconds: float,
    timeout: float,
) -> List[Dict[str, str]]:
    refreshed_rows: List[Dict[str, str]] = []

    for row in existing_rows:
        if not row_needs_backfill(row):
            refreshed_rows.append(row)
            continue

        event_id_text = (row.get("RequestedId") or row.get("EventId") or "").strip()
        try:
            event_id = int(event_id_text)
        except ValueError:
            refreshed_rows.append(row)
            continue

        refreshed = fetch_event_detail(event_id, timeout=timeout)
        if refreshed:
            merged_row = dict(row)
            merged_row.update(refreshed)
            refreshed_rows.append(merged_row)
            print(f"BACKFILLED {event_id}: {merged_row.get('EventName', '')}")
        else:
            refreshed_rows.append(row)
            print(f"SKIPPED BACKFILL {event_id}")

        if delay_seconds > 0:
            time.sleep(delay_seconds)

    return refreshed_rows


def merge_rows(existing_rows: List[Dict[str, str]], new_rows: List[Dict[str, str]]) -> List[Dict[str, str]]:
    merged: Dict[str, Dict[str, str]] = {}

    for row in existing_rows + new_rows:
        row_key = (row.get("RequestedId") or row.get("EventId") or "").strip()
        if not row_key:
            continue
        merged[row_key] = row

    return [merged[key] for key in sorted(merged, key=lambda value: int(value))]


def write_csv(rows: List[Dict[str, str]], output_path: str) -> None:
    output_dir = os.path.dirname(output_path)
    if output_dir:
        os.makedirs(output_dir, exist_ok=True)
    fieldnames = [
        "RequestedId",
        "EventId",
        "LiveEventId",
        "EventName",
        "StartTime",
        "EventDate",
        "EventStatus",
        "TimeZone",
        "Venue",
        "Location_City",
        "Location_State",
        "Location_Country",
        "SourceURL",
    ]
    with open(output_path, "w", newline="", encoding="utf-8") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def parse_args() -> argparse.Namespace:
    default_output = os.path.join(SCRIPT_DIR, "ufc_events_after_1295.csv")
    parser = argparse.ArgumentParser(
        description="Discover UFC events by probing /api/v3/event/live/{id}.json"
    )
    parser.add_argument("--start-id", type=int, default=1296, help="Starting event ID")
    parser.add_argument(
        "--end-id",
        type=int,
        default=None,
        help="Optional final event ID. If omitted, scan stops after consecutive misses.",
    )
    parser.add_argument(
        "--stop-after-misses",
        type=int,
        default=5,
        help="Stop after this many consecutive missing IDs.",
    )
    parser.add_argument(
        "--delay-seconds",
        type=float,
        default=0.15,
        help="Delay between requests.",
    )
    parser.add_argument("--timeout", type=float, default=10, help="Request timeout in seconds")
    parser.add_argument(
        "--max-ids",
        type=int,
        default=500,
        help="Hard safety cap for total IDs scanned (always applied).",
    )
    parser.add_argument("--output", default=default_output, help="Output CSV path")
    args = parser.parse_args()

    if args.end_id is not None and args.end_id < args.start_id:
        parser.error("--end-id must be greater than or equal to --start-id")
    if args.stop_after_misses < 1:
        parser.error("--stop-after-misses must be at least 1")
    if args.max_ids < 1:
        parser.error("--max-ids must be at least 1")

    return args


def main() -> None:
    args = parse_args()
    existing_rows = load_existing_rows(args.output)
    if existing_rows:
        existing_rows = backfill_existing_rows(
            existing_rows,
            delay_seconds=args.delay_seconds,
            timeout=args.timeout,
        )
    resume_start_id = next_start_id(existing_rows, args.start_id)
    if existing_rows:
        print(f"Loaded {len(existing_rows)} existing rows from {args.output}")
        print(f"Starting from next event ID: {resume_start_id}")

    rows = discover_events(
        start_id=resume_start_id,
        end_id=args.end_id,
        stop_after_misses=args.stop_after_misses,
        delay_seconds=args.delay_seconds,
        timeout=args.timeout,
        max_ids=args.max_ids,
    )
    all_rows = merge_rows(existing_rows, rows)
    write_csv(all_rows, args.output)
    print(f"\nAdded {len(rows)} new events. CSV now has {len(all_rows)} total rows: {args.output}")


if __name__ == "__main__":
    main()
