"use client";

import {
  CalendarDays,
  ChevronDown,
  Circle,
  Layers3,
  LoaderCircle,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { TaskRichTextEditor } from "@/components/task-rich-text-editor";
import {
  findProcessTemplate,
  processTemplates,
} from "@/lib/process-templates";
import type {
  Client,
  NewTaskInput,
  Person,
  Project,
  TaskAttachment,
  TaskPriority,
  TaskRecurrence,
  TaskStatus,
} from "@/lib/types";

export type PendingTaskImage = {
  draftId: string;
  file: File;
};

const statusLabels: Record<TaskStatus, string> = {
  nuevo: "Por hacer",
  en_progreso: "En curso",
  esperando: "En revisión",
  resuelto: "Completada",
};

const priorityLabels: Record<TaskPriority, string> = {
  urgente: "Urgente",
  alta: "Alta",
  media: "Media",
  baja: "Baja",
};

const recurrenceLabels: Record<TaskRecurrence, string> = {
  none: "No se repite",
  daily: "Diaria",
  weekly: "Semanal",
  biweekly: "Cada dos semanas",
  monthly: "Mensual",
};

function fileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("No se pudo leer la imagen."));
    reader.readAsDataURL(file);
  });
}

function draftId() {
  return `draft-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`;
}

function Avatar({ person }: { person: Person | null }) {
  return person ? (
    <span
      className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-full text-[11px] font-bold text-white"
      style={{ background: person.color }}
      title={person.name}
    >
      {person.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={person.avatarUrl}
          alt={person.name}
          className="h-full w-full object-cover"
        />
      ) : (
        person.initials
      )}
    </span>
  ) : (
    <span className="grid size-8 shrink-0 place-items-center rounded-full border border-dashed border-slate-400 text-slate-400">
      ?
    </span>
  );
}

export function NewTaskModal({
  projects,
  clients,
  people,
  defaultProjectId,
  defaultStatus,
  onClose,
  onCreate,
}: {
  projects: Project[];
  clients: Client[];
  people: Person[];
  defaultProjectId?: string;
  defaultStatus: TaskStatus;
  onClose: () => void;
  onCreate: (
    task: NewTaskInput,
    pendingImages: PendingTaskImage[],
  ) => Promise<void>;
}) {
  const defaultProject =
    projects.find((project) => project.id === defaultProjectId) ?? projects[0];
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState(defaultProject?.id ?? "");
  const [projectIds, setProjectIds] = useState<string[]>(
    defaultProject ? [defaultProject.id] : [],
  );
  const [status, setStatus] = useState<TaskStatus>(defaultStatus);
  const [priority, setPriority] = useState<TaskPriority>("media");
  const [assigneeId, setAssigneeId] = useState(people[0]?.id ?? "");
  const [clientId, setClientId] = useState(defaultProject?.clientId ?? "");
  const [clientCategory, setClientCategory] = useState(
    defaultProject?.clientCategory ?? "",
  );
  const [tags, setTags] = useState("");
  const [startDate, setStartDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [dueDate, setDueDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().slice(0, 10);
  });
  const [dueTime, setDueTime] = useState("17:00");
  const [recurrenceRule, setRecurrenceRule] =
    useState<TaskRecurrence>("none");
  const [recurrenceInterval, setRecurrenceInterval] = useState(1);
  const [templateId, setTemplateId] = useState("");
  const [draftImages, setDraftImages] = useState<
    Array<PendingTaskImage & { attachment: TaskAttachment }>
  >([]);
  const [submitting, setSubmitting] = useState(false);
  const selectedClient = clients.find((client) => client.id === clientId) ?? null;
  const selectedProject =
    projects.find((project) => project.id === projectId) ?? defaultProject;
  const assignee = people.find((person) => person.id === assigneeId) ?? null;

  const draftDocument = useMemo(
    () => ({
      id: "new-task-draft",
      description,
      attachments: draftImages.map((item) => item.attachment),
    }),
    [description, draftImages],
  );

  async function uploadDraftImages(files: File[]) {
    const uploader = people[0];
    if (!uploader) throw new Error("No hay un usuario disponible para cargar la imagen.");
    const created = await Promise.all(
      files.map(async (file) => {
        if (file.size > 100 * 1024 * 1024) {
          throw new Error(`${file.name} supera el límite de 100 MB.`);
        }
        const id = draftId();
        const attachment: TaskAttachment = {
          id,
          taskId: "new-task-draft",
          name: file.name,
          size: file.size,
          mimeType: file.type || "image/png",
          storagePath: null,
          dataUrl: await fileAsDataUrl(file),
          createdAt: "Ahora",
          uploader,
        };
        return { draftId: id, file, attachment };
      }),
    );
    setDraftImages((current) => [...current, ...created]);
    return created.map((item) => item.attachment);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || !projectId || submitting) return;
    setSubmitting(true);
    try {
      const referencedImages = draftImages
        .filter((item) => description.includes(`data-attachment-id="${item.draftId}"`))
        .map(({ draftId: id, file }) => ({ draftId: id, file }));
      await onCreate(
        {
          title: title.trim(),
          description,
          projectId,
          projectIds,
          status,
          priority,
          assigneeId,
          client: selectedClient?.name ?? "",
          clientId: clientId || null,
          clientCategory: clientCategory || null,
          startDate,
          dueDate,
          dueTime,
          tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
          recurrenceRule,
          recurrenceInterval,
          templateId: templateId || undefined,
        },
        referencedImages,
      );
    } finally {
      setSubmitting(false);
    }
  }

  const selectProject = (nextProjectId: string) => {
    const nextProject = projects.find((project) => project.id === nextProjectId);
    setProjectId(nextProjectId);
    setClientId(nextProject?.clientId ?? "");
    setClientCategory(nextProject?.clientCategory ?? "");
    setProjectIds((current) =>
      current.includes(nextProjectId) ? current : [nextProjectId, ...current],
    );
  };

  return (
    <div className="fixed inset-y-0 right-0 z-[70] flex w-full max-w-[760px] border-l border-slate-200 bg-white lg:top-[56px] lg:w-[48vw]">
      <form
        aria-label="Nueva tarea"
        role="dialog"
        aria-modal="false"
        onSubmit={submit}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
            return;
          }
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.requestSubmit();
          }
        }}
        className="task-detail-shell animate-task-modal relative flex h-full w-full flex-col overflow-hidden bg-white"
      >
        <header className="task-detail-toolbar flex min-h-[64px] shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 sm:px-6">
          <span className="grid size-8 shrink-0 place-items-center rounded-full border border-slate-400 text-slate-400" title="Nueva tarea sin completar">
            <Circle className="size-5" />
          </span>
          <input
            autoFocus
            required
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Escribe el nombre de la tarea"
            aria-label="Título de la nueva tarea"
            className="task-panel-title min-w-0 flex-1 border border-transparent bg-transparent px-2 py-2 text-[20px] font-semibold text-slate-900 outline-none placeholder:text-slate-500 hover:border-slate-300 focus:border-slate-400"
          />
          <div className="hidden items-center -space-x-1 sm:flex">
            {assignee && <Avatar person={assignee} />}
          </div>
          <button type="button" onClick={onClose} className="focus-ring rounded-lg p-2 text-slate-400 hover:bg-slate-100" aria-label="Cerrar">
            <X className="size-5" />
          </button>
        </header>

        <div className="task-detail-content soft-scrollbar flex-1 overflow-y-auto bg-white px-5 py-5 sm:px-8 sm:py-7">
          <section aria-label="Datos principales de la nueva tarea" className="grid gap-3 border-b border-slate-200 pb-5 md:grid-cols-3">
            <label className="flex min-w-0 items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-50">
              <span className="size-2.5 rounded-full" style={{ background: status === "resuelto" ? "#2E9B78" : status === "esperando" ? "#3C8FD5" : status === "en_progreso" ? "#E89732" : "#6C5CE7" }} />
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] text-slate-500">Estado</span>
                <select value={status} onChange={(event) => setStatus(event.target.value as TaskStatus)} className="mt-0.5 w-full bg-transparent text-[13px] font-medium text-slate-800 outline-none">
                  {(Object.keys(statusLabels) as TaskStatus[]).map((item) => <option key={item} value={item}>{statusLabels[item]}</option>)}
                </select>
              </span>
            </label>

            <label className="flex min-w-0 items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-50">
              <Avatar person={assignee} />
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] text-slate-500">Responsable</span>
                <select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)} className="mt-0.5 w-full bg-transparent text-[13px] font-medium text-slate-800 outline-none">
                  <option value="">Sin responsable</option>
                  {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                </select>
              </span>
            </label>

            <details className="group relative rounded-lg px-2 py-2 hover:bg-slate-50">
              <summary className="focus-ring flex cursor-pointer list-none items-center gap-3">
                <span className="grid size-8 place-items-center rounded-full border border-slate-300 text-slate-500"><CalendarDays className="size-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] text-slate-500">Planificación</span>
                  <span className="block truncate text-[13px] font-medium text-slate-800">{dueDate || "Sin fecha"}{dueTime ? ` · ${dueTime}` : ""}</span>
                </span>
                <ChevronDown className="size-4 text-slate-400 transition group-open:rotate-180" />
              </summary>
              <div className="mt-3 grid gap-3 border-t border-slate-200 pt-3 sm:grid-cols-2">
                <label className="text-[10px] text-slate-500">Inicio<input type="date" value={startDate} max={dueDate || undefined} onChange={(event) => { const value = event.target.value; setStartDate(value); if (dueDate && value > dueDate) setDueDate(value); }} className="mt-1 w-full rounded-lg border border-slate-200 bg-transparent px-2 py-2 text-[12px] text-slate-800" /></label>
                <label className="text-[10px] text-slate-500">Vencimiento<input type="date" value={dueDate} min={startDate || undefined} onChange={(event) => setDueDate(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-transparent px-2 py-2 text-[12px] text-slate-800" /></label>
                <label className="text-[10px] text-slate-500">Hora<input type="time" value={dueTime} onChange={(event) => setDueTime(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-transparent px-2 py-2 text-[12px] text-slate-800" /></label>
                <label className="text-[10px] text-slate-500">Repetición<select value={recurrenceRule} onChange={(event) => setRecurrenceRule(event.target.value as TaskRecurrence)} className="mt-1 w-full rounded-lg border border-slate-200 bg-transparent px-2 py-2 text-[12px] text-slate-800">{(Object.keys(recurrenceLabels) as TaskRecurrence[]).map((rule) => <option key={rule} value={rule}>{recurrenceLabels[rule]}</option>)}</select></label>
                {recurrenceRule !== "none" && <label className="text-[10px] text-slate-500">Repetir cada<input type="number" min={1} max={52} value={recurrenceInterval} onChange={(event) => setRecurrenceInterval(Math.max(1, Number(event.target.value) || 1))} className="mt-1 w-full rounded-lg border border-slate-200 bg-transparent px-2 py-2 text-[12px] text-slate-800" /></label>}
              </div>
            </details>
          </section>

          <section className="mt-5">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex min-w-[260px] flex-1 items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5">
                <span className="size-3 rounded" style={{ background: selectedProject?.color ?? "#6C5CE7" }} />
                <span className="text-[10px] text-slate-500">Proyecto</span>
                <select required aria-label="Proyecto principal" value={projectId} onChange={(event) => selectProject(event.target.value)} className="min-w-0 flex-1 bg-transparent text-[13px] font-semibold text-slate-800 outline-none">
                  {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                </select>
              </label>
              <label className="flex min-w-[190px] items-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5">
                <span className="text-[10px] text-slate-500">Prioridad</span>
                <select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)} className="flex-1 bg-transparent text-[13px] font-semibold text-slate-800 outline-none">{(Object.keys(priorityLabels) as TaskPriority[]).map((item) => <option key={item} value={item}>{priorityLabels[item]}</option>)}</select>
              </label>
            </div>
          </section>

          <section className="task-detail-description mt-6">
            <h3 className="text-[15px] font-bold text-slate-800">Descripción</h3>
            <TaskRichTextEditor
              task={draftDocument}
              onUpdate={setDescription}
              onUpload={uploadDraftImages}
              onOpen={() => undefined}
              updateDelay={0}
            />
          </section>

          <details className="group mt-6 border-t border-slate-200 pt-4">
            <summary className="focus-ring flex cursor-pointer list-none items-center gap-2 py-2 text-[12px] font-semibold text-slate-600">
              <Layers3 className="size-4" />
              Proyecto, cliente y opciones adicionales
              <ChevronDown className="ml-auto size-4 transition group-open:rotate-180" />
            </summary>
            <div className="grid gap-4 py-4 sm:grid-cols-2">
              <fieldset className="sm:col-span-2">
                <legend className="mb-2 text-[11px] font-semibold text-slate-600">También visible en</legend>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {projects.map((project) => {
                    const checked = projectIds.includes(project.id);
                    return <label key={project.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-[11px] text-slate-700"><input type="checkbox" checked={checked} disabled={project.id === projectId} onChange={(event) => setProjectIds((current) => event.target.checked ? [...new Set([...current, project.id])] : current.filter((id) => id !== project.id))} /><span className="size-2 rounded-full" style={{ background: project.color }} />{project.name}</label>;
                  })}
                </div>
              </fieldset>
              <label className="text-[11px] font-semibold text-slate-600">Cliente<select value={clientId} onChange={(event) => { setClientId(event.target.value); setClientCategory(""); }} className="mt-2 w-full rounded-lg border border-slate-200 bg-transparent px-3 py-2.5 text-[12px] text-slate-800"><option value="">Sin cliente</option>{clients.filter((client) => !client.archived).map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
              <label className="text-[11px] font-semibold text-slate-600">Categoría / servicio<select value={clientCategory} disabled={!selectedClient} onChange={(event) => setClientCategory(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 bg-transparent px-3 py-2.5 text-[12px] text-slate-800"><option value="">Sin categoría</option>{(selectedClient?.categories ?? []).map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
              <label className="text-[11px] font-semibold text-slate-600 sm:col-span-2">Etiquetas<input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="Diseño, Cartelería, Cambio de cliente" className="mt-2 w-full rounded-lg border border-slate-200 bg-transparent px-3 py-2.5 text-[12px] text-slate-800" /></label>
              <label className="text-[11px] font-semibold text-slate-600 sm:col-span-2"><span className="flex items-center gap-2"><Sparkles className="size-4 text-violet-500" />Plantilla de proceso</span><select value={templateId} onChange={(event) => { const id = event.target.value; const template = findProcessTemplate(id); setTemplateId(id); if (!template) return; setPriority(template.priority); setTags(template.tags.join(", ")); if (!description.trim()) setDescription(template.description); }} className="mt-2 w-full rounded-lg border border-slate-200 bg-transparent px-3 py-2.5 text-[12px] text-slate-800"><option value="">Empezar sin plantilla</option>{processTemplates.map((template) => <option key={template.id} value={template.id}>{template.name} · {template.steps.length} pasos</option>)}</select></label>
            </div>
          </details>
        </div>

        <footer className="task-detail-comment-composer flex shrink-0 items-center gap-3 border-t border-slate-200 bg-white px-5 py-3 sm:px-7">
          <span className="hidden text-[10px] text-slate-500 sm:block">⌘ Enter para crear</span>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={onClose} className="focus-ring rounded-lg px-4 py-2 text-[11px] font-semibold text-slate-500 hover:bg-slate-100">Cancelar</button>
            <button disabled={submitting || !title.trim()} className="focus-ring flex items-center gap-2 rounded-lg bg-[#5b4bec] px-4 py-2.5 text-[11px] font-bold text-white disabled:opacity-50">
              {submitting ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}
              {submitting ? "Creando…" : "Crear tarea"}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}
