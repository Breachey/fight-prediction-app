import csv
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import requests

import fighter_profile_sources as sources
import scrape_full_ufc_event_with_tapology as scraper


PHOTO = "https://ufc.com/images/2025-03/PULYAEV_ANDREY_03-22.png"
SILHOUETTE = "https://ufc.com/images/2019-04/SILHOUETTE.png?VersionId=placeholder"


def profile_response(name="Andrey Pulyaev", record="10-3-0", image=PHOTO, url=None):
    response = requests.Response()
    response.status_code = 200
    response.url = url or "https://www.ufc.com/athlete/andrey-pulyaev"
    response._content = f'''
        <meta property="og:image" content="{image}">
        <h1 class="hero-profile__name">{name}</h1>
        <div class="hero-profile__division-body">{record}</div>
        <div class="hero-profile__tag">#3</div>
        <div class="c-stat-3bar__group"><span class="c-stat-3bar__label">KO/TKO</span>
        <span class="c-stat-3bar__value">6</span></div>
    '''.encode()
    return response


def event_fixture():
    return {"EventId": 1338, "Name": "UFC Test", "FightCard": [{
        "FightId": 13075,
        "Fighters": [{
            "FighterId": 4195, "Corner": "Red",
            "Name": {"FirstName": "Andrey", "LastName": "Pulyaev"},
            "UFCLink": "https://www.ufc.com/athlete/andrey-pulyaev",
            "Record": {"Wins": 10, "Losses": 5},
        }, {
            "FighterId": 4668, "Corner": "Blue",
            "Name": {"FirstName": "Lucas", "LastName": "Armand"},
            "Record": {"Wins": 6, "Losses": 0},
        }],
    }]}


class FighterImageTests(unittest.TestCase):
    def test_record_mismatch_accepts_photo_but_never_statistics_or_rank(self):
        limiter = mock.Mock()
        limiter.get.return_value = profile_response()
        profile, diagnostics = sources.fetch_ufc_profile(
            "Andrey Pulyaev", ["https://www.ufc.com/athlete/andrey-pulyaev"],
            10, 5, 3, limiter=limiter,
        )
        self.assertEqual(profile["ImageURL"], PHOTO)
        self.assertEqual(diagnostics["status"], "image-only")
        self.assertFalse(diagnostics["candidates_tested"][0]["record_ok"])
        self.assertNotIn("Record_Losses", profile)
        self.assertNotIn("Rank", profile)
        self.assertNotIn("KO_TKO_Wins", profile)
        merged, provenance = sources.merge_profiles([("ufc.com", profile)], 10, 5)
        self.assertEqual(merged, {})
        self.assertEqual(provenance, {})

    def test_image_only_candidate_does_not_hide_later_valid_statistics(self):
        limiter = mock.Mock()
        limiter.get.side_effect = [profile_response(), profile_response(record="10-5-0")]
        profile, diagnostics = sources.fetch_ufc_profile(
            "Andrey Pulyaev", ["https://www.ufc.com/first", "https://www.ufc.com/second"],
            10, 5, 3, limiter=limiter,
        )
        self.assertEqual(diagnostics["status"], "success")
        self.assertEqual(profile["Record_Losses"], 5)
        self.assertEqual(profile["ImageURL"], PHOTO)
        self.assertEqual(limiter.get.call_count, 2)

    def test_wrong_identity_and_search_redirect_cannot_supply_photos(self):
        for candidate in [profile_response(name="Another Fighter"),
                          profile_response(url="https://www.ufc.com/search?query=andrey")]:
            with self.subTest(url=candidate.url, html=candidate.text):
                limiter = mock.Mock()
                limiter.get.return_value = candidate
                profile, diagnostics = sources.fetch_ufc_profile(
                    "Andrey Pulyaev", [candidate.url], 10, 5, 3, limiter=limiter,
                )
                self.assertEqual(profile, {})
                self.assertEqual(diagnostics["status"], "not_found")

    def test_new_fighter_silhouettes_are_kept_without_accepting_empty_statistics(self):
        for name, wins, losses in [("Lucas Armand", 6, 0), ("Roberto Soldic", 21, 4)]:
            with self.subTest(fighter=name):
                limiter = mock.Mock()
                limiter.get.return_value = profile_response(name, "0-0-0", SILHOUETTE)
                profile, _ = sources.fetch_ufc_profile(name, ["https://www.ufc.com/profile"],
                                                      wins, losses, 3, limiter=limiter)
                self.assertEqual(profile["ImageURL"], SILHOUETTE)
                self.assertNotIn("Record_Wins", profile)

    def test_image_extraction_falls_back_without_using_opponent_photos(self):
        html = f'<meta property="og:image" content="{SILHOUETTE}">'
        self.assertEqual(sources.extract_ufc_fighter_image(
            html + f'<meta name="twitter:image" content="{PHOTO}">'), PHOTO)
        self.assertEqual(sources.extract_ufc_fighter_image(
            html + '<img class="hero-profile__image" src="/images/real.png">',
            "https://www.ufc.com/athlete/test"), "https://www.ufc.com/images/real.png")
        self.assertEqual(sources.extract_ufc_fighter_image(
            html + f'<div class="hero-profile"><img alt="Opponent" src="{PHOTO}"></div>',
            "https://www.ufc.com/athlete/test"), SILHOUETTE)

    def test_invalid_image_urls_are_rejected_and_placeholders_are_recognized(self):
        for value in [None, "", "javascript:alert(1)", "data:image/png;base64,test",
                      "https://[invalid"]:
            with self.subTest(value=value):
                self.assertEqual(sources.normalize_fighter_image_url(
                    value, "https://www.ufc.com/athlete/test"), "")
        for value in [SILHOUETTE, "https://ufc.com/images/SHADOW_Fighter_fullLength_RED.png",
                      "https://ufc.com/images/placeholder.png"]:
            self.assertEqual(sources.normalize_fighter_image_url(value), value)
            self.assertEqual(sources.normalize_fighter_image_url(value, allow_placeholder=False), "")

    @mock.patch.object(scraper, "fetch_supabase_rows")
    def test_history_lookup_is_scoped_to_fighter_ids_and_uses_newest_real_photo(self, fetch):
        fetch.return_value = [
            {"FighterId": 4195, "ImageURL": SILHOUETTE},
            {"FighterId": 4195, "ImageURL": PHOTO},
            {"FighterId": 4195, "ImageURL": "https://ufc.com/older.png"},
            {"FighterId": 4668, "ImageURL": SILHOUETTE},
            {"FighterId": 9999, "ImageURL": PHOTO},
        ]
        self.assertEqual(scraper.fetch_fighter_image_lookup(event_fixture(), 3),
                         {"4195": PHOTO, "4668": SILHOUETTE})
        args, kwargs = fetch.call_args
        self.assertEqual(args, ("ufc_full_fight_card", "FighterId,ImageURL", 3))
        self.assertEqual(kwargs["params"]["FighterId"], "in.(4195,4668)")
        self.assertEqual(kwargs["params"]["order"], "EventId.desc,id.desc")

    @mock.patch.object(scraper, "fetch_supabase_rows", side_effect=requests.Timeout("unavailable"))
    def test_history_failure_does_not_block_scraping(self, fetch):
        self.assertEqual(scraper.fetch_fighter_image_lookup(event_fixture(), 3), {})

    @mock.patch.object(scraper, "fetch_supabase_rows")
    def test_empty_card_does_not_fetch_history(self, fetch):
        self.assertEqual(scraper.fetch_fighter_image_lookup({"FightCard": []}, 3), {})
        fetch.assert_not_called()

    def test_export_prefers_real_live_photos_and_falls_back_to_history_by_id(self):
        for live in ["", SILHOUETTE, "https://ufc.com/new-photo.png"]:
            with self.subTest(live=live), tempfile.TemporaryDirectory() as directory:
                output = str(Path(directory) / "card.csv")
                profiles = {"andrey pulyaev": {"ImageURL": live},
                            "lucas armand": {"ImageURL": SILHOUETTE}}
                scraper.export_event(event_fixture(), output, {}, {}, {}, {}, mock.Mock(), 3, 0,
                                     profiles, {"4195": PHOTO, "4668": SILHOUETTE})
                with open(output, newline="") as handle:
                    rows = list(csv.DictReader(handle))
                self.assertEqual(rows[0]["ImageURL"], live if live and live != SILHOUETTE else PHOTO)
                self.assertEqual(rows[0]["Record_Losses"], "5")
                self.assertEqual(rows[1]["ImageURL"], SILHOUETTE)
                self.assertEqual(profiles["andrey pulyaev"]["ImageURL"], live)

    def test_legacy_image_fetch_uses_the_same_identity_and_record_rules(self):
        session = mock.Mock()
        session.get.return_value = profile_response()
        details = scraper.fetch_ufc_profile_details(session, event_fixture()["FightCard"][0]["Fighters"][0], 3)
        self.assertEqual(details, {"ImageURL": PHOTO, "UFCRank": ""})

    @mock.patch.object(sources, "fetch_wikipedia_profile", return_value=({}, {}))
    @mock.patch.object(sources, "fetch_sherdog_profile", return_value=({}, {}))
    def test_source_chain_keeps_photo_separate_from_rejected_statistics(self, sherdog, wikipedia):
        limiter = mock.Mock()
        limiter.get.return_value = profile_response()
        result = sources.scrape_fighter_sources(
            "Andrey Pulyaev", 10, 5, ["https://www.ufc.com/athlete/andrey-pulyaev"],
            timeout=3, ufc_limiter=limiter,
        )
        self.assertEqual(result["ufc_profile"]["ImageURL"], PHOTO)
        self.assertEqual(result["profile"], {})
        self.assertEqual(result["diagnostics"]["sources"]["ufc.com"]["status"], "image-only")


if __name__ == "__main__":
    unittest.main()
