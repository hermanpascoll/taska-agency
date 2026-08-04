-- Collaboration, invitations, notifications and private task attachments.

alter table public.profiles
add column if not exists email text;

alter table public.teams
add column if not exists archived boolean not null default false;

update public.profiles as profile
set email = auth_user.email
from auth.users as auth_user
where profile.id = auth_user.id
  and profile.email is null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    lower(new.email)
  )
  on conflict (id) do update
  set email = excluded.email,
      full_name = coalesce(public.profiles.full_name, excluded.full_name);
  return new;
end;
$$;

create table if not exists public.team_invitations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  email text not null,
  role public.team_role not null default 'agent'
    check (role <> 'owner'),
  token uuid not null default gen_random_uuid() unique,
  invited_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  unique (team_id, email)
);

create table if not exists public.task_attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  storage_path text not null unique,
  size_bytes bigint not null check (size_bytes >= 0 and size_bytes <= 10485760),
  mime_type text not null default 'application/octet-stream',
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  title text not null,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists team_invitations_team_id_idx
on public.team_invitations(team_id);
create index if not exists team_invitations_token_idx
on public.team_invitations(token);
create index if not exists task_attachments_task_id_idx
on public.task_attachments(task_id);
create index if not exists notifications_user_created_idx
on public.notifications(user_id, created_at desc);

alter table public.team_invitations enable row level security;
alter table public.task_attachments enable row level security;
alter table public.notifications enable row level security;

drop policy if exists "admins view invitations" on public.team_invitations;
create policy "admins view invitations"
on public.team_invitations for select
to authenticated
using (public.is_team_admin(team_id));

drop policy if exists "admins delete invitations" on public.team_invitations;
create policy "admins delete invitations"
on public.team_invitations for delete
to authenticated
using (public.is_team_admin(team_id));

drop policy if exists "members view attachments" on public.task_attachments;
create policy "members view attachments"
on public.task_attachments for select
to authenticated
using (
  exists (
    select 1
    from public.tasks
    where tasks.id = task_attachments.task_id
      and public.is_team_member(tasks.team_id)
  )
);

drop policy if exists "members create attachments" on public.task_attachments;
create policy "members create attachments"
on public.task_attachments for insert
to authenticated
with check (
  uploaded_by = auth.uid()
  and exists (
    select 1
    from public.tasks
    where tasks.id = task_attachments.task_id
      and public.is_team_member(tasks.team_id)
  )
);

drop policy if exists "members delete attachments" on public.task_attachments;
create policy "members delete attachments"
on public.task_attachments for delete
to authenticated
using (
  uploaded_by = auth.uid()
  or exists (
    select 1
    from public.tasks
    where tasks.id = task_attachments.task_id
      and public.is_team_admin(tasks.team_id)
  )
);

drop policy if exists "users view notifications" on public.notifications;
create policy "users view notifications"
on public.notifications for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "users update notifications" on public.notifications;
create policy "users update notifications"
on public.notifications for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "users delete notifications" on public.notifications;
create policy "users delete notifications"
on public.notifications for delete
to authenticated
using (user_id = auth.uid());

drop policy if exists "owners delete teams" on public.teams;
create policy "owners delete teams"
on public.teams for delete
to authenticated
using (
  exists (
    select 1
    from public.team_members
    where team_members.team_id = teams.id
      and team_members.user_id = auth.uid()
      and team_members.role = 'owner'
  )
);

create or replace function public.create_team_invitation(
  candidate_team_id uuid,
  candidate_email text,
  candidate_role public.team_role default 'agent'
)
returns table (
  id uuid,
  team_id uuid,
  email text,
  role public.team_role,
  token uuid,
  created_at timestamptz,
  expires_at timestamptz,
  accepted_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := lower(trim(candidate_email));
begin
  if not public.is_team_admin(candidate_team_id) then
    raise exception 'Only workspace administrators can invite members';
  end if;

  if normalized_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'A valid email is required';
  end if;

  if candidate_role = 'owner' then
    raise exception 'Owner invitations are not allowed';
  end if;

  return query
  insert into public.team_invitations (
    team_id,
    email,
    role,
    invited_by,
    expires_at,
    accepted_at,
    token
  )
  values (
    candidate_team_id,
    normalized_email,
    candidate_role,
    auth.uid(),
    now() + interval '7 days',
    null,
    gen_random_uuid()
  )
  on conflict (team_id, email) do update
  set role = excluded.role,
      invited_by = excluded.invited_by,
      created_at = now(),
      expires_at = now() + interval '7 days',
      accepted_at = null,
      token = gen_random_uuid()
  returning
    team_invitations.id,
    team_invitations.team_id,
    team_invitations.email,
    team_invitations.role,
    team_invitations.token,
    team_invitations.created_at,
    team_invitations.expires_at,
    team_invitations.accepted_at;
end;
$$;

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

  select *
  into invitation
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

  insert into public.team_members (team_id, user_id, role)
  values (invitation.team_id, auth.uid(), invitation.role)
  on conflict (team_id, user_id) do update set role = excluded.role;

  update public.team_invitations
  set accepted_at = now()
  where id = invitation.id;

  return invitation.team_id;
end;
$$;

create or replace function public.update_member_role(
  candidate_team_id uuid,
  candidate_user_id uuid,
  candidate_role public.team_role
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_role public.team_role;
  target_role public.team_role;
  owner_count integer;
begin
  select role into caller_role
  from public.team_members
  where team_id = candidate_team_id and user_id = auth.uid();

  select role into target_role
  from public.team_members
  where team_id = candidate_team_id and user_id = candidate_user_id;

  if caller_role not in ('owner', 'admin') then
    raise exception 'Only workspace administrators can update roles';
  end if;

  if (target_role = 'owner' or candidate_role = 'owner')
    and caller_role <> 'owner' then
    raise exception 'Only owners can manage the owner role';
  end if;

  if target_role = 'owner' and candidate_role <> 'owner' then
    select count(*) into owner_count
    from public.team_members
    where team_id = candidate_team_id and role = 'owner';
    if owner_count <= 1 then
      raise exception 'A workspace must keep at least one owner';
    end if;
  end if;

  update public.team_members
  set role = candidate_role
  where team_id = candidate_team_id and user_id = candidate_user_id;
end;
$$;

create or replace function public.remove_team_member(
  candidate_team_id uuid,
  candidate_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_role public.team_role;
  target_role public.team_role;
begin
  select role into caller_role
  from public.team_members
  where team_id = candidate_team_id and user_id = auth.uid();

  select role into target_role
  from public.team_members
  where team_id = candidate_team_id and user_id = candidate_user_id;

  if candidate_user_id <> auth.uid() and caller_role not in ('owner', 'admin') then
    raise exception 'Only workspace administrators can remove members';
  end if;

  if target_role = 'owner' then
    raise exception 'Transfer ownership before removing an owner';
  end if;

  delete from public.team_members
  where team_id = candidate_team_id and user_id = candidate_user_id;
end;
$$;

create or replace function public.notify_task_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.assignee_id is not null
    and (
      tg_op = 'INSERT'
      or new.assignee_id is distinct from old.assignee_id
    )
    and new.assignee_id <> auth.uid() then
    insert into public.notifications (user_id, task_id, title, body)
    values (
      new.assignee_id,
      new.id,
      'Nueva tarea asignada',
      'Te asignaron “' || new.title || '”.'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_notify_assignment on public.tasks;
create trigger tasks_notify_assignment
after insert or update of assignee_id on public.tasks
for each row execute function public.notify_task_assignment();

create or replace function public.notify_new_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_task public.tasks%rowtype;
begin
  select * into target_task from public.tasks where id = new.task_id;
  if target_task.assignee_id is not null
    and target_task.assignee_id <> new.author_id then
    insert into public.notifications (user_id, task_id, title, body)
    values (
      target_task.assignee_id,
      target_task.id,
      'Nuevo comentario',
      'Hay una actualización en “' || target_task.title || '”.'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists comments_notify_assignee on public.comments;
create trigger comments_notify_assignee
after insert on public.comments
for each row execute function public.notify_new_comment();

insert into storage.buckets (id, name, public, file_size_limit)
values ('task-attachments', 'task-attachments', false, 10485760)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit;

drop policy if exists "workspace members read task files" on storage.objects;
create policy "workspace members read task files"
on storage.objects for select
to authenticated
using (
  bucket_id = 'task-attachments'
  and public.is_team_member(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "workspace members upload task files" on storage.objects;
create policy "workspace members upload task files"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'task-attachments'
  and public.is_team_member(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "workspace members delete task files" on storage.objects;
create policy "workspace members delete task files"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'task-attachments'
  and public.is_team_member(((storage.foldername(name))[1])::uuid)
);

revoke all on function public.create_team_invitation(uuid, text, public.team_role) from public;
revoke all on function public.accept_team_invitation(uuid) from public;
revoke all on function public.update_member_role(uuid, uuid, public.team_role) from public;
revoke all on function public.remove_team_member(uuid, uuid) from public;

grant execute on function public.create_team_invitation(uuid, text, public.team_role) to authenticated;
grant execute on function public.accept_team_invitation(uuid) to authenticated;
grant execute on function public.update_member_role(uuid, uuid, public.team_role) to authenticated;
grant execute on function public.remove_team_member(uuid, uuid) to authenticated;
