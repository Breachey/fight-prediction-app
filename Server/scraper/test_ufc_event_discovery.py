import unittest
import os
import sys
import threading
from unittest import mock

sys.path.insert(0, os.path.dirname(__file__))

from discover_ufc_events_for_import import (
    is_supported_ufc_mma_event_name,
    normalize_event_record,
    discover_ufc_events,
)
import discover_ufc_events_for_import as discovery


class UfcEventDiscoveryTest(unittest.TestCase):
    @mock.patch.object(discovery, "fetch_ufc_event")
    def test_scan_fetches_concurrently_but_returns_events_in_id_order(self, fetch):
        barrier = threading.Barrier(4, timeout=5)

        def fetch_event(event_id, **kwargs):
            barrier.wait()
            return {"EventId": event_id, "Name": "UFC 330"}

        fetch.side_effect = fetch_event
        events, stats = discover_ufc_events(1300, 1303, 80, 15, 0, 1)
        self.assertEqual([event["EventId"] for event in events], list(range(1300, 1304)))
        self.assertEqual(stats["scanned"], 4)
        self.assertEqual(fetch.call_count, 4)

    @mock.patch.object(discovery, "fetch_ufc_event")
    def test_missing_ids_stop_at_threshold(self, fetch):
        fetch.side_effect = RuntimeError("unpublished event")
        events, stats = discover_ufc_events(1300, None, 80, 5, 0, 1)
        self.assertEqual(events, [])
        self.assertEqual(stats["missing_ids"], 5)
        self.assertEqual(fetch.call_count, 5)

    @mock.patch.object(discovery, "fetch_ufc_event")
    def test_valid_events_reset_miss_count_and_max_ids_is_respected(self, fetch):
        def fetch_event(event_id, **kwargs):
            if event_id % 2:
                raise RuntimeError("unpublished event")
            return {"EventId": event_id, "Name": "UFC 330"}

        fetch.side_effect = fetch_event
        events, stats = discover_ufc_events(1300, None, 7, 3, 0, 1)
        self.assertEqual(stats["scanned"], 7)
        self.assertEqual(len(events), 4)
        self.assertEqual(fetch.call_count, 7)

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
