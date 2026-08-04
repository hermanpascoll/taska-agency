-- Aislamiento real para invitados de proyecto.
-- Los integrantes internos conservan acceso completo al espacio; quienes entran
-- por una invitación de proyecto sólo pueden leer y operar sobre los proyectos
-- compartidos, según su rol específico.

alter table public.team_members
add column if not exists project_limited boolean not null default false;

create or replace function public.is_team_admin(candidate_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.team_members
    where team_id = candidate_team_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
      and not project_limited
  );
$$;

create or replace function public.is_full_team_member(candidate_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.team_members
    where team_id = candidate_team_id
      and user_id = auth.uid()
      and not project_limited
  );
$$;

create or replace function public.has_project_access(candidate_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.projects as project
    join public.team_members as member
      on member.team_id = project.team_id
     and member.user_id = auth.uid()
    where project.id = candidate_project_id
      and not member.project_limited
      and member.role <> 'viewer'
  ) or exists (
    select 1
    from public.project_members
    where project_id = candidate_project_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.can_admin_project(candidate_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.projects as project
    join public.team_members as member
      on member.team_id = project.team_id
     and member.user_id = auth.uid()
    where project.id = candidate_project_id
      and not member.project_limited
      and member.role in ('owner', 'admin')
  ) or exists (
    select 1
    from public.project_members
    where project_id = candidate_project_id
      and user_id = auth.uid()
      and role = 'admin'
  );
$$;

create or replace function public.can_edit_project_tasks(candidate_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.projects as project
    join public.team_members as member
      on member.team_id = project.team_id
     and member.user_id = auth.uid()
    where project.id = candidate_project_id
      and not member.project_limited
      and member.role <> 'viewer'
  ) or exists (
    select 1
    from public.project_members
    where project_id = candidate_project_id
      and user_id = auth.uid()
      and role in ('admin', 'editor')
  );
$$;

create or replace function public.can_comment_project(candidate_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.projects as project
    join public.team_members as member
      on member.team_id = project.team_id
     and member.user_id = auth.uid()
    where project.id = candidate_project_id
      and not member.project_limited
      and member.role <> 'viewer'
  ) or exists (
    select 1
    from public.project_members
    where project_id = candidate_project_id
      and user_id = auth.uid()
      and role in ('admin', 'editor', 'commenter')
  );
$$;

create or replace function public.can_view_task(candidate_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tasks as task
    where task.id = candidate_task_id
      and (
        public.has_project_access(task.project_id)
        or exists (
          select 1
          from public.task_projects as relation
          where relation.task_id = task.id
            and public.has_project_access(relation.project_id)
        )
      )
  );
$$;

create or replace function public.can_edit_task(candidate_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tasks as task
    where task.id = candidate_task_id
      and (
        public.can_edit_project_tasks(task.project_id)
        or exists (
          select 1
          from public.task_projects as relation
          where relation.task_id = task.id
            and public.can_edit_project_tasks(relation.project_id)
        )
      )
  );
$$;

create or replace function public.can_comment_task(candidate_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tasks as task
    where task.id = candidate_task_id
      and (
        public.can_comment_project(task.project_id)
        or exists (
          select 1
          from public.task_projects as relation
          where relation.task_id = task.id
            and public.can_comment_project(relation.project_id)
        )
      )
  );
$$;

create or replace function public.can_admin_task(candidate_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tasks as task
    where task.id = candidate_task_id
      and (
        public.can_admin_project(task.project_id)
        or exists (
          select 1
          from public.task_projects as relation
          where relation.task_id = task.id
            and public.can_admin_project(relation.project_id)
        )
      )
  );
$$;

create or replace function public.can_view_profile(candidate_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select candidate_user_id = auth.uid()
  or exists (
    select 1
    from public.team_members as mine
    join public.team_members as theirs on theirs.team_id = mine.team_id
    where mine.user_id = auth.uid()
      and theirs.user_id = candidate_user_id
      and not mine.project_limited
  )
  or exists (
    select 1
    from public.project_members as mine
    join public.project_members as theirs on theirs.project_id = mine.project_id
    where mine.user_id = auth.uid()
      and theirs.user_id = candidate_user_id
  )
  or exists (
    select 1
    from public.tasks as task
    where (task.assignee_id = candidate_user_id or task.created_by = candidate_user_id)
      and public.can_view_task(task.id)
  )
  or exists (
    select 1
    from public.comments as comment
    where comment.author_id = candidate_user_id
      and public.can_view_task(comment.task_id)
  );
$$;

create or replace function public.can_view_team_membership(
  candidate_team_id uuid,
  candidate_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select candidate_user_id = auth.uid()
  or public.is_full_team_member(candidate_team_id)
  or exists (
    select 1
    from public.projects as project
    join public.project_members as mine
      on mine.project_id = project.id and mine.user_id = auth.uid()
    join public.project_members as theirs
      on theirs.project_id = project.id and theirs.user_id = candidate_user_id
    where project.team_id = candidate_team_id
  )
  or exists (
    select 1
    from public.tasks as task
    where task.team_id = candidate_team_id
      and (task.assignee_id = candidate_user_id or task.created_by = candidate_user_id)
      and public.can_view_task(task.id)
  );
$$;

create or replace function public.can_view_client(candidate_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.clients as client
    where client.id = candidate_client_id
      and (
        public.is_full_team_member(client.team_id)
        or exists (
          select 1
          from public.projects as project
          where project.client_id = client.id
            and public.has_project_access(project.id)
        )
      )
  );
$$;

create or replace function public.task_storage_task_id(candidate_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
declare
  segments text[];
begin
  segments := storage.foldername(candidate_name);
  if array_length(segments, 1) < 2 then
    return null;
  end if;
  return segments[2]::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

revoke all on function public.is_full_team_member(uuid) from public;
revoke all on function public.has_project_access(uuid) from public;
revoke all on function public.can_admin_project(uuid) from public;
revoke all on function public.can_edit_project_tasks(uuid) from public;
revoke all on function public.can_comment_project(uuid) from public;
revoke all on function public.can_view_task(uuid) from public;
revoke all on function public.can_edit_task(uuid) from public;
revoke all on function public.can_comment_task(uuid) from public;
revoke all on function public.can_admin_task(uuid) from public;
revoke all on function public.can_view_profile(uuid) from public;
revoke all on function public.can_view_team_membership(uuid, uuid) from public;
revoke all on function public.can_view_client(uuid) from public;
revoke all on function public.task_storage_task_id(text) from public;

grant execute on function public.is_full_team_member(uuid) to authenticated;
grant execute on function public.has_project_access(uuid) to authenticated;
grant execute on function public.can_admin_project(uuid) to authenticated;
grant execute on function public.can_edit_project_tasks(uuid) to authenticated;
grant execute on function public.can_comment_project(uuid) to authenticated;
grant execute on function public.can_view_task(uuid) to authenticated;
grant execute on function public.can_edit_task(uuid) to authenticated;
grant execute on function public.can_comment_task(uuid) to authenticated;
grant execute on function public.can_admin_task(uuid) to authenticated;
grant execute on function public.can_view_profile(uuid) to authenticated;
grant execute on function public.can_view_team_membership(uuid, uuid) to authenticated;
grant execute on function public.can_view_client(uuid) to authenticated;
grant execute on function public.task_storage_task_id(text) to authenticated;

-- Perfiles e integrantes: un invitado limitado sólo descubre personas que
-- participan en alguno de sus proyectos compartidos.
drop policy if exists "profiles visible to teammates" on public.profiles;
create policy "profiles visible by workspace scope"
on public.profiles for select to authenticated
using (public.can_view_profile(id));

drop policy if exists "members view memberships" on public.team_members;
create policy "members view memberships by scope"
on public.team_members for select to authenticated
using (public.can_view_team_membership(team_id, user_id));

-- Proyectos y relaciones de tareas.
drop policy if exists "members view projects" on public.projects;
create policy "members view accessible projects"
on public.projects for select to authenticated
using (public.has_project_access(id));

drop policy if exists "admins manage projects" on public.projects;
create policy "workspace admins create projects"
on public.projects for insert to authenticated
with check (public.is_team_admin(team_id));
create policy "project admins update projects"
on public.projects for update to authenticated
using (public.can_admin_project(id))
with check (public.can_admin_project(id));
create policy "project admins delete projects"
on public.projects for delete to authenticated
using (public.can_admin_project(id));

drop policy if exists "members view task projects" on public.task_projects;
create policy "members view accessible task projects"
on public.task_projects for select to authenticated
using (
  public.can_view_task(task_id)
  and public.has_project_access(project_id)
);

drop policy if exists "members manage task projects" on public.task_projects;
create policy "editors manage task projects"
on public.task_projects for all to authenticated
using (
  public.can_edit_task(task_id)
  and public.can_edit_project_tasks(project_id)
)
with check (
  public.can_edit_task(task_id)
  and public.can_edit_project_tasks(project_id)
);

-- Tareas: la visibilidad contempla tanto el proyecto principal como proyectos
-- adicionales; edición y borrado respetan el rol más permisivo de esos vínculos.
drop policy if exists "members view tasks" on public.tasks;
create policy "members view accessible tasks"
on public.tasks for select to authenticated
using (public.can_view_task(id));

drop policy if exists "members create tasks" on public.tasks;
create policy "project editors create tasks"
on public.tasks for insert to authenticated
with check (
  public.can_edit_project_tasks(project_id)
  and exists (
    select 1 from public.projects
    where projects.id = tasks.project_id
      and projects.team_id = tasks.team_id
  )
);

drop policy if exists "members update tasks" on public.tasks;
create policy "project editors update tasks"
on public.tasks for update to authenticated
using (public.can_edit_task(id))
with check (public.can_edit_task(id));

drop policy if exists "admins delete tasks" on public.tasks;
drop policy if exists "admins purge trashed tasks" on public.tasks;
create policy "project admins purge trashed tasks"
on public.tasks for delete to authenticated
using (
  public.can_admin_task(id)
  and deleted_at < now() - interval '30 days'
);

-- Comentarios, historial y archivos de tareas.
drop policy if exists "members view comments" on public.comments;
create policy "members view accessible comments"
on public.comments for select to authenticated
using (public.can_view_task(task_id));

drop policy if exists "members create comments" on public.comments;
create policy "project collaborators create comments"
on public.comments for insert to authenticated
with check (
  author_id = auth.uid()
  and public.can_comment_task(task_id)
);

drop policy if exists "authors update comments" on public.comments;
create policy "authors update accessible comments"
on public.comments for update to authenticated
using (author_id = auth.uid() and public.can_comment_task(task_id))
with check (author_id = auth.uid() and public.can_comment_task(task_id));

drop policy if exists "authors delete comments" on public.comments;
create policy "authors delete accessible comments"
on public.comments for delete to authenticated
using (author_id = auth.uid() and public.can_comment_task(task_id));

drop policy if exists "members view task events" on public.task_events;
create policy "members view accessible task events"
on public.task_events for select to authenticated
using (public.can_view_task(task_id));

drop policy if exists "members view attachments" on public.task_attachments;
create policy "members view accessible attachments"
on public.task_attachments for select to authenticated
using (public.can_view_task(task_id));

drop policy if exists "members create attachments" on public.task_attachments;
create policy "project collaborators create attachments"
on public.task_attachments for insert to authenticated
with check (
  uploaded_by = auth.uid()
  and public.can_comment_task(task_id)
);

drop policy if exists "members update attachments" on public.task_attachments;
create policy "uploaders update accessible attachments"
on public.task_attachments for update to authenticated
using (
  (uploaded_by = auth.uid() and public.can_comment_task(task_id))
  or public.can_admin_task(task_id)
)
with check (
  (uploaded_by = auth.uid() and public.can_comment_task(task_id))
  or public.can_admin_task(task_id)
);

drop policy if exists "members delete attachments" on public.task_attachments;
create policy "uploaders delete accessible attachments"
on public.task_attachments for delete to authenticated
using (
  (uploaded_by = auth.uid() and public.can_comment_task(task_id))
  or public.can_admin_task(task_id)
);

-- Clientes: los invitados sólo reciben los clientes vinculados a sus campañas.
drop policy if exists "members view clients" on public.clients;
create policy "members view accessible clients"
on public.clients for select to authenticated
using (public.can_view_client(id));

-- Miembros e invitaciones de proyecto.
drop policy if exists "workspace members view project members" on public.project_members;
create policy "members view accessible project members"
on public.project_members for select to authenticated
using (public.has_project_access(project_id));

drop policy if exists "project admins manage project members" on public.project_members;
create policy "project admins manage project members"
on public.project_members for all to authenticated
using (public.can_admin_project(project_id))
with check (public.can_admin_project(project_id));

drop policy if exists "project admins view invitations" on public.project_invitations;
create policy "project admins view invitations"
on public.project_invitations for select to authenticated
using (public.can_admin_project(project_id));

drop policy if exists "project admins delete invitations" on public.project_invitations;
create policy "project admins delete invitations"
on public.project_invitations for delete to authenticated
using (public.can_admin_project(project_id));

-- Tiempo: cada usuario sólo ve sus registros de tareas accesibles; los
-- administradores internos conservan la auditoría completa del espacio.
drop policy if exists "users view permitted time entries" on public.time_entries;
create policy "users view scoped time entries"
on public.time_entries for select to authenticated
using (
  (user_id = auth.uid() and public.can_view_task(task_id))
  or public.is_team_admin(team_id)
);

drop policy if exists "users create own time entries" on public.time_entries;
create policy "users create scoped time entries"
on public.time_entries for insert to authenticated
with check (
  user_id = auth.uid()
  and public.can_edit_task(task_id)
);

drop policy if exists "users update permitted time entries" on public.time_entries;
create policy "users update scoped time entries"
on public.time_entries for update to authenticated
using (
  (user_id = auth.uid() and public.can_edit_task(task_id))
  or public.is_team_admin(team_id)
)
with check (
  (user_id = auth.uid() and public.can_edit_task(task_id))
  or public.is_team_admin(team_id)
);

drop policy if exists "users delete permitted time entries" on public.time_entries;
create policy "users delete scoped time entries"
on public.time_entries for delete to authenticated
using (
  (user_id = auth.uid() and public.can_edit_task(task_id))
  or public.is_team_admin(team_id)
);

-- Archivos privados en Storage: el segundo segmento de la ruta es el task_id.
drop policy if exists "workspace members read task files" on storage.objects;
create policy "scoped members read task files"
on storage.objects for select to authenticated
using (
  bucket_id = 'task-attachments'
  and public.can_view_task(public.task_storage_task_id(name))
);

drop policy if exists "workspace members upload task files" on storage.objects;
create policy "scoped collaborators upload task files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'task-attachments'
  and public.can_comment_task(public.task_storage_task_id(name))
);

drop policy if exists "workspace members delete task files" on storage.objects;
create policy "scoped collaborators delete own task files"
on storage.objects for delete to authenticated
using (
  bucket_id = 'task-attachments'
  and (
    (
      owner_id = auth.uid()::text
      and public.can_comment_task(public.task_storage_task_id(name))
    )
    or public.can_admin_task(public.task_storage_task_id(name))
  )
);

-- La información estratégica es interna al espacio, no parte de una campaña
-- compartida con invitados externos.
drop policy if exists "members view portfolios" on public.portfolios;
create policy "internal members view portfolios"
on public.portfolios for select to authenticated
using (public.is_full_team_member(team_id));

drop policy if exists "members create portfolios" on public.portfolios;
create policy "internal members create portfolios"
on public.portfolios for insert to authenticated
with check (public.is_full_team_member(team_id) and created_by = auth.uid());

drop policy if exists "members update portfolios" on public.portfolios;
create policy "internal members update portfolios"
on public.portfolios for update to authenticated
using (public.is_full_team_member(team_id))
with check (public.is_full_team_member(team_id));

drop policy if exists "members delete portfolios" on public.portfolios;
create policy "internal members delete portfolios"
on public.portfolios for delete to authenticated
using (
  public.is_full_team_member(team_id)
  and (created_by = auth.uid() or public.is_team_admin(team_id))
);

drop policy if exists "members view portfolio projects" on public.portfolio_projects;
create policy "internal members view portfolio projects"
on public.portfolio_projects for select to authenticated
using (
  exists (
    select 1 from public.portfolios
    where portfolios.id = portfolio_projects.portfolio_id
      and public.is_full_team_member(portfolios.team_id)
  )
);

drop policy if exists "members manage portfolio projects" on public.portfolio_projects;
create policy "internal members manage portfolio projects"
on public.portfolio_projects for all to authenticated
using (
  exists (
    select 1 from public.portfolios
    where portfolios.id = portfolio_projects.portfolio_id
      and public.is_full_team_member(portfolios.team_id)
  )
)
with check (
  exists (
    select 1 from public.portfolios
    where portfolios.id = portfolio_projects.portfolio_id
      and public.is_full_team_member(portfolios.team_id)
  )
);

drop policy if exists "members view goals" on public.goals;
create policy "internal members view goals"
on public.goals for select to authenticated
using (public.is_full_team_member(team_id));

drop policy if exists "members create goals" on public.goals;
create policy "internal members create goals"
on public.goals for insert to authenticated
with check (public.is_full_team_member(team_id) and created_by = auth.uid());

drop policy if exists "members update goals" on public.goals;
create policy "internal members update goals"
on public.goals for update to authenticated
using (public.is_full_team_member(team_id))
with check (public.is_full_team_member(team_id));

drop policy if exists "members delete goals" on public.goals;
create policy "internal members delete goals"
on public.goals for delete to authenticated
using (
  public.is_full_team_member(team_id)
  and (created_by = auth.uid() or public.is_team_admin(team_id))
);

drop policy if exists "members view goal projects" on public.goal_projects;
create policy "internal members view goal projects"
on public.goal_projects for select to authenticated
using (
  exists (
    select 1 from public.goals
    where goals.id = goal_projects.goal_id
      and public.is_full_team_member(goals.team_id)
  )
);

drop policy if exists "members manage goal projects" on public.goal_projects;
create policy "internal members manage goal projects"
on public.goal_projects for all to authenticated
using (
  exists (
    select 1 from public.goals
    where goals.id = goal_projects.goal_id
      and public.is_full_team_member(goals.team_id)
  )
)
with check (
  exists (
    select 1 from public.goals
    where goals.id = goal_projects.goal_id
      and public.is_full_team_member(goals.team_id)
  )
);

-- Accepting a workspace invitation promotes an existing project guest to a
-- regular workspace member. Accepting a project invitation creates a scoped
-- guest unless the person was already a regular member.
create or replace function public.accept_team_invitation(invitation_token uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation public.team_invitations%rowtype;
  current_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into invitation
  from public.team_invitations
  where token = invitation_token
    and accepted_at is null
    and expires_at > now();

  if invitation.id is null then
    raise exception 'Invitation is invalid or expired';
  end if;
  if current_email <> invitation.email then
    raise exception 'Sign in with the invited email address';
  end if;

  insert into public.profiles (id, full_name, email)
  values (auth.uid(), split_part(current_email, '@', 1), current_email)
  on conflict (id) do update set email = excluded.email;

  insert into public.team_members (team_id, user_id, role, project_limited)
  values (invitation.team_id, auth.uid(), invitation.role, false)
  on conflict (team_id, user_id) do update
  set role = excluded.role,
      project_limited = false;

  update public.team_invitations
  set accepted_at = now()
  where id = invitation.id;

  return invitation.team_id;
end;
$$;

create or replace function public.accept_project_invitation(invitation_token uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation public.project_invitations%rowtype;
  current_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  workspace_role public.team_role;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into invitation
  from public.project_invitations
  where token = invitation_token
    and accepted_at is null
    and expires_at > now();

  if invitation.id is null then
    raise exception 'Project invitation is invalid or expired';
  end if;
  if current_email <> invitation.email then
    raise exception 'Sign in with the invited email address';
  end if;

  insert into public.profiles (id, full_name, email)
  values (auth.uid(), split_part(current_email, '@', 1), current_email)
  on conflict (id) do update set email = excluded.email;

  workspace_role := case
    when invitation.role = 'viewer' then 'viewer'::public.team_role
    else 'agent'::public.team_role
  end;

  insert into public.team_members (team_id, user_id, role, project_limited)
  values (invitation.team_id, auth.uid(), workspace_role, true)
  on conflict (team_id, user_id) do nothing;

  insert into public.project_members (project_id, user_id, role, notify_on_new_tasks)
  values (
    invitation.project_id,
    auth.uid(),
    invitation.role,
    invitation.notify_on_new_tasks
  )
  on conflict (project_id, user_id) do update
  set role = excluded.role,
      notify_on_new_tasks = excluded.notify_on_new_tasks;

  update public.project_invitations
  set accepted_at = now()
  where id = invitation.id;

  return invitation.project_id;
end;
$$;

create or replace function public.remove_project_member(
  candidate_project_id uuid,
  candidate_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate_team_id uuid;
begin
  if not public.can_admin_project(candidate_project_id) then
    raise exception 'Only project administrators can manage members';
  end if;

  select team_id into candidate_team_id
  from public.projects
  where id = candidate_project_id;

  delete from public.project_members
  where project_id = candidate_project_id
    and user_id = candidate_user_id;

  delete from public.team_members as member
  where member.team_id = candidate_team_id
    and member.user_id = candidate_user_id
    and member.project_limited
    and not exists (
      select 1
      from public.project_members as remaining
      join public.projects as project on project.id = remaining.project_id
      where remaining.user_id = candidate_user_id
        and project.team_id = candidate_team_id
    );
end;
$$;

-- Security-definer workflows must enforce the same project boundary as RLS.
create or replace function public.start_task_timer(
  candidate_task_id uuid,
  candidate_description text default '',
  candidate_billable boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_task public.tasks%rowtype;
  member_rate numeric(12, 2);
  new_entry_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into target_task from public.tasks where id = candidate_task_id;
  if target_task.id is null then
    raise exception 'Task not found';
  end if;
  if not public.can_edit_task(candidate_task_id) then
    raise exception 'Time tracking permission required';
  end if;

  select hourly_rate into member_rate
  from public.team_members
  where team_id = target_task.team_id and user_id = auth.uid();

  if exists (
    select 1 from public.time_entries
    where team_id = target_task.team_id
      and task_id = target_task.id
      and user_id = auth.uid()
      and ended_at is null
  ) then
    raise exception 'A timer is already active for this task';
  end if;

  insert into public.time_entries (
    team_id, task_id, user_id, description, started_at, billable, hourly_rate
  ) values (
    target_task.team_id,
    target_task.id,
    auth.uid(),
    trim(coalesce(candidate_description, '')),
    now(),
    candidate_billable,
    coalesce(member_rate, 0)
  ) returning id into new_entry_id;

  return new_entry_id;
end;
$$;

create or replace function public.create_manual_time_entry(
  candidate_task_id uuid,
  candidate_description text,
  candidate_started_at timestamptz,
  candidate_duration_seconds integer,
  candidate_billable boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_task public.tasks%rowtype;
  member_rate numeric(12, 2);
  new_entry_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if candidate_duration_seconds <= 0 or candidate_duration_seconds > 86400 then
    raise exception 'Duration must be between 1 second and 24 hours';
  end if;

  select * into target_task from public.tasks where id = candidate_task_id;
  if target_task.id is null then
    raise exception 'Task not found';
  end if;
  if not public.can_edit_task(candidate_task_id) then
    raise exception 'Time tracking permission required';
  end if;

  select hourly_rate into member_rate
  from public.team_members
  where team_id = target_task.team_id and user_id = auth.uid();

  insert into public.time_entries (
    team_id, task_id, user_id, description, started_at, ended_at,
    duration_seconds, billable, hourly_rate
  ) values (
    target_task.team_id,
    target_task.id,
    auth.uid(),
    trim(coalesce(candidate_description, '')),
    candidate_started_at,
    candidate_started_at + make_interval(secs => candidate_duration_seconds),
    candidate_duration_seconds,
    candidate_billable,
    coalesce(member_rate, 0)
  ) returning id into new_entry_id;

  return new_entry_id;
end;
$$;

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
  archived_time timestamptz := now();
begin
  if not public.can_edit_task(candidate_task_id) then
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
      select child.id from public.tasks child
      join descendants on child.parent_task_id = descendants.id
    ) select id from descendants
  ) and ended_at is null;

  update public.tasks
  set status = 'resuelto',
      resolved_at = coalesce(resolved_at, archived_time),
      archived_at = archived_time,
      archived_by = auth.uid(),
      deleted_at = null,
      deleted_by = null,
      closure_summary = case
        when id = candidate_task_id then nullif(trim(coalesce(candidate_closure_summary, '')), '')
        else closure_summary
      end,
      lessons_learned = case
        when id = candidate_task_id then nullif(trim(coalesce(candidate_lessons_learned, '')), '')
        else lessons_learned
      end
  where id in (
    with recursive descendants as (
      select id from public.tasks where id = candidate_task_id
      union all
      select child.id from public.tasks child
      join descendants on child.parent_task_id = descendants.id
    ) select id from descendants
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
  trashed_time timestamptz := now();
begin
  if not public.can_edit_task(candidate_task_id) then
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
      select child.id from public.tasks child
      join descendants on child.parent_task_id = descendants.id
    ) select id from descendants
  ) and ended_at is null;

  update public.tasks
  set archived_at = coalesce(archived_at, trashed_time),
      archived_by = coalesce(archived_by, auth.uid()),
      deleted_at = trashed_time,
      deleted_by = auth.uid()
  where id in (
    with recursive descendants as (
      select id from public.tasks where id = candidate_task_id
      union all
      select child.id from public.tasks child
      join descendants on child.parent_task_id = descendants.id
    ) select id from descendants
  );
end;
$$;

create or replace function public.restore_task_record(candidate_task_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_edit_task(candidate_task_id) then
    raise exception 'Task restore permission required';
  end if;

  update public.tasks
  set archived_at = null,
      archived_by = null,
      deleted_at = null,
      deleted_by = null
  where id in (
    with recursive descendants as (
      select id from public.tasks where id = candidate_task_id
      union all
      select child.id from public.tasks child
      join descendants on child.parent_task_id = descendants.id
    ) select id from descendants
  );
end;
$$;

revoke all on function public.accept_team_invitation(uuid) from public;
revoke all on function public.accept_project_invitation(uuid) from public;
revoke all on function public.remove_project_member(uuid, uuid) from public;
revoke all on function public.start_task_timer(uuid, text, boolean) from public;
revoke all on function public.create_manual_time_entry(uuid, text, timestamptz, integer, boolean) from public;
revoke all on function public.archive_task_record(uuid, text, text) from public;
revoke all on function public.trash_task_record(uuid) from public;
revoke all on function public.restore_task_record(uuid) from public;

grant execute on function public.accept_team_invitation(uuid) to authenticated;
grant execute on function public.accept_project_invitation(uuid) to authenticated;
grant execute on function public.remove_project_member(uuid, uuid) to authenticated;
grant execute on function public.start_task_timer(uuid, text, boolean) to authenticated;
grant execute on function public.create_manual_time_entry(uuid, text, timestamptz, integer, boolean) to authenticated;
grant execute on function public.archive_task_record(uuid, text, text) to authenticated;
grant execute on function public.trash_task_record(uuid) to authenticated;
grant execute on function public.restore_task_record(uuid) to authenticated;
