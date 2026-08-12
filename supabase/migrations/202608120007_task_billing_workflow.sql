-- Prefacturación y rentabilidad vinculadas al expediente original.
-- La información financiera vive fuera de tasks para que sólo administradores
-- puedan leer importes, costos y márgenes.

create table if not exists public.task_billing_records (
  task_id uuid primary key references public.tasks(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  commercial_condition text not null default 'pending'
    check (commercial_condition in ('pending', 'fee', 'extra', 'non_billable')),
  billing_status text not null default 'not_required'
    check (billing_status in (
      'not_required', 'pending_info', 'ready', 'invoiced', 'collected',
      'observed', 'cancelled'
    )),
  amount numeric(14,2) not null default 0 check (amount >= 0),
  external_cost numeric(14,2) not null default 0 check (external_cost >= 0),
  currency text,
  billing_assignee_id uuid references public.profiles(id) on delete set null,
  invoice_number text,
  purchase_order text,
  notes text,
  invoiced_at date,
  collected_at date,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

create index if not exists task_billing_records_team_status_idx
on public.task_billing_records(team_id, billing_status);

alter table public.task_billing_records enable row level security;
grant select, insert, update, delete on public.task_billing_records to authenticated;

drop policy if exists "workspace admins view task billing" on public.task_billing_records;
create policy "workspace admins view task billing"
on public.task_billing_records for select to authenticated
using (public.is_team_admin(team_id));

drop policy if exists "workspace admins manage task billing" on public.task_billing_records;
create policy "workspace admins manage task billing"
on public.task_billing_records for all to authenticated
using (public.is_team_admin(team_id))
with check (public.is_team_admin(team_id));

create or replace function public.upsert_task_billing_record(
  candidate_task_id uuid,
  candidate_billing jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_task public.tasks%rowtype;
  current_record public.task_billing_records%rowtype;
  next_condition text;
  next_status text;
  next_amount numeric;
  next_external_cost numeric;
  next_currency text;
  next_assignee uuid;
  next_invoice_number text;
  next_purchase_order text;
  next_notes text;
  next_invoiced_at date;
  next_collected_at date;
begin
  select * into target_task from public.tasks where id = candidate_task_id;
  if target_task.id is null then
    raise exception 'Task not found';
  end if;
  if not public.is_team_admin(target_task.team_id) then
    raise exception 'Only workspace administrators can update billing';
  end if;

  select * into current_record
  from public.task_billing_records
  where task_id = candidate_task_id;

  next_condition := case when candidate_billing ? 'commercialCondition'
    then candidate_billing->>'commercialCondition'
    else coalesce(current_record.commercial_condition, 'pending') end;
  next_status := case when candidate_billing ? 'status'
    then candidate_billing->>'status'
    else coalesce(current_record.billing_status, 'not_required') end;
  next_amount := case when candidate_billing ? 'amount'
    then coalesce((candidate_billing->>'amount')::numeric, 0)
    else coalesce(current_record.amount, 0) end;
  next_external_cost := case when candidate_billing ? 'externalCost'
    then coalesce((candidate_billing->>'externalCost')::numeric, 0)
    else coalesce(current_record.external_cost, 0) end;
  next_currency := case when candidate_billing ? 'currency'
    then nullif(candidate_billing->>'currency', '')
    else current_record.currency end;
  next_assignee := case when candidate_billing ? 'assigneeId'
    then nullif(candidate_billing->>'assigneeId', '')::uuid
    else current_record.billing_assignee_id end;
  next_invoice_number := case when candidate_billing ? 'invoiceNumber'
    then nullif(candidate_billing->>'invoiceNumber', '')
    else current_record.invoice_number end;
  next_purchase_order := case when candidate_billing ? 'purchaseOrder'
    then nullif(candidate_billing->>'purchaseOrder', '')
    else current_record.purchase_order end;
  next_notes := case when candidate_billing ? 'notes'
    then nullif(candidate_billing->>'notes', '')
    else current_record.notes end;
  next_invoiced_at := case when candidate_billing ? 'invoicedAt'
    then nullif(candidate_billing->>'invoicedAt', '')::date
    else current_record.invoiced_at end;
  next_collected_at := case when candidate_billing ? 'collectedAt'
    then nullif(candidate_billing->>'collectedAt', '')::date
    else current_record.collected_at end;

  if next_condition not in ('pending', 'fee', 'extra', 'non_billable') then
    raise exception 'Invalid commercial condition';
  end if;
  if next_status not in (
    'not_required', 'pending_info', 'ready', 'invoiced', 'collected',
    'observed', 'cancelled'
  ) then
    raise exception 'Invalid billing status';
  end if;
  if next_amount < 0 or next_external_cost < 0 then
    raise exception 'Amounts cannot be negative';
  end if;

  insert into public.task_billing_records (
    task_id, team_id, commercial_condition, billing_status, amount,
    external_cost, currency, billing_assignee_id, invoice_number,
    purchase_order, notes, invoiced_at, collected_at, updated_at, updated_by
  ) values (
    candidate_task_id, target_task.team_id, next_condition, next_status,
    next_amount, next_external_cost, next_currency, next_assignee,
    next_invoice_number, next_purchase_order, next_notes, next_invoiced_at,
    next_collected_at, now(), auth.uid()
  )
  on conflict (task_id) do update set
    commercial_condition = excluded.commercial_condition,
    billing_status = excluded.billing_status,
    amount = excluded.amount,
    external_cost = excluded.external_cost,
    currency = excluded.currency,
    billing_assignee_id = excluded.billing_assignee_id,
    invoice_number = excluded.invoice_number,
    purchase_order = excluded.purchase_order,
    notes = excluded.notes,
    invoiced_at = excluded.invoiced_at,
    collected_at = excluded.collected_at,
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by;

  perform public.append_task_event(
    candidate_task_id,
    'billing_updated',
    case
      when next_status = 'ready' then 'Marcó la tarea como lista para facturar'
      when next_status = 'invoiced' then 'Registró la facturación de la tarea'
      when next_status = 'collected' then 'Registró el cobro de la tarea'
      when next_condition = 'fee' then 'Clasificó la tarea como incluida en fee'
      when next_condition = 'extra' then 'Clasificó la tarea como facturable fuera del fee'
      when next_condition = 'non_billable' then 'Clasificó la tarea como no facturable'
      else 'Actualizó la ficha de facturación'
    end,
    jsonb_build_object(
      'commercial_condition', next_condition,
      'billing_status', next_status,
      'assignee_id', next_assignee
    ),
    auth.uid()
  );

  if next_assignee is not null
    and next_assignee <> auth.uid()
    and (
      current_record.billing_assignee_id is distinct from next_assignee
      or (current_record.billing_status is distinct from next_status and next_status = 'ready')
    ) then
    insert into public.notifications (user_id, task_id, title, body)
    values (
      next_assignee,
      candidate_task_id,
      'Proceso asignado para facturación',
      'La tarea “' || target_task.title || '” requiere gestión administrativa.'
    );
  end if;
end;
$$;

revoke all on function public.upsert_task_billing_record(uuid, jsonb) from public;
grant execute on function public.upsert_task_billing_record(uuid, jsonb) to authenticated;

create or replace function public.notify_task_completion_billing_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'resuelto' and old.status is distinct from new.status then
    insert into public.notifications (user_id, task_id, title, body)
    select
      member.user_id,
      new.id,
      'Definir facturación del proceso',
      '“' || new.title || '” fue finalizada. Clasificá si está incluida en fee o debe facturarse por fuera.'
    from public.team_members as member
    where member.team_id = new.team_id
      and member.role in ('owner', 'admin')
      and not member.project_limited
      and member.user_id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_notify_billing_review on public.tasks;
create trigger tasks_notify_billing_review
after update of status on public.tasks
for each row execute function public.notify_task_completion_billing_review();
