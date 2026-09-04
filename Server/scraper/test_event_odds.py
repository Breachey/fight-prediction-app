import os
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(__file__))

from scrape_full_ufc_event_with_tapology import (
    build_event_odds_map,
    extract_covers_odds_map,
    extract_fightodds_map,
    fightodds_query,
    fighter_names_match,
    select_coherent_american_odds_pair,
)


def fighter(first_name, last_name, fighter_id):
    return {
        "FighterId": fighter_id,
        "Name": {
            "FirstName": first_name,
            "LastName": last_name,
        },
    }


class FakeResponse:
    status_code = 200
    headers = {"content-type": "application/json"}
    text = ""

    def raise_for_status(self):
        return None

    def json(self):
        return {"data": {"ok": True}}


class FakeSession:
    def __init__(self):
        self.calls = []

    def post(self, url, **kwargs):
        self.calls.append((url, kwargs))
        return FakeResponse()


class EventOddsTest(unittest.TestCase):
    def test_fightodds_graphql_uses_browser_context_and_operation_name(self):
        session = FakeSession()

        result = fightodds_query(
            session,
            "query Event($pk: Int!) { eventOfferTable(pk: $pk) { pk } }",
            {"pk": 9648},
            10,
        )

        self.assertEqual(result, {"ok": True})
        self.assertEqual(len(session.calls), 1)
        url, options = session.calls[0]
        self.assertEqual(url, "https://api.fightodds.io/gql")
        self.assertEqual(options["json"]["variables"], {"pk": 9648})
        self.assertEqual(options["json"]["operationName"], "Event")
        self.assertEqual(options["headers"]["Accept"], "application/json")
        self.assertEqual(options["headers"]["Origin"], "https://fightodds.io")

    def test_reversed_two_token_fighter_name_matches(self):
        self.assertTrue(fighter_names_match("Axel Sola", "Sola Axel"))
        self.assertFalse(fighter_names_match("Pavel Andrusca", "Mairon Santos"))

    def test_fightodds_map_handles_reversed_provider_name(self):
        event = {
            "FightCard": [{
                "Fighters": [
                    fighter("Fares", "Ziam", 1),
                    fighter("Axel", "Sola", 2),
                ],
            }],
        }
        offers = [{
            "fighter1": {"firstName": "Fares", "lastName": "Ziam"},
            "fighter2": {"firstName": "Sola", "lastName": "Axel"},
            "bestOdds1": -138,
            "bestOdds2": 138,
        }]

        self.assertEqual(
            extract_fightodds_map(event, offers),
            {"fares ziam": "-138", "axel sola": "138"},
        )

    def test_coherent_pair_rejects_columns_from_unrelated_markets(self):
        self.assertEqual(
            select_coherent_american_odds_pair(
                ["+-", "+900", "+1200", "+440", "+950", "+1200", "+450"],
                ["+-", "-160", "-140", "-600", "-132", "+280", "-650"],
            ),
            ("450", "-600"),
        )
        self.assertEqual(
            select_coherent_american_odds_pair(
                ["-110"],
                ["-110"],
            ),
            ("-110", "-110"),
        )

    def test_covers_parser_selects_table_matching_the_event_card(self):
        event_fights = [{
            "Fighters": [
                fighter("Fares", "Ziam", 1),
                fighter("Axel", "Sola", 2),
            ],
        }]
        html = """
            <table class="covers-mma-table">
              <tr><th><img alt="Other Fighter"></th><td>+110</td></tr>
              <tr><th><img alt="Wrong Opponent"></th><td>-120</td></tr>
            </table>
            <table class="covers-mma-table">
              <tr><th><img alt="Fares Ziam"></th><td>+-</td><td>+165</td><td>-148</td><td>-155</td></tr>
              <tr><th><img alt="Axel Sola"></th><td>+-</td><td>+120</td><td>+124</td><td>+125</td></tr>
            </table>
        """

        self.assertEqual(
            extract_covers_odds_map(html, event_fights),
            {"fares ziam": "-148", "axel sola": "125"},
        )

    def test_covers_parser_maps_provider_name_variants_to_ufc_names(self):
        event_fights = [{
            "Fighters": [
                fighter("Dan", "Hooker", 1),
                fighter("Salahdine", "Parnasse", 2),
            ],
        }]
        html = """
            <table class="covers-mma-table">
              <tr><th><img alt="Daniel Hooker"></th><td>+400</td><td>+450</td></tr>
              <tr><th><img alt="Salahdine Parnasse"></th><td>-550</td><td>-650</td></tr>
            </table>
        """

        self.assertEqual(
            extract_covers_odds_map(html, event_fights),
            {"dan hooker": "450", "salahdine parnasse": "-550"},
        )

    @patch(
        "scrape_full_ufc_event_with_tapology.fetch_ufc_odds_map",
        side_effect=AssertionError("UFC fallback should not run when the card is complete"),
    )
    @patch(
        "scrape_full_ufc_event_with_tapology.fetch_covers_odds_map",
        return_value={"fares ziam": "-148", "axel sola": "125"},
    )
    @patch(
        "scrape_full_ufc_event_with_tapology.fetch_fightodds_odds_map",
        return_value={},
    )
    def test_covers_completes_map_when_fightodds_is_unavailable(
        self,
        _fightodds_mock,
        _covers_mock,
        _ufc_mock,
    ):
        event = {
            "FightCard": [{
                "Fighters": [
                    fighter("Fares", "Ziam", 1),
                    fighter("Axel", "Sola", 2),
                ],
            }],
        }

        self.assertEqual(
            build_event_odds_map(event, session=object(), timeout=10),
            {"fares ziam": "-148", "axel sola": "125"},
        )


if __name__ == "__main__":
    unittest.main()
