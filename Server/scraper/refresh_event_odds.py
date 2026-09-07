#!/usr/bin/env python3
import argparse
import json
import sys
from contextlib import redirect_stdout
from typing import Dict, List

from scrape_full_ufc_event_with_tapology import (
    build_event_odds_map,
    build_ufc_session,
    expected_odds_entry_count,
    fetch_ufc_event,
    normalize_name,
)


def build_odds_rows(event: Dict, odds_map: Dict[str, str]) -> List[Dict[str, str]]:
    rows: List[Dict[str, str]] = []

    for fight in event.get("FightCard", []):
        for fighter in fight.get("Fighters", []):
            name_info = fighter.get("Name", {})
            first_name = str(name_info.get("FirstName", "")).strip()
            last_name = str(name_info.get("LastName", "")).strip()
            full_name = " ".join(part for part in [first_name, last_name] if part).strip()
            rows.append(
                {
                    "FightId": str(fight.get("FightId", "")).strip(),
                    "FighterId": str(fighter.get("FighterId", "")).strip(),
                    "Corner": str(fighter.get("Corner", "")).strip(),
                    "FirstName": first_name,
                    "LastName": last_name,
                    "odds": str(odds_map.get(normalize_name(full_name), "")).strip(),
                }
            )

    return rows


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fetch only the latest odds for a UFC event."
    )
    parser.add_argument("event_id", type=int, help="UFC EventId to refresh odds for.")
    parser.add_argument(
        "--timeout",
        type=float,
        default=10.0,
        help="HTTP request timeout in seconds.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    with redirect_stdout(sys.stderr):
        with build_ufc_session() as session:
            try:
                event = fetch_ufc_event(
                    args.event_id, session=session, timeout=args.timeout, require_fight_card=True,
                )
            except RuntimeError as err:
                print(str(err), file=sys.stderr)
                sys.exit(1)

            odds_map = build_event_odds_map(event, session=session, timeout=args.timeout)
            if expected_odds_entry_count(event) > 0 and not odds_map:
                print(
                    "No odds source returned prices for this event. "
                    "The stored fight card was not changed.",
                    file=sys.stderr,
                )
                sys.exit(2)

    payload = {
        "event_id": args.event_id,
        "row_count": len(event.get("FightCard", [])) * 2,
        "rows": build_odds_rows(event, odds_map),
    }
    json.dump(payload, sys.stdout, ensure_ascii=True)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
