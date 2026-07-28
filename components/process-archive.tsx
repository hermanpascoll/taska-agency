"use client";

import {
  Archive,
  ArchiveRestore,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Copy,
  Download,
  FileText,
  FolderOpen,
  History,
  Link2,
  LockKeyhole,
  MessageSquare,
  Paperclip,
  Printer,
  RotateCcw,
  Search,
  TimerReset,
  Trash2,
  X,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { clsx } from "clsx";
import { taskDescriptionPlainText } from "@/lib/task-description";
import { elapsedSeconds, formatBytes, formatDuration } from "@/lib/task-utils";
import type {
  ArchiveTaskInput,
  Task,
  TaskBrief,
  TaskEvent,
  TimeEntry,
  UpdateTaskInput,
} from "@/lib/types";

const briefFields: Array<{
  key: keyof TaskBrief;
  label: string;
  placeholder: string;
}> = [
  {
    key: "objective",
    label: "Objetivo",
    placeholder: "Qué resultado debe lograr este proceso",
  },
  {
    key: "audience",
    label: "Audiencia",
    placeholder: "Para quién se produce",
  },
  {
    key: "keyMessage",
    label: "Mensaje clave",
    placeholder: "Qué idea no puede perderse",
  },
  {
    key: "deliverables",
    label: "Entregables",
    placeholder: "Piezas, formatos y alcance acordado",
  },
  {
    key: "references",
    label: "Referencias",
    placeholder: "Links, antecedentes o restricciones",
  },
];

function humanDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-UY", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function dossierHtml(
  task: Task,
  subtasks: Task[],
  entries: TimeEntry[],
) {
  const tracked = entries.reduce(
    (total, entry) => total + elapsedSeconds(entry),
    0,
  );
  const brief = briefFields
    .map(
      (field) =>
        `<tr><th>${field.label}</th><td>${escapeHtml(
          task.brief?.[field.key] || "—",
        )}</td></tr>`,
    )
    .join("");
  const comments = task.comments
    .filter((comment) => !comment.deletedAt)
    .map(
      (comment) =>
        `<li><strong>${escapeHtml(comment.author.name)}</strong> · ${escapeHtml(
          comment.type ?? "comment",
        )} · ${escapeHtml(comment.createdAt)}<p>${escapeHtml(
          comment.body,
        )}</p></li>`,
    )
    .join("");
  const history = [...(task.events ?? [])]
    .reverse()
    .map(
      (event) =>
        `<li><strong>${escapeHtml(event.summary)}</strong><br><small>${escapeHtml(
          event.actor?.name ?? "Sistema",
        )} · ${escapeHtml(humanDate(event.createdAt))}</small></li>`,
    )
    .join("");
  const children = subtasks
    .map(
      (item) =>
        `<li>${escapeHtml(item.code)} · ${escapeHtml(item.title)} — ${escapeHtml(
          item.assignee?.name ?? "Sin asignar",
        )}</li>`,
    )
    .join("");
  const files = task.attachments
    .filter((attachment) => !attachment.deletedAt)
    .map(
      (attachment) =>
        `<li>${escapeHtml(attachment.name)} · v${
          attachment.versionNumber ?? 1
        } · ${escapeHtml(attachment.approvalStatus ?? "draft")}</li>`,
    )
    .join("");

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Expediente ${escapeHtml(
    task.code,
  )}</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#172033;margin:48px;line-height:1.45}
header{border-bottom:2px solid #172033;padding-bottom:20px;margin-bottom:28px}h1{margin:4px 0;font-size:28px}
h2{font-size:16px;margin-top:28px;border-bottom:1px solid #ddd;padding-bottom:7px}small,.muted{color:#667085}
table{width:100%;border-collapse:collapse}th,td{text-align:left;vertical-align:top;border-bottom:1px solid #eee;padding:8px}
th{width:180px;color:#667085}li{margin:8px 0}p{margin:4px 0;white-space:pre-wrap}
.closure{background:#eefaf5;border:1px solid #b9e7d4;padding:16px;border-radius:10px}
@media print{body{margin:20mm}.no-print{display:none}}
</style></head><body>
<header><p class="muted">TASKA · EXPEDIENTE DE PROCESO</p><h1>${escapeHtml(
    task.title,
  )}</h1><strong>${escapeHtml(task.code)}</strong> · ${escapeHtml(
    task.project.name,
  )}</header>
<table>
<tr><th>Cliente</th><td>${escapeHtml(task.client || "Sin cliente")}</td></tr>
<tr><th>Categoría</th><td>${escapeHtml(task.clientCategory || "—")}</td></tr>
<tr><th>Responsable</th><td>${escapeHtml(
    task.assignee?.name ?? "Sin asignar",
  )}</td></tr>
<tr><th>Fechas</th><td>${escapeHtml(task.startDate || "—")} → ${escapeHtml(
    task.dueDate || "—",
  )}</td></tr>
<tr><th>Tiempo registrado</th><td>${escapeHtml(
    formatDuration(tracked),
  )}</td></tr>
${brief}</table>
<h2>Descripción</h2><p>${escapeHtml(
    taskDescriptionPlainText(task.description) || "—",
  )}</p>
<h2>Cierre</h2><div class="closure"><strong>Conclusión</strong><p>${escapeHtml(
    task.closureSummary || "Sin cierre documentado",
  )}</p><strong>Aprendizajes</strong><p>${escapeHtml(
    task.lessonsLearned || "—",
  )}</p><small>Archivado ${escapeHtml(humanDate(task.archivedAt))}</small></div>
<h2>Subtareas</h2><ul>${children || "<li>Sin subtareas</li>"}</ul>
<h2>Adjuntos y versiones</h2><ul>${files || "<li>Sin adjuntos</li>"}</ul>
<h2>Conversación documentada</h2><ul>${
    comments || "<li>Sin comentarios</li>"
  }</ul>
<h2>Historial inmutable</h2><ol>${history || "<li>Sin eventos</li>"}</ol>
</body></html>`;
}

function downloadDossier(task: Task, subtasks: Task[], entries: TimeEntry[]) {
  const blob = new Blob([dossierHtml(task, subtasks, entries)], {
    type: "text/html;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `expediente-${task.code.toLowerCase()}.html`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function printDossier(task: Task, subtasks: Task[], entries: TimeEntry[]) {
  const target = window.open("", "_blank", "noopener,noreferrer");
  if (!target) return;
  target.document.write(dossierHtml(task, subtasks, entries));
  target.document.close();
  target.focus();
  target.print();
}

async function copyTaskLink(taskId: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("task", taskId);
  await navigator.clipboard.writeText(url.toString());
}

export function ProcessBriefAndHistory({
  task,
  subtasks,
  timeEntries,
  onUpdate,
  notify,
}: {
  task: Task;
  subtasks: Task[];
  timeEntries: TimeEntry[];
  onUpdate: (input: UpdateTaskInput) => void;
  notify: (message: string) => void;
}) {
  return (
    <>
      <section className="mt-8 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">
              <BookOpen className="size-3.5 text-[#0a84ff]" />
              Brief estructurado
            </h3>
            <p className="mt-1 text-[10px] text-slate-400">
              Contexto reutilizable para que el proceso no dependa de la memoria.
            </p>
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() =>
                void copyTaskLink(task.id).then(() =>
                  notify("Enlace al expediente copiado"),
                )
              }
              className="focus-ring rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:text-[#0879ea]"
              aria-label="Copiar enlace al expediente"
            >
              <Link2 className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => downloadDossier(task, subtasks, timeEntries)}
              className="focus-ring rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:text-[#0879ea]"
              aria-label="Exportar expediente"
            >
              <Download className="size-3.5" />
            </button>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {briefFields.map((field) => (
            <label
              key={field.key}
              className={field.key === "deliverables" ? "sm:col-span-2" : ""}
            >
              <span className="mb-1.5 block text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400">
                {field.label}
              </span>
              <textarea
                key={`${task.id}-${field.key}`}
                defaultValue={task.brief?.[field.key] ?? ""}
                onBlur={(event) => {
                  const value = event.target.value.trim();
                  if (value !== (task.brief?.[field.key] ?? "")) {
                    onUpdate({
                      brief: { ...(task.brief ?? {}), [field.key]: value },
                    });
                  }
                }}
                placeholder={field.placeholder}
                className="focus-ring min-h-16 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[11px] leading-5 text-slate-700 placeholder:text-slate-300"
              />
            </label>
          ))}
        </div>
      </section>

    </>
  );
}

type ActivityCategory = "tasks" | "comments" | "time" | "files";
type ActivityFilter = "all" | ActivityCategory;
type ProcessActivityEvent = TaskEvent & {
  sourceTaskId: string;
  sourceTaskCode: string;
  sourceTaskTitle: string;
  fromSubtask: boolean;
};

const activityFilters: Array<{
  id: ActivityFilter;
  label: string;
}> = [
  { id: "all", label: "Todo" },
  { id: "tasks", label: "Tareas" },
  { id: "comments", label: "Comentarios" },
  { id: "time", label: "Tiempo" },
  { id: "files", label: "Archivos" },
];

function eventTime(value: string) {
  if (value === "Ahora") return Number.MAX_SAFE_INTEGER;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function eventCategory(event: TaskEvent): ActivityCategory {
  if (
    event.type.startsWith("comment_") ||
    event.type === "comment_added" ||
    event.type === "comment_removed"
  ) {
    return "comments";
  }
  if (
    event.type.startsWith("timer_") ||
    event.type.startsWith("time_") ||
    event.type === "time_added"
  ) {
    return "time";
  }
  if (event.type.startsWith("attachment_")) return "files";
  return "tasks";
}

function activityIcon(category: ActivityCategory) {
  if (category === "comments") return MessageSquare;
  if (category === "time") return TimerReset;
  if (category === "files") return Paperclip;
  return CheckCircle2;
}

function activityColors(category: ActivityCategory) {
  if (category === "comments") {
    return "bg-violet-50 text-violet-600 ring-violet-100";
  }
  if (category === "time") {
    return "bg-sky-50 text-sky-600 ring-sky-100";
  }
  if (category === "files") {
    return "bg-amber-50 text-amber-600 ring-amber-100";
  }
  return "bg-emerald-50 text-emerald-600 ring-emerald-100";
}

function activityDetail(event: ProcessActivityEvent) {
  const metadata = event.metadata ?? {};
  if (typeof metadata.excerpt === "string") return metadata.excerpt;
  if (typeof metadata.description === "string" && metadata.description) {
    return metadata.description;
  }

  for (const key of ["title", "status", "priority"] as const) {
    const change = metadata[key];
    if (
      change &&
      typeof change === "object" &&
      "from" in change &&
      "to" in change
    ) {
      const from = String((change as { from?: unknown }).from ?? "—");
      const to = String((change as { to?: unknown }).to ?? "—");
      return `${from} → ${to}`;
    }
  }
  return null;
}

function collectActivity(task: Task, subtasks: Task[]) {
  return [task, ...subtasks]
    .flatMap<ProcessActivityEvent>((source) =>
      (source.events ?? []).map((event) => ({
        ...event,
        sourceTaskId: source.id,
        sourceTaskCode: source.code,
        sourceTaskTitle: source.title,
        fromSubtask: source.id !== task.id,
      })),
    )
    .sort(
      (left, right) =>
        eventTime(right.createdAt) - eventTime(left.createdAt),
    );
}

function latestEdit(task: Task) {
  return [...(task.events ?? [])]
    .filter((event) => eventCategory(event) === "tasks")
    .sort(
      (left, right) =>
        eventTime(right.createdAt) - eventTime(left.createdAt),
    )[0];
}

export function TaskLastEdited({ task }: { task: Task }) {
  const event = latestEdit(task);
  if (!event) return null;
  const created = event.type === "task_created";

  return (
    <p
      data-testid="task-last-edited"
      className="mt-1.5 flex items-center gap-1.5 px-1 text-[9px] text-slate-400"
    >
      <span className="size-1.5 rounded-full bg-emerald-400" />
      {created ? "Creado" : "Editado"} por{" "}
      <span className="font-semibold text-slate-500">
        {event.actor?.name ?? "Sistema"}
      </span>
      <span>·</span>
      <span>{humanDate(event.createdAt)}</span>
    </p>
  );
}

export function ActivityHistory({
  task,
  subtasks,
  defaultExpanded = false,
}: {
  task: Task;
  subtasks: Task[];
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const [visibleCount, setVisibleCount] = useState(8);
  const allEvents = useMemo(
    () => collectActivity(task, subtasks),
    [task, subtasks],
  );
  const visibleEvents = useMemo(
    () =>
      allEvents.filter(
        (event) => filter === "all" || eventCategory(event) === filter,
      ),
    [allEvents, filter],
  );
  const latest = allEvents[0] ?? null;

  return (
    <div
      data-testid="process-activity-history"
      className="mt-4 overflow-hidden rounded-xl border border-white bg-white shadow-sm"
    >
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        aria-label={
          expanded
            ? "Ocultar historial del proceso"
            : "Mostrar historial del proceso"
        }
        className="focus-ring flex w-full items-center gap-3 px-3.5 py-3 text-left sm:px-4"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#0a84ff]/10 text-[#0879ea]">
          <History className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-600">
              Historial del proceso
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[8px] font-bold text-slate-500">
              {allEvents.length} movimientos
            </span>
            {subtasks.length > 0 && (
              <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[8px] font-bold text-violet-600">
                {subtasks.length}{" "}
                {subtasks.length === 1 ? "subtarea" : "subtareas"}
              </span>
            )}
          </span>
          <span className="mt-1 block truncate text-[9px] text-slate-400">
            {latest
              ? `Último: ${latest.summary} · ${
                  latest.actor?.name ?? "Sistema"
                }`
              : "Todavía no hay movimientos registrados"}
          </span>
        </span>
        <ChevronDown
          className={clsx(
            "size-4 shrink-0 text-slate-400 transition-transform",
            expanded && "rotate-180",
          )}
        />
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-3.5 pb-3.5 pt-3 sm:px-4 sm:pb-4">
          <div className="flex gap-1 overflow-x-auto pb-1">
            {activityFilters.map((item) => {
              const count =
                item.id === "all"
                  ? allEvents.length
                  : allEvents.filter(
                      (event) => eventCategory(event) === item.id,
                    ).length;
              return (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => {
                    setFilter(item.id);
                    setVisibleCount(8);
                  }}
                  className={clsx(
                    "focus-ring whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[9px] font-semibold transition",
                    filter === item.id
                      ? "bg-slate-800 text-white"
                      : "bg-slate-50 text-slate-500 hover:bg-slate-100",
                  )}
                  aria-pressed={filter === item.id}
                  aria-label={`Filtrar historial: ${item.label}`}
                >
                  {item.label} · {count}
                </button>
              );
            })}
          </div>

          <div className="relative mt-3">
            <span className="absolute bottom-5 left-[15px] top-5 w-px bg-slate-100" />
            <div className="relative divide-y divide-slate-100">
              {visibleEvents.slice(0, visibleCount).map((event) => {
                const category = eventCategory(event);
                const Icon = activityIcon(category);
                const detail = activityDetail(event);
                return (
                  <div
                    key={event.id}
                    className="relative flex gap-3 py-2.5 first:pt-1 last:pb-1"
                  >
                    <span
                      className={clsx(
                        "relative z-10 grid size-[30px] shrink-0 place-items-center rounded-full ring-4 ring-white",
                        activityColors(category),
                      )}
                    >
                      <Icon className="size-3.5" />
                    </span>
                    <div className="min-w-0 flex-1 pt-0.5">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="text-[10px] font-semibold text-slate-700">
                          {event.summary}
                        </p>
                        {event.fromSubtask && (
                          <span
                            className="max-w-full truncate rounded-md bg-violet-50 px-1.5 py-0.5 text-[8px] font-bold text-violet-600"
                            title={event.sourceTaskTitle}
                          >
                            {event.sourceTaskCode} · {event.sourceTaskTitle}
                          </span>
                        )}
                      </div>
                      {detail && (
                        <p className="mt-1 line-clamp-2 text-[9px] leading-4 text-slate-500">
                          {detail}
                        </p>
                      )}
                      <p className="mt-1 text-[8px] text-slate-400">
                        {event.actor?.name ?? "Sistema"} ·{" "}
                        {humanDate(event.createdAt)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
            {visibleEvents.length === 0 && (
              <p className="py-6 text-center text-[10px] text-slate-400">
                No hay movimientos de este tipo.
              </p>
            )}
          </div>

          {visibleEvents.length > visibleCount && (
            <button
              type="button"
              onClick={() => setVisibleCount((current) => current + 12)}
              className="focus-ring mt-3 w-full rounded-lg bg-slate-50 py-2 text-[9px] font-semibold text-slate-500 hover:bg-slate-100"
            >
              Mostrar {Math.min(12, visibleEvents.length - visibleCount)}{" "}
              movimientos anteriores
            </button>
          )}
          <p className="mt-3 flex items-center gap-1.5 text-[8px] text-slate-400">
            <LockKeyhole className="size-3" />
            Registro automático e inmutable de la tarea y sus subtareas.
          </p>
        </div>
      )}
    </div>
  );
}

export function ArchiveView({
  tasks,
  query,
  onOpen,
  onRestore,
  onTrash,
}: {
  tasks: Task[];
  query: string;
  onOpen: (taskId: string) => void;
  onRestore: (taskId: string) => void;
  onTrash: (taskId: string) => void;
}) {
  const [section, setSection] = useState<"archive" | "trash">("archive");
  const [clientFilter, setClientFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const normalizedQuery = query.trim().toLowerCase();
  const clients = [
    ...new Set(tasks.map((task) => task.client).filter(Boolean)),
  ].sort();
  const projects = [
    ...new Map(
      tasks.flatMap((task) =>
        task.projects.map((project) => [project.id, project] as const),
      ),
    ).values(),
  ].sort((a, b) => a.name.localeCompare(b.name));
  const visible = tasks.filter((task) => {
    const inSection =
      section === "trash" ? Boolean(task.deletedAt) : !task.deletedAt;
    const haystack = [
      task.code,
      task.title,
      task.client,
      task.clientCategory,
      task.closureSummary,
      task.lessonsLearned,
      ...task.tags,
      ...Object.values(task.brief ?? {}),
      ...task.comments
        .filter((comment) => !comment.deletedAt)
        .map((comment) => comment.body),
      ...task.attachments.map((attachment) => attachment.name),
      ...(task.events ?? []).map((event) => event.summary),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return (
      inSection &&
      (clientFilter === "all" || task.client === clientFilter) &&
      (projectFilter === "all" ||
        task.projects.some((project) => project.id === projectFilter)) &&
      (!normalizedQuery || haystack.includes(normalizedQuery))
    );
  });

  return (
    <div className="rounded-2xl border border-[#e6e8ee] bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4 sm:px-5">
        <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1">
          <button
            onClick={() => setSection("archive")}
            className={clsx(
              "rounded-md px-3 py-1.5 text-[10px] font-semibold",
              section === "archive"
                ? "bg-white text-slate-800 shadow-sm"
                : "text-slate-400",
            )}
          >
            Archivo
          </button>
          <button
            onClick={() => setSection("trash")}
            className={clsx(
              "rounded-md px-3 py-1.5 text-[10px] font-semibold",
              section === "trash"
                ? "bg-white text-slate-800 shadow-sm"
                : "text-slate-400",
            )}
          >
            Papelera
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={clientFilter}
            onChange={(event) => setClientFilter(event.target.value)}
            className="focus-ring rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-semibold text-slate-600"
            aria-label="Filtrar archivo por cliente"
          >
            <option value="all">Todos los clientes</option>
            {clients.map((client) => (
              <option key={client} value={client}>
                {client}
              </option>
            ))}
          </select>
          <select
            value={projectFilter}
            onChange={(event) => setProjectFilter(event.target.value)}
            className="focus-ring rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-semibold text-slate-600"
            aria-label="Filtrar archivo por proyecto"
          >
            <option value="all">Todos los proyectos</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <p className="flex items-center gap-2 text-[10px] text-slate-400">
            <LockKeyhole className="size-3.5" />
            {section === "trash"
              ? "La papelera conserva los expedientes durante 30 días"
              : "Los expedientes archivados son de solo lectura"}
          </p>
        </div>
      </div>
      <div className="divide-y divide-slate-100">
        {visible.map((task) => (
          <article
            key={task.id}
            className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:px-5"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500">
              {section === "trash" ? (
                <Trash2 className="size-4" />
              ) : (
                <Archive className="size-4" />
              )}
            </span>
            <button
              onClick={() => onOpen(task.id)}
              className="focus-ring min-w-0 flex-1 rounded-lg text-left"
            >
              <p className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#0879ea]">
                {task.code} · {task.client || "Sin cliente"}
              </p>
              <h3 className="mt-1 truncate text-[12px] font-bold text-slate-800">
                {task.title}
              </h3>
              <p className="mt-1 line-clamp-1 text-[10px] text-slate-400">
                {task.closureSummary || "Sin conclusión documentada"} ·{" "}
                {humanDate(task.deletedAt ?? task.archivedAt)}
              </p>
            </button>
            <div className="flex gap-2">
              <button
                onClick={() => onOpen(task.id)}
                className="focus-ring flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-semibold text-slate-600"
              >
                <FolderOpen className="size-3.5" />
                Abrir
              </button>
              <button
                onClick={() => onRestore(task.id)}
                className="focus-ring flex items-center gap-1.5 rounded-lg bg-[#0a84ff]/10 px-3 py-2 text-[10px] font-semibold text-[#0879ea]"
              >
                <RotateCcw className="size-3.5" />
                Restaurar
              </button>
              {section === "archive" && (
                <button
                  onClick={() => onTrash(task.id)}
                  className="focus-ring rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                  aria-label={`Mover ${task.title} a la papelera`}
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
          </article>
        ))}
        {visible.length === 0 && (
          <div className="grid place-items-center px-5 py-16 text-center">
            <Search className="size-7 text-slate-300" />
            <p className="mt-3 text-[11px] font-semibold text-slate-500">
              {normalizedQuery ||
              clientFilter !== "all" ||
              projectFilter !== "all"
                ? "No encontramos expedientes con esos criterios."
                : section === "trash"
                  ? "La papelera está vacía."
                  : "Todavía no archivaste ningún proceso."}
            </p>
            {section === "archive" &&
              !normalizedQuery &&
              clientFilter === "all" &&
              projectFilter === "all" && (
                <p className="mt-2 max-w-sm text-[10px] leading-5 text-slate-400">
                  Cuando cierres una tarea, elegí “Archivar” y documentá la
                  conclusión y los aprendizajes. Quedará disponible como
                  referencia para el equipo.
                </p>
              )}
          </div>
        )}
      </div>
    </div>
  );
}

export function ArchivedTaskDrawer({
  task,
  subtasks,
  timeEntries,
  onClose,
  onRestore,
  onTrash,
  onAttachmentOpen,
  notify,
}: {
  task: Task;
  subtasks: Task[];
  timeEntries: TimeEntry[];
  onClose: () => void;
  onRestore: () => void;
  onTrash: () => void;
  onAttachmentOpen: (attachmentId: string) => void;
  notify: (message: string) => void;
}) {
  const tracked = timeEntries.reduce(
    (total, entry) => total + elapsedSeconds(entry),
    0,
  );

  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <button
        className="absolute inset-0 bg-slate-950/30 backdrop-blur-[1px]"
        onClick={onClose}
        aria-label="Cerrar expediente"
      />
      <aside
        data-testid="archived-task-drawer"
        className="animate-drawer relative flex h-full w-full max-w-[700px] flex-col bg-white shadow-[-24px_0_60px_rgba(15,23,42,0.16)]"
      >
        <header className="flex h-16 shrink-0 items-center gap-2 border-b border-slate-100 px-5 sm:px-7">
          <span className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-[10px] font-bold text-slate-600">
            <LockKeyhole className="size-3.5" />
            {task.deletedAt ? "En papelera" : "Expediente archivado"}
          </span>
          <div className="ml-auto flex gap-1">
            <button
              onClick={onRestore}
              className="focus-ring flex items-center gap-1.5 rounded-lg bg-[#0a84ff]/10 px-3 py-2 text-[10px] font-semibold text-[#0879ea]"
            >
              <ArchiveRestore className="size-3.5" />
              Restaurar
            </button>
            {!task.deletedAt && (
              <button
                onClick={onTrash}
                className="focus-ring rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                aria-label="Mover a la papelera"
              >
                <Trash2 className="size-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="focus-ring rounded-lg p-2 text-slate-400 hover:bg-slate-100"
              aria-label="Cerrar"
            >
              <X className="size-5" />
            </button>
          </div>
        </header>
        <div className="soft-scrollbar flex-1 overflow-y-auto px-5 py-6 sm:px-8">
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#0879ea]">
            {task.code} · {task.project.name}
          </p>
          <h2 className="mt-2 text-[27px] font-bold tracking-[-0.03em] text-slate-900">
            {task.title}
          </h2>
          <TaskLastEdited task={task} />
          <p className="mt-2 text-[12px] leading-6 text-slate-500">
            {taskDescriptionPlainText(task.description) || "Sin descripción"}
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              onClick={() =>
                void copyTaskLink(task.id).then(() =>
                  notify("Enlace al expediente copiado"),
                )
              }
              className="focus-ring flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-semibold text-slate-600"
            >
              <Copy className="size-3.5" />
              Copiar enlace
            </button>
            <button
              onClick={() => downloadDossier(task, subtasks, timeEntries)}
              className="focus-ring flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-semibold text-slate-600"
            >
              <Download className="size-3.5" />
              Exportar HTML
            </button>
            <button
              onClick={() => printDossier(task, subtasks, timeEntries)}
              className="focus-ring flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-semibold text-slate-600"
            >
              <Printer className="size-3.5" />
              Imprimir / PDF
            </button>
          </div>

          <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Cliente", task.client || "—"],
              ["Responsable", task.assignee?.name ?? "—"],
              ["Tiempo", formatDuration(tracked)],
              ["Archivado", humanDate(task.archivedAt)],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-xl border border-slate-100 bg-slate-50 p-3"
              >
                <p className="text-[8px] font-bold uppercase tracking-[0.08em] text-slate-400">
                  {label}
                </p>
                <p className="mt-1 text-[11px] font-semibold text-slate-700">
                  {value}
                </p>
              </div>
            ))}
          </div>

          <section className="mt-7 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
            <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.08em] text-emerald-700">
              <CheckCircle2 className="size-4" />
              Cierre documentado
            </h3>
            <p className="mt-3 whitespace-pre-wrap text-[12px] leading-5 text-slate-700">
              {task.closureSummary || "Sin conclusión documentada."}
            </p>
            {task.lessonsLearned && (
              <>
                <p className="mt-4 text-[9px] font-bold uppercase tracking-[0.08em] text-emerald-700">
                  Aprendizajes
                </p>
                <p className="mt-1 whitespace-pre-wrap text-[11px] leading-5 text-slate-600">
                  {task.lessonsLearned}
                </p>
              </>
            )}
          </section>

          <section className="mt-7">
            <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">
              <BookOpen className="size-3.5" />
              Brief
            </h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {briefFields.map((field) => (
                <div
                  key={field.key}
                  className="rounded-xl border border-slate-100 bg-slate-50 p-3"
                >
                  <p className="text-[8px] font-bold uppercase tracking-[0.08em] text-slate-400">
                    {field.label}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-[11px] leading-5 text-slate-600">
                    {task.brief?.[field.key] || "—"}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-7">
            <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">
              <FileText className="size-3.5" />
              Adjuntos y versiones
            </h3>
            <div className="mt-3 space-y-2">
              {task.attachments.map((attachment) => (
                <button
                  key={attachment.id}
                  disabled={Boolean(attachment.deletedAt)}
                  onClick={() => onAttachmentOpen(attachment.id)}
                  className="focus-ring flex w-full items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 text-left disabled:opacity-45"
                >
                  <FileText className="size-4 text-[#0879ea]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11px] font-semibold text-slate-700">
                      {attachment.name}
                    </span>
                    <span className="text-[9px] text-slate-400">
                      v{attachment.versionNumber ?? 1} ·{" "}
                      {attachment.approvalStatus ?? "draft"} ·{" "}
                      {formatBytes(attachment.size)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="mt-7">
            <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">
              <MessageSquare className="size-3.5" />
              Conversación documentada
            </h3>
            <div className="mt-3 space-y-3">
              {task.comments.map((comment) => (
                <div
                  key={comment.id}
                  className="rounded-xl border border-slate-100 bg-slate-50 p-3"
                >
                  <p className="text-[9px] font-bold text-slate-500">
                    {comment.author.name} · {comment.type ?? "comment"} ·{" "}
                    {comment.createdAt}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-[11px] leading-5 text-slate-600">
                    {comment.deletedAt
                      ? "Comentario retirado (conservado en auditoría)"
                      : comment.body}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-7 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <div>
              <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">
                Resumen de actividad
              </h3>
              <p className="mt-1 text-[10px] text-slate-400">
                Historial consolidado de la tarea y todas sus subtareas.
              </p>
            </div>
            <ActivityHistory
              task={task}
              subtasks={subtasks}
              defaultExpanded
            />
          </section>
        </div>
      </aside>
    </div>
  );
}

export function ArchiveTaskModal({
  task,
  onClose,
  onConfirm,
}: {
  task: Task;
  onClose: () => void;
  onConfirm: (input: ArchiveTaskInput) => void;
}) {
  const [summary, setSummary] = useState("");
  const [lessons, setLessons] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!summary.trim()) return;
    onConfirm({
      closureSummary: summary.trim(),
      lessonsLearned: lessons.trim(),
    });
  }

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center p-4">
      <button
        className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="Cancelar archivo"
      />
      <form
        onSubmit={submit}
        className="animate-enter relative w-full max-w-[520px] rounded-2xl bg-white p-6 shadow-2xl sm:p-7"
      >
        <span className="grid size-11 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
          <Archive className="size-5" />
        </span>
        <h2 className="mt-4 text-xl font-bold tracking-[-0.02em] text-slate-900">
          Cerrar y archivar {task.code}
        </h2>
        <p className="mt-2 text-[11px] leading-5 text-slate-500">
          El expediente y sus subtareas quedarán de solo lectura. Podrás
          restaurarlos desde Archivo.
        </p>
        <label className="mt-5 block">
          <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
            Conclusión del proceso
          </span>
          <textarea
            autoFocus
            required
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            placeholder="Qué se entregó, qué se aprobó y cuál fue el resultado"
            className="focus-ring min-h-28 w-full resize-y rounded-xl border border-slate-200 px-3 py-3 text-[12px] leading-5"
          />
        </label>
        <label className="mt-4 block">
          <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
            Aprendizajes o decisiones reutilizables
          </span>
          <textarea
            value={lessons}
            onChange={(event) => setLessons(event.target.value)}
            placeholder="Qué conviene repetir, evitar o usar como antecedente"
            className="focus-ring min-h-20 w-full resize-y rounded-xl border border-slate-200 px-3 py-3 text-[12px] leading-5"
          />
        </label>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="focus-ring rounded-lg px-4 py-2.5 text-[10px] font-semibold text-slate-500 hover:bg-slate-100"
          >
            Cancelar
          </button>
          <button
            disabled={!summary.trim()}
            className="focus-ring rounded-lg bg-emerald-600 px-4 py-2.5 text-[10px] font-bold text-white disabled:opacity-40"
          >
            Archivar expediente
          </button>
        </div>
      </form>
    </div>
  );
}
