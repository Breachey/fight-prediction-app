#!/usr/bin/env python3
import argparse
import csv
import datetime
import json
import os
import re
import subprocess
import sys
import time
import unicodedata
from urllib.parse import quote
from typing import Dict, Iterable, List, Optional, Tuple

import requests
from bs4 import BeautifulSoup
import certifi

from fighter_profile_sources import (
    PROFILE_FIELDS as VALIDATED_PROFILE_FIELDS,
    RateLimiter as ProfileSourceRateLimiter,
    build_session as build_profile_source_session,
    scrape_fighter_sources,
)

try:
    import cloudscraper
except ImportError:
    cloudscraper = None

DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/123.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}
UFC_DOMAINS = [
    "d29dxerjsp82wz.cloudfront.net",
    "live-api.ufc.com",
]
TAPOLOGY_UFC_SCHEDULE_URL = "https://www.tapology.com/fightcenter?group=ufc"
DEFAULT_TAPOLOGY_PROXY_URL_TEMPLATE = (
    "https://api.allorigins.win/raw?url={url}"
)
FIGHTODDS_GQL_URL = "https://api.fightodds.io/gql"
COVERS_UFC_ODDS_URL = "https://www.covers.com/sport/mma/ufc/odds"
SUPABASE_STYLE_SELECT = "fighter_id,mma_id,first_name,last_name,style"
SUPABASE_FIGHTER_PROFILE_SELECT = (
    "fighter_id,mma_id,first_name,last_name,normalized_name,tapology_fighter_url,"
    "rank,streak,style,ko_tko_wins,ko_tko_losses,submission_wins,"
    "submission_losses,decision_wins,decision_losses,stats_confidence,"
    "sig_str_landed_per_min,sig_str_absorbed_per_min,sig_strike_accuracy_pct,"
    "sig_strike_defense_pct,takedown_avg_per_15,takedown_accuracy_pct,"
    "takedown_defense_pct,submission_avg_per_15,knockdown_avg_per_15,"
    "average_fight_time_seconds,recent_form,last_fight_date,"
    "stats_source,streak_source,streak_verified_at,streak_needs_review,"
    "streak_record_wins,streak_record_losses,last_success_at,last_failure_at,last_error"
)
SUPABASE_TAPOLOGY_EVENT_SELECT = (
    "event_id,event_name,event_date,tapology_event_url,event_image_url,"
    "match_confidence,source,last_success_at,last_failure_at,last_error"
)
SUPABASE_TAPOLOGY_FIGHTER_SELECT = (
    "fighter_id,mma_id,first_name,last_name,normalized_name,tapology_fighter_url,"
    "rank,streak,style,ko_tko_wins,ko_tko_losses,submission_wins,"
    "submission_losses,decision_wins,decision_losses,match_confidence,"
    "sig_str_landed_per_min,sig_str_absorbed_per_min,sig_strike_accuracy_pct,"
    "sig_strike_defense_pct,takedown_avg_per_15,takedown_accuracy_pct,"
    "takedown_defense_pct,submission_avg_per_15,knockdown_avg_per_15,"
    "average_fight_time_seconds,recent_form,last_fight_date,"
    "source,last_success_at,last_failure_at,last_error"
)
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SERVER_ROOT = os.path.dirname(SCRIPT_DIR)
REPO_ROOT = os.path.dirname(SERVER_ROOT)
DEFAULT_OUTPUT_DIR = os.path.join(SCRIPT_DIR, "fight_cards")
DEFAULT_TAPOLOGY_MAP = os.path.join(SCRIPT_DIR, "tapology_event_map.csv")
DEFAULT_TAPOLOGY_CACHE_DIR = os.path.join(SCRIPT_DIR, "tapology_cache")
DEFAULT_TAPOLOGY_DELAY_SECONDS = 1.25
DEFAULT_TAPOLOGY_PREVIEW_PROFILE_LIMIT = 4
CURRENT_STREAK_SOURCES = {"manual", "tapology_live", "sherdog_live", "fight_results"}
TAPOLOGY_ENRICHMENT_FIELDS = [
    "TapologyFighterURL",
    "TapologyMatchConfidence",
    "Rank",
    "Streak",
    "style",
    "KO_TKO_Wins",
    "KO_TKO_Losses",
    "Submission_Wins",
    "Submission_Losses",
    "Decision_Wins",
    "Decision_Losses",
    "SigStrLandedPerMin",
    "SigStrAbsorbedPerMin",
    "SigStrikeAccuracyPct",
    "SigStrikeDefensePct",
    "TakedownAvgPer15",
    "TakedownAccuracyPct",
    "TakedownDefensePct",
    "SubmissionAvgPer15",
    "KnockdownAvgPer15",
    "AverageFightTimeSeconds",
    "RecentForm",
    "LastFightDate",
]
KNOWN_FIGHTER_NAME_VARIANTS = {
    "patricio pitbull": {"patricio freire"},
    "patricio freire": {"patricio pitbull"},
    "loopy godinez": {"lupita godinez"},
    "lupita godinez": {"loopy godinez"},
}
CSV_HEADERS = [
    "id",
    "Event",
    "EventId",
    "StartTime",
    "TimeZone",
    "EventStatus",
    "OrganizationId",
    "OrganizationName",
    "Venue",
    "VenueId",
    "Location_City",
    "Location_State",
    "Location_Country",
    "TriCode",
    "FightId",
    "FightOrder",
    "FightStatus",
    "PossibleRounds",
    "Referee_FirstName",
    "Referee_LastName",
    "IsTitleFight",
    "TitleFightName",
    "CardSegment",
    "CardSegmentStartTime",
    "CardSegmentBroadcaster",
    "FighterId",
    "MMAId",
    "Corner",
    "FirstName",
    "LastName",
    "Nickname",
    "DOB",
    "Age",
    "Stance",
    "Weight_lbs",
    "Height_in",
    "Reach_in",
    "UFC_Profile",
    "FighterWeightClass",
    "Record_Wins",
    "Record_Losses",
    "Record_Draws",
    "Record_NoContests",
    "Born_City",
    "Born_State",
    "Born_Country",
    "FightingOutOf_City",
    "FightingOutOf_State",
    "FightingOutOf_Country",
    "ImageURL",
    "Rank",
    "odds",
    "Streak",
    "style",
    "KO_TKO_Wins",
    "KO_TKO_Losses",
    "Submission_Wins",
    "Submission_Losses",
    "Decision_Wins",
    "Decision_Losses",
    "SigStrLandedPerMin",
    "SigStrAbsorbedPerMin",
    "SigStrikeAccuracyPct",
    "SigStrikeDefensePct",
    "TakedownAvgPer15",
    "TakedownAccuracyPct",
    "TakedownDefensePct",
    "SubmissionAvgPer15",
    "KnockdownAvgPer15",
    "AverageFightTimeSeconds",
    "RecentForm",
    "LastFightDate",
    "TapologyEventURL",
    "TapologyFighterURL",
    "TapologyMatchConfidence",
]


def emit_scrape_progress(
    phase: str,
    label: str,
    detail: str = "",
    percent: Optional[float] = None,
    current: Optional[int] = None,
    total: Optional[int] = None,
) -> None:
    payload = {
        "phase": phase,
        "label": label,
        "detail": detail,
        "percent": percent,
        "current": current,
        "total": total,
    }
    print(f"FIGHT_PICKER_PROGRESS {json.dumps(payload, ensure_ascii=True)}", flush=True)


def absolute_tapology_url(value: str) -> str:
    if value.startswith("http://") or value.startswith("https://"):
        return value
    return f"https://www.tapology.com{value}"


def build_ufc_session() -> requests.Session:
    session = requests.Session()
    session.headers.update(DEFAULT_HEADERS)
    return session


def build_tapology_session() -> requests.Session:
    if cloudscraper is not None:
        session = cloudscraper.create_scraper(
            browser={
                "browser": "chrome",
                "platform": "darwin",
                "mobile": False,
            }
        )
    else:
        print(
            "cloudscraper is not installed; Tapology Cloudflare challenges are likely to fail.",
            file=sys.stderr,
        )
        session = requests.Session()
    session.headers.update(DEFAULT_HEADERS)
    session.verify = certifi.where()
    return session


def is_cloudflare_challenge(response: requests.Response) -> bool:
    if response.status_code != 403:
        return False

    server = str(response.headers.get("server", "")).lower()
    body_start = response.text[:300].lower()
    return "cloudflare" in server and "just a moment" in body_start


def raise_for_status_with_context(response: requests.Response, url: str) -> None:
    if is_cloudflare_challenge(response):
        raise RuntimeError(
            "The target site blocked the request with a Cloudflare challenge. "
            "Install 'cloudscraper' so the script can fetch protected pages: "
            "'python3 -m pip install cloudscraper'. "
            f"Blocked URL: {url}"
        )

    response.raise_for_status()


def tapology_proxy_url(url: str) -> str:
    template = os.getenv(
        "TAPOLOGY_PROXY_URL_TEMPLATE",
        DEFAULT_TAPOLOGY_PROXY_URL_TEMPLATE,
    ).strip()
    if not template or template.lower() in {"0", "false", "none", "off"}:
        return ""

    encoded_url = quote(url, safe="")
    if "{encoded_url}" in template:
        return template.replace("{encoded_url}", encoded_url)
    if "{url}" in template:
        return template.replace("{url}", url)
    return ""


def should_use_curl_proxy_fallback() -> bool:
    value = os.getenv("TAPOLOGY_PROXY_CURL_FALLBACK", "true").strip().lower()
    return value not in {"0", "false", "none", "off"}


def fetch_url_with_curl(url: str, timeout: float) -> str:
    result = subprocess.run(
        [
            "curl",
            "-fsSL",
            "--max-time",
            str(int(max(timeout, 30.0))),
            url,
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout


def normalize_name(value: Optional[str]) -> str:
    if not value:
        return ""

    normalized = unicodedata.normalize("NFKD", value)
    normalized = normalized.replace("’", "'").replace("`", "'")
    normalized = normalized.encode("ascii", "ignore").decode("ascii")
    normalized = re.sub(r"[^a-z0-9]+", " ", normalized.lower())
    return re.sub(r"\s+", " ", normalized).strip()


def fighter_full_name(fighter: Dict) -> str:
    name_info = fighter.get("Name", {})
    return " ".join(
        part for part in [name_info.get("FirstName", ""), name_info.get("LastName", "")]
        if part
    ).strip()


def normalize_style(value: Optional[str]) -> str:
    if not value:
        return ""
    normalized = re.sub(r"\s+", " ", str(value)).strip()
    if not normalized or normalized.upper() == "N/A":
        return ""
    return normalized


def slugify(value: Optional[str]) -> str:
    return normalize_name(value).replace(" ", "-").strip("-")


def parse_env_file(path: str) -> Dict[str, str]:
    values: Dict[str, str] = {}
    if not os.path.exists(path):
        return values

    with open(path, encoding="utf-8") as env_file:
        for raw_line in env_file:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue

            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip("'").strip('"')
            if key:
                values[key] = value

    return values


def load_supabase_credentials() -> Dict[str, str]:
    if os.getenv("SUPABASE_DISABLED", "").strip().lower() in {"1", "true", "yes", "on"}:
        return {"url": "", "service_role_key": ""}
    credentials = {
        "url": os.getenv("SUPABASE_URL", "").strip(),
        "service_role_key": os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip(),
    }
    if credentials["url"] and credentials["service_role_key"]:
        return credentials

    env_candidates = [
        os.path.join(SERVER_ROOT, ".env"),
        os.path.join(REPO_ROOT, ".env"),
    ]

    for env_path in env_candidates:
        env_values = parse_env_file(env_path)
        if not credentials["url"]:
            credentials["url"] = env_values.get("SUPABASE_URL", "").strip()
        if not credentials["service_role_key"]:
            credentials["service_role_key"] = env_values.get(
                "SUPABASE_SERVICE_ROLE_KEY", ""
            ).strip()
        if credentials["url"] and credentials["service_role_key"]:
            break

    return credentials


def build_supabase_headers(service_role_key: str) -> Dict[str, str]:
    return {
        "apikey": service_role_key,
        "Authorization": f"Bearer {service_role_key}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }


def fetch_supabase_rows(
    table_name: str,
    select_clause: str,
    timeout: float,
    params: Optional[Dict[str, str]] = None,
) -> List[Dict[str, object]]:
    credentials = load_supabase_credentials()
    supabase_url = credentials.get("url", "")
    service_role_key = credentials.get("service_role_key", "")
    if not supabase_url or not service_role_key:
        return []

    endpoint = f"{supabase_url.rstrip('/')}/rest/v1/{table_name}"
    rows: List[Dict[str, object]] = []
    offset = 0
    page_size = 1000
    base_params = {
        "select": select_clause,
        **(params or {}),
    }

    while True:
        response = requests.get(
            endpoint,
            params=base_params,
            headers={
                **build_supabase_headers(service_role_key),
                "Range": f"{offset}-{offset + page_size - 1}",
            },
            timeout=timeout,
        )
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, list) or not payload:
            break

        rows.extend(payload)
        if len(payload) < page_size:
            break

        offset += page_size

    return rows


def upsert_supabase_rows(
    table_name: str,
    rows: List[Dict[str, object]],
    conflict_column: str,
    timeout: float,
) -> int:
    if not rows:
        return 0

    credentials = load_supabase_credentials()
    supabase_url = credentials.get("url", "")
    service_role_key = credentials.get("service_role_key", "")
    if not supabase_url or not service_role_key:
        return 0

    endpoint = f"{supabase_url.rstrip('/')}/rest/v1/{table_name}"
    inserted_count = 0
    compact_rows = [
        {key: value for key, value in row.items() if value is not None}
        for row in rows
    ]

    for row in compact_rows:
        if conflict_column not in row:
            continue
        response = requests.post(
            endpoint,
            params={"on_conflict": conflict_column},
            headers={
                **build_supabase_headers(service_role_key),
                "Prefer": "resolution=merge-duplicates,return=minimal",
            },
            json=[row],
            timeout=timeout,
        )
        response.raise_for_status()
        inserted_count += 1

    return inserted_count


def parse_optional_int(value: object) -> Optional[int]:
    if value is None:
        return None

    normalized = str(value).strip()
    if not normalized or not re.fullmatch(r"-?\d+", normalized):
        return None

    return int(normalized)


def parse_optional_float(value: object) -> Optional[float]:
    if value is None:
        return None

    normalized = str(value).strip()
    if not normalized:
        return None
    try:
        parsed = float(normalized)
    except ValueError:
        return None
    return parsed if parsed == parsed and abs(parsed) != float("inf") else None


def cache_value_to_csv(value: object) -> str:
    if value is None:
        return ""
    return str(value).strip()


def cache_confidence(value: object, prefix: str = "cache") -> str:
    confidence = cache_value_to_csv(value)
    return f"{prefix}:{confidence}" if confidence else prefix


def cached_streak_is_current(row: Dict[str, object]) -> bool:
    source = cache_value_to_csv(row.get("streak_source")).lower()
    verified_at = cache_value_to_csv(row.get("streak_verified_at"))
    needs_review = row.get("streak_needs_review") is True
    return source in CURRENT_STREAK_SOURCES and bool(verified_at) and not needs_review


def normalize_tapology_cache_fighter(row: Dict[str, object]) -> Dict[str, str]:
    last_attempt_at = max(
        (
            cache_value_to_csv(row.get("last_success_at")),
            cache_value_to_csv(row.get("last_failure_at")),
        ),
        default="",
    )
    return {
        "TapologyFighterURL": cache_value_to_csv(row.get("tapology_fighter_url")),
        "TapologyMatchConfidence": cache_confidence(
            row.get("match_confidence") or row.get("stats_confidence")
        ),
        "Rank": cache_value_to_csv(row.get("rank")),
        "Streak": (
            cache_value_to_csv(row.get("streak"))
            if cached_streak_is_current(row)
            else ""
        ),
        "style": cache_value_to_csv(row.get("style")),
        "KO_TKO_Wins": cache_value_to_csv(row.get("ko_tko_wins")),
        "KO_TKO_Losses": cache_value_to_csv(row.get("ko_tko_losses")),
        "Submission_Wins": cache_value_to_csv(row.get("submission_wins")),
        "Submission_Losses": cache_value_to_csv(row.get("submission_losses")),
        "Decision_Wins": cache_value_to_csv(row.get("decision_wins")),
        "Decision_Losses": cache_value_to_csv(row.get("decision_losses")),
        "SigStrLandedPerMin": cache_value_to_csv(row.get("sig_str_landed_per_min")),
        "SigStrAbsorbedPerMin": cache_value_to_csv(row.get("sig_str_absorbed_per_min")),
        "SigStrikeAccuracyPct": cache_value_to_csv(row.get("sig_strike_accuracy_pct")),
        "SigStrikeDefensePct": cache_value_to_csv(row.get("sig_strike_defense_pct")),
        "TakedownAvgPer15": cache_value_to_csv(row.get("takedown_avg_per_15")),
        "TakedownAccuracyPct": cache_value_to_csv(row.get("takedown_accuracy_pct")),
        "TakedownDefensePct": cache_value_to_csv(row.get("takedown_defense_pct")),
        "SubmissionAvgPer15": cache_value_to_csv(row.get("submission_avg_per_15")),
        "KnockdownAvgPer15": cache_value_to_csv(row.get("knockdown_avg_per_15")),
        "AverageFightTimeSeconds": cache_value_to_csv(row.get("average_fight_time_seconds")),
        "RecentForm": cache_value_to_csv(row.get("recent_form")),
        "LastFightDate": cache_value_to_csv(row.get("last_fight_date")),
        "_TapologyLastAttemptAt": last_attempt_at,
    }


def empty_tapology_cache_lookup() -> Dict[str, Dict[str, Dict[str, object]]]:
    return {
        "events_by_event_id": {},
        "events_by_date_name": {},
        "fighters_by_fighter_id": {},
        "fighters_by_mma_id": {},
        "fighters_by_name": {},
    }


def fetch_tapology_cache_lookup(timeout: float) -> Dict[str, Dict[str, Dict[str, object]]]:
    lookup = empty_tapology_cache_lookup()

    try:
        event_rows = fetch_supabase_rows(
            "tapology_event_cache",
            SUPABASE_TAPOLOGY_EVENT_SELECT,
            timeout,
            params={"order": "event_id.asc"},
        )
    except (requests.RequestException, ValueError) as err:
        print(f"tapology_event_cache lookup skipped: {err}")
        event_rows = []

    for row in event_rows:
        event_id = cache_value_to_csv(row.get("event_id"))
        event_date = cache_value_to_csv(row.get("event_date"))
        event_name = normalize_name(cache_value_to_csv(row.get("event_name")))
        if event_id:
            lookup["events_by_event_id"][event_id] = row
        if event_date and event_name:
            lookup["events_by_date_name"][f"{event_date}|{event_name}"] = row

    try:
        fighter_rows = fetch_supabase_rows(
            "tapology_fighter_cache",
            SUPABASE_TAPOLOGY_FIGHTER_SELECT,
            timeout,
            params={"order": "fighter_id.asc"},
        )
    except (requests.RequestException, ValueError) as err:
        print(f"tapology_fighter_cache lookup skipped: {err}")
        fighter_rows = []

    def add_fighter_cache_row(row: Dict[str, object], overwrite: bool = False) -> None:
        fighter_id = cache_value_to_csv(row.get("fighter_id"))
        mma_id = cache_value_to_csv(row.get("mma_id"))
        normalized_name = normalize_name(
            cache_value_to_csv(row.get("normalized_name"))
            or " ".join(
                part
                for part in [
                    cache_value_to_csv(row.get("first_name")),
                    cache_value_to_csv(row.get("last_name")),
                ]
                if part
            )
        )

        if fighter_id and (overwrite or fighter_id not in lookup["fighters_by_fighter_id"]):
            lookup["fighters_by_fighter_id"][fighter_id] = row
        if mma_id and (overwrite or mma_id not in lookup["fighters_by_mma_id"]):
            lookup["fighters_by_mma_id"][mma_id] = row
        if normalized_name and (overwrite or normalized_name not in lookup["fighters_by_name"]):
            lookup["fighters_by_name"][normalized_name] = row

    for row in fighter_rows:
        add_fighter_cache_row(row)

    try:
        profile_rows = fetch_supabase_rows(
            "fighters",
            SUPABASE_FIGHTER_PROFILE_SELECT,
            timeout,
            params={"order": "fighter_id.asc"},
        )
    except (requests.RequestException, ValueError) as err:
        print(f"fighters profile lookup skipped: {err}")
        profile_rows = []

    for row in profile_rows:
        add_fighter_cache_row(row, overwrite=True)

    if event_rows or fighter_rows or profile_rows:
        print(
            "Loaded Tapology cache from Supabase: "
            f"{len(event_rows)} event(s), {len(fighter_rows)} Tapology fighter cache row(s), "
            f"{len(profile_rows)} fighter profile row(s)."
        )

    return lookup


def tapology_cache_event_for_event(
    event: Dict,
    tapology_cache_lookup: Dict[str, Dict[str, Dict[str, object]]],
) -> Dict[str, str]:
    event_id = str(event.get("EventId", "")).strip()
    event_name = normalize_name(event.get("Name", ""))
    event_date = str(event.get("StartTime", "")).split("T")[0]
    cache_row = tapology_cache_lookup.get("events_by_event_id", {}).get(event_id)

    if cache_row is None and event_date and event_name:
        cache_row = tapology_cache_lookup.get("events_by_date_name", {}).get(
            f"{event_date}|{event_name}"
        )

    tapology_url = cache_value_to_csv(cache_row.get("tapology_event_url")) if cache_row else ""
    if not tapology_url:
        return {
            "TapologyEventURL": "",
            "TapologyMatchConfidence": "",
        }

    return {
        "TapologyEventURL": tapology_url,
        "TapologyMatchConfidence": cache_confidence(cache_row.get("match_confidence")),
        "TapologyEventImageURL": cache_value_to_csv(cache_row.get("event_image_url")),
    }


def tapology_cache_fighter_for_fighter(
    fighter: Dict,
    tapology_cache_lookup: Dict[str, Dict[str, Dict[str, object]]],
) -> Dict[str, str]:
    fighter_id = str(fighter.get("FighterId", "")).strip()
    mma_id = str(fighter.get("MMAId", "")).strip()
    fighter_name = normalize_name(fighter_full_name(fighter))

    cache_row = None
    if fighter_id:
        cache_row = tapology_cache_lookup.get("fighters_by_fighter_id", {}).get(fighter_id)
    if cache_row is None and mma_id:
        cache_row = tapology_cache_lookup.get("fighters_by_mma_id", {}).get(mma_id)
    if cache_row is None and fighter_name:
        cache_row = tapology_cache_lookup.get("fighters_by_name", {}).get(fighter_name)

    if not cache_row:
        return {}

    normalized = normalize_tapology_cache_fighter(cache_row)
    if normalized.get("Streak"):
        record = fighter.get("Record", {}) or {}
        actual_wins = parse_optional_int(record.get("Wins"))
        actual_losses = parse_optional_int(record.get("Losses"))
        expected_wins = parse_optional_int(cache_row.get("streak_record_wins"))
        expected_losses = parse_optional_int(cache_row.get("streak_record_losses"))
        if (
            actual_wins is None
            or actual_losses is None
            or expected_wins is None
            or expected_losses is None
            or actual_wins != expected_wins
            or actual_losses != expected_losses
        ):
            normalized["Streak"] = ""

    return normalized


def load_tapology_cache_fighter_enrichment(
    event: Dict,
    tapology_cache_lookup: Dict[str, Dict[str, Dict[str, object]]],
) -> Dict[str, Dict[str, str]]:
    enrichment: Dict[str, Dict[str, str]] = {}

    for fight in event.get("FightCard", []):
        for fighter in fight.get("Fighters", []):
            fighter_key = normalize_name(fighter_full_name(fighter))
            if not fighter_key:
                continue

            cached_fighter = tapology_cache_fighter_for_fighter(
                fighter,
                tapology_cache_lookup,
            )
            if cached_fighter:
                enrichment[fighter_key] = cached_fighter

    if enrichment:
        print(f"Loaded Tapology DB cache for {len(enrichment)} fighter(s).")

    return enrichment


def merge_tapology_enrichment(
    base: Dict[str, Dict[str, str]],
    incoming: Dict[str, Dict[str, str]],
) -> Dict[str, Dict[str, str]]:
    merged = {key: dict(value) for key, value in base.items()}

    for fighter_key, incoming_fighter in incoming.items():
        target = merged.setdefault(fighter_key, {})
        for field in TAPOLOGY_ENRICHMENT_FIELDS:
            incoming_value = cache_value_to_csv(incoming_fighter.get(field))
            if not incoming_value:
                continue
            if not cache_value_to_csv(target.get(field)):
                target[field] = incoming_value

    return merged


def build_tapology_event_cache_payload(
    event: Dict,
    tapology_event: Dict[str, str],
    event_details: Optional[Dict[str, object]] = None,
    source: str = "scraper",
) -> Dict[str, object]:
    event_details = event_details or {}
    event_date = str(event.get("StartTime", "")).split("T")[0]
    return {
        "event_id": parse_optional_int(event.get("EventId")),
        "event_name": cache_value_to_csv(event.get("Name")) or None,
        "event_date": event_date or None,
        "tapology_event_url": cache_value_to_csv(tapology_event.get("TapologyEventURL")) or None,
        "event_image_url": cache_value_to_csv(
            event_details.get("event_image_url")
            or tapology_event.get("TapologyEventImageURL")
        ) or None,
        "match_confidence": cache_value_to_csv(
            tapology_event.get("TapologyMatchConfidence")
        ) or None,
        "source": source,
        "last_success_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "last_failure_at": None,
        "last_error": None,
    }


def build_tapology_fighter_cache_payload(
    fighter: Dict,
    fighter_data: Dict[str, str],
    source: str = "scraper",
) -> Dict[str, object]:
    name_info = fighter.get("Name", {}) or {}
    first_name = cache_value_to_csv(name_info.get("FirstName")) or None
    last_name = cache_value_to_csv(name_info.get("LastName")) or None
    return {
        "fighter_id": parse_optional_int(fighter.get("FighterId")),
        "mma_id": parse_optional_int(fighter.get("MMAId")),
        "first_name": first_name,
        "last_name": last_name,
        "normalized_name": normalize_name(" ".join(part for part in [first_name, last_name] if part)) or None,
        "tapology_fighter_url": cache_value_to_csv(fighter_data.get("TapologyFighterURL")) or None,
        "rank": parse_optional_int(fighter_data.get("Rank")),
        "streak": parse_optional_int(fighter_data.get("Streak")),
        "style": normalize_style(fighter_data.get("style")) or None,
        "ko_tko_wins": parse_optional_int(fighter_data.get("KO_TKO_Wins")),
        "ko_tko_losses": parse_optional_int(fighter_data.get("KO_TKO_Losses")),
        "submission_wins": parse_optional_int(fighter_data.get("Submission_Wins")),
        "submission_losses": parse_optional_int(fighter_data.get("Submission_Losses")),
        "decision_wins": parse_optional_int(fighter_data.get("Decision_Wins")),
        "decision_losses": parse_optional_int(fighter_data.get("Decision_Losses")),
        "sig_str_landed_per_min": parse_optional_float(fighter_data.get("SigStrLandedPerMin")),
        "sig_str_absorbed_per_min": parse_optional_float(fighter_data.get("SigStrAbsorbedPerMin")),
        "sig_strike_accuracy_pct": parse_optional_float(fighter_data.get("SigStrikeAccuracyPct")),
        "sig_strike_defense_pct": parse_optional_float(fighter_data.get("SigStrikeDefensePct")),
        "takedown_avg_per_15": parse_optional_float(fighter_data.get("TakedownAvgPer15")),
        "takedown_accuracy_pct": parse_optional_float(fighter_data.get("TakedownAccuracyPct")),
        "takedown_defense_pct": parse_optional_float(fighter_data.get("TakedownDefensePct")),
        "submission_avg_per_15": parse_optional_float(fighter_data.get("SubmissionAvgPer15")),
        "knockdown_avg_per_15": parse_optional_float(fighter_data.get("KnockdownAvgPer15")),
        "average_fight_time_seconds": parse_optional_int(fighter_data.get("AverageFightTimeSeconds")),
        "recent_form": cache_value_to_csv(fighter_data.get("RecentForm")) or None,
        "last_fight_date": cache_value_to_csv(fighter_data.get("LastFightDate")) or None,
        "match_confidence": cache_value_to_csv(fighter_data.get("TapologyMatchConfidence")) or None,
        "source": source,
        "last_success_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "last_failure_at": None,
        "last_error": None,
    }


def upsert_tapology_event_cache(
    event: Dict,
    tapology_event: Dict[str, str],
    event_details: Optional[Dict[str, object]],
    timeout: float,
    source: str = "scraper",
) -> None:
    payload = build_tapology_event_cache_payload(
        event=event,
        tapology_event=tapology_event,
        event_details=event_details,
        source=source,
    )
    if not payload.get("event_id") or not payload.get("tapology_event_url"):
        return

    try:
        upserted_count = upsert_supabase_rows("tapology_event_cache", [payload], "event_id", timeout)
        if upserted_count:
            print("Upserted Tapology event cache row.")
    except (requests.RequestException, ValueError) as err:
        print(f"Tapology event cache upsert skipped: {err}")


def upsert_tapology_fighter_cache(
    event: Dict,
    enrichment: Dict[str, Dict[str, str]],
    timeout: float,
    source: str = "scraper",
    write_tapology_cache: bool = True,
) -> None:
    payloads = []
    for fight in event.get("FightCard", []):
        for fighter in fight.get("Fighters", []):
            fighter_key = normalize_name(fighter_full_name(fighter))
            fighter_data = enrichment.get(fighter_key, {})
            payload = build_tapology_fighter_cache_payload(
                fighter=fighter,
                fighter_data=fighter_data,
                source=source,
            )
            if payload.get("fighter_id") and (
                payload.get("tapology_fighter_url")
                or payload.get("style")
                or payload.get("streak") is not None
                or payload.get("ko_tko_wins") is not None
                or payload.get("submission_wins") is not None
                or payload.get("decision_wins") is not None
                or payload.get("sig_str_landed_per_min") is not None
                or payload.get("recent_form")
            ):
                payloads.append(payload)

    if not payloads:
        return

    tapology_cache_payloads = []
    for payload in payloads:
        cache_payload = dict(payload)
        if cache_payload.get("streak") is None:
            cache_payload["source"] = None
            cache_payload["last_success_at"] = None
        tapology_cache_payloads.append(cache_payload)

    if write_tapology_cache:
        try:
            upserted_count = upsert_supabase_rows(
                "tapology_fighter_cache",
                tapology_cache_payloads,
                "fighter_id",
                timeout,
            )
            if upserted_count:
                print(f"Upserted Tapology fighter cache for {upserted_count} fighter(s).")
        except (requests.RequestException, ValueError) as err:
            print(f"Tapology fighter cache upsert skipped: {err}")

    event_date = str(event.get("StartTime", "")).split("T")[0] or None
    event_start = parse_start_time(event.get("StartTime"))
    if event_start and event_start.tzinfo is None:
        event_start = event_start.replace(tzinfo=datetime.timezone.utc)
    event_is_upcoming = bool(
        event_start
        and event_start > datetime.datetime.now(datetime.timezone.utc)
    )
    anchor_through_date = None
    if event_date and event_is_upcoming:
        anchor_through_date = (
            datetime.date.fromisoformat(event_date) - datetime.timedelta(days=1)
        ).isoformat()
    fighter_profile_payloads = []
    fighters_by_id = {
        parse_optional_int(fighter.get("FighterId")): fighter
        for fight in event.get("FightCard", [])
        for fighter in fight.get("Fighters", [])
    }
    for payload in payloads:
        fighter = fighters_by_id.get(payload.get("fighter_id"), {})
        record = fighter.get("Record", {}) or {}
        record_wins = parse_optional_int(record.get("Wins"))
        record_losses = parse_optional_int(record.get("Losses"))
        has_current_streak = (
            payload.get("streak") is not None
            and event_is_upcoming
            and source in {"cached_profile_url", "live_profile", "validated_fighter_sources"}
        )
        fighter_profile_payload = {
            "fighter_id": payload.get("fighter_id"),
            "mma_id": payload.get("mma_id"),
            "first_name": payload.get("first_name"),
            "last_name": payload.get("last_name"),
            "normalized_name": payload.get("normalized_name"),
            "tapology_fighter_url": payload.get("tapology_fighter_url"),
            "rank": payload.get("rank"),
            "style": payload.get("style"),
            "ko_tko_wins": payload.get("ko_tko_wins"),
            "ko_tko_losses": payload.get("ko_tko_losses"),
            "submission_wins": payload.get("submission_wins"),
            "submission_losses": payload.get("submission_losses"),
            "decision_wins": payload.get("decision_wins"),
            "decision_losses": payload.get("decision_losses"),
            "sig_str_landed_per_min": payload.get("sig_str_landed_per_min"),
            "sig_str_absorbed_per_min": payload.get("sig_str_absorbed_per_min"),
            "sig_strike_accuracy_pct": payload.get("sig_strike_accuracy_pct"),
            "sig_strike_defense_pct": payload.get("sig_strike_defense_pct"),
            "takedown_avg_per_15": payload.get("takedown_avg_per_15"),
            "takedown_accuracy_pct": payload.get("takedown_accuracy_pct"),
            "takedown_defense_pct": payload.get("takedown_defense_pct"),
            "submission_avg_per_15": payload.get("submission_avg_per_15"),
            "knockdown_avg_per_15": payload.get("knockdown_avg_per_15"),
            "average_fight_time_seconds": payload.get("average_fight_time_seconds"),
            "recent_form": payload.get("recent_form"),
            "last_fight_date": payload.get("last_fight_date"),
            "last_failure_at": payload.get("last_failure_at"),
            "last_error": payload.get("last_error"),
        }
        if has_current_streak:
            fighter_profile_payload.update({
                "streak": payload.get("streak"),
                "streak_source": "sherdog_live" if source == "validated_fighter_sources" else "tapology_live",
                "streak_anchor_source": "sherdog_live" if source == "validated_fighter_sources" else "tapology_live",
                "streak_verified_at": payload.get("last_success_at"),
                "streak_anchor_value": payload.get("streak"),
                "streak_anchor_record_wins": record_wins,
                "streak_anchor_record_losses": record_losses,
                "streak_anchor_event_id": parse_optional_int(event.get("EventId")),
                "streak_anchor_through_date": anchor_through_date,
                "streak_record_wins": record_wins,
                "streak_record_losses": record_losses,
                "streak_verified_through_date": anchor_through_date,
                "streak_needs_review": False,
                "stats_source": source,
                "stats_confidence": payload.get("match_confidence"),
                "stats_as_of_event_id": parse_optional_int(event.get("EventId")),
                "stats_as_of_event_date": event_date,
                "last_success_at": payload.get("last_success_at"),
            })
        fighter_profile_payloads.append(fighter_profile_payload)

    try:
        upserted_count = upsert_supabase_rows(
            "fighters",
            fighter_profile_payloads,
            "fighter_id",
            timeout,
        )
        if upserted_count:
            print(f"Upserted fighter profile rows for {upserted_count} fighter(s).")
    except (requests.RequestException, ValueError) as err:
        print(f"fighters profile upsert skipped: {err}")


def fetch_fighter_style_lookup(timeout: float) -> Dict[str, Dict[str, str]]:
    empty_lookup = {
        "by_fighter_id": {},
        "by_mma_id": {},
        "by_name": {},
    }
    credentials = load_supabase_credentials()
    supabase_url = credentials.get("url", "")
    service_role_key = credentials.get("service_role_key", "")
    if not supabase_url or not service_role_key:
        print("fighter_style lookup skipped: Supabase credentials were not found.")
        return empty_lookup

    headers = {
        "apikey": service_role_key,
        "Authorization": f"Bearer {service_role_key}",
        "Accept": "application/json",
    }
    rows: List[Dict[str, object]] = []
    page_size = 1000
    selected_table = ""

    for table_name in ("fighters", "fighter_style"):
        table_rows: List[Dict[str, object]] = []
        endpoint = f"{supabase_url.rstrip('/')}/rest/v1/{table_name}"
        offset = 0

        while True:
            try:
                response = requests.get(
                    endpoint,
                    params={
                        "select": SUPABASE_STYLE_SELECT,
                        "order": "fighter_id.asc",
                    },
                    headers={
                        **headers,
                        "Range": f"{offset}-{offset + page_size - 1}",
                    },
                    timeout=timeout,
                )
                response.raise_for_status()
                payload = response.json()
            except (requests.RequestException, ValueError) as err:
                if table_rows:
                    print(
                        f"{table_name} style lookup stopped early after "
                        f"{len(table_rows)} row(s): {err}"
                    )
                    break

                print(f"{table_name} style lookup skipped: {err}")
                table_rows = []
                break

            if not isinstance(payload, list) or not payload:
                break

            table_rows.extend(payload)
            if len(payload) < page_size:
                break

            offset += page_size

        if table_rows:
            rows = table_rows
            selected_table = table_name
            break

    if not rows:
        return empty_lookup

    by_fighter_id: Dict[str, str] = {}
    by_mma_id: Dict[str, str] = {}
    by_name: Dict[str, str] = {}

    for row in rows:
        style = normalize_style(row.get("style"))
        if not style:
            continue

        fighter_id = str(row.get("fighter_id", "")).strip()
        mma_id = str(row.get("mma_id", "")).strip()
        full_name = " ".join(
            part
            for part in [
                str(row.get("first_name", "")).strip(),
                str(row.get("last_name", "")).strip(),
            ]
            if part
        ).strip()
        normalized_full_name = normalize_name(full_name)

        if fighter_id and fighter_id not in by_fighter_id:
            by_fighter_id[fighter_id] = style
        if mma_id and mma_id not in by_mma_id:
            by_mma_id[mma_id] = style
        if normalized_full_name and normalized_full_name not in by_name:
            by_name[normalized_full_name] = style

    print(
        f"Loaded {selected_table} style lookup from Supabase: "
        f"{len(by_fighter_id)} fighter ids, {len(by_mma_id)} MMA ids, {len(by_name)} names."
    )
    return {
        "by_fighter_id": by_fighter_id,
        "by_mma_id": by_mma_id,
        "by_name": by_name,
    }


def resolve_style_from_sources(
    fighter: Dict,
    fighter_style_lookup: Dict[str, Dict[str, str]],
    tapology_fighter: Dict[str, str],
) -> str:
    fighter_id = str(fighter.get("FighterId", "")).strip()
    mma_id = str(fighter.get("MMAId", "")).strip()
    full_name = normalize_name(fighter_full_name(fighter))

    by_fighter_id = fighter_style_lookup.get("by_fighter_id", {})
    by_mma_id = fighter_style_lookup.get("by_mma_id", {})
    by_name = fighter_style_lookup.get("by_name", {})

    return (
        normalize_style(by_fighter_id.get(fighter_id))
        or normalize_style(by_mma_id.get(mma_id))
        or normalize_style(by_name.get(full_name))
        or normalize_style(tapology_fighter.get("style", ""))
    )


def parse_start_time(value: Optional[str]) -> Optional[datetime.datetime]:
    if not value:
        return None

    try:
        return datetime.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def fetch_ufc_event(event_id: int, session: requests.Session, timeout: float) -> Dict:
    last_error: Optional[Exception] = None
    for domain in UFC_DOMAINS:
        url = f"https://{domain}/api/v3/event/live/{event_id}.json"
        try:
            response = session.get(url, timeout=timeout)
            if response.status_code == 404:
                continue
            raise_for_status_with_context(response, url)
            payload = response.json()
        except (requests.RequestException, ValueError) as err:
            last_error = err
            continue

        event = payload.get("LiveEventDetail")
        if isinstance(event, dict) and event:
            return event

    if last_error:
        raise RuntimeError(f"Unable to fetch UFC event {event_id}: {last_error}") from last_error
    raise RuntimeError(f"UFC event {event_id} was not found on either API domain.")


def strip_name_suffix(value: str) -> str:
    tokens = normalize_name(value).split()
    if tokens and tokens[-1] in {"jr", "sr", "ii", "iii", "iv", "v"}:
        tokens = tokens[:-1]
    return " ".join(tokens)


def build_ufc_profile_candidates(profile_url: Optional[str], fighter: Dict) -> List[str]:
    candidates: List[str] = []
    seen = set()

    def add(url: Optional[str]) -> None:
        if not url:
            return
        cleaned = (
            url.replace("http://", "https://")
            .replace("www.ufcespanol.com", "www.ufc.com")
            .strip()
        )
        if cleaned and cleaned not in seen:
            candidates.append(cleaned)
            seen.add(cleaned)

    add(profile_url)

    if profile_url:
        slug = profile_url.rstrip("/").split("/")[-1].replace(".", "")
        add(f"https://www.ufc.com/athlete/{slug.lower()}")

    name_info = fighter.get("Name", {})
    first_name = str(name_info.get("FirstName", "")).strip()
    last_name = str(name_info.get("LastName", "")).strip()
    if first_name or last_name:
        add(f"https://www.ufc.com/athlete/{slugify(f'{first_name} {last_name}')}")

        stripped_last_name = strip_name_suffix(last_name)
        if stripped_last_name and stripped_last_name != normalize_name(last_name):
            add(f"https://www.ufc.com/athlete/{slugify(f'{first_name} {stripped_last_name}')}")

    return candidates


def extract_ufc_profile_image(html: str) -> Optional[str]:
    soup = BeautifulSoup(html, "html.parser")
    for attrs in (
        {"property": "og:image"},
        {"name": "twitter:image"},
    ):
        tag = soup.find("meta", attrs=attrs)
        content = tag.get("content") if tag else None
        if content:
            return content
    return None


def extract_ufc_official_rank(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    tags = [tag.get_text(" ", strip=True) for tag in soup.select(".hero-profile__tag")]
    normalized_tags = [re.sub(r"\s+", " ", tag).strip() for tag in tags if tag]

    if any(tag.lower() == "title holder" for tag in normalized_tags):
        return "0"

    for tag in normalized_tags:
        match = re.match(r"#\s*(\d+)\b", tag)
        if match:
            return match.group(1)

    return ""


def fetch_ufc_profile_details(
    session: requests.Session,
    fighter: Dict,
    timeout: float,
) -> Dict[str, str]:
    profile_url = fighter.get("UFCLink")

    for candidate_url in build_ufc_profile_candidates(profile_url, fighter):
        try:
            response = session.get(candidate_url, timeout=timeout)
            raise_for_status_with_context(response, candidate_url)
        except requests.RequestException:
            continue

        if "/search?" in response.url:
            continue

        image_url = extract_ufc_profile_image(response.text) or ""
        rank = extract_ufc_official_rank(response.text)
        return {
            "ImageURL": image_url,
            "UFCRank": rank,
        }

    return {
        "ImageURL": "",
        "UFCRank": "",
    }


def build_ufc_event_page_candidates(event: Dict) -> List[str]:
    event_name = event.get("Name", "")
    start_dt = parse_start_time(event.get("StartTime"))
    candidates = []

    numbered_match = re.match(r"UFC\s+(\d+)\b", event_name or "")
    if numbered_match:
        candidates.append(f"https://www.ufc.com/event/ufc-{numbered_match.group(1)}")

    if start_dt:
        month = start_dt.strftime("%B").lower()
        day = str(start_dt.day)
        year = str(start_dt.year)
        candidates.append(f"https://www.ufc.com/event/ufc-fight-night-{month}-{day}-{year}")
        candidates.append(f"https://www.ufc.com/event/{month}-{day}-{year}")

    if event_name:
        candidates.append(f"https://www.ufc.com/event/{slugify(event_name)}")

    deduped = []
    seen = set()
    for candidate in candidates:
        if candidate not in seen:
            deduped.append(candidate)
            seen.add(candidate)
    return deduped


def fightodds_query(
    session: requests.Session,
    query: str,
    variables: Dict[str, object],
    timeout: float,
) -> Dict:
    operation_match = re.search(r"\b(?:query|mutation)\s+([A-Za-z_][A-Za-z0-9_]*)", query)
    operation_name = operation_match.group(1) if operation_match else None
    response = session.post(
        FIGHTODDS_GQL_URL,
        json={
            "operationName": operation_name,
            "query": query,
            "variables": variables,
        },
        timeout=timeout,
        headers={
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Origin": "https://fightodds.io",
            "Referer": "https://fightodds.io/",
        },
    )
    raise_for_status_with_context(response, FIGHTODDS_GQL_URL)
    payload = response.json()
    if payload.get("errors"):
        raise RuntimeError(f"fightodds.io GraphQL errors: {payload['errors']}")
    return payload.get("data", {})


def fetch_fightodds_event_candidates(
    session: requests.Session,
    event_date: str,
    timeout: float,
) -> List[Dict[str, object]]:
    query = """
    query Events($date: Date!) {
      allEvents(
        first: 10,
        promotion_ShortName: "UFC",
        date_Gte: $date,
        date_Lte: $date,
        orderBy: "date"
      ) {
        edges {
          node {
            pk
            name
            slug
            date
            startTime
            isCancelled
          }
        }
      }
    }
    """
    data = fightodds_query(session, query, {"date": event_date}, timeout)
    edges = data.get("allEvents", {}).get("edges", [])
    return [edge.get("node", {}) for edge in edges if edge.get("node")]


def score_fightodds_event_candidate(event: Dict, candidate: Dict[str, object]) -> int:
    score = 0
    event_name = normalize_name(event.get("Name", ""))
    candidate_name = normalize_name(candidate.get("name", ""))
    event_date = str(event.get("StartTime", "")).split("T")[0]
    candidate_date = str(candidate.get("date", ""))
    event_number = extract_ufc_event_number(event.get("Name", ""))
    fighter_names = build_ufc_fighter_name_list(event)[:4]

    if candidate_date == event_date:
        score += 10
    if event_number and re.search(rf"\bufc\s+{re.escape(event_number)}\b", candidate_name):
        score += 8
    if event_name and (event_name in candidate_name or candidate_name in event_name):
        score += 5

    for fighter_name in fighter_names:
        tokens = tokenized_name(fighter_name)
        if not tokens:
            continue
        last_name = tokens[-1]
        if last_name and last_name in candidate_name:
            score += 2

    return score


def resolve_fightodds_event(
    event: Dict,
    session: requests.Session,
    timeout: float,
) -> Dict[str, object]:
    event_date = str(event.get("StartTime", "")).split("T")[0]
    if not event_date:
        return {}

    candidates = fetch_fightodds_event_candidates(session, event_date, timeout)
    if not candidates:
        return {}

    ranked = sorted(
        (
            (score_fightodds_event_candidate(event, candidate), candidate)
            for candidate in candidates
            if not candidate.get("isCancelled")
        ),
        key=lambda item: item[0],
        reverse=True,
    )
    if not ranked or ranked[0][0] <= 0:
        return {}
    return ranked[0][1]


def fetch_fightodds_event_offer_table(
    session: requests.Session,
    event_pk: int,
    timeout: float,
) -> List[Dict[str, object]]:
    query = """
    query EventOffer($pk: Int!) {
      eventOfferTable(pk: $pk) {
        pk
        name
        slug
        date
        fightOffers {
          edges {
            node {
              fighter1 { firstName lastName slug }
              fighter2 { firstName lastName slug }
              bestOdds1
              bestOdds2
            }
          }
        }
      }
    }
    """
    data = fightodds_query(session, query, {"pk": event_pk}, timeout)
    edges = data.get("eventOfferTable", {}).get("fightOffers", {}).get("edges", [])
    return [edge.get("node", {}) for edge in edges if edge.get("node")]


def fighter_names_match(expected_name: str, candidate_name: str) -> bool:
    normalized_expected = normalize_name(expected_name)
    normalized_candidate = normalize_name(candidate_name)
    if not normalized_expected or not normalized_candidate:
        return False
    if normalized_expected == normalized_candidate:
        return True

    expected_tokens = normalized_expected.split()
    candidate_tokens = normalized_candidate.split()
    if len(expected_tokens) == 2 and expected_tokens == list(reversed(candidate_tokens)):
        return True

    expected_variants = fighter_name_variants(normalized_expected)
    candidate_variants = fighter_name_variants(normalized_candidate)
    if set(expected_variants) & set(candidate_variants):
        return True

    for expected_variant in expected_variants:
        for candidate_variant in candidate_variants:
            if names_have_alias_match(expected_variant, candidate_variant):
                return True

    return False


def build_fightodds_fighter_name(fighter_node: Dict[str, object]) -> str:
    return " ".join(
        part
        for part in [
            str(fighter_node.get("firstName", "")).strip(),
            str(fighter_node.get("lastName", "")).strip(),
        ]
        if part
    ).strip()


def extract_fightodds_map(
    event: Dict,
    offer_nodes: Iterable[Dict[str, object]],
) -> Dict[str, str]:
    odds_by_name: Dict[str, str] = {}
    remaining_offers = list(offer_nodes)

    for fight in event.get("FightCard", []):
        fighters = fight.get("Fighters", [])
        if len(fighters) != 2:
            continue

        fighter_a_name = fighter_full_name(fighters[0])
        fighter_b_name = fighter_full_name(fighters[1])
        if not fighter_a_name or not fighter_b_name:
            continue

        matched_index = None
        matched_offer = None
        swapped = False
        for index, offer in enumerate(remaining_offers):
            offer_a_name = build_fightodds_fighter_name(offer.get("fighter1", {}))
            offer_b_name = build_fightodds_fighter_name(offer.get("fighter2", {}))

            if fighter_names_match(fighter_a_name, offer_a_name) and fighter_names_match(
                fighter_b_name, offer_b_name
            ):
                matched_index = index
                matched_offer = offer
                swapped = False
                break

            if fighter_names_match(fighter_a_name, offer_b_name) and fighter_names_match(
                fighter_b_name, offer_a_name
            ):
                matched_index = index
                matched_offer = offer
                swapped = True
                break

        if matched_offer is None or matched_index is None:
            continue

        best_odds_1 = matched_offer.get("bestOdds1")
        best_odds_2 = matched_offer.get("bestOdds2")
        if swapped:
            best_odds_1, best_odds_2 = best_odds_2, best_odds_1

        if best_odds_1 is not None:
            odds_by_name[normalize_name(fighter_a_name)] = str(int(best_odds_1))
        if best_odds_2 is not None:
            odds_by_name[normalize_name(fighter_b_name)] = str(int(best_odds_2))

        remaining_offers.pop(matched_index)

    return odds_by_name


def fetch_fightodds_odds_map(
    event: Dict,
    session: requests.Session,
    timeout: float,
) -> Dict[str, str]:
    try:
        fightodds_event = resolve_fightodds_event(event, session, timeout)
    except (requests.RequestException, RuntimeError, ValueError) as err:
        print(f"Unable to resolve fightodds.io event: {err}")
        return {}

    if not fightodds_event:
        print("No fightodds.io event match found.")
        return {}

    try:
        offer_nodes = fetch_fightodds_event_offer_table(
            session=session,
            event_pk=int(fightodds_event["pk"]),
            timeout=timeout,
        )
    except (requests.RequestException, RuntimeError, ValueError) as err:
        print(f"Unable to fetch fightodds.io event odds: {err}")
        return {}

    odds_map = extract_fightodds_map(event, offer_nodes)
    if odds_map:
        print(
            "Pulled odds from fightodds.io: "
            f"{fightodds_event.get('name', '')} ({fightodds_event.get('pk', '')})"
        )
        return odds_map

    print("fightodds.io returned an event, but no fight odds matched the UFC card.")
    return odds_map


def select_consensus_american_odds(values: Iterable[str]) -> str:
    parsed_values = []
    for value in values:
        match = re.fullmatch(r"([+-])(\d{3,4})", str(value).strip())
        if not match:
            continue
        parsed_values.append(int(match.group(0)))

    if not parsed_values:
        return ""

    positive_values = [value for value in parsed_values if value > 0]
    negative_values = [value for value in parsed_values if value < 0]
    if len(positive_values) == len(negative_values):
        return ""

    consensus_values = (
        positive_values if len(positive_values) > len(negative_values) else negative_values
    )
    ordered_magnitudes = sorted(abs(value) for value in consensus_values)
    median_magnitude = ordered_magnitudes[len(ordered_magnitudes) // 2]
    reasonable_values = [
        value
        for value in consensus_values
        if abs(value) <= max(median_magnitude * 2, median_magnitude + 100)
    ]
    if not reasonable_values:
        reasonable_values = consensus_values

    best_value = max(reasonable_values)
    return f"{best_value:+d}"


def extract_covers_odds_map(html: str, fights: Iterable[Dict]) -> Dict[str, str]:
    soup = BeautifulSoup(html, "html.parser")
    expected_names = sorted({
        normalize_name(fighter_full_name(fighter))
        for fight in fights
        for fighter in fight.get("Fighters", [])
        if fighter_full_name(fighter)
    })
    best_table = None
    best_match_count = 0

    for table in soup.select("table.covers-mma-table"):
        table_names = {
            normalize_name(image.get("alt", ""))
            for image in table.select("tr th img[alt]")
            if normalize_name(image.get("alt", ""))
        }
        match_count = sum(
            1
            for expected_name in expected_names
            if any(fighter_names_match(expected_name, table_name) for table_name in table_names)
        )
        if match_count > best_match_count:
            best_table = table
            best_match_count = match_count

    if best_table is None or best_match_count < 2:
        return {}

    odds_by_name: Dict[str, str] = {}
    for row in best_table.select("tr"):
        fighter_image = row.select_one("th img[alt]")
        if fighter_image is None:
            continue

        provider_name = normalize_name(fighter_image.get("alt", ""))
        matched_names = [
            expected_name
            for expected_name in expected_names
            if fighter_names_match(expected_name, provider_name)
        ]
        if len(matched_names) != 1:
            continue

        cell_values = [cell.get_text(" ", strip=True) for cell in row.select("td")]
        selected_odds = select_consensus_american_odds(cell_values)
        if selected_odds:
            odds_by_name[matched_names[0]] = selected_odds

    return odds_by_name


def fetch_covers_odds_map(
    event: Dict,
    session: requests.Session,
    timeout: float,
) -> Dict[str, str]:
    try:
        response = session.get(
            COVERS_UFC_ODDS_URL,
            timeout=timeout,
            headers={
                "Accept": "text/html,application/xhtml+xml",
                "Referer": "https://www.covers.com/sport/mma/ufc",
            },
        )
        raise_for_status_with_context(response, COVERS_UFC_ODDS_URL)
    except (requests.RequestException, RuntimeError) as err:
        print(f"Unable to fetch Covers UFC odds: {err}")
        return {}

    odds_map = extract_covers_odds_map(response.text, event.get("FightCard", []))
    if odds_map:
        print(f"Pulled fallback odds from Covers for {len(odds_map)} fighter(s).")
    else:
        print("Covers returned an odds page, but no event odds matched the UFC card.")
    return odds_map


def extract_american_odds(text: str) -> List[str]:
    cleaned = text.replace("−", "-")
    matches = re.findall(r"(?<!\d)[+-]\d{3,4}(?!\d)", cleaned)
    return [str(int(match)) for match in matches]


def best_fight_block(soup: BeautifulSoup, fighter_a: str, fighter_b: str) -> Optional[str]:
    name_a = normalize_name(fighter_a)
    name_b = normalize_name(fighter_b)
    best_text = None
    best_score = None

    for element in soup.find_all(["article", "section", "li", "div"]):
        text = element.get_text(" ", strip=True)
        if not text:
            continue

        normalized_text = normalize_name(text)
        if name_a not in normalized_text or name_b not in normalized_text:
            continue

        odds = extract_american_odds(text)
        if len(odds) < 2:
            continue

        score = (len(text), len(list(element.descendants)))
        if best_score is None or score < best_score:
            best_text = text
            best_score = score

    return best_text


def extract_event_page_odds(html: str, fights: Iterable[Dict]) -> Dict[str, str]:
    soup = BeautifulSoup(html, "html.parser")
    odds_by_name: Dict[str, str] = {}

    for fight in fights:
        fighters = fight.get("Fighters", [])
        if len(fighters) != 2:
            continue

        fighter_a = fighters[0]
        fighter_b = fighters[1]
        name_a = fighter_full_name(fighter_a)
        name_b = fighter_full_name(fighter_b)
        if not name_a or not name_b:
            continue

        block_text = best_fight_block(soup, name_a, name_b)
        if not block_text:
            continue

        odds = extract_american_odds(block_text)
        if len(odds) < 2:
            continue

        normalized_block = normalize_name(block_text)
        ordered_names = sorted(
            [
                (normalized_block.find(normalize_name(name_a)), normalize_name(name_a)),
                (normalized_block.find(normalize_name(name_b)), normalize_name(name_b)),
            ],
            key=lambda entry: entry[0],
        )
        if ordered_names[0][0] < 0 or ordered_names[1][0] < 0:
            continue

        odds_by_name[ordered_names[0][1]] = odds[0]
        odds_by_name[ordered_names[1][1]] = odds[1]

    return odds_by_name


def fetch_ufc_odds_map(event: Dict, session: requests.Session, timeout: float) -> Dict[str, str]:
    for candidate_url in build_ufc_event_page_candidates(event):
        try:
            response = session.get(candidate_url, timeout=timeout)
            raise_for_status_with_context(response, candidate_url)
        except requests.RequestException:
            continue

        odds_map = extract_event_page_odds(response.text, event.get("FightCard", []))
        if odds_map:
            print(f"Pulled UFC odds from event page: {candidate_url}")
            return odds_map

    print("No UFC odds found on event page candidates.")
    return {}


def expected_odds_entry_count(event: Dict) -> int:
    return sum(
        len(fight.get("Fighters", []))
        for fight in event.get("FightCard", [])
        if isinstance(fight, dict)
    )


def build_event_odds_map(
    event: Dict,
    session: requests.Session,
    timeout: float,
) -> Dict[str, str]:
    fightodds_map = fetch_fightodds_odds_map(event, session=session, timeout=timeout)
    expected_count = expected_odds_entry_count(event)

    if expected_count > 0 and len(fightodds_map) >= expected_count:
        return fightodds_map

    covers_odds_map = fetch_covers_odds_map(event, session=session, timeout=timeout)
    if expected_count > 0 and len({**covers_odds_map, **fightodds_map}) >= expected_count:
        return {
            **covers_odds_map,
            **fightodds_map,
        }

    ufc_odds_map = fetch_ufc_odds_map(event, session=session, timeout=timeout)
    merged_map = {
        **ufc_odds_map,
        **covers_odds_map,
        **fightodds_map,
    }

    if merged_map:
        print(
            "Using merged odds map: "
            f"fightodds.io={len(fightodds_map)} Covers={len(covers_odds_map)} "
            f"UFC={len(ufc_odds_map)} merged={len(merged_map)}"
        )

    return merged_map


def load_tapology_event_map(path: str) -> List[Dict[str, str]]:
    if not os.path.exists(path):
        return []

    with open(path, newline="", encoding="utf-8") as csv_file:
        reader = csv.DictReader(csv_file)
        return [dict(row) for row in reader]


def fetch_tapology_url(
    tapology_session: requests.Session,
    url: str,
    timeout: float,
    attempts: int = 3,
) -> str:
    last_error: Optional[Exception] = None

    for attempt in range(1, attempts + 1):
        try:
            response = tapology_session.get(url, timeout=timeout)
            raise_for_status_with_context(response, url)
            return response.text
        except RuntimeError as err:
            if "Cloudflare challenge" in str(err):
                last_error = err
                break
            last_error = err
        except requests.RequestException as err:
            last_error = err

        if attempt < attempts:
            delay_seconds = min(2 ** (attempt - 1), 4)
            print(
                f"Tapology request failed for {url}; retrying in {delay_seconds}s: "
                f"{last_error}"
            )
            time.sleep(delay_seconds)

    if last_error:
        proxy_url = tapology_proxy_url(url)
        if proxy_url:
            try:
                print(f"Retrying Tapology through proxy for {url}")
                response = requests.get(
                    proxy_url,
                    headers=DEFAULT_HEADERS,
                    timeout=max(timeout, 30.0),
                )
                raise_for_status_with_context(response, proxy_url)
                return response.text
            except (requests.RequestException, RuntimeError) as proxy_error:
                if should_use_curl_proxy_fallback():
                    try:
                        print(f"Retrying Tapology proxy through curl for {url}")
                        return fetch_url_with_curl(proxy_url, timeout)
                    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as curl_error:
                        raise RuntimeError(
                            f"{last_error}; proxy fallback failed for {url}: "
                            f"{proxy_error}; curl proxy fallback failed: {curl_error}"
                        ) from curl_error

                raise RuntimeError(
                    f"{last_error}; proxy fallback failed for {url}: {proxy_error}"
                ) from proxy_error

        raise last_error

    raise RuntimeError(f"Tapology request failed for {url}")


def fetch_tapology_event_html(
    tapology_session: requests.Session,
    tapology_event_url: str,
    timeout: float,
) -> str:
    return fetch_tapology_url(tapology_session, tapology_event_url, timeout)


def fetch_tapology_fighter_html(
    tapology_session: requests.Session,
    tapology_fighter_url: str,
    timeout: float,
) -> str:
    return fetch_tapology_url(tapology_session, tapology_fighter_url, timeout)


def resolve_tapology_event_from_map(event: Dict, map_path: str) -> Dict[str, str]:
    event_id = str(event.get("EventId", "")).strip()
    event_name = str(event.get("Name", "")).strip()
    event_date = str(event.get("StartTime", "")).split("T")[0]
    normalized_event_name = normalize_name(event_name)

    for row in load_tapology_event_map(map_path):
        row_event_id = str(row.get("EventId", "")).strip()
        row_event_name = normalize_name(row.get("EventName", ""))
        row_event_date = str(row.get("EventDate", "")).strip()
        tapology_url = str(row.get("TapologyEventURL", "")).strip()
        confidence = str(row.get("MatchConfidence", "")).strip() or "manual"

        if not tapology_url:
            continue
        if row_event_id and row_event_id == event_id:
            return {
                "TapologyEventURL": tapology_url,
                "TapologyMatchConfidence": confidence,
            }
        if row_event_date == event_date and row_event_name == normalized_event_name:
            return {
                "TapologyEventURL": tapology_url,
                "TapologyMatchConfidence": confidence,
            }

    return {
        "TapologyEventURL": "",
        "TapologyMatchConfidence": "",
    }


def fetch_tapology_ufc_schedule_html(
    tapology_session: requests.Session,
    timeout: float,
) -> str:
    return fetch_tapology_url(tapology_session, TAPOLOGY_UFC_SCHEDULE_URL, timeout)


def parse_tapology_schedule_candidates(html: str) -> List[Dict[str, str]]:
    soup = BeautifulSoup(html, "html.parser")
    candidates_by_url: Dict[str, Dict[str, str]] = {}

    for link in soup.find_all("a", href=True):
        href = link["href"].strip()
        if "/fightcenter/events/" not in href:
            continue

        title = link.get_text(" ", strip=True)
        if not title:
            continue

        candidate_url = absolute_tapology_url(href)
        existing = candidates_by_url.get(candidate_url)
        if existing is None or len(title) > len(existing["title"]):
            candidates_by_url[candidate_url] = {
                "url": candidate_url,
                "title": title,
            }

    return list(candidates_by_url.values())


def extract_name_variants_from_tapology_link(raw_text: str, href: str) -> List[str]:
    variants = []
    normalized_text = normalize_name(raw_text)
    if normalized_text:
        variants.append(normalized_text)

    slug_segment = href.rstrip("/").split("/")[-1]
    slug_segment = re.sub(r"^\d+-", "", slug_segment)
    slug_variant = normalize_name(slug_segment.replace("-", " "))
    if slug_variant:
        variants.append(slug_variant)

    deduped = []
    seen = set()
    for variant in variants:
        if variant not in seen:
            deduped.append(variant)
            seen.add(variant)
    return deduped


def parse_tapology_fighter_directory(html: str) -> List[Dict[str, object]]:
    soup = BeautifulSoup(html, "html.parser")
    fighter_by_url: Dict[str, Dict[str, object]] = {}

    for link in soup.find_all("a", href=True):
        href = link["href"].strip()
        if "/fightcenter/fighters/" not in href:
            continue

        raw_text = link.get_text(" ", strip=True)
        variants = extract_name_variants_from_tapology_link(raw_text, href)
        if not variants:
            continue

        fighter_url = absolute_tapology_url(href)
        entry = fighter_by_url.setdefault(
            fighter_url,
            {
                "TapologyFighterURL": fighter_url,
                "variants": set(),
                "best_variant": "",
            },
        )

        for variant in variants:
            entry["variants"].add(variant)
            if len(variant) > len(entry["best_variant"]):
                entry["best_variant"] = variant

    fighters = []
    for entry in fighter_by_url.values():
        fighters.append(
            {
                "TapologyFighterURL": entry["TapologyFighterURL"],
                "variants": sorted(entry["variants"]),
                "best_variant": entry["best_variant"],
            }
        )
    return fighters


def tokenized_name(value: str) -> List[str]:
    return [token for token in normalize_name(value).split() if token]


def fighter_name_variants(value: str) -> List[str]:
    normalized = normalize_name(value)
    if not normalized:
        return []

    variants = {normalized}
    pending = [normalized]

    while pending:
        current = pending.pop()
        for alias in KNOWN_FIGHTER_NAME_VARIANTS.get(current, set()):
            if alias not in variants:
                variants.add(alias)
                pending.append(alias)

    return sorted(variants)


def variant_sets_match(expected_name: str, candidate_name: str) -> bool:
    expected_variants = fighter_name_variants(expected_name)
    candidate_variants = fighter_name_variants(candidate_name)
    if set(expected_variants) & set(candidate_variants):
        return True

    for expected_variant in expected_variants:
        for candidate_variant in candidate_variants:
            if names_have_alias_match(expected_variant, candidate_variant):
                return True

    return False


def names_have_alias_match(expected_name: str, candidate_variant: str) -> bool:
    expected_tokens = tokenized_name(expected_name)
    candidate_tokens = tokenized_name(candidate_variant)
    if len(expected_tokens) < 2 or len(candidate_tokens) < 2:
        return False

    expected_first = expected_tokens[0]
    expected_last = expected_tokens[-1]
    candidate_first = candidate_tokens[0]
    candidate_last = candidate_tokens[-1]

    if expected_last != candidate_last:
        return False

    if expected_first == candidate_first:
        return True

    if candidate_first == expected_first[:1]:
        return True

    if len(expected_first) >= 2 and len(candidate_first) >= 2:
        if expected_first[:2] == candidate_first[:2]:
            return True

    if expected_first == candidate_first[: len(expected_first)]:
        return True

    if candidate_first == expected_first[: len(candidate_first)]:
        return True

    return False


def has_name_match_in_variants(expected_name: str, variants: Iterable[str]) -> bool:
    for variant in variants:
        if variant_sets_match(expected_name, variant):
            return True
    return False


def parse_event_date_from_text(text: str) -> str:
    month_match = re.search(
        r"\b("
        r"Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|"
        r"Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|"
        r"Nov(?:ember)?|Dec(?:ember)?"
        r")\s+\d{1,2},\s+\d{4}\b",
        text,
    )
    if month_match:
        for fmt in ("%b %d, %Y", "%B %d, %Y"):
            try:
                return datetime.datetime.strptime(month_match.group(0), fmt).date().isoformat()
            except ValueError:
                continue

    numeric_match = re.search(r"\b(\d{2})\.(\d{2})\.(\d{4})\b", text)
    if numeric_match:
        month, day, year = numeric_match.groups()
        return f"{year}-{month}-{day}"

    return ""


def parse_tapology_event_details(html: str, url: str) -> Dict[str, object]:
    soup = BeautifulSoup(html, "html.parser")
    title = ""
    if soup.title and soup.title.string:
        title = soup.title.string.split("|")[0].strip()
    if not title:
        heading = soup.find(["h1", "h2"])
        if heading:
            title = heading.get_text(" ", strip=True)

    page_text = soup.get_text(" ", strip=True)
    parsed_fighters = parse_tapology_fighter_directory(html)
    event_image_url = ""

    for attrs in (
        {"property": "og:image"},
        {"name": "twitter:image"},
    ):
        meta_tag = soup.find("meta", attrs=attrs)
        if meta_tag and meta_tag.get("content"):
            event_image_url = meta_tag["content"].strip()
            break

    return {
        "url": url,
        "title": title,
        "normalized_title": normalize_name(title),
        "event_date": parse_event_date_from_text(page_text),
        "event_image_url": event_image_url,
        "fighters": parsed_fighters,
    }


def extract_current_weight_class(page_text: str) -> str:
    match = re.search(r"Weight Class:\s*([A-Za-z0-9' .-]+?)\s*(?:\||\n)", page_text)
    if not match:
        return ""
    return re.sub(r"\s+", " ", match.group(1)).strip().lower()


def is_current_ufc_champion(page_text: str) -> bool:
    current_weight_class = extract_current_weight_class(page_text)
    if not current_weight_class:
        return False

    lines = [line.strip() for line in page_text.splitlines() if line.strip()]
    try:
        start_index = lines.index("professional bouts")
    except ValueError:
        start_index = 0

    result_markers = {"W", "L", "D", "NC", "C", "Upcoming"}
    chunks: List[List[str]] = []
    current_chunk: List[str] = []

    for line in lines[start_index:]:
        if line in result_markers:
            if current_chunk:
                chunks.append(current_chunk)
            current_chunk = [line]
            continue

        if current_chunk:
            current_chunk.append(line)

    if current_chunk:
        chunks.append(current_chunk)

    for chunk in chunks:
        chunk_text = "\n".join(chunk)
        if "Event: UFC" not in chunk_text and "Image: UFC" not in chunk_text:
            continue

        if "Title Bout: UFC" not in chunk_text:
            continue

        title_bout_match = re.search(
            r"Title Bout:\s*UFC\s+([A-Za-z0-9' .-]+?)\s+Championship",
            chunk_text,
        )
        if title_bout_match:
            title_weight_class = re.sub(r"\s+", " ", title_bout_match.group(1)).strip().lower()
            if current_weight_class and current_weight_class not in title_weight_class:
                continue

        result = chunk[0]
        status_match = re.search(
            r"Status Before Fight:\s*([A-Za-z0-9' .-]+)",
            chunk_text,
        )
        status_text = status_match.group(1).strip().lower() if status_match else ""

        if result == "Upcoming" and "champion" in status_text:
            return True

        if result == "W" and ("champion" in status_text or "challenger" in status_text):
            return True

        return False

    return False


def extract_tapology_rank(page_text: str) -> str:
    if is_current_ufc_champion(page_text):
        return "0"

    unranked_match = re.search(r"UFC Ranking\s+Unranked\b", page_text, re.IGNORECASE)
    if unranked_match:
        return ""

    rank_match = re.search(
        r"UFC Ranking\s+.*?#\s*(\d+)\s+of\s+\d+\s+at\s+([A-Za-z0-9' .-]+?)\.",
        page_text,
        re.IGNORECASE | re.DOTALL,
    )
    if not rank_match:
        return ""

    rank_number = rank_match.group(1).strip()
    if not rank_number:
        return ""
    return rank_number


def extract_tapology_streak(page_text: str) -> str:
    streak_match = re.search(r"Current MMA Streak:\s*([^\n]+)", page_text)
    if not streak_match:
        return ""

    streak_text = re.sub(r"\s+", " ", streak_match.group(1)).strip()
    value_match = re.search(
        r"(\d+)\s+(Win|Wins|Loss|Losses|Draw|Draws|No Contest|No Contests|NC)",
        streak_text,
        re.IGNORECASE,
    )
    if not value_match:
        return ""

    count = int(value_match.group(1))
    outcome = value_match.group(2).lower()
    if outcome.startswith("win"):
        return str(count)
    if outcome.startswith("loss"):
        return str(-count)
    return "0"


def extract_tapology_method_record(
    soup: BeautifulSoup,
    record_id: str,
) -> Dict[str, str]:
    container = soup.find(id=record_id)
    if not container:
        return {"wins": "", "losses": ""}

    secondary = container.find(class_="secondary")
    if not secondary:
        return {"wins": "", "losses": ""}

    text = re.sub(r"\s+", " ", secondary.get_text(" ", strip=True)).strip()
    match = re.search(r"(\d+)\s+wins?,\s*(\d+)\s+loss(?:es)?", text, re.IGNORECASE)
    if not match:
        return {"wins": "", "losses": ""}

    return {
        "wins": match.group(1),
        "losses": match.group(2),
    }


def extract_tapology_style(page_text: str) -> str:
    match = re.search(r"Foundation Style:\s*([^\n]+)", page_text)
    if not match:
        return ""

    style = re.sub(r"\s+", " ", match.group(1)).strip()
    if not style or style.upper() == "N/A":
        return ""
    return style


def parse_tapology_fighter_profile(html: str) -> Dict[str, str]:
    soup = BeautifulSoup(html, "html.parser")
    page_text = soup.get_text("\n", strip=True)
    tko_record = extract_tapology_method_record(soup, "tkoRecordStats")
    sub_record = extract_tapology_method_record(soup, "subRecordStats")
    dec_record = extract_tapology_method_record(soup, "decRecordStats")
    return {
        "Rank": extract_tapology_rank(page_text),
        "Streak": extract_tapology_streak(page_text),
        "style": extract_tapology_style(page_text),
        "KO_TKO_Wins": tko_record["wins"],
        "KO_TKO_Losses": tko_record["losses"],
        "Submission_Wins": sub_record["wins"],
        "Submission_Losses": sub_record["losses"],
        "Decision_Wins": dec_record["wins"],
        "Decision_Losses": dec_record["losses"],
    }


def extract_ufc_event_number(event_name: str) -> str:
    match = re.search(r"\bUFC\s+(\d+)\b", event_name or "")
    if not match:
        return ""
    return match.group(1)


def build_ufc_fighter_name_list(event: Dict) -> List[str]:
    fighter_names = []
    seen = set()
    fights = sorted(
        event.get("FightCard", []),
        key=lambda fight: (
            0 if str(fight.get("CardSegment", "")).lower() == "main" else 1,
            fight.get("FightOrder", 999),
        ),
    )

    for fight in fights:
        for fighter in fight.get("Fighters", []):
            full_name = fighter_full_name(fighter)
            normalized = normalize_name(full_name)
            if not normalized or normalized in seen:
                continue
            fighter_names.append(full_name)
            seen.add(normalized)

    return fighter_names


def score_tapology_event_candidate(
    event: Dict,
    candidate: Dict[str, object],
) -> Dict[str, object]:
    event_name = str(event.get("Name", "")).strip()
    normalized_event_name = normalize_name(event_name)
    event_date = str(event.get("StartTime", "")).split("T")[0]
    event_number = extract_ufc_event_number(event_name)
    candidate_title = str(candidate.get("normalized_title", ""))
    candidate_date = str(candidate.get("event_date", ""))
    candidate_fighters = candidate.get("fighters", [])
    fighter_names = build_ufc_fighter_name_list(event)
    top_fighter_names = fighter_names[:6]

    score = 0
    reasons = []

    if candidate_date and candidate_date == event_date:
        score += 10
        reasons.append("date")

    if event_number and re.search(rf"\bufc\s+{re.escape(event_number)}\b", candidate_title):
        score += 8
        reasons.append("event-number")

    if normalized_event_name and (
        normalized_event_name in candidate_title or candidate_title in normalized_event_name
    ):
        score += 5
        reasons.append("title")

    exact_fighter_matches = 0
    alias_fighter_matches = 0
    for fighter_name in top_fighter_names:
        match = match_tapology_fighter(fighter_name, candidate_fighters)
        confidence = match.get("TapologyMatchConfidence", "")
        if confidence == "event-page-exact":
            exact_fighter_matches += 1
        elif confidence == "event-page-alias":
            alias_fighter_matches += 1

    if exact_fighter_matches:
        score += exact_fighter_matches * 3
        reasons.append(f"fighters-exact:{exact_fighter_matches}")
    if alias_fighter_matches:
        score += alias_fighter_matches
        reasons.append(f"fighters-alias:{alias_fighter_matches}")

    return {
        "TapologyEventURL": str(candidate.get("url", "")),
        "TapologyMatchConfidence": "+".join(reasons),
        "score": score,
        "candidate_date": candidate_date,
        "candidate_title": str(candidate.get("title", "")),
    }


def resolve_tapology_event_automatically(
    tapology_session: requests.Session,
    event: Dict,
    timeout: float,
) -> Dict[str, str]:
    try:
        schedule_html = fetch_tapology_ufc_schedule_html(
            tapology_session=tapology_session,
            timeout=timeout,
        )
    except (requests.RequestException, RuntimeError) as err:
        print(f"Unable to fetch Tapology UFC schedule: {err}")
        return {
            "TapologyEventURL": "",
            "TapologyMatchConfidence": "",
        }

    candidates = parse_tapology_schedule_candidates(schedule_html)
    if not candidates:
        print("Tapology UFC schedule returned no event candidates.")
        return {
            "TapologyEventURL": "",
            "TapologyMatchConfidence": "",
        }

    scored_candidates: List[Dict[str, object]] = []
    event_date = str(event.get("StartTime", "")).split("T")[0]
    for candidate in candidates:
        try:
            candidate_html = fetch_tapology_event_html(
                tapology_session=tapology_session,
                tapology_event_url=candidate["url"],
                timeout=timeout,
            )
        except (requests.RequestException, RuntimeError):
            continue

        details = parse_tapology_event_details(candidate_html, candidate["url"])
        if details.get("event_date") and details["event_date"] != event_date:
            continue

        scored_candidates.append(score_tapology_event_candidate(event, details))

    if not scored_candidates:
        return {
            "TapologyEventURL": "",
            "TapologyMatchConfidence": "",
        }

    scored_candidates.sort(key=lambda candidate: int(candidate["score"]), reverse=True)
    best = scored_candidates[0]
    runner_up_score = int(scored_candidates[1]["score"]) if len(scored_candidates) > 1 else -1
    best_score = int(best["score"])

    if best_score < 13:
        return {
            "TapologyEventURL": "",
            "TapologyMatchConfidence": "",
        }

    if runner_up_score >= 0 and best_score - runner_up_score < 3:
        return {
            "TapologyEventURL": "",
            "TapologyMatchConfidence": "",
        }

    return {
        "TapologyEventURL": str(best["TapologyEventURL"]),
        "TapologyMatchConfidence": f"auto:{best['TapologyMatchConfidence']}",
    }


def resolve_tapology_event(
    tapology_session: requests.Session,
    event: Dict,
    map_path: str,
    timeout: float,
    tapology_cache_lookup: Optional[Dict[str, Dict[str, Dict[str, object]]]] = None,
) -> Dict[str, str]:
    mapped_event = resolve_tapology_event_from_map(event, map_path)
    if mapped_event.get("TapologyEventURL"):
        print(f"Resolved Tapology event from map: {mapped_event['TapologyEventURL']}")
        return mapped_event

    cached_event = tapology_cache_event_for_event(event, tapology_cache_lookup or empty_tapology_cache_lookup())
    if cached_event.get("TapologyEventURL"):
        print(f"Resolved Tapology event from DB cache: {cached_event['TapologyEventURL']}")
        return cached_event

    auto_event = resolve_tapology_event_automatically(
        tapology_session=tapology_session,
        event=event,
        timeout=timeout,
    )
    if auto_event.get("TapologyEventURL"):
        print(f"Resolved Tapology event automatically: {auto_event['TapologyEventURL']}")
        return auto_event

    print(
        "No Tapology event match found automatically. "
        "A row in tapology_event_map.csv can still override the resolver."
    )
    return auto_event


def load_cached_tapology_fighter_enrichment(
    event: Dict,
    cache_dir: str = DEFAULT_TAPOLOGY_CACHE_DIR,
) -> Dict[str, Dict[str, str]]:
    event_id = str(event.get("EventId", "")).strip()
    if not event_id:
        return {}

    cache_path = os.path.join(cache_dir, f"event_{event_id}.json")
    if not os.path.exists(cache_path):
        return {}

    try:
        with open(cache_path, encoding="utf-8") as cache_file:
            payload = json.load(cache_file)
    except (OSError, ValueError) as err:
        print(f"Unable to read Tapology cache {cache_path}: {err}")
        return {}

    cached_fighters = payload.get("fighters", {})
    if not isinstance(cached_fighters, dict):
        return {}

    enrichment: Dict[str, Dict[str, str]] = {}
    for fight in event.get("FightCard", []):
        for fighter in fight.get("Fighters", []):
            fighter_name = fighter_full_name(fighter)
            fighter_key = normalize_name(fighter_name)
            cached_fighter = cached_fighters.get(fighter_key)
            if not fighter_key or not isinstance(cached_fighter, dict):
                continue

            row = {
                field: str(cached_fighter.get(field, "") or "").strip()
                for field in TAPOLOGY_ENRICHMENT_FIELDS
            }
            if row.get("TapologyMatchConfidence"):
                row["TapologyMatchConfidence"] = f"cache:{row['TapologyMatchConfidence']}"
            else:
                row["TapologyMatchConfidence"] = "cache"
            enrichment[fighter_key] = row

    if enrichment:
        print(
            f"Loaded cached Tapology enrichment for {len(enrichment)} fighter(s) "
            f"from {cache_path}."
        )

    return enrichment


def merge_cached_tapology_fighter_enrichment(
    event: Dict,
    enrichment: Dict[str, Dict[str, str]],
) -> Dict[str, Dict[str, str]]:
    cached_enrichment = load_cached_tapology_fighter_enrichment(event)
    if not cached_enrichment:
        return enrichment

    merged = {key: dict(value) for key, value in enrichment.items()}
    filled_count = 0

    for fighter_key, cached_fighter in cached_enrichment.items():
        target = merged.setdefault(fighter_key, {})
        for field in TAPOLOGY_ENRICHMENT_FIELDS:
            if target.get(field) or not cached_fighter.get(field):
                continue
            target[field] = cached_fighter[field]
            filled_count += 1

    if filled_count > 0:
        print(f"Backfilled {filled_count} Tapology field(s) from cache.")

    return merged


def match_tapology_fighter(
    fighter_name: str,
    parsed_fighters: List[Dict[str, object]],
) -> Dict[str, str]:
    normalized_fighter_name = normalize_name(fighter_name)
    exact_matches = []
    alias_matches = []

    for parsed_fighter in parsed_fighters:
        variants = parsed_fighter["variants"]
        if any(normalize_name(variant) == normalized_fighter_name for variant in variants):
            exact_matches.append(parsed_fighter)
            continue

        if any(variant_sets_match(normalized_fighter_name, variant) for variant in variants):
            alias_matches.append(parsed_fighter)

    if len(exact_matches) == 1:
        return {
            "TapologyFighterURL": str(exact_matches[0]["TapologyFighterURL"]),
            "TapologyMatchConfidence": "event-page-exact",
        }

    if len(exact_matches) > 1:
        return {}

    if len(alias_matches) == 1:
        return {
            "TapologyFighterURL": str(alias_matches[0]["TapologyFighterURL"]),
            "TapologyMatchConfidence": "event-page-alias",
        }

    return {}


def should_fetch_tapology_profile(fighter_data: Dict[str, str]) -> bool:
    profile_fields = [
        "Streak",
        "KO_TKO_Wins",
        "KO_TKO_Losses",
        "Submission_Wins",
        "Submission_Losses",
        "Decision_Wins",
        "Decision_Losses",
    ]
    return any(not cache_value_to_csv(fighter_data.get(field)) for field in profile_fields)


def record_tapology_profile_failures(
    event: Dict,
    failures: Dict[str, Dict[str, str]],
    timeout: float,
) -> None:
    if not failures:
        return

    failed_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
    payloads = []
    for fight in event.get("FightCard", []):
        for fighter in fight.get("Fighters", []):
            fighter_key = normalize_name(fighter_full_name(fighter))
            failure = failures.get(fighter_key)
            fighter_id = parse_optional_int(fighter.get("FighterId"))
            if not failure or fighter_id is None:
                continue
            payloads.append({
                "fighter_id": fighter_id,
                "tapology_fighter_url": cache_value_to_csv(
                    failure.get("TapologyFighterURL")
                ) or None,
                "last_failure_at": failed_at,
                "last_error": cache_value_to_csv(failure.get("error"))[:500] or None,
            })

    for table_name in ("tapology_fighter_cache", "fighters"):
        try:
            upsert_supabase_rows(table_name, payloads, "fighter_id", timeout)
        except (requests.RequestException, ValueError) as err:
            print(f"{table_name} profile failure update skipped: {err}")


def profile_limit_reached(profile_attempt_count: int, profile_limit: int) -> bool:
    return profile_limit >= 0 and profile_attempt_count >= profile_limit


def fetch_tapology_profiles_for_enrichment(
    tapology_session: requests.Session,
    event: Dict,
    enrichment: Dict[str, Dict[str, str]],
    timeout: float,
    tapology_delay_seconds: float,
    tapology_profile_limit: int,
) -> Tuple[int, int, Dict[str, Dict[str, str]]]:
    profile_count = 0
    profile_attempt_count = 0
    refreshed_profiles: Dict[str, Dict[str, str]] = {}
    failed_profiles: Dict[str, Dict[str, str]] = {}

    profile_candidates = sorted(
        enrichment.items(),
        key=lambda item: (
            cache_value_to_csv(item[1].get("_TapologyLastAttemptAt")),
            item[0],
        ),
    )
    for fighter_key, fighter_data in profile_candidates:
        fighter_url = fighter_data.get("TapologyFighterURL", "")
        if not fighter_url:
            continue
        if not should_fetch_tapology_profile(fighter_data):
            continue
        if profile_limit_reached(profile_attempt_count, tapology_profile_limit):
            continue

        if profile_attempt_count > 0 and tapology_delay_seconds > 0:
            time.sleep(tapology_delay_seconds)
        profile_attempt_count += 1

        try:
            fighter_html = fetch_tapology_fighter_html(
                tapology_session=tapology_session,
                tapology_fighter_url=fighter_url,
                timeout=timeout,
            )
        except (requests.RequestException, RuntimeError) as err:
            print(f"Unable to fetch Tapology fighter page {fighter_url}: {err}")
            failed_profiles[fighter_key] = {
                "TapologyFighterURL": fighter_url,
                "error": str(err),
            }
            continue

        fighter_profile = parse_tapology_fighter_profile(fighter_html)
        fighter_data.update(fighter_profile)
        enrichment[fighter_key] = fighter_data
        refreshed_profiles[fighter_key] = {
            "TapologyFighterURL": fighter_url,
            "TapologyMatchConfidence": fighter_data.get("TapologyMatchConfidence", ""),
            **fighter_profile,
        }
        profile_count += 1

    if tapology_profile_limit >= 0 and profile_attempt_count >= tapology_profile_limit:
        print(
            "Tapology fighter profile fetch limit reached: "
            f"{tapology_profile_limit} attempt(s)."
        )

    record_tapology_profile_failures(event, failed_profiles, timeout)

    return profile_count, profile_attempt_count, refreshed_profiles


def fetch_tapology_fighter_enrichment(
    tapology_session: requests.Session,
    event: Dict,
    tapology_event: Dict[str, str],
    timeout: float,
    tapology_delay_seconds: float,
    tapology_cache_lookup: Optional[Dict[str, Dict[str, Dict[str, object]]]] = None,
    tapology_profile_limit: int = DEFAULT_TAPOLOGY_PREVIEW_PROFILE_LIMIT,
    initial_enrichment: Optional[Dict[str, Dict[str, str]]] = None,
) -> Tuple[Dict[str, Dict[str, str]], Dict[str, str]]:
    cached_enrichment = load_tapology_cache_fighter_enrichment(
        event,
        tapology_cache_lookup or empty_tapology_cache_lookup(),
    )
    enrichment = merge_tapology_enrichment(initial_enrichment or {}, cached_enrichment)
    tapology_event_url = tapology_event.get("TapologyEventURL", "")
    if not tapology_event_url:
        return merge_cached_tapology_fighter_enrichment(event, enrichment), {}

    try:
        event_html = fetch_tapology_event_html(
            tapology_session=tapology_session,
            tapology_event_url=tapology_event_url,
            timeout=timeout,
        )
    except (requests.RequestException, RuntimeError) as err:
        print(f"Unable to fetch Tapology event page {tapology_event_url}: {err}")
        profile_count, _, refreshed_profiles = fetch_tapology_profiles_for_enrichment(
            tapology_session=tapology_session,
            event=event,
            enrichment=enrichment,
            timeout=timeout,
            tapology_delay_seconds=tapology_delay_seconds,
            tapology_profile_limit=tapology_profile_limit,
        )
        if profile_count:
            print(f"Fetched {profile_count} Tapology fighter profiles from cached URLs.")
            upsert_tapology_fighter_cache(
                event=event,
                enrichment=refreshed_profiles,
                timeout=timeout,
                source="cached_profile_url",
            )
        return merge_cached_tapology_fighter_enrichment(event, enrichment), {}

    event_details = parse_tapology_event_details(event_html, tapology_event_url)
    upsert_tapology_event_cache(
        event=event,
        tapology_event=tapology_event,
        event_details=event_details,
        timeout=timeout,
        source="live_event_page",
    )

    parsed_fighters = event_details.get("fighters", [])
    if not parsed_fighters:
        print(f"No Tapology fighter links found on mapped event page: {tapology_event_url}")
        return merge_cached_tapology_fighter_enrichment(event, enrichment), {
            "TapologyEventImageURL": str(event_details.get("event_image_url", "")).strip(),
        }

    live_event_matches: Dict[str, Dict[str, str]] = {}
    matched_count = 0
    for fight in event.get("FightCard", []):
        for fighter in fight.get("Fighters", []):
            fighter_name = fighter_full_name(fighter)
            if not fighter_name:
                continue

            match = match_tapology_fighter(fighter_name, parsed_fighters)
            if not match:
                continue

            fighter_key = normalize_name(fighter_name)
            event_confidence = tapology_event.get("TapologyMatchConfidence", "")
            fighter_confidence = match.get("TapologyMatchConfidence", "")
            combined_confidence = "+".join(
                part for part in [event_confidence, fighter_confidence] if part
            )
            match["TapologyMatchConfidence"] = combined_confidence or fighter_confidence
            live_event_matches[fighter_key] = match
            matched_count += 1

    enrichment = merge_tapology_enrichment(enrichment, live_event_matches)
    for fighter_key, live_match in live_event_matches.items():
        if cache_value_to_csv(live_match.get("TapologyFighterURL")):
            enrichment[fighter_key]["TapologyFighterURL"] = live_match["TapologyFighterURL"]
        if cache_value_to_csv(live_match.get("TapologyMatchConfidence")):
            enrichment[fighter_key]["TapologyMatchConfidence"] = live_match["TapologyMatchConfidence"]

    profile_count, _, refreshed_profiles = fetch_tapology_profiles_for_enrichment(
        tapology_session=tapology_session,
        event=event,
        enrichment=enrichment,
        timeout=timeout,
        tapology_delay_seconds=tapology_delay_seconds,
        tapology_profile_limit=tapology_profile_limit,
    )

    print(
        f"Matched {matched_count} Tapology fighter pages from "
        f"{len(parsed_fighters)} event-page fighter links."
    )
    print(f"Fetched {profile_count} Tapology fighter profiles.")
    upsert_tapology_fighter_cache(
        event=event,
        enrichment=live_event_matches,
        timeout=timeout,
        source="live_event_page",
    )
    upsert_tapology_fighter_cache(
        event=event,
        enrichment=refreshed_profiles,
        timeout=timeout,
        source="live_profile",
    )
    return merge_cached_tapology_fighter_enrichment(event, enrichment), {
        "TapologyEventImageURL": str(event_details.get("event_image_url", "")).strip(),
    }


def output_filename(event: Dict, output_dir: str) -> str:
    event_id = event.get("EventId")
    start_time = event.get("StartTime")
    date_str = start_time.split("T")[0] if start_time else datetime.date.today().isoformat()
    os.makedirs(output_dir, exist_ok=True)
    return os.path.join(output_dir, f"ufc_event_{event_id}_{date_str}_tapology.csv")


def metadata_filename(output_path: str) -> str:
    return f"{output_path}.meta.json"


def fetch_validated_fighter_source_enrichment(
    event: Dict,
    ufc_session: requests.Session,
    timeout: float,
    sherdog_delay_seconds: float,
    ufc_delay_seconds: float,
) -> Tuple[Dict[str, Dict[str, str]], Dict[str, Dict[str, str]]]:
    """Fetch the non-Tapology source chain once for every event fighter."""
    enrichment: Dict[str, Dict[str, str]] = {}
    ufc_profiles: Dict[str, Dict[str, str]] = {}
    sherdog_limiter = ProfileSourceRateLimiter(sherdog_delay_seconds)
    ufc_limiter = ProfileSourceRateLimiter(ufc_delay_seconds)
    total = sum(len(fight.get("Fighters", [])) for fight in event.get("FightCard", []))
    completed = 0

    with build_profile_source_session() as sherdog_session:
        for fight in event.get("FightCard", []):
            for fighter in fight.get("Fighters", []):
                completed += 1
                fighter_name = fighter_full_name(fighter)
                fighter_key = normalize_name(fighter_name)
                record = fighter.get("Record", {}) or {}

                def report_source_progress(source_name: str, source_status: str) -> None:
                    source_offsets = {"sherdog": 0.15, "ufc.com": 0.5, "wikipedia": 0.8}
                    source_labels = {
                        ("sherdog", "starting"): "Checking Sherdog record and methods",
                        ("sherdog", "complete"): "Sherdog record validated",
                        ("sherdog", "unavailable"): "Sherdog unavailable; continuing",
                        ("ufc.com", "starting"): "Checking official UFC profile",
                        ("ufc.com", "complete"): "Official UFC profile validated",
                        ("ufc.com", "unavailable"): "UFC.com profile unavailable; continuing",
                        ("wikipedia", "starting"): "Checking Wikipedia backup",
                        ("wikipedia", "complete"): "Wikipedia backup validated",
                        ("wikipedia", "unavailable"): "Wikipedia backup unavailable",
                        ("wikipedia", "not_needed"): "Wikipedia backup not needed",
                    }
                    fraction = ((completed - 1) + source_offsets.get(source_name, 0)) / max(total, 1)
                    status_detail = fighter_name
                    if source_status == "unavailable":
                        status_detail = f"{fighter_name} · source unavailable, continuing"
                    elif source_status == "not_needed":
                        status_detail = f"{fighter_name} · backup not needed"
                    emit_scrape_progress(
                        phase="fighters",
                        label=source_labels.get((source_name, source_status), "Checking fighter sources"),
                        detail=status_detail,
                        percent=15 + (65 * fraction),
                        current=completed,
                        total=total,
                    )

                result = scrape_fighter_sources(
                    fighter_name=fighter_name,
                    expected_wins=parse_optional_int(record.get("Wins")),
                    expected_losses=parse_optional_int(record.get("Losses")),
                    ufc_candidate_urls=build_ufc_profile_candidates(fighter.get("UFCLink"), fighter),
                    timeout=timeout,
                    sherdog_session=sherdog_session,
                    ufc_session=ufc_session,
                    sherdog_limiter=sherdog_limiter,
                    ufc_limiter=ufc_limiter,
                    on_progress=report_source_progress,
                )
                profile = {
                    field: cache_value_to_csv(value)
                    for field, value in (result.get("profile") or {}).items()
                    if field in TAPOLOGY_ENRICHMENT_FIELDS
                }
                if profile:
                    enrichment[fighter_key] = profile
                official = result.get("ufc_profile") or {}
                ufc_profiles[fighter_key] = {
                    "ImageURL": cache_value_to_csv(official.get("ImageURL")),
                    "UFCRank": cache_value_to_csv(official.get("Rank")),
                }
                diagnostics = result.get("diagnostics") or {}
                print(
                    f"Fighter sources {completed}/{total}: {fighter_name} "
                    f"[{result.get('source', 'none')}] "
                    f"{len(diagnostics.get('fields_found', []))}/{len(VALIDATED_PROFILE_FIELDS)} fields"
                )
                emit_scrape_progress(
                    phase="fighters",
                    label="Fighter profile complete",
                    detail=f"{fighter_name} · {result.get('source', 'no validated source')}",
                    percent=15 + (65 * completed / max(total, 1)),
                    current=completed,
                    total=total,
                )

    upsert_tapology_fighter_cache(
        event=event,
        enrichment=enrichment,
        timeout=timeout,
        source="validated_fighter_sources",
        write_tapology_cache=False,
    )
    return enrichment, ufc_profiles


def build_event_constants(event: Dict) -> Dict[str, Optional[str]]:
    organization = event.get("Organization", {})
    location = event.get("Location", {})
    return {
        "Event": event.get("Name"),
        "EventId": event.get("EventId"),
        "StartTime": event.get("StartTime"),
        "TimeZone": event.get("TimeZone"),
        "EventStatus": event.get("Status"),
        "OrganizationId": organization.get("OrganizationId"),
        "OrganizationName": organization.get("Name"),
        "Venue": location.get("Venue"),
        "VenueId": location.get("VenueId"),
        "Location_City": location.get("City"),
        "Location_State": location.get("State"),
        "Location_Country": location.get("Country"),
        "TriCode": location.get("TriCode"),
    }


def extract_possible_rounds(fight: Dict) -> Optional[int]:
    ruleset = fight.get("RuleSet", {}) or {}
    possible_rounds = ruleset.get("PossibleRounds")
    if isinstance(possible_rounds, int):
        return possible_rounds

    try:
        if possible_rounds is not None and str(possible_rounds).strip():
            return int(str(possible_rounds).strip())
    except (TypeError, ValueError):
        pass

    description = str(ruleset.get("Description", "")).strip()
    description_match = re.search(r"(\d+)\s*Rnd\b", description, re.IGNORECASE)
    if description_match:
        return int(description_match.group(1))

    return None


def extract_title_fight_details(fight: Dict) -> Tuple[bool, str]:
    accolades = fight.get("Accolades", []) or []
    title_names: List[str] = []

    for accolade in accolades:
        if not isinstance(accolade, dict):
            continue

        accolade_type = str(accolade.get("Type", "")).strip().lower()
        accolade_name = str(accolade.get("Name", "")).strip()
        normalized_name = accolade_name.lower()

        is_title_accolade = (
            accolade_type == "belt"
            or "title" in normalized_name
            or "championship" in normalized_name
        )
        if not is_title_accolade:
            continue

        if accolade_name and accolade_name not in title_names:
            title_names.append(accolade_name)

    return bool(title_names), " / ".join(title_names)


def build_row(
    event_constants: Dict[str, Optional[str]],
    fight: Dict,
    fighter: Dict,
    ufc_profile: Dict[str, str],
    odds_map: Dict[str, str],
    tapology_event: Dict[str, str],
    tapology_fighter: Dict[str, str],
    fighter_style_lookup: Dict[str, Dict[str, str]],
) -> Dict[str, Optional[str]]:
    name_info = fighter.get("Name", {})
    record = fighter.get("Record", {})
    born = fighter.get("Born", {})
    fighting_out = fighter.get("FightingOutOf", {})
    referee = fight.get("Referee", {}) or {}
    weight_classes = fighter.get("WeightClasses", [])
    possible_rounds = extract_possible_rounds(fight)
    is_title_fight, title_fight_name = extract_title_fight_details(fight)

    row = {
        "id": "",
        "FightId": fight.get("FightId"),
        "FightOrder": fight.get("FightOrder"),
        "FightStatus": fight.get("Status"),
        "PossibleRounds": possible_rounds if possible_rounds is not None else "",
        "Referee_FirstName": referee.get("FirstName"),
        "Referee_LastName": referee.get("LastName"),
        "IsTitleFight": "true" if is_title_fight else "false",
        "TitleFightName": title_fight_name,
        "CardSegment": fight.get("CardSegment"),
        "CardSegmentStartTime": fight.get("CardSegmentStartTime"),
        "CardSegmentBroadcaster": fight.get("CardSegmentBroadcaster"),
        "FighterId": fighter.get("FighterId"),
        "MMAId": fighter.get("MMAId"),
        "Corner": fighter.get("Corner"),
        "FirstName": name_info.get("FirstName"),
        "LastName": name_info.get("LastName"),
        "Nickname": name_info.get("NickName", ""),
        "DOB": fighter.get("DOB"),
        "Age": fighter.get("Age"),
        "Stance": fighter.get("Stance"),
        "Weight_lbs": fighter.get("Weight"),
        "Height_in": fighter.get("Height"),
        "Reach_in": fighter.get("Reach"),
        "UFC_Profile": fighter.get("UFCLink"),
        "FighterWeightClass": weight_classes[0]["Description"] if weight_classes else "Unknown",
        "Record_Wins": record.get("Wins"),
        "Record_Losses": record.get("Losses"),
        "Record_Draws": record.get("Draws"),
        "Record_NoContests": record.get("NoContests"),
        "Born_City": born.get("City"),
        "Born_State": born.get("State"),
        "Born_Country": born.get("Country"),
        "FightingOutOf_City": fighting_out.get("City"),
        "FightingOutOf_State": fighting_out.get("State"),
        "FightingOutOf_Country": fighting_out.get("Country"),
        "ImageURL": ufc_profile.get("ImageURL", ""),
        "Rank": ufc_profile.get("UFCRank", "") or tapology_fighter.get("Rank", ""),
        "odds": odds_map.get(normalize_name(fighter_full_name(fighter)), ""),
        "Streak": tapology_fighter.get("Streak", ""),
        "style": resolve_style_from_sources(
            fighter=fighter,
            fighter_style_lookup=fighter_style_lookup,
            tapology_fighter=tapology_fighter,
        ),
        "KO_TKO_Wins": tapology_fighter.get("KO_TKO_Wins", ""),
        "KO_TKO_Losses": tapology_fighter.get("KO_TKO_Losses", ""),
        "Submission_Wins": tapology_fighter.get("Submission_Wins", ""),
        "Submission_Losses": tapology_fighter.get("Submission_Losses", ""),
        "Decision_Wins": tapology_fighter.get("Decision_Wins", ""),
        "Decision_Losses": tapology_fighter.get("Decision_Losses", ""),
        "SigStrLandedPerMin": tapology_fighter.get("SigStrLandedPerMin", ""),
        "SigStrAbsorbedPerMin": tapology_fighter.get("SigStrAbsorbedPerMin", ""),
        "SigStrikeAccuracyPct": tapology_fighter.get("SigStrikeAccuracyPct", ""),
        "SigStrikeDefensePct": tapology_fighter.get("SigStrikeDefensePct", ""),
        "TakedownAvgPer15": tapology_fighter.get("TakedownAvgPer15", ""),
        "TakedownAccuracyPct": tapology_fighter.get("TakedownAccuracyPct", ""),
        "TakedownDefensePct": tapology_fighter.get("TakedownDefensePct", ""),
        "SubmissionAvgPer15": tapology_fighter.get("SubmissionAvgPer15", ""),
        "KnockdownAvgPer15": tapology_fighter.get("KnockdownAvgPer15", ""),
        "AverageFightTimeSeconds": tapology_fighter.get("AverageFightTimeSeconds", ""),
        "RecentForm": tapology_fighter.get("RecentForm", ""),
        "LastFightDate": tapology_fighter.get("LastFightDate", ""),
        "TapologyEventURL": tapology_event.get("TapologyEventURL", ""),
        "TapologyFighterURL": tapology_fighter.get("TapologyFighterURL", ""),
        "TapologyMatchConfidence": tapology_fighter.get(
            "TapologyMatchConfidence",
            tapology_event.get("TapologyMatchConfidence", ""),
        ),
    }
    row.update(event_constants)
    return row


def export_event(
    event: Dict,
    output_path: str,
    odds_map: Dict[str, str],
    tapology_event: Dict[str, str],
    tapology_fighters: Dict[str, Dict[str, str]],
    fighter_style_lookup: Dict[str, Dict[str, str]],
    ufc_session: requests.Session,
    timeout: float,
    image_delay_seconds: float,
    ufc_profiles: Optional[Dict[str, Dict[str, str]]] = None,
) -> None:
    event_constants = build_event_constants(event)

    with open(output_path, "w", newline="", encoding="utf-8") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=CSV_HEADERS)
        writer.writeheader()

        for fight in event.get("FightCard", []):
            for fighter in fight.get("Fighters", []):
                fighter_name_key = normalize_name(fighter_full_name(fighter))
                fighter_enrichment = tapology_fighters.get(fighter_name_key, {})
                ufc_profile = (ufc_profiles or {}).get(fighter_name_key)
                if ufc_profile is None:
                    ufc_profile = fetch_ufc_profile_details(ufc_session, fighter, timeout)
                row = build_row(
                    event_constants=event_constants,
                    fight=fight,
                    fighter=fighter,
                    ufc_profile=ufc_profile,
                    odds_map=odds_map,
                    tapology_event=tapology_event,
                    tapology_fighter=fighter_enrichment,
                    fighter_style_lookup=fighter_style_lookup,
                )
                writer.writerow(row)
                if image_delay_seconds > 0:
                    time.sleep(image_delay_seconds)


def int_env(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, "").strip())
    except (TypeError, ValueError):
        return default


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Export a UFC event to CSV using the existing UFC data source, "
            "with placeholders and mapping support for future Tapology enrichment."
        )
    )
    parser.add_argument("event_id", type=int, help="UFC EventId to export.")
    parser.add_argument(
        "--output-dir",
        default=DEFAULT_OUTPUT_DIR,
        help="Directory where the CSV will be written.",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=10.0,
        help="HTTP request timeout in seconds.",
    )
    parser.add_argument(
        "--image-delay-seconds",
        type=float,
        default=1.0,
        help="Delay between UFC profile image requests.",
    )
    parser.add_argument(
        "--sherdog-delay-seconds",
        type=float,
        default=float(os.getenv("SHERDOG_PROFILE_DELAY_SECONDS", "1.25")),
        help="Minimum delay between Sherdog requests.",
    )
    parser.add_argument(
        "--ufc-profile-delay-seconds",
        type=float,
        default=float(os.getenv("UFC_PROFILE_DELAY_SECONDS", "1.0")),
        help="Minimum delay between UFC.com fighter profile requests.",
    )
    parser.add_argument(
        "--tapology-delay-seconds",
        type=float,
        default=DEFAULT_TAPOLOGY_DELAY_SECONDS,
        help="Delay between Tapology fighter profile requests.",
    )
    parser.add_argument(
        "--tapology-map",
        default=DEFAULT_TAPOLOGY_MAP,
        help="CSV file used to map UFC events to Tapology event URLs.",
    )
    parser.add_argument(
        "--tapology-profile-limit",
        type=int,
        default=int_env("TAPOLOGY_PREVIEW_PROFILE_LIMIT", DEFAULT_TAPOLOGY_PREVIEW_PROFILE_LIMIT),
        help=(
            "Maximum Tapology fighter profile pages to fetch. "
            "Use -1 for no limit."
        ),
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    with build_ufc_session() as ufc_session, build_tapology_session() as tapology_session:
        emit_scrape_progress("event", "Loading UFC event", f"Event {args.event_id}", percent=5)
        try:
            event = fetch_ufc_event(args.event_id, session=ufc_session, timeout=args.timeout)
        except RuntimeError as err:
            print(str(err), file=sys.stderr)
            sys.exit(1)

        emit_scrape_progress("odds", "Loading FightOdds prices", event.get("Name", ""), percent=9)
        odds_map = build_event_odds_map(event, session=ufc_session, timeout=args.timeout)
        emit_scrape_progress(
            "odds",
            "Odds lookup complete",
            f"Prices found for {len(odds_map)} fighters",
            percent=14,
        )
        fighter_style_lookup = fetch_fighter_style_lookup(timeout=args.timeout)
        tapology_cache_lookup = fetch_tapology_cache_lookup(timeout=args.timeout)
        primary_fighters, ufc_profiles = fetch_validated_fighter_source_enrichment(
            event=event,
            ufc_session=ufc_session,
            timeout=args.timeout,
            sherdog_delay_seconds=args.sherdog_delay_seconds,
            ufc_delay_seconds=args.ufc_profile_delay_seconds,
        )
        emit_scrape_progress(
            "fallback",
            "Checking Tapology fallback",
            "Primary fighter sources are complete; checking optional cached gaps",
            percent=84,
        )
        tapology_event = resolve_tapology_event(
            tapology_session=tapology_session,
            event=event,
            map_path=args.tapology_map,
            timeout=args.timeout,
            tapology_cache_lookup=tapology_cache_lookup,
        )
        tapology_fighters, tapology_event_metadata = fetch_tapology_fighter_enrichment(
            tapology_session=tapology_session,
            event=event,
            tapology_event=tapology_event,
            timeout=args.timeout,
            tapology_delay_seconds=args.tapology_delay_seconds,
            tapology_cache_lookup=tapology_cache_lookup,
            tapology_profile_limit=args.tapology_profile_limit,
            initial_enrichment=primary_fighters,
        )
        tapology_event = {
            **tapology_event,
            **tapology_event_metadata,
        }
        emit_scrape_progress(
            "export",
            "Building fight-card file",
            "Combining event, odds, and fighter profile data",
            percent=93,
        )
        output_path = output_filename(event, args.output_dir)

        export_event(
            event=event,
            output_path=output_path,
            odds_map=odds_map,
            tapology_event=tapology_event,
            tapology_fighters=tapology_fighters,
            fighter_style_lookup=fighter_style_lookup,
            ufc_session=ufc_session,
            timeout=args.timeout,
            image_delay_seconds=args.image_delay_seconds,
            ufc_profiles=ufc_profiles,
        )

        with open(metadata_filename(output_path), "w", encoding="utf-8") as metadata_file:
            json.dump(
                {
                    "event_id": event.get("EventId"),
                    "tapology_event_url": tapology_event.get("TapologyEventURL", ""),
                    "tapology_event_image_url": tapology_event.get(
                        "TapologyEventImageURL", ""
                    ),
                    "tapology_match_confidence": tapology_event.get(
                        "TapologyMatchConfidence", ""
                    ),
                },
                metadata_file,
                ensure_ascii=True,
                indent=2,
            )

    emit_scrape_progress(
        "export",
        "Scrape complete",
        "Validating the generated preview file",
        percent=96,
    )
    print(f"Exported Tapology-ready fight card to {output_path}")


if __name__ == "__main__":
    main()
