## Server Scraper

This directory holds the UFC fight-card scraping pipeline that feeds the admin preview/import flow.

Active pieces:

- `scrape_full_ufc_event_with_tapology.py`: primary scraper used by the server import helper
- `tapology_event_map.csv`: event-to-Tapology overrides for difficult matches
- `tapology_cache/`: emergency local JSON fallback when Supabase cache and live Tapology are unavailable
- `requirements.txt`: local Python dependencies for scraping
- `fight_cards/`: historical exported CSVs and sample outputs

### Data flow and reliability

The UFC live JSON feed supplies the event, bout order, corners, fighter IDs,
records, scheduling, and basic biography. FightOdds supplies odds, followed by
BestFightOdds, Covers, and UFC event pages for missing prices. Fighter enrichment
uses Sherdog for record/method data, UFC.com for official profile details and
performance metrics, and Wikipedia for missing method data. Database and local
Tapology caches plus a limited live Tapology refresh fill remaining gaps.

The September 2026 reliability review found and fixed these failure paths:

- UFC feeds could return the wrong event, malformed JSON, or an incomplete card
  without trying the other endpoint. Imports and odds refreshes now validate
  event identity, unique fight/fighter IDs, names, two fighters per bout, and
  Red/Blue corners before enrichment. Schedule discovery still permits events
  without published lineups. Errors include both endpoint failures.
- Transient UFC event and primary profile requests previously failed on their
  first attempt. These GETs now retry once on connection/timeouts or HTTP
  429/500/502/503/504. Retry waits respect source spacing and short `Retry-After`
  values; longer or invalid values defer to the next source. Permanent HTTP
  failures and TLS errors are not retried. This policy does not wrap database
  writes or Tapology's existing retry mechanism.
- One failed Sherdog or Wikipedia candidate could abandon later matches.
  Candidate failures are now recorded while the remaining candidates are tried.
- Empty Tapology parses were counted as successful, and partial profiles could
  overwrite existing values with blanks. Empty parses now count as failures;
  nonblank live values refresh cached fields while validated primary values,
  including zero, retain priority in the exported card.
- Null optional biography/location objects could crash CSV export. These now
  produce missing values instead.

Every full scrape writes `<output.csv>.meta.json`. Its `fighter_sources` object
is keyed by UFC FighterId and includes primary-source field provenance,
missing fields, source failures, and rejected candidate diagnostics. This
describes the primary lookup stage; later Tapology/cache fills are not labeled
as live primary data. Admin preview files remain temporary.

Known limits: both UFC endpoints are still required alternatives to the same
upstream feed, so a structurally valid but stale card cannot be detected by
shape checks alone. HTML changes, bot blocks, unpublished odds, and stale caches
can still leave incomplete data. The existing five-minute server preview
deadline remains; widespread slow responses can still exhaust it. No full
production import is required to run the offline regression tests below.

```bash
npm --prefix Server test
```

Useful commands from the repo root:

```bash
npm --prefix Server run install:scraper-deps
npm run scrape:fight-card -- 1302
npm run sync:tapology-cache -- --event-id=1313
npm run smoke:fight-card-import -- 1302
```
