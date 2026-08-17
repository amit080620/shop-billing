# Load Testing & Capacity Planning

## What this is, honestly

Claude has not run a load test against this app's real production
deployment or Supabase database — doing so without the owner watching
in real time risks exhausting connection limits, running up usage
costs, or tripping rate limits on a live paid service. `basic-load-test.js`
in this folder is a script **you can run yourself** against a staging
deployment; it was written, not executed, as part of this work.

Any claim like "this app supports 1 crore users" without an actual
load test and real production metrics backing it up is not a
trustworthy claim — capacity should be measured, not asserted.

## How to actually test this

1. **Deploy a staging copy** — a separate Vercel project pointed at a
   separate (or clearly disposable) Supabase project, never production.
2. **Seed realistic data** — an empty database behaves nothing like one
   with months of bills/customers/products in it. Run the bulk import
   with a few thousand rows first.
3. **Run the script**: `BASE_URL=https://your-staging-url k6 run load-tests/basic-load-test.js`
4. **Watch three things while it runs**:
   - Vercel's function invocation dashboard (duration, error rate, cold starts)
   - Supabase's database dashboard (active connections, query latency, CPU)
   - The k6 output itself (p95 latency, failure rate)
5. **Test authenticated flows separately** — the provided script only
   hits public pages (login/signup). Testing billing, the KDS, or
   customer lookups at load needs seeded test accounts with real staff
   sessions, which means either scripting a login flow with test
   credentials or using k6's browser module — deliberately not included
   here since it needs credentials only you should provision.

## Known architecture limits (honest, not exhaustive)

- **Supabase connection pooling**: the free/small tiers cap concurrent
  database connections in the tens, not thousands. A traffic spike
  beyond that returns connection errors regardless of how fast the
  Next.js app itself responds. This is a Supabase *plan* limit, not
  something fixable in application code — it's solved by upgrading the
  Supabase plan or adding an external pooler (e.g., Supabase's own
  pgBouncer mode, already on by default on most plans, or PgBouncer/
  Supavisor tuning).
- **No read replicas**: every read currently goes to the same primary
  database as every write. At meaningfully high read traffic, this is
  the next scaling lever — Supabase supports read replicas on higher
  tiers.
- **No CDN/edge caching layer** beyond Vercel's own static-asset CDN
  and the `unstable_cache` added in this phase — a full page-level edge
  cache (e.g., for the public catalog storefront) is a further step if
  that traffic grows.
- **Background jobs run in the same serverless function** via Next's
  `after()` — there's no separate worker fleet. Fine for the current
  scale (bulk imports, WhatsApp link generation); a genuinely high
  volume of concurrent long-running jobs would need a real queue
  (e.g., Inngest, Trigger.dev, or a Supabase Edge Function + pg-boss)
  rather than after().

## What "capacity planning instead of unsupported claims" means here

Nobody can honestly say a number (100 shops? 10,000 shops?) this app
supports without the test above actually being run against a realistic
data volume. What can be said with confidence:

- The architecture (Next.js serverless + Supabase Postgres) is a
  standard, horizontally-scalable pattern used by many production SaaS
  apps well beyond this one's current size — nothing here is
  fundamentally uncapable of scaling.
- The concrete blockers to scaling further are known and listed above
  (connection pool size, no read replicas, no dedicated worker queue) —
  each is a normal, well-understood next step, not a rewrite.
- The right process is: run the test above at your current real usage
  level, find the actual bottleneck (it's almost always the database
  connection pool first), fix that specific thing, retest, repeat.
