-- Allow a person to track several tasks at once while preventing duplicate
-- active timers for the same person and task.

drop index if exists public.time_entries_one_active_timer;

create unique index if not exists time_entries_one_active_timer_per_task
on public.time_entries(team_id, user_id, task_id)
where ended_at is null;

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

  if exists (
    select 1
    from public.time_entries
    where team_id = target_task.team_id
      and task_id = target_task.id
      and user_id = auth.uid()
      and ended_at is null
  ) then
    raise exception 'A timer is already active for this task';
  end if;

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
