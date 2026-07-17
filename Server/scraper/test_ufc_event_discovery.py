import unittest
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from discover_ufc_events_for_import import (
    is_supported_ufc_mma_event_name,
    normalize_event_record,
)


class UfcEventDiscoveryTest(unittest.TestCase):
    def test_supported_event_name_filter_allows_numbered_and_fight_night_events(self):
        self.assertTrue(is_supported_ufc_mma_event_name("UFC 330"))
        self.assertTrue(is_supported_ufc_mma_event_name("UFC 329: McGregor vs. Holloway 2"))
        self.assertTrue(is_supported_ufc_mma_event_name("UFC Freedom 250"))
        self.assertTrue(is_supported_ufc_mma_event_name("UFC Fight Night: Kape vs. Horiguchi"))

    def test_supported_event_name_filter_rejects_non_mma_or_non_event_series(self):
        self.assertFalse(is_supported_ufc_mma_event_name("Road To UFC 5.1"))
        self.assertFalse(is_supported_ufc_mma_event_name("Dana White's Contender Series"))
        self.assertFalse(is_supported_ufc_mma_event_name("UFC BJJ 3"))
        self.assertFalse(is_supported_ufc_mma_event_name("UFC Fight Pass Invitational 10"))

    def test_event_id_is_used_as_events_table_id(self):
        record = normalize_event_record({
            "EventId": 1317,
            "Name": "UFC 330",
            "StartTime": "2026-08-15T23:00Z",
            "Location": {},
        })
        self.assertEqual(record["id"], 1317)
        self.assertNotIn("ufc_event_number", record)


if __name__ == "__main__":
    unittest.main()
