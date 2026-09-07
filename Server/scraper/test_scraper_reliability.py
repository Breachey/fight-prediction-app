import copy
import csv
import datetime
import json
import tempfile
import unittest
from email.utils import format_datetime
from pathlib import Path
from unittest import mock

import requests

import fighter_profile_sources as sources
import http_fetch
import scrape_full_ufc_event_with_tapology as scraper


def response(status=200, payload=None, html="", headers=None):
    result = requests.Response()
    result.status_code = status
    result._content = (json.dumps(payload) if payload is not None else html).encode()
    result._content_consumed = True
    result.url = "https://example.test/profile"
    result.headers.update(headers or {})
    return result


def event_fixture():
    return {
        "EventId": 1302, "Name": "UFC Test", "StartTime": "2026-09-12T23:00:00Z",
        "FightCard": [{
            "FightId": 10,
            "Fighters": [
                {"FighterId": 1, "Corner": "Red", "Name": {"FirstName": "Test", "LastName": "Fighter"}},
                {"FighterId": 2, "Corner": "Blue", "Name": {"FirstName": "Other", "LastName": "Fighter"}},
            ],
        }],
    }


class HttpRetryTests(unittest.TestCase):
    @mock.patch.object(http_fetch.time, "sleep")
    def test_transient_failure_recovers_with_one_retry(self, sleep):
        for first in [response(503), response(429, headers={"Retry-After": "1"}), requests.Timeout("slow")]:
            with self.subTest(first=first):
                good = response()
                session = mock.Mock()
                session.get.side_effect = [first, good]
                self.assertIs(http_fetch.get_with_retry(session, "https://example.test", 3), good)
                self.assertEqual(session.get.call_count, 2)
        self.assertEqual(sleep.call_count, 3)

    @mock.patch.object(http_fetch.time, "sleep")
    def test_permanent_failure_or_long_retry_after_does_not_retry(self, sleep):
        for first in [
            response(403), response(404), response(401),
            response(429, headers={"Retry-After": "120"}),
            response(503, headers={"Retry-After": "invalid"}),
            response(429, headers={"Retry-After": format_datetime(
                datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(minutes=5),
            )}),
        ]:
            with self.subTest(status=first.status_code, headers=first.headers):
                session = mock.Mock()
                session.get.return_value = first
                self.assertIs(http_fetch.get_with_retry(session, "https://example.test", 3), first)
                session.get.assert_called_once()
        sleep.assert_not_called()

    @mock.patch.object(http_fetch.time, "sleep")
    def test_retries_are_bounded_and_keep_source_spacing(self, sleep):
        session = mock.Mock()
        session.get.side_effect = requests.Timeout("still slow")
        with self.assertRaises(requests.Timeout):
            sources.RateLimiter(1.25).get(session, "https://example.test", 3)
        self.assertEqual(session.get.call_count, 2)
        sleep.assert_called_once_with(1.25)

    @mock.patch.object(http_fetch.time, "sleep")
    def test_tls_failure_is_not_retried(self, sleep):
        session = mock.Mock()
        session.get.side_effect = requests.exceptions.SSLError("invalid certificate")
        with self.assertRaises(requests.exceptions.SSLError):
            http_fetch.get_with_retry(session, "https://example.test", 3)
        session.get.assert_called_once()
        sleep.assert_not_called()


class EventReliabilityTests(unittest.TestCase):
    def test_bad_primary_endpoint_falls_back_to_valid_event(self):
        valid = event_fixture()
        invalid_card = copy.deepcopy(valid)
        invalid_card["FightCard"][0]["Fighters"].pop()
        for bad in [
            response(payload=[]), response(html="not JSON"),
            response(payload={"LiveEventDetail": {**valid, "EventId": 999}}),
            response(payload={"LiveEventDetail": invalid_card}),
            response(403, html="Just a moment", headers={"server": "cloudflare"}),
        ]:
            with self.subTest(body=bad.text):
                session = mock.Mock()
                session.get.side_effect = [bad, response(payload={"LiveEventDetail": valid})]
                self.assertEqual(scraper.fetch_ufc_event(1302, session, 3, True), valid)
                self.assertEqual(session.get.call_count, 2)

    def test_invalid_lineups_are_rejected(self):
        valid = event_fixture()
        variants = []
        for value in (None, [], {}, [None]):
            variants.append({**valid, "FightCard": value})
        duplicate_fight = copy.deepcopy(valid)
        duplicate_fight["FightCard"] *= 2
        variants.append(duplicate_fight)
        for field, value in (("FighterId", 1), ("FighterId", "2junk"), ("Corner", "Red"), ("Name", None)):
            bad = copy.deepcopy(valid)
            bad["FightCard"][0]["Fighters"][1][field] = value
            variants.append(bad)
        for bad in variants:
            with self.subTest(event=bad), self.assertRaises(ValueError):
                scraper.validate_ufc_event({"LiveEventDetail": bad}, 1302, True)

    def test_discovery_still_accepts_events_before_lineups_are_published(self):
        event = {"EventId": 1302, "Name": "UFC Test", "FightCard": None}
        self.assertEqual(scraper.validate_ufc_event({"LiveEventDetail": event}, 1302), event)

    def test_failure_reports_both_endpoints(self):
        session = mock.Mock()
        session.get.return_value = response(payload={})
        with self.assertRaises(RuntimeError) as caught:
            scraper.fetch_ufc_event(1302, session, 3, True)
        for domain in scraper.UFC_DOMAINS:
            self.assertIn(domain, str(caught.exception))

    def test_export_tolerates_missing_optional_biography(self):
        event = event_fixture()
        event.update({"Location": None, "Organization": None})
        for fighter in event["FightCard"][0]["Fighters"]:
            fighter.update({"Record": None, "Born": None, "FightingOutOf": None, "WeightClasses": None})
        with tempfile.TemporaryDirectory() as directory:
            output = str(Path(directory) / "card.csv")
            scraper.export_event(event, output, {}, {}, {}, {}, mock.Mock(), 3, 0,
                                 {"test fighter": {}, "other fighter": {}})
            with open(output, newline="") as handle:
                rows = list(csv.DictReader(handle))
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["Record_Wins"], "")
        self.assertEqual(rows[1]["Corner"], "Blue")


class ProfileReliabilityTests(unittest.TestCase):
    @mock.patch.object(scraper, "record_tapology_profile_failures")
    @mock.patch.object(scraper, "fetch_tapology_fighter_html", return_value="<html>Maintenance</html>")
    def test_empty_tapology_parse_is_failure_and_preserves_existing_data(self, fetch, failures):
        enrichment = {"test fighter": {"TapologyFighterURL": "https://example.test/fighter", "Streak": "2"}}
        original = copy.deepcopy(enrichment)
        result = scraper.fetch_tapology_profiles_for_enrichment(mock.Mock(), event_fixture(), enrichment, 3, 0, 4)
        self.assertEqual(result, (0, 1, {}))
        self.assertEqual(enrichment, original)
        self.assertIn("no recognized", failures.call_args.args[1]["test fighter"]["error"])

    @mock.patch.object(scraper, "record_tapology_profile_failures")
    @mock.patch.object(scraper, "parse_tapology_fighter_profile")
    @mock.patch.object(scraper, "fetch_tapology_fighter_html", return_value="profile")
    def test_partial_fallback_preserves_primary_zeros_but_refreshes_cache(self, fetch, parse, failures):
        parse.return_value = {"Streak": "3", "KO_TKO_Losses": "2", "Submission_Wins": "4", "style": ""}
        enrichment = {"test fighter": {
            "TapologyFighterURL": "https://example.test/fighter", "Streak": "1",
            "KO_TKO_Losses": "0", "Submission_Wins": "2", "style": "Wrestling",
        }}
        primary = {"test fighter": {"KO_TKO_Losses": "0"}}
        count, attempts, refreshed = scraper.fetch_tapology_profiles_for_enrichment(
            mock.Mock(), event_fixture(), enrichment, 3, 0, 4, primary_enrichment=primary,
        )
        self.assertEqual((count, attempts), (1, 1))
        self.assertEqual(enrichment["test fighter"]["KO_TKO_Losses"], "0")
        self.assertEqual(enrichment["test fighter"]["Streak"], "3")
        self.assertEqual(enrichment["test fighter"]["Submission_Wins"], "4")
        self.assertEqual(enrichment["test fighter"]["style"], "Wrestling")
        self.assertNotIn("style", refreshed["test fighter"])

    @mock.patch.object(sources, "parse_sherdog_profile")
    def test_sherdog_candidate_timeout_does_not_hide_later_match(self, parse):
        limiter = mock.Mock()
        limiter.get.side_effect = [
            response(html='<a href="/fighter/test-2">Test Fighter</a><a href="/fighter/test-1">Test Fighter</a>'),
            requests.Timeout("first candidate unavailable"), response(),
        ]
        parse.return_value = {
            "name": "Test Fighter", "Record_Wins": 4, "Record_Losses": 0,
            "KO_TKO_Wins": 2, "Submission_Wins": 1, "Decision_Wins": 1,
            "KO_TKO_Losses": 0, "Submission_Losses": 0, "Decision_Losses": 0,
        }
        profile, diagnostics = sources.fetch_sherdog_profile("Test Fighter", 4, 0, 3, limiter=limiter)
        self.assertEqual(profile["Record_Wins"], 4)
        self.assertEqual(diagnostics["status"], "success")
        self.assertIn("error", diagnostics["candidates_tested"][0])

    @mock.patch.object(sources, "parse_wikipedia_profile")
    def test_wikipedia_candidate_failure_does_not_hide_later_match(self, parse):
        session = mock.Mock()
        session.get.side_effect = [
            response(payload={"query": {"search": [{"title": "Test Fighter"}, {"title": "Test Fighter (fighter)"}]}}),
            response(404), response(payload={"parse": {"text": {"*": "profile"}}}),
        ]
        parse.return_value = {"Record_Wins": 4, "Record_Losses": 0}
        profile, diagnostics = sources.fetch_wikipedia_profile("Test Fighter", 4, 0, 3, session=session)
        self.assertEqual(profile["WikipediaTitle"], "Test Fighter (fighter)")
        self.assertIn("error", diagnostics["candidates_tested"][0])

    @mock.patch.object(scraper, "upsert_tapology_fighter_cache")
    @mock.patch.object(scraper, "scrape_fighter_sources")
    def test_source_diagnostics_keep_field_provenance_and_failures(self, scrape, upsert):
        scrape.return_value = {
            "profile": {"Streak": "2"}, "field_sources": {"Streak": "sherdog"},
            "diagnostics": {"status": "partial", "errors": ["UFC.com: unavailable"]},
        }
        diagnostics = {}
        scraper.fetch_validated_fighter_source_enrichment(
            event_fixture(), mock.Mock(), 3, 0, 0, diagnostics_by_fighter=diagnostics,
        )
        self.assertEqual(diagnostics["1"]["field_sources"], {"Streak": "sherdog"})
        self.assertEqual(diagnostics["2"]["errors"], ["UFC.com: unavailable"])


if __name__ == "__main__":
    unittest.main()
