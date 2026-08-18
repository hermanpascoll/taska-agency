-- Permite que cada proyecto decida si compartir es exclusivo de administradores
-- o si también pueden hacerlo los editores, como en Asana.

alter table public.projects
  add column if not exists sharing_permission text not null default 'admins_editors';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'projects_sharing_permission_check'
      and conrelid = 'public.projects'::regclass
  ) then
    alter table public.projects
      add constraint projects_sharing_permission_check
      check (sharing_permission in ('admins_editors', 'admins_only'));
  end if;
end;
$$;

create or replace function public.can_share_project(candidate_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.can_admin_project(candidate_project_id)
    or exists (
      select 1 from public.projects as project
      where project.id = candidate_project_id
        and project.sharing_permission = 'admins_editors'
        and public.can_edit_project_tasks(project.id)
    );
$$;

revoke all on function public.can_share_project(uuid) from public;
grant execute on function public.can_share_project(uuid) to authenticated;

drop policy if exists "project admins manage project members" on public.project_members;
create policy "project sharers manage project members"
on public.project_members for all to authenticated
using (public.can_share_project(project_id))
with check (public.can_share_project(project_id));

drop policy if exists "project admins view invitations" on public.project_invitations;
create policy "project sharers view invitations"
on public.project_invitations for select to authenticated
using (public.can_share_project(project_id));

drop policy if exists "project admins delete invitations" on public.project_invitations;
create policy "project sharers delete invitations"
on public.project_invitations for delete to authenticated
using (public.can_share_project(project_id));

create or replace function public.upsert_project_member(
  candidate_project_id uuid,
  candidate_user_id uuid,
  candidate_role public.project_role default 'editor',
  candidate_notify_on_new_tasks boolean default true
)
returns void language plpgsql security definer set search_path = '' as $$
declare candidate_team_id uuid;
begin
  if not public.can_share_project(candidate_project_id) then
    raise exception 'Project sharing permission required';
  end if;

  select team_id into candidate_team_id
  from public.projects where id = candidate_project_id;

  if not exists (
    select 1 from public.team_members
    where team_id = candidate_team_id and user_id = candidate_user_id
  ) then
    raise exception 'The user must belong to the workspace';
  end if;

  insert into public.project_members (
    project_id, user_id, role, notify_on_new_tasks
  ) values (
    candidate_project_id, candidate_user_id, candidate_role,
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
returns void language plpgsql security definer set search_path = '' as $$
declare candidate_team_id uuid;
begin
  if not public.can_share_project(candidate_project_id) then
    raise exception 'Project sharing permission required';
  end if;

  select team_id into candidate_team_id
  from public.projects where id = candidate_project_id;

  delete from public.project_members
  where project_id = candidate_project_id
    and user_id = candidate_user_id;

  delete from public.team_members as member
  where member.team_id = candidate_team_id
    and member.user_id = candidate_user_id
    and member.project_limited
    and not exists (
      select 1
      from public.project_members as remaining
      join public.projects as project on project.id = remaining.project_id
      where remaining.user_id = candidate_user_id
        and project.team_id = candidate_team_id
    );
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
language plpgsql security definer set search_path = '' as $$
declare
  normalized_email text := lower(trim(candidate_email));
  candidate_team_id uuid;
begin
  if not public.can_share_project(candidate_project_id) then
    raise exception 'Project sharing permission required';
  end if;
  if normalized_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'A valid email is required';
  end if;

  select project.team_id into candidate_team_id
  from public.projects as project
  where project.id = candidate_project_id;

  if candidate_team_id is null then
    raise exception 'Project not found';
  end if;

  return query
  insert into public.project_invitations as invitation (
    project_id, team_id, email, role, notify_on_new_tasks,
    invited_by, expires_at, accepted_at, token
  ) values (
    candidate_project_id, candidate_team_id, normalized_email,
    candidate_role, candidate_notify_on_new_tasks, auth.uid(),
    now() + interval '7 days', null, gen_random_uuid()
  )
  on conflict on constraint project_invitations_project_id_email_key do update
  set role = excluded.role,
      notify_on_new_tasks = excluded.notify_on_new_tasks,
      invited_by = excluded.invited_by,
      created_at = now(),
      expires_at = now() + interval '7 days',
      accepted_at = null,
      token = gen_random_uuid()
  returning
    invitation.id,
    invitation.project_id,
    invitation.team_id,
    invitation.email,
    invitation.role,
    invitation.notify_on_new_tasks,
    invitation.token,
    invitation.created_at,
    invitation.expires_at,
    invitation.accepted_at;
end;
$$;
