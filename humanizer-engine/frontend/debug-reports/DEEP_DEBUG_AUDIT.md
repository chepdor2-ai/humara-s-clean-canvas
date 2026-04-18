# Deep Debug Audit

Date: 2026-04-18
Scope: `humanizer-engine/frontend`

## What Was Checked

- Production build with `npm run build`
- Full frontend lint with `npx eslint . --no-warn-ignored`
- Smoke test with `node scripts/smoke.mjs --url=http://127.0.0.1:3000 --deep`
- Browser/manual route verification for public pages and the protected `/app` entrypoint
- Runtime health inspection with `GET /api/health?deep=1`
- Direct endpoint verification for `POST /api/synonyms`

## Validated Results

### Build

- Production build passes.
- One non-blocking Turbopack NFT tracing warning remains.

### Runtime Health

- `GET /api/health?deep=1` returns `degraded`.
- This is not a hard outage.
- Required environment values are ready.
- Supabase, payments, admin config, site URL, and all 7 engines report healthy.
- The degraded state is caused by `optional_warning_count: 1`.

### Route Checks

- `/` -> `200`
- `/pricing` -> `200`
- `/about` -> `200`
- `/contact` -> `200`
- `/detector` -> `200`
- `/blog` -> `200`
- `/login` -> `200`
- `/signup` -> `200`
- `/app` -> redirect to login for unauthenticated user

### API Checks

- `POST /api/synonyms` -> `200` after fix
- Smoke test passed end to end

## Major Findings

1. Next.js 16 middleware convention was outdated.
   - The app still used `middleware.ts` even though Next 16 expects `proxy.ts`.
   - This produced a framework deprecation warning.

2. The synonyms route had unstable dev/runtime behavior.
   - `POST /api/synonyms` intermittently fell through to not-found during dev-server compilation.
   - The route also contributed to Turbopack tracing noise because it resolves dictionary files from the filesystem.

3. The website is operational, but code-health debt is high.
   - Full lint run reported `485` issues total.
   - Breakdown: `111 errors`, `374 warnings`.
   - Most of that debt sits in engine/test utility code, not the core marketing/app routes.

4. Health status is slightly misleading at a glance.
   - The site looks degraded from the API response.
   - In reality, the runtime is healthy on all required integrations and engine checks.
   - The remaining degradation is optional config noise.

## Files Most Relevant To This Audit

- `next.config.ts`
- `proxy.ts`
- `app/api/synonyms/route.ts`
- `lib/ops/runtime-health.ts`
- `lib/engine/style-memory.ts`
- `lib/engine/dictionary.ts`
- `lib/engine/llm-pipeline.ts`
- `lib/engine/v11/services/dictionaryService.ts`
- `lib/engine/stealth/dictionary-service.ts`
- `lib/engine/stealth/adversarial-transformer.ts`

## Bottom Line

The website is not broadly broken.
The live issues were concentrated in framework drift, one unstable API route, one lingering Turbopack warning, and a large backlog of lint debt.
Core page rendering, auth redirect behavior, build output, and smoke coverage are all working.