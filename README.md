# Stackcraft

**Build your SaaS stack. See its strengths and weaknesses. Learn why your choices work.**

Stackcraft is an interactive system-design sandbox for indie hackers and small teams. You assemble an architecture on a canvas, and the app scores it — RPG character-sheet style — across six dimensions. Every point that moves comes with an explanation: what changed, why, the trade-off it introduced, and which workload condition triggered it.

It teaches the engineering decision first and the vendor second. A cache isn't "good for scale" — it helps when repeated reads are a measured bottleneck, and otherwise it's a bill plus a stale-data bug. A document database isn't "good for flexible data" — PostgreSQL's JSONB handles flexible fields, and relational SaaS data wants relations.

Live site (once Pages is enabled): `https://mbutler98.github.io/stackcraft/`

---

## What you can do

- **Build on a canvas.** Drag any of 25 curated components from the palette (or press its `+` button), connect them, move, duplicate, rename, delete. Connections are undirected and attach to whichever sides face each other.
- **See live, explained scores.** Six stats (developer velocity, cost efficiency, scalability, reliability, performance, simplicity) plus a weighted *scenario fit*. The **Last change** tab shows exactly which rules started or stopped applying after each edit.
- **Make design decisions.** Authorization strategy, billing webhook handling and cache freshness are first-class choices, because architecture isn't only boxes.
- **Play three challenges** — *Launch your first SaaS*, *Collaborative workspace*, *Handle growth without overengineering* — plus a free **Sandbox** with an editable workload.
- **Earn XP for learning, not for adding boxes.** XP comes from completing challenges, reading score explanations and answering reflection questions. Four badges, levels, no leaderboard.
- **Save, compare, share.** Autosave plus named builds in `localStorage`, side-by-side comparison against the baseline or any saved build, JSON export/import with validation, and compressed share links in the URL fragment.
- **Use it without a mouse.** List view edits components and connections with forms; keyboard shortcuts for undo/redo/duplicate/delete; collapsible panels on tablets and phones.

## How scoring works

Scores are **scenario-fit estimates** written for teaching. They aren't benchmarks, throughput figures or price predictions, and the UI says so.

The engine (`src/engine/scoring.ts`) is a pure, deterministic function of the graph, decisions, priorities and scenario:

1. **Start from the scenario baseline.** Each challenge has its own starting scores.
2. **Validate the graph.** Dangling, duplicate, self-referencing and incompatible connections are reported and ignored. Only *connected* components count.
3. **Apply component profiles — conditionally.** Each catalog entry has an intrinsic profile (`dimensionEffects` in `src/data/components.ts`). Its *positive* effects apply only if the component fills a capability the workload needs and nothing else already fills it. Costs always apply. That's why more components never means a better score, and duplicates never double a benefit.
4. **Apply architecture rules** that read workload conditions, wiring and decisions — e.g. cache vs. repeated reads, relational data in a document store, sign-in without authorization, secret-holding services with no server runtime, serverless fan-out to a connection-limited database, vendor sprawl for a solo developer, budget sensitivity.
5. **Evaluate hard requirements separately.** A failed requirement is a visible blocker and can't be averaged away.

`weightedFit = Σ weight[d] · score[d] / Σ weight[d]` with normalized weights you can edit. Challenge completion always uses the challenge's own priorities, so you can't game it with sliders.

Challenge C hides two workload facts until you connect monitoring — "measure before you optimize" is a mechanic, not just advice.

The cost view is a qualitative low/moderate/high band based on how many usage-billed services are connected, and it lists the unknowns that actually decide a bill.

## Getting started

Requires Node.js 20.19+ (22 recommended).

```bash
npm install
npm run dev        # http://localhost:5173
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, no emit |
| `npm test` | Vitest unit tests (scoring, validation, import, XP) |
| `npm run build` | Typecheck + production build into `dist/` |
| `npm run preview` | Serve the production build locally |

## Project structure

```text
src/
├── data/
│   ├── components.ts     # The 25-component catalog + intrinsic scoring profiles (single source of truth)
│   └── scenarios.ts      # 3 challenges + sandbox: workloads, requirements, hints, debriefs, reflections
├── engine/
│   ├── scoring.ts        # Pure scoring pipeline, rules, constraints, completion
│   ├── validation.ts     # Graph validation and capability lookups
│   ├── explanations.ts   # Score deltas between evaluations
│   └── progress.ts       # XP, levels and badges (pure)
├── persistence/builds.ts # Zod schema, JSON import/export, share links, localStorage
├── state/                # Reducer (undo/redo history) + React context
├── components/           # canvas, palette, inspector, stats, challenges, shared UI
├── lib/analytics.ts      # Disabled-by-default analytics adapter
└── test/fixtures.ts      # Graph builders for tests
```

Catalog data is separate from the user's graph: canvas nodes reference catalog ids, so the same component can be added more than once.

## Deploying to GitHub Pages

The repo includes `.github/workflows/deploy.yml`, which on every push to `main` (or manual run) installs with `npm ci`, runs lint, typecheck, tests and build, then deploys `dist/` with the official Pages actions. It uses only `contents: read`, `pages: write` and `id-token: write`, the `github-pages` environment, and a concurrency group so deployments don't overlap.

One-time setup:

1. Push this repository to GitHub.
2. Open **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
3. Push to `main` or run the workflow from the **Actions** tab. The site appears at `https://<github-user>.github.io/<repository-name>/`.

**Base path.** Project sites live under `/<repository-name>/`, so `vite.config.ts` sets `base` from the `REPO_NAME` constant (currently `stackcraft`). If you rename or fork the repo, change that constant — or set `STACKCRAFT_BASE=/` at build time for a custom domain or user site. The app uses no client-side routes; shared builds use the URL hash, and `public/404.html` redirects stray paths back to the app root.

## Analytics and privacy

No analytics run by default and nothing is sent anywhere. `src/lib/analytics.ts` provides an adapter that only activates if you set `VITE_ANALYTICS_ENABLED=true` at build time *and* register an adapter. It only allows six product events (`challenge_started`, `node_added`, `connection_created`, `score_explanation_opened`, `challenge_completed`, `build_exported`) and strips everything except catalog ids, rule ids, numbers and booleans — never build names, labels or imported JSON.

If you enable it, add a consent mechanism appropriate for your audience. Every `VITE_*` variable is bundled into public client code, so only ever use a provider's *public* project key there.

## Limitations

- **Static only.** No accounts, no server, no sync. Builds and progress live in this browser's `localStorage`; clearing site data removes them. Export JSON to move builds between devices.
- **Teaching estimates, not measurements.** Effect sizes are authored judgments meant to illustrate trade-offs. Real outcomes depend on workload details the app can't know.
- **A curated seed set.** 25 services is not an exhaustive or ranked list, and many good alternatives aren't included. Similar tools often fit equally well.
- **Vendor details change.** Descriptions are deliberately general summaries based on each vendor's official documentation, and every entry is stamped with the catalog date (`CATALOG_VERIFIED_ON`, 2026-10-11). Re-check the linked docs before relying on a specific feature or limit. Pricing is described as a *model* only — follow the pricing links for current numbers.
- **Simplified decisions.** The three design decisions stand in for much larger topics (authorization design, webhook idempotency, cache invalidation).
- **Dark theme only.** A light theme was deliberately left out rather than shipped half-finished.
- Fonts load from Google Fonts; if blocked, the UI falls back to system fonts.

## Official sources

| Component | Docs | Pricing |
| --- | --- | --- |
| Next.js | https://nextjs.org/docs | Open source; hosting separate |
| Vite + React | https://vite.dev/guide/ | Open source; hosting separate |
| Vercel | https://vercel.com/docs | https://vercel.com/pricing |
| Cloudflare Workers | https://developers.cloudflare.com/workers/ | https://developers.cloudflare.com/workers/platform/pricing/ |
| Render | https://render.com/docs | https://render.com/pricing |
| Supabase | https://supabase.com/docs | https://supabase.com/pricing |
| Neon | https://neon.tech/docs | https://neon.tech/pricing |
| Amazon RDS | https://docs.aws.amazon.com/rds/ | https://aws.amazon.com/rds/pricing/ |
| MongoDB Atlas | https://www.mongodb.com/docs/atlas/ | https://www.mongodb.com/pricing |
| DynamoDB | https://docs.aws.amazon.com/amazondynamodb/ | https://aws.amazon.com/dynamodb/pricing/ |
| Redis | https://redis.io/docs/latest/ | https://redis.io/pricing/ |
| Amazon S3 | https://docs.aws.amazon.com/s3/ | https://aws.amazon.com/s3/pricing/ |
| Supabase Auth | https://supabase.com/docs/guides/auth | https://supabase.com/pricing |
| Clerk | https://clerk.com/docs | https://clerk.com/pricing |
| Stripe Billing | https://docs.stripe.com/billing | https://stripe.com/pricing |
| Resend | https://resend.com/docs | https://resend.com/pricing |
| Trigger.dev | https://trigger.dev/docs | https://trigger.dev/pricing |
| PostHog | https://posthog.com/docs | https://posthog.com/pricing |
| Sentry | https://docs.sentry.io/ | https://sentry.io/pricing/ |
| Better Stack | https://betterstack.com/docs/ | https://betterstack.com/pricing |
| Algolia | https://www.algolia.com/doc/ | https://www.algolia.com/pricing/ |
| GitHub Actions | https://docs.github.com/actions | https://github.com/pricing |
| GitHub Pages | https://docs.github.com/pages | https://docs.github.com/pages/getting-started-with-github-pages/about-github-pages |
| Upstash QStash | https://upstash.com/docs/qstash | https://upstash.com/pricing/qstash |
| Cloudflare Turnstile | https://developers.cloudflare.com/turnstile/ | https://www.cloudflare.com/products/turnstile/ |

Built with Vite, React, TypeScript, [React Flow](https://reactflow.dev/), Tailwind CSS, Lucide, Zod and Vitest.
