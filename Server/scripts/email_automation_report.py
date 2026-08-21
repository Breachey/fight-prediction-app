#!/usr/bin/env python3

import argparse
import html
import json
import os
import smtplib
import ssl
from datetime import datetime, timezone
from email.message import EmailMessage
from pathlib import Path
from typing import Dict, List, Tuple


ATTENTION_STATUSES = {
    "failed",
    "blocked",
    "lineup-change-refused",
    "lineup-change-review-required",
    "attention-required",
}

FIELD_LABELS = {
    "odds": "Odds",
    "TapologyFighterURL": "Tapology URL",
    "TapologyMatchConfidence": "Tapology match confidence",
    "Rank": "Rank",
    "Streak": "Streak",
    "style": "Style",
    "KO_TKO_Wins": "KO/TKO wins",
    "KO_TKO_Losses": "KO/TKO losses",
    "Submission_Wins": "Submission wins",
    "Submission_Losses": "Submission losses",
    "Decision_Wins": "Decision wins",
    "Decision_Losses": "Decision losses",
}


def positive_missing_fields(summary: Dict) -> List[Tuple[str, int]]:
    return [
        (field, int(count))
        for field, count in (summary.get("byField") or {}).items()
        if int(count or 0) > 0
    ]


def format_missing_summary(summary: Dict) -> str:
    fields = positive_missing_fields(summary or {})
    if not fields:
        return "None"
    missing_count = int(summary.get("missingValueCount") or sum(count for _, count in fields))
    affected_rows = summary.get("rowsWithMissingValues")
    total_rows = summary.get("rowCount")
    row_detail = (
        f" across {affected_rows}/{total_rows} fighter rows"
        if affected_rows is not None and total_rows is not None
        else ""
    )
    field_detail = ", ".join(
        f"{FIELD_LABELS.get(field, field)}: {count}" for field, count in fields
    )
    return f"{missing_count} values{row_detail} ({field_detail})"


def format_filled_summary(summary: Dict) -> str:
    fields = positive_missing_fields(summary or {})
    if not fields:
        return "None"
    return ", ".join(
        f"{FIELD_LABELS.get(field, field)}: +{count}" for field, count in fields
    )


def report_needs_attention(report: Dict, workflow_outcome: str) -> bool:
    if workflow_outcome.lower() == "failure" or report.get("status") in ATTENTION_STATUSES:
        return True
    return any(result.get("status") in ATTENTION_STATUSES for result in report.get("results", []))


def build_subject(report: Dict, workflow_outcome: str) -> str:
    results = report.get("results") or []
    event_names = [result.get("eventName") for result in results if result.get("eventName")]
    if report_needs_attention(report, workflow_outcome):
        prefix = "ACTION REQUIRED"
    elif report.get("status") == "no-events-due":
        prefix = "No upcoming cards"
    elif report.get("dryRun"):
        prefix = "Dry run complete"
    else:
        prefix = "Scrape complete"

    event_label = ", ".join(event_names[:2]) if event_names else "Fight-card automation"
    return f"[Fight Picks] {prefix}: {event_label}"


def format_fighters(fighters: List[Dict]) -> str:
    return " vs. ".join(fighter.get("name") or str(fighter.get("fighterId")) for fighter in fighters)


def lineup_change_lines(result: Dict) -> List[str]:
    changes = result.get("lineupChanges") or {}
    if not changes.get("changed"):
        return []

    added = changes.get("addedFights") or []
    removed = changes.get("removedFights") or []
    changed = changes.get("changedFights") or []
    lines = [
        "Lineup changes: "
        f"{len(added)} added, {len(removed)} removed, {len(changed)} changed, "
        f"{changes.get('unchangedFightCount', 0)} unchanged"
    ]
    for fight in added:
        lines.append(f"Added fight {fight.get('fightId')}: {format_fighters(fight.get('fighters') or [])}")
    for fight in removed:
        lines.append(
            f"Removed fight {fight.get('fightId')}: {format_fighters(fight.get('fighters') or [])}"
        )
    for fight in changed:
        lines.append(
            f"Changed fight {fight.get('fightId')}: "
            f"{format_fighters(fight.get('before') or [])} -> "
            f"{format_fighters(fight.get('after') or [])}"
        )

    impact = result.get("predictionImpact") or {}
    if impact:
        lines.append(
            "Prediction impact: "
            f"{impact.get('affectedPredictionCount', 0)} affected, "
            f"{impact.get('preservedPredictionCount', 0)} preserved"
        )
    return lines


def event_discovery_lines(report: Dict) -> List[str]:
    discovery = report.get("eventDiscovery") or {}
    if not discovery:
        return []

    status = discovery.get("status") or "unknown"
    lines = ["UFC event discovery", f"Outcome: {status}"]
    if discovery.get("reason"):
        lines.append(f"Reason: {discovery['reason']}")
    if discovery.get("error"):
        lines.append(f"Error: {discovery['error']}")

    if status == "complete":
        lines.extend([
            f"UFC IDs scanned: {discovery.get('scanned', 0)}",
            f"API events found: {discovery.get('apiEventsFound', 0)}",
            f"Eligible UFC events: {discovery.get('eligibleEventsFound', 0)}",
            f"Events added: {discovery.get('insertedCount', 0)}",
            f"Events updated: {discovery.get('updatedCount', 0)}",
            f"Events unchanged: {discovery.get('unchangedCount', 0)}",
            f"Event posters added: {discovery.get('posterCount', 0)}",
        ])
        for event in discovery.get("changedEvents") or []:
            event_date = f" on {event['date']}" if event.get("date") else ""
            lines.append(
                f"{str(event.get('action') or 'changed').title()} event "
                f"{event.get('id')}: {event.get('name') or 'Unknown'}{event_date}"
            )
        for error in discovery.get("posterErrors") or []:
            lines.append(f"Poster warning: {error}")

    return lines


def result_lines(result: Dict) -> List[str]:
    event_date = f" on {result['eventDate']}" if result.get("eventDate") else ""
    lines = [
        f"Event: {result.get('eventName') or 'Unknown'} ({result.get('eventId') or 'no ID'}){event_date}",
        f"Outcome: {result.get('status') or 'unknown'}",
    ]
    if result.get("action"):
        lines.append(f"Planned action: {result['action']}")
    if result.get("reason"):
        lines.append(f"Reason: {result['reason']}")
    if result.get("fightCount") is not None:
        lines.append(f"Fights: {result['fightCount']}")
    if result.get("rowCount") is not None:
        lines.append(f"Fighter rows: {result['rowCount']}")
    if result.get("profileLimit") is not None:
        lines.append(f"Tapology profile attempt limit: {result['profileLimit']}")
    if result.get("filledValueCount") is not None:
        lines.append(f"New blank values filled: {result['filledValueCount']}")
    newly_filled = result.get("newlyFilled") or {}
    if newly_filled.get("newRowCount"):
        lines.append(f"New fighter rows discovered: {newly_filled['newRowCount']}")
    if newly_filled:
        lines.append(f"New information by field: {format_filled_summary(newly_filled)}")
    lines.extend(lineup_change_lines(result))

    if result.get("existingMissing"):
        lines.append(
            f"Missing before this run: {format_missing_summary(result['existingMissing'])}"
        )
    missing = result.get("remainingMissing") or result.get("existingMissing") or {}
    lines.append(f"Still missing: {format_missing_summary(missing)}")

    for label, values in (("Warning", result.get("warnings")), ("Blocker", result.get("blockers"))):
        for value in values or []:
            lines.append(f"{label}: {value}")
    if result.get("error"):
        lines.append(f"Error: {result['error']}")
    return lines


def build_text_report(report: Dict, workflow_outcome: str, run_url: str) -> str:
    lines = [
        "Fight Picks scrape automation report",
        "",
        f"Workflow outcome: {workflow_outcome or 'unknown'}",
        f"Report status: {report.get('status') or 'unknown'}",
        f"Checked at: {report.get('checkedAt') or 'unknown'}",
        f"Time zone: {report.get('timeZone') or 'unknown'}",
        f"Dry run: {'yes' if report.get('dryRun') else 'no'}",
    ]
    if run_url:
        lines.append(f"GitHub run: {run_url}")
    if report.get("error"):
        lines.extend(["", f"Fatal error: {report['error']}"])

    discovery_lines = event_discovery_lines(report)
    if discovery_lines:
        lines.extend(["", "-" * 64, *discovery_lines])

    results = report.get("results") or []
    if not results:
        no_results_message = (
            "No per-event results were available."
            if report.get("error")
            else "No incomplete upcoming event was found to process during this run."
        )
        lines.extend(["", no_results_message])
    else:
        for result in results:
            lines.extend(["", "-" * 64, *result_lines(result)])
    return "\n".join(lines).strip() + "\n"


def build_html_report(report: Dict, workflow_outcome: str, run_url: str) -> str:
    text_report = build_text_report(report, workflow_outcome, run_url)
    report_body = text_report.removeprefix("Fight Picks scrape automation report\n\n")
    return (
        "<!doctype html><html><body style=\"font-family:Arial,sans-serif;color:#202124\">"
        "<h2>Fight Picks scrape automation report</h2>"
        f"<pre style=\"white-space:pre-wrap;font:14px/1.5 Arial,sans-serif\">{html.escape(report_body)}</pre>"
        "</body></html>"
    )


def load_report(path: Path) -> Dict:
    if not path.exists():
        return {
            "status": "failed",
            "checkedAt": datetime.now(timezone.utc).isoformat(),
            "timeZone": "unknown",
            "dryRun": False,
            "results": [],
            "error": "The automation process ended before it produced a structured report.",
        }

    with path.open("r", encoding="utf-8") as report_file:
        report = json.load(report_file)
    if not isinstance(report, dict):
        raise ValueError("Automation report must be a JSON object.")
    return report


def send_report(report: Dict, workflow_outcome: str, run_url: str) -> None:
    smtp_user = os.environ.get("AUTOMATION_EMAIL_FROM", "").strip()
    smtp_password = os.environ.get("AUTOMATION_GMAIL_APP_PASSWORD", "").replace(" ", "").strip()
    recipient = os.environ.get("AUTOMATION_EMAIL_TO", "").strip()
    if not smtp_user or not smtp_password or not recipient:
        raise RuntimeError(
            "Missing AUTOMATION_EMAIL_FROM, AUTOMATION_EMAIL_TO, or AUTOMATION_GMAIL_APP_PASSWORD."
        )

    message = EmailMessage()
    message["Subject"] = build_subject(report, workflow_outcome)
    message["From"] = smtp_user
    message["To"] = recipient
    message.set_content(build_text_report(report, workflow_outcome, run_url))
    message.add_alternative(build_html_report(report, workflow_outcome, run_url), subtype="html")

    context = ssl.create_default_context()
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=context, timeout=30) as smtp:
        smtp.login(smtp_user, smtp_password)
        smtp.send_message(message)


def main() -> None:
    parser = argparse.ArgumentParser(description="Email a fight-card automation JSON report.")
    parser.add_argument("report", type=Path)
    parser.add_argument("--preview", action="store_true", help="Print the email instead of sending it.")
    args = parser.parse_args()

    report = load_report(args.report)
    workflow_outcome = os.environ.get("AUTOMATION_WORKFLOW_OUTCOME", "unknown")
    run_url = os.environ.get("AUTOMATION_RUN_URL", "")

    if args.preview:
        print(build_subject(report, workflow_outcome))
        print()
        print(build_text_report(report, workflow_outcome, run_url))
        return

    send_report(report, workflow_outcome, run_url)
    print(f"Automation report emailed to {os.environ.get('AUTOMATION_EMAIL_TO', '').strip()}.")


if __name__ == "__main__":
    main()
