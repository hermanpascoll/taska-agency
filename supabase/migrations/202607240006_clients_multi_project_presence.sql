-- Presencia de usuarios, catálogo de clientes y tareas en varios proyectos.

alter table public.profiles
  add column if not exists last_seen_at timestamptz;

create or replace function public.touch_presence()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  touched_at timestamptz := now();
begin
  update public.profiles
  set last_seen_at = touched_at
  where id = auth.uid();
  return touched_at;
end;
$$;

revoke all on function public.touch_presence() from public;
grant execute on function public.touch_presence() to authenticated;

create or replace function public.clear_presence()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set last_seen_at = null
  where id = auth.uid();
end;
$$;

revoke all on function public.clear_presence() from public;
grant execute on function public.clear_presence() to authenticated;

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 160),
  email text,
  notes text not null default '',
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, name)
);

alter table public.projects
  add column if not exists client_id uuid
  references public.clients(id) on delete set null;

insert into public.clients (team_id, name, email)
select
  task.team_id,
  trim(task.client_name),
  max(nullif(trim(task.client_email), ''))
from public.tasks as task
where nullif(trim(task.client_name), '') is not null
group by task.team_id, trim(task.client_name)
on conflict (team_id, name) do nothing;

update public.projects as project
set client_id = matched.client_id
from (
  select distinct on (task.project_id)
    task.project_id,
    client.id as client_id
  from public.tasks as task
  join public.clients as client
    on client.team_id = task.team_id
   and client.name = trim(task.client_name)
  where nullif(trim(task.client_name), '') is not null
  order by task.project_id, task.created_at
) as matched
where project.id = matched.project_id
  and project.client_id is null;

create table if not exists public.task_projects (
  task_id uuid not null references public.tasks(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, project_id)
);

insert into public.task_projects (task_id, project_id, team_id)
select id, project_id, team_id
from public.tasks
on conflict (task_id, project_id) do nothing;

create index if not exists clients_team_id_idx
  on public.clients (team_id);
create index if not exists projects_client_id_idx
  on public.projects (client_id);
create index if not exists task_projects_project_id_idx
  on public.task_projects (project_id);
create index if not exists task_projects_team_id_idx
  on public.task_projects (team_id);
create index if not exists profiles_last_seen_at_idx
  on public.profiles (last_seen_at);

drop trigger if exists clients_set_updated_at on public.clients;
create trigger clients_set_updated_at
before update on public.clients
for each row execute function public.set_updated_at();

create or replace function public.validate_task_project()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  task_team uuid;
  project_team uuid;
begin
  select team_id into task_team
  from public.tasks
  where id = new.task_id;

  select team_id into project_team
  from public.projects
  where id = new.project_id;

  if task_team is null or project_team is null or task_team <> project_team then
    raise exception 'La tarea y el proyecto deben pertenecer al mismo espacio.';
  end if;

  new.team_id := task_team;
  return new;
end;
$$;

drop trigger if exists task_projects_validate on public.task_projects;
create trigger task_projects_validate
before insert or update on public.task_projects
for each row execute function public.validate_task_project();

create or replace function public.sync_primary_task_project()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.task_projects (task_id, project_id, team_id)
  values (new.id, new.project_id, new.team_id)
  on conflict (task_id, project_id) do nothing;
  return new;
end;
$$;

drop trigger if exists tasks_sync_primary_project on public.tasks;
create trigger tasks_sync_primary_project
after insert or update of project_id on public.tasks
for each row execute function public.sync_primary_task_project();

create or replace function public.preserve_multi_project_tasks()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.tasks as task
  set project_id = (
    select relation.project_id
    from public.task_projects as relation
    where relation.task_id = task.id
      and relation.project_id <> old.id
    order by relation.created_at
    limit 1
  )
  where task.project_id = old.id
    and exists (
      select 1
      from public.task_projects as relation
      where relation.task_id = task.id
        and relation.project_id <> old.id
    );
  return old;
end;
$$;

drop trigger if exists projects_preserve_multi_project_tasks on public.projects;
create trigger projects_preserve_multi_project_tasks
before delete on public.projects
for each row execute function public.preserve_multi_project_tasks();

alter table public.clients enable row level security;
alter table public.task_projects enable row level security;

drop policy if exists "members view clients" on public.clients;
create policy "members view clients"
on public.clients for select
to authenticated
using (public.is_team_member(team_id));

drop policy if exists "admins manage clients" on public.clients;
create policy "admins manage clients"
on public.clients for all
to authenticated
using (public.is_team_admin(team_id))
with check (public.is_team_admin(team_id));

drop policy if exists "members view task projects" on public.task_projects;
create policy "members view task projects"
on public.task_projects for select
to authenticated
using (public.is_team_member(team_id));

drop policy if exists "members manage task projects" on public.task_projects;
create policy "members manage task projects"
on public.task_projects for all
to authenticated
using (public.is_team_member(team_id))
with check (public.is_team_member(team_id));
