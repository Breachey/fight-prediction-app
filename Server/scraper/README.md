## Server Scraper

This directory holds the UFC fight-card scraping pipeline that feeds the admin preview/import flow.

Active pieces:

- `scrape_full_ufc_event_with_tapology.py`: primary scraper used by the server import helper
- `tapology_event_map.csv`: event-to-Tapology overrides for difficult matches
- `tapology_cache/`: emergency local JSON fallback when Supabase cache and live Tapology are unavailable
- `requirements.txt`: local Python dependencies for scraping
- `fight_cards/`: historical exported CSVs and sample outputs

Useful commands from the repo root:

```bash
npm --prefix Server run install:scraper-deps
npm run scrape:fight-card -- 1302
npm run sync:tapology-cache -- --event-id=1313
npm run smoke:fight-card-import -- 1302
```
