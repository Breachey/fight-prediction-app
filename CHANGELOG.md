# Changelog

All notable changes to this project will be documented in this file.

## 0.25.1 - 2026-08-24

### Fixed

- Made manual and automatic existing-card refreshes update newly scraped odds while preserving previously populated fighter data and filling only missing values.
- Centralized existing-card merge behavior so lineup removals and replacements use the newly scraped card without erasing unchanged fighters' stored enrichment.

## 0.25.0 - 2026-08-24

### Changed

- Accepted populated streaks from the record-validated fighter source chain without requiring manual verification.
- Removed streak verification badges and buttons from the manual fight-card preview and imported fight-card editor.

## 0.24.0 - 2026-08-24

### Added

- Added live phase, source, fighter-count, and percentage progress to manual fight-card preview refreshes.
- Added a short-lived admin progress endpoint so the preview UI can report scraper work without changing scheduled automation behavior.

## 0.23.1 - 2026-08-23

### Fixed

- Accepted commonly formatted 10-digit phone numbers during login and registration while normalizing API lookups and stored values to digits only.

## 0.23.0 - 2026-08-23

### Added

- Added validated Sherdog, UFC.com, and Wikipedia fighter enrichment to automatic fight-card scrapes and both manual fighter-stat editors.
- Added Sherdog-backed verified streak anchors and an explicit database-free scraper mode for safe live trials.

### Changed

- Made Tapology an optional final fallback instead of a required fighter-stat source while retaining FightOdds as the primary odds provider.
- Updated fight-card completeness checks and admin labels to measure populated fighter stats instead of requiring Tapology profile URLs.

## 0.22.0 - 2026-08-21

### Added

- Added full born and fighting-out-of locations to expanded fighter details.

### Changed

- Grouped expanded fighter stats into Physical, Fight Profile, Background, and Method Breakdown sections for faster scanning.

## 0.21.1 - 2026-08-21

### Fixed

- Made scheduled fight-card automation persist newly assigned referees even when no other fighter enrichment changed.

## 0.21.0 - 2026-08-21

### Added

- Added assigned referees beneath each fight's scheduled round count, with no placeholder when the UFC feed has not assigned one.
- Added diagonally split fighter-card flag backgrounds when birth country and fighting-out-of country differ.

### Changed

- Persisted UFC referee names during fight-card imports and exposed birth countries in fight responses.

## 0.20.0 - 2026-08-21

### Added

- Added automatic UFC event discovery to every scheduled fight-card automation run so new numbered and Fight Night events no longer require the admin discovery button.
- Added event-discovery counts, changed-event details, poster results, and discovery errors to automation emails.

### Changed

- Reloaded upcoming events after discovery so newly added cards can be selected for fight-card enrichment in the same run.
- Kept dry runs write-free by explicitly skipping automatic event discovery.

## 0.19.1 - 2026-08-21

### Fixed

- Applied the fight-result outcome migration to production so fight and picks-context requests can load the new result type.
- Aligned the avatar accent-color migration timestamp with production history so future database pushes remain synchronized.

## 0.19.0 - 2026-08-21

### Added

- Added Draw and No Contest fight outcomes to the admin result controls and fight-card result display.

### Changed

- Made Draw and No Contest complete a fight while awarding every submitted pick zero points and leaving both fighters without a win or loss result.

## 0.18.4 - 2026-08-21

### Fixed

- Made the scrape and email steps share one absolute automation-report path so scrape emails contain the structured per-event results instead of the missing-report fallback.
- Replaced the misleading no-upcoming-event message with a no-results notice when report generation genuinely fails, and removed the duplicated HTML email title.

## 0.18.3 - 2026-08-21

### Fixed

- Allowed fight-card imports for mononymous fighters when the UFC feed supplies a last name without a first name, while continuing to reject rows with no name at all.

## 0.18.2 - 2026-08-21

### Changed

- Made scheduled fight-card automation continuously target the nearest incomplete upcoming cards regardless of how far away they are.
- Rotated limited Tapology profile attempts across never-tried and least-recently-tried fighters so partial or failed profiles cannot stall card-wide enrichment.
- Expanded scrape emails with event dates, before-and-after missing-data summaries, newly filled fields, and newly discovered fighter rows.

## 0.18.1 - 2026-08-19

### Changed

- Moved the event friend comparison below the Event leaderboard so standings remain the first event-specific view.

## 0.18.0 - 2026-08-19

### Added

- Added an event-specific friend comparison to the Event leaderboard with a human participant picker, head-to-head points, agreements, disagreements, and remaining sweat fights.
- Added fight-by-fight comparison rows that reveal a friend's pick only after the signed-in user has picked that fight or its result is complete.

### Changed

- Kept personalized comparisons in authenticated, memory-only caching and refreshed unfinished matchups with live leaderboard results.

## 0.17.0 - 2026-08-19

### Added

- Added a human-only recap to completed event leaderboards with a three-player podium and awards for upset calls, contrarian winners, group bad beats, hot streaks, perfect main cards, and final-fight rank jumps.
- Added native sharing with a clipboard fallback for compact event recap summaries.

### Changed

- Kept AI accounts out of recap standings and awards so completed-event celebrations reflect the friends pool.

## 0.16.0 - 2026-08-19

### Added

- Added automatic 15-second fight-card and result refreshes while the Picks view is visible, with immediate focus revalidation and a manual refresh control.

### Changed

- Paused fight-card polling in hidden tabs and after an event is complete or every fight is resolved.
- Limited live result queries to the selected event and bypassed response caching so updated cards and outcomes appear promptly.

## 0.15.2 - 2026-08-14

### Changed

- Replaced dense-list mobile avatar motion with one lightweight animation on the signed-in user's avatar while keeping every other avatar and contextual streak or rivalry treatment static.
- Removed mobile leaderboard scroll and visibility animation bookkeeping while retaining desktop visibility gating.

## 0.15.1 - 2026-08-13

### Changed

- Removed the light sticker edge from avatars while retaining their lightweight offset shadow.

## 0.15.0 - 2026-08-13

### Added

- Added an independently customizable character accent color, rendered above avatar patterns and persisted for every user.
- Added a lightweight vector edge and shadow that gives avatars a sticker-like presence without reintroducing expensive SVG filters.

### Changed

- Renamed the Red Panda character label to Bear and Golden Retriever to Mouse-dog while preserving existing saved avatar IDs.

## 0.14.1 - 2026-08-13

### Changed

- Limited leaderboard avatar animation to nearby rows, paused active motion while scrolling or hidden, and reduced mobile SVG effects.
- Added offscreen leaderboard-card rendering containment to keep long standings smooth on mobile devices.

## 0.14.0 - 2026-08-13

### Changed

- Rebuilt Stats as a compact, mobile-first dashboard with a stable summary header, neutral period tabs, flatter data sections, and brand-safe chart and tier colors.
- Added player-card identity to the pick-twin and nemesis insights while preserving every existing metric, benchmark, breakdown, and community view.
- Made event tiers horizontally scannable on narrow screens and kept event artwork fully visible inside stable poster tiles.

### Removed

- Removed the oversized year hero, decorative bars, rainbow tier styling, nested gradient panels, backdrop blur, count-up behavior, and card entrance animation from Stats.

## 0.13.3 - 2026-08-13

### Changed

- Expanded the style guidelines with the current app shell, event strip, fight workflow, heading hierarchy, leaderboard, avatar, motion, and performance rules.
- Added an explicit design-source hierarchy plus external inspiration and internal implementation references.
- Corrected documented radius values to match the canonical client tokens.

## 0.13.2 - 2026-08-13

### Fixed

- Kept event status labels fully contained within their poster cards at mobile widths.

## 0.13.1 - 2026-08-13

### Changed

- Rebuilt the playercard selector as a compact, mobile-first two-column picker with clearer selected and locked states.
- Deferred playercard and unlock-detail loading until the selector is opened and applied selections optimistically for a faster profile flow.

## 0.13.0 - 2026-08-13

### Added

- Added Shrek-inspired ogre and Golden Retriever character silhouettes.
- Added Checker, Drips, Waves, and Many Eyes patterns plus eight new mouthless expressions.
- Added a one-click cursed avatar generator for deliberately strange character, pattern, and expression combinations.

### Changed

- Rendered pattern and character-detail colors at their selected hex values instead of as pale translucent overlays.
- Expanded randomized new-user avatars and persisted validation to cover all six characters, eight patterns, and eighteen expressions.

## 0.12.0 - 2026-08-13

### Added

- Added independent eye and pattern color pickers with persisted six-digit color validation.
- Added escalating fire and frost avatar effects for leaderboard win and loss streaks.
- Added occasional heart-eye reactions for pick twins and angry-eye/rude-tentacle reactions for nemeses.

### Changed

- Kept the avatar preview visible while scrolling through customizer settings on desktop and mobile.
- Moved streak styling off leaderboard card backgrounds and onto the avatars themselves.
- Upgraded every existing avatar with contrasting detail colors and extended randomized new-user defaults.

## 0.11.0 - 2026-08-13

### Added

- Added Kirby, Cloudee, and Red Panda character silhouettes alongside the original squid.
- Added six mouthless eye expressions: Tiny, Wide, Side eye, Skeptical, Determined, and Curious.

### Changed

- Rebuilt the squid as one connected silhouette without an internal head-to-tentacle border.
- Removed avatar backing plates, enlarged avatars, and enabled lightweight movement and blinking throughout leaderboards and fight vote cards.
- Extended randomized new-user avatars and persisted avatar validation to cover character types and the expanded expression set.

## 0.10.0 - 2026-08-13

### Added

- Added a continuous avatar color picker and procedural controls for body width, height, curve, tentacle spread and length, eye spacing, overall size, and motion.
- Added lightweight SVG and CSS motion with drifting, blinking eyes and reduced-motion support.

### Changed

- Randomized every existing user's squid avatar and made both the app registration flow and database default generate a unique valid avatar for new users.
- Enlarged the live avatar preview and selectively animated prominent avatars while keeping dense player lists inexpensive to render.

## 0.9.0 - 2026-08-13

### Added

- Added customizable squid avatars with brand-safe colors, body shapes, patterns, eye styles, and a randomizer.
- Added authenticated avatar persistence with validated Supabase configuration data for every user.

### Changed

- Displayed each user's squid avatar to the left of their username on player cards, vote cards, rival cards, and leaderboards.

## 0.8.5 - 2026-08-13

### Changed

- Standardized page, content, section, and subsection heading styles across the client.
- Added bottom-to-top fight-card resume behavior for the next missing pick or next live fight.
- Advanced the Picks workspace to the next unsubmitted fight after a successful vote.

### Fixed

- Kept the active fight anchored below the sticky header when collapsing expanded fighter stats.

## 0.8.4 - 2026-08-13

### Changed

- Consolidated AI-user visibility into one persistent footer preference shared by Picks and Leaderboard.
- Replaced the shaded leaderboard period buttons with compact, neutral text tabs.
- Changed event leaderboard deltas to show rank movement since the latest completed fight and omit point deltas.

## 0.8.3 - 2026-08-13

### Changed

- Moved the mobile Picks, Prop Pix, and Leaderboard workspace navigation into a persistent bottom bar.
- Reworked fighter like and dislike reminders with labeled controls, portrait reaction animations, and persistent image badges visible while stats are collapsed.
- Simplified events without poster artwork to a high-contrast event name and date card.

## 0.8.2 - 2026-08-13

### Changed

- Fit complete event poster artwork inside the event strip cards instead of cropping it to fill the frame.
- Parallelized event leaderboard queries, reused loaded user and result data, and rendered cached boards immediately while refreshing them in the background.

## 0.8.1 - 2026-08-13

### Fixed

- Contained the authenticated workspace at narrow mobile widths so the header, tabs, event strip, admin summary, and fight content no longer force a desktop-width page.
- Centered the URL-selected event after initial event reconciliation and removed the residual 320px body minimum that could create horizontal scrolling.

## 0.8.0 - 2026-08-13

### Added

- Added a mobile-first event workspace with URL-backed Picks, Prop Pix, and Leaderboard views plus a persistent desktop navigation rail.
- Added a private event-scoped picks context endpoint and focused tests for request caching, workspace state, polling, vote totals, reminders, and prior outcomes.

### Changed

- Reworked the event picker into a quiet, snap-scrolling poster strip and deferred secondary workspace code and data until each view is opened.
- Consolidated pick loading, paused background polling when hidden or complete, and removed redundant Profile and Stats leaderboard requests.
- Simplified login, Stats, Profile, fight cards, controls, colors, motion, blur, shadows, and loading states around the Fight Picks brand palette.

### Fixed

- Preserved locally selected, unsubmitted picks across event changes and added optimistic per-fight submission with rollback on failure.

## 0.7.1 - 2026-08-08

### Fixed

- Allowed the configured Google stylesheet and font origins in the client Content Security Policy so the Permanent Marker display font loads in production.

## 0.7.0 - 2026-08-07

### Added

- Added verified per-fighter streak anchors with manual and live Tapology provenance, record checks, and admin verification controls.
- Added a server-only fight-result ledger that recomputes current streaks chronologically and safely handles result corrections.

### Changed

- Existing cached streaks are now treated as unverified until an admin confirms them or a live Tapology profile returns a current MMA streak.
- Fight-card previews only reuse verified streaks whose expected record matches the current UFC record; historical fight-card snapshots remain unchanged.

## 0.6.0 - 2026-08-07

### Security

- Added revocable 30-day user sessions and bound predictions, Prop Pix actions, notifications, reminders, and player-card updates to the authenticated user.
- Added a Supabase lockdown migration that enables RLS across public tables and removes direct anonymous/authenticated table, sequence, and function access.
- Restricted individual future-pick visibility until the viewer has submitted a pick, revoked pre-hardening admin sessions, and capped future admin sessions at 30 days.
- Added production browser security headers, removed internal database error details from public responses, and patched Node, Python, build, and lint dependencies.

### Changed

- Login remains phone-number based, but users must log in again once after deployment to receive the new session token.

## 0.5.2 - 2026-08-07

### Changed

- Made automated lineup reconciliation prediction-aware: changes with no affected picks apply automatically, while changes that would invalidate picks require admin review.
- Expanded automation emails with added, removed, and changed fight details plus affected and preserved prediction counts.
- Updated official GitHub workflow actions to their Node 24-compatible major versions.

### Fixed

- Reconciled event 1324 with the current 12-fight UFC lineup without invalidating any predictions.

## 0.5.1 - 2026-08-07

### Added

- Added Gmail reports for every scheduled or manually triggered fight-card automation run.
- Added structured summaries for processed events, filled values, remaining missing data, warnings, blockers, failures, and GitHub run links.

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
