# Residual Issues

Date: 2026-04-18

## 1. Turbopack NFT Warning Still Present

Status: not blocking build

Current symptom:

- `npm run build` still emits one warning:
  - `Encountered unexpected file in NFT list`
  - current import trace ends at `next.config.ts -> app/api/synonyms/route.ts`

Impact:

- Build succeeds.
- This is a warning, not a deployment blocker.
- It points to continued sensitivity around server-side filesystem access from app routes.

Recommendation:

- If this warning must be eliminated completely, move the synonyms dictionary into a frontend-local data source or another explicitly scoped server asset location instead of resolving it from outside the app root.

## 2. Health API Reports `degraded`

Status: not a functional outage

Current facts:

- Required env readiness is `true`
- Supabase check is healthy
- Payments are healthy
- Admin config is healthy
- Site URL is healthy
- All 7 engines are healthy
- `optional_warning_count` is `1`

Impact:

- Users may read `degraded` as a site problem even when runtime behavior is healthy.

Recommendation:

- Either supply the remaining optional value or adjust the status logic in `lib/ops/runtime-health.ts` so optional warnings do not downgrade the overall status.

## 3. Lint Debt Is Large

Status: significant engineering debt

Observed output:

- `485` total lint issues
- `111` errors
- `374` warnings

Main clusters:

- engine internals under `lib/engine/**`
- test scripts and utility scripts under the frontend root
- several `require()` based legacy scripts
- broad `any` usage
- many unused variables
- several `prefer-const` issues

Impact:

- Slows safe refactoring
- Hides truly important warnings in noise
- Makes CI hard to trust if lint is expanded later

Recommendation:

- Split cleanup into batches:
  1. route/build-critical files
  2. engine core files
  3. test scripts and legacy one-off scripts

## 4. Above-the-Fold Image Optimization Warning

Status: minor performance issue

Observed in dev server log:

- `/logo.png` is detected as LCP and should likely use eager loading on the above-the-fold logo image.

Impact:

- Small performance/UX optimization opportunity.

Recommendation:

- Add `loading="eager"` or an equivalent priority strategy to the hero/header logo image if it is intentionally part of the first viewport experience.