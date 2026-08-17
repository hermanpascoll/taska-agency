-- Nuevo estado intermedio para que el responsable entregue y un referente apruebe.
alter type public.task_status add value if not exists 'en_revision' before 'resuelto';
