-- Rol operativo con acceso financiero y de auditoría, sin administración general.
-- Se agrega en una migración separada porque PostgreSQL exige confirmar el
-- nuevo valor del enum antes de utilizarlo en filas o funciones.

alter type public.team_role add value if not exists 'controller';
