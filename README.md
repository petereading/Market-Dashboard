# Market Dashboard

Member market dashboard for Math of Stars.

Stage 1 is an internal MVP that proves the product loop before Supabase, Patreon, and email credentials are connected:

- Visitor/free/paid entitlement modes
- Curated Stage 1 market universe
- Watchlist limits
- Chart view with public indicator overlays
- Daily snapshot data shape
- Weekly narrative email preview

## Local Development

```bash
python3 -m http.server 5173
```

Then open:

```text
http://localhost:5173
```

No build step is required for Stage 1.

## Deployment Target

Cloudflare Pages, with no build command for Stage 1. Custom domain planned as:

```text
dashboard.mathofstars.com
```

## Environment

Copy `.env.example` to `.env.local` when credentials are ready.

Secrets must stay out of GitHub. Supabase secret keys, database URLs, Patreon credentials, and email API keys should be configured as local environment variables and Cloudflare Pages secrets.
