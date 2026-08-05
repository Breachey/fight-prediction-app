# Changelog

All notable changes to this project will be documented in this file.

## 0.5.0 - 2026-08-05

### Added

- Added scheduled fight-card automation that targets incomplete events on fight day or the day before.
- Added incremental Tapology enrichment with per-run profile limits, manual event overrides, dry runs, and GitHub Actions logging.

### Changed

- Automated refreshes preserve populated odds and fighter stats, fill blanks only, and refuse lineup changes or cards that have started.

## 0.4.0 - 2026-07-30

### Added

- Added a durable Tapology scrape log to the fight-card editor with complete, partial, and failed outcomes.
- Added per-attempt diagnostics for sources, updated and missing fields, fallback errors, and streak-specific failure reasons.

### Fixed

- Preserved streak and style values from partial Tapology responses when Wikipedia is needed to fill missing method totals.
- Reported when streak is unavailable because Tapology was blocked and the fallback source cannot provide current streak.

## 0.3.1 - 2026-07-29

### Fixed

- Added an admin action that rebuilds the imported fight-card editor from Supabase after a page refresh.
- Restored full-card saves and individual or bulk Tapology scrape controls in reopened editor sessions.

## 0.3.0 - 2026-07-29

### Added

- Kept the fight-card preview editor open after import so admins can continue editing any fighter field or odds.
- Added post-import write-through saves for individual fighters and the full card.

### Changed

- Preview Tapology scrapes now update matching imported fight-card rows immediately while continuing to refresh shared fighter data.
- Imported preview sessions prevent duplicate imports and clearly identify saves that update the stored fight card.

## 0.2.0 - 2026-07-29

### Added

- Added per-fighter Tapology scrape actions to fight-card previews when a valid fighter URL is available.
- Added a bulk preview action that attempts every valid Tapology fighter URL with progress and partial-failure reporting.

### Changed

- Successful preview scrapes now refresh the active preview and persist fighter profile data to the shared fighters and Tapology cache tables.

## 0.1.0 - 2026-07-28

### Added

- Added a full-card admin editor for previewed and imported fight cards, including odds, Tapology URLs, style, streak, and finish breakdowns.
- Added All, Missing, and Changed row filters plus per-fighter and save-all actions.
- Added preview progress saves so manual corrections can be committed incrementally before import.

### Changed

- Kept manual odds edits scoped to the event fight-card row while fighter profile stats continue to update the shared fighters table.

## 0.0.33 - 2026-07-28

### Fixed

- Prevented cached fight-card stats from being written back as fresh fighter data during import.
- Limited cached streak reuse to result-driven, manually entered streak, or genuinely refreshed fighter-profile sources.
- Prevented Tapology event-page URL matches from relabeling cached fighter stats as freshly scraped.

## 0.0.32 - 2026-07-13

### Security

- Enabled row-level security on the Prop Pix results table.

## 0.0.31 - 2026-07-13

### Added

- Added durable Prop Pix result records for future winner and leaderboard reporting.
- Added personalized closure notifications that identify correct picks and show the wager owed for incorrect picks.

## 0.0.30 - 2026-07-13

### Changed

- Added dropdown-based outcome reporting for option Prop Pix bets, including an `Other` choice with custom entry.

## 0.0.29 - 2026-07-13

### Changed

- Locked Prop Pix votes after submission and revealed voter names and answers only to users who have voted.

## 0.0.28 - 2026-07-13

### Changed

- Replaced the notification emoji with a transparent white outline bell, added a red unread badge, and made unread notifications stay fixed in the page corner.

## 0.0.27 - 2026-07-13

### Added

- Added an admin-only Prop Pix closure override for resolving a single pending claim without a second voter confirmation.

## 0.0.26 - 2026-07-13

### Changed

- Matched Prop Pix surfaces, controls, borders, and emphasis colors to the selected event poster theme.

## 0.0.25 - 2026-07-13

### Changed

- Removed decorative Prop Pix accent rails and documented that asymmetric edge accents require explicit user direction.

## 0.0.24 - 2026-07-13

### Changed

- Restyled Prop Pix to follow the logo palette, red-left/blue-right composition, and compact radius guidelines.

## 0.0.23 - 2026-07-13

### Added

- Added mandatory repository style guidelines covering the logo palette, red-left/blue-right composition, radius tokens, and prohibited cyan, neon, and purple-led treatments.

## 0.0.22 - 2026-07-13

### Changed

- Replaced the Prop Pix yellow accent with the app's cyan palette and removed the active tab border treatment.

## 0.0.21 - 2026-07-13

### Added

- Added event-scoped Prop Pix bets with dropdown or manual answers, wagers, voter claims, confirmation-based closure, and reusable in-app notifications.

## 0.0.20 - 2026-07-13

### Changed

- Replaced the leaderboard win-streak fire effect with an orange frosted overlay.

## 0.0.19 - 2026-07-13

### Changed

- Made the leaderboard win-streak fire overlay subtler with slower, rougher movement.

## 0.0.18 - 2026-07-13

### Changed

- Delayed the leaderboard win-streak fire overlay until a 3-win streak and made its motion more sporadic.

## 0.0.17 - 2026-07-13

### Changed

- Made the leaderboard win-streak fire overlay start more subtly.

## 0.0.16 - 2026-07-13

### Changed

- Changed leaderboard win streak fire to a scaling overlay behind playercard text.

## 0.0.15 - 2026-07-13

### Added

- Added a scaling frost overlay for leaderboard loss streaks.

### Changed

- Changed leaderboard win streak fire from an interior fill to a border effect.

## 0.0.14 - 2026-07-13

### Changed

- Ranked pick twins and biggest nemeses with confidence-weighted shared-sample scoring instead of raw overlap percentage or raw swing-fight volume.

## 0.0.13 - 2026-07-12

### Added

- Added rank and point change indicators to event and season leaderboards.

## 0.0.12 - 2026-07-12

### Fixed

- Kept the footer version label tied to the client package version.

### Changed

- Updated repository instructions to include the footer version display in release checks.

## 0.0.11 - 2026-07-12

### Fixed

- Kept wrapped leaderboard usernames left-aligned.

## 0.0.10 - 2026-07-12

### Fixed

- Allowed long leaderboard usernames to wrap instead of being clipped.

## 0.0.9 - 2026-07-12

### Fixed

- Prevented leaderboard rivalry badges from overlapping streak, crown, and stat content.

## 0.0.8 - 2026-07-12

### Added

- Added a scaling fire effect behind leaderboard playercards for win streaks.

## 0.0.7 - 2026-07-12

### Fixed

- Improved leaderboard stat readability on light playercards.

## 0.0.6 - 2026-07-12

### Fixed

- Removed the remaining current-user rim from leaderboard playercard rows.

## 0.0.5 - 2026-07-12

### Fixed

- Removed the bright default rim from leaderboard playercard rows.

## 0.0.4 - 2026-07-12

### Added

- Added leaderboard fight and event counts beneath the selected leaderboard title.
- Added database migrations to default unassigned playercards to Fight Kit and move old default selections from playercard 1 to 16.

### Changed

- Default new user registrations to playercard 16.
- Matched leaderboard toggle button radius to the Event Selector admin button radius.
- Made the desktop playercard vault scroll vertically when expanded.
- Muted playercard selector tile borders and removed the selected-card rim from playercard art.

### Fixed

- Aligned Stats crown totals with the human-only leaderboard crown calculation.
- Made the Stats page default to the current season and refresh its cached stats payload.

## 0.0.3 - 2026-07-12

### Added

- Added repository instructions requiring changelog updates and Semantic Versioning for completed changes.
- Started the project changelog with versioned entries tied to the app version.
