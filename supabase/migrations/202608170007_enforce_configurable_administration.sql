-- Hace que el permiso configurable de administración reemplace los chequeos
-- históricos basados exclusivamente en el nombre del rol.

create or replace function public.can_admin_project(candidate_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.projects as project
    where project.id = candidate_project_id
      and public.can_administer_team(project.team_id)
  ) or exists (
    select 1 from public.project_members
    where project_id = candidate_project_id
      and user_id = auth.uid()
      and role = 'admin'
  );
$$;

create or replace function public.update_member_role(
  candidate_team_id uuid,
  candidate_user_id uuid,
  candidate_role public.team_role
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  caller_role public.team_role;
  target_role public.team_role;
  owner_count integer;
begin
  select role into caller_role from public.team_members
  where team_id = candidate_team_id and user_id = auth.uid();
  select role into target_role from public.team_members
  where team_id = candidate_team_id and user_id = candidate_user_id;

  if not public.can_administer_team(candidate_team_id) then
    raise exception 'Only workspace administrators can update roles';
  end if;
  if (target_role = 'owner' or candidate_role = 'owner') and caller_role <> 'owner' then
    raise exception 'Only owners can manage the owner role';
  end if;
  if target_role = 'owner' and candidate_role <> 'owner' then
    select count(*) into owner_count from public.team_members
    where team_id = candidate_team_id and role = 'owner';
    if owner_count <= 1 then
      raise exception 'A workspace must keep at least one owner';
    end if;
  end if;
  update public.team_members set role = candidate_role
  where team_id = candidate_team_id and user_id = candidate_user_id;
end;
$$;

create or replace function public.remove_team_member(
  candidate_team_id uuid,
  candidate_user_id uuid
)
returns void language plpgsql security definer set search_path = '' as $$
declare target_role public.team_role;
begin
  select role into target_role from public.team_members
  where team_id = candidate_team_id and user_id = candidate_user_id;
  if candidate_user_id <> auth.uid() and not public.can_administer_team(candidate_team_id) then
    raise exception 'Only workspace administrators can remove members';
  end if;
  if target_role = 'owner' then
    raise exception 'Transfer ownership before removing an owner';
  end if;
  delete from public.team_members
  where team_id = candidate_team_id and user_id = candidate_user_id;
end;
$$;
