-- @mentions in task/project descriptions and comments. Names are selected from
-- workspace members in the UI and resolved again in the database so clients
-- cannot notify people outside the content they can access.

create or replace function private.notify_text_mentions(
  candidate_team_id uuid,
  candidate_task_id uuid,
  candidate_project_id uuid,
  candidate_subject text,
  candidate_previous_text text,
  candidate_new_text text,
  candidate_category text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_name text;
begin
  if nullif(trim(coalesce(candidate_new_text, '')), '') is null then
    return;
  end if;

  select coalesce(profile.full_name, split_part(profile.email, '@', 1), 'Alguien')
  into actor_name
  from public.profiles as profile
  where profile.id = auth.uid();

  insert into public.notifications (
    user_id, task_id, title, body, category
  )
  select distinct
    member.user_id,
    candidate_task_id,
    case
      when candidate_task_id is not null then 'Te mencionaron en una tarea'
      else 'Te mencionaron en un proyecto'
    end,
    coalesce(actor_name, 'Alguien') || ' te mencionó en “' || candidate_subject || '”.',
    candidate_category
  from public.team_members as member
  join public.profiles as profile on profile.id = member.user_id
  where member.team_id = candidate_team_id
    and member.user_id <> auth.uid()
    and profile.deactivated_at is null
    and position('@' || lower(profile.full_name) in lower(candidate_new_text)) > 0
    and position(
      '@' || lower(profile.full_name)
      in lower(coalesce(candidate_previous_text, ''))
    ) = 0
    and (
      not member.project_limited
      or (
        candidate_task_id is not null
        and exists (
          select 1
          from public.task_projects as relation
          join public.project_members as project_member
            on project_member.project_id = relation.project_id
           and project_member.user_id = member.user_id
          where relation.task_id = candidate_task_id
        )
      )
      or (
        candidate_project_id is not null
        and exists (
          select 1
          from public.project_members as project_member
          where project_member.project_id = candidate_project_id
            and project_member.user_id = member.user_id
        )
      )
    );
end;
$$;

create or replace function public.notify_task_description_mentions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and coalesce(new.description, '') = coalesce(old.description, '') then
    return new;
  end if;
  perform private.notify_text_mentions(
    new.team_id,
    new.id,
    new.project_id,
    new.title,
    case when tg_op = 'UPDATE' then old.description else '' end,
    new.description,
    'comments'
  );
  return new;
end;
$$;

drop trigger if exists tasks_notify_description_mentions on public.tasks;
create trigger tasks_notify_description_mentions
after insert or update of description on public.tasks
for each row
execute function public.notify_task_description_mentions();

create or replace function public.notify_project_description_mentions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and coalesce(new.description, '') = coalesce(old.description, '') then
    return new;
  end if;
  perform private.notify_text_mentions(
    new.team_id,
    null,
    new.id,
    new.name,
    case when tg_op = 'UPDATE' then old.description else '' end,
    new.description,
    'project_updates'
  );
  return new;
end;
$$;

drop trigger if exists projects_notify_description_mentions on public.projects;
create trigger projects_notify_description_mentions
after insert or update of description on public.projects
for each row
execute function public.notify_project_description_mentions();

create or replace function public.notify_comment_mentions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_task public.tasks%rowtype;
begin
  select * into target_task from public.tasks where id = new.task_id;
  perform private.notify_text_mentions(
    target_task.team_id,
    target_task.id,
    target_task.project_id,
    target_task.title,
    '',
    new.body,
    'comments'
  );
  return new;
end;
$$;

drop trigger if exists comments_notify_mentions on public.comments;
create trigger comments_notify_mentions
after insert on public.comments
for each row execute function public.notify_comment_mentions();

revoke all on function public.notify_task_description_mentions() from public;
revoke all on function public.notify_project_description_mentions() from public;
revoke all on function public.notify_comment_mentions() from public;
