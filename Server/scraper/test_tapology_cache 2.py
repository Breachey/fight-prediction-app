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
        verified = scraper.normalize_tapology_cache_fighter({
            "streak": -2,
            "streak_source": "fight_results",
            "streak_verified_at": "2026-08-01T00:00:00Z",
            "streak_needs_review": False,
        })
        ambiguous_manual = scraper.normalize_tapology_cache_fighter({
            "streak": 3,
            "streak_source": "manual",
        })
        manual_streak = scraper.normalize_tapology_cache_fighter({
            "streak": 3,
            "streak_source": "manual",
            "streak_verified_at": "2026-08-01T00:00:00Z",
            "streak_needs_review": False,
        })

        self.assertEqual(historical["Streak"], "")
        self.assertEqual(historical["KO_TKO_Wins"], "8")
        self.assertEqual(verified["Streak"], "-2")
        self.assertEqual(ambiguous_manual["Streak"], "")
        self.assertEqual(manual_streak["Streak"], "3")

    def test_cached_profile_tracks_the_most_recent_attempt(self):
        cached = scraper.normalize_tapology_cache_fighter({
            "last_success_at": "2026-08-01T00:00:00Z",
            "last_failure_at": "2026-08-10T00:00:00Z",
        })

        self.assertEqual(cached["_TapologyLastAttemptAt"], "2026-08-10T00:00:00Z")

    @mock.patch.object(scraper, "record_tapology_profile_failures")
    @mock.patch.object(scraper, "parse_tapology_fighter_profile")
    @mock.patch.object(scraper, "fetch_tapology_fighter_html")
    def test_profile_limit_rotates_to_never_and_least_recently_attempted_fighters(
        self,
        fetch_profile,
        parse_profile,
        record_failures,
    ):
        fetch_profile.return_value = "profile html"
        parse_profile.return_value = {"Streak": "2"}
        enrichment = {
            "recent fighter": {
                "TapologyFighterURL": "https://example.com/recent",
                "_TapologyLastAttemptAt": "2026-08-20T00:00:00Z",
            },
            "never fighter": {
                "TapologyFighterURL": "https://example.com/never",
                "_TapologyLastAttemptAt": "",
            },
            "older fighter": {
                "TapologyFighterURL": "https://example.com/older",
                "_TapologyLastAttemptAt": "2026-08-01T00:00:00Z",
            },
        }

        _, attempt_count, refreshed = scraper.fetch_tapology_profiles_for_enrichment(
            tapology_session=mock.Mock(),
            event={"FightCard": []},
            enrichment=enrichment,
            timeout=5,
            tapology_delay_seconds=0,
            tapology_profile_limit=2,
        )

        self.assertEqual(attempt_count, 2)
        self.assertEqual(list(refreshed), ["never fighter", "older fighter"])
        self.assertEqual(
            [call.kwargs["tapology_fighter_url"] for call in fetch_profile.call_args_list],
            ["https://example.com/never", "https://example.com/older"],
        )
        record_failures.assert_called_once()

    @mock.patch.object(scraper, "upsert_supabase_rows")
    def test_profile_failures_are_recorded_for_future_rotation(self, upsert_rows):
        event = {
            "FightCard": [{
                "Fighters": [{
                    "FighterId": 10,
                    "Name": {"FirstName": "Test", "LastName": "Fighter"},
                }],
            }],
        }

        scraper.record_tapology_profile_failures(
            event,
            {
                "test fighter": {
                    "TapologyFighterURL": "https://example.com/fighter",
                    "error": "blocked",
                },
            },
            timeout=5,
        )

        self.assertEqual(
            [call.args[0] for call in upsert_rows.call_args_list],
            ["tapology_fighter_cache", "fighters"],
        )
        payload = upsert_rows.call_args_list[0].args[1][0]
        self.assertEqual(payload["fighter_id"], 10)
        self.assertEqual(payload["last_error"], "blocked")
        self.assertTrue(payload["last_failure_at"])

    def test_verified_cached_streak_must_match_the_current_record(self):
        lookup = scraper.empty_tapology_cache_lookup()
        lookup["fighters_by_fighter_id"]["10"] = {
            "fighter_id": 10,
            "streak": 4,
            "streak_source": "tapology_live",
            "streak_verified_at": "2026-08-01T00:00:00Z",
            "streak_needs_review": False,
            "streak_record_wins": 12,
            "streak_record_losses": 2,
        }
        fighter = {
            "FighterId": 10,
            "Record": {"Wins": 13, "Losses": 2},
            "Name": {"FirstName": "Test", "LastName": "Fighter"},
        }

        cached = scraper.tapology_cache_fighter_for_fighter(fighter, lookup)
        self.assertEqual(cached["Streak"], "")

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

    @mock.patch.object(scraper, "upsert_supabase_rows")
    def test_live_profile_streak_creates_a_verified_upcoming_anchor(self, upsert_rows):
        upsert_rows.return_value = 1
        event = {
            "EventId": 2000,
            "StartTime": "2099-08-15T22:00:00Z",
            "FightCard": [{
                "Fighters": [{
                    "FighterId": 10,
                    "MMAId": 20,
                    "Name": {"FirstName": "Test", "LastName": "Fighter"},
                    "Record": {"Wins": 12, "Losses": 3},
                }],
            }],
        }

        scraper.upsert_tapology_fighter_cache(
            event=event,
            enrichment={
                "test fighter": {
                    "TapologyFighterURL": "https://example.com/fighter",
                    "Streak": "-2",
                },
            },
            timeout=5,
            source="live_profile",
        )

        fighters_call = next(
            call for call in upsert_rows.call_args_list
            if call.args[0] == "fighters"
        )
        fighter_payload = fighters_call.args[1][0]
        self.assertEqual(fighter_payload["streak"], -2)
        self.assertEqual(fighter_payload["streak_source"], "tapology_live")
        self.assertEqual(fighter_payload["streak_anchor_record_wins"], 12)
        self.assertEqual(fighter_payload["streak_anchor_record_losses"], 3)
        self.assertEqual(fighter_payload["streak_anchor_through_date"], "2099-08-14")
        self.assertFalse(fighter_payload["streak_needs_review"])


if __name__ == "__main__":
    unittest.main()
