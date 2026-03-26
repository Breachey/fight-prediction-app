#!/usr/bin/env python3
import argparse
import csv
import datetime
import json
import os
import re
import sys
import time
import unicodedata
from typing import Dict, Iterable, List, Optional, Tuple

import requests
from bs4 import BeautifulSoup
import certifi

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
FIGHTODDS_GQL_URL = "https://api.fightodds.io/gql"
SUPABASE_STYLE_SELECT = "fighter_id,mma_id,first_name,last_name,style"
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SERVER_ROOT = os.path.dirname(SCRIPT_DIR)
REPO_ROOT = os.path.dirname(SERVER_ROOT)
DEFAULT_OUTPUT_DIR = os.path.join(SCRIPT_DIR, "fight_cards")
DEFAULT_TAPOLOGY_MAP = os.path.join(SCRIPT_DIR, "tapology_event_map.csv")
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
    "TapologyEventURL",
    "TapologyFighterURL",
    "TapologyMatchConfidence",
]


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
            "Tapology blocked the request with a Cloudflare challenge. "
            "Install 'cloudscraper' so the script can fetch Tapology pages: "
            "'python3 -m pip install cloudscraper'. "
            f"Blocked URL: {url}"
        )

    response.raise_for_status()


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


def fetch_fighter_style_lookup(timeout: float) -> Dict[str, Dict[str, str]]:
    credentials = load_supabase_credentials()
    supabase_url = credentials.get("url", "")
    service_role_key = credentials.get("service_role_key", "")
    if not supabase_url or not service_role_key:
        print("fighter_style lookup skipped: Supabase credentials were not found.")
        return {
            "by_fighter_id": {},
            "by_mma_id": {},
            "by_name": {},
        }

    headers = {
        "apikey": service_role_key,
        "Authorization": f"Bearer {service_role_key}",
        "Accept": "application/json",
    }
    endpoint = f"{supabase_url.rstrip('/')}/rest/v1/fighter_style"
    rows: List[Dict[str, object]] = []
    offset = 0
    page_size = 1000

    while True:
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
        if not isinstance(payload, list) or not payload:
            break

        rows.extend(payload)
        if len(payload) < page_size:
            break

        offset += page_size

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
        "Loaded fighter_style lookup from Supabase: "
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
    response = session.post(
        FIGHTODDS_GQL_URL,
        json={"query": query, "variables": variables},
        timeout=timeout,
        headers={"Content-Type": "application/json"},
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
    return names_have_alias_match(normalized_expected, normalized_candidate)


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


def load_tapology_event_map(path: str) -> List[Dict[str, str]]:
    if not os.path.exists(path):
        return []

    with open(path, newline="", encoding="utf-8") as csv_file:
        reader = csv.DictReader(csv_file)
        return [dict(row) for row in reader]


def fetch_tapology_event_html(
    tapology_session: requests.Session,
    tapology_event_url: str,
    timeout: float,
) -> str:
    response = tapology_session.get(tapology_event_url, timeout=timeout)
    raise_for_status_with_context(response, tapology_event_url)
    return response.text


def fetch_tapology_fighter_html(
    tapology_session: requests.Session,
    tapology_fighter_url: str,
    timeout: float,
) -> str:
    response = tapology_session.get(tapology_fighter_url, timeout=timeout)
    raise_for_status_with_context(response, tapology_fighter_url)
    return response.text


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
    response = tapology_session.get(TAPOLOGY_UFC_SCHEDULE_URL, timeout=timeout)
    raise_for_status_with_context(response, TAPOLOGY_UFC_SCHEDULE_URL)
    return response.text


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
    normalized_expected_name = normalize_name(expected_name)
    for variant in variants:
        if normalized_expected_name == normalize_name(variant):
            return True
        if names_have_alias_match(normalized_expected_name, variant):
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
) -> Dict[str, str]:
    mapped_event = resolve_tapology_event_from_map(event, map_path)
    if mapped_event.get("TapologyEventURL"):
        print(f"Resolved Tapology event from map: {mapped_event['TapologyEventURL']}")
        return mapped_event

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


def match_tapology_fighter(
    fighter_name: str,
    parsed_fighters: List[Dict[str, object]],
) -> Dict[str, str]:
    normalized_fighter_name = normalize_name(fighter_name)
    exact_matches = []
    alias_matches = []

    for parsed_fighter in parsed_fighters:
        variants = parsed_fighter["variants"]
        if normalized_fighter_name in variants:
            exact_matches.append(parsed_fighter)
            continue

        if any(names_have_alias_match(normalized_fighter_name, variant) for variant in variants):
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


def fetch_tapology_fighter_enrichment(
    tapology_session: requests.Session,
    event: Dict,
    tapology_event: Dict[str, str],
    timeout: float,
) -> Tuple[Dict[str, Dict[str, str]], Dict[str, str]]:
    tapology_event_url = tapology_event.get("TapologyEventURL", "")
    if not tapology_event_url:
        return {}, {}

    try:
        event_html = fetch_tapology_event_html(
            tapology_session=tapology_session,
            tapology_event_url=tapology_event_url,
            timeout=timeout,
        )
    except (requests.RequestException, RuntimeError) as err:
        print(f"Unable to fetch Tapology event page {tapology_event_url}: {err}")
        return {}, {}

    event_details = parse_tapology_event_details(event_html, tapology_event_url)
    parsed_fighters = event_details.get("fighters", [])
    if not parsed_fighters:
        print(f"No Tapology fighter links found on mapped event page: {tapology_event_url}")
        return {}, {
            "TapologyEventImageURL": str(event_details.get("event_image_url", "")).strip(),
        }

    enrichment: Dict[str, Dict[str, str]] = {}
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
            enrichment[fighter_key] = match
            matched_count += 1

    profile_count = 0
    for fighter_key, fighter_data in enrichment.items():
        fighter_url = fighter_data.get("TapologyFighterURL", "")
        if not fighter_url:
            continue

        try:
            fighter_html = fetch_tapology_fighter_html(
                tapology_session=tapology_session,
                tapology_fighter_url=fighter_url,
                timeout=timeout,
            )
        except (requests.RequestException, RuntimeError) as err:
            print(f"Unable to fetch Tapology fighter page {fighter_url}: {err}")
            continue

        fighter_profile = parse_tapology_fighter_profile(fighter_html)
        fighter_data.update(fighter_profile)
        enrichment[fighter_key] = fighter_data
        profile_count += 1

    print(
        f"Matched {matched_count} Tapology fighter pages from "
        f"{len(parsed_fighters)} event-page fighter links."
    )
    print(f"Fetched {profile_count} Tapology fighter profiles.")
    return enrichment, {
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
    weight_classes = fighter.get("WeightClasses", [])

    row = {
        "id": "",
        "FightId": fight.get("FightId"),
        "FightOrder": fight.get("FightOrder"),
        "FightStatus": fight.get("Status"),
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
) -> None:
    event_constants = build_event_constants(event)

    with open(output_path, "w", newline="", encoding="utf-8") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=CSV_HEADERS)
        writer.writeheader()

        for fight in event.get("FightCard", []):
            for fighter in fight.get("Fighters", []):
                fighter_name_key = normalize_name(fighter_full_name(fighter))
                fighter_enrichment = tapology_fighters.get(fighter_name_key, {})
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
        "--tapology-map",
        default=DEFAULT_TAPOLOGY_MAP,
        help="CSV file used to map UFC events to Tapology event URLs.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    with build_ufc_session() as ufc_session, build_tapology_session() as tapology_session:
        try:
            event = fetch_ufc_event(args.event_id, session=ufc_session, timeout=args.timeout)
        except RuntimeError as err:
            print(str(err), file=sys.stderr)
            sys.exit(1)

        odds_map = fetch_fightodds_odds_map(event, session=ufc_session, timeout=args.timeout)
        tapology_event = resolve_tapology_event(
            tapology_session=tapology_session,
            event=event,
            map_path=args.tapology_map,
            timeout=args.timeout,
        )
        tapology_fighters, tapology_event_metadata = fetch_tapology_fighter_enrichment(
            tapology_session=tapology_session,
            event=event,
            tapology_event=tapology_event,
            timeout=args.timeout,
        )
        tapology_event = {
            **tapology_event,
            **tapology_event_metadata,
        }
        fighter_style_lookup = fetch_fighter_style_lookup(timeout=args.timeout)
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

    print(f"Exported Tapology-ready fight card to {output_path}")


if __name__ == "__main__":
    main()
