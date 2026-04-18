# Fixes Applied

Date: 2026-04-18

## 1. Next 16 Proxy Migration

Changed:

- Removed `middleware.ts`
- Added `proxy.ts`

Why:

- Next.js 16 deprecates the `middleware.ts` convention in favor of `proxy.ts`.
- Keeping the old entrypoint causes framework-level warning noise and future compatibility risk.

What was preserved:

- CORS handling for `/api/v1/*`
- Public route bypasses
- Static asset bypasses
- `/app` auth guard redirect behavior

## 2. Synonyms Route Stabilization

Changed:

- Updated `app/api/synonyms/route.ts`

What changed:

- Forced Node runtime with `runtime = 'nodejs'`
- Forced dynamic evaluation with `dynamic = 'force-dynamic'`
- Moved dictionary path resolution into a lazy function instead of eager module initialization
- Kept dictionary loading filesystem-based, but guarded with explicit path checks

Why:

- The route was intermittently resolving as not-found during dev compilation.
- The route depends on server filesystem access, so it should stay explicitly on Node runtime.

Validated outcome:

- `POST /api/synonyms` returns `200` in dev after the patch
- `POST /api/synonyms` returns `200` in production server mode after the patch

## 3. Turbopack Path Annotation Cleanup

Changed:

- `next.config.ts`
- `lib/engine/style-memory.ts`
- `lib/engine/dictionary.ts`
- `lib/engine/llm-pipeline.ts`
- `lib/engine/v11/services/dictionaryService.ts`
- `lib/engine/stealth/dictionary-service.ts`
- `lib/engine/stealth/adversarial-transformer.ts`

What changed:

- Annotated `process.cwd()` path joins/resolves with `/* turbopackIgnore: true */` where appropriate

Why:

- Turbopack/NFT was tracing server-side filesystem access too broadly.
- This reduced the risk of accidental whole-project tracing.

Result:

- Build still passes cleanly
- One residual warning remains, but the app is now in a much cleaner state and the broken route behavior is fixed

## 4. Validation After Fixes

Confirmed:

- `npm run build` passes
- Smoke test passes
- Public routes return `200`
- `/app` redirects unauthenticated users to login
- `/api/synonyms` responds correctly in dev and production server modes

## Changed Files

- `next.config.ts`
- `proxy.ts`
- `app/api/synonyms/route.ts`
- `lib/engine/style-memory.ts`
- `lib/engine/dictionary.ts`
- `lib/engine/llm-pipeline.ts`
- `lib/engine/v11/services/dictionaryService.ts`
- `lib/engine/stealth/dictionary-service.ts`
- `lib/engine/stealth/adversarial-transformer.ts`