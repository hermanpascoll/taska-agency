-- Permisos configurables por rol y espacio de trabajo.

alter table public.team_members
  add column if not exists can_administer boolean not null default false,
  add column if not exists can_track_time boolean not null default true,
  add column if not exists can_audit_time boolean not null default false;

create table if not exists public.team_role_permissions (
  team_id uuid not null references public.teams(id) on delete cascade,
  role public.team_role not null,
  can_administer boolean not null default false,
  can_manage_billing boolean not null default false,
  can_track_time boolean not null default true,
  can_audit_time boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (team_id, role)
);

alter table public.team_role_permissions enable row level security;

insert into public.team_role_permissions (
  team_id, role, can_administer, can_manage_billing, can_track_time, can_audit_time
)
select team.id, defaults.role, defaults.can_administer,
  defaults.can_manage_billing, defaults.can_track_time, defaults.can_audit_time
from public.teams as team
cross join (values
  ('owner'::public.team_role, true, true, true, true),
  ('admin'::public.team_role, true, true, true, true),
  ('agent'::public.team_role, false, false, true, false),
  ('viewer'::public.team_role, false, false, false, false)
) as defaults(role, can_administer, can_manage_billing, can_track_time, can_audit_time)
on conflict (team_id, role) do nothing;

update public.team_members
set can_administer = role in ('owner', 'admin'),
    can_track_time = role <> 'viewer',
    can_audit_time = role in ('owner', 'admin')
where not project_limited;

create or replace function public.seed_team_role_permissions()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.team_role_permissions (
    team_id, role, can_administer, can_manage_billing, can_track_time, can_audit_time
  ) values
    (new.id, 'owner', true, true, true, true),
    (new.id, 'admin', true, true, true, true),
    (new.id, 'agent', false, false, true, false),
    (new.id, 'viewer', false, false, false, false)
  on conflict (team_id, role) do nothing;
  return new;
end;
$$;

drop trigger if exists teams_seed_role_permissions on public.teams;
create trigger teams_seed_role_permissions
after insert on public.teams
for each row execute function public.seed_team_role_permissions();

create or replace function public.apply_team_role_permissions_to_member()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  policy public.team_role_permissions%rowtype;
begin
  select * into policy
  from public.team_role_permissions
  where team_id = new.team_id and role = new.role;

  if new.role = 'owner' then
    new.can_administer := true;
    new.can_manage_costs := true;
    new.can_manage_billing := true;
    new.can_view_profitability := true;
    new.can_track_time := true;
    new.can_audit_time := true;
  elsif policy.team_id is not null then
    new.can_administer := policy.can_administer;
    new.can_manage_costs := policy.can_manage_billing;
    new.can_manage_billing := policy.can_manage_billing;
    new.can_view_profitability := policy.can_manage_billing;
    new.can_track_time := policy.can_track_time;
    new.can_audit_time := policy.can_audit_time;
  end if;
  return new;
end;
$$;

drop trigger if exists team_members_apply_role_permissions on public.team_members;
create trigger team_members_apply_role_permissions
before insert or update of role on public.team_members
for each row execute function public.apply_team_role_permissions_to_member();

create or replace function public.sync_team_role_permissions_to_members()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.role = 'owner' then
    new.can_administer := true;
    new.can_manage_billing := true;
    new.can_track_time := true;
    new.can_audit_time := true;
  end if;

  update public.team_members
  set can_administer = new.can_administer,
      can_manage_costs = new.can_manage_billing,
      can_manage_billing = new.can_manage_billing,
      can_view_profitability = new.can_manage_billing,
      can_track_time = new.can_track_time,
      can_audit_time = new.can_audit_time
  where team_id = new.team_id and role = new.role and role <> 'owner';
  return new;
end;
$$;

drop trigger if exists team_role_permissions_sync_members on public.team_role_permissions;
create trigger team_role_permissions_sync_members
before insert or update on public.team_role_permissions
for each row execute function public.sync_team_role_permissions_to_members();

create or replace function public.can_administer_team(candidate_team_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.team_members
    where team_id = candidate_team_id and user_id = auth.uid()
      and not project_limited and (role = 'owner' or can_administer)
  );
$$;

create or replace function public.is_team_admin(candidate_team_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.can_administer_team(candidate_team_id);
$$;

create or replace function public.can_track_time(candidate_team_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.team_members
    where team_id = candidate_team_id and user_id = auth.uid()
      and not project_limited and (role = 'owner' or can_track_time)
  );
$$;

create or replace function public.can_audit_time(candidate_team_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.team_members
    where team_id = candidate_team_id and user_id = auth.uid()
      and not project_limited and (role = 'owner' or can_audit_time)
  );
$$;

revoke all on function public.can_administer_team(uuid) from public;
revoke all on function public.can_track_time(uuid) from public;
revoke all on function public.can_audit_time(uuid) from public;
grant execute on function public.can_administer_team(uuid) to authenticated;
grant execute on function public.can_track_time(uuid) to authenticated;
grant execute on function public.can_audit_time(uuid) to authenticated;

drop policy if exists "members view role permissions" on public.team_role_permissions;
create policy "members view role permissions"
on public.team_role_permissions for select to authenticated
using (public.is_team_member(team_id));

drop policy if exists "users view scoped time entries" on public.time_entries;
drop policy if exists "users view permitted time entries" on public.time_entries;
create policy "users view permitted time entries"
on public.time_entries for select to authenticated
using (
  (user_id = auth.uid() and public.can_track_time(team_id))
  or public.can_audit_time(team_id)
);

drop policy if exists "users create scoped time entries" on public.time_entries;
drop policy if exists "users create own time entries" on public.time_entries;
create policy "users create permitted time entries"
on public.time_entries for insert to authenticated
with check (user_id = auth.uid() and public.can_track_time(team_id));

drop policy if exists "users update scoped time entries" on public.time_entries;
drop policy if exists "users update permitted time entries" on public.time_entries;
create policy "users update permitted time entries"
on public.time_entries for update to authenticated
using (
  (user_id = auth.uid() and public.can_track_time(team_id))
  or public.can_audit_time(team_id)
)
with check (
  (user_id = auth.uid() and public.can_track_time(team_id))
  or public.can_audit_time(team_id)
);

drop policy if exists "users delete scoped time entries" on public.time_entries;
drop policy if exists "users delete permitted time entries" on public.time_entries;
create policy "users delete permitted time entries"
on public.time_entries for delete to authenticated
using (
  (user_id = auth.uid() and public.can_track_time(team_id))
  or public.can_audit_time(team_id)
);

create or replace function public.start_task_timer(
  candidate_task_id uuid,
  candidate_description text default '',
  candidate_billable boolean default true
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  target_task public.tasks%rowtype;
  member_rate numeric(12, 2);
  new_entry_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into target_task from public.tasks where id = candidate_task_id;
  if target_task.id is null then raise exception 'Task not found'; end if;
  if not public.can_view_task(candidate_task_id) or not public.can_track_time(target_task.team_id) then
    raise exception 'Time tracking permission required';
  end if;
  select hourly_rate into member_rate from public.team_members
  where team_id = target_task.team_id and user_id = auth.uid();
  if exists (select 1 from public.time_entries where team_id = target_task.team_id
    and task_id = target_task.id and user_id = auth.uid() and ended_at is null) then
    raise exception 'A timer is already active for this task';
  end if;
  insert into public.time_entries (
    team_id, task_id, project_id, client_id, user_id, description,
    started_at, billable, hourly_rate
  ) values (
    target_task.team_id, target_task.id, target_task.project_id, target_task.client_id,
    auth.uid(), trim(coalesce(candidate_description, '')), now(),
    candidate_billable, coalesce(member_rate, 0)
  ) returning id into new_entry_id;
  return new_entry_id;
end;
$$;

create or replace function public.create_manual_time_entry(
  candidate_task_id uuid,
  candidate_description text,
  candidate_started_at timestamptz,
  candidate_duration_seconds integer,
  candidate_billable boolean default true
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  target_task public.tasks%rowtype;
  member_rate numeric(12, 2);
  new_entry_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if candidate_duration_seconds <= 0 or candidate_duration_seconds > 86400 then
    raise exception 'Duration must be between 1 second and 24 hours';
  end if;
  select * into target_task from public.tasks where id = candidate_task_id;
  if target_task.id is null then raise exception 'Task not found'; end if;
  if not public.can_view_task(candidate_task_id) or not public.can_track_time(target_task.team_id) then
    raise exception 'Time tracking permission required';
  end if;
  select hourly_rate into member_rate from public.team_members
  where team_id = target_task.team_id and user_id = auth.uid();
  insert into public.time_entries (
    team_id, task_id, project_id, client_id, user_id, description, started_at,
    ended_at, duration_seconds, billable, hourly_rate
  ) values (
    target_task.team_id, target_task.id, target_task.project_id, target_task.client_id,
    auth.uid(), trim(coalesce(candidate_description, '')), candidate_started_at,
    candidate_started_at + make_interval(secs => candidate_duration_seconds),
    candidate_duration_seconds, candidate_billable, coalesce(member_rate, 0)
  ) returning id into new_entry_id;
  return new_entry_id;
end;
$$;

create or replace function public.stop_task_timer(candidate_entry_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare target_entry public.time_entries%rowtype;
begin
  select * into target_entry from public.time_entries where id = candidate_entry_id;
  if target_entry.id is null then raise exception 'Time entry not found'; end if;
  if (target_entry.user_id <> auth.uid() or not public.can_track_time(target_entry.team_id))
    and not public.can_audit_time(target_entry.team_id) then
    raise exception 'Not allowed to stop this timer';
  end if;
  update public.time_entries
  set ended_at = now(), duration_seconds = greatest(
    duration_seconds, floor(extract(epoch from (now() - started_at)))::integer
  )
  where id = candidate_entry_id and ended_at is null;
end;
$$;

create or replace function public.create_scoped_time_entry(
  candidate_team_id uuid,
  candidate_project_id uuid,
  candidate_client_id uuid,
  candidate_description text,
  candidate_started_at timestamptz,
  candidate_duration_seconds integer,
  candidate_billable boolean default true
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare member_rate numeric(12,2); new_entry_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if candidate_duration_seconds <= 0 or candidate_duration_seconds > 86400 then
    raise exception 'Duration must be between 1 second and 24 hours';
  end if;
  if not public.can_track_time(candidate_team_id) then
    raise exception 'Time tracking permission required';
  end if;
  if candidate_project_id is not null and not public.has_project_access(candidate_project_id) then
    raise exception 'Project access required';
  end if;
  if candidate_client_id is not null and not public.can_view_client(candidate_client_id) then
    raise exception 'Client access required';
  end if;
  if candidate_project_id is null and candidate_client_id is null then
    raise exception 'Project or client required';
  end if;
  select hourly_rate into member_rate from public.team_members
  where team_id = candidate_team_id and user_id = auth.uid();
  insert into public.time_entries (
    team_id, task_id, project_id, client_id, user_id, description,
    started_at, ended_at, duration_seconds, billable, hourly_rate
  ) values (
    candidate_team_id, null, candidate_project_id, candidate_client_id,
    auth.uid(), trim(coalesce(candidate_description, '')), candidate_started_at,
    candidate_started_at + make_interval(secs => candidate_duration_seconds),
    candidate_duration_seconds, candidate_billable, coalesce(member_rate, 0)
  ) returning id into new_entry_id;
  return new_entry_id;
end;
$$;
