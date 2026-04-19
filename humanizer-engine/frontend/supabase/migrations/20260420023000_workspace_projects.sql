create extension if not exists pgcrypto;

create table if not exists public.workspace_projects (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled Workspace Project',
  mode text not null default 'essay',
  instructions text not null default '',
  rubric text not null default '',
  uploads jsonb not null default '[]'::jsonb,
  citation_style text not null default 'APA 7',
  target_word_count integer not null default 1500,
  minimum_score_target integer not null default 90,
  active_draft_id text,
  workspace_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workspace_projects_user_id_idx on public.workspace_projects(user_id);
create index if not exists workspace_projects_updated_at_idx on public.workspace_projects(updated_at desc);

alter table public.workspace_projects enable row level security;

create policy "workspace_projects_select_own"
  on public.workspace_projects
  for select
  using (auth.uid() = user_id);

create policy "workspace_projects_insert_own"
  on public.workspace_projects
  for insert
  with check (auth.uid() = user_id);

create policy "workspace_projects_update_own"
  on public.workspace_projects
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "workspace_projects_delete_own"
  on public.workspace_projects
  for delete
  using (auth.uid() = user_id);

create or replace function public.set_workspace_projects_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_workspace_projects_updated_at
before update on public.workspace_projects
for each row
execute function public.set_workspace_projects_updated_at();
