-- Completa identidad de Google al iniciar sesión o aceptar una invitación.
-- Una foto personalizada existente tiene prioridad sobre la foto de Google.

update public.profiles as profile
set avatar_url = coalesce(
  profile.avatar_url,
  auth_user.raw_user_meta_data ->> 'avatar_url',
  auth_user.raw_user_meta_data ->> 'picture'
)
from auth.users as auth_user
where profile.id = auth_user.id and profile.avatar_url is null;

create or replace function public.bootstrap_workspace()
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  current_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  current_name text := coalesce(
    auth.jwt() -> 'user_metadata' ->> 'full_name',
    auth.jwt() -> 'user_metadata' ->> 'name',
    split_part(current_email, '@', 1),
    'Integrante'
  );
  current_avatar text := coalesce(
    auth.jwt() -> 'user_metadata' ->> 'avatar_url',
    auth.jwt() -> 'user_metadata' ->> 'picture'
  );
  existing_team_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  insert into public.profiles (id, full_name, email, avatar_url)
  values (auth.uid(), current_name, nullif(current_email, ''), current_avatar)
  on conflict (id) do update set
    email = coalesce(excluded.email, public.profiles.email),
    full_name = case
      when public.profiles.full_name is null
        or public.profiles.full_name = 'Dirección de cuentas'
        or public.profiles.full_name = split_part(public.profiles.email, '@', 1)
      then excluded.full_name else public.profiles.full_name end,
    avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url);

  insert into public.team_members (team_id, user_id, role, project_limited)
  select invitation.team_id, auth.uid(), invitation.role, false
  from public.team_invitations as invitation
  where invitation.email = current_email
    and invitation.accepted_at is null and invitation.expires_at > now()
  on conflict (team_id, user_id) do update set
    role = excluded.role, project_limited = false;

  update public.team_invitations
  set accepted_at = now()
  where email = current_email and accepted_at is null and expires_at > now();

  insert into public.team_members (team_id, user_id, role, project_limited)
  select invitation.team_id, auth.uid(),
    case when invitation.role = 'viewer' then 'viewer'::public.team_role else 'agent'::public.team_role end,
    true
  from public.project_invitations as invitation
  where invitation.email = current_email
    and invitation.accepted_at is null and invitation.expires_at > now()
  on conflict (team_id, user_id) do nothing;

  insert into public.project_members (project_id, user_id, role, notify_on_new_tasks)
  select invitation.project_id, auth.uid(), invitation.role, invitation.notify_on_new_tasks
  from public.project_invitations as invitation
  where invitation.email = current_email
    and invitation.accepted_at is null and invitation.expires_at > now()
  on conflict (project_id, user_id) do update set
    role = excluded.role, notify_on_new_tasks = excluded.notify_on_new_tasks;

  update public.project_invitations
  set accepted_at = now()
  where email = current_email and accepted_at is null and expires_at > now();

  select member.team_id into existing_team_id
  from public.team_members as member
  where member.user_id = auth.uid()
  order by member.project_limited, member.joined_at
  limit 1;

  return existing_team_id;
end;
$$;

revoke all on function public.bootstrap_workspace() from public;
grant execute on function public.bootstrap_workspace() to authenticated;
