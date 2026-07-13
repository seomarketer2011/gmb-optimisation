---
name: verify
description: Build, launch and drive this app locally to verify changes end-to-end (Next.js on Cloudflare Workers, D1, Places API).
---

# Verifying changes in this repo

## Build & launch

```bash
npm ci
printf 'BETTER_AUTH_SECRET=local-secret-0123456789abcdef0123456789abcdef\nBETTER_AUTH_URL=http://localhost:3000\nGOOGLE_MAPS_API_KEY=mock-key\n' > .dev.vars
npm run db:migrate:local && npm run db:seed:local
npm run dev   # http://localhost:3000
```

- First signup at `/signup` becomes **admin**; later signups are `va`.
- To reset the DB, `rm -rf .wrangler/state`, re-migrate/seed, **then restart
  the dev server** — deleting state under a running server breaks its D1
  handle (auth queries 500 with "internal error").

## Gotchas (learned the hard way)

- **Proxy:** in the remote sandbox, `next dev` routes server-side `fetch`
  through `HTTPS_PROXY` and ignores `/etc/hosts` + `NO_PROXY`. To use a local
  mock of an external API, start the server with proxies stripped:
  `env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy npm run dev`.
- **Playwright:** use the preinstalled browser:
  `chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })`, and
  import playwright from this repo's `node_modules` by absolute path when the
  script lives outside the repo.

## Mocking the Places API

Places calls go to `https://places.googleapis.com` (hardcoded in
`src/lib/places.ts`; Maps-URL resolution also fetches `www.google.com`).
Recipe:

1. Self-signed cert with SANs `places.googleapis.com,www.google.com`; append
   it to a copy of the proxy CA bundle and start the dev server with
   `NODE_EXTRA_CA_CERTS=<combined.pem>` (plus proxies stripped, above).
2. `echo "127.0.0.1 places.googleapis.com www.google.com" >> /etc/hosts`.
3. HTTPS server on :443 answering `POST /v1/places:searchText`
   (`{"places":[<place>]}`) and `GET /v1/places/<id>` (`<place>`), with the
   place JSON read from a state file per request so tests can mutate live
   data mid-run. `www.google.com` requests just need any 200 HTML (no
   redirect) so URL resolution passes through.

## Flows worth driving

- Import: `/locations/import-gbp` → paste
  `https://www.google.com/maps/place/Test+Biz/@50.8,-0.1,17z` → Fetch profile
  → pick niche → save.
- Data protection: property page → "Data protection" → confirm baseline →
  "Run check now" → mutate mock state → re-check → alerts + auto P1 restore
  task in `/tasks`; formatting-only changes (e.g. `+44` vs `0` phone) must
  NOT flag.
