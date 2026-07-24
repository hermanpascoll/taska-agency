# Taska para agencias

Aplicación web de gestión de trabajo inspirada en la claridad operativa de
Asana y adaptada al día a día de una agencia de publicidad. Reúne campañas,
entregables, responsables, prioridades, fechas de publicación y feedback en un
espacio compartido.

## Funcionalidades

- Autenticación con email/contraseña y Google SSO mediante Supabase Auth.
- Espacios de trabajo seleccionables, editables, archivables y eliminables.
- Invitaciones, integrantes y roles (`owner`, `admin`, `agent`, `viewer`) desde la interfaz.
- Panel global protegido para promover superadministradores, administrar
  usuarios y gestionar integrantes e invitaciones de todos los espacios.
- Creación, edición, archivo y eliminación de campañas organizadas como proyectos.
- Tareas y subtareas con responsable, cliente, prioridad, estado, etiquetas,
  fecha de inicio y fecha de entrega.
- Edición completa y eliminación de tareas, subtareas y comentarios.
- Comentarios, notificaciones y adjuntos privados de hasta 10 MB.
- Mis tareas incluye también las subtareas asignadas, aun cuando otra persona
  sea responsable de la tarea padre.
- Vistas de Mis tareas, lista completa, tablero Kanban y diagrama de Gantt.
- Gantt por proyecto con jerarquía de subtareas, escalas día/semana/mes,
  indicador de hoy y reprogramación por arrastre.
- Drag-and-drop HTML5 real en Kanban, con selector accesible como alternativa.
- Filtros por texto, prioridad, campaña, estado, responsable y vencimiento.
- Preferencias de perfil, densidad de lista y visibilidad de tareas completadas.
- Cronómetro por tarea, carga manual y un único timer activo por persona.
- Tarifas horarias por integrante, tiempo facturable y costos históricos.
- Auditoría administrativa por persona, proyecto, período y tipo de tiempo.
- Exportación CSV de reportes restringida a dueños y administradores.
- Actualizaciones optimistas y sincronización con Supabase.
- Modo demostración automático y persistente en el navegador cuando no hay
  credenciales configuradas.
- Diseño responsive inspirado en macOS y Finder.
- PostgreSQL con Row Level Security para aislar datos entre equipos.
- Tests unitarios con Vitest, E2E con Playwright, pgTAP y una suite condicional
  contra un proyecto Supabase real.

## Stack

- Next.js 16 con App Router
- TypeScript
- Tailwind CSS 4
- Supabase Auth + PostgREST
- PostgreSQL
- Lucide Icons

## Ejecutar localmente

Necesitás Node.js 20.9 o superior y pnpm.

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

La aplicación queda disponible en [http://localhost:3000](http://localhost:3000).
Sin variables de Supabase, se abre directamente un espacio de demostración
totalmente interactivo con campañas y entregables de una agencia ficticia.
Los cambios de la demo se conservan en `localStorage` entre recargas.

## Conectar Supabase

1. Creá un proyecto en Supabase.
2. Abrí el SQL Editor y ejecutá, en orden, el contenido de:

   - `supabase/migrations/202607240001_initial_schema.sql`
   - `supabase/migrations/202607240002_full_collaboration.sql`
   - `supabase/migrations/202607240003_time_tracking.sql`
   - `supabase/migrations/202607240004_platform_admins.sql`
   - `supabase/migrations/202607240005_task_start_dates.sql`

3. En Authentication, habilitá Email/Password.
4. Para Google SSO, habilitá Google en Authentication → Providers, copiá allí
   el Client ID y Client Secret de Google Cloud, y configurá en Google la
   callback que muestra Supabase (`https://<project-ref>.supabase.co/auth/v1/callback`).
5. Copiá la URL y la clave pública (`anon`) del proyecto en `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-clave-publica
NEXT_PUBLIC_APP_URL=http://localhost:3000
# Opcional: solo servidor; hace que Auth envíe el email de invitación.
SUPABASE_SECRET_KEY=tu-secret-key
# Sólo servidor: administradores globales separados por comas.
TASKA_PLATFORM_ADMIN_EMAILS=owner@tu-dominio.com
```

Si no configurás `SUPABASE_SECRET_KEY`, la invitación igualmente se crea y la
interfaz permite copiar su enlace. Nunca expongas esa clave con el prefijo
`NEXT_PUBLIC_`.

`TASKA_PLATFORM_ADMIN_EMAILS` define los administradores raíz. Es independiente
de los roles de cada espacio y debe mantenerse como variable de servidor. Desde
el panel se pueden promover otros usuarios a superadministradores persistentes
sin modificar esta variable. El acceso aparece en el menú del perfil.

Al registrarse por primera vez, Taska crea de forma segura una agencia inicial,
tres campañas y algunas tareas de referencia. Las políticas RLS garantizan que
cada persona solo acceda a los equipos de los que forma parte.

Las migraciones agregan las políticas RLS de equipos, invitaciones,
notificaciones, seguimiento de tiempo y objetos del bucket privado
`task-attachments`. Los usuarios comunes sólo leen sus propios registros de
tiempo; dueños y administradores pueden auditar y exportar el espacio completo.

### Supabase local (opcional)

Si tenés Supabase CLI y Docker:

```bash
supabase start
supabase db reset
```

Usá la URL y la `anon key` informadas por `supabase status` en `.env.local`.

## Desplegar en Vercel

1. Subí la carpeta `taska-agency` a un repositorio Git.
2. Importá el repositorio desde Vercel.
3. Vercel detecta Next.js y pnpm automáticamente.
4. Agregá estas variables en Project Settings → Environment Variables:

   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_APP_URL` con el dominio final, por ejemplo
     `https://taska-agency.vercel.app`

5. En Supabase → Authentication → URL Configuration agregá:

   - Site URL: el dominio final de Vercel.
   - Redirect URL: `https://tu-dominio.vercel.app/auth/callback`

6. Desplegá. No se requieren adaptadores ni configuración adicional.

## Comandos

```bash
pnpm dev       # servidor de desarrollo
pnpm lint      # revisión de calidad
pnpm typecheck # validación estricta de TypeScript
pnpm test      # tests unitarios
pnpm test:e2e  # flujos de interfaz en Chromium
pnpm test:supabase # auth + escritura/lectura real (requiere variables de test)
pnpm db:test   # políticas/esquema pgTAP con Supabase local
pnpm build     # build de producción
pnpm start     # ejecutar el build
pnpm check     # TypeScript + lint + build
```

## Estructura principal

```text
app/                     rutas, layout y autenticación
components/              interfaz y flujos de tareas
hooks/                   estado local y sincronización
lib/supabase/            clientes de navegador y servidor
lib/task-repository.ts   acceso a datos
supabase/migrations/     esquema PostgreSQL y políticas RLS
supabase/tests/          tests pgTAP del esquema
tests/e2e/               flujos Playwright
proxy.ts                 renovación y protección de sesiones
```

## Probar contra Supabase real

Usá un proyecto y una cuenta de prueba aislados. La suite crea un espacio,
un proyecto y una tarea, verifica la lectura persistida y elimina el espacio al
terminar:

```env
SUPABASE_TEST_URL=https://tu-proyecto.supabase.co
SUPABASE_TEST_ANON_KEY=tu-clave-publica
SUPABASE_TEST_EMAIL=qa@tu-dominio.com
SUPABASE_TEST_PASSWORD=una-contraseña-de-prueba
```

```bash
pnpm test:supabase
```

Sin estas cuatro variables, el test queda marcado como omitido; los demás tests
se ejecutan normalmente.
