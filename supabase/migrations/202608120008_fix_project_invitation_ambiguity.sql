-- Evita que los nombres de las columnas de retorno de la función se confundan
-- con las columnas reales de project_invitations dentro de ON CONFLICT.

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

  select project.team_id into candidate_team_id
  from public.projects as project
  where project.id = candidate_project_id;

  if candidate_team_id is null then
    raise exception 'Project not found';
  end if;

  return query
  insert into public.project_invitations as invitation (
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

revoke all on function public.create_project_invitation(
  uuid,
  text,
  public.project_role,
  boolean
) from public;
grant execute on function public.create_project_invitation(
  uuid,
  text,
  public.project_role,
  boolean
) to authenticated;
