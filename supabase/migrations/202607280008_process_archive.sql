-- Expedientes de proceso: archivo protegido, papelera recuperable, historial
-- inmutable, comentarios tipificados y versiones de entregables.

alter table public.tasks
  add column if not exists brief jsonb not null default '{}'::jsonb,
  add column if not exists closure_summary text,
  add column if not exists lessons_learned text,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid
    references public.profiles(id) on delete set null,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid
    references public.profiles(id) on delete set null;

alter table public.comments
  add column if not exists comment_type text not null default 'comment'
    check (
      comment_type in (
        'comment',
        'internal_note',
        'client_feedback',
        'decision',
        'approval',
        'change_request',
        'delivery',
        'incident'
      )
    ),
  add column if not exists visibility text not null default 'team'
    check (visibility in ('team', 'client')),
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid
    references public.profiles(id) on delete set null;

alter table public.task_attachments
  add column if not exists version_group_id uuid,
  add column if not exists version_number integer not null default 1
    check (version_number > 0),
  add column if not exists approval_status text not null default 'draft'
    check (
      approval_status in (
        'draft',
        'sent',
        'changes_requested',
        'approved',
        'final'
      )
    ),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid
    references public.profiles(id) on delete set null;

update public.task_attachments
set version_group_id = id
where version_group_id is null;

alter table public.task_attachments
  alter column version_group_id set not null;

create index if not exists tasks_archive_idx
  on public.tasks (team_id, archived_at, deleted_at);
create index if not exists comments_process_search_idx
  on public.comments (task_id, comment_type, created_at desc);
create index if not exists attachments_version_group_idx
  on public.task_attachments (version_group_id, version_number desc);

create table if not exists public.task_events (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists task_events_task_created_idx
  on public.task_events (task_id, created_at desc);
create index if not exists task_events_team_created_idx
  on public.task_events (team_id, created_at desc);

alter table public.task_events enable row level security;

drop policy if exists "members view task events" on public.task_events;
create policy "members view task events"
on public.task_events for select
to authenticated
using (public.is_team_member(team_id));

insert into public.task_events (
  team_id,
  task_id,
  actor_id,
  event_type,
  summary,
  metadata,
  created_at
)
select
  task.team_id,
  task.id,
  task.created_by,
  'task_created',
  'Tarea creada',
  jsonb_build_object('backfilled', true),
  task.created_at
from public.tasks as task
where not exists (
  select 1
  from public.task_events as event
  where event.task_id = task.id
    and event.event_type = 'task_created'
);

create or replace function public.append_task_event(
  candidate_task_id uuid,
  candidate_event_type text,
  candidate_summary text,
  candidate_metadata jsonb default '{}'::jsonb,
  candidate_actor_id uuid default auth.uid()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_team_id uuid;
  event_id uuid;
begin
  select team_id into target_team_id
  from public.tasks
  where id = candidate_task_id;

  if target_team_id is null then
    raise exception 'Task not found';
  end if;

  insert into public.task_events (
    team_id,
    task_id,
    actor_id,
    event_type,
    summary,
    metadata
  )
  values (
    target_team_id,
    candidate_task_id,
    candidate_actor_id,
    candidate_event_type,
    candidate_summary,
    coalesce(candidate_metadata, '{}'::jsonb)
  )
  returning id into event_id;

  return event_id;
end;
$$;

revoke all on function public.append_task_event(
  uuid,
  text,
  text,
  jsonb,
  uuid
) from public;

create or replace function public.record_task_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  labels text[] := '{}';
  changes jsonb := '{}'::jsonb;
  history_type text := 'task_updated';
  history_summary text;
begin
  if tg_op = 'INSERT' then
    perform public.append_task_event(
      new.id,
      'task_created',
      'Tarea creada',
      jsonb_build_object(
        'status', new.status::text,
        'priority', new.priority::text
      ),
      coalesce(auth.uid(), new.created_by)
    );
    return new;
  end if;

  if new.title is distinct from old.title then
    labels := array_append(labels, 'título');
    changes := changes || jsonb_build_object(
      'title',
      jsonb_build_object('from', old.title, 'to', new.title)
    );
  end if;
  if new.description is distinct from old.description then
    labels := array_append(labels, 'descripción');
    changes := changes || jsonb_build_object(
      'description',
      jsonb_build_object('changed', true)
    );
  end if;
  if new.brief is distinct from old.brief then
    labels := array_append(labels, 'brief');
    changes := changes || jsonb_build_object(
      'brief',
      jsonb_build_object('from', old.brief, 'to', new.brief)
    );
  end if;
  if new.status is distinct from old.status then
    labels := array_append(labels, 'estado');
    changes := changes || jsonb_build_object(
      'status',
      jsonb_build_object('from', old.status::text, 'to', new.status::text)
    );
    history_type := case
      when new.status = 'resuelto' then 'task_completed'
      when old.status = 'resuelto' then 'task_reopened'
      else 'status_changed'
    end;
  end if;
  if new.priority is distinct from old.priority then
    labels := array_append(labels, 'prioridad');
    changes := changes || jsonb_build_object(
      'priority',
      jsonb_build_object('from', old.priority::text, 'to', new.priority::text)
    );
  end if;
  if new.assignee_id is distinct from old.assignee_id then
    labels := array_append(labels, 'responsable');
    changes := changes || jsonb_build_object(
      'assignee_id',
      jsonb_build_object('from', old.assignee_id, 'to', new.assignee_id)
    );
  end if;
  if new.project_id is distinct from old.project_id then
    labels := array_append(labels, 'proyecto principal');
    changes := changes || jsonb_build_object(
      'project_id',
      jsonb_build_object('from', old.project_id, 'to', new.project_id)
    );
  end if;
  if new.client_id is distinct from old.client_id
    or new.client_category is distinct from old.client_category then
    labels := array_append(labels, 'clasificación de cliente');
    changes := changes || jsonb_build_object(
      'client',
      jsonb_build_object(
        'from_id', old.client_id,
        'to_id', new.client_id,
        'from_category', old.client_category,
        'to_category', new.client_category
      )
    );
  end if;
  if new.start_date is distinct from old.start_date
    or new.due_date is distinct from old.due_date
    or new.due_time is distinct from old.due_time then
    labels := array_append(labels, 'planificación');
    changes := changes || jsonb_build_object(
      'schedule',
      jsonb_build_object(
        'from_start', old.start_date,
        'to_start', new.start_date,
        'from_due', old.due_date,
        'to_due', new.due_date,
        'from_time', old.due_time,
        'to_time', new.due_time
      )
    );
  end if;
  if new.tags is distinct from old.tags then
    labels := array_append(labels, 'etiquetas');
    changes := changes || jsonb_build_object(
      'tags',
      jsonb_build_object('from', old.tags, 'to', new.tags)
    );
  end if;
  if new.closure_summary is distinct from old.closure_summary
    or new.lessons_learned is distinct from old.lessons_learned then
    labels := array_append(labels, 'cierre');
    changes := changes || jsonb_build_object(
      'closure',
      jsonb_build_object(
        'summary', new.closure_summary,
        'lessons', new.lessons_learned
      )
    );
  end if;

  if old.deleted_at is null and new.deleted_at is not null then
    history_type := 'task_trashed';
    history_summary := 'Tarea enviada a la papelera';
  elsif old.deleted_at is not null and new.deleted_at is null then
    history_type := 'task_restored';
    history_summary := 'Tarea restaurada';
  elsif old.archived_at is null and new.archived_at is not null then
    history_type := 'task_archived';
    history_summary := 'Expediente archivado';
  elsif old.archived_at is not null and new.archived_at is null then
    history_type := 'task_restored';
    history_summary := 'Expediente reabierto';
  elsif cardinality(labels) > 0 then
    history_summary := case history_type
      when 'task_completed' then 'Tarea marcada como aprobada'
      when 'task_reopened' then 'Tarea reabierta'
      else 'Actualizó ' || array_to_string(labels, ', ')
    end;
  else
    return new;
  end if;

  perform public.append_task_event(
    new.id,
    history_type,
    history_summary,
    changes,
    coalesce(auth.uid(), new.created_by)
  );

  return new;
end;
$$;

drop trigger if exists tasks_record_history on public.tasks;
create trigger tasks_record_history
after insert or update on public.tasks
for each row execute function public.record_task_history();

create or replace function public.protect_archived_task()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.archived_at is not null and (
    new.title is distinct from old.title
    or new.description is distinct from old.description
    or new.brief is distinct from old.brief
    or new.status is distinct from old.status
    or new.priority is distinct from old.priority
    or new.assignee_id is distinct from old.assignee_id
    or new.project_id is distinct from old.project_id
    or new.client_id is distinct from old.client_id
    or new.client_category is distinct from old.client_category
    or new.start_date is distinct from old.start_date
    or new.due_date is distinct from old.due_date
    or new.due_time is distinct from old.due_time
    or new.tags is distinct from old.tags
    or new.recurrence_rule is distinct from old.recurrence_rule
    or new.recurrence_interval is distinct from old.recurrence_interval
  ) then
    raise exception 'Archived task records are read-only';
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_protect_archived on public.tasks;
create trigger tasks_protect_archived
before update on public.tasks
for each row execute function public.protect_archived_task();

create or replace function public.assign_attachment_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_group uuid;
  previous_version integer;
begin
  if new.version_group_id is not null then
    return new;
  end if;

  select version_group_id, version_number
  into previous_group, previous_version
  from public.task_attachments
  where task_id = new.task_id
    and lower(name) = lower(new.name)
  order by version_number desc, created_at desc
  limit 1;

  if previous_group is null then
    new.version_group_id := new.id;
    new.version_number := 1;
  else
    new.version_group_id := previous_group;
    new.version_number := previous_version + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists task_attachments_assign_version
on public.task_attachments;
create trigger task_attachments_assign_version
before insert on public.task_attachments
for each row execute function public.assign_attachment_version();

drop trigger if exists task_attachments_set_updated_at
on public.task_attachments;
create trigger task_attachments_set_updated_at
before update on public.task_attachments
for each row execute function public.set_updated_at();

create or replace function public.record_comment_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.append_task_event(
      new.task_id,
      'comment_added',
      case new.comment_type
        when 'internal_note' then 'Agregó una nota interna'
        when 'client_feedback' then 'Registró feedback del cliente'
        when 'decision' then 'Registró una decisión'
        when 'approval' then 'Registró una aprobación'
        when 'change_request' then 'Registró una solicitud de cambios'
        when 'delivery' then 'Registró una entrega'
        when 'incident' then 'Registró una incidencia'
        else 'Agregó un comentario'
      end,
      jsonb_build_object(
        'comment_id', new.id,
        'comment_type', new.comment_type,
        'visibility', new.visibility,
        'excerpt', left(new.body, 240)
      ),
      new.author_id
    );
  elsif old.deleted_at is null and new.deleted_at is not null then
    perform public.append_task_event(
      new.task_id,
      'comment_removed',
      'Retiró un comentario del expediente visible',
      jsonb_build_object(
        'comment_id', new.id,
        'comment_type', new.comment_type
      ),
      coalesce(new.deleted_by, auth.uid())
    );
  end if;
  return new;
end;
$$;

drop trigger if exists comments_record_history on public.comments;
create trigger comments_record_history
after insert or update on public.comments
for each row execute function public.record_comment_history();

create or replace function public.record_attachment_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.append_task_event(
      new.task_id,
      'attachment_uploaded',
      'Subió ' || new.name || ' · v' || new.version_number,
      jsonb_build_object(
        'attachment_id', new.id,
        'name', new.name,
        'version', new.version_number,
        'status', new.approval_status
      ),
      new.uploaded_by
    );
  elsif old.approval_status is distinct from new.approval_status then
    perform public.append_task_event(
      new.task_id,
      'attachment_status_changed',
      'Cambió el estado de ' || new.name || ' · v' || new.version_number,
      jsonb_build_object(
        'attachment_id', new.id,
        'from', old.approval_status,
        'to', new.approval_status
      ),
      auth.uid()
    );
  elsif old.deleted_at is null and new.deleted_at is not null then
    perform public.append_task_event(
      new.task_id,
      'attachment_removed',
      'Envió un archivo a la papelera',
      jsonb_build_object(
        'attachment_id', new.id,
        'name', new.name,
        'version', new.version_number
      ),
      coalesce(new.deleted_by, auth.uid())
    );
  elsif old.deleted_at is not null and new.deleted_at is null then
    perform public.append_task_event(
      new.task_id,
      'attachment_restored',
      'Restauró un archivo',
      jsonb_build_object(
        'attachment_id', new.id,
        'name', new.name,
        'version', new.version_number
      ),
      auth.uid()
    );
  end if;
  return new;
end;
$$;

drop trigger if exists task_attachments_record_history
on public.task_attachments;
create trigger task_attachments_record_history
after insert or update on public.task_attachments
for each row execute function public.record_attachment_history();

create or replace function public.record_time_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.append_task_event(
      new.task_id,
      case when new.ended_at is null then 'timer_started' else 'time_added' end,
      case
        when new.ended_at is null then 'Inició el cronómetro'
        else 'Registró tiempo manual'
      end,
      jsonb_build_object(
        'time_entry_id', new.id,
        'description', new.description,
        'billable', new.billable,
        'duration_seconds', new.duration_seconds
      ),
      new.user_id
    );
  elsif old.ended_at is null and new.ended_at is not null then
    perform public.append_task_event(
      new.task_id,
      'timer_stopped',
      'Detuvo el cronómetro',
      jsonb_build_object(
        'time_entry_id', new.id,
        'duration_seconds', new.duration_seconds,
        'billable', new.billable
      ),
      new.user_id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists time_entries_record_history on public.time_entries;
create trigger time_entries_record_history
after insert or update on public.time_entries
for each row execute function public.record_time_history();

create or replace function public.protect_archived_task_content()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_task_id uuid;
  target_archived_at timestamptz;
  target_deleted_at timestamptz;
begin
  if tg_op = 'DELETE' then
    target_task_id := old.task_id;
  else
    target_task_id := new.task_id;
  end if;

  select archived_at, deleted_at
  into target_archived_at, target_deleted_at
  from public.tasks
  where id = target_task_id;

  if target_archived_at is not null or target_deleted_at is not null then
    if tg_table_name = 'time_entries'
      and tg_op = 'UPDATE'
      and old.ended_at is null
      and new.ended_at is not null then
      return new;
    end if;
    raise exception 'Archived task records are read-only';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists comments_protect_archived on public.comments;
create trigger comments_protect_archived
before insert or update or delete on public.comments
for each row execute function public.protect_archived_task_content();

drop trigger if exists task_attachments_protect_archived
on public.task_attachments;
create trigger task_attachments_protect_archived
before insert or update or delete on public.task_attachments
for each row execute function public.protect_archived_task_content();

drop trigger if exists time_entries_protect_archived on public.time_entries;
create trigger time_entries_protect_archived
before insert or update or delete on public.time_entries
for each row execute function public.protect_archived_task_content();

drop policy if exists "members update attachments"
on public.task_attachments;
create policy "members update attachments"
on public.task_attachments for update
to authenticated
using (
  uploaded_by = auth.uid()
  or exists (
    select 1
    from public.tasks
    where tasks.id = task_attachments.task_id
      and public.is_team_admin(tasks.team_id)
  )
)
with check (
  uploaded_by = auth.uid()
  or exists (
    select 1
    from public.tasks
    where tasks.id = task_attachments.task_id
      and public.is_team_admin(tasks.team_id)
  )
);

create or replace function public.archive_task_record(
  candidate_task_id uuid,
  candidate_closure_summary text default '',
  candidate_lessons_learned text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_task public.tasks%rowtype;
  member_role public.team_role;
  archived_time timestamptz := now();
begin
  select * into target_task
  from public.tasks
  where id = candidate_task_id;

  select role into member_role
  from public.team_members
  where team_id = target_task.team_id
    and user_id = auth.uid();

  if member_role is null or member_role = 'viewer' then
    raise exception 'Task archive permission required';
  end if;

  update public.time_entries
  set ended_at = archived_time,
      duration_seconds = greatest(
        duration_seconds,
        floor(extract(epoch from (archived_time - started_at)))::integer
      )
  where task_id in (
    with recursive descendants as (
      select id from public.tasks where id = candidate_task_id
      union all
      select child.id
      from public.tasks as child
      join descendants on child.parent_task_id = descendants.id
    )
    select id from descendants
  )
    and ended_at is null;

  update public.tasks
  set
    status = 'resuelto',
    resolved_at = coalesce(resolved_at, archived_time),
    archived_at = archived_time,
    archived_by = auth.uid(),
    deleted_at = null,
    deleted_by = null,
    closure_summary = case
      when id = candidate_task_id
        then nullif(trim(coalesce(candidate_closure_summary, '')), '')
      else closure_summary
    end,
    lessons_learned = case
      when id = candidate_task_id
        then nullif(trim(coalesce(candidate_lessons_learned, '')), '')
      else lessons_learned
    end
  where id in (
    with recursive descendants as (
      select id from public.tasks where id = candidate_task_id
      union all
      select child.id
      from public.tasks as child
      join descendants on child.parent_task_id = descendants.id
    )
    select id from descendants
  );
end;
$$;

create or replace function public.trash_task_record(candidate_task_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_task public.tasks%rowtype;
  member_role public.team_role;
  trashed_time timestamptz := now();
begin
  select * into target_task
  from public.tasks
  where id = candidate_task_id;

  select role into member_role
  from public.team_members
  where team_id = target_task.team_id
    and user_id = auth.uid();

  if member_role is null or member_role = 'viewer' then
    raise exception 'Task trash permission required';
  end if;

  update public.time_entries
  set ended_at = trashed_time,
      duration_seconds = greatest(
        duration_seconds,
        floor(extract(epoch from (trashed_time - started_at)))::integer
      )
  where task_id in (
    with recursive descendants as (
      select id from public.tasks where id = candidate_task_id
      union all
      select child.id
      from public.tasks as child
      join descendants on child.parent_task_id = descendants.id
    )
    select id from descendants
  )
    and ended_at is null;

  update public.tasks
  set
    archived_at = coalesce(archived_at, trashed_time),
    archived_by = coalesce(archived_by, auth.uid()),
    deleted_at = trashed_time,
    deleted_by = auth.uid()
  where id in (
    with recursive descendants as (
      select id from public.tasks where id = candidate_task_id
      union all
      select child.id
      from public.tasks as child
      join descendants on child.parent_task_id = descendants.id
    )
    select id from descendants
  );
end;
$$;

create or replace function public.restore_task_record(candidate_task_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_task public.tasks%rowtype;
  member_role public.team_role;
begin
  select * into target_task
  from public.tasks
  where id = candidate_task_id;

  select role into member_role
  from public.team_members
  where team_id = target_task.team_id
    and user_id = auth.uid();

  if member_role is null or member_role = 'viewer' then
    raise exception 'Task restore permission required';
  end if;

  update public.tasks
  set
    archived_at = null,
    archived_by = null,
    deleted_at = null,
    deleted_by = null
  where id in (
    with recursive descendants as (
      select id from public.tasks where id = candidate_task_id
      union all
      select child.id
      from public.tasks as child
      join descendants on child.parent_task_id = descendants.id
    )
    select id from descendants
  );
end;
$$;

revoke all on function public.archive_task_record(uuid, text, text)
  from public;
revoke all on function public.trash_task_record(uuid) from public;
revoke all on function public.restore_task_record(uuid) from public;

grant execute on function public.archive_task_record(uuid, text, text)
  to authenticated;
grant execute on function public.trash_task_record(uuid) to authenticated;
grant execute on function public.restore_task_record(uuid) to authenticated;

drop policy if exists "admins delete tasks" on public.tasks;
create policy "admins purge trashed tasks"
on public.tasks for delete
to authenticated
using (
  public.is_team_admin(team_id)
  and deleted_at < now() - interval '30 days'
);
