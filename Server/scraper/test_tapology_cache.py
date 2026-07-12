import unittest
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import scrape_full_ufc_event_with_tapology as scraper


class TapologyCacheTests(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
