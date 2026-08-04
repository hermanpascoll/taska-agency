-- Google Drive-backed workspace attachments.
-- Supabase remains the source of truth for permissions and metadata while
-- file bytes live in an organization-owned Shared Drive.

alter table public.teams
add column if not exists google_drive_id text,
add column if not exists google_drive_name text;

alter table public.task_attachments
alter column storage_path drop not null;

alter table public.task_attachments
add column if not exists storage_provider text not null default 'supabase'
  check (storage_provider in ('supabase', 'google_drive')),
add column if not exists external_file_id text,
add column if not exists external_web_url text,
add column if not exists external_thumbnail_url text;

alter table public.task_attachments
drop constraint if exists task_attachments_size_bytes_check;

alter table public.task_attachments
add constraint task_attachments_size_bytes_check
check (size_bytes >= 0 and size_bytes <= 104857600);

alter table public.task_attachments
add constraint task_attachments_storage_reference_check
check (
  (storage_provider = 'supabase' and storage_path is not null)
  or
  (storage_provider = 'google_drive' and external_file_id is not null)
);

create unique index if not exists task_attachments_external_file_id_idx
on public.task_attachments (external_file_id)
where external_file_id is not null;

comment on column public.teams.google_drive_id is
'Google Shared Drive ID used for files owned by this workspace.';

comment on column public.task_attachments.storage_provider is
'Physical storage backend. Metadata and authorization always remain in Supabase.';
