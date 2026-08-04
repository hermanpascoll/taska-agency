-- Clockify-style task time tracking, member rates and auditable costs.

alter table public.teams
add column if not exists currency text not null default 'USD'
check (char_length(currency) = 3);

alter table public.team_members
add column if not exists hourly_rate numeric(12, 2) not null default 0
check (hourly_rate >= 0);

create table if not exists public.time_entries (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  description text not null default '',
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  billable boolean not null default true,
  hourly_rate numeric(12, 2) not null default 0 check (hourly_rate >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at)
);

create index if not exists time_entries_team_started_idx
on public.time_entries(team_id, started_at desc);
create index if not exists time_entries_task_idx
on public.time_entries(task_id);
create index if not exists time_entries_user_idx
on public.time_entries(user_id, started_at desc);
create unique index if not exists time_entries_one_active_timer
on public.time_entries(team_id, user_id)
where ended_at is null;

drop trigger if exists time_entries_set_updated_at on public.time_entries;
create trigger time_entries_set_updated_at
before update on public.time_entries
for each row execute function public.set_updated_at();

alter table public.time_entries enable row level security;

drop policy if exists "users view permitted time entries" on public.time_entries;
create policy "users view permitted time entries"
on public.time_entries for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_team_admin(team_id)
);

drop policy if exists "users create own time entries" on public.time_entries;
create policy "users create own time entries"
on public.time_entries for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.is_team_member(team_id)
);

drop policy if exists "users update permitted time entries" on public.time_entries;
create policy "users update permitted time entries"
on public.time_entries for update
to authenticated
using (
  user_id = auth.uid()
  or public.is_team_admin(team_id)
)
with check (
  user_id = auth.uid()
  or public.is_team_admin(team_id)
);

drop policy if exists "users delete permitted time entries" on public.time_entries;
create policy "users delete permitted time entries"
on public.time_entries for delete
to authenticated
using (
  user_id = auth.uid()
  or public.is_team_admin(team_id)
);

create or replace function public.start_task_timer(
  candidate_task_id uuid,
  candidate_description text default '',
  candidate_billable boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_task public.tasks%rowtype;
  member_role public.team_role;
  member_rate numeric(12, 2);
  new_entry_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into target_task
  from public.tasks
  where id = candidate_task_id;

  if target_task.id is null then
    raise exception 'Task not found';
  end if;

  select role, hourly_rate
  into member_role, member_rate
  from public.team_members
  where team_id = target_task.team_id
    and user_id = auth.uid();

  if member_role is null then
    raise exception 'Workspace membership required';
  end if;

  if member_role = 'viewer' then
    raise exception 'Read-only members cannot track time';
  end if;

  update public.time_entries
  set ended_at = now(),
      duration_seconds = greatest(
        duration_seconds,
        floor(extract(epoch from (now() - started_at)))::integer
      )
  where team_id = target_task.team_id
    and user_id = auth.uid()
    and ended_at is null;

  insert into public.time_entries (
    team_id,
    task_id,
    user_id,
    description,
    started_at,
    billable,
    hourly_rate
  )
  values (
    target_task.team_id,
    target_task.id,
    auth.uid(),
    trim(coalesce(candidate_description, '')),
    now(),
    candidate_billable,
    coalesce(member_rate, 0)
  )
  returning id into new_entry_id;

  return new_entry_id;
end;
$$;

create or replace function public.stop_task_timer(candidate_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_entry public.time_entries%rowtype;
begin
  select * into target_entry
  from public.time_entries
  where id = candidate_entry_id;

  if target_entry.id is null then
    raise exception 'Time entry not found';
  end if;

  if target_entry.user_id <> auth.uid()
    and not public.is_team_admin(target_entry.team_id) then
    raise exception 'Not allowed to stop this timer';
  end if;

  update public.time_entries
  set ended_at = now(),
      duration_seconds = greatest(
        duration_seconds,
        floor(extract(epoch from (now() - started_at)))::integer
      )
  where id = candidate_entry_id
    and ended_at is null;
end;
$$;

create or replace function public.create_manual_time_entry(
  candidate_task_id uuid,
  candidate_description text,
  candidate_started_at timestamptz,
  candidate_duration_seconds integer,
  candidate_billable boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_task public.tasks%rowtype;
  member_role public.team_role;
  member_rate numeric(12, 2);
  new_entry_id uuid;
begin
  if candidate_duration_seconds <= 0 or candidate_duration_seconds > 86400 then
    raise exception 'Duration must be between 1 second and 24 hours';
  end if;

  select * into target_task
  from public.tasks
  where id = candidate_task_id;

  select role, hourly_rate
  into member_role, member_rate
  from public.team_members
  where team_id = target_task.team_id
    and user_id = auth.uid();

  if member_role is null or member_role = 'viewer' then
    raise exception 'Time tracking permission required';
  end if;

  insert into public.time_entries (
    team_id,
    task_id,
    user_id,
    description,
    started_at,
    ended_at,
    duration_seconds,
    billable,
    hourly_rate
  )
  values (
    target_task.team_id,
    target_task.id,
    auth.uid(),
    trim(coalesce(candidate_description, '')),
    candidate_started_at,
    candidate_started_at + make_interval(secs => candidate_duration_seconds),
    candidate_duration_seconds,
    candidate_billable,
    coalesce(member_rate, 0)
  )
  returning id into new_entry_id;

  return new_entry_id;
end;
$$;

create or replace function public.update_member_hourly_rate(
  candidate_team_id uuid,
  candidate_user_id uuid,
  candidate_hourly_rate numeric
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_team_admin(candidate_team_id) then
    raise exception 'Only workspace administrators can update rates';
  end if;

  if candidate_hourly_rate < 0 or candidate_hourly_rate > 1000000 then
    raise exception 'Hourly rate is out of range';
  end if;

  update public.team_members
  set hourly_rate = candidate_hourly_rate
  where team_id = candidate_team_id
    and user_id = candidate_user_id;
end;
$$;

revoke all on function public.start_task_timer(uuid, text, boolean) from public;
revoke all on function public.stop_task_timer(uuid) from public;
revoke all on function public.create_manual_time_entry(uuid, text, timestamptz, integer, boolean) from public;
revoke all on function public.update_member_hourly_rate(uuid, uuid, numeric) from public;

grant execute on function public.start_task_timer(uuid, text, boolean) to authenticated;
grant execute on function public.stop_task_timer(uuid) to authenticated;
grant execute on function public.create_manual_time_entry(uuid, text, timestamptz, integer, boolean) to authenticated;
grant execute on function public.update_member_hourly_rate(uuid, uuid, numeric) to authenticated;
