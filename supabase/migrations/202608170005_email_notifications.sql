-- Reliable transactional email delivery for Taska notifications.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create extension if not exists pg_net;
create extension if not exists pg_cron with schema pg_catalog;

create table if not exists public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  delivery_mode text not null default 'instant'
    check (delivery_mode in ('instant', 'daily', 'off')),
  assignments boolean not null default true,
  comments boolean not null default true,
  reviews boolean not null default true,
  billing boolean not null default true,
  project_updates boolean not null default true,
  due_reminders boolean not null default true,
  timezone text not null default 'America/Montevideo',
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

drop policy if exists "users view notification preferences" on public.notification_preferences;
create policy "users view notification preferences"
on public.notification_preferences for select to authenticated
using (user_id = auth.uid());

drop policy if exists "users create notification preferences" on public.notification_preferences;
create policy "users create notification preferences"
on public.notification_preferences for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "users update notification preferences" on public.notification_preferences;
create policy "users update notification preferences"
on public.notification_preferences for update to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.notifications
  add column if not exists category text not null default 'activity',
  add column if not exists dedupe_key text;

create unique index if not exists notifications_dedupe_key_idx
on public.notifications(dedupe_key) where dedupe_key is not null;

create table if not exists private.email_outbox (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null unique references public.notifications(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  recipient_email text not null,
  category text not null,
  subject text not null,
  body text not null,
  task_id uuid references public.tasks(id) on delete cascade,
  delivery_mode text not null default 'instant'
    check (delivery_mode in ('instant', 'daily')),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'failed', 'cancelled')),
  available_at timestamptz not null default now(),
  attempts integer not null default 0,
  provider_id text,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists email_outbox_pending_idx
on private.email_outbox(status, available_at, created_at);

revoke all on private.email_outbox from public, anon, authenticated;

create table if not exists private.email_dispatch_settings (
  singleton boolean primary key default true check (singleton),
  function_url text not null,
  dispatch_secret text not null,
  updated_at timestamptz not null default now()
);

revoke all on private.email_dispatch_settings from public, anon, authenticated;

create or replace function public.default_notification_preferences(candidate_user_id uuid)
returns public.notification_preferences
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.notification_preferences;
begin
  if candidate_user_id <> auth.uid() then
    raise exception 'Only your own notification preferences can be created';
  end if;

  insert into public.notification_preferences (user_id)
  values (candidate_user_id)
  on conflict (user_id) do nothing;

  select * into result
  from public.notification_preferences
  where user_id = candidate_user_id;
  return result;
end;
$$;

revoke all on function public.default_notification_preferences(uuid) from public;
grant execute on function public.default_notification_preferences(uuid) to authenticated;

create or replace function private.notification_category(candidate_title text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when candidate_title ilike '%comentario%' then 'comments'
    when candidate_title ilike '%revis%' or candidate_title ilike '%aprobar%' then 'reviews'
    when candidate_title ilike '%factur%' then 'billing'
    when candidate_title ilike '%proyecto%' then 'project_updates'
    when candidate_title ilike '%asignad%' then 'assignments'
    when candidate_title ilike '%vence%' or candidate_title ilike '%vencida%' then 'due_reminders'
    else 'activity'
  end
$$;

create or replace function private.enqueue_notification_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient public.profiles%rowtype;
  preferences public.notification_preferences%rowtype;
  inferred_category text;
  category_enabled boolean;
  next_available timestamptz;
begin
  select * into recipient from public.profiles where id = new.user_id;
  if recipient.id is null or nullif(trim(recipient.email), '') is null then
    return new;
  end if;

  insert into public.notification_preferences (user_id)
  values (new.user_id)
  on conflict (user_id) do nothing;

  select * into preferences
  from public.notification_preferences
  where user_id = new.user_id;

  if preferences.delivery_mode = 'off' then
    return new;
  end if;

  inferred_category := case
    when new.category <> 'activity' then new.category
    else private.notification_category(new.title)
  end;

  category_enabled := case inferred_category
    when 'assignments' then preferences.assignments
    when 'comments' then preferences.comments
    when 'reviews' then preferences.reviews
    when 'billing' then preferences.billing
    when 'project_updates' then preferences.project_updates
    when 'due_reminders' then preferences.due_reminders
    else true
  end;

  if not category_enabled then
    return new;
  end if;

  next_available := case
    when preferences.delivery_mode = 'daily' then
      (date_trunc('day', now() at time zone preferences.timezone)
        + interval '1 day 8 hours') at time zone preferences.timezone
    else now()
  end;

  insert into private.email_outbox (
    notification_id, user_id, recipient_email, category, subject, body,
    task_id, delivery_mode, available_at
  ) values (
    new.id, new.user_id, recipient.email, inferred_category, new.title, new.body,
    new.task_id, preferences.delivery_mode, next_available
  ) on conflict (notification_id) do nothing;

  return new;
end;
$$;

drop trigger if exists notifications_enqueue_email on public.notifications;
create trigger notifications_enqueue_email
after insert on public.notifications
for each row execute function private.enqueue_notification_email();

create or replace function private.create_due_date_notifications()
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, task_id, title, body, category, dedupe_key)
  select
    task.assignee_id,
    task.id,
    'Tarea con vencimiento hoy',
    '“' || task.title || '” vence hoy.',
    'due_reminders',
    'due:' || task.id::text || ':' || task.assignee_id::text || ':' || current_date::text
  from public.tasks as task
  where task.assignee_id is not null
    and task.due_date = current_date
    and task.status <> 'resuelto'
    and task.deleted_at is null
    and task.archived_at is null
  on conflict do nothing
$$;

create or replace function private.dispatch_pending_emails()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  settings private.email_dispatch_settings%rowtype;
  request_id bigint;
begin
  select * into settings from private.email_dispatch_settings where singleton limit 1;
  if settings.function_url is null or settings.dispatch_secret is null then
    return null;
  end if;

  select net.http_post(
    url := settings.function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-dispatch-secret', settings.dispatch_secret
    ),
    body := '{}'::jsonb
  ) into request_id;
  return request_id;
end;
$$;

create or replace function public.claim_email_outbox(candidate_limit integer default 25)
returns table (
  id uuid,
  notification_id uuid,
  user_id uuid,
  recipient_email text,
  category text,
  subject text,
  body text,
  task_id uuid,
  delivery_mode text,
  attempts integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required';
  end if;

  return query
  with candidates as (
    select queue.id
    from private.email_outbox as queue
    where (
        queue.status in ('pending', 'failed')
        or (queue.status = 'processing' and queue.updated_at < now() - interval '15 minutes')
      )
      and queue.available_at <= now()
      and queue.attempts < 5
    order by queue.created_at
    for update skip locked
    limit greatest(1, least(coalesce(candidate_limit, 25), 100))
  ), claimed as (
    update private.email_outbox as queue
    set status = 'processing', attempts = queue.attempts + 1, updated_at = now()
    from candidates
    where queue.id = candidates.id
    returning queue.*
  )
  select claimed.id, claimed.notification_id, claimed.user_id,
    claimed.recipient_email, claimed.category, claimed.subject, claimed.body,
    claimed.task_id, claimed.delivery_mode, claimed.attempts
  from claimed;
end;
$$;

create or replace function public.configure_email_dispatch(
  candidate_function_url text,
  candidate_dispatch_secret text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if nullif(trim(candidate_function_url), '') is null
    or nullif(trim(candidate_dispatch_secret), '') is null then
    raise exception 'Function URL and dispatch secret are required';
  end if;

  insert into private.email_dispatch_settings (
    singleton, function_url, dispatch_secret, updated_at
  ) values (
    true, trim(candidate_function_url), candidate_dispatch_secret, now()
  )
  on conflict (singleton) do update
  set function_url = excluded.function_url,
      dispatch_secret = excluded.dispatch_secret,
      updated_at = now();
end;
$$;

create or replace function public.complete_email_outbox(
  candidate_id uuid,
  candidate_provider_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
  update private.email_outbox
  set status = 'sent', provider_id = candidate_provider_id, sent_at = now(),
    last_error = null, updated_at = now()
  where id = candidate_id and status = 'processing';
end;
$$;

create or replace function public.fail_email_outbox(
  candidate_id uuid,
  candidate_error text,
  candidate_retry_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
  update private.email_outbox
  set status = 'failed', last_error = left(coalesce(candidate_error, 'Unknown email error'), 1000),
    available_at = candidate_retry_at, updated_at = now()
  where id = candidate_id and status = 'processing';
end;
$$;

revoke all on function public.claim_email_outbox(integer) from public, anon, authenticated;
revoke all on function public.configure_email_dispatch(text, text) from public, anon, authenticated;
revoke all on function public.complete_email_outbox(uuid, text) from public, anon, authenticated;
revoke all on function public.fail_email_outbox(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.claim_email_outbox(integer) to service_role;
grant execute on function public.configure_email_dispatch(text, text) to service_role;
grant execute on function public.complete_email_outbox(uuid, text) to service_role;
grant execute on function public.fail_email_outbox(uuid, text, timestamptz) to service_role;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'taska-due-date-notifications') then
    perform cron.schedule(
      'taska-due-date-notifications',
      '0 11 * * *',
      'select private.create_due_date_notifications()'
    );
  end if;
  if not exists (select 1 from cron.job where jobname = 'taska-email-dispatch') then
    perform cron.schedule(
      'taska-email-dispatch',
      '*/5 * * * *',
      'select private.dispatch_pending_emails()'
    );
  end if;
end
$$;
