-- En producción, una cuenta nueva debe incorporarse a sus invitaciones antes
-- de crear contenido. Nunca se generan espacios o tareas ficticias.
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
  existing_team_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  insert into public.profiles (id, full_name, email)
  values (auth.uid(), current_name, nullif(current_email, ''))
  on conflict (id) do update set
    email = coalesce(excluded.email, public.profiles.email),
    full_name = case
      when public.profiles.full_name is null or public.profiles.full_name = 'Dirección de cuentas'
      then excluded.full_name else public.profiles.full_name end;

  -- Invitaciones al espacio: la identidad ya fue verificada por Google/Supabase.
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

  -- Invitaciones limitadas a proyectos/campañas.
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

-- Repara invitaciones pendientes de las dos cuentas afectadas que ya iniciaron
-- sesión. Sólo usa correos visibles en sus perfiles autenticados.
insert into public.team_members (team_id, user_id, role, project_limited)
select invitation.team_id, profile.id, invitation.role, false
from public.team_invitations as invitation
join public.profiles as profile on lower(profile.email) = invitation.email
where lower(profile.email) in ('matilde@ciudadana.city', 'pedro@ciudadana.city')
  and invitation.accepted_at is null and invitation.expires_at > now()
on conflict (team_id, user_id) do update set role = excluded.role, project_limited = false;

update public.team_invitations as invitation
set accepted_at = now()
from public.profiles as profile
where lower(profile.email) = invitation.email
  and lower(profile.email) in ('matilde@ciudadana.city', 'pedro@ciudadana.city')
  and invitation.accepted_at is null and invitation.expires_at > now();

insert into public.team_members (team_id, user_id, role, project_limited)
select invitation.team_id, profile.id,
  case when invitation.role = 'viewer' then 'viewer'::public.team_role else 'agent'::public.team_role end,
  true
from public.project_invitations as invitation
join public.profiles as profile on lower(profile.email) = invitation.email
where lower(profile.email) in ('matilde@ciudadana.city', 'pedro@ciudadana.city')
  and invitation.accepted_at is null and invitation.expires_at > now()
on conflict (team_id, user_id) do nothing;

insert into public.project_members (project_id, user_id, role, notify_on_new_tasks)
select invitation.project_id, profile.id, invitation.role, invitation.notify_on_new_tasks
from public.project_invitations as invitation
join public.profiles as profile on lower(profile.email) = invitation.email
where lower(profile.email) in ('matilde@ciudadana.city', 'pedro@ciudadana.city')
  and invitation.accepted_at is null and invitation.expires_at > now()
on conflict (project_id, user_id) do update set
  role = excluded.role, notify_on_new_tasks = excluded.notify_on_new_tasks;

update public.project_invitations as invitation
set accepted_at = now()
from public.profiles as profile
where lower(profile.email) = invitation.email
  and lower(profile.email) in ('matilde@ciudadana.city', 'pedro@ciudadana.city')
  and invitation.accepted_at is null and invitation.expires_at > now();

-- Retira sólo los espacios demo generados para esas cuentas y únicamente si la
-- persona ya pertenece a otro espacio. El borrado en cascada quita sus 3 tareas
-- y 3 proyectos ficticios, nunca contenido de Ciudadana.
delete from public.teams as demo
using public.team_members as owner_member, public.profiles as owner_profile
where owner_member.team_id = demo.id
  and owner_member.role = 'owner'
  and owner_profile.id = owner_member.user_id
  and lower(owner_profile.email) in ('matilde@ciudadana.city', 'pedro@ciudadana.city')
  and demo.name = 'Prisma Agencia'
  and demo.slug like 'prisma-agency-%'
  and (select count(*) from public.team_members as member where member.team_id = demo.id) = 1
  and (select count(*) from public.projects as project where project.team_id = demo.id) = 3
  and not exists (
    select 1 from public.projects as project
    where project.team_id = demo.id
      and project.name not in ('Lanzamiento Aura', 'Verano Brava', 'Always-on Nexo')
  )
  and exists (
    select 1 from public.team_members as other_membership
    where other_membership.user_id = owner_profile.id
      and other_membership.team_id <> demo.id
  );
