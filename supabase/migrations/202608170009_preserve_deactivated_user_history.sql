-- Baja lógica de usuarios: conserva la identidad referenciada por tareas,
-- comentarios, archivos y tiempo para no romper el historial de auditoría.

alter table public.profiles
  add column if not exists deactivated_at timestamptz,
  add column if not exists deactivated_by uuid references public.profiles(id) on delete set null;

create index if not exists profiles_deactivated_at_idx
on public.profiles(deactivated_at) where deactivated_at is not null;

create or replace function public.can_view_profile(candidate_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select candidate_user_id = auth.uid()
  or exists (
    select 1 from public.team_members as mine
    join public.team_members as theirs on theirs.team_id = mine.team_id
    where mine.user_id = auth.uid() and theirs.user_id = candidate_user_id
      and not mine.project_limited
  )
  or exists (
    select 1 from public.project_members as mine
    join public.project_members as theirs on theirs.project_id = mine.project_id
    where mine.user_id = auth.uid() and theirs.user_id = candidate_user_id
  )
  or exists (
    select 1 from public.tasks as task
    where (task.assignee_id = candidate_user_id or task.created_by = candidate_user_id)
      and public.can_view_task(task.id)
  )
  or exists (
    select 1 from public.comments as comment
    where comment.author_id = candidate_user_id and public.can_view_task(comment.task_id)
  )
  or exists (
    select 1 from public.task_attachments as attachment
    where attachment.uploaded_by = candidate_user_id
      and public.can_view_task(attachment.task_id)
  )
  or exists (
    select 1 from public.time_entries as entry
    where entry.user_id = candidate_user_id
      and (entry.user_id = auth.uid() or public.can_audit_time(entry.team_id))
  );
$$;
