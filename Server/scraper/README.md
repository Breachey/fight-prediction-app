## Server Scraper

This directory holds the UFC fight-card scraping pipeline that feeds the admin preview/import flow.

Active pieces:

- `scrape_full_ufc_event_with_tapology.py`: primary scraper used by the server import helper
- `tapology_event_map.csv`: event-to-Tapology overrides for difficult matches
- `requirements.txt`: local Python dependencies for scraping
- `fight_cards/`: historical exported CSVs and sample outputs

Legacy helpers are kept in `legacy/` for reference while we finish folding any remaining one-off tooling into the app.

Useful commands from the repo root:

```bash
python3 -m pip install -r "Server/scraper/requirements.txt"
npm run scrape:fight-card -- 1302
npm run smoke:fight-card-import -- 1302
```
