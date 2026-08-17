-- Sincronización confiable entre integrantes de Taska y unidades compartidas.
-- La tabla funciona como outbox: los cambios de membresía nunca se pierden si
-- Google Drive está temporalmente indisponible.

create table if not exists public.google_drive_membership_sync_jobs (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  email text not null,
  drive_id text not null,
  desired_action text not null check (desired_action in ('upsert', 'remove')),
  desired_role public.team_role,
  permission_id text,
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (team_id, user_id, drive_id)
);

alter table public.google_drive_membership_sync_jobs enable row level security;

create index if not exists google_drive_membership_sync_pending_idx
on public.google_drive_membership_sync_jobs (updated_at)
where synced_at is null;

create or replace function public.enqueue_google_drive_membership_sync(
  candidate_team_id uuid,
  candidate_user_id uuid,
  candidate_role public.team_role,
  candidate_project_limited boolean,
  candidate_action text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate_email text;
  candidate_drive_id text;
  final_action text;
begin
  select lower(profile.email), team.google_drive_id
    into candidate_email, candidate_drive_id
  from public.profiles as profile
  cross join public.teams as team
  where profile.id = candidate_user_id
    and team.id = candidate_team_id;

  if candidate_email is null or candidate_drive_id is null then
    return;
  end if;

  final_action := case
    when candidate_action = 'remove' or candidate_project_limited then 'remove'
    else 'upsert'
  end;

  insert into public.google_drive_membership_sync_jobs (
    team_id,
    user_id,
    email,
    drive_id,
    desired_action,
    desired_role,
    attempts,
    last_error,
    synced_at,
    updated_at
  ) values (
    candidate_team_id,
    candidate_user_id,
    candidate_email,
    candidate_drive_id,
    final_action,
    case when final_action = 'upsert' then candidate_role else null end,
    0,
    null,
    null,
    now()
  )
  on conflict (team_id, user_id, drive_id) do update set
    email = excluded.email,
    drive_id = excluded.drive_id,
    desired_action = excluded.desired_action,
    desired_role = excluded.desired_role,
    attempts = 0,
    last_error = null,
    synced_at = null,
    updated_at = now();
end;
$$;

create or replace function public.queue_google_drive_membership_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform public.enqueue_google_drive_membership_sync(
      old.team_id,
      old.user_id,
      old.role,
      old.project_limited,
      'remove'
    );
    return old;
  end if;

  perform public.enqueue_google_drive_membership_sync(
    new.team_id,
    new.user_id,
    new.role,
    new.project_limited,
    'upsert'
  );
  return new;
end;
$$;

drop trigger if exists team_members_queue_google_drive_sync
on public.team_members;
create trigger team_members_queue_google_drive_sync
after insert or update of role, project_limited on public.team_members
for each row execute function public.queue_google_drive_membership_change();

drop trigger if exists team_members_queue_google_drive_removal
on public.team_members;
create trigger team_members_queue_google_drive_removal
after delete on public.team_members
for each row execute function public.queue_google_drive_membership_change();

create or replace function public.queue_google_drive_team_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  member public.team_members%rowtype;
begin
  if new.google_drive_id is not distinct from old.google_drive_id then
    return new;
  end if;

  for member in
    select * from public.team_members where team_id = new.id
  loop
    if old.google_drive_id is not null then
      insert into public.google_drive_membership_sync_jobs (
        team_id, user_id, email, drive_id, desired_action, desired_role,
        attempts, last_error, synced_at, updated_at
      )
      select
        member.team_id,
        member.user_id,
        lower(profile.email),
        old.google_drive_id,
        'remove',
        null,
        0,
        null,
        null,
        now()
      from public.profiles as profile
      where profile.id = member.user_id and profile.email is not null
      on conflict (team_id, user_id, drive_id) do update set
        email = excluded.email,
        desired_action = 'remove',
        desired_role = null,
        attempts = 0,
        last_error = null,
        synced_at = null,
        updated_at = now();
    end if;
    perform public.enqueue_google_drive_membership_sync(
      member.team_id,
      member.user_id,
      member.role,
      member.project_limited,
      'upsert'
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists teams_queue_google_drive_sync on public.teams;
create trigger teams_queue_google_drive_sync
after update of google_drive_id on public.teams
for each row execute function public.queue_google_drive_team_change();

select public.enqueue_google_drive_membership_sync(
  member.team_id,
  member.user_id,
  member.role,
  member.project_limited,
  'upsert'
)
from public.team_members as member
join public.teams as team on team.id = member.team_id
where team.google_drive_id is not null;

revoke all on table public.google_drive_membership_sync_jobs from anon, authenticated;
revoke all on function public.enqueue_google_drive_membership_sync(uuid, uuid, public.team_role, boolean, text) from public;
revoke all on function public.queue_google_drive_membership_change() from public;
revoke all on function public.queue_google_drive_team_change() from public;
