-- Evita que las columnas de retorno de la RPC colisionen con las columnas de
-- team_invitations (el mismo problema ya corregido para proyectos).
create or replace function public.create_team_invitation(
  candidate_team_id uuid,
  candidate_email text,
  candidate_role public.team_role default 'agent'
)
returns table (
  id uuid, team_id uuid, email text, role public.team_role, token uuid,
  created_at timestamptz, expires_at timestamptz, accepted_at timestamptz
)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare normalized_email text := lower(trim(candidate_email));
begin
  if not public.is_team_admin(candidate_team_id) then
    raise exception 'Only workspace administrators can invite members';
  end if;
  if normalized_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'A valid email is required';
  end if;
  if candidate_role = 'owner' then raise exception 'Owner invitations are not allowed'; end if;

  return query
  insert into public.team_invitations as invitation (
    team_id, email, role, invited_by, expires_at, accepted_at, token
  ) values (
    candidate_team_id, normalized_email, candidate_role, auth.uid(),
    now() + interval '7 days', null, gen_random_uuid()
  ) on conflict (team_id, email) do update set
    role = excluded.role, invited_by = excluded.invited_by,
    created_at = now(), expires_at = now() + interval '7 days',
    accepted_at = null, token = gen_random_uuid()
  returning invitation.id, invitation.team_id, invitation.email,
    invitation.role, invitation.token, invitation.created_at,
    invitation.expires_at, invitation.accepted_at;
end;
$$;

revoke all on function public.create_team_invitation(uuid, text, public.team_role) from public;
grant execute on function public.create_team_invitation(uuid, text, public.team_role) to authenticated;
