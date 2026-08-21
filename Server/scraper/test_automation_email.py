import sys
import tempfile
import unittest
from pathlib import Path


SCRIPTS_DIR = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))

from email_automation_report import (  # noqa: E402
    build_html_report,
    build_subject,
    build_text_report,
    load_report,
)


class AutomationEmailReportTests(unittest.TestCase):
    def test_report_lists_missing_fields_and_warnings(self):
        report = {
            "status": "complete",
            "checkedAt": "2026-08-07T12:00:00Z",
            "timeZone": "America/Denver",
            "dryRun": False,
            "eventDiscovery": {
                "status": "complete",
                "scanned": 80,
                "apiEventsFound": 12,
                "eligibleEventsFound": 10,
                "insertedCount": 1,
                "updatedCount": 1,
                "unchangedCount": 8,
                "posterCount": 1,
                "changedEvents": [{
                    "id": 1325,
                    "name": "UFC 331",
                    "date": "2026-09-26",
                    "action": "inserted",
                }],
                "posterErrors": ["1326: Tapology unavailable"],
            },
            "results": [{
                "eventId": 1324,
                "eventName": "UFC Fight Night: Test",
                "status": "filled-missing-values",
                "filledValueCount": 3,
                "existingMissing": {
                    "byField": {"Streak": 4, "style": 1, "KO_TKO_Wins": 1}
                },
                "newlyFilled": {
                    "newRowCount": 0,
                    "byField": {"Streak": 2, "style": 1, "KO_TKO_Wins": 0},
                },
                "remainingMissing": {
                    "byField": {"Streak": 2, "style": 0, "KO_TKO_Wins": 1}
                },
                "warnings": ["Live Tapology refresh failed."],
            }],
        }

        subject = build_subject(report, "success")
        body = build_text_report(report, "success", "https://github.com/example/run/1")

        self.assertIn("Scrape complete", subject)
        self.assertIn("UFC Fight Night: Test", subject)
        self.assertIn("New blank values filled: 3", body)
        self.assertIn("New information by field: Streak: +2, Style: +1", body)
        self.assertIn("Missing before this run: 6 values (Streak: 4", body)
        self.assertIn("Still missing: 3 values (Streak: 2", body)
        self.assertIn("Streak: 2", body)
        self.assertIn("KO/TKO wins: 1", body)
        self.assertIn("Live Tapology refresh failed.", body)
        self.assertIn("https://github.com/example/run/1", body)
        self.assertIn("UFC IDs scanned: 80", body)
        self.assertIn("Events added: 1", body)
        self.assertIn("Inserted event 1325: UFC 331 on 2026-09-26", body)
        self.assertIn("Poster warning: 1326: Tapology unavailable", body)
        self.assertEqual(
            build_html_report(report, "success", "").count(
                "Fight Picks scrape automation report"
            ),
            1,
        )

    def test_failed_workflow_uses_action_required_subject(self):
        report = {"status": "complete", "results": []}
        self.assertIn("ACTION REQUIRED", build_subject(report, "failure"))

    def test_report_explains_lineup_changes_and_prediction_impact(self):
        report = {
            "status": "complete",
            "results": [{
                "eventId": 1324,
                "eventName": "UFC Fight Night: Test",
                "status": "lineup-updated",
                "lineupChanges": {
                    "changed": True,
                    "unchangedFightCount": 10,
                    "addedFights": [{
                        "fightId": 12,
                        "fighters": [{"name": "Added Red"}, {"name": "Added Blue"}],
                    }],
                    "removedFights": [{
                        "fightId": 11,
                        "fighters": [{"name": "Old Red"}, {"name": "Old Blue"}],
                    }],
                    "changedFights": [],
                },
                "predictionImpact": {
                    "affectedPredictionCount": 0,
                    "preservedPredictionCount": 3,
                },
            }],
        }

        body = build_text_report(report, "success", "")

        self.assertIn("1 added, 1 removed", body)
        self.assertIn("Added fight 12: Added Red vs. Added Blue", body)
        self.assertIn("Removed fight 11: Old Red vs. Old Blue", body)
        self.assertIn("0 affected, 3 preserved", body)

    def test_missing_report_file_builds_a_fallback_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            report = load_report(Path(directory) / "missing.json")

        self.assertEqual(report["status"], "failed")
        self.assertIn("before it produced", report["error"])
        body = build_text_report(report, "success", "")
        self.assertIn("No per-event results were available.", body)
        self.assertNotIn("No incomplete upcoming event was found", body)


if __name__ == "__main__":
    unittest.main()
