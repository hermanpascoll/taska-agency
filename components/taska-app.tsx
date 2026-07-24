"use client";

import {
  Archive,
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock3,
  Columns3,
  CircleDollarSign,
  Download,
  FileDown,
  FileText,
  GitBranch,
  GripVertical,
  Inbox,
  LayoutDashboard,
  ListFilter,
  ListTodo,
  LogOut,
  Menu,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Pause,
  Play,
  Plus,
  Search,
  Settings,
  Shield,
  SlidersHorizontal,
  Sparkles,
  TimerReset,
  Trash2,
  UserPlus,
  UserRound,
  Users,
  X,
  Zap,
} from "lucide-react";
import {
  type CSSProperties,
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { clsx } from "clsx";
import { useTaskWorkspace } from "@/hooks/use-task-workspace";
import { createClient } from "@/lib/supabase/client";
import {
  buildTimeReportCsv,
  canAuditTimeReports,
  elapsedSeconds,
  formatBytes,
  formatDuration,
  matchesTaskFilters,
  timeEntryCost,
} from "@/lib/task-utils";
import type {
  AdvancedFilters,
  AppNotification,
  AppSettings,
  NewManualTimeEntryInput,
  NewProjectInput,
  NewTaskInput,
  Person,
  Project,
  Task,
  TaskAttachment,
  TaskPriority,
  TaskStatus,
  TeamInvitation,
  TeamRole,
  TimeEntry,
  UpdateProjectInput,
  UpdateTaskInput,
  UpdateWorkspaceInput,
  Workspace,
  WorkspaceMember,
} from "@/lib/types";

type View = "my_tasks" | "all_tasks" | "board";

const statusMeta: Record<
  TaskStatus,
  { label: string; dot: string; surface: string; text: string }
> = {
  nuevo: {
    label: "Por hacer",
    dot: "#6C5CE7",
    surface: "bg-violet-50",
    text: "text-violet-700",
  },
  en_progreso: {
    label: "En curso",
    dot: "#E89732",
    surface: "bg-amber-50",
    text: "text-amber-700",
  },
  esperando: {
    label: "En revisión",
    dot: "#3C8FD5",
    surface: "bg-sky-50",
    text: "text-sky-700",
  },
  resuelto: {
    label: "Aprobado",
    dot: "#2E9B78",
    surface: "bg-emerald-50",
    text: "text-emerald-700",
  },
};

const priorityMeta: Record<
  TaskPriority,
  { label: string; className: string }
> = {
  urgente: {
    label: "Urgente",
    className: "border-rose-200 bg-rose-50 text-rose-700",
  },
  alta: {
    label: "Alta",
    className: "border-orange-200 bg-orange-50 text-orange-700",
  },
  media: {
    label: "Media",
    className: "border-slate-200 bg-slate-50 text-slate-600",
  },
  baja: {
    label: "Baja",
    className: "border-slate-200 bg-white text-slate-500",
  },
};

function Avatar({
  person,
  size = "md",
}: {
  person: Person | null;
  size?: "sm" | "md" | "lg";
}) {
  const sizes = {
    sm: "size-7 text-[10px]",
    md: "size-8 text-[11px]",
    lg: "size-10 text-xs",
  };

  if (!person) {
    return (
      <span
        className={clsx(
          "grid shrink-0 place-items-center rounded-full border border-dashed border-slate-300 bg-slate-50 text-slate-400",
          sizes[size],
        )}
        title="Sin asignar"
      >
        <UserRound className="size-3.5" />
      </span>
    );
  }

  return (
    <span
      className={clsx(
        "grid shrink-0 place-items-center rounded-full font-bold text-white shadow-sm",
        sizes[size],
      )}
      style={{ background: person.color }}
      title={person.name}
    >
      {person.initials}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return (
    <span
      className={clsx(
        "inline-flex rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.05em]",
        priorityMeta[priority].className,
      )}
    >
      {priorityMeta[priority].label}
    </span>
  );
}

function ActiveTimerPill({
  entry,
  onOpen,
  onStop,
}: {
  entry: TimeEntry;
  onOpen: () => void;
  onStop: () => void;
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className="hidden items-center overflow-hidden rounded-lg border border-rose-200 bg-rose-50 shadow-sm md:flex">
      <button
        onClick={onOpen}
        className="focus-ring flex items-center gap-2 px-3 py-2 text-[9px] font-semibold text-rose-700"
      >
        <span className="size-2 animate-pulse rounded-full bg-rose-500" />
        <span className="max-w-28 truncate">{entry.taskCode}</span>
        <span className="font-mono font-bold tabular-nums">
          {formatDuration(elapsedSeconds(entry, now))}
        </span>
      </button>
      <button
        onClick={onStop}
        className="focus-ring border-l border-rose-200 p-2 text-rose-600 hover:bg-rose-100"
        aria-label="Detener timer activo"
      >
        <Pause className="size-3.5 fill-current" />
      </button>
    </div>
  );
}

function Sidebar({
  view,
  onViewChange,
  projects,
  workspaces,
  activeWorkspaceId,
  currentPerson,
  myTaskCount,
  mobileOpen,
  onClose,
  mode,
  onWorkspaceChange,
  onCreateWorkspace,
  onCreateProject,
  onProjectSelect,
  onProjectSettings,
  onSettings,
  onTimeReports,
  canViewTimeReports,
}: {
  view: View;
  onViewChange: (view: View) => void;
  projects: Project[];
  workspaces: Workspace[];
  activeWorkspaceId: string;
  currentPerson: Person | null;
  myTaskCount: number;
  mobileOpen: boolean;
  onClose: () => void;
  mode: "demo" | "supabase";
  onWorkspaceChange: (workspaceId: string) => void;
  onCreateWorkspace: () => void;
  onCreateProject: () => void;
  onProjectSelect: (projectId: string) => void;
  onProjectSettings: (projectId: string) => void;
  onSettings: () => void;
  onTimeReports: () => void;
  canViewTimeReports: boolean;
}) {
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const activeWorkspace =
    workspaces.find((workspace) => workspace.id === activeWorkspaceId) ??
    workspaces[0];
  const nav = [
    { id: "my_tasks" as const, label: "Mis tareas", icon: CheckCircle2 },
    { id: "all_tasks" as const, label: "Todas las tareas", icon: Inbox },
    { id: "board" as const, label: "Tablero", icon: Columns3 },
  ];

  function select(nextView: View) {
    onViewChange(nextView);
    onClose();
  }

  return (
    <>
      {mobileOpen && (
        <button
          className="fixed inset-0 z-40 bg-slate-950/35 lg:hidden"
          onClick={onClose}
          aria-label="Cerrar menú"
        />
      )}
      <aside
        className={clsx(
          "finder-sidebar fixed inset-y-0 left-0 z-50 flex w-[264px] flex-col bg-[#e9ebef]/95 px-4 pb-4 text-slate-800 shadow-[inset_-1px_0_rgba(0,0,0,.08)] backdrop-blur-2xl transition-transform duration-200 lg:static lg:z-auto lg:w-[248px] lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-[76px] items-center justify-between px-2">
          <button
            className="focus-ring flex items-center gap-2.5 rounded-lg"
            onClick={() => select("my_tasks")}
          >
            <span className="grid size-8 place-items-center rounded-[9px] bg-[#0a84ff] shadow-[0_5px_15px_rgba(10,132,255,0.28)]">
              <Zap className="size-[17px] fill-white stroke-[2.4]" />
            </span>
            <span className="text-[19px] font-bold tracking-[-0.02em] text-slate-800">
              taska
            </span>
          </button>
          <button
            onClick={onClose}
            className="focus-ring rounded-lg p-2 text-slate-500 hover:bg-black/5 hover:text-slate-800 lg:hidden"
            aria-label="Cerrar menú"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="relative mb-6">
          <button
            onClick={() => setWorkspaceOpen((current) => !current)}
            className="focus-ring flex w-full items-center gap-3 rounded-xl border border-black/5 bg-white/55 p-2.5 text-left shadow-sm transition hover:bg-white/80"
            aria-expanded={workspaceOpen}
            aria-label="Cambiar espacio de trabajo"
          >
            <span className="grid size-8 place-items-center rounded-lg bg-emerald-400/15 text-xs font-bold text-emerald-300">
              {activeWorkspace?.name.slice(0, 2).toUpperCase() ?? "ES"}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold text-slate-700">
                {activeWorkspace?.name ?? "Espacio de trabajo"}
              </span>
              <span className="mt-0.5 block text-[10px] text-slate-500">
                {activeWorkspace?.memberCount ?? 1}{" "}
                {(activeWorkspace?.memberCount ?? 1) === 1
                  ? "integrante"
                  : "integrantes"}
              </span>
            </span>
            <ChevronDown
              className={clsx(
                "size-3.5 text-slate-400 transition",
                workspaceOpen && "rotate-180",
              )}
            />
          </button>
          {workspaceOpen && (
            <div className="mac-popover absolute inset-x-0 top-[calc(100%+6px)] z-20 rounded-xl border border-black/10 bg-white/95 p-1.5 shadow-xl backdrop-blur-xl">
              {workspaces.filter((workspace) => !workspace.archived).map((workspace) => (
                <button
                  key={workspace.id}
                  onClick={() => {
                    onWorkspaceChange(workspace.id);
                    setWorkspaceOpen(false);
                  }}
                  className={clsx(
                    "focus-ring flex w-full items-center rounded-lg px-3 py-2 text-left text-[11px]",
                    workspace.id === activeWorkspaceId
                      ? "bg-[#0a84ff] font-semibold text-white"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                  )}
                >
                  <span className="truncate">{workspace.name}</span>
                  {workspace.id === activeWorkspaceId && (
                    <Check className="ml-auto size-3.5" />
                  )}
                </button>
              ))}
              <button
                onClick={() => {
                  setWorkspaceOpen(false);
                  onCreateWorkspace();
                }}
                className="focus-ring mt-1 flex w-full items-center gap-2 rounded-lg border-t border-black/5 px-3 py-2.5 text-left text-[11px] font-semibold text-[#0879ea] hover:bg-slate-100"
              >
                <Plus className="size-3.5" />
                Nuevo espacio
              </button>
            </div>
          )}
        </div>

        <nav aria-label="Navegación principal" className="space-y-1">
          <p className="mb-2 px-3 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">
            Espacio de trabajo
          </p>
          {nav.map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            return (
              <button
                key={item.id}
                onClick={() => select(item.id)}
                className={clsx(
                  "focus-ring flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition",
                  active
                    ? "bg-[#0a84ff]/12 text-[#0879ea] shadow-sm"
                    : "text-slate-600 hover:bg-black/[0.045] hover:text-slate-900",
                )}
              >
                <Icon
                  className={clsx(
                    "size-[17px]",
                    active && "text-[#0a84ff]",
                  )}
                />
                {item.label}
                {item.id === "my_tasks" && (
                  <span className="ml-auto rounded-full bg-black/5 px-2 py-0.5 text-[10px] text-slate-500">
                    {myTaskCount}
                  </span>
                )}
              </button>
            );
          })}
          {canViewTimeReports && (
            <button
              onClick={() => {
                onTimeReports();
                onClose();
              }}
              className="focus-ring flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium text-slate-600 transition hover:bg-black/[0.045] hover:text-slate-900"
            >
              <BarChart3 className="size-[17px] text-[#0a84ff]" />
              Reportes de tiempo
            </button>
          )}
        </nav>

        <div className="my-5 h-px bg-black/[0.06]" />

        <div className="min-h-0 flex-1">
          <div className="mb-2 flex items-center justify-between px-3">
            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">
              Campañas
            </p>
            <button
              onClick={onCreateProject}
              className="focus-ring rounded-md p-1 text-slate-400 hover:bg-black/5 hover:text-slate-800"
              aria-label="Crear proyecto"
            >
              <Plus className="size-3.5" />
            </button>
          </div>
          <div className="space-y-0.5">
            {projects.map((project) => (
              <div
                key={project.id}
                className={clsx(
                  "group flex items-center rounded-lg text-slate-600 transition hover:bg-black/[0.045] hover:text-slate-900",
                  project.archived && "opacity-55",
                )}
              >
                <button
                  onClick={() => {
                    onProjectSelect(project.id);
                    onClose();
                  }}
                  className="focus-ring flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2 text-left text-[12px]"
                >
                  {project.archived ? (
                    <Archive className="size-3 text-slate-400" />
                  ) : (
                    <span
                      className="size-2 rounded-[3px]"
                      style={{ background: project.color }}
                    />
                  )}
                  <span className="truncate">{project.name}</span>
                </button>
                <button
                  onClick={() => onProjectSettings(project.id)}
                  className="focus-ring mr-1 rounded-md p-1.5 text-slate-400 opacity-0 hover:bg-white group-hover:opacity-100 focus:opacity-100"
                  aria-label={`Configurar ${project.name}`}
                >
                  <MoreHorizontal className="size-3.5" />
                </button>
              </div>
            ))}
            {projects.length === 0 && (
              <p className="px-3 py-3 text-[10px] leading-5 text-slate-500">
                Este espacio todavía no tiene proyectos.
              </p>
            )}
          </div>
        </div>

        {mode === "demo" && (
          <div className="mb-3 rounded-xl border border-[#0a84ff]/15 bg-[#0a84ff]/8 p-3">
            <div className="flex items-center gap-2 text-[11px] font-semibold text-[#0879ea]">
              <Sparkles className="size-3.5" />
              Espacio de demostración
            </div>
            <p className="mt-1.5 text-[10px] leading-relaxed text-slate-400">
              Conectá Supabase para guardar cambios e invitar a tu equipo.
            </p>
          </div>
        )}

        <div className="flex items-center gap-2 border-t border-black/[0.06] pt-4">
          <Avatar
            person={currentPerson}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[11px] font-semibold">
              {currentPerson?.name ?? "Integrante"}
            </span>
            <span className="block truncate text-[9px] text-slate-500">
              {currentPerson?.role ?? "Equipo creativo"}
            </span>
          </span>
          <button
            onClick={onSettings}
            className="focus-ring rounded-lg p-2 text-slate-400 hover:bg-black/5 hover:text-slate-800"
            aria-label="Configuración"
          >
            <Settings className="size-4" />
          </button>
        </div>
      </aside>
    </>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="grid min-h-[330px] place-items-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 text-center">
      <div>
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-violet-50 text-violet-600">
          <Check className="size-6" />
        </span>
        <h3 className="mt-4 text-base font-bold text-slate-800">
          Todo despejado por acá
        </h3>
        <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-slate-500">
          No hay tareas que coincidan con estos filtros.
        </p>
        <button
          onClick={onCreate}
          className="focus-ring mt-5 rounded-lg bg-[#5b4bec] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#4f40da]"
        >
          Crear una tarea
        </button>
      </div>
    </div>
  );
}

function TaskList({
  tasks,
  onSelect,
  onComplete,
  compact = false,
}: {
  tasks: Task[];
  onSelect: (task: Task) => void;
  onComplete: (task: Task) => void;
  compact?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#e5e7ed] bg-white shadow-[0_1px_2px_rgba(25,32,50,0.03)]">
      <div className="hidden grid-cols-[minmax(300px,1.7fr)_minmax(130px,.7fr)_108px_122px_54px] items-center border-b border-slate-100 bg-[#fafbfc] px-5 py-3 text-[9px] font-bold uppercase tracking-[0.11em] text-slate-400 md:grid">
        <span>Tarea</span>
        <span>Responsable</span>
        <span>Prioridad</span>
        <span>Vencimiento</span>
        <span />
      </div>

      {tasks.map((task) => (
        <article
          key={task.id}
          className="group border-b border-slate-100 last:border-b-0"
        >
          <div
            className={clsx(
              "hidden grid-cols-[minmax(300px,1.7fr)_minmax(130px,.7fr)_108px_122px_54px] items-center px-5 transition hover:bg-[#f2f7ff] md:grid",
              compact ? "py-2" : "py-3.5",
            )}
          >
            <div className="flex min-w-0 items-center gap-3">
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  onComplete(task);
                }}
                className={clsx(
                  "focus-ring grid size-[22px] shrink-0 place-items-center rounded-full border-2 transition",
                  task.status === "resuelto"
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : "border-slate-300 text-transparent hover:border-emerald-500 hover:text-emerald-500",
                )}
                aria-label={
                  task.status === "resuelto"
                    ? `Reabrir ${task.title}`
                    : `Completar ${task.title}`
                }
              >
                <Check className="size-3.5 stroke-[3]" />
              </button>
              <button
                onClick={() => onSelect(task)}
                className="focus-ring min-w-0 rounded-md text-left"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-slate-400">
                    {task.code}
                  </span>
                  <span
                    className="size-1.5 rounded-full"
                    style={{ background: task.project.color }}
                  />
                  <span className="truncate text-[10px] font-medium text-slate-400">
                    {task.project.name}
                  </span>
                </div>
                <h3
                  className={clsx(
                    "mt-1 truncate text-[13px] font-semibold text-slate-800 transition group-hover:text-[#5545e2]",
                    task.status === "resuelto" &&
                      "text-slate-400 line-through decoration-slate-300",
                  )}
                >
                  {task.title}
                </h3>
              </button>
            </div>
            <div className="flex items-center gap-2">
              <Avatar person={task.assignee} size="sm" />
              <span className="truncate text-[11px] font-medium text-slate-600">
                {task.assignee?.name.split(" ")[0] ?? "Sin asignar"}
              </span>
            </div>
            <PriorityBadge priority={task.priority} />
            <span
              className={clsx(
                "flex items-center gap-1.5 text-[11px] font-medium",
                task.dueLabel.startsWith("Hoy") &&
                  task.status !== "resuelto"
                  ? "text-rose-600"
                  : "text-slate-500",
              )}
            >
              <CalendarDays className="size-3.5" />
              {task.dueLabel}
            </span>
            <button
              onClick={() => onSelect(task)}
              className="focus-ring justify-self-end rounded-lg p-2 text-slate-300 opacity-0 transition hover:bg-slate-100 hover:text-slate-600 group-hover:opacity-100 focus:opacity-100"
              aria-label={`Abrir ${task.title}`}
            >
              <MoreHorizontal className="size-4" />
            </button>
          </div>

          <button
            onClick={() => onSelect(task)}
            className="focus-ring block w-full p-4 text-left md:hidden"
          >
            <div className="flex items-start gap-3">
              <span
                className="mt-1 size-2 shrink-0 rounded-full"
                style={{ background: statusMeta[task.status].dot }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[10px] font-bold text-slate-400">
                    {task.code} · {task.project.name}
                  </span>
                  <Avatar person={task.assignee} size="sm" />
                </div>
                <h3 className="mt-1 text-sm font-semibold leading-snug text-slate-800">
                  {task.title}
                </h3>
                <div className="mt-3 flex items-center gap-2">
                  <PriorityBadge priority={task.priority} />
                  <span className="flex items-center gap-1 text-[10px] text-slate-500">
                    <CalendarDays className="size-3" />
                    {task.dueLabel}
                  </span>
                  {task.comments.length > 0 && (
                    <span className="ml-auto flex items-center gap-1 text-[10px] text-slate-400">
                      <MessageSquare className="size-3" />
                      {task.comments.length}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </button>
        </article>
      ))}
    </div>
  );
}

function KanbanBoard({
  tasks,
  onSelect,
  onMove,
  onCreate,
}: {
  tasks: Task[];
  onSelect: (task: Task) => void;
  onMove: (taskId: string, status: TaskStatus) => void;
  onCreate: (status: TaskStatus) => void;
}) {
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [overStatus, setOverStatus] = useState<TaskStatus | null>(null);
  const statuses: TaskStatus[] = [
    "nuevo",
    "en_progreso",
    "esperando",
    "resuelto",
  ];

  return (
    <div className="soft-scrollbar -mx-4 overflow-x-auto px-4 pb-3 sm:-mx-7 sm:px-7 lg:-mx-9 lg:px-9">
      <div className="grid min-w-[980px] grid-cols-4 gap-4">
        {statuses.map((status) => {
          const columnTasks = tasks.filter((task) => task.status === status);
          const meta = statusMeta[status];
          return (
            <section key={status} aria-label={meta.label}>
              <div className="mb-3 flex items-center px-1">
                <span
                  className="size-2 rounded-full"
                  style={{ background: meta.dot }}
                />
                <h3 className="ml-2 text-[12px] font-bold text-slate-700">
                  {meta.label}
                </h3>
                <span className="ml-2 rounded-full bg-slate-200/70 px-2 py-0.5 text-[9px] font-bold text-slate-500">
                  {columnTasks.length}
                </span>
                <button
                  onClick={() => onCreate(status)}
                  className="focus-ring ml-auto rounded-md p-1 text-slate-400 hover:bg-slate-200"
                  aria-label={`Agregar en ${meta.label}`}
                >
                  <Plus className="size-3.5" />
                </button>
              </div>
              <div
                data-testid={`kanban-column-${status}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setOverStatus(status);
                }}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                    setOverStatus(null);
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const taskId =
                    event.dataTransfer.getData("text/task-id") || draggedTaskId;
                  if (taskId) onMove(taskId, status);
                  setDraggedTaskId(null);
                  setOverStatus(null);
                }}
                className={clsx(
                  "min-h-28 space-y-3 rounded-xl bg-[#eef0f4]/85 p-2.5 transition",
                  overStatus === status &&
                    "bg-[#dcecff] ring-2 ring-[#0a84ff]/35 ring-inset",
                )}
              >
                {columnTasks.map((task) => (
                  <article
                    key={task.id}
                    draggable
                    data-testid={`kanban-card-${task.id}`}
                    onDragStart={(event) => {
                      setDraggedTaskId(task.id);
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/task-id", task.id);
                    }}
                    onDragEnd={() => {
                      setDraggedTaskId(null);
                      setOverStatus(null);
                    }}
                    className={clsx(
                      "group cursor-grab rounded-xl border border-white bg-white p-3.5 shadow-[0_1px_3px_rgba(23,32,51,0.07)] transition active:cursor-grabbing hover:-translate-y-0.5 hover:shadow-[0_7px_20px_rgba(23,32,51,0.09)]",
                      draggedTaskId === task.id && "opacity-45",
                    )}
                  >
                    <button
                      onClick={() => onSelect(task)}
                      className="focus-ring w-full rounded-lg text-left"
                    >
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1 text-[9px] font-bold text-slate-400">
                          <GripVertical className="size-3 opacity-50" />
                          {task.code}
                        </span>
                        <PriorityBadge priority={task.priority} />
                      </div>
                      <h4 className="mt-2 text-[12px] font-semibold leading-[1.45] text-slate-800 group-hover:text-[#5545e2]">
                        {task.title}
                      </h4>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {task.tags.slice(0, 2).map((tag) => (
                          <span
                            key={tag}
                            className="rounded-md bg-slate-100 px-2 py-1 text-[9px] font-medium text-slate-500"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                      <div className="mt-3.5 flex items-center border-t border-slate-100 pt-3">
                        <Avatar person={task.assignee} size="sm" />
                        <span
                          className={clsx(
                            "ml-2 flex items-center gap-1 text-[9px] font-medium",
                            task.dueLabel.startsWith("Hoy") &&
                              status !== "resuelto"
                              ? "text-rose-600"
                              : "text-slate-400",
                          )}
                        >
                          <Clock3 className="size-3" />
                          {task.dueLabel}
                        </span>
                        {task.comments.length > 0 && (
                          <span className="ml-auto flex items-center gap-1 text-[9px] text-slate-400">
                            <MessageSquare className="size-3" />
                            {task.comments.length}
                          </span>
                        )}
                      </div>
                    </button>
                    <label className="mt-3 block border-t border-slate-100 pt-2">
                      <span className="sr-only">Cambiar estado</span>
                      <select
                        value={task.status}
                        onChange={(event) =>
                          onMove(task.id, event.target.value as TaskStatus)
                        }
                        className="focus-ring w-full rounded-md border-0 bg-transparent py-1 text-[9px] font-semibold text-slate-400 hover:bg-slate-50"
                      >
                        {statuses.map((option) => (
                          <option key={option} value={option}>
                            Mover a {statusMeta[option].label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </article>
                ))}
                {columnTasks.length === 0 && (
                  <div className="grid min-h-24 place-items-center rounded-lg border border-dashed border-slate-300 text-[10px] text-slate-400">
                    Sin tareas
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function TaskTimerSection({
  task,
  entries,
  activeEntry,
  currency,
  canTrack,
  canAudit,
  currentUserId,
  onStart,
  onStop,
  onManualCreate,
  onDelete,
}: {
  task: Task;
  entries: TimeEntry[];
  activeEntry: TimeEntry | null;
  currency: string;
  canTrack: boolean;
  canAudit: boolean;
  currentUserId: string;
  onStart: (description: string, billable: boolean) => void;
  onStop: (entryId: string) => void;
  onManualCreate: (input: NewManualTimeEntryInput) => void;
  onDelete: (entryId: string) => void;
}) {
  const [now, setNow] = useState(() => new Date());
  const [description, setDescription] = useState("");
  const [billable, setBillable] = useState(true);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualDate, setManualDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [manualHours, setManualHours] = useState("1");
  const [manualMinutes, setManualMinutes] = useState("0");
  const [manualDescription, setManualDescription] = useState("");
  const activeOnThisTask =
    activeEntry?.taskId === task.id ? activeEntry : null;

  useEffect(() => {
    if (!activeEntry) return;
    const interval = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, [activeEntry]);

  const totalSeconds = entries.reduce(
    (total, entry) => total + elapsedSeconds(entry, now),
    0,
  );
  const totalCost = entries.reduce(
    (total, entry) => total + timeEntryCost(entry, now),
    0,
  );

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">
          <TimerReset className="size-3.5" />
          Tiempo y costo
        </h3>
        <span className="font-mono text-[11px] font-bold tabular-nums text-slate-600">
          {formatDuration(totalSeconds)}
        </span>
      </div>
      <div className="mt-3 rounded-2xl border border-[#0a84ff]/15 bg-[linear-gradient(145deg,rgba(10,132,255,.08),rgba(255,255,255,.8))] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <input
              value={description}
              disabled={!canTrack}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="¿En qué estás trabajando?"
              className="mac-input focus-ring w-full rounded-lg border border-white/80 bg-white/85 px-3 py-2.5 text-[11px]"
            />
            <label className="mt-2 flex w-fit items-center gap-2 text-[9px] font-medium text-slate-500">
              <input
                type="checkbox"
                checked={billable}
                disabled={!canTrack}
                onChange={(event) => setBillable(event.target.checked)}
                className="size-3.5 accent-[#0a84ff]"
              />
              Tiempo facturable
            </label>
          </div>
          {activeOnThisTask ? (
            <button
              onClick={() => onStop(activeOnThisTask.id)}
              aria-label="Detener timer de la tarea"
              className="focus-ring flex min-w-32 items-center justify-center gap-2 rounded-xl bg-rose-500 px-4 py-3 text-[11px] font-bold text-white shadow-[0_6px_18px_rgba(244,63,94,.24)]"
            >
              <Pause className="size-4 fill-current" />
              {formatDuration(elapsedSeconds(activeOnThisTask, now))}
            </button>
          ) : (
            <button
              disabled={!canTrack}
              onClick={() => onStart(description, billable)}
              className="mac-button-primary focus-ring flex min-w-32 items-center justify-center gap-2 rounded-xl px-4 py-3 text-[11px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Play className="size-4 fill-current" />
              Iniciar timer
            </button>
          )}
        </div>
        {activeEntry && !activeOnThisTask && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[9px] leading-4 text-amber-700">
            Hay un timer activo en {activeEntry.taskCode}. Al iniciar éste, el
            anterior se detendrá automáticamente.
          </p>
        )}
        {!canTrack && (
          <p className="mt-3 text-[9px] text-slate-500">
            Los perfiles de solo lectura no pueden registrar tiempo.
          </p>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <p className="text-[10px] text-slate-400">
          {entries.length} {entries.length === 1 ? "registro" : "registros"} ·{" "}
          {currency} {totalCost.toFixed(2)} facturables
        </p>
        {canTrack && (
          <button
            onClick={() => setManualOpen((current) => !current)}
            className="focus-ring rounded-md px-2 py-1 text-[9px] font-semibold text-[#0879ea] hover:bg-[#0a84ff]/10"
          >
            {manualOpen ? "Cancelar carga manual" : "Agregar tiempo manual"}
          </button>
        )}
      </div>

      {manualOpen && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const durationSeconds =
              (Number(manualHours) * 60 + Number(manualMinutes)) * 60;
            if (durationSeconds <= 0) return;
            onManualCreate({
              taskId: task.id,
              description: manualDescription,
              date: manualDate,
              durationSeconds,
              billable,
            });
            setManualOpen(false);
            setManualDescription("");
          }}
          className="mt-3 grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[1fr_118px_70px_70px_auto]"
        >
          <input
            value={manualDescription}
            onChange={(event) => setManualDescription(event.target.value)}
            placeholder="Descripción"
            className="mac-input focus-ring min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[10px]"
          />
          <input
            type="date"
            value={manualDate}
            onChange={(event) => setManualDate(event.target.value)}
            className="mac-input focus-ring rounded-lg border border-slate-200 bg-white px-2 py-2 text-[9px]"
          />
          <input
            type="number"
            min="0"
            max="24"
            value={manualHours}
            onChange={(event) => setManualHours(event.target.value)}
            aria-label="Horas"
            className="mac-input focus-ring rounded-lg border border-slate-200 bg-white px-2 py-2 text-[10px]"
          />
          <input
            type="number"
            min="0"
            max="59"
            value={manualMinutes}
            onChange={(event) => setManualMinutes(event.target.value)}
            aria-label="Minutos"
            className="mac-input focus-ring rounded-lg border border-slate-200 bg-white px-2 py-2 text-[10px]"
          />
          <button className="mac-button-primary focus-ring rounded-lg px-3 py-2 text-[9px] font-bold text-white">
            Guardar
          </button>
        </form>
      )}

      <div className="mt-3 space-y-2">
        {entries.slice(0, 8).map((entry) => (
          <div
            key={entry.id}
            className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3"
          >
            <Avatar person={entry.user} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[10px] font-semibold text-slate-700">
                {entry.description || "Trabajo en la tarea"}
              </span>
              <span className="mt-0.5 block text-[9px] text-slate-400">
                {entry.user.name} ·{" "}
                {new Intl.DateTimeFormat("es-UY", {
                  day: "numeric",
                  month: "short",
                }).format(new Date(entry.startedAt))}
                {entry.billable ? " · Facturable" : " · Interno"}
              </span>
            </span>
            <span className="text-right">
              <span className="block font-mono text-[10px] font-bold tabular-nums text-slate-700">
                {formatDuration(elapsedSeconds(entry, now))}
              </span>
              <span className="block text-[8px] text-slate-400">
                {currency} {timeEntryCost(entry, now).toFixed(2)}
              </span>
            </span>
            {(canAudit || entry.user.id === currentUserId) && (
              <button
                onClick={() => onDelete(entry.id)}
                className="focus-ring rounded-md p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-600"
                aria-label="Eliminar registro de tiempo"
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </div>
        ))}
        {entries.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-[10px] text-slate-400">
            Todavía no se registró tiempo en esta tarea.
          </p>
        )}
      </div>
    </section>
  );
}

function TaskDrawer({
  task,
  parentTask,
  subtasks,
  timeEntries,
  activeTimeEntry,
  people,
  currentPerson,
  currentUserId,
  currency,
  canTrackTime,
  canAuditTime,
  onClose,
  onTaskUpdate,
  onTaskDelete,
  onTaskSelect,
  onComment,
  onCommentDelete,
  onSubtaskCreate,
  onSubtaskUpdate,
  onAttachmentUpload,
  onAttachmentDelete,
  onAttachmentOpen,
  onTimerStart,
  onTimerStop,
  onManualTimeCreate,
  onTimeEntryDelete,
}: {
  task: Task;
  parentTask: Task | null;
  subtasks: Task[];
  timeEntries: TimeEntry[];
  activeTimeEntry: TimeEntry | null;
  people: Person[];
  currentPerson: Person | null;
  currentUserId: string;
  currency: string;
  canTrackTime: boolean;
  canAuditTime: boolean;
  onClose: () => void;
  onTaskUpdate: (input: UpdateTaskInput) => void;
  onTaskDelete: () => void;
  onTaskSelect: (taskId: string) => void;
  onComment: (body: string) => void;
  onCommentDelete: (commentId: string) => void;
  onSubtaskCreate: (title: string, assigneeId: string) => void;
  onSubtaskUpdate: (taskId: string, input: UpdateTaskInput) => void;
  onAttachmentUpload: (file: File) => void;
  onAttachmentDelete: (attachment: TaskAttachment) => void;
  onAttachmentOpen: (attachment: TaskAttachment) => void;
  onTimerStart: (description: string, billable: boolean) => void;
  onTimerStop: (entryId: string) => void;
  onManualTimeCreate: (input: NewManualTimeEntryInput) => void;
  onTimeEntryDelete: (entryId: string) => void;
}) {
  const [comment, setComment] = useState("");
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [subtaskAssigneeId, setSubtaskAssigneeId] = useState(
    task.assignee?.id ?? currentPerson?.id ?? "",
  );
  const attachmentInput = useRef<HTMLInputElement>(null);

  function submitComment(event: FormEvent) {
    event.preventDefault();
    const body = comment.trim();
    if (!body) return;
    onComment(body);
    setComment("");
  }

  function submitSubtask(event: FormEvent) {
    event.preventDefault();
    const title = subtaskTitle.trim();
    if (!title) return;
    onSubtaskCreate(title, subtaskAssigneeId);
    setSubtaskTitle("");
  }

  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <button
        className="absolute inset-0 bg-slate-950/30 backdrop-blur-[1px]"
        onClick={onClose}
        aria-label="Cerrar detalle"
      />
      <aside className="animate-drawer relative flex h-full w-full max-w-[620px] flex-col bg-white shadow-[-24px_0_60px_rgba(15,23,42,0.16)]">
        <header className="flex h-16 shrink-0 items-center border-b border-slate-100 px-5 sm:px-7">
          <button
            onClick={() =>
              onTaskUpdate({
                status:
                  task.status === "resuelto" ? "en_progreso" : "resuelto",
              })
            }
            className={clsx(
              "focus-ring flex items-center gap-2 rounded-lg border px-3 py-2 text-[11px] font-semibold transition",
              task.status === "resuelto"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-slate-200 text-slate-600 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700",
            )}
          >
            <CheckCircle2 className="size-4" />
            {task.status === "resuelto" ? "Aprobada" : "Marcar aprobada"}
          </button>
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={onTaskDelete}
              className="focus-ring rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
              aria-label="Eliminar tarea"
            >
              <Trash2 className="size-[18px]" />
            </button>
            <button
              onClick={onClose}
              className="focus-ring rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Cerrar"
            >
              <X className="size-5" />
            </button>
          </div>
        </header>

        <div className="soft-scrollbar flex-1 overflow-y-auto px-5 py-6 sm:px-8">
          <div className="flex items-center gap-2">
            {parentTask && (
              <>
                <button
                  onClick={() => onTaskSelect(parentTask.id)}
                  className="focus-ring rounded-md text-[10px] font-semibold text-[#0879ea] hover:underline"
                >
                  {parentTask.code}
                </button>
                <span className="text-slate-300">›</span>
              </>
            )}
            <span className="text-[10px] font-bold tracking-[0.04em] text-slate-400">
              {task.code}
            </span>
            <span className="text-slate-300">/</span>
            <span className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500">
              <span
                className="size-1.5 rounded-full"
                style={{ background: task.project.color }}
              />
              {task.project.name}
            </span>
          </div>
          <h2 className="mt-3">
            <input
              key={task.id}
              defaultValue={task.title}
              onBlur={(event) => {
                const title = event.target.value.trim();
                if (title.length >= 2 && title !== task.title) {
                  onTaskUpdate({ title });
                }
              }}
              className="focus-ring w-full rounded-lg border border-transparent bg-transparent px-1 py-1 text-[23px] font-bold leading-tight tracking-[-0.025em] text-slate-900 hover:border-slate-200 focus:border-violet-200 sm:text-[27px]"
              aria-label="Título de la tarea"
            />
          </h2>

          <div className="mt-7 grid grid-cols-[112px_1fr] gap-y-4 text-[12px]">
            <span className="flex items-center gap-2 text-slate-400">
              <Circle className="size-3.5" />
              Estado
            </span>
            <select
              value={task.status}
              onChange={(event) =>
                onTaskUpdate({ status: event.target.value as TaskStatus })
              }
              className="focus-ring w-fit rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-semibold text-slate-700"
            >
              {(Object.keys(statusMeta) as TaskStatus[]).map((status) => (
                <option value={status} key={status}>
                  {statusMeta[status].label}
                </option>
              ))}
            </select>

            <span className="flex items-center gap-2 text-slate-400">
              <Building2 className="size-3.5" />
              Cliente
            </span>
            <span className="font-semibold text-slate-700">{task.client}</span>

            <span className="flex items-center gap-2 text-slate-400">
              <UserRound className="size-3.5" />
              Responsable
            </span>
            <label className="flex items-center gap-2">
              <Avatar person={task.assignee} size="sm" />
              <select
                value={task.assignee?.id ?? ""}
                onChange={(event) =>
                  onTaskUpdate({ assigneeId: event.target.value || null })
                }
                className="focus-ring min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-semibold text-slate-700"
                aria-label="Responsable"
              >
                <option value="">Sin asignar</option>
                {people.map((person) => (
                  <option value={person.id} key={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </label>

            <span className="flex items-center gap-2 text-slate-400">
              <ListFilter className="size-3.5" />
              Prioridad
            </span>
            <select
              value={task.priority}
              onChange={(event) =>
                onTaskUpdate({
                  priority: event.target.value as TaskPriority,
                })
              }
              className="focus-ring w-fit rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-semibold text-slate-700"
              aria-label="Prioridad"
            >
              {(Object.keys(priorityMeta) as TaskPriority[]).map((item) => (
                <option value={item} key={item}>
                  {priorityMeta[item].label}
                </option>
              ))}
            </select>

            <span className="flex items-center gap-2 text-slate-400">
              <CalendarDays className="size-3.5" />
              Vencimiento
            </span>
            <input
              type="date"
              value={task.dueDate ?? ""}
              onChange={(event) =>
                onTaskUpdate({ dueDate: event.target.value || null })
              }
              className="focus-ring w-fit rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-semibold text-slate-700"
              aria-label="Fecha de vencimiento"
            />
          </div>

          <div className="my-7 h-px bg-slate-100" />

          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">
              Descripción
            </h3>
            <textarea
              key={`${task.id}-description`}
              defaultValue={task.description}
              onBlur={(event) => {
                const description = event.target.value.trim();
                if (description !== task.description) {
                  onTaskUpdate({ description });
                }
              }}
              placeholder="Esta tarea todavía no tiene descripción."
              className="focus-ring mt-3 min-h-20 w-full resize-y rounded-xl border border-transparent bg-transparent p-2 text-[13px] leading-6 text-slate-600 hover:border-slate-200 focus:border-violet-200"
              aria-label="Descripción de la tarea"
            />
            {task.tags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {task.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[10px] font-semibold text-slate-500"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </section>

          <TaskTimerSection
            task={task}
            entries={timeEntries}
            activeEntry={activeTimeEntry}
            currency={currency}
            canTrack={canTrackTime}
            canAudit={canAuditTime}
            currentUserId={currentUserId}
            onStart={onTimerStart}
            onStop={onTimerStop}
            onManualCreate={onManualTimeCreate}
            onDelete={onTimeEntryDelete}
          />

          <section className="mt-8">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">
                <Paperclip className="size-3.5" />
                Adjuntos
              </h3>
              <button
                onClick={() => attachmentInput.current?.click()}
                className="focus-ring flex items-center gap-1.5 rounded-lg bg-[#0a84ff]/10 px-2.5 py-1.5 text-[10px] font-semibold text-[#0879ea] hover:bg-[#0a84ff]/15"
              >
                <Plus className="size-3.5" />
                Adjuntar
              </button>
              <input
                ref={attachmentInput}
                type="file"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) onAttachmentUpload(file);
                  event.target.value = "";
                }}
              />
            </div>
            <div className="mt-3 space-y-2">
              {task.attachments.map((attachment) => (
                <div
                  key={attachment.id}
                  className="group flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white text-[#0a84ff] shadow-sm">
                    <FileText className="size-4" />
                  </span>
                  <button
                    onClick={() => onAttachmentOpen(attachment)}
                    className="focus-ring min-w-0 flex-1 rounded-md text-left"
                  >
                    <span className="block truncate text-[11px] font-semibold text-slate-700">
                      {attachment.name}
                    </span>
                    <span className="mt-0.5 block text-[9px] text-slate-400">
                      {formatBytes(attachment.size)} · {attachment.uploader.name}
                    </span>
                  </button>
                  <button
                    onClick={() => onAttachmentOpen(attachment)}
                    className="focus-ring rounded-md p-1.5 text-slate-400 hover:bg-white hover:text-[#0879ea]"
                    aria-label={`Descargar ${attachment.name}`}
                  >
                    <Download className="size-3.5" />
                  </button>
                  <button
                    onClick={() => onAttachmentDelete(attachment)}
                    className="focus-ring rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    aria-label={`Eliminar ${attachment.name}`}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
              {task.attachments.length === 0 && (
                <button
                  onClick={() => attachmentInput.current?.click()}
                  className="focus-ring w-full rounded-xl border border-dashed border-slate-200 p-4 text-center text-[10px] text-slate-400 hover:border-[#0a84ff]/40 hover:bg-[#0a84ff]/5 hover:text-[#0879ea]"
                >
                  Arrastrá el contexto al equipo con archivos de hasta 10 MB.
                </button>
              )}
            </div>
          </section>

          <section className="mt-8">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">
                <GitBranch className="size-3.5" />
                Subtareas
              </h3>
              <span className="text-[10px] text-slate-400">
                {subtasks.filter((item) => item.status === "resuelto").length}/
                {subtasks.length} completas
              </span>
            </div>
            <div className="mt-3 space-y-2">
              {subtasks.map((subtask) => (
                <div
                  key={subtask.id}
                  className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3"
                >
                  <button
                    onClick={() =>
                      onSubtaskUpdate(subtask.id, {
                        status:
                          subtask.status === "resuelto"
                            ? "en_progreso"
                            : "resuelto",
                      })
                    }
                    className={clsx(
                      "focus-ring grid size-5 shrink-0 place-items-center rounded-full border-2",
                      subtask.status === "resuelto"
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : "border-slate-300 text-transparent hover:border-emerald-500",
                    )}
                    aria-label={
                      subtask.status === "resuelto"
                        ? `Reabrir ${subtask.title}`
                        : `Completar ${subtask.title}`
                    }
                  >
                    <Check className="size-3 stroke-[3]" />
                  </button>
                  <button
                    onClick={() => onTaskSelect(subtask.id)}
                    className="focus-ring min-w-0 flex-1 rounded-md text-left"
                  >
                    <p
                      className={clsx(
                        "truncate text-[11px] font-semibold text-slate-700",
                        subtask.status === "resuelto" &&
                          "text-slate-400 line-through",
                      )}
                    >
                      {subtask.title}
                    </p>
                    <p className="mt-0.5 text-[9px] text-slate-400">
                      {subtask.assignee?.name ?? "Sin asignar"} ·{" "}
                      {subtask.dueLabel}
                    </p>
                  </button>
                  <Avatar person={subtask.assignee} size="sm" />
                </div>
              ))}
              {subtasks.length === 0 && (
                <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-[10px] text-slate-400">
                  Dividí el trabajo en pasos pequeños y asignables.
                </p>
              )}
            </div>
            <form
              onSubmit={submitSubtask}
              className="mt-3 grid gap-2 rounded-xl border border-slate-200 p-2 sm:grid-cols-[1fr_150px_auto]"
            >
              <input
                value={subtaskTitle}
                onChange={(event) => setSubtaskTitle(event.target.value)}
                placeholder="Nueva subtarea…"
                className="focus-ring min-w-0 rounded-lg border-0 bg-slate-50 px-3 py-2 text-[11px] text-slate-700"
                aria-label="Nombre de la subtarea"
              />
              <select
                value={subtaskAssigneeId}
                onChange={(event) => setSubtaskAssigneeId(event.target.value)}
                className="focus-ring min-w-0 rounded-lg border border-slate-100 bg-white px-2 py-2 text-[10px] text-slate-600"
                aria-label="Responsable de la subtarea"
              >
                <option value="">Sin asignar</option>
                {people.map((person) => (
                  <option value={person.id} key={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
              <button
                disabled={!subtaskTitle.trim()}
                className="focus-ring rounded-lg bg-violet-50 px-3 py-2 text-[10px] font-bold text-violet-700 disabled:opacity-40"
              >
                Agregar
              </button>
            </form>
          </section>

          <section className="mt-8">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">
                Actividad
              </h3>
              <span className="text-[10px] text-slate-400">
                {task.comments.length} comentarios
              </span>
            </div>
            <div className="mt-4 space-y-5">
              {task.comments.map((item) => (
                <div key={item.id} className="flex gap-3">
                  <Avatar person={item.author} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center">
                      <p className="text-[11px]">
                        <span className="font-bold text-slate-700">
                          {item.author.name}
                        </span>
                        <span className="ml-2 text-[9px] text-slate-400">
                          {item.createdAt}
                        </span>
                      </p>
                      <button
                        onClick={() => onCommentDelete(item.id)}
                        className="focus-ring ml-auto rounded-md p-1 text-slate-300 hover:bg-rose-50 hover:text-rose-600"
                        aria-label="Eliminar comentario"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                    <p className="mt-1.5 rounded-xl rounded-tl-sm bg-slate-50 p-3 text-[12px] leading-5 text-slate-600">
                      {item.body}
                    </p>
                  </div>
                </div>
              ))}
              {task.comments.length === 0 && (
                <p className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-[11px] text-slate-400">
                  Todavía no hay comentarios. Sumá el primero para dejar
                  contexto al equipo.
                </p>
              )}
            </div>
          </section>
        </div>

        <form
          onSubmit={submitComment}
          className="shrink-0 border-t border-slate-100 bg-white p-4 sm:px-7"
        >
          <div className="flex items-start gap-3">
            <Avatar person={currentPerson} size="sm" />
            <div className="flex-1 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm focus-within:border-violet-300 focus-within:ring-4 focus-within:ring-violet-100">
              <textarea
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Sumá feedback o una actualización…"
                className="min-h-14 w-full resize-none border-0 bg-transparent px-1 text-[12px] text-slate-700 outline-none placeholder:text-slate-400"
              />
              <div className="flex justify-end">
                <button
                  disabled={!comment.trim()}
                  className="focus-ring rounded-lg bg-[#5b4bec] px-3.5 py-2 text-[10px] font-bold text-white transition hover:bg-[#4f40da] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Comentar
                </button>
              </div>
            </div>
          </div>
        </form>
      </aside>
    </div>
  );
}

function NewTaskModal({
  projects,
  people,
  defaultStatus,
  onClose,
  onCreate,
}: {
  projects: Project[];
  people: Person[];
  defaultStatus: TaskStatus;
  onClose: () => void;
  onCreate: (task: NewTaskInput) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [status, setStatus] = useState<TaskStatus>(defaultStatus);
  const [priority, setPriority] = useState<TaskPriority>("media");
  const [assigneeId, setAssigneeId] = useState(people[0]?.id ?? "");
  const [client, setClient] = useState("");
  const [dueDate, setDueDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().slice(0, 10);
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    onCreate({
      title: title.trim(),
      description: description.trim(),
      projectId,
      status,
      priority,
      assigneeId,
      client: client.trim(),
      dueDate,
    });
  }

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center p-3 sm:p-6">
      <button
        className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="Cerrar"
      />
      <form
        onSubmit={submit}
        className="animate-enter soft-scrollbar relative max-h-[94vh] w-full max-w-[610px] overflow-y-auto rounded-2xl bg-white shadow-[0_28px_80px_rgba(15,23,42,0.25)]"
      >
        <header className="flex items-center border-b border-slate-100 px-5 py-4 sm:px-7">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-violet-600">
              Nueva tarea
            </p>
            <h2 className="mt-1 text-lg font-bold tracking-[-0.02em] text-slate-900">
              ¿Qué hay que producir?
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="focus-ring ml-auto rounded-lg p-2 text-slate-400 hover:bg-slate-100"
            aria-label="Cerrar"
          >
            <X className="size-5" />
          </button>
        </header>

        <div className="space-y-5 px-5 py-6 sm:px-7">
          <label className="block">
            <span className="mb-2 block text-[11px] font-bold text-slate-600">
              Nombre de la tarea
            </span>
            <input
              autoFocus
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Ej. Adaptar la campaña a formato reels"
              className="focus-ring w-full rounded-xl border border-slate-200 px-4 py-3 text-[13px] text-slate-800 placeholder:text-slate-400"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-[11px] font-bold text-slate-600">
              Descripción
            </span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Agregá el brief, los formatos y el resultado esperado…"
              className="focus-ring min-h-24 w-full resize-none rounded-xl border border-slate-200 px-4 py-3 text-[13px] leading-relaxed text-slate-800 placeholder:text-slate-400"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className="mb-2 block text-[11px] font-bold text-slate-600">
                Campaña
              </span>
              <select
                required
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
                className="focus-ring w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-[12px] text-slate-700"
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="mb-2 block text-[11px] font-bold text-slate-600">
                Estado
              </span>
              <select
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as TaskStatus)
                }
                className="focus-ring w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-[12px] text-slate-700"
              >
                {(Object.keys(statusMeta) as TaskStatus[]).map((item) => (
                  <option key={item} value={item}>
                    {statusMeta[item].label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="mb-2 block text-[11px] font-bold text-slate-600">
                Prioridad
              </span>
              <select
                value={priority}
                onChange={(event) =>
                  setPriority(event.target.value as TaskPriority)
                }
                className="focus-ring w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-[12px] text-slate-700"
              >
                {(Object.keys(priorityMeta) as TaskPriority[]).map((item) => (
                  <option key={item} value={item}>
                    {priorityMeta[item].label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="mb-2 block text-[11px] font-bold text-slate-600">
                Responsable
              </span>
              <select
                value={assigneeId}
                onChange={(event) => setAssigneeId(event.target.value)}
                className="focus-ring w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-[12px] text-slate-700"
              >
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="mb-2 block text-[11px] font-bold text-slate-600">
                Fecha de entrega
              </span>
              <input
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                className="focus-ring w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-[12px] text-slate-700"
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-2 block text-[11px] font-bold text-slate-600">
              Cliente
            </span>
            <input
              value={client}
              onChange={(event) => setClient(event.target.value)}
              placeholder="Marca o contacto que solicitó el trabajo"
              className="focus-ring w-full rounded-xl border border-slate-200 px-4 py-3 text-[13px] text-slate-800 placeholder:text-slate-400"
            />
          </label>
        </div>

        <footer className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50/70 px-5 py-4 sm:px-7">
          <button
            type="button"
            onClick={onClose}
            className="focus-ring rounded-lg px-4 py-2.5 text-[11px] font-semibold text-slate-500 hover:bg-white"
          >
            Cancelar
          </button>
          <button className="focus-ring flex items-center gap-2 rounded-lg bg-[#5b4bec] px-4 py-2.5 text-[11px] font-bold text-white shadow-[0_6px_16px_rgba(91,75,236,0.24)] transition hover:bg-[#4f40da]">
            <Plus className="size-4" />
            Crear tarea
          </button>
        </footer>
      </form>
    </div>
  );
}

function NewProjectModal({
  workspaceId,
  onClose,
  onCreate,
}: {
  workspaceId: string;
  onClose: () => void;
  onCreate: (input: NewProjectInput) => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#6556EE");
  const [description, setDescription] = useState("");
  const colors = [
    "#6556EE",
    "#EF6A67",
    "#19A38C",
    "#3C8FD5",
    "#D98B25",
    "#B15AC7",
  ];

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    onCreate({
      name: name.trim(),
      color,
      description: description.trim(),
      workspaceId,
    });
  }

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center p-4">
      <button
        className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="Cerrar"
      />
      <form
        onSubmit={submit}
        className="animate-enter relative w-full max-w-[450px] rounded-2xl bg-white p-6 shadow-[0_28px_80px_rgba(15,23,42,0.25)]"
      >
        <div className="flex items-start">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-violet-600">
              Nuevo proyecto
            </p>
            <h2 className="mt-1 text-xl font-bold text-slate-900">
              Organizá una campaña
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="focus-ring ml-auto rounded-lg p-2 text-slate-400 hover:bg-slate-100"
            aria-label="Cerrar"
          >
            <X className="size-5" />
          </button>
        </div>
        <label className="mt-6 block">
          <span className="mb-2 block text-[11px] font-bold text-slate-600">
            Nombre del proyecto
          </span>
          <input
            autoFocus
            required
            minLength={2}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ej. Lanzamiento Primavera"
            className="focus-ring w-full rounded-xl border border-slate-200 px-4 py-3 text-[13px] text-slate-800"
          />
        </label>
        <label className="mt-4 block">
          <span className="mb-2 block text-[11px] font-bold text-slate-600">
            Descripción
          </span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Objetivo, cliente o alcance del proyecto"
            className="focus-ring min-h-20 w-full resize-none rounded-xl border border-slate-200 px-4 py-3 text-[13px] text-slate-800"
          />
        </label>
        <fieldset className="mt-5">
          <legend className="text-[11px] font-bold text-slate-600">
            Color
          </legend>
          <div className="mt-3 flex gap-2">
            {colors.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setColor(item)}
                className={clsx(
                  "focus-ring grid size-9 place-items-center rounded-full border-2",
                  color === item ? "border-slate-700" : "border-transparent",
                )}
                aria-label={`Usar color ${item}`}
              >
                <span
                  className="size-6 rounded-full"
                  style={{ background: item }}
                />
              </button>
            ))}
          </div>
        </fieldset>
        <div className="mt-7 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="focus-ring rounded-lg px-4 py-2.5 text-[11px] font-semibold text-slate-500"
          >
            Cancelar
          </button>
          <button className="focus-ring rounded-lg bg-[#5b4bec] px-4 py-2.5 text-[11px] font-bold text-white">
            Crear proyecto
          </button>
        </div>
      </form>
    </div>
  );
}

function NewWorkspaceModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (name: string) => void;
}) {
  const [name, setName] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (name.trim().length < 2) return;
    onCreate(name.trim());
  }

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center p-4">
      <button
        className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="Cerrar"
      />
      <form
        onSubmit={submit}
        className="animate-enter relative w-full max-w-[450px] rounded-2xl bg-white p-6 shadow-[0_28px_80px_rgba(15,23,42,0.25)]"
      >
        <div className="flex items-start">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-600">
              Nuevo espacio
            </p>
            <h2 className="mt-1 text-xl font-bold text-slate-900">
              Creá un lugar para tu equipo
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="focus-ring ml-auto rounded-lg p-2 text-slate-400 hover:bg-slate-100"
            aria-label="Cerrar"
          >
            <X className="size-5" />
          </button>
        </div>
        <label className="mt-6 block">
          <span className="mb-2 block text-[11px] font-bold text-slate-600">
            Nombre del espacio de trabajo
          </span>
          <input
            autoFocus
            required
            minLength={2}
            maxLength={80}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ej. Equipo de Contenidos"
            className="focus-ring w-full rounded-xl border border-slate-200 px-4 py-3 text-[13px] text-slate-800"
          />
        </label>
        <p className="mt-3 text-[10px] leading-5 text-slate-400">
          Después vas a poder crear proyectos y tareas dentro de este espacio.
        </p>
        <div className="mt-7 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="focus-ring rounded-lg px-4 py-2.5 text-[11px] font-semibold text-slate-500"
          >
            Cancelar
          </button>
          <button className="focus-ring rounded-lg bg-[#5b4bec] px-4 py-2.5 text-[11px] font-bold text-white">
            Crear espacio
          </button>
        </div>
      </form>
    </div>
  );
}

function ConfirmDialog({
  title,
  description,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[120] grid place-items-center p-4">
      <button
        className="absolute inset-0 bg-slate-950/35 backdrop-blur-sm"
        onClick={onCancel}
        aria-label="Cancelar"
      />
      <div
        role="alertdialog"
        aria-modal="true"
        className="mac-window animate-enter relative w-full max-w-sm rounded-2xl border border-white/70 bg-white/95 p-6 text-center shadow-[0_30px_90px_rgba(15,23,42,.28)] backdrop-blur-2xl"
      >
        <span className="mx-auto grid size-11 place-items-center rounded-full bg-rose-50 text-rose-600">
          <Trash2 className="size-5" />
        </span>
        <h3 className="mt-4 text-base font-bold text-slate-900">{title}</h3>
        <p className="mt-2 text-[11px] leading-5 text-slate-500">
          {description}
        </p>
        <div className="mt-6 grid grid-cols-2 gap-2">
          <button
            onClick={onCancel}
            className="focus-ring rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-[11px] font-semibold text-slate-600"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="focus-ring rounded-lg bg-rose-600 px-4 py-2.5 text-[11px] font-bold text-white hover:bg-rose-700"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProjectSettingsModal({
  project,
  onClose,
  onSave,
  onArchive,
  onDelete,
}: {
  project: Project;
  onClose: () => void;
  onSave: (input: UpdateProjectInput) => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [color, setColor] = useState(project.color);
  const [confirmAction, setConfirmAction] = useState<
    "archive" | "delete" | null
  >(null);
  const colors = [
    "#0A84FF",
    "#6556EE",
    "#FF453A",
    "#30D158",
    "#FF9F0A",
    "#BF5AF2",
  ];

  return (
    <div className="fixed inset-0 z-[85] grid place-items-center p-4">
      <button
        className="absolute inset-0 bg-slate-950/35 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Cerrar"
      />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSave({ name: name.trim(), description: description.trim(), color });
        }}
        className="mac-window animate-enter relative w-full max-w-[500px] overflow-hidden rounded-2xl border border-white/80 bg-white/95 shadow-[0_30px_90px_rgba(15,23,42,.25)] backdrop-blur-2xl"
      >
        <header className="mac-titlebar flex h-14 items-center border-b border-black/5 bg-slate-50/80 px-5">
          <div className="flex gap-2" aria-hidden="true">
            <span className="size-3 rounded-full bg-[#ff5f57]" />
            <span className="size-3 rounded-full bg-[#febc2e]" />
            <span className="size-3 rounded-full bg-[#28c840]" />
          </div>
          <h2 className="mx-auto -translate-x-6 text-[12px] font-semibold text-slate-700">
            Información del proyecto
          </h2>
        </header>
        <div className="space-y-5 p-6">
          <label className="block">
            <span className="mb-2 block text-[11px] font-semibold text-slate-600">
              Nombre
            </span>
            <input
              autoFocus
              required
              minLength={2}
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mac-input focus-ring w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[12px]"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-[11px] font-semibold text-slate-600">
              Descripción
            </span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="mac-input focus-ring min-h-20 w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[12px]"
            />
          </label>
          <fieldset>
            <legend className="text-[11px] font-semibold text-slate-600">
              Etiqueta de color
            </legend>
            <div className="mt-3 flex gap-2">
              {colors.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setColor(item)}
                  className={clsx(
                    "focus-ring grid size-8 place-items-center rounded-full border-2",
                    color === item ? "border-slate-700" : "border-transparent",
                  )}
                  aria-label={`Usar color ${item}`}
                >
                  <span
                    className="size-5 rounded-full"
                    style={{ background: item }}
                  />
                </button>
              ))}
            </div>
          </fieldset>
          <div className="rounded-xl border border-rose-100 bg-rose-50/60 p-4">
            <p className="text-[10px] font-bold uppercase tracking-wide text-rose-700">
              Zona sensible
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setConfirmAction("archive")}
                className="focus-ring flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-2 text-[10px] font-semibold text-rose-700"
              >
                <Archive className="size-3.5" />
                {project.archived ? "Restaurar" : "Archivar"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmAction("delete")}
                className="focus-ring flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-2 text-[10px] font-semibold text-white"
              >
                <Trash2 className="size-3.5" />
                Eliminar
              </button>
            </div>
          </div>
        </div>
        <footer className="flex justify-end gap-2 border-t border-black/5 bg-slate-50/70 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="focus-ring rounded-lg px-4 py-2 text-[11px] font-semibold text-slate-500 hover:bg-white"
          >
            Cancelar
          </button>
          <button className="mac-button-primary focus-ring rounded-lg px-4 py-2 text-[11px] font-bold text-white">
            Guardar cambios
          </button>
        </footer>
      </form>
      {confirmAction && (
        <ConfirmDialog
          title={
            confirmAction === "delete"
              ? "¿Eliminar este proyecto?"
              : project.archived
                ? "¿Restaurar este proyecto?"
                : "¿Archivar este proyecto?"
          }
          description={
            confirmAction === "delete"
              ? "También se eliminarán sus tareas, subtareas, comentarios y adjuntos. Esta acción no se puede deshacer."
              : "Las tareas se conservarán y el proyecto dejará de aparecer en las vistas activas."
          }
          confirmLabel={
            confirmAction === "delete"
              ? "Eliminar"
              : project.archived
                ? "Restaurar"
                : "Archivar"
          }
          onCancel={() => setConfirmAction(null)}
          onConfirm={() => {
            if (confirmAction === "delete") onDelete();
            else onArchive();
            setConfirmAction(null);
          }}
        />
      )}
    </div>
  );
}

function AdvancedFilterPopover({
  filters,
  people,
  onChange,
  onClose,
}: {
  filters: AdvancedFilters;
  people: Person[];
  onChange: (filters: AdvancedFilters) => void;
  onClose: () => void;
}) {
  return (
    <div className="mac-popover absolute left-0 top-[calc(100%+8px)] z-40 w-[280px] rounded-xl border border-black/10 bg-white/95 p-4 shadow-[0_18px_50px_rgba(15,23,42,.18)] backdrop-blur-2xl">
      <div className="flex items-center">
        <p className="text-[11px] font-bold text-slate-700">Filtros avanzados</p>
        <button
          onClick={onClose}
          className="focus-ring ml-auto rounded-md p-1 text-slate-400 hover:bg-slate-100"
          aria-label="Cerrar filtros"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="mt-4 space-y-3">
        <label className="block">
          <span className="mb-1.5 block text-[9px] font-bold uppercase tracking-wide text-slate-400">
            Estado
          </span>
          <select
            value={filters.status}
            onChange={(event) =>
              onChange({
                ...filters,
                status: event.target.value as AdvancedFilters["status"],
              })
            }
            className="mac-input focus-ring w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[11px]"
          >
            <option value="todos">Todos</option>
            {(Object.keys(statusMeta) as TaskStatus[]).map((status) => (
              <option key={status} value={status}>
                {statusMeta[status].label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[9px] font-bold uppercase tracking-wide text-slate-400">
            Responsable
          </span>
          <select
            value={filters.assigneeId}
            onChange={(event) =>
              onChange({ ...filters, assigneeId: event.target.value })
            }
            className="mac-input focus-ring w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[11px]"
          >
            <option value="todos">Todos</option>
            <option value="sin_asignar">Sin asignar</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[9px] font-bold uppercase tracking-wide text-slate-400">
            Vencimiento
          </span>
          <select
            value={filters.due}
            onChange={(event) =>
              onChange({
                ...filters,
                due: event.target.value as AdvancedFilters["due"],
              })
            }
            className="mac-input focus-ring w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[11px]"
          >
            <option value="todas">Cualquier fecha</option>
            <option value="vencidas">Vencidas</option>
            <option value="hoy">Vencen hoy</option>
            <option value="semana">Próximos 7 días</option>
            <option value="sin_fecha">Sin fecha</option>
          </select>
        </label>
      </div>
      <button
        onClick={() =>
          onChange({ status: "todos", assigneeId: "todos", due: "todas" })
        }
        className="focus-ring mt-4 w-full rounded-lg bg-slate-100 px-3 py-2 text-[10px] font-semibold text-slate-600 hover:bg-slate-200"
      >
        Restablecer
      </button>
    </div>
  );
}

function NotificationsPopover({
  notifications,
  onRead,
  onReadAll,
  onTaskOpen,
  onClose,
}: {
  notifications: AppNotification[];
  onRead: (id: string) => void;
  onReadAll: () => void;
  onTaskOpen: (taskId: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="mac-popover absolute right-0 top-[calc(100%+8px)] z-50 w-[340px] max-w-[calc(100vw-24px)] overflow-hidden rounded-2xl border border-black/10 bg-white/95 shadow-[0_22px_65px_rgba(15,23,42,.22)] backdrop-blur-2xl">
      <header className="flex items-center border-b border-black/5 px-4 py-3">
        <div>
          <p className="text-[12px] font-bold text-slate-800">Notificaciones</p>
          <p className="text-[9px] text-slate-400">
            {notifications.filter((item) => !item.readAt).length} sin leer
          </p>
        </div>
        <button
          onClick={onReadAll}
          className="focus-ring ml-auto rounded-md px-2 py-1 text-[9px] font-semibold text-[#0879ea] hover:bg-[#0a84ff]/10"
        >
          Marcar todas
        </button>
        <button
          onClick={onClose}
          className="focus-ring ml-1 rounded-md p-1 text-slate-400 hover:bg-slate-100"
          aria-label="Cerrar notificaciones"
        >
          <X className="size-3.5" />
        </button>
      </header>
      <div className="soft-scrollbar max-h-[390px] overflow-y-auto p-2">
        {notifications.map((notification) => (
          <button
            key={notification.id}
            onClick={() => {
              onRead(notification.id);
              if (notification.taskId) onTaskOpen(notification.taskId);
            }}
            className={clsx(
              "focus-ring flex w-full gap-3 rounded-xl p-3 text-left hover:bg-slate-100",
              !notification.readAt && "bg-[#0a84ff]/6",
            )}
          >
            <span
              className={clsx(
                "mt-1 size-2 shrink-0 rounded-full",
                notification.readAt ? "bg-slate-200" : "bg-[#0a84ff]",
              )}
            />
            <span>
              <span className="block text-[11px] font-semibold text-slate-700">
                {notification.title}
              </span>
              <span className="mt-1 block text-[10px] leading-4 text-slate-500">
                {notification.body}
              </span>
              <span className="mt-1.5 block text-[9px] text-slate-400">
                {notification.createdAt}
              </span>
            </span>
          </button>
        ))}
        {notifications.length === 0 && (
          <div className="grid min-h-36 place-items-center text-center">
            <div>
              <Bell className="mx-auto size-6 text-slate-300" />
              <p className="mt-2 text-[10px] text-slate-400">
                No hay novedades todavía.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TimeReportsModal({
  entries,
  people,
  projects,
  currency,
  onClose,
}: {
  entries: TimeEntry[];
  people: Person[];
  projects: Project[];
  currency: string;
  onClose: () => void;
}) {
  const [now, setNow] = useState(() => new Date());
  const [userId, setUserId] = useState("todos");
  const [projectId, setProjectId] = useState("todos");
  const [billing, setBilling] = useState<"todos" | "facturable" | "interno">(
    "todos",
  );
  const [from, setFrom] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return date.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    if (!entries.some((entry) => !entry.endedAt)) return;
    const interval = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, [entries]);

  const filtered = useMemo(
    () =>
      entries.filter((entry) => {
        const date = entry.startedAt.slice(0, 10);
        return (
          (userId === "todos" || entry.user.id === userId) &&
          (projectId === "todos" || entry.projectId === projectId) &&
          (billing === "todos" ||
            (billing === "facturable" ? entry.billable : !entry.billable)) &&
          (!from || date >= from) &&
          (!to || date <= to)
        );
      }),
    [billing, entries, from, projectId, to, userId],
  );
  const totalSeconds = filtered.reduce(
    (total, entry) => total + elapsedSeconds(entry, now),
    0,
  );
  const billableSeconds = filtered.reduce(
    (total, entry) =>
      total + (entry.billable ? elapsedSeconds(entry, now) : 0),
    0,
  );
  const totalCost = filtered.reduce(
    (total, entry) => total + timeEntryCost(entry, now),
    0,
  );
  const activeCount = filtered.filter((entry) => !entry.endedAt).length;

  function exportCsv() {
    const csv = buildTimeReportCsv(filtered, currency);
    const blob = new Blob([`\uFEFF${csv}`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `taska-tiempo-${from || "inicio"}-${to || "hoy"}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="fixed inset-0 z-[92] grid place-items-center p-3 sm:p-6">
      <button
        className="absolute inset-0 bg-slate-950/35 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Cerrar reportes"
      />
      <section className="mac-window animate-enter relative flex max-h-[94vh] w-full max-w-[1120px] flex-col overflow-hidden rounded-2xl border border-white/80 bg-white/96 shadow-[0_35px_100px_rgba(15,23,42,.3)] backdrop-blur-2xl">
        <header className="mac-titlebar flex shrink-0 items-center border-b border-black/5 px-5 py-4">
          <div className="flex gap-2" aria-hidden="true">
            <span className="size-3 rounded-full bg-[#ff5f57]" />
            <span className="size-3 rounded-full bg-[#febc2e]" />
            <span className="size-3 rounded-full bg-[#28c840]" />
          </div>
          <div className="ml-5">
            <h2 className="text-[14px] font-bold text-slate-800">
              Auditoría de tiempo y costos
            </h2>
            <p className="mt-0.5 text-[9px] text-slate-400">
              Visibilidad administrativa por persona, proyecto y período
            </p>
          </div>
          <button
            onClick={exportCsv}
            disabled={filtered.length === 0}
            className="mac-button-primary focus-ring ml-auto flex items-center gap-2 rounded-lg px-3 py-2 text-[10px] font-bold text-white disabled:opacity-40"
          >
            <FileDown className="size-3.5" />
            Exportar CSV
          </button>
          <button
            onClick={onClose}
            className="focus-ring ml-2 rounded-lg p-2 text-slate-400 hover:bg-slate-100"
            aria-label="Cerrar"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="soft-scrollbar flex-1 overflow-y-auto p-5 sm:p-7">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: "Tiempo total",
                value: formatDuration(totalSeconds),
                detail: `${filtered.length} registros`,
                icon: TimerReset,
                color: "text-[#0a84ff] bg-[#0a84ff]/10",
              },
              {
                label: "Tiempo facturable",
                value: formatDuration(billableSeconds),
                detail: totalSeconds
                  ? `${Math.round((billableSeconds / totalSeconds) * 100)}% del total`
                  : "0% del total",
                icon: CheckCircle2,
                color: "text-emerald-600 bg-emerald-50",
              },
              {
                label: "Costo auditado",
                value: `${currency} ${totalCost.toFixed(2)}`,
                detail: "Tarifa histórica por registro",
                icon: CircleDollarSign,
                color: "text-violet-600 bg-violet-50",
              },
              {
                label: "Timers activos",
                value: activeCount,
                detail: activeCount ? "En seguimiento ahora" : "Todo detenido",
                icon: Play,
                color: "text-rose-600 bg-rose-50",
              },
            ].map((metric) => {
              const Icon = metric.icon;
              return (
                <article
                  key={metric.label}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <span
                    className={clsx(
                      "grid size-8 place-items-center rounded-xl",
                      metric.color,
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <p className="mt-3 font-mono text-[18px] font-bold tabular-nums text-slate-900">
                    {metric.value}
                  </p>
                  <p className="mt-1 text-[10px] font-semibold text-slate-600">
                    {metric.label}
                  </p>
                  <p className="mt-1 text-[8px] text-slate-400">
                    {metric.detail}
                  </p>
                </article>
              );
            })}
          </div>

          <div className="mt-5 grid gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 p-3 sm:grid-cols-2 lg:grid-cols-5">
            <select
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
              aria-label="Filtrar reporte por persona"
              className="mac-input focus-ring rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[10px]"
            >
              <option value="todos">Todas las personas</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
            <select
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              aria-label="Filtrar reporte por proyecto"
              className="mac-input focus-ring rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[10px]"
            >
              <option value="todos">Todos los proyectos</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            <select
              value={billing}
              onChange={(event) =>
                setBilling(
                  event.target.value as "todos" | "facturable" | "interno",
                )
              }
              aria-label="Filtrar reporte por facturación"
              className="mac-input focus-ring rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[10px]"
            >
              <option value="todos">Todo el tiempo</option>
              <option value="facturable">Sólo facturable</option>
              <option value="interno">Sólo interno</option>
            </select>
            <input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              aria-label="Reporte desde"
              className="mac-input focus-ring rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[10px]"
            />
            <input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              aria-label="Reporte hasta"
              className="mac-input focus-ring rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[10px]"
            />
          </div>

          <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="hidden grid-cols-[120px_1fr_1fr_100px_100px_42px] border-b border-slate-100 bg-slate-50 px-4 py-3 text-[8px] font-bold uppercase tracking-wide text-slate-400 md:grid">
              <span>Persona</span>
              <span>Tarea</span>
              <span>Descripción</span>
              <span>Duración</span>
              <span>Costo</span>
              <span />
            </div>
            {filtered.map((entry) => (
              <article
                key={entry.id}
                className="grid gap-2 border-b border-slate-100 p-4 last:border-0 md:grid-cols-[120px_1fr_1fr_100px_100px_42px] md:items-center md:gap-0"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <Avatar person={entry.user} size="sm" />
                  <span className="truncate text-[9px] font-semibold text-slate-600">
                    {entry.user.name.split(" ")[0]}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[10px] font-semibold text-slate-700">
                    {entry.taskTitle}
                  </p>
                  <p className="mt-0.5 truncate text-[8px] text-slate-400">
                    {entry.taskCode} · {entry.projectName}
                  </p>
                </div>
                <p className="truncate text-[9px] text-slate-500">
                  {entry.description || "Sin descripción"}
                </p>
                <span className="font-mono text-[10px] font-bold tabular-nums text-slate-700">
                  {formatDuration(elapsedSeconds(entry, now))}
                </span>
                <span className="text-[10px] font-semibold text-slate-600">
                  {currency} {timeEntryCost(entry, now).toFixed(2)}
                </span>
                <span
                  className={clsx(
                    "size-2 rounded-full",
                    entry.endedAt
                      ? entry.billable
                        ? "bg-emerald-400"
                        : "bg-slate-300"
                      : "animate-pulse bg-rose-500",
                  )}
                  title={
                    entry.endedAt
                      ? entry.billable
                        ? "Facturable"
                        : "Interno"
                      : "En curso"
                  }
                />
              </article>
            ))}
            {filtered.length === 0 && (
              <div className="grid min-h-48 place-items-center text-center">
                <div>
                  <TimerReset className="mx-auto size-7 text-slate-300" />
                  <p className="mt-3 text-[10px] text-slate-400">
                    No hay registros para estos filtros.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function SettingsModal({
  workspace,
  currentPerson,
  members,
  invitations,
  settings,
  mode,
  onClose,
  onProfileUpdate,
  onSettingsUpdate,
  onInvite,
  onInvitationRevoke,
  onRoleUpdate,
  onMemberHourlyRateUpdate,
  onMemberRemove,
  onWorkspaceUpdate,
  onWorkspaceDelete,
  onResetDemo,
  notify,
}: {
  workspace: Workspace;
  currentPerson: Person | null;
  members: WorkspaceMember[];
  invitations: TeamInvitation[];
  settings: AppSettings;
  mode: "demo" | "supabase";
  onClose: () => void;
  onProfileUpdate: (name: string) => void;
  onSettingsUpdate: (settings: Partial<AppSettings>) => void;
  onInvite: (
    email: string,
    role: Exclude<TeamRole, "owner">,
  ) => Promise<{ invitation: TeamInvitation; emailed: boolean }>;
  onInvitationRevoke: (id: string) => void;
  onRoleUpdate: (userId: string, role: TeamRole) => void;
  onMemberHourlyRateUpdate: (userId: string, hourlyRate: number) => void;
  onMemberRemove: (userId: string) => void;
  onWorkspaceUpdate: (input: UpdateWorkspaceInput) => void;
  onWorkspaceDelete: () => void;
  onResetDemo: () => void;
  notify: (message: string) => void;
}) {
  const [tab, setTab] = useState<"general" | "team" | "workspace">("general");
  const [name, setName] = useState(currentPerson?.name ?? "");
  const [workspaceName, setWorkspaceName] = useState(workspace.name);
  const [currency, setCurrency] = useState(workspace.currency);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<TeamRole, "owner">>("agent");
  const [confirmAction, setConfirmAction] = useState<
    "archive" | "delete" | "remove" | null
  >(null);
  const [removeUserId, setRemoveUserId] = useState<string | null>(null);
  const canManage = workspace.role === "owner" || workspace.role === "admin";

  async function submitInvitation(event: FormEvent) {
    event.preventDefault();
    if (!email.trim()) return;
    try {
      const result = await onInvite(email.trim(), role);
      setEmail("");
      notify(
        result.emailed
          ? "Invitación enviada por correo"
          : "Invitación creada; copiá el enlace para compartirlo",
      );
    } catch (error) {
      notify(error instanceof Error ? error.message : "No se pudo invitar");
    }
  }

  const tabs = [
    { id: "general" as const, label: "General", icon: Settings },
    { id: "team" as const, label: "Integrantes", icon: Users },
    { id: "workspace" as const, label: "Espacio", icon: Building2 },
  ];

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center p-3 sm:p-6">
      <button
        className="absolute inset-0 bg-slate-950/35 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Cerrar"
      />
      <div className="mac-window animate-enter relative flex max-h-[92vh] w-full max-w-[790px] overflow-hidden rounded-2xl border border-white/80 bg-white/95 shadow-[0_35px_100px_rgba(15,23,42,.3)] backdrop-blur-2xl">
        <aside className="hidden w-48 shrink-0 border-r border-black/5 bg-slate-100/80 p-3 sm:block">
          <div className="mb-5 flex gap-2 px-1 py-1" aria-hidden="true">
            <span className="size-3 rounded-full bg-[#ff5f57]" />
            <span className="size-3 rounded-full bg-[#febc2e]" />
            <span className="size-3 rounded-full bg-[#28c840]" />
          </div>
          <p className="px-2 text-[9px] font-bold uppercase tracking-wide text-slate-400">
            Preferencias
          </p>
          <nav className="mt-2 space-y-1">
            {tabs.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setTab(item.id)}
                  className={clsx(
                    "focus-ring flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[11px] font-semibold",
                    tab === item.id
                      ? "bg-[#0a84ff] text-white shadow-sm"
                      : "text-slate-600 hover:bg-black/5",
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </aside>
        <section className="soft-scrollbar min-w-0 flex-1 overflow-y-auto">
          <header className="sticky top-0 z-10 flex items-center border-b border-black/5 bg-white/90 px-5 py-4 backdrop-blur-xl">
            <div className="flex gap-1 sm:hidden">
              {tabs.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setTab(item.id)}
                  className={clsx(
                    "rounded-md px-2 py-1 text-[9px] font-semibold",
                    tab === item.id
                      ? "bg-[#0a84ff] text-white"
                      : "text-slate-500",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <h2 className="hidden text-[14px] font-bold text-slate-800 sm:block">
              {tabs.find((item) => item.id === tab)?.label}
            </h2>
            <button
              onClick={onClose}
              className="focus-ring ml-auto rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              aria-label="Cerrar configuración"
            >
              <X className="size-4" />
            </button>
          </header>
          <div className="p-5 sm:p-7">
            {tab === "general" && (
              <div className="space-y-7">
                <section>
                  <h3 className="text-[12px] font-bold text-slate-800">
                    Perfil
                  </h3>
                  <div className="mt-3 flex items-center gap-3">
                    <Avatar person={currentPerson} size="lg" />
                    <label className="min-w-0 flex-1">
                      <span className="sr-only">Nombre</span>
                      <input
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        className="mac-input focus-ring w-full rounded-lg border border-slate-200 px-3 py-2.5 text-[12px]"
                      />
                    </label>
                    <button
                      onClick={() => {
                        onProfileUpdate(name.trim());
                        notify("Perfil actualizado");
                      }}
                      className="mac-button-primary focus-ring rounded-lg px-3 py-2.5 text-[10px] font-bold text-white"
                    >
                      Guardar
                    </button>
                  </div>
                </section>
                <section>
                  <h3 className="text-[12px] font-bold text-slate-800">
                    Apariencia
                  </h3>
                  <div className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                    <label className="flex items-center gap-3 p-4">
                      <span className="flex-1">
                        <span className="block text-[11px] font-semibold text-slate-700">
                          Vista compacta
                        </span>
                        <span className="mt-0.5 block text-[9px] text-slate-400">
                          Reduce el alto de cada fila en la lista.
                        </span>
                      </span>
                      <input
                        type="checkbox"
                        checked={settings.compactMode}
                        onChange={(event) =>
                          onSettingsUpdate({
                            compactMode: event.target.checked,
                          })
                        }
                        className="size-4 accent-[#0a84ff]"
                      />
                    </label>
                    <label className="flex items-center gap-3 p-4">
                      <span className="flex-1">
                        <span className="block text-[11px] font-semibold text-slate-700">
                          Mostrar completadas
                        </span>
                        <span className="mt-0.5 block text-[9px] text-slate-400">
                          Incluye las tareas aprobadas en lista y tablero.
                        </span>
                      </span>
                      <input
                        type="checkbox"
                        checked={settings.showCompleted}
                        onChange={(event) =>
                          onSettingsUpdate({
                            showCompleted: event.target.checked,
                          })
                        }
                        className="size-4 accent-[#0a84ff]"
                      />
                    </label>
                  </div>
                </section>
                {mode === "demo" && (
                  <button
                    onClick={() => {
                      onResetDemo();
                      notify("Datos de demostración restaurados");
                    }}
                    className="focus-ring rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-semibold text-slate-500 hover:bg-slate-50"
                  >
                    Restaurar datos de demostración
                  </button>
                )}
              </div>
            )}

            {tab === "team" && (
              <div>
                <div className="flex items-center">
                  <div>
                    <h3 className="text-[12px] font-bold text-slate-800">
                      Integrantes
                    </h3>
                    <p className="mt-1 text-[9px] text-slate-400">
                      Administrá acceso y permisos del espacio.
                    </p>
                  </div>
                  <span className="ml-auto rounded-full bg-slate-100 px-2 py-1 text-[9px] font-semibold text-slate-500">
                    {members.length}
                  </span>
                </div>
                {canManage && (
                  <form
                    onSubmit={submitInvitation}
                    className="mt-5 grid gap-2 rounded-xl border border-[#0a84ff]/15 bg-[#0a84ff]/5 p-3 sm:grid-cols-[1fr_110px_auto]"
                  >
                    <label>
                      <span className="sr-only">Correo</span>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="persona@empresa.com"
                        className="mac-input focus-ring w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[11px]"
                      />
                    </label>
                    <select
                      value={role}
                      onChange={(event) =>
                        setRole(
                          event.target.value as Exclude<TeamRole, "owner">,
                        )
                      }
                      className="mac-input focus-ring rounded-lg border border-slate-200 bg-white px-2 py-2.5 text-[10px]"
                    >
                      <option value="admin">Admin</option>
                      <option value="agent">Integrante</option>
                      <option value="viewer">Solo lectura</option>
                    </select>
                    <button className="mac-button-primary focus-ring flex items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-[10px] font-bold text-white">
                      <UserPlus className="size-3.5" />
                      Invitar
                    </button>
                  </form>
                )}
                <div className="mt-5 divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {members.map((member) => (
                    <div
                      key={member.user.id}
                      className="flex items-center gap-3 p-3"
                    >
                      <Avatar person={member.user} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-semibold text-slate-700">
                          {member.user.name}
                        </p>
                        <p className="truncate text-[9px] text-slate-400">
                          {member.user.email ?? "Sin correo visible"}
                        </p>
                      </div>
                      <label className="hidden items-center gap-1 lg:flex">
                        <span className="text-[8px] font-bold text-slate-400">
                          {workspace.currency}/h
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          defaultValue={member.hourlyRate}
                          disabled={!canManage}
                          onBlur={(event) => {
                            const hourlyRate = Number(event.target.value);
                            if (
                              Number.isFinite(hourlyRate) &&
                              hourlyRate >= 0 &&
                              hourlyRate !== member.hourlyRate
                            ) {
                              onMemberHourlyRateUpdate(
                                member.user.id,
                                hourlyRate,
                              );
                              notify("Tarifa horaria actualizada");
                            }
                          }}
                          aria-label={`Tarifa horaria de ${member.user.name}`}
                          className="mac-input focus-ring w-16 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-right text-[9px]"
                        />
                      </label>
                      <select
                        value={member.role}
                        disabled={!canManage || member.role === "owner"}
                        onChange={(event) =>
                          onRoleUpdate(
                            member.user.id,
                            event.target.value as TeamRole,
                          )
                        }
                        className="mac-input focus-ring max-w-28 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[9px] disabled:border-transparent disabled:bg-transparent"
                      >
                        <option value="owner">Dueño</option>
                        <option value="admin">Admin</option>
                        <option value="agent">Integrante</option>
                        <option value="viewer">Solo lectura</option>
                      </select>
                      {canManage && member.role !== "owner" && (
                        <button
                          onClick={() => {
                            setRemoveUserId(member.user.id);
                            setConfirmAction("remove");
                          }}
                          className="focus-ring rounded-md p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-600"
                          aria-label={`Quitar a ${member.user.name}`}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {invitations.filter((item) => !item.acceptedAt).length > 0 && (
                  <section className="mt-6">
                    <h3 className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      Invitaciones pendientes
                    </h3>
                    <div className="mt-2 space-y-2">
                      {invitations
                        .filter((item) => !item.acceptedAt)
                        .map((invitation) => (
                          <div
                            key={invitation.id}
                            className="flex items-center gap-2 rounded-xl bg-slate-50 p-3"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[10px] font-semibold text-slate-700">
                                {invitation.email}
                              </span>
                              <span className="block text-[9px] text-slate-400">
                                Rol: {invitation.role}
                              </span>
                            </span>
                            <button
                              onClick={() => {
                                const url = `${window.location.origin}/invite/${invitation.token}`;
                                void navigator.clipboard?.writeText(url);
                                notify("Enlace de invitación copiado");
                              }}
                              className="focus-ring rounded-md px-2 py-1.5 text-[9px] font-semibold text-[#0879ea] hover:bg-[#0a84ff]/10"
                            >
                              Copiar enlace
                            </button>
                            <button
                              onClick={() =>
                                onInvitationRevoke(invitation.id)
                              }
                              className="focus-ring rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                              aria-label="Revocar invitación"
                            >
                              <X className="size-3.5" />
                            </button>
                          </div>
                        ))}
                    </div>
                  </section>
                )}
              </div>
            )}

            {tab === "workspace" && (
              <div className="space-y-7">
                <section>
                  <h3 className="text-[12px] font-bold text-slate-800">
                    Información del espacio
                  </h3>
                  <div className="mt-3 flex gap-2">
                    <input
                      value={workspaceName}
                      disabled={!canManage}
                      onChange={(event) =>
                        setWorkspaceName(event.target.value)
                      }
                      className="mac-input focus-ring min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2.5 text-[12px]"
                    />
                    <select
                      value={currency}
                      disabled={!canManage}
                      onChange={(event) => setCurrency(event.target.value)}
                      aria-label="Moneda del espacio"
                      className="mac-input focus-ring rounded-lg border border-slate-200 bg-white px-2.5 py-2.5 text-[10px]"
                    >
                      <option value="USD">USD</option>
                      <option value="UYU">UYU</option>
                      <option value="ARS">ARS</option>
                      <option value="EUR">EUR</option>
                      <option value="BRL">BRL</option>
                    </select>
                    <button
                      disabled={!canManage}
                      onClick={() => {
                        onWorkspaceUpdate({
                          name: workspaceName.trim(),
                          currency,
                        });
                        notify("Espacio actualizado");
                      }}
                      className="mac-button-primary focus-ring rounded-lg px-3 py-2.5 text-[10px] font-bold text-white disabled:opacity-40"
                    >
                      Guardar
                    </button>
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-[9px] text-slate-400">
                    <Shield className="size-3.5" />
                    Tu rol: {workspace.role}
                  </div>
                </section>
                {workspace.role === "owner" && (
                  <section className="rounded-xl border border-rose-100 bg-rose-50/60 p-4">
                    <h3 className="text-[11px] font-bold text-rose-800">
                      Zona sensible
                    </h3>
                    <p className="mt-1 text-[9px] leading-4 text-rose-700/70">
                      Archivar conserva los datos. Eliminar borra proyectos,
                      tareas y archivos del espacio.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        onClick={() => setConfirmAction("archive")}
                        className="focus-ring flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-2 text-[10px] font-semibold text-rose-700"
                      >
                        <Archive className="size-3.5" />
                        {workspace.archived ? "Restaurar" : "Archivar espacio"}
                      </button>
                      <button
                        onClick={() => setConfirmAction("delete")}
                        className="focus-ring flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-2 text-[10px] font-semibold text-white"
                      >
                        <Trash2 className="size-3.5" />
                        Eliminar espacio
                      </button>
                    </div>
                  </section>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
      {confirmAction && (
        <ConfirmDialog
          title={
            confirmAction === "delete"
              ? "¿Eliminar este espacio?"
              : confirmAction === "remove"
                ? "¿Quitar a este integrante?"
                : workspace.archived
                  ? "¿Restaurar este espacio?"
                  : "¿Archivar este espacio?"
          }
          description={
            confirmAction === "delete"
              ? "Se eliminarán definitivamente todos sus proyectos, tareas, comentarios y archivos."
              : confirmAction === "remove"
                ? "La persona perderá acceso inmediato a los proyectos y tareas del espacio."
                : "El espacio se ocultará de la navegación, pero sus datos se conservarán."
          }
          confirmLabel={
            confirmAction === "delete"
              ? "Eliminar"
              : confirmAction === "remove"
                ? "Quitar"
                : workspace.archived
                  ? "Restaurar"
                  : "Archivar"
          }
          onCancel={() => {
            setConfirmAction(null);
            setRemoveUserId(null);
          }}
          onConfirm={() => {
            if (confirmAction === "delete") onWorkspaceDelete();
            if (confirmAction === "archive") {
              onWorkspaceUpdate({ archived: !workspace.archived });
            }
            if (confirmAction === "remove" && removeUserId) {
              onMemberRemove(removeUserId);
            }
            setConfirmAction(null);
            setRemoveUserId(null);
          }}
        />
      )}
    </div>
  );
}

export function TaskaApp() {
  const {
    tasks,
    projects,
    workspaces,
    people,
    members,
    invitations,
    notifications,
    timeEntries,
    currentUserId,
    activeWorkspaceId,
    settings,
    mode,
    syncing,
    setActiveWorkspaceId,
    updateTask,
    updateStatus,
    deleteTask,
    addComment,
    deleteComment,
    createTask,
    createProject,
    updateProject,
    deleteProject,
    createWorkspace,
    updateWorkspace,
    deleteWorkspace,
    updateMemberRole,
    updateMemberHourlyRate,
    removeMember,
    inviteMember,
    revokeInvitation,
    uploadAttachment,
    deleteAttachment,
    openAttachment,
    markNotificationRead,
    markAllNotificationsRead,
    updateProfile,
    updateSettings,
    startTimer,
    stopTimer,
    createManualTimeEntry,
    deleteTimeEntry,
    resetDemo,
  } = useTaskWorkspace();
  const [view, setView] = useState<View>("my_tasks");
  const [query, setQuery] = useState("");
  const [priority, setPriority] = useState<TaskPriority | "todas">("todas");
  const [projectId, setProjectId] = useState("todos");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTaskStatus, setNewTaskStatus] = useState<TaskStatus>("nuevo");
  const [showNewProject, setShowNewProject] = useState(false);
  const [showNewWorkspace, setShowNewWorkspace] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [timeReportsOpen, setTimeReportsOpen] = useState(false);
  const [projectSettingsId, setProjectSettingsId] = useState<string | null>(
    null,
  );
  const [taskToDeleteId, setTaskToDeleteId] = useState<string | null>(null);
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilters>({
    status: "todos",
    assigneeId: "todos",
    due: "todas",
  });
  const [toast, setToast] = useState<string | null>(null);

  const activeWorkspace =
    workspaces.find((workspace) => workspace.id === activeWorkspaceId) ??
    workspaces[0] ??
    null;
  const currentPerson =
    people.find((person) => person.id === currentUserId) ?? people[0] ?? null;
  const currentMembership =
    members.find((member) => member.user.id === currentUserId) ?? null;
  const canAuditTime = canAuditTimeReports(activeWorkspace?.role);
  const canTrackTime =
    (currentMembership?.role ?? activeWorkspace?.role) !== "viewer";
  const activeTimeEntry =
    timeEntries.find(
      (entry) => entry.user.id === currentUserId && !entry.endedAt,
    ) ?? null;
  const topLevelTasks = useMemo(
    () => tasks.filter((task) => !task.parentTaskId),
    [tasks],
  );
  const selectedTask =
    tasks.find((task) => task.id === selectedTaskId) ?? null;
  const selectedParentTask = selectedTask?.parentTaskId
    ? (tasks.find((task) => task.id === selectedTask.parentTaskId) ?? null)
    : null;
  const selectedSubtasks = selectedTask
    ? tasks.filter((task) => task.parentTaskId === selectedTask.id)
    : [];
  const selectedTimeEntries = selectedTask
    ? timeEntries.filter((entry) => entry.taskId === selectedTask.id)
    : [];
  const myTaskCount = topLevelTasks.filter(
    (task) =>
      task.assignee?.id === currentUserId ||
      (mode === "demo" && task.assignee?.id === "martina"),
  ).length;

  const filteredTasks = useMemo(
    () =>
      topLevelTasks.filter((task) => {
      const isMine =
        view !== "my_tasks" ||
        task.assignee?.id === currentUserId ||
        (mode === "demo" && task.assignee?.id === "martina");
        return (
          isMine &&
          (settings.showCompleted || task.status !== "resuelto") &&
          !task.project.archived &&
          matchesTaskFilters(task, {
            query,
            priority,
            projectId,
            advanced: advancedFilters,
          })
        );
      }),
    [
      advancedFilters,
      currentUserId,
      mode,
      priority,
      projectId,
      query,
      settings.showCompleted,
      topLevelTasks,
      view,
    ],
  );

  const openCount = topLevelTasks.filter(
    (task) => task.status !== "resuelto",
  ).length;
  const highPriorityCount = topLevelTasks.filter(
    (task) =>
      (task.priority === "urgente" || task.priority === "alta") &&
      task.status !== "resuelto",
  ).length;
  const resolvedCount = topLevelTasks.filter(
    (task) => task.status === "resuelto",
  ).length;
  const waitingCount = topLevelTasks.filter(
    (task) => task.status === "esperando",
  ).length;
  const today = new Date();
  const weekLimit = new Date(today);
  weekLimit.setDate(today.getDate() + 7);
  const dueThisWeek = topLevelTasks.filter((task) => {
    if (!task.dueDate || task.status === "resuelto") return false;
    const due = new Date(`${task.dueDate}T23:59:59`);
    return due >= today && due <= weekLimit;
  }).length;
  const datedTasks = topLevelTasks.filter((task) => task.dueDate).length;
  const datedPercent = topLevelTasks.length
    ? Math.round((datedTasks / topLevelTasks.length) * 100)
    : 0;
  const dateLabel = new Intl.DateTimeFormat("es-UY", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(today);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2500);
  }

  async function handleCreate(input: NewTaskInput) {
    try {
      const task = await createTask(input);
      setShowNewTask(false);
      setSelectedTaskId(task.id);
      notify(
        input.parentTaskId
          ? "Subtarea creada correctamente"
          : "Tarea creada correctamente",
      );
    } catch {
      notify("No se pudo crear la tarea");
    }
  }

  function openNewTask(status: TaskStatus = "nuevo") {
    if (!projects.length) {
      setShowNewProject(true);
      notify("Primero creá un proyecto");
      return;
    }
    setNewTaskStatus(status);
    setShowNewTask(true);
  }

  async function handleCreateProject(input: NewProjectInput) {
    try {
      const project = await createProject(input);
      setShowNewProject(false);
      if (project) {
        setProjectId(project.id);
        setView("all_tasks");
      }
      notify("Proyecto creado correctamente");
    } catch {
      notify("No se pudo crear el proyecto");
    }
  }

  async function handleCreateWorkspace(name: string) {
    try {
      await createWorkspace(name);
      setShowNewWorkspace(false);
      setProjectId("todos");
      setSelectedTaskId(null);
      notify("Espacio de trabajo creado");
    } catch {
      notify("No se pudo crear el espacio");
    }
  }

  async function signOut() {
    const supabase = createClient();
    if (!supabase) return;
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const viewTitle =
    view === "my_tasks"
      ? "Mis tareas"
      : view === "all_tasks"
        ? "Todas las tareas"
        : "Tablero creativo";

  return (
    <div
      className="mac-wallpaper flex min-h-screen bg-[#f1f3f6]"
      style={{ "--app-accent": settings.accentColor } as CSSProperties}
    >
      <Sidebar
        view={view}
        onViewChange={setView}
        projects={projects}
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId}
        currentPerson={currentPerson}
        myTaskCount={myTaskCount}
        mobileOpen={mobileMenu}
        onClose={() => setMobileMenu(false)}
        mode={mode}
        onWorkspaceChange={(workspaceId) => {
          setActiveWorkspaceId(workspaceId);
          setProjectId("todos");
          setSelectedTaskId(null);
        }}
        onCreateWorkspace={() => setShowNewWorkspace(true)}
        onCreateProject={() => setShowNewProject(true)}
        onProjectSettings={setProjectSettingsId}
        onSettings={() => setSettingsOpen(true)}
        onTimeReports={() => setTimeReportsOpen(true)}
        canViewTimeReports={canAuditTime}
        onProjectSelect={(nextProjectId) => {
          setProjectId(nextProjectId);
          setView("all_tasks");
        }}
      />

      <main className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex h-16 items-center border-b border-[#e6e8ee] bg-white/95 px-4 backdrop-blur sm:px-7 lg:h-[70px] lg:px-9">
          <button
            onClick={() => setMobileMenu(true)}
            className="focus-ring mr-2 rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
            aria-label="Abrir menú"
          >
            <Menu className="size-5" />
          </button>
          <div className="relative hidden w-full max-w-[390px] sm:block">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar tareas, campañas o clientes…"
              className="focus-ring h-10 w-full rounded-xl border border-slate-200 bg-[#f8f9fb] pl-10 pr-14 text-[12px] text-slate-700 placeholder:text-slate-400"
              aria-label="Buscar tareas"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] font-medium text-slate-400">
              ⌘ K
            </span>
          </div>
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            {syncing && (
              <span className="hidden items-center gap-2 text-[10px] font-medium text-slate-400 md:flex">
                <span className="size-1.5 animate-pulse rounded-full bg-violet-500" />
                Sincronizando
              </span>
            )}
            {activeTimeEntry && (
              <ActiveTimerPill
                entry={activeTimeEntry}
                onOpen={() => setSelectedTaskId(activeTimeEntry.taskId)}
                onStop={() => {
                  void stopTimer(activeTimeEntry.id);
                  notify("Timer detenido");
                }}
              />
            )}
            <div className="relative">
              <button
                onClick={() => setNotificationsOpen((current) => !current)}
                className="focus-ring relative rounded-lg p-2.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Notificaciones"
                aria-expanded={notificationsOpen}
              >
                <Bell className="size-[18px]" />
                {notifications.some((item) => !item.readAt) && (
                  <span className="absolute right-2 top-2 size-1.5 rounded-full bg-rose-500 ring-2 ring-white" />
                )}
              </button>
              {notificationsOpen && (
                <NotificationsPopover
                  notifications={notifications}
                  onRead={(id) => void markNotificationRead(id)}
                  onReadAll={() => void markAllNotificationsRead()}
                  onTaskOpen={(taskId) => {
                    setSelectedTaskId(taskId);
                    setNotificationsOpen(false);
                  }}
                  onClose={() => setNotificationsOpen(false)}
                />
              )}
            </div>
            <button
              onClick={() => openNewTask()}
              className="mac-button-primary focus-ring flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-[11px] font-bold text-white sm:px-4"
            >
              <Plus className="size-4 stroke-[2.5]" />
              <span className="hidden xs:inline sm:inline">Nueva tarea</span>
            </button>
          </div>
        </header>

        <div className="mx-auto max-w-[1500px] px-4 pb-24 pt-6 sm:px-7 lg:px-9 lg:pb-10 lg:pt-8">
          <section className="animate-enter">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#6556ee]">
                  {dateLabel}
                </p>
                <h1 className="mt-1.5 text-[25px] font-bold tracking-[-0.035em] text-slate-900 sm:text-[30px]">
                  Buenos días, {currentPerson?.name.split(" ")[0] ?? "equipo"}
                </h1>
                <p className="mt-1 text-[12px] text-slate-500">
                  Hay {dueThisWeek} entregas en los próximos 7 días y{" "}
                  {waitingCount} tareas esperando aprobación.
                </p>
              </div>
              <div className="hidden items-center gap-2 lg:flex">
                <span className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] font-semibold text-emerald-700">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  Carga saludable
                </span>
                {mode === "supabase" && (
                  <button
                    onClick={signOut}
                    className="focus-ring rounded-lg border border-slate-200 p-2 text-slate-400 hover:bg-white hover:text-slate-700"
                    aria-label="Cerrar sesión"
                  >
                    <LogOut className="size-4" />
                  </button>
                )}
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
              {[
                {
                  label: "Tareas activas",
                  value: openCount,
                  trend: `${topLevelTasks.length} tareas totales`,
                  icon: Inbox,
                  color: "text-violet-600",
                  iconBg: "bg-violet-50",
                },
                {
                  label: "Prioridad alta",
                  value: highPriorityCount,
                  trend: "Urgentes y altas activas",
                  icon: Zap,
                  color: "text-rose-600",
                  iconBg: "bg-rose-50",
                },
                {
                  label: "Aprobadas",
                  value: resolvedCount,
                  trend: "En este espacio",
                  icon: CheckCircle2,
                  color: "text-emerald-600",
                  iconBg: "bg-emerald-50",
                },
                {
                  label: "Con fecha definida",
                  value: `${datedPercent}%`,
                  trend: `${datedTasks} tareas planificadas`,
                  icon: Clock3,
                  color: "text-sky-600",
                  iconBg: "bg-sky-50",
                },
              ].map((metric) => {
                const Icon = metric.icon;
                return (
                  <article
                    key={metric.label}
                    className="rounded-2xl border border-[#e6e8ee] bg-white p-4 shadow-[0_1px_2px_rgba(25,32,50,0.025)] sm:p-5"
                  >
                    <div className="flex items-start justify-between">
                      <span
                        className={clsx(
                          "grid size-9 place-items-center rounded-xl",
                          metric.iconBg,
                          metric.color,
                        )}
                      >
                        <Icon className="size-[17px]" />
                      </span>
                      <button
                        className="focus-ring rounded-md p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-500"
                        aria-label={`Más sobre ${metric.label}`}
                      >
                        <MoreHorizontal className="size-4" />
                      </button>
                    </div>
                    <p className="mt-4 text-[22px] font-bold tracking-[-0.035em] text-slate-900 sm:text-[25px]">
                      {metric.value}
                    </p>
                    <p className="mt-0.5 text-[10px] font-semibold text-slate-500">
                      {metric.label}
                    </p>
                    <p className="mt-2 text-[9px] text-slate-400">
                      {metric.trend}
                    </p>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="mt-8">
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-[17px] font-bold tracking-[-0.02em] text-slate-900">
                    {viewTitle}
                  </h2>
                  <p className="mt-1 text-[10px] text-slate-400">
                    {filteredTasks.length}{" "}
                    {filteredTasks.length === 1 ? "tarea" : "tareas"} en esta
                    vista
                  </p>
                </div>
                <div className="flex items-center rounded-lg border border-slate-200 bg-white p-1">
                  <button
                    onClick={() => setView("my_tasks")}
                    className={clsx(
                      "focus-ring rounded-md px-2.5 py-1.5 text-[10px] font-semibold transition sm:px-3",
                      view === "my_tasks"
                        ? "bg-slate-100 text-slate-800"
                        : "text-slate-400 hover:text-slate-600",
                    )}
                  >
                    Mías
                  </button>
                  <button
                    onClick={() => setView("all_tasks")}
                    className={clsx(
                      "focus-ring rounded-md px-2.5 py-1.5 text-[10px] font-semibold transition sm:px-3",
                      view === "all_tasks"
                        ? "bg-slate-100 text-slate-800"
                        : "text-slate-400 hover:text-slate-600",
                    )}
                  >
                    Lista
                  </button>
                  <button
                    onClick={() => setView("board")}
                    className={clsx(
                      "focus-ring flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[10px] font-semibold transition sm:px-3",
                      view === "board"
                        ? "bg-slate-100 text-slate-800"
                        : "text-slate-400 hover:text-slate-600",
                    )}
                  >
                    <Columns3 className="size-3" />
                    Tablero
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative block w-full sm:hidden">
                  <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Buscar tareas…"
                    className="focus-ring h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-[11px]"
                  />
                </div>
                <label className="relative">
                  <span className="sr-only">Filtrar por prioridad</span>
                  <select
                    value={priority}
                    onChange={(event) =>
                      setPriority(
                        event.target.value as TaskPriority | "todas",
                      )
                    }
                    className="focus-ring appearance-none rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-8 text-[10px] font-semibold text-slate-500"
                  >
                    <option value="todas">Todas las prioridades</option>
                    {(Object.keys(priorityMeta) as TaskPriority[]).map(
                      (item) => (
                        <option key={item} value={item}>
                          {priorityMeta[item].label}
                        </option>
                      ),
                    )}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3 -translate-y-1/2 text-slate-400" />
                </label>
                <label className="relative">
                  <span className="sr-only">Filtrar por proyecto</span>
                  <select
                    value={projectId}
                    onChange={(event) => setProjectId(event.target.value)}
                    className="focus-ring appearance-none rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-8 text-[10px] font-semibold text-slate-500"
                  >
                    <option value="todos">Todos los proyectos</option>
                    {projects.map((project) => (
                      <option value={project.id} key={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3 -translate-y-1/2 text-slate-400" />
                </label>
                <div className="relative">
                  <button
                    onClick={() => setFiltersOpen((current) => !current)}
                    className={clsx(
                      "focus-ring flex items-center gap-1.5 rounded-lg border bg-white px-3 py-2 text-[10px] font-semibold hover:bg-slate-50",
                      filtersOpen ||
                        advancedFilters.status !== "todos" ||
                        advancedFilters.assigneeId !== "todos" ||
                        advancedFilters.due !== "todas"
                        ? "border-[#0a84ff]/40 text-[#0879ea]"
                        : "border-slate-200 text-slate-500",
                    )}
                  >
                    <SlidersHorizontal className="size-3.5" />
                    Más filtros
                  </button>
                  {filtersOpen && (
                    <AdvancedFilterPopover
                      filters={advancedFilters}
                      people={people}
                      onChange={setAdvancedFilters}
                      onClose={() => setFiltersOpen(false)}
                    />
                  )}
                </div>
                {(priority !== "todas" ||
                  projectId !== "todos" ||
                  query ||
                  advancedFilters.status !== "todos" ||
                  advancedFilters.assigneeId !== "todos" ||
                  advancedFilters.due !== "todas") && (
                  <button
                    onClick={() => {
                      setPriority("todas");
                      setProjectId("todos");
                      setQuery("");
                      setAdvancedFilters({
                        status: "todos",
                        assigneeId: "todos",
                        due: "todas",
                      });
                    }}
                    className="focus-ring rounded-lg px-2 py-2 text-[10px] font-semibold text-violet-600 hover:bg-violet-50"
                  >
                    Limpiar
                  </button>
                )}
              </div>
            </div>

            <div className="mt-4 animate-enter">
              {filteredTasks.length === 0 ? (
                <EmptyState onCreate={() => openNewTask()} />
              ) : view === "board" ? (
                <KanbanBoard
                  tasks={filteredTasks}
                  onSelect={(task) => setSelectedTaskId(task.id)}
                  onCreate={openNewTask}
                  onMove={(id, status) => {
                    void updateStatus(id, status);
                    notify(`Tarea movida a ${statusMeta[status].label}`);
                  }}
                />
              ) : (
                <TaskList
                  tasks={filteredTasks}
                  compact={settings.compactMode}
                  onSelect={(task) => setSelectedTaskId(task.id)}
                  onComplete={(task) => {
                    const next =
                      task.status === "resuelto" ? "en_progreso" : "resuelto";
                    void updateStatus(task.id, next);
                    notify(
                      next === "resuelto"
                        ? "Tarea marcada como aprobada"
                        : "Tarea reabierta",
                    );
                  }}
                />
              )}
            </div>
          </section>
        </div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex h-[66px] items-center justify-around border-t border-slate-200 bg-white/95 px-3 backdrop-blur lg:hidden">
        {[
          { id: "my_tasks" as const, label: "Mis tareas", icon: ListTodo },
          { id: "all_tasks" as const, label: "Tareas", icon: Inbox },
          { id: "board" as const, label: "Tablero", icon: LayoutDashboard },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              className={clsx(
                "focus-ring flex min-w-20 flex-col items-center gap-1 rounded-lg py-2 text-[9px] font-semibold",
                view === item.id ? "text-violet-600" : "text-slate-400",
              )}
            >
              <Icon className="size-[18px]" />
              {item.label}
            </button>
          );
        })}
      </nav>

      {selectedTask && (
        <TaskDrawer
          task={selectedTask}
          parentTask={selectedParentTask}
          subtasks={selectedSubtasks}
          timeEntries={selectedTimeEntries}
          activeTimeEntry={activeTimeEntry}
          people={people}
          currentPerson={currentPerson}
          currentUserId={currentUserId}
          currency={activeWorkspace?.currency ?? "USD"}
          canTrackTime={canTrackTime}
          canAuditTime={canAuditTime}
          onClose={() => setSelectedTaskId(null)}
          onTaskSelect={setSelectedTaskId}
          onTaskDelete={() => setTaskToDeleteId(selectedTask.id)}
          onTaskUpdate={(input) => {
            void updateTask(selectedTask.id, input);
            if (input.status) {
              notify(
                `Estado actualizado a ${statusMeta[input.status].label}`,
              );
            } else {
              notify("Tarea actualizada");
            }
          }}
          onComment={(body) => {
            void addComment(selectedTask.id, body);
            notify("Comentario agregado");
          }}
          onCommentDelete={(commentId) => {
            void deleteComment(selectedTask.id, commentId);
            notify("Comentario eliminado");
          }}
          onSubtaskCreate={(title, assigneeId) => {
            const parentId = selectedTask.id;
            void (async () => {
              try {
                await createTask({
                  title,
                  description: "",
                  projectId: selectedTask.project.id,
                  parentTaskId: parentId,
                  status: "nuevo",
                  priority: selectedTask.priority,
                  assigneeId,
                  client: selectedTask.client,
                  dueDate: selectedTask.dueDate ?? "",
                });
                setSelectedTaskId(parentId);
                notify("Subtarea creada correctamente");
              } catch {
                notify("No se pudo crear la subtarea");
              }
            })();
          }}
          onSubtaskUpdate={(taskId, input) => {
            void updateTask(taskId, input);
            notify("Subtarea actualizada");
          }}
          onAttachmentUpload={(file) => {
            void uploadAttachment(selectedTask, file)
              .then(() => notify("Archivo adjuntado"))
              .catch((error: unknown) =>
                notify(
                  error instanceof Error
                    ? error.message
                    : "No se pudo adjuntar el archivo",
                ),
              );
          }}
          onAttachmentDelete={(attachment) => {
            void deleteAttachment(selectedTask.id, attachment);
            notify("Adjunto eliminado");
          }}
          onAttachmentOpen={(attachment) => {
            void openAttachment(attachment).catch(() =>
              notify("No se pudo descargar el adjunto"),
            );
          }}
          onTimerStart={(description, billable) => {
            void startTimer(selectedTask.id, description, billable)
              .then(() => notify("Timer iniciado"))
              .catch((error: unknown) =>
                notify(
                  error instanceof Error
                    ? error.message
                    : "No se pudo iniciar el timer",
                ),
              );
          }}
          onTimerStop={(entryId) => {
            void stopTimer(entryId)
              .then(() => notify("Timer detenido"))
              .catch(() => notify("No se pudo detener el timer"));
          }}
          onManualTimeCreate={(input) => {
            void createManualTimeEntry(input)
              .then(() => notify("Tiempo agregado"))
              .catch((error: unknown) =>
                notify(
                  error instanceof Error
                    ? error.message
                    : "No se pudo agregar el tiempo",
                ),
              );
          }}
          onTimeEntryDelete={(entryId) => {
            void deleteTimeEntry(entryId);
            notify("Registro de tiempo eliminado");
          }}
        />
      )}

      {taskToDeleteId && (
        <ConfirmDialog
          title="¿Eliminar esta tarea?"
          description="También se eliminarán sus subtareas, comentarios y archivos adjuntos. Esta acción no se puede deshacer."
          confirmLabel="Eliminar tarea"
          onCancel={() => setTaskToDeleteId(null)}
          onConfirm={() => {
            void deleteTask(taskToDeleteId);
            setTaskToDeleteId(null);
            setSelectedTaskId(null);
            notify("Tarea eliminada");
          }}
        />
      )}

      {showNewTask && (
        <NewTaskModal
          projects={projects}
          people={people}
          defaultStatus={newTaskStatus}
          onClose={() => setShowNewTask(false)}
          onCreate={(input) => void handleCreate(input)}
        />
      )}

      {showNewProject && (
        <NewProjectModal
          workspaceId={activeWorkspaceId}
          onClose={() => setShowNewProject(false)}
          onCreate={(input) => void handleCreateProject(input)}
        />
      )}

      {showNewWorkspace && (
        <NewWorkspaceModal
          onClose={() => setShowNewWorkspace(false)}
          onCreate={(name) => void handleCreateWorkspace(name)}
        />
      )}

      {projectSettingsId &&
        projects.find((project) => project.id === projectSettingsId) && (
          <ProjectSettingsModal
            project={
              projects.find((project) => project.id === projectSettingsId)!
            }
            onClose={() => setProjectSettingsId(null)}
            onSave={(input) => {
              void updateProject(projectSettingsId, input);
              setProjectSettingsId(null);
              notify("Proyecto actualizado");
            }}
            onArchive={() => {
              const project = projects.find(
                (item) => item.id === projectSettingsId,
              );
              if (!project) return;
              void updateProject(project.id, {
                archived: !project.archived,
              });
              setProjectSettingsId(null);
              setProjectId("todos");
              notify(project.archived ? "Proyecto restaurado" : "Proyecto archivado");
            }}
            onDelete={() => {
              void deleteProject(projectSettingsId);
              setProjectSettingsId(null);
              setProjectId("todos");
              notify("Proyecto eliminado");
            }}
          />
        )}

      {settingsOpen && activeWorkspace && (
        <SettingsModal
          workspace={activeWorkspace}
          currentPerson={currentPerson}
          members={members}
          invitations={invitations}
          settings={settings}
          mode={mode}
          onClose={() => setSettingsOpen(false)}
          onProfileUpdate={(name) => void updateProfile(name)}
          onSettingsUpdate={updateSettings}
          onInvite={inviteMember}
          onInvitationRevoke={(id) => void revokeInvitation(id)}
          onRoleUpdate={(userId, role) =>
            void updateMemberRole(userId, role)
          }
          onMemberHourlyRateUpdate={(userId, hourlyRate) =>
            void updateMemberHourlyRate(userId, hourlyRate)
          }
          onMemberRemove={(userId) => void removeMember(userId)}
          onWorkspaceUpdate={(input) =>
            void updateWorkspace(activeWorkspace.id, input)
          }
          onWorkspaceDelete={() => {
            void deleteWorkspace(activeWorkspace.id);
            setSettingsOpen(false);
            notify("Espacio eliminado");
          }}
          onResetDemo={resetDemo}
          notify={notify}
        />
      )}

      {timeReportsOpen && activeWorkspace && canAuditTime && (
        <TimeReportsModal
          entries={timeEntries}
          people={people}
          projects={projects}
          currency={activeWorkspace.currency}
          onClose={() => setTimeReportsOpen(false)}
        />
      )}

      {toast && (
        <div
          role="status"
          className="animate-enter fixed bottom-20 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-2 rounded-xl bg-[#172033] px-4 py-3 text-[11px] font-semibold text-white shadow-xl lg:bottom-7"
        >
          <CheckCircle2 className="size-4 text-emerald-400" />
          {toast}
        </div>
      )}
    </div>
  );
}
