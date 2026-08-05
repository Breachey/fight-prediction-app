import unittest
import os
import sys
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import scrape_full_ufc_event_with_tapology as scraper


class TapologyCacheTests(unittest.TestCase):
    def test_cached_streak_requires_a_current_source(self):
        historical = scraper.normalize_tapology_cache_fighter({
            "streak": 4,
            "ko_tko_wins": 8,
            "source": "historical_import",
        })
        current = scraper.normalize_tapology_cache_fighter({
            "streak": -2,
            "stats_source": "fight_result",
        })
        ambiguous_manual = scraper.normalize_tapology_cache_fighter({
            "streak": 3,
            "stats_source": "manual_admin",
        })
        manual_streak = scraper.normalize_tapology_cache_fighter({
            "streak": 3,
            "stats_source": "manual_streak",
        })

        self.assertEqual(historical["Streak"], "")
        self.assertEqual(historical["KO_TKO_Wins"], "8")
        self.assertEqual(current["Streak"], "-2")
        self.assertEqual(ambiguous_manual["Streak"], "")
        self.assertEqual(manual_streak["Streak"], "3")

    def test_resolve_style_prefers_fighter_style_over_tapology_cache(self):
        fighter = {
            "FighterId": 10,
            "MMAId": 20,
            "Name": {
                "FirstName": "Test",
                "LastName": "Fighter",
            },
        }
        fighter_style_lookup = {
            "by_fighter_id": {"10": "Wrestling"},
            "by_mma_id": {},
            "by_name": {},
        }
        tapology_fighter = {
            "style": "Kickboxing",
        }

        self.assertEqual(
            scraper.resolve_style_from_sources(
                fighter,
                fighter_style_lookup,
                tapology_fighter,
            ),
            "Wrestling",
        )

    def test_tapology_cache_matches_by_fighter_id_then_mma_id_then_name(self):
        lookup = scraper.empty_tapology_cache_lookup()
        lookup["fighters_by_fighter_id"]["10"] = {
            "fighter_id": 10,
            "tapology_fighter_url": "https://example.com/fighter-id",
            "match_confidence": "fighter-id",
        }
        lookup["fighters_by_mma_id"]["22"] = {
            "fighter_id": 11,
            "mma_id": 22,
            "tapology_fighter_url": "https://example.com/mma-id",
            "match_confidence": "mma-id",
        }
        lookup["fighters_by_name"]["fallback fighter"] = {
            "fighter_id": 12,
            "normalized_name": "fallback fighter",
            "tapology_fighter_url": "https://example.com/name",
            "match_confidence": "name",
        }

        fighter_id_match = scraper.tapology_cache_fighter_for_fighter(
            {
                "FighterId": 10,
                "MMAId": 22,
                "Name": {"FirstName": "Fallback", "LastName": "Fighter"},
            },
            lookup,
        )
        self.assertEqual(fighter_id_match["TapologyFighterURL"], "https://example.com/fighter-id")

        mma_id_match = scraper.tapology_cache_fighter_for_fighter(
            {
                "FighterId": 99,
                "MMAId": 22,
                "Name": {"FirstName": "Fallback", "LastName": "Fighter"},
            },
            lookup,
        )
        self.assertEqual(mma_id_match["TapologyFighterURL"], "https://example.com/mma-id")

        name_match = scraper.tapology_cache_fighter_for_fighter(
            {
                "FighterId": 99,
                "MMAId": 99,
                "Name": {"FirstName": "Fallback", "LastName": "Fighter"},
            },
            lookup,
        )
        self.assertEqual(name_match["TapologyFighterURL"], "https://example.com/name")

    @mock.patch.object(scraper, "upsert_supabase_rows")
    def test_event_page_url_match_does_not_refresh_fighter_stat_provenance(self, upsert_rows):
        upsert_rows.return_value = 1
        event = {
            "EventId": 1400,
            "StartTime": "2026-08-01T00:00:00Z",
            "FightCard": [{
                "Fighters": [{
                    "FighterId": 10,
                    "MMAId": 20,
                    "Name": {"FirstName": "Test", "LastName": "Fighter"},
                }],
            }],
        }

        scraper.upsert_tapology_fighter_cache(
            event=event,
            enrichment={
                "test fighter": {
                    "TapologyFighterURL": "https://example.com/fighter",
                    "TapologyMatchConfidence": "event-page-exact",
                },
            },
            timeout=5,
            source="live_event_page",
        )

        fighters_call = next(
            call for call in upsert_rows.call_args_list
            if call.args[0] == "fighters"
        )
        cache_call = next(
            call for call in upsert_rows.call_args_list
            if call.args[0] == "tapology_fighter_cache"
        )
        cache_payload = cache_call.args[1][0]
        fighter_payload = fighters_call.args[1][0]
        self.assertIsNone(cache_payload["source"])
        self.assertIsNone(cache_payload["last_success_at"])
        self.assertNotIn("stats_source", fighter_payload)
        self.assertNotIn("stats_as_of_event_id", fighter_payload)
        self.assertNotIn("last_success_at", fighter_payload)


if __name__ == "__main__":
    unittest.main()
