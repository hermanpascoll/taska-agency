-- Persistent platform-wide administrators.

create table if not exists public.platform_admins (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;

-- Platform administration is intentionally server-only. The service role
-- bypasses RLS; browser sessions never receive direct table access.
revoke all on table public.platform_admins from anon;
revoke all on table public.platform_admins from authenticated;
