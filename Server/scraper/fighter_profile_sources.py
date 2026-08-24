#!/usr/bin/env python3
"""Validated fighter enrichment from Sherdog, UFC.com, then Wikipedia."""

import datetime
import re
import time
import unicodedata
from typing import Dict, List, Optional, Tuple
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup


SHERDOG_SEARCH_URL = "https://www.sherdog.com/stats/fightfinder"
WIKIPEDIA_API_URL = "https://en.wikipedia.org/w/api.php"
METHOD_FIELDS = [
    "KO_TKO_Wins", "KO_TKO_Losses", "Submission_Wins",
    "Submission_Losses", "Decision_Wins", "Decision_Losses",
]
PERFORMANCE_FIELDS = [
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
PROFILE_FIELDS = ["Rank", "Streak", "style", *METHOD_FIELDS, *PERFORMANCE_FIELDS]
KNOWN_NAME_ALIASES = {
    "aoriqileng": {"qileng aori"},
    "sumudaerji": {"su mudaerji"},
}
DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; FightPickerStatsBot/1.0; low-volume fighter lookup)",
    "Accept-Language": "en-US,en;q=0.9",
}


def normalize_name(value: object) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(char for char in text if not unicodedata.combining(char))
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def name_variants(value: object) -> set:
    normalized = normalize_name(value)
    variants = {normalized}
    variants.update(KNOWN_NAME_ALIASES.get(normalized.replace(" ", ""), set()))
    for canonical, aliases in KNOWN_NAME_ALIASES.items():
        if normalized in aliases:
            variants.add(canonical)
    return {item.replace(" ", "") for item in variants if item}


def name_score(expected: str, candidate: str) -> int:
    expected_norm = normalize_name(expected)
    candidate_norm = normalize_name(candidate)
    if not expected_norm or not candidate_norm:
        return 0
    if name_variants(expected) & name_variants(candidate):
        return 100
    if sorted(expected_norm.split()) == sorted(candidate_norm.split()):
        return 96
    expected_tokens = set(expected_norm.split())
    candidate_tokens = set(candidate_norm.split())
    if expected_tokens.issubset(candidate_tokens) or candidate_tokens.issubset(expected_tokens):
        return 82
    overlap = len(expected_tokens & candidate_tokens)
    return int(70 * overlap / max(len(expected_tokens), len(candidate_tokens)))


class RateLimiter:
    def __init__(self, interval_seconds: float = 0.0):
        self.interval_seconds = max(0.0, float(interval_seconds or 0))
        self.next_allowed = 0.0

    def get(self, session: requests.Session, url: str, timeout: float, **kwargs):
        delay = self.next_allowed - time.monotonic()
        if delay > 0:
            time.sleep(delay)
        try:
            return session.get(url, timeout=timeout, **kwargs)
        finally:
            self.next_allowed = time.monotonic() + self.interval_seconds


def build_session() -> requests.Session:
    session = requests.Session()
    session.headers.update(DEFAULT_HEADERS)
    return session


def _integer(text: object) -> Optional[int]:
    match = re.search(r"\d+", str(text or "").replace(",", ""))
    return int(match.group(0)) if match else None


def _decimal(text: object) -> Optional[float]:
    match = re.search(r"-?\d+(?:\.\d+)?", str(text or "").replace(",", ""))
    return float(match.group(0)) if match else None


def _iso_sherdog_date(text: object) -> str:
    match = re.search(r"\b([A-Z][a-z]{2})\s*/\s*(\d{1,2})\s*/\s*(\d{4})\b", str(text or ""))
    if not match:
        return ""
    try:
        return datetime.datetime.strptime(
            f"{match.group(1)} {match.group(2)} {match.group(3)}",
            "%b %d %Y",
        ).date().isoformat()
    except ValueError:
        return ""


def _parse_sherdog_record_side(soup: BeautifulSoup, selector: str, suffix: str) -> Dict[str, int]:
    root = soup.select_one(selector)
    if not root:
        return {}
    parsed: Dict[str, int] = {}
    total_node = root.select_one(".winloses span:nth-of-type(2)")
    total = _integer(total_node.get_text(" ", strip=True) if total_node else "")
    if total is not None:
        parsed[f"Record_{suffix}"] = total
    for title, meter in zip(root.select(".meter-title"), root.select(".meter")):
        value_node = meter.select_one(".pl")
        value = _integer(value_node.get_text(" ", strip=True) if value_node else "")
        if value is None:
            continue
        label = normalize_name(title.get_text(" ", strip=True))
        if "ko" in label or "tko" in label:
            field = f"KO_TKO_{suffix}"
        elif "submission" in label:
            field = f"Submission_{suffix}"
        elif "decision" in label:
            field = f"Decision_{suffix}"
        else:
            field = f"Other_{suffix}"
        parsed[field] = value
    return parsed


def parse_sherdog_profile(html: str, url: str = "") -> Dict[str, object]:
    soup = BeautifulSoup(html, "html.parser")
    name_node = soup.select_one(".fn")
    if not name_node:
        return {}
    profile: Dict[str, object] = {
        "name": name_node.get_text(" ", strip=True),
        "sherdog_fighter_url": url,
        **_parse_sherdog_record_side(soup, ".wins", "Wins"),
        **_parse_sherdog_record_side(soup, ".loses", "Losses"),
    }
    results: List[str] = []
    last_fight_date = ""
    for row in soup.select("table.new_table.fighter tr:not(.table_head)"):
        cells = row.select("td")
        result = normalize_name(cells[0].get_text(" ", strip=True)) if cells else ""
        if result in {"win", "loss", "draw", "nc"}:
            results.append(result)
            if not last_fight_date:
                last_fight_date = _iso_sherdog_date(row.get_text(" ", strip=True))
    if results:
        result_labels = {"win": "W", "loss": "L", "draw": "D", "nc": "NC"}
        profile["RecentForm"] = ",".join(result_labels[result] for result in results[:5])
    if last_fight_date:
        profile["LastFightDate"] = last_fight_date
    decisive_results = [result for result in results if result in {"win", "loss"}]
    if decisive_results:
        first = decisive_results[0]
        length = 0
        for result in decisive_results:
            if result != first:
                break
            length += 1
        profile["Streak"] = str(length if first == "win" else -length)
    style_label = soup.find(string=lambda value: normalize_name(value) == "style")
    if style_label and style_label.parent:
        value_node = style_label.parent.find_next_sibling()
        if value_node:
            profile["style"] = value_node.get_text(" ", strip=True)
    return profile


def _method_totals_are_valid(profile: Dict[str, object]) -> bool:
    for suffix in ("Wins", "Losses"):
        total = profile.get(f"Record_{suffix}")
        fields = [f"KO_TKO_{suffix}", f"Submission_{suffix}", f"Decision_{suffix}"]
        if total is None or any(profile.get(field) is None for field in fields):
            return False
        other = int(profile.get(f"Other_{suffix}") or 0)
        if sum(int(profile[field]) for field in fields) + other != int(total):
            return False
    return True


def _sherdog_candidates(html: str, response_url: str, fighter_name: str) -> List[Tuple[int, str]]:
    soup = BeautifulSoup(html, "html.parser")
    candidates: Dict[str, int] = {}
    for link in soup.select('a[href^="/fighter/"]'):
        score = name_score(fighter_name, link.get_text(" ", strip=True))
        url = urljoin(response_url, link.get("href", "")).rstrip("/")
        if score >= 70 and url:
            candidates[url] = max(score, candidates.get(url, 0))
    return sorted(((score, url) for url, score in candidates.items()), reverse=True)[:12]


def fetch_sherdog_profile(
    fighter_name: str,
    expected_wins: Optional[int],
    expected_losses: Optional[int],
    timeout: float,
    session: Optional[requests.Session] = None,
    limiter: Optional[RateLimiter] = None,
) -> Tuple[Dict[str, object], Dict[str, object]]:
    session = session or build_session()
    limiter = limiter or RateLimiter()
    normalized = normalize_name(fighter_name)
    search_terms = [fighter_name, *sorted(KNOWN_NAME_ALIASES.get(normalized.replace(" ", ""), set()))]
    candidates: Dict[str, int] = {}
    for search_term in search_terms:
        response = limiter.get(
            session, SHERDOG_SEARCH_URL, timeout,
            params={"SearchTxt": search_term},
        )
        response.raise_for_status()
        for score, url in _sherdog_candidates(response.text, response.url, fighter_name):
            candidates[url] = max(score, candidates.get(url, 0))
    tested = []
    for initial_score, url in sorted(((score, url) for url, score in candidates.items()), reverse=True)[:12]:
        candidate = limiter.get(session, url, timeout)
        if candidate.status_code != 200:
            tested.append({"url": url, "http_status": candidate.status_code})
            continue
        profile = parse_sherdog_profile(candidate.text, candidate.url)
        identity_ok = name_score(fighter_name, str(profile.get("name", ""))) >= 96
        record_ok = (
            expected_wins is not None and expected_losses is not None
            and profile.get("Record_Wins") is not None
            and profile.get("Record_Losses") is not None
            and abs(int(profile["Record_Wins"]) - int(expected_wins)) <= 1
            and abs(int(profile["Record_Losses"]) - int(expected_losses)) <= 1
        )
        methods_ok = _method_totals_are_valid(profile)
        tested.append({
            "url": url, "name": profile.get("name"), "identity_ok": identity_ok,
            "record_ok": record_ok, "methods_ok": methods_ok,
        })
        if initial_score >= 70 and identity_ok and record_ok and methods_ok:
            profile["SherdogFighterURL"] = candidate.url
            profile["SherdogMatchConfidence"] = "identity-and-record-validated"
            return profile, {"status": "success", "candidates_tested": tested}
    return {}, {"status": "not_found", "candidates_tested": tested}


def parse_ufc_profile(html: str, url: str = "") -> Dict[str, object]:
    soup = BeautifulSoup(html, "html.parser")
    name_node = soup.select_one(".hero-profile__name")
    if not name_node:
        return {}
    profile: Dict[str, object] = {"name": name_node.get_text(" ", strip=True), "ufc_profile_url": url}
    record_node = soup.select_one(".hero-profile__division-body")
    record_match = re.search(r"(\d+)\s*-\s*(\d+)\s*-\s*(\d+)", record_node.get_text(" ", strip=True) if record_node else "")
    if record_match:
        profile.update({
            "Record_Wins": int(record_match.group(1)),
            "Record_Losses": int(record_match.group(2)),
            "Record_Draws": int(record_match.group(3)),
        })
    method_map = {"ko tko": "KO_TKO_Wins", "sub": "Submission_Wins", "dec": "Decision_Wins"}
    for group in soup.select(".c-stat-3bar__group"):
        label = group.select_one(".c-stat-3bar__label")
        value = group.select_one(".c-stat-3bar__value")
        field = method_map.get(normalize_name(label.get_text(" ", strip=True) if label else ""))
        parsed = _integer(value.get_text(" ", strip=True) if value else "")
        if field and parsed is not None:
            profile[field] = parsed
    for field in soup.select(".c-bio__field"):
        label = field.select_one(".c-bio__label")
        value = field.select_one(".c-bio__text")
        if normalize_name(label.get_text(" ", strip=True) if label else "") == "fighting style" and value:
            profile["style"] = value.get_text(" ", strip=True)
    performance_map = {
        "sig str landed": "SigStrLandedPerMin",
        "sig str absorbed": "SigStrAbsorbedPerMin",
        "takedown avg": "TakedownAvgPer15",
        "submission avg": "SubmissionAvgPer15",
        "sig str defense": "SigStrikeDefensePct",
        "takedown defense": "TakedownDefensePct",
        "knockdown avg": "KnockdownAvgPer15",
    }
    for group in soup.select(".c-stat-compare__group"):
        label_node = group.select_one(".c-stat-compare__label")
        value_node = group.select_one(".c-stat-compare__number")
        label = normalize_name(label_node.get_text(" ", strip=True) if label_node else "")
        raw_value = value_node.get_text(" ", strip=True) if value_node else ""
        if label == "average fight time":
            time_match = re.fullmatch(r"\s*(\d+):(\d{2})\s*", raw_value)
            if time_match:
                profile["AverageFightTimeSeconds"] = (
                    int(time_match.group(1)) * 60 + int(time_match.group(2))
                )
            continue
        field_name = performance_map.get(label)
        parsed_value = _decimal(raw_value)
        if field_name and parsed_value is not None:
            profile[field_name] = parsed_value
    totals: Dict[str, int] = {}
    for group in soup.select(".c-overlap__stats"):
        label_node = group.select_one(".c-overlap__stats-text")
        value_node = group.select_one(".c-overlap__stats-value")
        label = normalize_name(label_node.get_text(" ", strip=True) if label_node else "")
        parsed_value = _integer(value_node.get_text(" ", strip=True) if value_node else "")
        if label and parsed_value is not None:
            totals[label] = parsed_value
    accuracy_pairs = (
        ("sig strikes landed", "sig strikes attempted", "SigStrikeAccuracyPct"),
        ("takedowns landed", "takedowns attempted", "TakedownAccuracyPct"),
    )
    for landed_key, attempted_key, field_name in accuracy_pairs:
        landed = totals.get(landed_key)
        attempted = totals.get(attempted_key)
        if landed is not None and attempted:
            profile[field_name] = round(100 * landed / attempted)
    image = soup.find("meta", attrs={"property": "og:image"})
    profile["ImageURL"] = image.get("content", "") if image else ""
    tags = [node.get_text(" ", strip=True) for node in soup.select(".hero-profile__tag")]
    profile["Rank"] = "0" if any(normalize_name(tag) == "title holder" for tag in tags) else ""
    if not profile["Rank"]:
        for tag in tags:
            rank = re.match(r"#\s*(\d+)", tag)
            if rank:
                profile["Rank"] = rank.group(1)
                break
    return profile


def fetch_ufc_profile(
    fighter_name: str,
    candidate_urls: List[str],
    expected_wins: Optional[int],
    expected_losses: Optional[int],
    timeout: float,
    session: Optional[requests.Session] = None,
    limiter: Optional[RateLimiter] = None,
) -> Tuple[Dict[str, object], Dict[str, object]]:
    session = session or build_session()
    limiter = limiter or RateLimiter()
    tested = []
    for url in candidate_urls:
        try:
            response = limiter.get(session, url, timeout)
        except requests.RequestException as error:
            tested.append({"url": url, "error": str(error)})
            continue
        profile = parse_ufc_profile(response.text, response.url) if response.status_code == 200 else {}
        identity_ok = name_score(fighter_name, str(profile.get("name", ""))) >= 82
        record_ok = (
            expected_wins is None or expected_losses is None
            or (profile.get("Record_Wins") == int(expected_wins) and profile.get("Record_Losses") == int(expected_losses))
        )
        tested.append({"url": url, "http_status": response.status_code, "identity_ok": identity_ok, "record_ok": record_ok})
        if profile and "/search?" not in response.url and identity_ok and record_ok:
            return profile, {"status": "success", "candidates_tested": tested}
    return {}, {"status": "not_found", "candidates_tested": tested}


def parse_wikipedia_profile(html: str) -> Dict[str, object]:
    soup = BeautifulSoup(html, "html.parser")
    profile: Dict[str, object] = {}
    active_record = ""
    section = ""
    for row in soup.select("table.infobox tr"):
        header = row.find("th")
        data = row.find("td")
        label = normalize_name(header.get_text(" ", strip=True) if header else "")
        value_text = data.get_text(" ", strip=True) if data else ""
        if "mixed martial arts record" in label:
            active_record, section = "mma", ""
            continue
        if "boxing record" in label or label == "amateur record":
            active_record, section = "other", ""
            continue
        if active_record != "mma":
            continue
        if label in {"wins", "losses"}:
            section = label.title()
            total = _integer(value_text)
            if total is not None:
                profile[f"Record_{section}"] = total
            continue
        method = {"by knockout": "KO_TKO", "by submission": "Submission", "by decision": "Decision"}.get(label)
        value = _integer(value_text)
        if method and section and value is not None:
            profile[f"{method}_{section}"] = value
    return profile


def fetch_wikipedia_profile(
    fighter_name: str,
    expected_wins: Optional[int],
    expected_losses: Optional[int],
    timeout: float,
    session: Optional[requests.Session] = None,
) -> Tuple[Dict[str, object], Dict[str, object]]:
    session = session or build_session()
    response = session.get(WIKIPEDIA_API_URL, params={
        "action": "query", "list": "search", "srsearch": f'"{fighter_name}" mixed martial artist',
        "format": "json", "srlimit": 8,
    }, timeout=timeout)
    response.raise_for_status()
    tested = []
    for result in response.json().get("query", {}).get("search", []):
        title = str(result.get("title", "")).strip()
        if name_score(fighter_name, title) < 82:
            tested.append({"title": title, "identity_ok": False})
            continue
        page = session.get(WIKIPEDIA_API_URL, params={
            "action": "parse", "page": title, "prop": "text", "format": "json", "redirects": "1",
        }, timeout=timeout)
        page.raise_for_status()
        profile = parse_wikipedia_profile(page.json().get("parse", {}).get("text", {}).get("*", ""))
        record_ok = (
            expected_wins is not None and expected_losses is not None
            and profile.get("Record_Wins") == int(expected_wins)
            and profile.get("Record_Losses") == int(expected_losses)
        )
        tested.append({"title": title, "identity_ok": True, "record_ok": record_ok})
        if record_ok:
            profile["WikipediaTitle"] = title
            return profile, {"status": "success", "title": title, "candidates_tested": tested}
    return {}, {"status": "not_found", "candidates_tested": tested}


def merge_profiles(sources: List[Tuple[str, Dict[str, object]]], expected_wins: Optional[int], expected_losses: Optional[int]):
    merged: Dict[str, object] = {}
    field_sources: Dict[str, str] = {}
    for source_name, profile in sources:
        for field in PROFILE_FIELDS:
            if field not in merged and profile.get(field) not in {None, ""}:
                merged[field] = str(profile[field])
                field_sources[field] = source_name
    if expected_wins == 0:
        for field in ("KO_TKO_Wins", "Submission_Wins", "Decision_Wins"):
            merged.setdefault(field, "0")
            field_sources.setdefault(field, "record-zero")
    if expected_losses == 0:
        for field in ("KO_TKO_Losses", "Submission_Losses", "Decision_Losses"):
            merged.setdefault(field, "0")
            field_sources.setdefault(field, "record-zero")
    return merged, field_sources


def scrape_fighter_sources(
    fighter_name: str,
    expected_wins: Optional[int],
    expected_losses: Optional[int],
    ufc_candidate_urls: Optional[List[str]] = None,
    timeout: float = 20.0,
    sherdog_session: Optional[requests.Session] = None,
    ufc_session: Optional[requests.Session] = None,
    sherdog_limiter: Optional[RateLimiter] = None,
    ufc_limiter: Optional[RateLimiter] = None,
    on_progress=None,
) -> Dict[str, object]:
    def notify(source: str, status: str) -> None:
        if callable(on_progress):
            on_progress(source, status)

    errors = []
    notify("sherdog", "starting")
    try:
        sherdog, sherdog_diagnostics = fetch_sherdog_profile(
            fighter_name, expected_wins, expected_losses, timeout,
            session=sherdog_session, limiter=sherdog_limiter,
        )
    except Exception as error:
        sherdog, sherdog_diagnostics = {}, {"status": "failed", "error": str(error)}
        errors.append(f"Sherdog: {error}")
    notify("sherdog", "complete" if sherdog else "unavailable")
    notify("ufc.com", "starting")
    try:
        ufc, ufc_diagnostics = fetch_ufc_profile(
            fighter_name, list(ufc_candidate_urls or []), expected_wins, expected_losses,
            timeout, session=ufc_session, limiter=ufc_limiter,
        )
    except Exception as error:
        ufc, ufc_diagnostics = {}, {"status": "failed", "error": str(error)}
        errors.append(f"UFC.com: {error}")
    notify("ufc.com", "complete" if ufc else "unavailable")
    preliminary, _ = merge_profiles([("sherdog", sherdog), ("ufc.com", ufc)], expected_wins, expected_losses)
    wikipedia = {}
    wikipedia_diagnostics = {"status": "not_needed"}
    if any(field not in preliminary for field in METHOD_FIELDS):
        notify("wikipedia", "starting")
        try:
            wikipedia, wikipedia_diagnostics = fetch_wikipedia_profile(
                fighter_name, expected_wins, expected_losses, timeout,
            )
        except Exception as error:
            wikipedia_diagnostics = {"status": "failed", "error": str(error)}
            errors.append(f"Wikipedia: {error}")
        notify("wikipedia", "complete" if wikipedia else "unavailable")
    else:
        notify("wikipedia", "not_needed")
    merged, field_sources = merge_profiles(
        [("sherdog", sherdog), ("ufc.com", ufc), ("wikipedia", wikipedia)],
        expected_wins, expected_losses,
    )
    used_sources = []
    for source in ("sherdog", "ufc.com", "wikipedia"):
        if source in field_sources.values():
            used_sources.append(source)
    source = "_".join(item.replace(".", "") for item in used_sources) or "none"
    fields_found = [field for field in PROFILE_FIELDS if merged.get(field) not in {None, ""}]
    return {
        "source": source,
        "profile": merged,
        "ufc_profile": ufc,
        "sherdog_fighter_url": sherdog.get("SherdogFighterURL"),
        "wikipedia_title": wikipedia.get("WikipediaTitle"),
        "field_sources": field_sources,
        "diagnostics": {
            "status": "complete" if all(field in fields_found for field in METHOD_FIELDS) else "partial",
            "fields_found": fields_found,
            "fields_missing": [field for field in PROFILE_FIELDS if field not in fields_found],
            "sources": {"sherdog": sherdog_diagnostics, "ufc.com": ufc_diagnostics, "wikipedia": wikipedia_diagnostics},
            "errors": errors,
            "warnings": [],
        },
    }
