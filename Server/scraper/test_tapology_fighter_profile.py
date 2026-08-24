import unittest

from scrape_full_ufc_event_with_tapology import cached_streak_is_current, extract_tapology_streak
from scrape_tapology_fighter_profile import build_scrape_diagnostics, merge_profiles


class TapologyFighterProfileTests(unittest.TestCase):
    def test_partial_tapology_profile_keeps_streak_when_methods_use_fallback(self):
        merged = merge_profiles(
            {"Streak": "-2", "style": "Boxing", "KO_TKO_Wins": ""},
            {
                "KO_TKO_Wins": "8",
                "KO_TKO_Losses": "1",
                "Submission_Wins": "2",
                "Submission_Losses": "0",
                "Decision_Wins": "5",
                "Decision_Losses": "3",
            },
        )

        self.assertEqual(merged["Streak"], "-2")
        self.assertEqual(merged["style"], "Boxing")
        self.assertEqual(merged["KO_TKO_Wins"], "8")

    def test_diagnostics_explain_missing_streak_when_tapology_fetch_fails(self):
        diagnostics = build_scrape_diagnostics(
            {"KO_TKO_Wins": "4"},
            "wikipedia_record_breakdown",
            "failed",
            tapology_error="Cloudflare challenge",
        )

        self.assertEqual(diagnostics["status"], "partial")
        self.assertIn("Streak", diagnostics["fields_missing"])
        self.assertIn("Wikipedia does not expose", diagnostics["streak_detail"])

    def test_streak_parser_handles_wins_and_losses(self):
        self.assertEqual(extract_tapology_streak("Current MMA Streak: 3 Wins"), "3")
        self.assertEqual(extract_tapology_streak("Current MMA Streak: 1 Loss"), "-1")

    def test_only_explicitly_verified_streaks_are_reusable_on_future_previews(self):
        self.assertFalse(cached_streak_is_current({"stats_source": "tapology_wikipedia_merged"}))
        self.assertFalse(cached_streak_is_current({"source": "tapology_partial_profile"}))
        self.assertTrue(cached_streak_is_current({
            "streak_source": "tapology_live",
            "streak_verified_at": "2026-08-01T00:00:00Z",
            "streak_needs_review": False,
        }))
        self.assertFalse(cached_streak_is_current({
            "streak_source": "tapology_live",
            "streak_verified_at": "2026-08-01T00:00:00Z",
            "streak_needs_review": True,
        }))

    def test_sherdog_streaks_are_reusable_on_future_previews(self):
        self.assertTrue(cached_streak_is_current({
            "streak_source": "sherdog_live",
            "streak_verified_at": "2026-08-01T00:00:00Z",
            "streak_needs_review": False,
        }))


if __name__ == "__main__":
    unittest.main()
