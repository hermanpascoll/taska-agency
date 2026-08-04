alter table public.tasks
  add column if not exists start_date date;

update public.tasks
set start_date = least(
  due_date,
  greatest(created_at::date, due_date - 2)
)
where start_date is null
  and due_date is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tasks_valid_date_range'
      and conrelid = 'public.tasks'::regclass
  ) then
    alter table public.tasks
      add constraint tasks_valid_date_range
      check (
        start_date is null
        or due_date is null
        or start_date <= due_date
      );
  end if;
end
$$;

create index if not exists tasks_start_date_idx
  on public.tasks (start_date);
