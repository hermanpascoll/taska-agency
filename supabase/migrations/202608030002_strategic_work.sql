-- Portafolios y objetivos persistentes para el nuevo shell de Taska.

create table if not exists public.portfolios (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 120),
  description text not null default '',
  color text not null default '#a970ff',
  owner_id uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.portfolio_projects (
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (portfolio_id, project_id)
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 160),
  description text not null default '',
  status text not null default 'on_track'
    check (status in ('on_track', 'at_risk', 'off_track', 'complete')),
  progress smallint not null default 0 check (progress between 0 and 100),
  due_date date,
  owner_id uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.goal_projects (
  goal_id uuid not null references public.goals(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (goal_id, project_id)
);

create index if not exists portfolios_team_id_idx on public.portfolios(team_id);
create index if not exists portfolio_projects_project_id_idx on public.portfolio_projects(project_id);
create index if not exists goals_team_id_idx on public.goals(team_id);
create index if not exists goal_projects_project_id_idx on public.goal_projects(project_id);

drop trigger if exists portfolios_set_updated_at on public.portfolios;
create trigger portfolios_set_updated_at
before update on public.portfolios
for each row execute function public.set_updated_at();

drop trigger if exists goals_set_updated_at on public.goals;
create trigger goals_set_updated_at
before update on public.goals
for each row execute function public.set_updated_at();

alter table public.portfolios enable row level security;
alter table public.portfolio_projects enable row level security;
alter table public.goals enable row level security;
alter table public.goal_projects enable row level security;

drop policy if exists "members view portfolios" on public.portfolios;
create policy "members view portfolios"
on public.portfolios for select to authenticated
using (public.is_team_member(team_id));

drop policy if exists "members create portfolios" on public.portfolios;
create policy "members create portfolios"
on public.portfolios for insert to authenticated
with check (public.is_team_member(team_id) and created_by = auth.uid());

drop policy if exists "members update portfolios" on public.portfolios;
create policy "members update portfolios"
on public.portfolios for update to authenticated
using (public.is_team_member(team_id))
with check (public.is_team_member(team_id));

drop policy if exists "members delete portfolios" on public.portfolios;
create policy "members delete portfolios"
on public.portfolios for delete to authenticated
using (created_by = auth.uid() or public.is_team_admin(team_id));

drop policy if exists "members view portfolio projects" on public.portfolio_projects;
create policy "members view portfolio projects"
on public.portfolio_projects for select to authenticated
using (
  exists (
    select 1 from public.portfolios
    where portfolios.id = portfolio_projects.portfolio_id
      and public.is_team_member(portfolios.team_id)
  )
);

drop policy if exists "members manage portfolio projects" on public.portfolio_projects;
create policy "members manage portfolio projects"
on public.portfolio_projects for all to authenticated
using (
  exists (
    select 1 from public.portfolios
    where portfolios.id = portfolio_projects.portfolio_id
      and public.is_team_member(portfolios.team_id)
  )
)
with check (
  exists (
    select 1 from public.portfolios
    where portfolios.id = portfolio_projects.portfolio_id
      and public.is_team_member(portfolios.team_id)
  )
);

drop policy if exists "members view goals" on public.goals;
create policy "members view goals"
on public.goals for select to authenticated
using (public.is_team_member(team_id));

drop policy if exists "members create goals" on public.goals;
create policy "members create goals"
on public.goals for insert to authenticated
with check (public.is_team_member(team_id) and created_by = auth.uid());

drop policy if exists "members update goals" on public.goals;
create policy "members update goals"
on public.goals for update to authenticated
using (public.is_team_member(team_id))
with check (public.is_team_member(team_id));

drop policy if exists "members delete goals" on public.goals;
create policy "members delete goals"
on public.goals for delete to authenticated
using (created_by = auth.uid() or public.is_team_admin(team_id));

drop policy if exists "members view goal projects" on public.goal_projects;
create policy "members view goal projects"
on public.goal_projects for select to authenticated
using (
  exists (
    select 1 from public.goals
    where goals.id = goal_projects.goal_id
      and public.is_team_member(goals.team_id)
  )
);

drop policy if exists "members manage goal projects" on public.goal_projects;
create policy "members manage goal projects"
on public.goal_projects for all to authenticated
using (
  exists (
    select 1 from public.goals
    where goals.id = goal_projects.goal_id
      and public.is_team_member(goals.team_id)
  )
)
with check (
  exists (
    select 1 from public.goals
    where goals.id = goal_projects.goal_id
      and public.is_team_member(goals.team_id)
  )
);
