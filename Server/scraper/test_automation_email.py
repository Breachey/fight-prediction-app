import sys
import tempfile
import unittest
from pathlib import Path


SCRIPTS_DIR = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))

from email_automation_report import (  # noqa: E402
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
            "results": [{
                "eventId": 1324,
                "eventName": "UFC Fight Night: Test",
                "status": "filled-missing-values",
                "filledValueCount": 3,
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
        self.assertIn("Streak: 2", body)
        self.assertIn("KO_TKO_Wins: 1", body)
        self.assertIn("Live Tapology refresh failed.", body)
        self.assertIn("https://github.com/example/run/1", body)

    def test_failed_workflow_uses_action_required_subject(self):
        report = {"status": "complete", "results": []}
        self.assertIn("ACTION REQUIRED", build_subject(report, "failure"))

    def test_missing_report_file_builds_a_fallback_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            report = load_report(Path(directory) / "missing.json")

        self.assertEqual(report["status"], "failed")
        self.assertIn("before it produced", report["error"])


if __name__ == "__main__":
    unittest.main()
