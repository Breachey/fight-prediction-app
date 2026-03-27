#!/usr/bin/env python3
import argparse
import datetime
import sys
from typing import Dict, List, Optional

import requests

USER_AGENT = {"User-Agent": "Mozilla/5.0"}
DOMAINS = [
    "d29dxerjsp82wz.cloudfront.net",
    "live-api.ufc.com",
]
SEGMENT_LABELS = [
    ("Main", "Main Card"),
    ("Prelims1", "Preliminary Card"),
    ("Prelims2", "Early Prelims"),
]


def fetch_event(event_id: int, timeout: float) -> Dict:
    last_error: Optional[Exception] = None
    for domain in DOMAINS:
        url = f"https://{domain}/api/v3/event/live/{event_id}.json"
        try:
            response = requests.get(url, headers=USER_AGENT, timeout=timeout)
            if response.status_code == 404:
                continue
            response.raise_for_status()
            payload = response.json()
        except (requests.RequestException, ValueError) as err:
            last_error = err
            continue

        event = payload.get("LiveEventDetail")
        if isinstance(event, dict) and event:
            return event

    if last_error:
        raise RuntimeError(f"Unable to fetch event {event_id}: {last_error}") from last_error
    raise RuntimeError(f"Event {event_id} was not found on either API domain.")


def fighter_name(fighter: Dict) -> str:
    name = fighter.get("Name", {})
    first = (name.get("FirstName") or "").strip()
    last = (name.get("LastName") or "").strip()
    full = f"{first} {last}".strip()
    return full or "TBD"


def fighter_record_text(fighter: Dict) -> str:
    record = fighter.get("Record", {})
    wins = record.get("Wins", 0) or 0
    losses = record.get("Losses", 0) or 0
    draws = record.get("Draws", 0) or 0
    no_contests = record.get("NoContests", 0) or 0

    base = f"{wins}-{losses}-{draws}"
    if int(no_contests) > 0:
        return f"{base}, {no_contests}NC"
    return base


def fight_line(fight: Dict) -> Optional[str]:
    fighters = fight.get("Fighters", [])
    if not fighters:
        return None

    by_corner: Dict[str, Dict] = {}
    for f in fighters:
        corner = (f.get("Corner") or "").strip().lower()
        by_corner[corner] = f

    left = by_corner.get("red") or fighters[0]
    right = by_corner.get("blue") or (fighters[1] if len(fighters) > 1 else None)

    if not right:
        return f"{fighter_name(left)} ({fighter_record_text(left)}) vs TBD"

    return (
        f"{fighter_name(left)} ({fighter_record_text(left)}) vs "
        f"{fighter_name(right)} ({fighter_record_text(right)})"
    )


def build_output(event: Dict) -> str:
    fights = event.get("FightCard", [])
    fights_sorted = sorted(fights, key=lambda f: f.get("FightOrder", 999))

    lines: List[str] = []
    event_name = event.get("Name") or "Unknown Event"
    start_time = event.get("StartTime") or ""
    location = event.get("Location", {}) if isinstance(event.get("Location", {}), dict) else {}
    city = (location.get("City") or "").strip()
    country = (location.get("Country") or "").strip()

    date_text = "Unknown Date"
    if start_time:
        date_str = str(start_time).split("T")[0]
        try:
            parsed = datetime.datetime.strptime(date_str, "%Y-%m-%d").date()
            date_text = parsed.strftime("%b %d, %Y")
        except ValueError:
            date_text = date_str

    if city and country:
        location_text = f"{city}, {country}"
    elif city:
        location_text = city
    elif country:
        location_text = country
    else:
        location_text = "Unknown Location"

    lines.append(f"Event: {event_name}")
    lines.append(f"Date: {date_text}")
    lines.append(f"Location: {location_text}")
    lines.append("")
    lines.append("Here are the matchups:")
    lines.append("")

    for segment_key, segment_title in SEGMENT_LABELS:
        segment_fights = [f for f in fights_sorted if f.get("CardSegment") == segment_key]
        if not segment_fights:
            continue

        lines.append(segment_title)
        for fight in segment_fights:
            line = fight_line(fight)
            if line:
                lines.append(f"• {line}")
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Print a text fight card for a UFC event ID."
    )
    parser.add_argument(
        "event_id",
        type=int,
        nargs="?",
        help="UFC EventId (e.g., 1295). If omitted, you'll be prompted.",
    )
    parser.add_argument("--timeout", type=float, default=10.0, help="Request timeout in seconds")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    event_id = args.event_id
    if event_id is None:
        try:
            event_id = int(input("Enter UFC EventId: ").strip())
        except ValueError:
            print("Invalid EventId. Please enter a number.", file=sys.stderr)
            sys.exit(1)

    try:
        event = fetch_event(event_id, timeout=args.timeout)
    except RuntimeError as err:
        print(str(err), file=sys.stderr)
        sys.exit(1)

    print(build_output(event), end="")


if __name__ == "__main__":
    main()
