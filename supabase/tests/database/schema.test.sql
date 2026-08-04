begin;
select plan(15);

select has_table('public', 'team_invitations', 'team_invitations existe');
select has_table('public', 'task_attachments', 'task_attachments existe');
select has_table('public', 'notifications', 'notifications existe');
select has_function(
  'public',
  'create_team_invitation',
  array['uuid', 'text', 'public.team_role'],
  'create_team_invitation existe'
);
select has_column('public', 'teams', 'archived', 'teams se puede archivar');
select has_column('public', 'profiles', 'email', 'profiles conserva email');
select has_table('public', 'time_entries', 'time_entries existe');
select has_column('public', 'team_members', 'hourly_rate', 'integrantes tienen tarifa');
select has_function(
  'public',
  'start_task_timer',
  array['uuid', 'text', 'boolean'],
  'start_task_timer existe'
);
select has_column(
  'public',
  'clients',
  'categories',
  'clientes tienen categorías'
);
select has_column(
  'public',
  'projects',
  'client_category',
  'proyectos tienen categoría de cliente'
);
select has_column('public', 'tasks', 'client_id', 'tareas tienen cliente');
select has_column('public', 'tasks', 'due_time', 'tareas tienen hora límite');
select has_column(
  'public',
  'tasks',
  'recurrence_rule',
  'tareas tienen recurrencia'
);
select has_function(
  'public',
  'generate_next_recurring_task',
  array[]::text[],
  'generador de recurrencias existe'
);

select * from finish();
rollback;
