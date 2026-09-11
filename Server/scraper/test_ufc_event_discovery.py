import unittest
import os
import sys
import threading
import datetime
import io
import contextlib
from unittest import mock

sys.path.insert(0, os.path.dirname(__file__))

from discover_ufc_events_for_import import (
    is_supported_ufc_mma_event_name,
    normalize_event_record,
    discover_ufc_events,
)
import discover_ufc_events_for_import as discovery


class UfcEventDiscoveryTest(unittest.TestCase):
    def test_empty_current_week_scan_does_not_restart_in_history(self):
        with mock.patch.object(sys, "argv", ["discovery"]), \
                mock.patch.object(discovery, "fetch_existing_events", return_value={
                    1331: {"date": "2099-01-01"}}), \
                mock.patch.object(discovery, "discover_ufc_events", return_value=([], {
                    "eligible_events_found": 0})) as scan, \
                mock.patch.object(discovery, "persist_discovered_events", return_value={}) as persist, \
                contextlib.redirect_stdout(io.StringIO()):
            discovery.main()
        scan.assert_called_once()
        self.assertEqual(scan.call_args.kwargs["start_id"], 1331)
        self.assertEqual(persist.call_args.kwargs["events"], [])

    @mock.patch.object(discovery, "fetch_ufc_event")
    def test_scan_fetches_concurrently_but_returns_events_in_id_order(self, fetch):
        barrier = threading.Barrier(4, timeout=5)

        def fetch_event(event_id, **kwargs):
            barrier.wait()
            return {"EventId": event_id, "Name": "UFC 330", "StartTime": "2099-01-01T23:00Z"}

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
            return {"EventId": event_id, "Name": "UFC 330", "StartTime": "2099-01-01T23:00Z"}

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

    def test_week_boundary_uses_denver_and_handles_year_rollover(self):
        with mock.patch.dict(os.environ, {"AUTOMATION_TIME_ZONE": "America/Denver"}):
            self.assertEqual(discovery.current_week_start(datetime.datetime.fromisoformat(
                "2026-09-14T05:00:00+00:00")), datetime.date(2026, 9, 7))
            self.assertEqual(discovery.current_week_start(datetime.datetime.fromisoformat(
                "2026-09-14T06:00:00+00:00")), datetime.date(2026, 9, 14))
            self.assertEqual(discovery.current_week_start(datetime.datetime.fromisoformat(
                "2027-01-01T12:00:00+00:00")), datetime.date(2026, 12, 28))

    def test_start_id_uses_first_current_week_event_without_historical_lookback(self):
        cutoff = datetime.date(2026, 9, 7)
        records = {1300: {"date": "2026-08-01"}, 1331: {"date": "2026-09-12"},
                   1340: {"date": "2026-10-01"}, 1400: {"date": "2026-09-01"}}
        self.assertEqual(discovery.default_start_id(records, 80, cutoff), 1331)
        self.assertEqual(discovery.default_start_id({1300: records[1300]}, 80, cutoff), 1301)

    @mock.patch.object(discovery, "fetch_ufc_event")
    def test_scan_skips_known_old_ids_and_filters_unknown_old_or_undated_events(self, fetch):
        dates = {1330: "2026-09-06", 1331: "2026-09-07", 1333: "2026-09-19",
                 1334: None, 1335: "bad-date"}
        fetch.side_effect = lambda event_id, **kwargs: {
            "EventId": event_id, "Name": "UFC 330", "StartTime": dates[event_id]}
        events, stats = discover_ufc_events(
            1330, 1335, 6, 15, 0, 1, minimum_date=datetime.date(2026, 9, 7),
            existing_events={1332: {"date": "2026-08-01"}})
        self.assertEqual([event["EventId"] for event in events], [1331, 1333])
        self.assertEqual(stats["eligible_events_found"], 2)
        self.assertEqual(stats["filtered_events"], 4)
        self.assertNotIn(1332, [call.args[0] for call in fetch.call_args_list])

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
