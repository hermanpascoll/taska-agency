begin;
select plan(20);

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
select has_column(
  'public',
  'team_members',
  'project_limited',
  'invitados de proyecto tienen alcance limitado'
);
select has_table('public', 'project_members', 'project_members existe');
select has_table('public', 'project_invitations', 'project_invitations existe');
select has_function(
  'public',
  'has_project_access',
  array['uuid'],
  'has_project_access existe'
);
select has_function(
  'public',
  'can_view_task',
  array['uuid'],
  'can_view_task existe'
);
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
