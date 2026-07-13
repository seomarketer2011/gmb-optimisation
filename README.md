# GBP Optimisation

Internal agency tool to plan, prepare and track Google Business Profile
optimisation work across clients and locations. The primary day-to-day user is
a VA working from a task queue where every task comes with prepared,
copy-paste-ready content and clear instructions.

Core record spine: **Audit finding → Task → Evidence → Outcome**, with an
accountable change log for every sensitive profile edit.

## Stack

- Next.js (App Router, TypeScript) deployed to **Cloudflare Workers** via
  [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare)
- **Cloudflare D1** (SQLite) via Drizzle ORM
- **Cloudflare R2** for evidence screenshots (binding: `EVIDENCE`)
- [better-auth](https://better-auth.com) email/password auth with roles:
  `admin`, `operator`, `va`, `client`. The **first account created becomes
  admin**; later signups default to `va`.

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars   # set a real BETTER_AUTH_SECRET
npm run db:migrate:local          # apply migrations to local D1
npm run db:seed:local             # seed audit checklist + task templates
npm run dev                       # http://localhost:3000
```

Sign up at `/signup` — your first account is the admin.

## Deploying to Cloudflare

1. `npx wrangler d1 create gmb-optimisation` and put the returned
   `database_id` into `wrangler.jsonc`.
2. `npx wrangler r2 bucket create gmb-evidence`
3. `npx wrangler secret put BETTER_AUTH_SECRET`
4. Set `BETTER_AUTH_URL` in `wrangler.jsonc` vars to your production URL.
5. `npm run db:migrate:remote && npm run db:seed:remote`
6. `npm run deploy`

## Import from GBP URL

"Import from GBP URL" (Properties page) pulls a live profile's public data
(name, address, town, postcode, phone, website, primary category, hours,
rating + review count) from any Maps link and self-populates a new property.
It needs a Google Maps Platform API key:

1. https://console.cloud.google.com → create/select a project
2. APIs & Services → Library → enable **Places API (New)**
3. APIs & Services → Credentials → Create credentials → API key
   (restrict it to Places API (New))
4. `npx wrangler secret put GOOGLE_MAPS_API_KEY` (paste the key)
5. For local dev, put it in `.dev.vars`

Google's free tier comfortably covers this usage level.

## Data protection (Google suggested edits)

Google lets the public "suggest an edit" on any listing, and those edits can
go live without warning — changed phone numbers, categories, hours, even the
business name. The **Protection** page defends against this:

1. Open a property → **Data protection** (or Protection in the nav). The form
   pre-fills from the live listing; check business name, address, telephone
   number, opening hours and primary category against reality, correct
   anything wrong, and **confirm the baseline** (operator/admin only). This
   becomes the source of truth for that property. The listing's **open/closed
   status** and **map-pin location** are snapshotted automatically at confirm
   time and monitored too (a temporary-closure or a moved pin both wreck local
   ranking).
2. **Run check now** (per property) or **Run all checks** (Protection page)
   re-fetches each live listing via the Places API and compares it to the
   baseline. Comparison is format-tolerant, so `+44 1273…` vs `01273…` or
   spacing/case differences don't false-alarm.
3. Any real difference opens an **alert** showing the correct value vs what
   Google now shows, and drops an urgent P1 restore task into the VA queue
   with step-by-step instructions. Resolve the alert once Google shows the
   correct data again; dismiss it (operators, and update the baseline) if the
   new value is actually right.

Run "all checks" as part of the weekly profile-check cycle. Uses the same
`GOOGLE_MAPS_API_KEY` as the importer.

## Seed content (the IP)

Audit checklists and task templates live in `/data` as **versioned, immutable
JSON**:

```
data/audits/gbp-core-v1.json           # 27-check GBP audit (sections A–G)
data/tasks/gbp-task-templates-v1.json  # 16 VA operational task templates
```

Never edit a version that has been used — add a `-v2` file instead. Audits
record the exact template version they ran against, and findings snapshot the
displayed text, so history stays trustworthy.

`npm run db:seed:build` converts these files to `drizzle/seed.sql` using
deterministic IDs and `INSERT OR IGNORE`, so re-seeding is always safe.

## Database

Schema: `src/db/schema.ts` (Drizzle, SQLite dialect). Migrations are generated
with `npm run db:generate` into `/drizzle`.

Tables: `user/session/account/verification` (auth), `clients`, `locations`,
`audit_templates`, `audit_items`, `audits`, `findings`, `task_templates`,
`tasks`, `task_evidence`, `content_items`, `changes`, `metric_snapshots`,
`gbp_baselines`, `integrity_checks`, `integrity_alerts` (data protection).

Key design decisions (agreed in planning):

- `findings.task_id` — a repeated audit failure links to the already-open task
  instead of creating a duplicate.
- `tasks.previous_task_id` + `task_templates.recurrence_days` — recurrence is
  "complete and schedule next", not an RRULE engine.
- `changes` carries full propose → approve → submit → verify accountability
  with previous values for rollback; sensitive fields require approval.
- `metric_snapshots.source` + unique `(location, period, source)` — imported
  metrics can never silently overwrite manual entries.
- `content_items` — prepared copy-paste content (posts, review replies, Q&A,
  photo briefs) with a draft → ready → published workflow.

## Roadmap

- [x] Foundation: auth, clients/locations CRUD, CSV import, seeded templates
- [x] Task board + recurring VA work queue (complete-and-schedule-next)
- [x] Content library (prepared posts/replies, copy-to-clipboard, statuses)
- [x] Audit runner (findings → prefilled tasks with duplicate detection,
      health score from weighted findings)
- [x] Evidence upload to R2, change log UI with approval gate
- [x] Metric snapshots, printable monthly client report with MoM deltas
- [ ] Dashboard alerts (overdue, pending approvals, stale locations)
- [ ] Google Business Profile API integration (OAuth, review import,
      scheduled post publishing) behind an adapter layer
