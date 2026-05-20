# Market Dashboard

Member market dashboard for Math of Stars.

Stage 1 is an internal MVP that proves the product loop before Supabase, Patreon, and email credentials are connected:

- Visitor/free/paid entitlement modes
- Curated Stage 1 market universe
- Watchlist limits
- Browser-persisted member profile placeholder
- Supabase-ready member profile repository
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

For local development, no build step is required before serving the static files.

## Build Version

The sidebar displays the app version from:

```text
public/version.json
```

For Cloudflare Pages, use this build command:

```bash
npm run build
```

The build script writes `public/version.json` from `CF_PAGES_COMMIT_SHA`, so the badge reflects the deployed commit automatically. Locally, it falls back to a Stage 1 label.

The same build script writes the public runtime config to:

```text
public/app-config.json
```

Only public browser-safe values should be written there.

## Member Profile Storage

The UI talks to `src/services/memberProfileRepository.js`. In Stage 1 that repository uses browser local storage through `memberProfileStore`.

The repository already has a dormant Supabase REST adapter. It stays on local storage until `PUBLIC_PROFILE_STORAGE_MODE=supabase`, `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and a Stage 1 test member id are provided at build time.

The UI contract remains:

```js
await memberProfileRepository.load();
await memberProfileRepository.save(profile);
```

## Data Job

Fetch Stage 1 Yahoo daily candles and write the static dashboard snapshot:

```bash
python3 -B jobs/fetch_yahoo_snapshots.py
```

The current indicator engine is labelled `prototype-yahoo-v0`. It produces the public output field shape from real candles, but it is not the final proprietary indicator engine.

## Deployment Target

Cloudflare Pages. Use `npm run build` as the build command so the deployed app writes a fresh version badge. Custom domain planned as:

```text
dashboard.mathofstars.com
```

## Environment

Copy `.env.example` to `.env.local` when credentials are ready.

Secrets must stay out of GitHub. Supabase secret keys, database URLs, Patreon credentials, and email API keys should be configured as local environment variables and Cloudflare Pages secrets.

The browser can only receive public values such as `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Service-role keys, database URLs, Patreon secrets, and email API keys must remain server-side.

## Supabase Draft

When the Supabase project is ready, start with:

```text
supabase/schema.sql
```

The current UI stores tier, selected symbol, followed symbols, and email-detail preference in browser local storage. That is a Stage 1 stand-in for the future Supabase member profile and watchlist tables.
