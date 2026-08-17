-- Permisos financieros granulares, contratos por cliente y cierre auditado.

alter table public.team_members
  add column if not exists can_manage_costs boolean not null default false,
  add column if not exists can_manage_billing boolean not null default false,
  add column if not exists can_view_profitability boolean not null default false;

-- Conserva el acceso que ya tenían los administradores existentes. Los nuevos
-- permisos pueden ajustarse individualmente desde la interfaz.
update public.team_members
set can_manage_costs = true,
    can_manage_billing = true,
    can_view_profitability = true
where role in ('owner', 'admin');

create or replace function public.can_manage_costs(candidate_team_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.team_members
    where team_id = candidate_team_id and user_id = auth.uid()
      and not project_limited
      and (role = 'owner' or can_manage_costs)
  );
$$;

create or replace function public.can_manage_billing(candidate_team_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.team_members
    where team_id = candidate_team_id and user_id = auth.uid()
      and not project_limited
      and (role = 'owner' or can_manage_billing)
  );
$$;

create or replace function public.can_view_profitability(candidate_team_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.team_members
    where team_id = candidate_team_id and user_id = auth.uid()
      and not project_limited
      and (
        role = 'owner' or can_view_profitability
        or can_manage_costs or can_manage_billing
      )
  );
$$;

revoke all on function public.can_manage_costs(uuid) from public;
revoke all on function public.can_manage_billing(uuid) from public;
revoke all on function public.can_view_profitability(uuid) from public;
grant execute on function public.can_manage_costs(uuid) to authenticated;
grant execute on function public.can_manage_billing(uuid) to authenticated;
grant execute on function public.can_view_profitability(uuid) to authenticated;

create or replace function public.update_member_financial_permissions(
  candidate_team_id uuid,
  candidate_user_id uuid,
  candidate_manage_costs boolean,
  candidate_manage_billing boolean,
  candidate_view_profitability boolean
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.team_members
    where team_id = candidate_team_id and user_id = auth.uid()
      and role = 'owner' and not project_limited
  ) then
    raise exception 'Only workspace owners can assign financial permissions';
  end if;

  update public.team_members
  set can_manage_costs = candidate_manage_costs,
      can_manage_billing = candidate_manage_billing,
      can_view_profitability = candidate_view_profitability
  where team_id = candidate_team_id and user_id = candidate_user_id;
end;
$$;

revoke all on function public.update_member_financial_permissions(uuid, uuid, boolean, boolean, boolean) from public;
grant execute on function public.update_member_financial_permissions(uuid, uuid, boolean, boolean, boolean) to authenticated;

create or replace function public.update_member_hourly_rate(
  candidate_team_id uuid,
  candidate_user_id uuid,
  candidate_hourly_rate numeric
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_manage_costs(candidate_team_id) then
    raise exception 'Cost management permission required';
  end if;
  if candidate_hourly_rate < 0 or candidate_hourly_rate > 1000000 then
    raise exception 'Hourly rate is out of range';
  end if;
  update public.team_members set hourly_rate = candidate_hourly_rate
  where team_id = candidate_team_id and user_id = candidate_user_id;
end;
$$;

alter table public.clients
  add column if not exists monthly_fee numeric(14,2) not null default 0 check (monthly_fee >= 0),
  add column if not exists budgeted_hours numeric(10,2) not null default 0 check (budgeted_hours >= 0),
  add column if not exists contract_start date,
  add column if not exists contract_end date,
  add column if not exists currency text check (currency is null or char_length(currency) = 3);

-- Evita que los importes contractuales puedan consultarse saltando la UI.
revoke select on public.clients from authenticated;
grant select (id, team_id, name, email, notes, categories, archived, created_at)
on public.clients to authenticated;

create or replace function public.get_client_financials()
returns table (
  client_id uuid, monthly_fee numeric, budgeted_hours numeric,
  contract_start date, contract_end date, currency text
) language sql stable security definer set search_path = '' as $$
  select id, clients.monthly_fee, clients.budgeted_hours,
    clients.contract_start, clients.contract_end, clients.currency
  from public.clients
  where public.can_view_profitability(team_id);
$$;
revoke all on function public.get_client_financials() from public;
grant execute on function public.get_client_financials() to authenticated;

alter table public.tasks
  add column if not exists submitted_for_review_at timestamptz,
  add column if not exists submitted_for_review_by uuid references public.profiles(id) on delete set null,
  add column if not exists completion_time_waived_reason text;

-- Tiempo de gestión puede imputarse directamente a proyecto o cliente.
alter table public.time_entries alter column task_id drop not null;
alter table public.time_entries
  add column if not exists project_id uuid references public.projects(id) on delete set null,
  add column if not exists client_id uuid references public.clients(id) on delete set null;

update public.time_entries as entry
set project_id = task.project_id,
    client_id = task.client_id
from public.tasks as task
where task.id = entry.task_id and entry.project_id is null;

alter table public.time_entries drop constraint if exists time_entries_scope_required;
alter table public.time_entries add constraint time_entries_scope_required
check (task_id is not null or project_id is not null or client_id is not null);

drop policy if exists "users view scoped time entries" on public.time_entries;
drop policy if exists "users view permitted time entries" on public.time_entries;
create policy "users view permitted time entries"
on public.time_entries for select to authenticated
using (user_id = auth.uid() or public.can_view_profitability(team_id));

drop policy if exists "users update scoped time entries" on public.time_entries;
drop policy if exists "users update permitted time entries" on public.time_entries;
create policy "users update permitted time entries"
on public.time_entries for update to authenticated
using (user_id = auth.uid() or public.can_manage_costs(team_id))
with check (user_id = auth.uid() or public.can_manage_costs(team_id));

drop policy if exists "users delete scoped time entries" on public.time_entries;
drop policy if exists "users delete permitted time entries" on public.time_entries;
create policy "users delete permitted time entries"
on public.time_entries for delete to authenticated
using (user_id = auth.uid() or public.can_manage_costs(team_id));

create or replace function public.create_scoped_time_entry(
  candidate_team_id uuid,
  candidate_project_id uuid,
  candidate_client_id uuid,
  candidate_description text,
  candidate_started_at timestamptz,
  candidate_duration_seconds integer,
  candidate_billable boolean default true
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  member_rate numeric(12,2);
  new_entry_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if candidate_duration_seconds <= 0 or candidate_duration_seconds > 86400 then
    raise exception 'Duration must be between 1 second and 24 hours';
  end if;
  if not public.is_full_team_member(candidate_team_id) then
    raise exception 'Workspace membership required';
  end if;
  if candidate_project_id is not null and not public.can_edit_project_tasks(candidate_project_id) then
    raise exception 'Project time tracking permission required';
  end if;
  if candidate_client_id is not null and not public.can_view_client(candidate_client_id) then
    raise exception 'Client access required';
  end if;
  if candidate_project_id is null and candidate_client_id is null then
    raise exception 'Project or client required';
  end if;
  select hourly_rate into member_rate from public.team_members
  where team_id = candidate_team_id and user_id = auth.uid();
  insert into public.time_entries (
    team_id, task_id, project_id, client_id, user_id, description,
    started_at, ended_at, duration_seconds, billable, hourly_rate
  ) values (
    candidate_team_id, null, candidate_project_id, candidate_client_id,
    auth.uid(), trim(coalesce(candidate_description, '')),
    candidate_started_at,
    candidate_started_at + make_interval(secs => candidate_duration_seconds),
    candidate_duration_seconds, candidate_billable, coalesce(member_rate, 0)
  ) returning id into new_entry_id;
  return new_entry_id;
end;
$$;

revoke all on function public.create_scoped_time_entry(uuid, uuid, uuid, text, timestamptz, integer, boolean) from public;
grant execute on function public.create_scoped_time_entry(uuid, uuid, uuid, text, timestamptz, integer, boolean) to authenticated;

drop policy if exists "workspace admins view task billing" on public.task_billing_records;
create policy "authorized users view task billing"
on public.task_billing_records for select to authenticated
using (public.can_view_profitability(team_id));

drop policy if exists "workspace admins manage task billing" on public.task_billing_records;
create policy "authorized users manage task billing"
on public.task_billing_records for all to authenticated
using (public.can_manage_billing(team_id))
with check (public.can_manage_billing(team_id));

-- Replace the authorization check without changing the established payload.
create or replace function public.can_update_task_billing(candidate_task_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.tasks
    where id = candidate_task_id and public.can_manage_billing(team_id)
  );
$$;
revoke all on function public.can_update_task_billing(uuid) from public;
grant execute on function public.can_update_task_billing(uuid) to authenticated;

create or replace function public.submit_task_for_review(
  candidate_task_id uuid,
  candidate_duration_seconds integer default 0,
  candidate_description text default '',
  candidate_billable boolean default true,
  candidate_waived_reason text default ''
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  target_task public.tasks%rowtype;
  member_rate numeric(12,2);
  submitted_at timestamptz := now();
  tracked_seconds bigint;
begin
  select * into target_task from public.tasks where id = candidate_task_id;
  if target_task.id is null then raise exception 'Task not found'; end if;
  if target_task.assignee_id is distinct from auth.uid() then
    raise exception 'Only the assignee can submit this task for review';
  end if;
  if target_task.status = 'resuelto' then raise exception 'Task already completed'; end if;

  update public.time_entries
  set ended_at = submitted_at,
      duration_seconds = greatest(duration_seconds, floor(extract(epoch from (submitted_at - started_at)))::integer)
  where task_id = candidate_task_id and user_id = auth.uid() and ended_at is null;

  if candidate_duration_seconds > 0 then
    if candidate_duration_seconds > 86400 then raise exception 'Duration exceeds 24 hours'; end if;
    select hourly_rate into member_rate from public.team_members
    where team_id = target_task.team_id and user_id = auth.uid();
    insert into public.time_entries (
      team_id, task_id, project_id, client_id, user_id, description,
      started_at, ended_at, duration_seconds, billable, hourly_rate
    ) values (
      target_task.team_id, target_task.id, target_task.project_id,
      target_task.client_id, auth.uid(), trim(coalesce(candidate_description, '')),
      submitted_at - make_interval(secs => candidate_duration_seconds), submitted_at,
      candidate_duration_seconds, candidate_billable, coalesce(member_rate, 0)
    );
  end if;

  select coalesce(sum(duration_seconds), 0) into tracked_seconds
  from public.time_entries where task_id = candidate_task_id and user_id = auth.uid();
  if tracked_seconds <= 0 and nullif(trim(coalesce(candidate_waived_reason, '')), '') is null then
    raise exception 'Time entry or a no-time reason is required';
  end if;

  update public.tasks
  set status = 'en_revision', resolved_at = null,
      submitted_for_review_at = submitted_at,
      submitted_for_review_by = auth.uid(),
      completion_time_waived_reason = nullif(trim(coalesce(candidate_waived_reason, '')), '')
  where id = candidate_task_id;

  perform public.append_task_event(candidate_task_id, 'submitted_for_review',
    'Entregó el trabajo para revisión',
    jsonb_build_object('tracked_seconds', tracked_seconds, 'waived_reason', nullif(trim(coalesce(candidate_waived_reason, '')), '')),
    auth.uid());

  insert into public.notifications (user_id, task_id, title, body)
  select distinct recipient.user_id, candidate_task_id, 'Trabajo listo para aprobar',
    '“' || target_task.title || '” fue entregada por su responsable.'
  from (
    select target_task.created_by as user_id
    union
    select project_member.user_id from public.project_members as project_member
    where project_member.project_id = target_task.project_id and project_member.role = 'admin'
    union
    select member.user_id from public.team_members as member
    where member.team_id = target_task.team_id and member.role in ('owner', 'admin') and not member.project_limited
  ) as recipient
  where recipient.user_id is not null and recipient.user_id <> auth.uid();
end;
$$;

create or replace function public.approve_task_completion(candidate_task_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare target_task public.tasks%rowtype;
begin
  select * into target_task from public.tasks where id = candidate_task_id;
  if target_task.id is null then raise exception 'Task not found'; end if;
  if target_task.status <> 'en_revision' then raise exception 'Task is not awaiting review'; end if;
  if not public.can_admin_task(candidate_task_id)
    and target_task.created_by is distinct from auth.uid() then
    raise exception 'Project approval permission required';
  end if;
  update public.tasks set status = 'resuelto', resolved_at = now()
  where id = candidate_task_id;
  perform public.append_task_event(candidate_task_id, 'completion_approved',
    'Aprobó el trabajo y cerró la tarea', '{}'::jsonb, auth.uid());
end;
$$;

revoke all on function public.submit_task_for_review(uuid, integer, text, boolean, text) from public;
revoke all on function public.approve_task_completion(uuid) from public;
grant execute on function public.submit_task_for_review(uuid, integer, text, boolean, text) to authenticated;
grant execute on function public.approve_task_completion(uuid) to authenticated;

create or replace function public.enforce_task_completion_workflow()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.archived_at is null and new.status = 'resuelto' and old.status is distinct from new.status then
    if old.status <> 'en_revision' or not public.can_admin_task(old.id) then
      raise exception 'Submit the task for review and obtain project approval before completing it';
    end if;
  end if;
  if new.status = 'en_revision' and old.status is distinct from new.status then
    if old.assignee_id is distinct from auth.uid()
      or new.submitted_for_review_by is distinct from auth.uid()
      or new.submitted_for_review_at is null then
      raise exception 'Only the assignee can submit this task for review';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists tasks_enforce_completion_workflow on public.tasks;
create trigger tasks_enforce_completion_workflow
before update of status on public.tasks
for each row execute function public.enforce_task_completion_workflow();

-- Versión granular del alta/edición de facturación. Conserva la ficha en la
-- tarea original y no confunde acceso financiero con administración general.
create or replace function public.upsert_task_billing_record_v2(
  candidate_task_id uuid,
  candidate_billing jsonb
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  target_task public.tasks%rowtype;
  next_condition text := coalesce(candidate_billing->>'commercialCondition', 'pending');
  next_status text := coalesce(candidate_billing->>'status', 'not_required');
  next_amount numeric := coalesce((candidate_billing->>'amount')::numeric, 0);
  next_external_cost numeric := coalesce((candidate_billing->>'externalCost')::numeric, 0);
  next_assignee uuid := nullif(candidate_billing->>'assigneeId', '')::uuid;
begin
  select * into target_task from public.tasks where id = candidate_task_id;
  if target_task.id is null then raise exception 'Task not found'; end if;
  if not public.can_manage_billing(target_task.team_id) then
    raise exception 'Billing management permission required';
  end if;
  if next_condition not in ('pending', 'fee', 'extra', 'non_billable') then
    raise exception 'Invalid commercial condition';
  end if;
  if next_status not in ('not_required', 'pending_info', 'ready', 'invoiced', 'collected', 'observed', 'cancelled') then
    raise exception 'Invalid billing status';
  end if;
  if next_amount < 0 or next_external_cost < 0 then raise exception 'Amounts cannot be negative'; end if;

  insert into public.task_billing_records (
    task_id, team_id, commercial_condition, billing_status, amount,
    external_cost, currency, billing_assignee_id, invoice_number,
    purchase_order, notes, invoiced_at, collected_at, updated_at, updated_by
  ) values (
    candidate_task_id, target_task.team_id, next_condition, next_status,
    next_amount, next_external_cost, nullif(candidate_billing->>'currency', ''),
    next_assignee, nullif(candidate_billing->>'invoiceNumber', ''),
    nullif(candidate_billing->>'purchaseOrder', ''), nullif(candidate_billing->>'notes', ''),
    nullif(candidate_billing->>'invoicedAt', '')::date,
    nullif(candidate_billing->>'collectedAt', '')::date, now(), auth.uid()
  ) on conflict (task_id) do update set
    commercial_condition = excluded.commercial_condition,
    billing_status = excluded.billing_status, amount = excluded.amount,
    external_cost = excluded.external_cost, currency = excluded.currency,
    billing_assignee_id = excluded.billing_assignee_id,
    invoice_number = excluded.invoice_number, purchase_order = excluded.purchase_order,
    notes = excluded.notes, invoiced_at = excluded.invoiced_at,
    collected_at = excluded.collected_at, updated_at = now(), updated_by = auth.uid();

  perform public.append_task_event(candidate_task_id, 'billing_updated',
    'Actualizó la ficha de facturación',
    jsonb_build_object('commercial_condition', next_condition, 'billing_status', next_status), auth.uid());

  if next_assignee is not null and next_assignee <> auth.uid() then
    insert into public.notifications (user_id, task_id, title, body)
    values (next_assignee, candidate_task_id, 'Proceso asignado para facturación',
      'La tarea “' || target_task.title || '” requiere gestión administrativa.');
  end if;
end;
$$;
revoke all on function public.upsert_task_billing_record_v2(uuid, jsonb) from public;
grant execute on function public.upsert_task_billing_record_v2(uuid, jsonb) to authenticated;

create or replace function public.notify_task_completion_billing_review()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'resuelto' and old.status is distinct from new.status then
    insert into public.notifications (user_id, task_id, title, body)
    select member.user_id, new.id, 'Definir facturación del proceso',
      '“' || new.title || '” fue aprobada. Clasificá si está incluida en fee o debe facturarse por fuera.'
    from public.team_members as member
    where member.team_id = new.team_id and not member.project_limited
      and (member.role = 'owner' or member.can_manage_billing)
      and member.user_id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);
  end if;
  return new;
end;
$$;
