#!/usr/bin/env python3
import argparse
import contextlib
import datetime
import json
import re
import sys
import time
from typing import Dict, List, Optional, Tuple

import requests

from scrape_full_ufc_event_with_tapology import (
    DEFAULT_TAPOLOGY_DELAY_SECONDS,
    DEFAULT_TAPOLOGY_MAP,
    build_supabase_headers,
    build_tapology_session,
    build_ufc_session,
    cache_value_to_csv,
    fetch_supabase_rows,
    fetch_tapology_event_html,
    fetch_ufc_event,
    load_supabase_credentials,
    normalize_name,
    parse_tapology_event_details,
    resolve_tapology_event,
    upsert_tapology_event_cache,
)

DEFAULT_START_ID = 1296
DEFAULT_MAX_IDS = 100
DEFAULT_STOP_AFTER_MISSES = 30
DEFAULT_LOOKBACK_IDS = 80
DEFAULT_DELAY_SECONDS = 0.2
DEFAULT_TIMEOUT_SECONDS = 10.0
DEFAULT_TAPOLOGY_POSTER_LIMIT = 4
DEFAULT_TAPOLOGY_POSTER_TIMEOUT_SECONDS = 6.0

EXCLUDED_EVENT_NAME_PATTERNS = [
    r"\bcontender series\b",
    r"\bdwcs\b",
    r"\bdana white'?s contender\b",
    r"\bbjj\b",
    r"\bgrappling\b",
    r"\bfight pass invitational\b",
    r"\binvitational\b",
    r"\broad to ufc\b",
    r"\btuf\b",
    r"\bultimate fighter\b",
    r"\bpower slap\b",
]


def log(message: str) -> None:
    print(message, file=sys.stderr)


def is_supported_ufc_mma_event_name(name: str) -> bool:
    normalized = normalize_name(name)
    if not normalized:
        return False

    if any(re.search(pattern, normalized) for pattern in EXCLUDED_EVENT_NAME_PATTERNS):
        return False

    if re.match(r"^ufc\s+fight\s+night\b", normalized):
        return True

    # Most numbered events are "UFC 330", but UFC occasionally publishes themed
    # numbered names like "UFC Freedom 250".
    return bool(re.match(r"^ufc\b", normalized) and re.search(r"\b\d{3}\b", normalized))


def event_date(event: Dict) -> Optional[str]:
    start_time = str(event.get("StartTime", "") or "").strip()
    if not start_time:
        return None
    return start_time.split("T")[0] or None


def event_location(event: Dict) -> Dict[str, Optional[str]]:
    location = event.get("Location")
    if not isinstance(location, dict):
        location = {}
    return {
        "venue": cache_value_to_csv(location.get("Venue")) or None,
        "location_city": cache_value_to_csv(location.get("City")) or None,
        "location_state": cache_value_to_csv(location.get("State")) or None,
        "location_country": cache_value_to_csv(location.get("Country")) or None,
    }


def normalize_event_record(event: Dict) -> Optional[Dict[str, object]]:
    event_id = event.get("EventId")
    try:
        parsed_event_id = int(event_id)
    except (TypeError, ValueError):
        return None

    name = cache_value_to_csv(event.get("Name"))
    if not is_supported_ufc_mma_event_name(name):
        return None

    return {
        "id": parsed_event_id,
        "name": name,
        "date": event_date(event),
        **event_location(event),
    }


def fetch_existing_events(timeout: float) -> Dict[int, Dict[str, object]]:
    rows = fetch_supabase_rows(
        "events",
        "id,name,date,is_completed,image_url,venue,location_city,location_state,location_country",
        timeout,
        params={"order": "id.asc"},
    )

    existing: Dict[int, Dict[str, object]] = {}
    for row in rows:
        try:
            existing[int(row["id"])] = row
        except (KeyError, TypeError, ValueError):
            continue
    return existing


def empty_tapology_event_cache_lookup() -> Dict[str, Dict[str, Dict[str, object]]]:
    return {
        "events_by_event_id": {},
        "events_by_date_name": {},
        "fighters_by_fighter_id": {},
        "fighters_by_mma_id": {},
        "fighters_by_name": {},
    }


def fetch_tapology_event_cache_lookup(timeout: float) -> Dict[str, Dict[str, Dict[str, object]]]:
    lookup = empty_tapology_event_cache_lookup()

    try:
        rows = fetch_supabase_rows(
            "tapology_event_cache",
            "event_id,event_name,event_date,tapology_event_url,event_image_url,match_confidence",
            timeout,
            params={"order": "event_id.asc"},
        )
    except (requests.RequestException, ValueError) as err:
        log(f"tapology_event_cache lookup skipped: {err}")
        return lookup

    for row in rows:
        event_id = cache_value_to_csv(row.get("event_id"))
        event_date = cache_value_to_csv(row.get("event_date"))
        event_name = normalize_name(cache_value_to_csv(row.get("event_name")))
        if event_id:
            lookup["events_by_event_id"][event_id] = row
        if event_date and event_name:
            lookup["events_by_date_name"][f"{event_date}|{event_name}"] = row

    if rows:
        log(f"Loaded Tapology event cache from Supabase: {len(rows)} event(s).")

    return lookup


def default_start_id(
    existing_events: Dict[int, Dict[str, object]],
    lookback_ids: int,
) -> int:
    if not existing_events:
        return DEFAULT_START_ID
    return max(DEFAULT_START_ID, max(existing_events.keys()) - max(0, lookback_ids))


def discover_ufc_events(
    start_id: int,
    end_id: Optional[int],
    max_ids: int,
    stop_after_misses: int,
    delay_seconds: float,
    timeout: float,
) -> Tuple[List[Dict], Dict[str, int]]:
    session = build_ufc_session()
    events: List[Dict] = []
    stats = {
        "scanned": 0,
        "api_events_found": 0,
        "eligible_events_found": 0,
        "filtered_events": 0,
        "missing_ids": 0,
    }
    misses = 0
    current_id = start_id

    while stats["scanned"] < max_ids:
        if end_id is not None and current_id > end_id:
            break
        if misses >= stop_after_misses:
            break

        try:
            event = fetch_ufc_event(current_id, session=session, timeout=timeout)
        except RuntimeError:
            stats["missing_ids"] += 1
            misses += 1
            log(f"MISSING {current_id}")
            current_id += 1
            stats["scanned"] += 1
            if delay_seconds > 0:
                time.sleep(delay_seconds)
            continue

        stats["api_events_found"] += 1
        misses = 0
        stats["scanned"] += 1
        name = cache_value_to_csv(event.get("Name"))

        if is_supported_ufc_mma_event_name(name):
            stats["eligible_events_found"] += 1
            events.append(event)
            log(f"FOUND  {current_id}: {name}")
        else:
            stats["filtered_events"] += 1
            log(f"SKIP   {current_id}: {name}")

        current_id += 1
        if delay_seconds > 0:
            time.sleep(delay_seconds)

    return events, stats


def resolve_event_poster(
    event: Dict,
    tapology_session: requests.Session,
    tapology_map_path: str,
    timeout: float,
    tapology_cache_lookup: Dict[str, Dict[str, Dict[str, object]]],
) -> Dict[str, Optional[str]]:
    tapology_event = resolve_tapology_event(
        tapology_session=tapology_session,
        event=event,
        map_path=tapology_map_path,
        timeout=timeout,
        tapology_cache_lookup=tapology_cache_lookup,
    )
    tapology_url = cache_value_to_csv(tapology_event.get("TapologyEventURL"))
    if not tapology_url:
        return {
            "tapology_event_url": None,
            "tapology_match_confidence": None,
            "image_url": None,
            "error": "No Tapology event URL resolved.",
        }

    event_details: Dict[str, object] = {}
    try:
        html = fetch_tapology_event_html(
            tapology_session=tapology_session,
            tapology_event_url=tapology_url,
            timeout=timeout,
        )
        event_details = parse_tapology_event_details(html, tapology_url)
    except (requests.RequestException, RuntimeError) as err:
        return {
            "tapology_event_url": tapology_url,
            "tapology_match_confidence": cache_value_to_csv(
                tapology_event.get("TapologyMatchConfidence")
            ) or None,
            "image_url": cache_value_to_csv(tapology_event.get("TapologyEventImageURL")) or None,
            "error": str(err),
        }

    upsert_tapology_event_cache(
        event=event,
        tapology_event=tapology_event,
        event_details=event_details,
        timeout=timeout,
        source="event-discovery",
    )

    return {
        "tapology_event_url": tapology_url,
        "tapology_match_confidence": cache_value_to_csv(
            tapology_event.get("TapologyMatchConfidence")
        ) or None,
        "image_url": cache_value_to_csv(event_details.get("event_image_url")) or None,
        "error": None,
    }


def insert_event(row: Dict[str, object], timeout: float) -> Dict[str, object]:
    credentials = load_supabase_credentials()
    supabase_url = credentials.get("url", "")
    service_role_key = credentials.get("service_role_key", "")
    if not supabase_url or not service_role_key:
        raise RuntimeError("Missing Supabase credentials.")

    endpoint = f"{supabase_url.rstrip('/')}/rest/v1/events"
    payload_row = {key: value for key, value in row.items() if value is not None}
    response = requests.post(
        endpoint,
        headers={
            **build_supabase_headers(service_role_key),
            "Prefer": "return=representation",
        },
        json=[payload_row],
        timeout=timeout,
    )
    response.raise_for_status()
    payload = response.json()
    return payload[0] if isinstance(payload, list) and payload else row


def update_event(event_id: int, patch: Dict[str, object], timeout: float) -> Dict[str, object]:
    if not patch:
        return {}

    credentials = load_supabase_credentials()
    supabase_url = credentials.get("url", "")
    service_role_key = credentials.get("service_role_key", "")
    if not supabase_url or not service_role_key:
        raise RuntimeError("Missing Supabase credentials.")

    endpoint = f"{supabase_url.rstrip('/')}/rest/v1/events"
    payload_patch = {key: value for key, value in patch.items() if value is not None}
    response = requests.patch(
        endpoint,
        params={"id": f"eq.{event_id}"},
        headers={
            **build_supabase_headers(service_role_key),
            "Prefer": "return=representation",
        },
        json=payload_patch,
        timeout=timeout,
    )
    response.raise_for_status()
    payload = response.json()
    return payload[0] if isinstance(payload, list) and payload else patch


def build_existing_event_patch(
    existing: Dict[str, object],
    discovered: Dict[str, object],
) -> Dict[str, object]:
    patch: Dict[str, object] = {}
    for key in (
        "name",
        "date",
        "venue",
        "location_city",
        "location_state",
        "location_country",
    ):
        value = discovered.get(key)
        if value is not None and value != existing.get(key):
            patch[key] = value

    discovered_image_url = discovered.get("image_url")
    if discovered_image_url and not existing.get("image_url"):
        patch["image_url"] = discovered_image_url

    return patch


def persist_discovered_events(
    events: List[Dict],
    existing_events: Dict[int, Dict[str, object]],
    tapology_map_path: str,
    timeout: float,
    tapology_delay_seconds: float,
    tapology_poster_limit: int,
    tapology_timeout: float,
) -> Dict[str, object]:
    inserted = 0
    updated = 0
    unchanged = 0
    poster_count = 0
    poster_errors: List[str] = []
    event_results: List[Dict[str, object]] = []
    event_results_by_id: Dict[int, Dict[str, object]] = {}
    poster_candidates: List[Tuple[Dict, Dict[str, object]]] = []

    for event in events:
        record = normalize_event_record(event)
        if not record:
            continue

        existing = existing_events.get(int(record["id"]))
        if existing is None:
            inserted_row = {
                **record,
                "is_completed": False,
            }
            insert_event(inserted_row, timeout=timeout)
            existing_events[int(record["id"])] = inserted_row
            inserted += 1
            action = "inserted"
        else:
            patch = build_existing_event_patch(existing, record)
            if patch:
                updated_row = update_event(int(record["id"]), patch, timeout=timeout)
                existing_events[int(record["id"])] = {
                    **existing,
                    **patch,
                    **updated_row,
                }
                updated += 1
                action = "updated"
            else:
                unchanged += 1
                action = "unchanged"

        result_row = {
            "id": record["id"],
            "name": record["name"],
            "date": record.get("date"),
            "image_url": existing_events.get(int(record["id"]), {}).get("image_url") or record.get("image_url"),
            "tapology_event_url": None,
            "tapology_match_confidence": None,
            "action": action,
        }
        event_results.append(result_row)
        event_results_by_id[int(record["id"])] = result_row

        if not result_row.get("image_url"):
            poster_candidates.append((event, record))

    poster_attempt_limit = max(0, int(tapology_poster_limit))
    poster_attempts = 0
    poster_skipped_count = max(0, len(poster_candidates) - poster_attempt_limit)

    if poster_attempt_limit > 0 and poster_candidates:
        tapology_session = build_tapology_session()
        tapology_cache_lookup = fetch_tapology_event_cache_lookup(timeout=tapology_timeout)

        for event, record in poster_candidates[:poster_attempt_limit]:
            poster_attempts += 1
            event_result = event_results_by_id.get(int(record["id"]), {})
            try:
                poster = resolve_event_poster(
                    event=event,
                    tapology_session=tapology_session,
                    tapology_map_path=tapology_map_path,
                    timeout=tapology_timeout,
                    tapology_cache_lookup=tapology_cache_lookup,
                )
                event_result["tapology_event_url"] = poster.get("tapology_event_url")
                event_result["tapology_match_confidence"] = poster.get("tapology_match_confidence")

                if poster.get("image_url"):
                    update_event(int(record["id"]), {"image_url": poster["image_url"]}, timeout=timeout)
                    existing_events[int(record["id"])] = {
                        **existing_events.get(int(record["id"]), {}),
                        "image_url": poster["image_url"],
                    }
                    event_result["image_url"] = poster["image_url"]
                    poster_count += 1

                if poster.get("error"):
                    poster_errors.append(f"{record['id']}: {poster['error']}")
            except Exception as err:
                poster_errors.append(f"{record['id']}: {err}")

            if tapology_delay_seconds > 0:
                time.sleep(tapology_delay_seconds)

    return {
        "insertedCount": inserted,
        "updatedCount": updated,
        "unchangedCount": unchanged,
        "posterCount": poster_count,
        "posterAttemptCount": poster_attempts,
        "posterSkippedCount": poster_skipped_count,
        "posterErrors": poster_errors[:10],
        "events": event_results,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Discover new numbered UFC and UFC Fight Night MMA events and import them into Supabase."
    )
    parser.add_argument("--start-id", type=int, default=None)
    parser.add_argument("--end-id", type=int, default=None)
    parser.add_argument("--max-ids", type=int, default=DEFAULT_MAX_IDS)
    parser.add_argument("--stop-after-misses", type=int, default=DEFAULT_STOP_AFTER_MISSES)
    parser.add_argument("--lookback-ids", type=int, default=DEFAULT_LOOKBACK_IDS)
    parser.add_argument("--delay-seconds", type=float, default=DEFAULT_DELAY_SECONDS)
    parser.add_argument("--timeout", type=float, default=DEFAULT_TIMEOUT_SECONDS)
    parser.add_argument("--tapology-map", default=DEFAULT_TAPOLOGY_MAP)
    parser.add_argument(
        "--tapology-poster-limit",
        type=int,
        default=DEFAULT_TAPOLOGY_POSTER_LIMIT,
    )
    parser.add_argument(
        "--tapology-timeout",
        type=float,
        default=DEFAULT_TAPOLOGY_POSTER_TIMEOUT_SECONDS,
    )
    parser.add_argument(
        "--tapology-delay-seconds",
        type=float,
        default=DEFAULT_TAPOLOGY_DELAY_SECONDS,
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    started_at = datetime.datetime.now(datetime.timezone.utc).isoformat()

    with contextlib.redirect_stdout(sys.stderr):
        existing_events = fetch_existing_events(timeout=args.timeout)
        start_id = args.start_id if args.start_id is not None else default_start_id(
            existing_events,
            lookback_ids=args.lookback_ids,
        )

        events, stats = discover_ufc_events(
            start_id=start_id,
            end_id=args.end_id,
            max_ids=args.max_ids,
            stop_after_misses=args.stop_after_misses,
            delay_seconds=args.delay_seconds,
            timeout=args.timeout,
        )

        fallback_stats = None
        if (
            args.start_id is None
            and stats["eligible_events_found"] == 0
            and start_id > DEFAULT_START_ID
        ):
            log(
                "Default discovery window found no eligible UFC events; "
                f"retrying from {DEFAULT_START_ID}."
            )
            fallback_events, fallback_stats = discover_ufc_events(
                start_id=DEFAULT_START_ID,
                end_id=args.end_id,
                max_ids=args.max_ids,
                stop_after_misses=args.stop_after_misses,
                delay_seconds=args.delay_seconds,
                timeout=args.timeout,
            )
            events_by_id = {
                int(event["EventId"]): event
                for event in events
                if str(event.get("EventId", "")).strip().isdigit()
            }
            for event in fallback_events:
                event_id_text = str(event.get("EventId", "")).strip()
                if event_id_text.isdigit():
                    events_by_id[int(event_id_text)] = event
            events = [events_by_id[key] for key in sorted(events_by_id)]
            stats = {
                **stats,
                "scanned": stats["scanned"] + fallback_stats["scanned"],
                "api_events_found": stats["api_events_found"] + fallback_stats["api_events_found"],
                "eligible_events_found": stats["eligible_events_found"] + fallback_stats["eligible_events_found"],
                "filtered_events": stats["filtered_events"] + fallback_stats["filtered_events"],
                "missing_ids": stats["missing_ids"] + fallback_stats["missing_ids"],
                "fallback_scan_start_id": DEFAULT_START_ID,
                "fallback_scanned": fallback_stats["scanned"],
            }
        persisted = persist_discovered_events(
            events=events,
            existing_events=existing_events,
            tapology_map_path=args.tapology_map,
            timeout=args.timeout,
            tapology_delay_seconds=args.tapology_delay_seconds,
            tapology_poster_limit=args.tapology_poster_limit,
            tapology_timeout=args.tapology_timeout,
        )

    print(
        json.dumps(
            {
                "startedAt": started_at,
                "finishedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "startId": start_id,
                "endId": args.end_id,
                **stats,
                **persisted,
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
