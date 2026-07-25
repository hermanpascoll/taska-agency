-- Clasificación por cliente, vencimientos con hora y recurrencia de tareas.

alter table public.clients
  add column if not exists categories text[] not null default '{}';

alter table public.projects
  add column if not exists client_category text;

alter table public.tasks
  add column if not exists client_id uuid
    references public.clients(id) on delete set null,
  add column if not exists client_category text,
  add column if not exists due_time time,
  add column if not exists recurrence_rule text not null default 'none'
    check (recurrence_rule in ('none', 'daily', 'weekly', 'biweekly', 'monthly')),
  add column if not exists recurrence_interval integer not null default 1
    check (recurrence_interval between 1 and 52),
  add column if not exists recurrence_origin_id uuid
    references public.tasks(id) on delete set null,
  add column if not exists recurrence_generated_at timestamptz;

update public.tasks as task
set
  client_id = project.client_id,
  client_category = project.client_category
from public.projects as project
where project.id = task.project_id
  and (
    task.client_id is null
    or task.client_category is null
  );

create index if not exists tasks_client_id_idx
  on public.tasks (client_id);
create index if not exists tasks_recurrence_origin_id_idx
  on public.tasks (recurrence_origin_id);

create or replace function public.set_task_resolution_timestamp()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = 'resuelto' and old.status <> 'resuelto' then
    new.resolved_at := now();
  elsif new.status <> 'resuelto' and old.status = 'resuelto' then
    new.resolved_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_set_resolution_timestamp on public.tasks;
create trigger tasks_set_resolution_timestamp
before update of status on public.tasks
for each row execute function public.set_task_resolution_timestamp();

create or replace function public.generate_next_recurring_task()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_due date;
  next_due date;
  shift_days integer;
  next_task_id uuid;
  next_subtask_id uuid;
  subtask public.tasks%rowtype;
begin
  if new.status <> 'resuelto'
    or old.status = 'resuelto'
    or new.parent_task_id is not null
    or new.recurrence_rule = 'none'
    or new.recurrence_generated_at is not null then
    return new;
  end if;

  base_due := coalesce(new.due_date, current_date);
  next_due := case new.recurrence_rule
    when 'daily' then base_due + new.recurrence_interval
    when 'weekly' then base_due + (7 * new.recurrence_interval)
    when 'biweekly' then base_due + (14 * new.recurrence_interval)
    when 'monthly' then
      (base_due + make_interval(months => new.recurrence_interval))::date
    else base_due
  end;
  shift_days := next_due - base_due;

  insert into public.tasks (
    team_id,
    project_id,
    parent_task_id,
    title,
    description,
    status,
    priority,
    assignee_id,
    created_by,
    client_name,
    client_email,
    client_id,
    client_category,
    start_date,
    due_date,
    due_time,
    tags,
    recurrence_rule,
    recurrence_interval,
    recurrence_origin_id
  )
  values (
    new.team_id,
    new.project_id,
    null,
    new.title,
    new.description,
    'nuevo',
    new.priority,
    new.assignee_id,
    new.created_by,
    new.client_name,
    new.client_email,
    new.client_id,
    new.client_category,
    case
      when new.start_date is null then null
      else new.start_date + shift_days
    end,
    next_due,
    new.due_time,
    new.tags,
    new.recurrence_rule,
    new.recurrence_interval,
    coalesce(new.recurrence_origin_id, new.id)
  )
  returning id into next_task_id;

  insert into public.task_projects (task_id, project_id, team_id)
  select next_task_id, relation.project_id, relation.team_id
  from public.task_projects as relation
  where relation.task_id = new.id
  on conflict (task_id, project_id) do nothing;

  for subtask in
    select *
    from public.tasks
    where parent_task_id = new.id
    order by created_at
  loop
    insert into public.tasks (
      team_id,
      project_id,
      parent_task_id,
      title,
      description,
      status,
      priority,
      assignee_id,
      created_by,
      client_name,
      client_email,
      client_id,
      client_category,
      start_date,
      due_date,
      due_time,
      tags,
      recurrence_rule,
      recurrence_interval
    )
    values (
      subtask.team_id,
      subtask.project_id,
      next_task_id,
      subtask.title,
      subtask.description,
      'nuevo',
      subtask.priority,
      subtask.assignee_id,
      subtask.created_by,
      subtask.client_name,
      subtask.client_email,
      subtask.client_id,
      subtask.client_category,
      case
        when subtask.start_date is null then null
        else subtask.start_date + shift_days
      end,
      case
        when subtask.due_date is null then null
        else subtask.due_date + shift_days
      end,
      subtask.due_time,
      subtask.tags,
      'none',
      1
    )
    returning id into next_subtask_id;

    insert into public.task_projects (task_id, project_id, team_id)
    select next_subtask_id, relation.project_id, relation.team_id
    from public.task_projects as relation
    where relation.task_id = subtask.id
    on conflict (task_id, project_id) do nothing;
  end loop;

  update public.tasks
  set recurrence_generated_at = now()
  where id = new.id;

  return new;
end;
$$;

drop trigger if exists tasks_generate_next_recurrence on public.tasks;
create trigger tasks_generate_next_recurrence
after update of status on public.tasks
for each row execute function public.generate_next_recurring_task();
