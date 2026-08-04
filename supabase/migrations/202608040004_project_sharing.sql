-- Miembros, roles e invitaciones específicas por campaña/proyecto.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'project_role') then
    create type public.project_role as enum ('admin', 'editor', 'commenter', 'viewer');
  end if;
end
$$;

create table if not exists public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.project_role not null default 'editor',
  notify_on_new_tasks boolean not null default true,
  joined_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table if not exists public.project_invitations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  email text not null,
  role public.project_role not null default 'editor',
  notify_on_new_tasks boolean not null default true,
  token uuid not null default gen_random_uuid() unique,
  invited_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  unique (project_id, email)
);

create index if not exists project_members_user_id_idx
on public.project_members(user_id);
create index if not exists project_invitations_project_id_idx
on public.project_invitations(project_id);
create index if not exists project_invitations_token_idx
on public.project_invitations(token);

insert into public.project_members (project_id, user_id, role)
select
  project.id,
  member.user_id,
  case
    when member.role in ('owner', 'admin') then 'admin'::public.project_role
    when member.role = 'viewer' then 'viewer'::public.project_role
    else 'editor'::public.project_role
  end
from public.projects as project
join public.team_members as member on member.team_id = project.team_id
on conflict (project_id, user_id) do nothing;

create or replace function public.is_project_admin(candidate_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1
      from public.project_members
      where project_id = candidate_project_id
        and user_id = auth.uid()
        and role = 'admin'
    )
    or exists (
      select 1
      from public.projects
      where id = candidate_project_id
        and public.is_team_admin(team_id)
    );
$$;

create or replace function public.add_project_creator_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    insert into public.project_members (project_id, user_id, role)
    values (new.id, auth.uid(), 'admin')
    on conflict (project_id, user_id) do update set role = 'admin';
  end if;
  return new;
end;
$$;

drop trigger if exists projects_add_creator_member on public.projects;
create trigger projects_add_creator_member
after insert on public.projects
for each row execute function public.add_project_creator_member();

create or replace function public.notify_project_members_new_task()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (user_id, task_id, title, body)
  select
    member.user_id,
    new.id,
    'Nueva tarea en un proyecto compartido',
    'Se agregó “' || new.title || '” al proyecto.'
  from public.project_members as member
  where member.project_id = new.project_id
    and member.notify_on_new_tasks
    and member.user_id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);
  return new;
end;
$$;

drop trigger if exists tasks_notify_project_members on public.tasks;
create trigger tasks_notify_project_members
after insert on public.tasks
for each row execute function public.notify_project_members_new_task();

alter table public.project_members enable row level security;
alter table public.project_invitations enable row level security;

drop policy if exists "workspace members view project members" on public.project_members;
create policy "workspace members view project members"
on public.project_members for select
to authenticated
using (
  exists (
    select 1
    from public.projects
    where projects.id = project_members.project_id
      and public.is_team_member(projects.team_id)
  )
);

drop policy if exists "project admins manage project members" on public.project_members;
create policy "project admins manage project members"
on public.project_members for all
to authenticated
using (public.is_project_admin(project_id))
with check (public.is_project_admin(project_id));

drop policy if exists "project admins view invitations" on public.project_invitations;
create policy "project admins view invitations"
on public.project_invitations for select
to authenticated
using (public.is_project_admin(project_id));

drop policy if exists "project admins delete invitations" on public.project_invitations;
create policy "project admins delete invitations"
on public.project_invitations for delete
to authenticated
using (public.is_project_admin(project_id));

create or replace function public.upsert_project_member(
  candidate_project_id uuid,
  candidate_user_id uuid,
  candidate_role public.project_role default 'editor',
  candidate_notify_on_new_tasks boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate_team_id uuid;
begin
  if not public.is_project_admin(candidate_project_id) then
    raise exception 'Only project administrators can manage members';
  end if;

  select team_id into candidate_team_id
  from public.projects
  where id = candidate_project_id;

  if not exists (
    select 1 from public.team_members
    where team_id = candidate_team_id and user_id = candidate_user_id
  ) then
    raise exception 'The user must belong to the workspace';
  end if;

  insert into public.project_members (
    project_id,
    user_id,
    role,
    notify_on_new_tasks
  )
  values (
    candidate_project_id,
    candidate_user_id,
    candidate_role,
    candidate_notify_on_new_tasks
  )
  on conflict (project_id, user_id) do update
  set role = excluded.role,
      notify_on_new_tasks = excluded.notify_on_new_tasks;
end;
$$;

create or replace function public.remove_project_member(
  candidate_project_id uuid,
  candidate_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_project_admin(candidate_project_id) then
    raise exception 'Only project administrators can manage members';
  end if;
  delete from public.project_members
  where project_id = candidate_project_id
    and user_id = candidate_user_id;
end;
$$;

create or replace function public.create_project_invitation(
  candidate_project_id uuid,
  candidate_email text,
  candidate_role public.project_role default 'editor',
  candidate_notify_on_new_tasks boolean default true
)
returns table (
  id uuid,
  project_id uuid,
  team_id uuid,
  email text,
  role public.project_role,
  notify_on_new_tasks boolean,
  token uuid,
  created_at timestamptz,
  expires_at timestamptz,
  accepted_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := lower(trim(candidate_email));
  candidate_team_id uuid;
begin
  if not public.is_project_admin(candidate_project_id) then
    raise exception 'Only project administrators can invite members';
  end if;
  if normalized_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'A valid email is required';
  end if;

  select projects.team_id into candidate_team_id
  from public.projects
  where projects.id = candidate_project_id;

  return query
  insert into public.project_invitations (
    project_id,
    team_id,
    email,
    role,
    notify_on_new_tasks,
    invited_by,
    expires_at,
    accepted_at,
    token
  )
  values (
    candidate_project_id,
    candidate_team_id,
    normalized_email,
    candidate_role,
    candidate_notify_on_new_tasks,
    auth.uid(),
    now() + interval '7 days',
    null,
    gen_random_uuid()
  )
  on conflict (project_id, email) do update
  set role = excluded.role,
      notify_on_new_tasks = excluded.notify_on_new_tasks,
      invited_by = excluded.invited_by,
      created_at = now(),
      expires_at = now() + interval '7 days',
      accepted_at = null,
      token = gen_random_uuid()
  returning
    project_invitations.id,
    project_invitations.project_id,
    project_invitations.team_id,
    project_invitations.email,
    project_invitations.role,
    project_invitations.notify_on_new_tasks,
    project_invitations.token,
    project_invitations.created_at,
    project_invitations.expires_at,
    project_invitations.accepted_at;
end;
$$;

create or replace function public.accept_project_invitation(invitation_token uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation public.project_invitations%rowtype;
  current_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  workspace_role public.team_role;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into invitation
  from public.project_invitations
  where token = invitation_token
    and accepted_at is null
    and expires_at > now();

  if invitation.id is null then
    raise exception 'Project invitation is invalid or expired';
  end if;
  if current_email <> invitation.email then
    raise exception 'Sign in with the invited email address';
  end if;

  insert into public.profiles (id, full_name, email)
  values (auth.uid(), split_part(current_email, '@', 1), current_email)
  on conflict (id) do update set email = excluded.email;

  workspace_role := case
    when invitation.role = 'viewer' then 'viewer'::public.team_role
    else 'agent'::public.team_role
  end;
  insert into public.team_members (team_id, user_id, role)
  values (invitation.team_id, auth.uid(), workspace_role)
  on conflict (team_id, user_id) do nothing;

  insert into public.project_members (
    project_id,
    user_id,
    role,
    notify_on_new_tasks
  )
  values (
    invitation.project_id,
    auth.uid(),
    invitation.role,
    invitation.notify_on_new_tasks
  )
  on conflict (project_id, user_id) do update
  set role = excluded.role,
      notify_on_new_tasks = excluded.notify_on_new_tasks;

  update public.project_invitations
  set accepted_at = now()
  where id = invitation.id;

  return invitation.project_id;
end;
$$;

revoke all on function public.upsert_project_member(uuid, uuid, public.project_role, boolean) from public;
revoke all on function public.remove_project_member(uuid, uuid) from public;
revoke all on function public.create_project_invitation(uuid, text, public.project_role, boolean) from public;
revoke all on function public.accept_project_invitation(uuid) from public;

grant execute on function public.upsert_project_member(uuid, uuid, public.project_role, boolean) to authenticated;
grant execute on function public.remove_project_member(uuid, uuid) to authenticated;
grant execute on function public.create_project_invitation(uuid, text, public.project_role, boolean) to authenticated;
grant execute on function public.accept_project_invitation(uuid) to authenticated;
