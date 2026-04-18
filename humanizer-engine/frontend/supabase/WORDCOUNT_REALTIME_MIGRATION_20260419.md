# Word Count + Realtime Migration (2026-04-19)

This migration upgrades plan limits and enables database-driven realtime usage updates.

## Changed Plans

- Starter: `$5/month`, `20,000 words/day`
- Creator: `$10/month`, `50,000 words/day`
- Professional: `$20/month`, `100,000 words/day`
- Business Unlimited: `$50/month`, `Unlimited words/day`

## What This Migration Does

File: `supabase/migrations/20260419090000_wordcount_realtime_upgrade.sql`

1. Upserts plan pricing and daily limits in `public.plans`.
2. Uses `-1` as the unlimited sentinel for `Business Unlimited` (`daily_words_fast = -1`).
3. Backfills today's `public.usage` limits from each user's active plan.
4. Replaces `public.increment_usage` to:
   - respect only active and non-expired subscriptions,
   - support unlimited plans,
   - return `is_unlimited` in the payload.
5. Replaces `public.get_usage_stats` to:
   - return `is_unlimited` and `plan_key`,
   - use non-expired active subscriptions,
   - return normalized usage stats for UI/API.
6. Adds `public.usage`, `public.subscriptions`, and `public.plans` to `supabase_realtime` publication.

## Apply Steps

1. Open Supabase SQL Editor.
2. Run the migration file `20260419090000_wordcount_realtime_upgrade.sql`.
3. Confirm success with verification queries below.

## Verification Queries

### 1) Confirm Plan Limits

```sql
select
  name,
  display_name,
  price_monthly,
  daily_words_fast,
  daily_words_stealth,
  is_active
from public.plans
where name in ('free', 'starter', 'creator', 'professional', 'business')
order by case name
  when 'free' then 1
  when 'starter' then 2
  when 'creator' then 3
  when 'professional' then 4
  when 'business' then 5
  else 99
end;
```

Expected:

- `starter.daily_words_fast = 20000`
- `creator.daily_words_fast = 50000`
- `professional.daily_words_fast = 100000`
- `business.daily_words_fast = -1` (unlimited)

### 2) Confirm Function Response Shape

```sql
select public.get_usage_stats('<USER_UUID>'::uuid);
```

Expected keys include:

- `words_limit_fast`
- `words_limit_stealth`
- `is_unlimited`
- `plan_name`
- `plan_key`

### 3) Confirm Realtime Publication

```sql
select
  p.pubname,
  n.nspname as schema_name,
  c.relname as table_name
from pg_publication p
join pg_publication_rel pr on pr.prpubid = p.oid
join pg_class c on c.oid = pr.prrelid
join pg_namespace n on n.oid = c.relnamespace
where p.pubname = 'supabase_realtime'
  and n.nspname = 'public'
  and c.relname in ('usage', 'subscriptions', 'plans')
order by c.relname;
```

## Rollback Notes

If rollback is required:

1. Revert plan values in `public.plans`.
2. Reapply prior function versions for `increment_usage` and `get_usage_stats`.
3. Optionally remove realtime publication entries:

```sql
alter publication supabase_realtime drop table public.usage;
alter publication supabase_realtime drop table public.subscriptions;
alter publication supabase_realtime drop table public.plans;
```

Only drop publication tables if no other app component depends on those realtime streams.
