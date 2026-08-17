-- Equipos internos dentro de un espacio de trabajo.
-- No reemplazan a public.teams (espacios): agrupan personas para organizar el trabajo.

create table if not exists public.workspace_groups (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 80),
  description text not null default '',
  color text not null default '#0a84ff',
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, name)
);

create table if not exists public.workspace_group_members (
  group_id uuid not null references public.workspace_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.workspace_group_invitations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.workspace_groups(id) on delete cascade,
  email text not null,
  token uuid not null default gen_random_uuid() unique,
  invited_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  unique (group_id, email)
);

create index if not exists workspace_groups_team_id_idx
  on public.workspace_groups(team_id, created_at);
create index if not exists workspace_group_members_user_id_idx
  on public.workspace_group_members(user_id);
create index if not exists workspace_group_invitations_group_id_idx
  on public.workspace_group_invitations(group_id);

create or replace function public.can_manage_workspace_group(candidate_group_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.workspace_groups as workspace_group
    where workspace_group.id = candidate_group_id
      and (
        workspace_group.created_by = auth.uid()
        or public.is_team_admin(workspace_group.team_id)
      )
  );
$$;

create or replace function public.create_workspace_group(
  candidate_team_id uuid,
  candidate_name text,
  candidate_description text default '',
  candidate_color text default '#0a84ff'
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare created_group_id uuid;
begin
  if not public.is_full_team_member(candidate_team_id) then
    raise exception 'Only workspace members can create teams';
  end if;
  insert into public.workspace_groups (team_id, name, description, color, created_by)
  values (
    candidate_team_id,
    trim(candidate_name),
    coalesce(trim(candidate_description), ''),
    coalesce(nullif(candidate_color, ''), '#0a84ff'),
    auth.uid()
  ) returning id into created_group_id;
  insert into public.workspace_group_members (group_id, user_id, role)
  values (created_group_id, auth.uid(), 'owner');
  return created_group_id;
end;
$$;

create or replace function public.add_workspace_group_member(
  candidate_group_id uuid,
  candidate_user_id uuid
)
returns void language plpgsql security definer set search_path = '' as $$
declare candidate_team_id uuid;
begin
  if not public.can_manage_workspace_group(candidate_group_id) then
    raise exception 'Only team owners or workspace administrators can add members';
  end if;
  select team_id into candidate_team_id
  from public.workspace_groups where id = candidate_group_id;
  if not exists (
    select 1 from public.team_members
    where team_id = candidate_team_id and user_id = candidate_user_id
  ) then
    raise exception 'The user must belong to the workspace';
  end if;
  insert into public.workspace_group_members (group_id, user_id, role)
  values (candidate_group_id, candidate_user_id, 'member')
  on conflict (group_id, user_id) do nothing;
end;
$$;

create or replace function public.remove_workspace_group_member(
  candidate_group_id uuid,
  candidate_user_id uuid
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_manage_workspace_group(candidate_group_id) then
    raise exception 'Only team owners or workspace administrators can remove members';
  end if;
  if exists (
    select 1 from public.workspace_group_members
    where group_id = candidate_group_id and user_id = candidate_user_id and role = 'owner'
  ) then
    raise exception 'The team owner cannot be removed';
  end if;
  delete from public.workspace_group_members
  where group_id = candidate_group_id and user_id = candidate_user_id;
end;
$$;

create or replace function public.create_workspace_group_invitation(
  candidate_group_id uuid,
  candidate_email text
)
returns table (
  id uuid, group_id uuid, email text, token uuid,
  created_at timestamptz, expires_at timestamptz, accepted_at timestamptz
)
language plpgsql security definer set search_path = '' as $$
declare normalized_email text := lower(trim(candidate_email));
begin
  if not public.can_manage_workspace_group(candidate_group_id) then
    raise exception 'Only team owners or workspace administrators can invite members';
  end if;
  if normalized_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'A valid email is required';
  end if;
  return query
  insert into public.workspace_group_invitations as invitation (
    group_id, email, invited_by, token, created_at, expires_at, accepted_at
  ) values (
    candidate_group_id, normalized_email, auth.uid(), gen_random_uuid(),
    now(), now() + interval '7 days', null
  )
  on conflict (group_id, email)
  do update set invited_by = excluded.invited_by, token = gen_random_uuid(),
    created_at = now(), expires_at = now() + interval '7 days', accepted_at = null
  returning invitation.id, invitation.group_id, invitation.email, invitation.token,
    invitation.created_at, invitation.expires_at, invitation.accepted_at;
end;
$$;

create or replace function public.accept_workspace_group_invitation(invitation_token uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare invitation public.workspace_group_invitations%rowtype;
declare target_team_id uuid;
declare current_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into invitation from public.workspace_group_invitations
  where token = invitation_token and accepted_at is null and expires_at > now();
  if invitation.id is null then raise exception 'Invitation is invalid or expired'; end if;
  if current_email <> invitation.email then raise exception 'Sign in with the invited email address'; end if;

  select team_id into target_team_id from public.workspace_groups where id = invitation.group_id;
  insert into public.team_members (team_id, user_id, role, project_limited)
  values (target_team_id, auth.uid(), 'agent', false)
  on conflict (team_id, user_id) do nothing;
  insert into public.workspace_group_members (group_id, user_id, role)
  values (invitation.group_id, auth.uid(), 'member')
  on conflict (group_id, user_id) do nothing;
  update public.workspace_group_invitations set accepted_at = now() where id = invitation.id;
  return invitation.group_id;
end;
$$;

alter table public.workspace_groups enable row level security;
alter table public.workspace_group_members enable row level security;
alter table public.workspace_group_invitations enable row level security;

create policy "workspace members view teams" on public.workspace_groups
for select to authenticated using (public.is_team_member(team_id));
create policy "team managers update teams" on public.workspace_groups
for update to authenticated using (public.can_manage_workspace_group(id))
with check (public.can_manage_workspace_group(id));
create policy "team managers delete teams" on public.workspace_groups
for delete to authenticated using (public.can_manage_workspace_group(id));

create policy "workspace members view team members" on public.workspace_group_members
for select to authenticated using (
  exists (
    select 1 from public.workspace_groups as workspace_group
    where workspace_group.id = group_id and public.is_team_member(workspace_group.team_id)
  )
);
create policy "team managers view invitations" on public.workspace_group_invitations
for select to authenticated using (public.can_manage_workspace_group(group_id));
create policy "team managers revoke invitations" on public.workspace_group_invitations
for delete to authenticated using (public.can_manage_workspace_group(group_id));

revoke all on function public.can_manage_workspace_group(uuid) from public;
revoke all on function public.create_workspace_group(uuid, text, text, text) from public;
revoke all on function public.add_workspace_group_member(uuid, uuid) from public;
revoke all on function public.remove_workspace_group_member(uuid, uuid) from public;
revoke all on function public.create_workspace_group_invitation(uuid, text) from public;
revoke all on function public.accept_workspace_group_invitation(uuid) from public;
grant execute on function public.can_manage_workspace_group(uuid) to authenticated;
grant execute on function public.create_workspace_group(uuid, text, text, text) to authenticated;
grant execute on function public.add_workspace_group_member(uuid, uuid) to authenticated;
grant execute on function public.remove_workspace_group_member(uuid, uuid) to authenticated;
grant execute on function public.create_workspace_group_invitation(uuid, text) to authenticated;
grant execute on function public.accept_workspace_group_invitation(uuid) to authenticated;
