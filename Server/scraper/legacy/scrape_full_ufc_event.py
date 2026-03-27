import requests
import csv
import json
from bs4 import BeautifulSoup
import time
import datetime
import os
import re
import sys
import unicodedata

USER_AGENT = {"User-Agent": "Mozilla/5.0"}
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SCRAPER_ROOT = os.path.dirname(SCRIPT_DIR)
DEFAULT_OUTPUT_DIR = os.path.join(SCRAPER_ROOT, "fight_cards")

def fetch_event_json(url: str):
    """
    Fetch the event JSON, falling back to the primary API domain if the CloudFront
    CDN domain cannot be resolved. Exits the script if both attempts fail.
    """
    try:
        res = requests.get(url, headers=USER_AGENT, timeout=10)
        res.raise_for_status()
        return res.json()
    except requests.exceptions.RequestException:
        # Swap to the primary UFC API domain
        fallback_url = url.replace("d29dxerjsp82wz.cloudfront.net", "live-api.ufc.com")
        try:
            res = requests.get(fallback_url, headers=USER_AGENT, timeout=10)
            res.raise_for_status()
            return res.json()
        except requests.exceptions.RequestException as e:
            print(f"❌ Unable to fetch event JSON from either domain:\n{e}")
            sys.exit(1)

def get_fighter_image(profile_url):
    if not profile_url:
        return None

    # Some event JSON links use the Spanish domain, which occasionally fails DNS look‑ups.
    # Fall back to the main UFC domain before making the request.
    profile_url = profile_url.replace("www.ufcespanol.com", "www.ufc.com")

    try:
        # A short timeout prevents the script from hanging if the site is unreachable.
        res = requests.get(profile_url, headers=USER_AGENT, timeout=10)
        res.raise_for_status()
    except requests.exceptions.RequestException:
        # Network/DNS error or non‑200 response – just skip the image.
        return None

    soup = BeautifulSoup(res.text, "html.parser")
    og_image = soup.find("meta", property="og:image")
    if og_image:
        return og_image["content"]
    return None


def normalize_name(value):
    if not value:
        return ""

    normalized = unicodedata.normalize("NFKD", value)
    normalized = normalized.replace("’", "'").replace("`", "'")
    normalized = normalized.encode("ascii", "ignore").decode("ascii")
    normalized = re.sub(r"[^a-z0-9]+", " ", normalized.lower())
    return re.sub(r"\s+", " ", normalized).strip()


def fighter_full_name(fighter):
    name_info = fighter.get("Name", {})
    return " ".join(
        part for part in [name_info.get("FirstName", ""), name_info.get("LastName", "")]
        if part
    ).strip()


def slugify(value):
    return normalize_name(value).replace(" ", "-").strip("-")


def parse_start_time(value):
    if not value:
        return None

    try:
        return datetime.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def build_event_page_candidates(event):
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


def fetch_event_page_html(url):
    response = requests.get(url, headers=USER_AGENT, timeout=10)
    response.raise_for_status()
    return response.text


def extract_american_odds(text):
    cleaned = text.replace("−", "-")
    matches = re.findall(r"(?<!\d)[+-]\d{3,4}(?!\d)", cleaned)
    return [str(int(match)) for match in matches]


def best_fight_block(soup, fighter_a, fighter_b):
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


def extract_event_page_odds(html, fights):
    soup = BeautifulSoup(html, "html.parser")
    odds_by_name = {}

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


def fetch_odds_map(event):
    for candidate_url in build_event_page_candidates(event):
        try:
            html = fetch_event_page_html(candidate_url)
        except requests.exceptions.RequestException:
            continue

        odds_map = extract_event_page_odds(html, event.get("FightCard", []))
        if odds_map:
            print(f"✅ Pulled odds from event page: {candidate_url}")
            return odds_map

    print("⚠️ No odds found on any event page candidate URL.")
    return {}

# Get the JSON data (update the URL as needed)
event_url = "https://d29dxerjsp82wz.cloudfront.net/api/v3/event/live/1301.json"
data = fetch_event_json(event_url)

event = data["LiveEventDetail"]
odds_map = fetch_odds_map(event)

# Create a dynamic filename using EventId and start date
event_id = event.get("EventId")
start_time = event.get("StartTime")
date_str = start_time.split("T")[0] if start_time else datetime.date.today().isoformat()
output_dir = DEFAULT_OUTPUT_DIR
os.makedirs(output_dir, exist_ok=True)
filename = os.path.join(output_dir, f"ufc_event_{event_id}_{date_str}.csv")

# Define CSV column headers; these roughly correspond to our SQL table from earlier.
csv_headers = [
    "id",                       # Placeholder id (left blank; not available in scrape)
    # Event-level details:
    "Event",                    # LiveEventDetail.Name
    "EventId",                  # LiveEventDetail.EventId
    "StartTime",                # LiveEventDetail.StartTime
    "TimeZone",                 # LiveEventDetail.TimeZone
    "EventStatus",              # LiveEventDetail.Status
    # Removed LiveEventId, LiveFightId, LiveRoundNumber, LiveRoundElapsedTime
    "OrganizationId",           # LiveEventDetail.Organization.OrganizationId
    "OrganizationName",         # LiveEventDetail.Organization.Name
    # Location details:
    "Venue",                    # LiveEventDetail.Location.Venue
    "VenueId",                  # LiveEventDetail.Location.VenueId
    "Location_City",            # LiveEventDetail.Location.City
    "Location_State",           # LiveEventDetail.Location.State
    "Location_Country",         # LiveEventDetail.Location.Country
    "TriCode",                  # LiveEventDetail.Location.TriCode
    # Fight-level details:
    "FightId",                  # FightCard.FightId
    "FightOrder",               # FightCard.FightOrder
    "FightStatus",              # FightCard.Status
    "CardSegment",              # FightCard.CardSegment
    "CardSegmentStartTime",     # FightCard.CardSegmentStartTime
    "CardSegmentBroadcaster",   # FightCard.CardSegmentBroadcaster
    # Fighter-level details:
    "FighterId",                # Fighter.FighterId
    "MMAId",                    # Fighter.MMAId
    "Corner",                   # Fighter.Corner
    "FirstName",                # Fighter.Name.FirstName
    "LastName",                 # Fighter.Name.LastName
    "Nickname",                 # Fighter.Name.NickName
    "DOB",                      # Fighter.DOB
    "Age",                      # Fighter.Age
    "Stance",                   # Fighter.Stance
    "Weight_lbs",               # Fighter.Weight
    "Height_in",                # Fighter.Height
    "Reach_in",                 # Fighter.Reach
    "UFC_Profile",              # Fighter.UFCLink
    "FighterWeightClass",       # Derived from Fighter.WeightClasses[0].Description
    "Record_Wins",              # Fighter.Record.Wins
    "Record_Losses",            # Fighter.Record.Losses
    "Record_Draws",             # Fighter.Record.Draws
    "Record_NoContests",        # Fighter.Record.NoContests
    "Born_City",                # Fighter.Born.City
    "Born_State",               # Fighter.Born.State
    "Born_Country",             # Fighter.Born.Country
    "FightingOutOf_City",       # Fighter.FightingOutOf.City
    "FightingOutOf_State",      # Fighter.FightingOutOf.State
    "FightingOutOf_Country",    # Fighter.FightingOutOf.Country
    "ImageURL",                 # Scraped fighter image URL
    "Rank",                     # Placeholder rank (left blank; not available in scrape)
    "odds",                     # Event-page odds when available
    "Streak",                   # Placeholder streak (left blank; not available in scrape)
    "style",                    # Placeholder style (left blank; not available in scrape)
    # Removed KOOfTheNight, SubmissionOfTheNight, PerformanceOfTheNight
    # Fight result details (from FightCard.Result) – same for all fighters in the fight:
    # Removed Fight_Result_Method, Fight_Result_EndingRound, Fight_Result_EndingTime, Fight_Result_EndingStrike, Fight_Result_EndingTarget, Fight_Result_EndingPosition, Fight_Result_EndingSubmission, Fight_Result_EndingNotes, FightOfTheNight
]

with open(filename, mode="w", newline="") as file:
    writer = csv.DictWriter(file, fieldnames=csv_headers)
    writer.writeheader()

    # Extract event-level constant fields:
    event_name = event.get("Name")
    event_id = event.get("EventId")
    start_time = event.get("StartTime")
    time_zone = event.get("TimeZone")
    event_status = event.get("Status")
    live_event_id = event.get("LiveEventId")
    live_fight_id = event.get("LiveFightId")
    live_round_number = event.get("LiveRoundNumber")
    live_round_elapsed = event.get("LiveRoundElapsedTime")
    organization = event.get("Organization", {})
    organization_id = organization.get("OrganizationId")
    organization_name = organization.get("Name")
    loc = event.get("Location", {})
    venue = loc.get("Venue")
    venue_id = loc.get("VenueId")
    loc_city = loc.get("City")
    loc_state = loc.get("State")
    loc_country = loc.get("Country")
    tri_code = loc.get("TriCode")

    # Iterate through each fight in the FightCard array:
    for fight in event.get("FightCard", []):
        fight_id = fight.get("FightId")
        fight_order = fight.get("FightOrder")
        fight_status = fight.get("Status")
        card_segment = fight.get("CardSegment")
        card_segment_start = fight.get("CardSegmentStartTime")
        card_segment_broadcaster = fight.get("CardSegmentBroadcaster")

        # Get fight result details (if provided)
        result = fight.get("Result", {})
        fight_result_method = result.get("Method")
        fight_result_ending_round = result.get("EndingRound")
        fight_result_ending_time = result.get("EndingTime")
        fight_result_ending_strike = result.get("EndingStrike")
        fight_result_ending_target = result.get("EndingTarget")
        fight_result_ending_position = result.get("EndingPosition")
        fight_result_ending_submission = result.get("EndingSubmission")
        fight_result_ending_notes = result.get("EndingNotes")
        fight_of_the_night = result.get("FightOfTheNight")

        # For each fighter in this fight:
        for fighter in fight.get("Fighters", []):
            name_info = fighter.get("Name", {})
            record = fighter.get("Record", {})
            born = fighter.get("Born", {})
            fighting_out = fighter.get("FightingOutOf", {})
            weight_classes = fighter.get("WeightClasses", [])

            ufc_link = fighter.get("UFCLink")
            image_url = get_fighter_image(ufc_link) if ufc_link else None

            row = {
                "id": "",
                # Event-level fields
                "Event": event_name,
                "EventId": event_id,
                "StartTime": start_time,
                "TimeZone": time_zone,
                "EventStatus": event_status,
                # Removed LiveEventId, LiveFightId, LiveRoundNumber, LiveRoundElapsedTime
                "OrganizationId": organization_id,
                "OrganizationName": organization_name,
                "Venue": venue,
                "VenueId": venue_id,
                "Location_City": loc_city,
                "Location_State": loc_state,
                "Location_Country": loc_country,
                "TriCode": tri_code,
                # Fight-level fields
                "FightId": fight_id,
                "FightOrder": fight_order,
                "FightStatus": fight_status,
                "CardSegment": card_segment,
                "CardSegmentStartTime": card_segment_start,
                "CardSegmentBroadcaster": card_segment_broadcaster,
                # Fighter-level fields
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
                "ImageURL": image_url,
                "Rank": "",
                "odds": odds_map.get(normalize_name(fighter_full_name(fighter)), ""),
                "Streak": "",
                "style": "",
                # Removed KOOfTheNight, SubmissionOfTheNight, PerformanceOfTheNight
                # Removed Fight result fields
            }
            
            # Pause briefly between fighter profile image requests
            time.sleep(1)
            writer.writerow(row)

print(f"\n✅ Exported full fight card to {filename}")
