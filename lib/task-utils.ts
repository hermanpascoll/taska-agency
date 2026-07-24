import type {
  AdvancedFilters,
  Task,
  TaskPriority,
  TimeEntry,
  TeamRole,
} from "@/lib/types";

export function formatDueLabel(value: string | null, now = new Date()) {
  if (!value) return "Sin fecha";
  const due = new Date(`${value}T12:00:00`);
  const today = new Date(now);
  const diff = Math.round(
    (due.setHours(0, 0, 0, 0) - today.setHours(0, 0, 0, 0)) / 86_400_000,
  );
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Mañana";
  if (diff === -1) return "Ayer";
  return new Intl.DateTimeFormat("es-UY", {
    day: "numeric",
    month: "short",
  }).format(due);
}

export function nextTaskCode(tasks: Task[]) {
  const highest = tasks.reduce((current, task) => {
    const value = Number(task.code.replace(/\D/g, ""));
    return Number.isFinite(value) ? Math.max(current, value) : current;
  }, 150);
  return `AG-${highest + 1}`;
}

export function isTaskAssignedToCurrentUser(
  task: Task,
  currentUserId: string,
  demoAssigneeId?: string,
) {
  return (
    task.assignee?.id === currentUserId ||
    Boolean(demoAssigneeId && task.assignee?.id === demoAssigneeId)
  );
}

export function matchesTaskFilters(
  task: Task,
  {
    query,
    priority,
    projectId,
    advanced,
    now = new Date(),
  }: {
    query: string;
    priority: TaskPriority | "todas";
    projectId: string;
    advanced: AdvancedFilters;
    now?: Date;
  },
) {
  const normalized = query.trim().toLowerCase();
  const matchesQuery =
    !normalized ||
    task.title.toLowerCase().includes(normalized) ||
    task.code.toLowerCase().includes(normalized) ||
    task.client.toLowerCase().includes(normalized) ||
    task.project.name.toLowerCase().includes(normalized) ||
    task.tags.some((tag) => tag.toLowerCase().includes(normalized));
  const matchesPriority =
    priority === "todas" || task.priority === priority;
  const matchesProject =
    projectId === "todos" ||
    task.projects.some((project) => project.id === projectId);
  const matchesStatus =
    advanced.status === "todos" || task.status === advanced.status;
  const matchesAssignee =
    advanced.assigneeId === "todos" ||
    (advanced.assigneeId === "sin_asignar"
      ? !task.assignee
      : task.assignee?.id === advanced.assigneeId);

  let matchesDue = true;
  if (advanced.due !== "todas") {
    if (!task.dueDate) {
      matchesDue = advanced.due === "sin_fecha";
    } else {
      const due = new Date(`${task.dueDate}T23:59:59`);
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(now);
      todayEnd.setHours(23, 59, 59, 999);
      const weekEnd = new Date(todayEnd);
      weekEnd.setDate(weekEnd.getDate() + 7);
      matchesDue =
        advanced.due === "vencidas"
          ? due < todayStart && task.status !== "resuelto"
          : advanced.due === "hoy"
            ? due >= todayStart && due <= todayEnd
            : advanced.due === "semana"
              ? due >= todayStart && due <= weekEnd
              : false;
    }
  }

  return (
    matchesQuery &&
    matchesPriority &&
    matchesProject &&
    matchesStatus &&
    matchesAssignee &&
    matchesDue
  );
}

export function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function safeStorageName(value: string) {
  const safe = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return safe || "archivo";
}

export function elapsedSeconds(entry: TimeEntry, now = new Date()) {
  if (entry.endedAt) return entry.durationSeconds;
  return Math.max(
    entry.durationSeconds,
    Math.floor((now.getTime() - new Date(entry.startedAt).getTime()) / 1000),
  );
}

export function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;
  return [hours, minutes, remaining]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

export function timeEntryCost(entry: TimeEntry, now = new Date()) {
  if (!entry.billable) return 0;
  return (elapsedSeconds(entry, now) / 3600) * entry.hourlyRate;
}

function csvCell(value: string | number | boolean) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildTimeReportCsv(entries: TimeEntry[], currency: string) {
  const header = [
    "Fecha",
    "Persona",
    "Correo",
    "Proyecto",
    "Tarea",
    "Código",
    "Descripción",
    "Inicio",
    "Fin",
    "Duración (segundos)",
    "Duración (horas)",
    "Facturable",
    `Tarifa (${currency}/h)`,
    `Costo (${currency})`,
  ];
  const rows = entries.map((entry) => {
    const duration = elapsedSeconds(entry);
    return [
      entry.startedAt.slice(0, 10),
      entry.user.name,
      entry.user.email ?? "",
      entry.projectName,
      entry.taskTitle,
      entry.taskCode,
      entry.description,
      entry.startedAt,
      entry.endedAt ?? "En curso",
      duration,
      (duration / 3600).toFixed(2),
      entry.billable ? "Sí" : "No",
      entry.hourlyRate.toFixed(2),
      timeEntryCost(entry).toFixed(2),
    ];
  });
  return [header, ...rows]
    .map((row) => row.map((value) => csvCell(value)).join(","))
    .join("\n");
}

export function canAuditTimeReports(role: TeamRole | undefined) {
  return role === "owner" || role === "admin";
}
