#!/usr/bin/env python3
import argparse
import json
import re
import sys
from typing import Dict, List, Optional

import requests
from bs4 import BeautifulSoup

from scrape_full_ufc_event_with_tapology import (
    DEFAULT_HEADERS,
    build_tapology_session,
    fetch_tapology_fighter_html,
    normalize_name,
    parse_tapology_fighter_profile,
)

WIKIPEDIA_API_URL = "https://en.wikipedia.org/w/api.php"
METHOD_FIELDS = [
    "KO_TKO_Wins",
    "KO_TKO_Losses",
    "Submission_Wins",
    "Submission_Losses",
    "Decision_Wins",
    "Decision_Losses",
]
PROFILE_FIELDS = ["Streak", "style", *METHOD_FIELDS]


class FighterProfileScrapeError(RuntimeError):
    def __init__(self, message: str, diagnostics: Dict[str, object]):
        super().__init__(message)
        self.diagnostics = diagnostics


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Scrape one Tapology fighter profile and print parsed stats as JSON."
    )
    parser.add_argument("url", help="Tapology fighter profile URL.")
    parser.add_argument(
        "--timeout",
        type=float,
        default=20.0,
        help="HTTP timeout in seconds.",
    )
    parser.add_argument("--fighter-name", default="", help="Expected fighter name.")
    parser.add_argument("--record-wins", type=int, default=None, help="Expected UFC API win total.")
    parser.add_argument("--record-losses", type=int, default=None, help="Expected UFC API loss total.")
    return parser.parse_args()


def search_wikipedia_title(fighter_name: str, timeout: float) -> str:
    if not fighter_name:
        return ""

    response = requests.get(
        WIKIPEDIA_API_URL,
        params={
            "action": "query",
            "list": "search",
            "srsearch": f'{fighter_name} mixed martial artist',
            "format": "json",
            "srlimit": 5,
        },
        headers={
            **DEFAULT_HEADERS,
            "User-Agent": "FightPickerStatsBot/1.0 (small personal project)",
        },
        timeout=timeout,
    )
    response.raise_for_status()
    results = response.json().get("query", {}).get("search", [])
    expected = normalize_name(fighter_name)

    for result in results:
        title = str(result.get("title", "")).strip()
        normalized_title = normalize_name(title)
        snippet = re.sub(r"<[^>]+>", " ", str(result.get("snippet", ""))).lower()
        if normalized_title == expected or expected in normalized_title or normalized_title in expected:
            return title
        if "mixed martial" in snippet or "ufc" in snippet:
            return title

    return str(results[0].get("title", "")).strip() if results else ""


def fetch_wikipedia_html(title: str, timeout: float) -> str:
    response = requests.get(
        WIKIPEDIA_API_URL,
        params={
            "action": "parse",
            "page": title,
            "prop": "text",
            "format": "json",
            "redirects": "1",
        },
        headers={
            **DEFAULT_HEADERS,
            "User-Agent": "FightPickerStatsBot/1.0 (small personal project)",
        },
        timeout=timeout,
    )
    response.raise_for_status()
    payload = response.json()
    if "error" in payload:
        raise RuntimeError(payload["error"].get("info", "Wikipedia page fetch failed."))
    return payload.get("parse", {}).get("text", {}).get("*", "")


def clean_label(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip().lower()


def parse_record_number(text: str) -> Optional[str]:
    match = re.search(r"\d+", text or "")
    return match.group(0) if match else None


def parse_wikipedia_profile(html: str) -> Dict[str, str]:
    soup = BeautifulSoup(html, "html.parser")
    profile: Dict[str, str] = {}
    rows = soup.select("table.infobox tr")
    active_record = ""
    section = ""
    for row in rows:
        header = row.find("th")
        data = row.find("td")
        header_text = clean_label(header.get_text(" ", strip=True)) if header else ""
        data_text = data.get_text(" ", strip=True) if data else ""

        if "mixed martial arts record" in header_text:
            active_record = "mma"
            section = ""
            continue
        if "professional boxing record" in header_text or header_text == "amateur record":
            active_record = "other"
            section = ""
            continue

        if active_record != "mma":
            continue

        if header_text in {"wins", "losses"}:
            section = header_text
            continue

        if not data_text:
            continue

        field = None
        if section == "wins":
            if header_text == "by knockout":
                field = "KO_TKO_Wins"
            elif header_text == "by submission":
                field = "Submission_Wins"
            elif header_text == "by decision":
                field = "Decision_Wins"
        elif section == "losses":
            if header_text == "by knockout":
                field = "KO_TKO_Losses"
            elif header_text == "by submission":
                field = "Submission_Losses"
            elif header_text == "by decision":
                field = "Decision_Losses"

        if field:
            value = parse_record_number(data_text)
            if value is not None:
                profile[field] = value

    return profile


def method_total(profile: Dict[str, str], fields) -> Optional[int]:
    values = []
    for field in fields:
        value = profile.get(field, "")
        if not re.fullmatch(r"\d+", str(value)):
            return None
        values.append(int(value))
    return sum(values)


def has_complete_method_breakdown(profile: Dict[str, str]) -> bool:
    return all(re.fullmatch(r"\d+", str(profile.get(field, ""))) for field in METHOD_FIELDS)


def merge_profiles(primary: Dict[str, str], fallback: Dict[str, str]) -> Dict[str, str]:
    merged = dict(fallback or {})
    for field, value in (primary or {}).items():
        if value not in {None, ""}:
            merged[field] = value
    return merged


def build_scrape_diagnostics(
    profile: Dict[str, str],
    source: str,
    tapology_fetch_status: str,
    tapology_error: str = "",
    fallback_error: str = "",
    warnings: Optional[List[str]] = None,
) -> Dict[str, object]:
    fields_found = [field for field in PROFILE_FIELDS if profile.get(field) not in {None, ""}]
    fields_missing = [field for field in PROFILE_FIELDS if field not in fields_found]
    diagnostic_warnings = list(warnings or [])

    if source == "tapology_wikipedia_merged":
        diagnostic_warnings.append(
            "Tapology returned partial data; Wikipedia supplied missing method totals."
        )
    elif source == "tapology_partial_profile":
        diagnostic_warnings.append(
            "Tapology returned partial data and the Wikipedia fallback also failed."
        )

    if "Streak" in fields_found:
        streak_detail = f"Parsed streak value {profile['Streak']} from Tapology."
    elif tapology_fetch_status == "failed":
        streak_detail = (
            "Streak is missing because Tapology could not be fetched; "
            "Wikipedia does not expose current MMA streak."
        )
    else:
        streak_detail = "Tapology did not expose a recognized Current MMA Streak value."

    return {
        "status": "complete" if not fields_missing else "partial",
        "source": source,
        "tapology_fetch_status": tapology_fetch_status,
        "tapology_error": tapology_error or None,
        "fallback_error": fallback_error or None,
        "fields_found": fields_found,
        "fields_missing": fields_missing,
        "streak_detail": streak_detail,
        "warnings": diagnostic_warnings,
    }


def validate_wikipedia_profile(
    profile: Dict[str, str],
    expected_wins: Optional[int],
    expected_losses: Optional[int],
) -> List[str]:
    required_fields = [
        "KO_TKO_Wins",
        "KO_TKO_Losses",
        "Submission_Wins",
        "Submission_Losses",
        "Decision_Wins",
        "Decision_Losses",
    ]
    if not any(profile.get(field) not in {None, ""} for field in required_fields):
        raise RuntimeError("Wikipedia fallback did not expose a method breakdown.")

    for field in required_fields:
        if profile.get(field) in {None, ""}:
            profile[field] = "0"

    win_total = method_total(profile, ["KO_TKO_Wins", "Submission_Wins", "Decision_Wins"])
    loss_total = method_total(profile, ["KO_TKO_Losses", "Submission_Losses", "Decision_Losses"])
    warnings: List[str] = []
    if expected_wins is not None and win_total != expected_wins:
        if win_total is not None and abs(win_total - expected_wins) <= 1:
            warnings.append(
                f"Wikipedia method wins total {win_total} differs from UFC API wins {expected_wins}."
            )
        else:
            raise RuntimeError(
                f"Wikipedia fallback rejected: method wins total {win_total} "
                f"does not match UFC API wins {expected_wins}."
            )
    if expected_losses is not None and loss_total != expected_losses:
        if loss_total is not None and abs(loss_total - expected_losses) <= 1:
            warnings.append(
                f"Wikipedia method losses total {loss_total} differs from UFC API losses {expected_losses}."
            )
        else:
            raise RuntimeError(
                f"Wikipedia fallback rejected: method losses total {loss_total} "
                f"does not match UFC API losses {expected_losses}."
            )

    return warnings


def fetch_wikipedia_fallback(args: argparse.Namespace) -> Dict[str, str]:
    title = search_wikipedia_title(args.fighter_name, args.timeout)
    if not title:
        raise RuntimeError("Wikipedia fallback could not find a fighter page.")

    html = fetch_wikipedia_html(title, args.timeout)
    profile = parse_wikipedia_profile(html)
    validation_warnings = validate_wikipedia_profile(profile, args.record_wins, args.record_losses)
    profile["TapologyMatchConfidence"] = "wikipedia-record-breakdown"
    return {
        "source": "wikipedia_record_breakdown",
        "wikipedia_title": title,
        "validation_warnings": validation_warnings,
        "profile": profile,
    }


def main() -> None:
    args = parse_args()
    tapology_error = ""
    tapology_profile: Dict[str, str] = {}
    tapology_fetch_status = "failed"
    try:
        with build_tapology_session() as tapology_session:
            html = fetch_tapology_fighter_html(
                tapology_session=tapology_session,
                tapology_fighter_url=args.url,
                timeout=args.timeout,
            )

        tapology_profile = parse_tapology_fighter_profile(html)
        tapology_fetch_status = "success"
        if not has_complete_method_breakdown(tapology_profile):
            tapology_error = "Tapology profile did not expose a complete method breakdown."
        else:
            print(json.dumps({
                "source": "tapology_single_profile",
                "tapology_fighter_url": args.url,
                "profile": tapology_profile,
                "diagnostics": build_scrape_diagnostics(
                    tapology_profile,
                    "tapology_single_profile",
                    tapology_fetch_status,
                ),
            }))
            return
    except Exception as error:
        tapology_error = str(error)

    try:
        fallback = fetch_wikipedia_fallback(args)
        source = "tapology_wikipedia_merged" if tapology_profile else fallback["source"]
        profile = merge_profiles(tapology_profile, fallback["profile"])
        print(json.dumps({
            **fallback,
            "source": source,
            "profile": profile,
            "tapology_fighter_url": args.url,
            "tapology_error": tapology_error,
            "diagnostics": build_scrape_diagnostics(
                profile,
                source,
                tapology_fetch_status,
                tapology_error=tapology_error,
                warnings=fallback.get("validation_warnings", []),
            ),
        }))
    except Exception as fallback_exception:
        fallback_error = str(fallback_exception)
        if tapology_profile:
            source = "tapology_partial_profile"
            print(json.dumps({
                "source": source,
                "tapology_fighter_url": args.url,
                "tapology_error": tapology_error,
                "profile": tapology_profile,
                "diagnostics": build_scrape_diagnostics(
                    tapology_profile,
                    source,
                    tapology_fetch_status,
                    tapology_error=tapology_error,
                    fallback_error=fallback_error,
                ),
            }))
            return
        diagnostics = build_scrape_diagnostics(
            {},
            "none",
            tapology_fetch_status,
            tapology_error=tapology_error,
            fallback_error=fallback_error,
        )
        diagnostics["status"] = "failed"
        raise FighterProfileScrapeError(
            f"Tapology failed: {tapology_error}; Wikipedia fallback failed: {fallback_error}",
            diagnostics,
        ) from fallback_exception


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        payload = {"error": str(error)}
        if isinstance(error, FighterProfileScrapeError):
            payload["diagnostics"] = error.diagnostics
        print(json.dumps(payload), file=sys.stderr)
        sys.exit(1)
