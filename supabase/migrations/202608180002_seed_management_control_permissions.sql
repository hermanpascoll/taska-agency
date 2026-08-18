-- Permisos predeterminados de Control de gestión para espacios existentes y nuevos.

insert into public.team_role_permissions (
  team_id, role, can_administer, can_manage_billing, can_track_time, can_audit_time
)
select id, 'controller'::public.team_role, false, true, true, true
from public.teams
on conflict (team_id, role) do update
set can_administer = excluded.can_administer,
    can_manage_billing = excluded.can_manage_billing,
    can_track_time = excluded.can_track_time,
    can_audit_time = excluded.can_audit_time,
    updated_at = now();

create or replace function public.seed_team_role_permissions()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.team_role_permissions (
    team_id, role, can_administer, can_manage_billing, can_track_time, can_audit_time
  ) values
    (new.id, 'owner', true, true, true, true),
    (new.id, 'admin', true, true, true, true),
    (new.id, 'controller', false, true, true, true),
    (new.id, 'agent', false, false, true, false),
    (new.id, 'viewer', false, false, false, false)
  on conflict (team_id, role) do nothing;
  return new;
end;
$$;
