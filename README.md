# Market Dashboard

Member market dashboard for Math of Stars.

Stage 1 is an internal MVP that proves the product loop before Supabase, Patreon, and email credentials are connected:

- Visitor/free/paid entitlement modes
- Curated Stage 1 market universe
- Watchlist limits
- Browser-persisted member profile placeholder
- Visible build/version badge from `public/version.json`
- Chart view with public indicator overlays
- Daily snapshot data shape
- Weekly narrative email preview
- Optional static EOD snapshot file at `public/data/latest.json`

## Local Development

```bash
python3 -m http.server 5173
```

Then open:

```text
http://localhost:5173
```

No build step is required for Stage 1.

## Build Version

The sidebar displays the app version from:

```text
public/version.json
```

For now this is a committed Stage 1 build label. Later, Cloudflare Pages can generate the same file from `CF_PAGES_COMMIT_SHA` so the badge reflects the deployed commit automatically.

## Data Job

Fetch Stage 1 Yahoo daily candles and write the static dashboard snapshot:

```bash
python3 -B jobs/fetch_yahoo_snapshots.py
```

The current indicator engine is labelled `prototype-yahoo-v0`. It produces the public output field shape from real candles, but it is not the final proprietary indicator engine.

## Deployment Target

Cloudflare Pages, with no build command for Stage 1. Custom domain planned as:

```text
dashboard.mathofstars.com
```

## Environment

Copy `.env.example` to `.env.local` when credentials are ready.

Secrets must stay out of GitHub. Supabase secret keys, database URLs, Patreon credentials, and email API keys should be configured as local environment variables and Cloudflare Pages secrets.

## Supabase Draft

When the Supabase project is ready, start with:

```text
supabase/schema.sql
```

The current UI stores tier, selected symbol, followed symbols, and email-detail preference in browser local storage. That is a Stage 1 stand-in for the future Supabase member profile and watchlist tables.
