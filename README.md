# Fight Picks

Fight Picks is a social UFC prediction app built for fans who want to make picks, follow live results, compete with friends, and track their performance over time. Users can choose winners for upcoming fight cards, compare against community and AI picks, climb leaderboards, unlock player cards, and view personalized stat highlights across a season or all-time.

Created by Brandon Breach and Paul Ruggiero.

For questions, contact [breachey@gmail.com](mailto:breachey@gmail.com).

## Highlights

- Browse UFC events in a season-based event carousel with poster-driven theming.
- Register and log in with a lightweight phone-number-based account flow.
- Make fight picks for each card and compare against community voting trends.
- Toggle AI users on leaderboards and vote views for comparison.
- Track event, season, and overall leaderboard performance.
- View profile pages, rivalry insights, trend charts, benchmarks, and personalized highlights.
- Unlock and equip collectible player cards based on participation.
- Manage event outcomes with admin tools for result updates, cancellations, and finalization.

## Tech Stack

- Frontend: React 18, React Router, Vite
- Backend: Node.js, Express
- Data layer: Supabase
- Deployment: Vercel configs for both client and server
- Styling: Custom CSS with dynamic event-based accent theming

## Project Structure

```text
.
├── Client/                  # React + Vite frontend
├── Server/                  # Express API, importer, and scraper tooling
│   └── scraper/             # Python scraper, Tapology map, and archived fight-card exports
├── supabase/migrations/     # Database schema and policy migrations
├── architecture.md          # High-level architecture diagram
└── README.md
```

## Core Features

### Event and Fight Experience

The app loads UFC events from Supabase, presents them in a mobile-friendly selector, and displays each fight with supporting details like records, reach, stance, odds, rankings, and nationality. Users can submit picks per fight and revisit completed cards after results are finalized.

### Social Competition

Fight Picks emphasizes competition and community. Users can compare picks against other players, inspect vote breakdowns, see event-specific and long-running leaderboards, and surface rivalry markers like pick twins and biggest nemeses.

### Profiles, Stats, and Unlocks

Each user has a profile and highlights experience that surfaces accuracy, points, best and worst events, fighter trends, benchmark comparisons, streaks, and other seasonal insights. The player card system adds an unlock layer tied to participation in events.

## Getting Started

### 1. Install dependencies

From the project root:

```bash
npm install
npm install --prefix Client
npm install --prefix Server
```

### 2. Configure environment variables

Create a `Server/.env` file:

```env
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
ADMIN_SESSION_TTL_HOURS=720
PORT=3001
ALLOWED_ORIGINS=http://localhost:5173
IMAGE_PROXY_ALLOWED_HOSTS=images.tapology.com
DEBUG_SERVER_LOGS=false
ENABLE_LEGACY_ADMIN_MIGRATION_ROUTES=false
```

Create a `Client/.env.local` file:

```env
VITE_API_URL=http://localhost:3001
```

Notes:

- `SUPABASE_SERVICE_ROLE_KEY` must stay on the server only.
- Admin actions now require a server-issued admin session token. Any user with `users.user_type = 'admin'` receives one on login.
- `ADMIN_SESSION_TTL_HOURS` controls how long admin sessions stay valid before the admin needs to log in again.
- `ALLOWED_ORIGINS` accepts a comma-separated list of additional allowed origins.
- `IMAGE_PROXY_ALLOWED_HOSTS` accepts a comma-separated list of approved external image hosts.
- `DEBUG_SERVER_LOGS=true` enables verbose request/debug logging for local troubleshooting.
- `ENABLE_LEGACY_ADMIN_MIGRATION_ROUTES=true` temporarily exposes legacy admin migration endpoints.
- At least one user must already be marked as `admin` in Supabase to bootstrap admin access.

Install the local scraper dependencies before using the admin fight-card import flow:

```bash
npm --prefix Server run install:scraper-deps
```

### 3. Run the app locally

Start the API:

```bash
npm run dev:server
```

In a second terminal, start the frontend:

```bash
npm run dev:client
```

The client runs through Vite and defaults to `http://localhost:5173`. The API defaults to `http://localhost:3001`.

## Available Scripts

From the repository root:

- `npm run dev` starts the client dev server
- `npm run dev:client` starts the client dev server
- `npm run dev:server` starts the Express server
- `npm run build` builds the frontend
- `npm run lint` runs frontend linting
- `npm run scrape:fight-card -- 1302` runs the integrated Python scraper manually for one event and writes the CSV under `Server/scraper/fight_cards`
- `npm run sync:fighter-style -- --event-id=1302` backfills the `fighter_style` table from imported fight-card rows for one event
- `npm run smoke:fight-card-import -- 1302` previews and imports a single event fight card directly against Supabase, then verifies the resulting row and fight counts
- `npm run start` starts the server

You can also run the smoke test in preview-only mode:

```bash
npm run smoke:fight-card-import -- 1302 --preview-only
```

## Database and Backend Notes

- Supabase is the source of truth for users, events, fights, predictions, results, player cards, and highlights-related data.
- Database changes live in [`supabase/migrations`](./supabase/migrations).
- The Express API exposes endpoints for authentication, fight data, predictions, leaderboards, highlights, player cards, vote reminders, and admin workflows.
- Admin actions are audited in `admin_action_audit_log`, including fight-card previews/imports and other protected write operations.
- Successful fight-card imports also backfill `fighter_style` from imported rows so future scrapes can reuse known styles before falling back to Tapology.
- Scraper source, supporting map files, and historical CSV exports now live under `Server/scraper/` so the import pipeline stays inside the app architecture.

## Deployment

This repository includes Vercel configuration for both app layers:

- [`Client/vercel.json`](./Client/vercel.json) handles client-side route rewrites for profile pages.
- [`Server/vercel.json`](./Server/vercel.json) routes all API traffic through the Node server entry point.

For Node hosts like Render, make sure the server install step runs from `Server/` or otherwise executes `npm --prefix Server install` so the `postinstall` hook installs the scraper's Python dependencies from `Server/scraper/requirements.txt`.

## Architecture

A high-level system diagram is available in [`architecture.md`](./architecture.md).

At a glance:

- React client in `Client/`
- Express API in `Server/`
- Supabase for persistence and backend data services

## Current Status

- The app includes production-oriented optimizations like response caching, compression, lazy-loaded frontend routes, and image proxy support.
- Automated tests are not yet implemented in the server package, so validation is currently driven by local/manual testing.

## Contact

Fight Picks was created by Brandon Breach and Paul Ruggiero.

For questions, contact [breachey@gmail.com](mailto:breachey@gmail.com).
