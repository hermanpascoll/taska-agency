"use client";

import {
  AlertTriangle,
  Archive,
  Activity,
  BarChart3,
  Bell,
  Bold,
  Building2,
  CalendarDays,
  ChartGantt,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock3,
  Columns3,
  CircleDollarSign,
  ContactRound,
  Code2,
  Download,
  FileDown,
  FileSpreadsheet,
  FileText,
  Files,
  FolderKanban,
  Gauge,
  GitBranch,
  GripVertical,
  Hourglass,
  Highlighter,
  Home,
  ImagePlus,
  Inbox,
  IndentIncrease,
  Italic,
  Link2,
  List,
  ListChecks,
  ListFilter,
  ListOrdered,
  ListTodo,
  LoaderCircle,
  LogOut,
  Maximize2,
  Menu,
  MessagesSquare,
  MessageSquare,
  Minimize2,
  MoreHorizontal,
  Moon,
  Paperclip,
  Pause,
  Play,
  Plus,
  Printer,
  Briefcase,
  Quote,
  Redo2,
  Repeat2,
  Search,
  Settings,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Strikethrough,
  Tags,
  TimerReset,
  Target,
  ThumbsUp,
  Trash2,
  Underline,
  Undo2,
  UserPlus,
  UserRound,
  UsersRound,
  Users,
  Workflow,
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
import { AdminPanel } from "@/components/admin-panel";
import { GanttChart } from "@/components/gantt-chart";
import {
  ActivityHistory,
  ArchivedTaskDrawer,
  ArchiveTaskModal,
  ArchiveView,
  ProcessBriefAndHistory,
  TaskLastEdited,
} from "@/components/process-archive";
import { useTaskWorkspace } from "@/hooks/use-task-workspace";
import { useStrategicWork, type GoalStatus } from "@/hooks/use-strategic-work";
import {
  appendDescriptionAttachments,
  parseTaskDescription,
  serializeTaskDescription,
  type TaskDescriptionBlock,
} from "@/lib/task-description";
import {
  findProcessTemplate,
  processTemplates,
} from "@/lib/process-templates";
import { createClient } from "@/lib/supabase/client";
import {
  buildTimeReportCsv,
  canAuditTimeReports,
  elapsedSeconds,
  formatBytes,
  formatDuration,
  isStaleTimer,
  isTaskAssignedToCurrentUser,
  matchesTaskFilters,
  nonOverlappingTimeSeconds,
  overlappingTimeSeconds,
  timeEntryCost,
} from "@/lib/task-utils";
import type {
  AdvancedFilters,
  AppNotification,
  AppSettings,
  ArchiveTaskInput,
  AttachmentApprovalStatus,
  Client,
  CommentType,
  CommentVisibility,
  NewClientInput,
  NewManualTimeEntryInput,
  NewProjectInput,
  NewTaskInput,
  Person,
  Project,
  Task,
  TaskAttachment,
  TaskPriority,
  TaskRecurrence,
  TaskStatus,
  TeamInvitation,
  TeamRole,
  TimeEntry,
  UpdateClientInput,
  UpdateProjectInput,
  UpdateTaskInput,
  UpdateWorkspaceInput,
  Workspace,
  WorkspaceMember,
} from "@/lib/types";

type View =
  | "home"
  | "my_tasks"
  | "inbox"
  | "reporting"
  | "portfolios"
  | "goals"
  | "all_tasks"
  | "board"
  | "gantt"
  | "archive";
type TaskScope = "mine" | "all";
type ProjectTab =
  | "overview"
  | "list"
  | "board"
  | "calendar"
  | "timeline"
  | "gantt"
  | "dashboard"
  | "messages"
  | "files"
  | "workflow";

const recurrenceLabels: Record<TaskRecurrence, string> = {
  none: "No se repite",
  daily: "Diaria",
  weekly: "Semanal",
  biweekly: "Cada dos semanas",
  monthly: "Mensual",
};

const commentTypeLabels: Record<CommentType, string> = {
  comment: "Comentario",
  internal_note: "Nota interna",
  client_feedback: "Feedback del cliente",
  decision: "Decisión",
  approval: "Aprobación",
  change_request: "Pedido de cambio",
  delivery: "Entrega",
  incident: "Incidente",
};

const teamRoleLabels: Record<TeamRole, string> = {
  owner: "Dueño",
  admin: "Administrador",
  agent: "Integrante",
  viewer: "Solo lectura",
};

const attachmentStatusLabels: Record<AttachmentApprovalStatus, string> = {
  draft: "Borrador",
  sent: "Enviado",
  changes_requested: "Cambios solicitados",
  approved: "Aprobado",
  final: "Final",
};

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
    label: "Completada",
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

function isImageFile(mimeType: string) {
  return mimeType.startsWith("image/");
}

function PendingDescriptionAttachment({
  file,
  onRemove,
}: {
  file: File;
  onRemove: () => void;
}) {
  const [previewUrl] = useState<string | null>(() =>
    isImageFile(file.type) ? URL.createObjectURL(file) : null,
  );

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  return (
    <div className="group relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
      {previewUrl ? (
        <>
          {/* Private blob previews cannot use the Next image optimizer. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt={`Vista previa de ${file.name}`}
            className="max-h-72 w-full bg-slate-100 object-contain"
          />
          <div className="flex items-center gap-2 border-t border-slate-200 bg-white/95 px-3 py-2">
            <FileText className="size-3.5 shrink-0 text-[#0a84ff]" />
            <span className="min-w-0 flex-1 truncate text-[10px] font-semibold text-slate-600">
              {file.name}
            </span>
            <span className="shrink-0 text-[9px] text-slate-400">
              {formatBytes(file.size)}
            </span>
          </div>
        </>
      ) : (
        <div className="flex items-center gap-3 px-3 py-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white text-[#0a84ff] shadow-sm">
            <FileText className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[10px] font-semibold text-slate-700">
              {file.name}
            </span>
            <span className="mt-0.5 block text-[9px] text-slate-400">
              {formatBytes(file.size)} · Se cargará al crear la tarea
            </span>
          </span>
        </div>
      )}
      <button
        type="button"
        onClick={onRemove}
        className="focus-ring absolute right-2 top-2 grid size-7 place-items-center rounded-full bg-slate-950/70 text-white shadow-lg backdrop-blur hover:bg-rose-600"
        aria-label={`Quitar ${file.name}`}
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

function EmbeddedTaskAttachment({
  attachment,
  onOpen,
}: {
  attachment: TaskAttachment;
  onOpen: () => void;
}) {
  const image = isImageFile(attachment.mimeType);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const previewUrl = attachment.dataUrl ?? signedUrl;

  useEffect(() => {
    let active = true;
    if (
      !image ||
      attachment.dataUrl ||
      !attachment.storagePath
    ) {
      return () => {
        active = false;
      };
    }

    const supabase = createClient();
    if (!supabase) return;
    void supabase.storage
      .from("task-attachments")
      .createSignedUrl(attachment.storagePath, 60 * 60)
      .then(({ data }: { data: { signedUrl: string } | null }) => {
        if (active && data?.signedUrl) setSignedUrl(data.signedUrl);
      });

    return () => {
      active = false;
    };
  }, [
    attachment.dataUrl,
    attachment.storagePath,
    image,
  ]);

  if (!image) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="focus-ring flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-left hover:border-[#0a84ff]/30 hover:bg-[#0a84ff]/5"
        aria-label={`Abrir adjunto ${attachment.name}`}
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white text-[#0a84ff] shadow-sm">
          <FileText className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[10px] font-semibold text-slate-700">
            {attachment.name}
          </span>
          <span className="mt-0.5 block text-[9px] text-slate-400">
            {formatBytes(attachment.size)} · v
            {attachment.versionNumber ?? 1}
          </span>
        </span>
        <Download className="size-3.5 shrink-0 text-slate-400" />
      </button>
    );
  }

  return (
    <figure className="overflow-hidden rounded-lg bg-white">
      <button
        type="button"
        onClick={onOpen}
        className="focus-ring block w-full overflow-hidden rounded-lg bg-slate-100"
        aria-label={`Abrir imagen ${attachment.name}`}
      >
        {previewUrl ? (
          <>
            {/* Private signed URLs and data URLs bypass image optimization. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt={`Adjunto embebido ${attachment.name}`}
              className="max-h-[520px] w-full object-contain"
            />
          </>
        ) : (
          <span className="grid min-h-44 place-items-center text-[10px] text-slate-400">
            Cargando vista previa…
          </span>
        )}
      </button>
      <figcaption className="flex items-center gap-2 px-1 py-2">
        <FileText className="size-3.5 shrink-0 text-[#0a84ff]" />
        <span className="min-w-0 flex-1 truncate text-[10px] font-semibold text-slate-600">
          {attachment.name}
        </span>
        <span className="shrink-0 text-[9px] text-slate-400">
          {formatBytes(attachment.size)} · v
          {attachment.versionNumber ?? 1}
        </span>
      </figcaption>
    </figure>
  );
}

function DescriptionInlineText({ text }: { text: string }) {
  const parts = text.split(
    /(\*\*[^*\n]+\*\*|~~[^~\n]+~~|==[^=\n]+==|<u>[^<\n]+<\/u>|`[^`\n]+`|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)|https?:\/\/[^\s]+|\*[^*\n]+\*)/g,
  );
  return (
    <>
      {parts.filter(Boolean).map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith("*") && part.endsWith("*")) {
          return <em key={`${part}-${index}`}>{part.slice(1, -1)}</em>;
        }
        if (part.startsWith("~~") && part.endsWith("~~")) {
          return <del key={`${part}-${index}`}>{part.slice(2, -2)}</del>;
        }
        if (part.startsWith("==") && part.endsWith("==")) {
          return (
            <mark
              key={`${part}-${index}`}
              className="rounded bg-amber-200/80 px-0.5 text-inherit"
            >
              {part.slice(2, -2)}
            </mark>
          );
        }
        if (part.startsWith("<u>") && part.endsWith("</u>")) {
          return <u key={`${part}-${index}`}>{part.slice(3, -4)}</u>;
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <code
              key={`${part}-${index}`}
              className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.9em] text-violet-700"
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        const markdownLink = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
        if (markdownLink) {
          return (
            <a
              key={`${part}-${index}`}
              href={markdownLink[2]}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-[#0879ea] underline decoration-[#0a84ff]/35 underline-offset-2"
            >
              {markdownLink[1]}
            </a>
          );
        }
        if (/^https?:\/\//.test(part)) {
          return (
            <a
              key={`${part}-${index}`}
              href={part}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-[#0879ea] underline decoration-[#0a84ff]/35 underline-offset-2"
            >
              {part}
            </a>
          );
        }
        return <span key={`${part}-${index}`}>{part}</span>;
      })}
    </>
  );
}

function DescriptionTextPreview({ text }: { text: string }) {
  if (!text.trim()) {
    return (
      <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-[11px] text-slate-400">
        Agregá el brief, contexto, objetivos y referencias de esta tarea.
      </p>
    );
  }

  const lines = text.split("\n");
  const content = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.startsWith("```")) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }
      content.push(
        <pre
          key={`code-${index}`}
          className="overflow-x-auto rounded-xl bg-slate-950 px-4 py-3 font-mono text-[12px] leading-6 text-slate-100"
        >
          <code>{codeLines.join("\n")}</code>
        </pre>,
      );
      continue;
    }
    if (!line.trim()) {
      content.push(<div key={index} className="h-2" />);
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      content.push(<hr key={index} className="my-4 border-slate-200" />);
      continue;
    }
    if (line.startsWith("### ")) {
      content.push(
        <h5 key={index} className="pt-2 text-[15px] font-bold text-slate-900">
          <DescriptionInlineText text={line.slice(4)} />
        </h5>,
      );
      continue;
    }
    if (line.startsWith("## ")) {
      content.push(
        <h4 key={index} className="pt-3 text-[17px] font-bold text-slate-900">
          <DescriptionInlineText text={line.slice(3)} />
        </h4>,
      );
      continue;
    }
    if (line.startsWith("# ")) {
      content.push(
        <h3 key={index} className="pt-3 text-[20px] font-bold text-slate-900">
          <DescriptionInlineText text={line.slice(2)} />
        </h3>,
      );
      continue;
    }
    const checklist = line.match(/^[-*]\s\[([ xX])\]\s(.+)/);
    if (checklist) {
      const checked = checklist[1].toLowerCase() === "x";
      content.push(
        <p key={index} className="flex items-start gap-2.5 pl-1">
          <span
            className={clsx(
              "mt-1.5 grid size-4 shrink-0 place-items-center rounded border",
              checked
                ? "border-emerald-500 bg-emerald-500 text-white"
                : "border-slate-300 bg-white",
            )}
          >
            {checked && <Check className="size-3 stroke-[3]" />}
          </span>
          <span className={clsx(checked && "text-slate-400 line-through")}>
            <DescriptionInlineText text={checklist[2]} />
          </span>
        </p>,
      );
      continue;
    }
    if (/^[-*]\s/.test(line)) {
      content.push(
        <p key={index} className="flex gap-3 pl-2">
          <span className="mt-[11px] size-1.5 shrink-0 rounded-full bg-slate-400" />
          <span>
            <DescriptionInlineText text={line.replace(/^[-*]\s/, "")} />
          </span>
        </p>,
      );
      continue;
    }
    const numbered = line.match(/^(\d+)\.\s(.+)/);
    if (numbered) {
      content.push(
        <p key={index} className="flex gap-3 pl-1">
          <span className="w-5 shrink-0 text-right font-semibold text-slate-400">
            {numbered[1]}.
          </span>
          <span>
            <DescriptionInlineText text={numbered[2]} />
          </span>
        </p>,
      );
      continue;
    }
    if (line.startsWith("> ")) {
      content.push(
        <blockquote
          key={index}
          className="border-l-3 border-violet-400 pl-4 italic text-slate-600"
        >
          <DescriptionInlineText text={line.slice(2)} />
        </blockquote>,
      );
      continue;
    }
    content.push(
      <p key={index}>
        <DescriptionInlineText text={line} />
      </p>,
    );
  }

  return (
    <div className="space-y-2 text-[14px] leading-7 text-slate-700">
      {content}
    </div>
  );
}

function TaskDescriptionEditor({
  task,
  onUpdate,
  onUpload,
  onOpen,
  onCreateSubtask,
}: {
  task: Task;
  onUpdate: (description: string) => void;
  onUpload: (files: File[]) => Promise<TaskAttachment[]>;
  onOpen: (attachment: TaskAttachment) => void;
  onCreateSubtask: (title: string) => void;
}) {
  const initialBlocks = parseTaskDescription(task.description, task.attachments);
  const [blocks, setBlocks] = useState<TaskDescriptionBlock[]>(initialBlocks);
  const [editing, setEditing] = useState(() => !task.description.trim());
  const [uploading, setUploading] = useState(false);
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);
  const [activeBlockIndex, setActiveBlockIndex] = useState(0);
  const blocksRef = useRef(initialBlocks);
  const fileInput = useRef<HTMLInputElement>(null);
  const textareaRefs = useRef<Record<number, HTMLTextAreaElement | null>>({});
  const historyRef = useRef<TaskDescriptionBlock[][]>([initialBlocks]);
  const historyIndexRef = useRef(0);
  const loadedTaskId = useRef(task.id);
  const selection = useRef({
    blockIndex: 0,
    offset: task.description.length,
    end: task.description.length,
  });
  const savedDescription = useRef(task.description);
  const activeAttachmentIds = task.attachments
    .filter((attachment) => !attachment.deletedAt)
    .map((attachment) => attachment.id)
    .join("|");

  useEffect(() => {
    const taskChanged = loadedTaskId.current !== task.id;
    if (!taskChanged && savedDescription.current === task.description) return;
    const next = parseTaskDescription(task.description, task.attachments);
    loadedTaskId.current = task.id;
    savedDescription.current = task.description;
    blocksRef.current = next;
    historyRef.current = [next];
    historyIndexRef.current = 0;
    setHasSelection(false);
    setActiveBlockIndex(0);
    setSlashMenuOpen(false);
    setBlocks(next);
  }, [task.attachments, task.description, task.id]);

  useEffect(() => {
    const referenced = new Set(
      blocksRef.current.flatMap((block) =>
        block.type === "attachment" ? [block.attachmentId] : [],
      ),
    );
    const missing = task.attachments
      .filter(
        (attachment) =>
          !attachment.deletedAt && !referenced.has(attachment.id),
      )
      .map<TaskDescriptionBlock>((attachment) => ({
        type: "attachment",
        attachmentId: attachment.id,
      }));
    if (!missing.length) return;
    const next = [...blocksRef.current, ...missing];
    blocksRef.current = next;
    setBlocks(next);
  }, [activeAttachmentIds, task.attachments]);

  function setLocalBlocks(
    next: TaskDescriptionBlock[],
    recordHistory = false,
  ) {
    if (
      recordHistory &&
      serializeTaskDescription(next) !==
        serializeTaskDescription(blocksRef.current)
    ) {
      const history = historyRef.current.slice(
        0,
        historyIndexRef.current + 1,
      );
      history.push(next.map((block) => ({ ...block })));
      if (history.length > 80) history.shift();
      historyRef.current = history;
      historyIndexRef.current = history.length - 1;
    }
    blocksRef.current = next;
    setBlocks(next);
  }

  function persist(next: TaskDescriptionBlock[], recordHistory = false) {
    const description = serializeTaskDescription(next);
    savedDescription.current = description;
    setLocalBlocks(next, recordHistory);
    if (description !== task.description) onUpdate(description);
  }

  function updateText(index: number, text: string, recordHistory = true) {
    setLocalBlocks(
      blocksRef.current.map((block, blockIndex) =>
        blockIndex === index && block.type === "text"
          ? { ...block, text }
          : block,
      ),
      recordHistory,
    );
  }

  function rememberSelection(
    index: number,
    target: HTMLTextAreaElement,
  ) {
    selection.current = {
      blockIndex: index,
      offset: target.selectionStart,
      end: target.selectionEnd,
    };
    setActiveBlockIndex(index);
    setHasSelection(target.selectionEnd > target.selectionStart);
  }

  function restoreSelection(index: number, start: number, end = start) {
    selection.current = { blockIndex: index, offset: start, end };
    setActiveBlockIndex(index);
    setHasSelection(end > start);
    window.requestAnimationFrame(() => {
      const textarea = textareaRefs.current[index];
      textarea?.focus();
      textarea?.setSelectionRange(start, end);
    });
  }

  function applyTextFormat(
    prefix: string,
    suffix = "",
    placeholder = "texto",
    linePrefix = false,
  ) {
    const current = blocksRef.current;
    const targetIndex = selection.current.blockIndex;
    const target = current[targetIndex];
    if (!target || target.type !== "text") return;
    const rawStart = Math.min(selection.current.offset, target.text.length);
    const rawEnd = Math.max(rawStart, Math.min(selection.current.end, target.text.length));
    if (linePrefix) {
      const start = target.text.lastIndexOf("\n", rawStart - 1) + 1;
      const nextBreak = target.text.indexOf("\n", rawEnd);
      const end = nextBreak === -1 ? target.text.length : nextBreak;
      const selectedLines = target.text.slice(start, end) || placeholder;
      const replacement = selectedLines
        .split("\n")
        .map((line) => `${prefix}${line}`)
        .join("\n");
      const nextText = `${target.text.slice(0, start)}${replacement}${target.text.slice(end)}`;
      updateText(targetIndex, nextText);
      restoreSelection(targetIndex, start + prefix.length, start + replacement.length);
      return;
    }
    const selected = target.text.slice(rawStart, rawEnd);
    const content = selected || placeholder;
    const replacement = `${prefix}${content}${suffix}`;
    const nextText = `${target.text.slice(0, rawStart)}${replacement}${target.text.slice(rawEnd)}`;
    updateText(targetIndex, nextText);
    restoreSelection(
      targetIndex,
      rawStart + prefix.length,
      rawStart + prefix.length + content.length,
    );
  }

  function undoDescription() {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current -= 1;
    const next = historyRef.current[historyIndexRef.current];
    setLocalBlocks(next.map((block) => ({ ...block })));
  }

  function redoDescription() {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current += 1;
    const next = historyRef.current[historyIndexRef.current];
    setLocalBlocks(next.map((block) => ({ ...block })));
  }

  function removeSlashTrigger() {
    const targetIndex = selection.current.blockIndex;
    const target = blocksRef.current[targetIndex];
    if (!target || target.type !== "text") return;
    const cursor = selection.current.offset;
    if (cursor <= 0 || target.text[cursor - 1] !== "/") return;
    const nextText = `${target.text.slice(0, cursor - 1)}${target.text.slice(cursor)}`;
    updateText(targetIndex, nextText);
    restoreSelection(targetIndex, cursor - 1);
  }

  function runSlashCommand(action: () => void) {
    removeSlashTrigger();
    window.requestAnimationFrame(action);
    setSlashMenuOpen(false);
  }

  function createSubtaskFromSelection() {
    const target = blocksRef.current[selection.current.blockIndex];
    if (!target || target.type !== "text") return;
    const title = target.text
      .slice(selection.current.offset, selection.current.end)
      .replace(/[#*_~=`<>\[\]()]/g, "")
      .trim();
    if (!title) return;
    onCreateSubtask(title);
  }

  function runFormatCommand(command: string) {
    switch (command) {
      case "bold":
        applyTextFormat("**", "**", "negrita");
        break;
      case "italic":
        applyTextFormat("*", "*", "cursiva");
        break;
      case "underline":
        applyTextFormat("<u>", "</u>", "subrayado");
        break;
      case "highlight":
        applyTextFormat("==", "==", "resaltado");
        break;
      case "strike":
        applyTextFormat("~~", "~~", "tachado");
        break;
      case "bullets":
        applyTextFormat("- ", "", "Elemento", true);
        break;
      case "numbered":
        applyTextFormat("1. ", "", "Elemento", true);
        break;
      case "checklist":
        applyTextFormat("- [ ] ", "", "Pendiente", true);
        break;
      case "indent":
        applyTextFormat("  ", "", "Texto", true);
        break;
      case "link":
        applyTextFormat("[", "](https://)", "texto del enlace");
        break;
      case "code":
        applyTextFormat("`", "`", "código");
        break;
      case "quote":
        applyTextFormat("> ", "", "Cita", true);
        break;
    }
  }

  async function insertFiles(files: File[]) {
    if (!files.length || uploading) return;
    setUploading(true);
    try {
      const uploaded = await onUpload(files);
      if (!uploaded.length) return;
      const uploadedIds = new Set(uploaded.map((attachment) => attachment.id));
      const current = blocksRef.current.filter(
        (block) =>
          block.type !== "attachment" ||
          !uploadedIds.has(block.attachmentId),
      );
      const requestedIndex = Math.min(
        selection.current.blockIndex,
        Math.max(0, current.length - 1),
      );
      const target = current[requestedIndex];
      const attachmentBlocks = uploaded.map<TaskDescriptionBlock>(
        (attachment) => ({
          type: "attachment",
          attachmentId: attachment.id,
        }),
      );

      if (target?.type === "text") {
        const offset = Math.min(selection.current.offset, target.text.length);
        const before = target.text.slice(0, offset);
        const after = target.text.slice(offset);
        persist([
          ...current.slice(0, requestedIndex),
          ...(before ? [{ type: "text" as const, text: before }] : []),
          ...attachmentBlocks,
          { type: "text", text: after },
          ...current.slice(requestedIndex + 1),
        ], true);
      } else {
        persist(
          [...current, ...attachmentBlocks, { type: "text", text: "" }],
          true,
        );
      }
    } finally {
      setUploading(false);
    }
  }

  return (
    <div
      className="task-document mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition focus-within:border-[#0a84ff]/40 focus-within:ring-2 focus-within:ring-[#0a84ff]/10"
      data-testid="task-description-document"
    >
      <div className="space-y-4 px-4 py-4 sm:px-6 sm:py-5">
        {blocks.map((block, index) => {
          if (block.type === "text") {
            if (!editing) {
              return (
                <div
                  key={`${task.id}-text-${index}`}
                  className="block w-full rounded-xl px-1 py-1"
                >
                  <DescriptionTextPreview text={block.text} />
                </div>
              );
            }
            return (
              <div key={`${task.id}-text-${index}`} className="relative">
                <textarea
                  ref={(element) => {
                    textareaRefs.current[index] = element;
                  }}
                  value={block.text}
                  rows={Math.min(
                    24,
                    Math.max(5, block.text.split("\n").length + 2),
                  )}
                  onChange={(event) => updateText(index, event.target.value)}
                  onSelect={(event) =>
                    rememberSelection(index, event.currentTarget)
                  }
                  onFocus={(event) =>
                    rememberSelection(index, event.currentTarget)
                  }
                  onKeyUp={(event) =>
                    rememberSelection(index, event.currentTarget)
                  }
                  onClick={(event) =>
                    rememberSelection(index, event.currentTarget)
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Escape" && slashMenuOpen) {
                      event.preventDefault();
                      event.stopPropagation();
                      setSlashMenuOpen(false);
                      return;
                    }
                    if (event.key === "/" && !event.metaKey && !event.ctrlKey) {
                      setSlashMenuOpen(true);
                    }
                    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
                      event.preventDefault();
                      applyTextFormat("**", "**", "negrita");
                    }
                    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "i") {
                      event.preventDefault();
                      applyTextFormat("*", "*", "cursiva");
                    }
                    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
                      event.preventDefault();
                      if (event.shiftKey) redoDescription();
                      else undoDescription();
                    }
                  }}
                  onBlur={(event) => {
                    rememberSelection(index, event.currentTarget);
                    persist(blocksRef.current);
                  }}
                  placeholder={'Escribí "/" para ver el menú'}
                  className="block min-h-32 w-full resize-y border-0 bg-transparent text-[13px] leading-6 text-slate-700 outline-none placeholder:text-slate-400"
                  aria-label="Descripción de la tarea"
                />
                {slashMenuOpen && activeBlockIndex === index && (
                  <div className="absolute left-2 top-10 z-30 grid w-64 gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-2xl">
                    <p className="px-2 pb-1 pt-0.5 text-[8px] font-bold uppercase tracking-[0.12em] text-slate-400">
                      Insertar bloque
                    </p>
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() =>
                        runSlashCommand(() =>
                          applyTextFormat("# ", "", "Título", true),
                        )
                      }
                      className="focus-ring flex items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-slate-100"
                    >
                      <Bold className="size-4 text-slate-500" />
                      <span>
                        <span className="block text-[10px] font-semibold text-slate-700">Título</span>
                        <span className="block text-[8px] text-slate-400">Encabezado principal</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() =>
                        runSlashCommand(() =>
                          applyTextFormat("- ", "", "Elemento", true),
                        )
                      }
                      className="focus-ring flex items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-slate-100"
                    >
                      <List className="size-4 text-slate-500" />
                      <span>
                        <span className="block text-[10px] font-semibold text-slate-700">Lista con viñetas</span>
                        <span className="block text-[8px] text-slate-400">Lista simple</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() =>
                        runSlashCommand(() =>
                          applyTextFormat("- [ ] ", "", "Pendiente", true),
                        )
                      }
                      className="focus-ring flex items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-slate-100"
                    >
                      <ListChecks className="size-4 text-slate-500" />
                      <span>
                        <span className="block text-[10px] font-semibold text-slate-700">Lista de tareas</span>
                        <span className="block text-[8px] text-slate-400">Checklist</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() =>
                        runSlashCommand(() =>
                          applyTextFormat("> ", "", "Cita", true),
                        )
                      }
                      className="focus-ring flex items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-slate-100"
                    >
                      <Quote className="size-4 text-slate-500" />
                      <span>
                        <span className="block text-[10px] font-semibold text-slate-700">Cita</span>
                        <span className="block text-[8px] text-slate-400">Destacar un texto</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() =>
                        runSlashCommand(() =>
                          applyTextFormat("```\n", "\n```", "código"),
                        )
                      }
                      className="focus-ring flex items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-slate-100"
                    >
                      <Code2 className="size-4 text-slate-500" />
                      <span>
                        <span className="block text-[10px] font-semibold text-slate-700">Bloque de código</span>
                        <span className="block text-[8px] text-slate-400">Código con formato</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        removeSlashTrigger();
                        setSlashMenuOpen(false);
                        fileInput.current?.click();
                      }}
                      className="focus-ring flex items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-slate-100"
                    >
                      <ImagePlus className="size-4 text-slate-500" />
                      <span>
                        <span className="block text-[10px] font-semibold text-slate-700">
                          Imagen o archivo
                        </span>
                        <span className="block text-[8px] text-slate-400">
                          Embebido en la descripción
                        </span>
                      </span>
                    </button>
                  </div>
                )}
              </div>
            );
          }

          const attachment = task.attachments.find(
            (item) =>
              item.id === block.attachmentId && !item.deletedAt,
          );
          if (!attachment) return null;
          return (
            <div
              key={`${task.id}-attachment-${block.attachmentId}`}
              className="group/embedded relative"
              data-testid="embedded-description-block"
            >
              <EmbeddedTaskAttachment
                attachment={attachment}
                onOpen={() => onOpen(attachment)}
              />
              <button
                type="button"
                onClick={() =>
                  persist(
                    blocksRef.current.filter(
                      (_, blockIndex) => blockIndex !== index,
                    ),
                    true,
                  )
                }
                className="focus-ring absolute right-2 top-2 grid size-7 place-items-center rounded-full bg-slate-950/70 text-white opacity-0 shadow-lg backdrop-blur transition hover:bg-rose-600 group-hover/embedded:opacity-100 focus:opacity-100"
                aria-label={`Quitar ${attachment.name} de la descripción`}
              >
                <X className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>
      <div className="task-document-toolbar flex min-h-12 flex-wrap items-center gap-0.5 border-t border-slate-200 bg-slate-50/80 px-3 py-2">
        {editing && (
          <>
            <button
              type="button"
              disabled={uploading}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => fileInput.current?.click()}
              className="focus-ring grid size-8 place-items-center rounded-md text-slate-500 hover:bg-white hover:text-slate-900 disabled:opacity-40"
              aria-label="Insertar imagen o archivo en la descripción"
              title="Insertar imagen o archivo"
            >
              {uploading ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
            </button>
            <span className="mx-1 h-6 w-px bg-slate-200" />
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={undoDescription}
              className="focus-ring grid size-8 place-items-center rounded-md text-slate-500 hover:bg-white hover:text-slate-900"
              aria-label="Deshacer"
              title="Deshacer (⌘Z)"
            >
              <Undo2 className="size-4" />
            </button>
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={redoDescription}
              className="focus-ring grid size-8 place-items-center rounded-md text-slate-500 hover:bg-white hover:text-slate-900"
              aria-label="Rehacer"
              title="Rehacer (⌘⇧Z)"
            >
              <Redo2 className="size-4" />
            </button>
            <span className="mx-1 h-6 w-px bg-slate-200" />
            {[
              {
                label: "Negrita",
                title: "Negrita (⌘B)",
                icon: Bold,
                command: "bold",
              },
              {
                label: "Cursiva",
                title: "Cursiva (⌘I)",
                icon: Italic,
                command: "italic",
              },
              {
                label: "Subrayado",
                title: "Subrayado",
                icon: Underline,
                command: "underline",
              },
              {
                label: "Resaltar",
                title: "Resaltar texto",
                icon: Highlighter,
                command: "highlight",
              },
              {
                label: "Tachado",
                title: "Tachado",
                icon: Strikethrough,
                command: "strike",
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => runFormatCommand(item.command)}
                  className="focus-ring grid size-8 place-items-center rounded-md text-slate-500 hover:bg-white hover:text-slate-900"
                  aria-label={item.label}
                  title={item.title}
                >
                  <Icon className="size-4" />
                </button>
              );
            })}
            <span className="mx-1 h-6 w-px bg-slate-200" />
            {[
              {
                label: "Lista con viñetas",
                icon: List,
                command: "bullets",
              },
              {
                label: "Lista numerada",
                icon: ListOrdered,
                command: "numbered",
              },
              {
                label: "Lista de tareas",
                icon: ListChecks,
                command: "checklist",
              },
              {
                label: "Aumentar sangría",
                icon: IndentIncrease,
                command: "indent",
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => runFormatCommand(item.command)}
                  className="focus-ring grid size-8 place-items-center rounded-md text-slate-500 hover:bg-white hover:text-slate-900"
                  aria-label={item.label}
                  title={item.label}
                >
                  <Icon className="size-4" />
                </button>
              );
            })}
            <span className="mx-1 h-6 w-px bg-slate-200" />
            {[
              {
                label: "Insertar enlace",
                icon: Link2,
                command: "link",
              },
              {
                label: "Código en línea",
                icon: Code2,
                command: "code",
              },
              {
                label: "Cita",
                icon: Quote,
                command: "quote",
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => runFormatCommand(item.command)}
                  className="focus-ring grid size-8 place-items-center rounded-md text-slate-500 hover:bg-white hover:text-slate-900"
                  aria-label={item.label}
                  title={item.label}
                >
                  <Icon className="size-4" />
                </button>
              );
            })}
            <span className="mx-1 h-6 w-px bg-slate-200" />
            <button
              type="button"
              disabled={!hasSelection}
              onMouseDown={(event) => event.preventDefault()}
              onClick={createSubtaskFromSelection}
              className="focus-ring flex h-8 items-center gap-1.5 rounded-md px-2 text-[9px] font-semibold text-slate-500 hover:bg-white hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-35"
              aria-label="Crear tarea desde el texto seleccionado"
              title="Crear una subtarea con el texto seleccionado"
            >
              <ListChecks className="size-4" />
              <span className="hidden xl:inline">Crear tarea</span>
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => {
            if (editing) persist(blocksRef.current);
            setEditing((current) => !current);
          }}
          className="focus-ring ml-auto rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[9px] font-semibold text-slate-600 hover:text-[#0879ea]"
        >
          {editing ? "Guardar documento" : "Editar documento"}
        </button>
      </div>
      <input
        ref={fileInput}
        type="file"
        multiple
        aria-label="Seleccionar archivos para la tarea"
        className="sr-only"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          void insertFiles(files);
          event.target.value = "";
        }}
      />
    </div>
  );
}

function ActiveTimersMenu({
  entries,
  open,
  staleTimerHours,
  warnOverlaps,
  onToggle,
  onClose,
  onOpen,
  onStop,
  onStopAll,
}: {
  entries: TimeEntry[];
  open: boolean;
  staleTimerHours: number;
  warnOverlaps: boolean;
  onToggle: () => void;
  onClose: () => void;
  onOpen: (taskId: string) => void;
  onStop: (entryId: string) => void;
  onStopAll: () => void;
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (entries.length === 0) return;
    const interval = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, [entries.length]);

  const totalSeconds = entries.reduce(
    (total, entry) => total + elapsedSeconds(entry, now),
    0,
  );
  const effectiveSeconds = nonOverlappingTimeSeconds(entries, now);
  const overlapSeconds = overlappingTimeSeconds(entries, now);
  const staleEntries = entries.filter((entry) =>
    isStaleTimer(entry, staleTimerHours, now),
  );
  const hasWarning =
    (warnOverlaps && overlapSeconds > 0) || staleEntries.length > 0;

  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className={clsx(
          "focus-ring relative flex h-9 items-center gap-2 rounded-lg border px-2.5 text-[10px] font-semibold transition sm:h-10 sm:px-3",
          entries.length > 0
            ? hasWarning
              ? "border-rose-200 bg-rose-50 text-rose-700 shadow-sm hover:bg-rose-100"
              : "border-[#0a84ff]/25 bg-[#0a84ff]/8 text-[#0879ea] shadow-sm hover:bg-[#0a84ff]/12"
            : "border-transparent text-slate-400 hover:bg-slate-100 hover:text-slate-700",
        )}
        aria-label={`Timers activos: ${entries.length}`}
        aria-expanded={open}
      >
        <span className="relative">
          <Clock3 className="size-[17px]" />
          {entries.length > 0 && (
            <span
              className={clsx(
                "absolute -right-1 -top-1 size-2 animate-pulse rounded-full ring-2",
                hasWarning
                  ? "bg-rose-500 ring-rose-50"
                  : "bg-[#0a84ff] ring-blue-50",
              )}
            />
          )}
        </span>
        {entries.length > 0 && (
          <>
            <span
              className={clsx(
                "grid min-w-4 place-items-center rounded-full px-1 py-0.5 text-[8px] font-bold leading-none text-white",
                hasWarning ? "bg-rose-600" : "bg-[#0a84ff]",
              )}
            >
              {entries.length}
            </span>
            <span className="hidden font-mono font-bold tabular-nums xl:inline">
              {formatDuration(totalSeconds)}
            </span>
          </>
        )}
      </button>

      {open && (
        <div
          className="mac-popover fixed left-3 right-3 top-16 z-50 w-auto max-w-none overflow-hidden rounded-2xl border border-black/10 bg-white/95 shadow-[0_22px_65px_rgba(15,23,42,.22)] backdrop-blur-2xl sm:absolute sm:left-auto sm:right-0 sm:top-[calc(100%+8px)] sm:w-[390px] sm:max-w-[calc(100vw-24px)]"
          data-testid="active-timers-menu"
        >
          <header className="flex items-center gap-3 border-b border-black/5 px-4 py-3.5">
            <span
              className={clsx(
                "grid size-9 shrink-0 place-items-center rounded-xl",
                entries.length > 0
                  ? hasWarning
                    ? "bg-rose-50 text-rose-600"
                    : "bg-[#0a84ff]/10 text-[#0879ea]"
                  : "bg-slate-100 text-slate-400",
              )}
            >
              <Clock3 className="size-[18px]" />
            </span>
            <div className="min-w-0">
              <p className="text-[12px] font-bold text-slate-800">
                Timers activos
              </p>
              <p className="mt-0.5 text-[9px] text-slate-400">
                {entries.length === 0
                  ? "No estás registrando tiempo ahora"
                  : `${entries.length} ${entries.length === 1 ? "tarea en curso" : "tareas en curso"} · ${formatDuration(effectiveSeconds)} reales`}
              </p>
            </div>
            {entries.length > 1 && (
              <button
                onClick={onStopAll}
                className="focus-ring ml-auto rounded-lg px-2 py-1.5 text-[9px] font-semibold text-rose-600 hover:bg-rose-50"
              >
                Detener todos
              </button>
            )}
            <button
              onClick={onClose}
              className={clsx(
                "focus-ring rounded-md p-1 text-slate-400 hover:bg-slate-100",
                entries.length <= 1 && "ml-auto",
              )}
              aria-label="Cerrar timers activos"
            >
              <X className="size-3.5" />
            </button>
          </header>

          {hasWarning && (
            <div className="border-b border-amber-200 bg-amber-50 px-4 py-3">
              <p className="flex items-start gap-2 text-[10px] font-semibold leading-4 text-amber-700">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  {overlapSeconds > 0 &&
                    `Hay ${formatDuration(overlapSeconds)} superpuestos. El total bruto es ${formatDuration(totalSeconds)} y el real ${formatDuration(effectiveSeconds)}. `}
                  {staleEntries.length > 0 &&
                    `${staleEntries.length} ${staleEntries.length === 1 ? "timer lleva" : "timers llevan"} más de ${staleTimerHours} horas activo${staleEntries.length === 1 ? "" : "s"}.`}
                </span>
              </p>
            </div>
          )}

          <div className="soft-scrollbar max-h-[430px] overflow-y-auto p-2">
            {entries.map((entry) => (
              <article
                key={entry.id}
                className="group rounded-xl border border-transparent p-3 transition hover:border-slate-200 hover:bg-slate-50"
              >
                <div className="flex items-start gap-3">
                  <span className="mt-1 size-2 shrink-0 animate-pulse rounded-full bg-rose-500 shadow-[0_0_0_4px_rgba(244,63,94,.1)]" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-[9px] font-bold uppercase tracking-[0.04em] text-slate-400">
                        {entry.taskCode} · {entry.projectName}
                      </p>
                      {entry.billable && (
                        <span className="shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 text-[8px] font-bold text-emerald-600">
                          Facturable
                        </span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-[11px] font-semibold text-slate-700">
                      {entry.taskTitle}
                    </p>
                    <p className="mt-1 truncate text-[9px] text-slate-400">
                      {entry.description || "Sin descripción"}
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-[11px] font-bold tabular-nums text-rose-600">
                    {formatDuration(elapsedSeconds(entry, now))}
                  </span>
                </div>
                <div className="mt-2.5 flex justify-end gap-1.5">
                  <button
                    onClick={() => onOpen(entry.taskId)}
                    className="focus-ring rounded-lg px-2.5 py-1.5 text-[9px] font-semibold text-[#0879ea] hover:bg-[#0a84ff]/10"
                    aria-label={`Abrir ${entry.taskTitle}`}
                  >
                    Abrir tarea
                  </button>
                  <button
                    onClick={() => onStop(entry.id)}
                    className="focus-ring flex items-center gap-1.5 rounded-lg bg-rose-50 px-2.5 py-1.5 text-[9px] font-semibold text-rose-600 hover:bg-rose-100"
                    aria-label={`Detener timer de ${entry.taskTitle}`}
                  >
                    <Pause className="size-3 fill-current" />
                    Detener
                  </button>
                </div>
              </article>
            ))}

            {entries.length === 0 && (
              <div className="grid min-h-40 place-items-center px-5 text-center">
                <div>
                  <TimerReset className="mx-auto size-7 text-slate-300" />
                  <p className="mt-2 text-[10px] font-semibold text-slate-500">
                    Todo en pausa
                  </p>
                  <p className="mt-1 text-[9px] leading-4 text-slate-400">
                    Iniciá un timer desde cualquier tarea y aparecerá acá.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function InboxView({
  notifications,
  onOpenTask,
  onRead,
  onReadAll,
}: {
  notifications: AppNotification[];
  onOpenTask: (taskId: string) => void;
  onRead: (notificationId: string) => void;
  onReadAll: () => void;
}) {
  const unread = notifications.filter((item) => !item.readAt).length;
  return (
    <section className="asana-page animate-enter">
      <div className="asana-page-heading">
        <div>
          <h1>Bandeja de entrada</h1>
          <p>Actualizaciones del trabajo que seguís.</p>
        </div>
        <button onClick={onReadAll} disabled={!unread} className="asana-secondary-button">
          Marcar todo como leído
        </button>
      </div>
      <div className="asana-inbox-layout">
        <div className="asana-inbox-list">
          <div className="asana-section-label">Actividad · {unread} sin leer</div>
          {notifications.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                onRead(item.id);
                if (item.taskId) onOpenTask(item.taskId);
              }}
              className={clsx("asana-inbox-item", !item.readAt && "is-unread")}
            >
              <span className="asana-inbox-dot" />
              <span className="min-w-0 flex-1 text-left">
                <strong>{item.title}</strong>
                <span>{item.body}</span>
                <small>{item.createdAt}</small>
              </span>
            </button>
          ))}
          {!notifications.length && (
            <div className="asana-empty-panel">
              <Inbox className="size-8" />
              <strong>Estás al día</strong>
              <span>Las nuevas asignaciones y conversaciones aparecerán acá.</span>
            </div>
          )}
        </div>
        <aside className="asana-inbox-preview">
          <Inbox className="size-9" />
          <strong>Seleccioná una actualización</strong>
          <span>Podés responder o abrir la tarea sin perder tu lugar.</span>
        </aside>
      </div>
    </section>
  );
}

function PortfoliosView({
  workspaceId,
  projects,
  tasks,
  people,
}: {
  workspaceId: string;
  projects: Project[];
  tasks: Task[];
  people: Person[];
}) {
  const strategic = useStrategicWork(workspaceId);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [projectIds, setProjectIds] = useState<string[]>([]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (name.trim().length < 2 || !projectIds.length) return;
    await strategic.createPortfolio({
      name: name.trim(),
      description: description.trim(),
      color: "#a970ff",
      ownerId: ownerId || null,
      projectIds,
    });
    setName("");
    setDescription("");
    setOwnerId("");
    setProjectIds([]);
    setCreating(false);
  }

  return (
    <section className="asana-page animate-enter">
      <div className="asana-page-heading">
        <div><h1>Portafolios</h1><p>Seguimiento ejecutivo de grupos de proyectos, riesgo y avance.</p></div>
        <button onClick={() => setCreating(true)} className="asana-primary-button"><Plus className="size-4" />Nuevo portafolio</button>
      </div>
      {strategic.portfolios.length ? (
        <div className="space-y-4">
          {strategic.portfolios.map((portfolio) => {
            const portfolioProjects = projects.filter((project) => portfolio.projectIds.includes(project.id));
            const portfolioTasks = tasks.filter((task) => task.projects.some((project) => portfolio.projectIds.includes(project.id)));
            const completed = portfolioTasks.filter((task) => task.status === "resuelto").length;
            const progress = portfolioTasks.length ? Math.round((completed / portfolioTasks.length) * 100) : 0;
            const owner = people.find((person) => person.id === portfolio.ownerId);
            return (
              <article key={portfolio.id} className="asana-table-shell overflow-hidden">
                <header className="flex items-center gap-3 border-b border-slate-200 px-5 py-4">
                  <span className="size-3 rounded" style={{ backgroundColor: portfolio.color }} />
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-[13px] font-bold text-slate-800">{portfolio.name}</h2>
                    <p className="mt-0.5 text-[9px] text-slate-400">{portfolio.description || `${portfolioProjects.length} proyectos`}</p>
                  </div>
                  {owner && <Avatar person={owner} size="sm" />}
                  <button onClick={() => void strategic.deletePortfolio(portfolio.id)} className="focus-ring rounded-md p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label={`Eliminar ${portfolio.name}`}><Trash2 className="size-4" /></button>
                </header>
                <div className="asana-table-row asana-table-head"><span>Proyecto</span><span>Estado</span><span>Avance</span><span>Tareas</span><span>Responsable</span></div>
                {portfolioProjects.map((project) => {
                  const projectTasks = portfolioTasks.filter((task) => task.projects.some((item) => item.id === project.id));
                  const projectDone = projectTasks.filter((task) => task.status === "resuelto").length;
                  const projectProgress = projectTasks.length ? Math.round((projectDone / projectTasks.length) * 100) : 0;
                  return <div key={project.id} className="asana-table-row"><span className="asana-project-cell"><i style={{background: project.color}} />{project.name}</span><span><b className="asana-status-pill is-track">En curso</b></span><span><span className="asana-progress"><i style={{width: `${projectProgress}%`}} /></span>{projectProgress}%</span><span>{projectTasks.length}</span><span>Equipo</span></div>;
                })}
                <footer className="flex items-center gap-3 bg-slate-50 px-5 py-3 text-[9px] text-slate-500"><span>Avance total</span><span className="asana-progress flex-1"><i style={{width: `${progress}%`}} /></span><strong>{progress}%</strong></footer>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="asana-empty-panel asana-table-shell"><Briefcase className="size-9" /><strong>Organizá varios proyectos en un portafolio</strong><span>Compará avance, carga y riesgo sin abrir cada proyecto.</span><button onClick={() => setCreating(true)} className="asana-primary-button"><Plus className="size-4" />Crear portafolio</button></div>
      )}
      {creating && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-label="Nuevo portafolio">
          <form onSubmit={(event) => void submit(event)} className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center"><div><h2 className="text-[16px] font-bold text-slate-900">Nuevo portafolio</h2><p className="mt-1 text-[10px] text-slate-400">Agrupá los proyectos que querés supervisar.</p></div><button type="button" onClick={() => setCreating(false)} className="ml-auto rounded-md p-2 text-slate-400 hover:bg-slate-100" aria-label="Cerrar"><X className="size-4" /></button></div>
            <label className="mt-5 block text-[10px] font-semibold text-slate-600">Nombre<input value={name} onChange={(event) => setName(event.target.value)} autoFocus className="mt-2 h-10 w-full rounded-lg border border-slate-200 px-3 text-[11px]" placeholder="Ej. Campañas Q3" /></label>
            <label className="mt-4 block text-[10px] font-semibold text-slate-600">Descripción<textarea value={description} onChange={(event) => setDescription(event.target.value)} className="mt-2 min-h-20 w-full rounded-lg border border-slate-200 p-3 text-[11px]" /></label>
            <label className="mt-4 block text-[10px] font-semibold text-slate-600">Responsable<select value={ownerId} onChange={(event) => setOwnerId(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-slate-200 px-3 text-[11px]"><option value="">Sin responsable</option>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
            <fieldset className="mt-4"><legend className="text-[10px] font-semibold text-slate-600">Proyectos</legend><div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">{projects.filter((project) => !project.archived).map((project) => <label key={project.id} className="flex items-center gap-2 rounded-md px-2 py-2 text-[10px] text-slate-600 hover:bg-slate-50"><input type="checkbox" checked={projectIds.includes(project.id)} onChange={() => setProjectIds((current) => current.includes(project.id) ? current.filter((id) => id !== project.id) : [...current, project.id])} />{project.name}</label>)}</div></fieldset>
            <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setCreating(false)} className="asana-secondary-button">Cancelar</button><button disabled={name.trim().length < 2 || !projectIds.length} className="asana-primary-button">Crear portafolio</button></div>
          </form>
        </div>
      )}
    </section>
  );
}

function GoalsView({ workspaceId, projects, people }: { workspaceId: string; projects: Project[]; people: Person[] }) {
  const strategic = useStrategicWork(workspaceId);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const statusLabels: Record<GoalStatus, string> = { on_track: "En curso", at_risk: "En riesgo", off_track: "Fuera de curso", complete: "Completo" };

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (name.trim().length < 2) return;
    await strategic.createGoal({ name: name.trim(), description: description.trim(), status: "on_track", progress: 0, dueDate: dueDate || null, ownerId: ownerId || null, projectIds });
    setName(""); setDescription(""); setDueDate(""); setOwnerId(""); setProjectIds([]); setCreating(false);
  }

  return <section className="asana-page animate-enter">
    <div className="asana-page-heading"><div><h1>Objetivos</h1><p>Conectá el trabajo diario con resultados medibles.</p></div><button onClick={() => setCreating(true)} className="asana-primary-button"><Plus className="size-4" />Nuevo objetivo</button></div>
    <div className="space-y-3">
      {strategic.goals.map((goal) => {
        const owner = people.find((person) => person.id === goal.ownerId);
        return <article key={goal.id} className="asana-goal-card">
          <div className="asana-goal-icon"><Target className="size-5" /></div>
          <div className="min-w-0 flex-1"><span className="asana-section-label">{statusLabels[goal.status]}{goal.dueDate ? ` · ${new Intl.DateTimeFormat("es-UY", { dateStyle: "medium" }).format(new Date(`${goal.dueDate}T12:00:00`))}` : ""}</span><h2>{goal.name}</h2><p>{goal.description || `${goal.projectIds.length} proyectos vinculados`}</p><div className="asana-goal-progress"><i style={{width: `${goal.progress}%`}} /></div><label className="mt-3 flex items-center gap-3 text-[9px] text-slate-400">Avance<input type="range" min="0" max="100" value={goal.progress} onChange={(event) => void strategic.updateGoalProgress(goal.id, Number(event.target.value))} className="w-40" /></label></div>
          {owner && <Avatar person={owner} size="sm" />}<strong className="asana-goal-percent">{goal.progress}%</strong><button onClick={() => void strategic.deleteGoal(goal.id)} className="rounded-md p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label={`Eliminar ${goal.name}`}><Trash2 className="size-4" /></button>
        </article>;
      })}
      {!strategic.goals.length && <div className="asana-empty-panel asana-table-shell"><Target className="size-9" /><strong>Definí el primer objetivo del espacio</strong><span>Asigná responsable, fecha y proyectos relacionados.</span><button onClick={() => setCreating(true)} className="asana-primary-button"><Plus className="size-4" />Crear objetivo</button></div>}
    </div>
    {creating && <div className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-label="Nuevo objetivo"><form onSubmit={(event) => void submit(event)} className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"><div className="flex items-center"><div><h2 className="text-[16px] font-bold text-slate-900">Nuevo objetivo</h2><p className="mt-1 text-[10px] text-slate-400">Definí un resultado medible.</p></div><button type="button" onClick={() => setCreating(false)} className="ml-auto rounded-md p-2 text-slate-400 hover:bg-slate-100" aria-label="Cerrar"><X className="size-4" /></button></div><label className="mt-5 block text-[10px] font-semibold text-slate-600">Nombre<input value={name} onChange={(event) => setName(event.target.value)} autoFocus className="mt-2 h-10 w-full rounded-lg border border-slate-200 px-3 text-[11px]" /></label><label className="mt-4 block text-[10px] font-semibold text-slate-600">Descripción<textarea value={description} onChange={(event) => setDescription(event.target.value)} className="mt-2 min-h-20 w-full rounded-lg border border-slate-200 p-3 text-[11px]" /></label><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-[10px] font-semibold text-slate-600">Fecha objetivo<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-slate-200 px-3 text-[11px]" /></label><label className="text-[10px] font-semibold text-slate-600">Responsable<select value={ownerId} onChange={(event) => setOwnerId(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-slate-200 px-3 text-[11px]"><option value="">Sin responsable</option>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label></div><fieldset className="mt-4"><legend className="text-[10px] font-semibold text-slate-600">Proyectos vinculados</legend><div className="mt-2 max-h-36 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">{projects.filter((project) => !project.archived).map((project) => <label key={project.id} className="flex items-center gap-2 rounded-md px-2 py-2 text-[10px] text-slate-600 hover:bg-slate-50"><input type="checkbox" checked={projectIds.includes(project.id)} onChange={() => setProjectIds((current) => current.includes(project.id) ? current.filter((id) => id !== project.id) : [...current, project.id])} />{project.name}</label>)}</div></fieldset><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setCreating(false)} className="asana-secondary-button">Cancelar</button><button disabled={name.trim().length < 2} className="asana-primary-button">Crear objetivo</button></div></form></div>}
  </section>;
}

function ReportingView({ tasks, projects, people }: { tasks: Task[]; projects: Project[]; people: Person[] }) {
  const active = tasks.filter((task) => task.status !== "resuelto").length;
  const overdue = tasks.filter((task) => task.status !== "resuelto" && task.dueDate && new Date(`${task.dueDate}T23:59:59`) < new Date()).length;
  return (
    <section className="asana-page animate-enter">
      <div className="asana-page-heading"><div><h1>Informes</h1><p>Estado del trabajo en tiempo real.</p></div><button className="asana-primary-button"><Plus className="size-4" />Nuevo panel</button></div>
      <div className="asana-report-grid">
        {[{label:"Trabajo activo",value:active,color:"#4573d2"},{label:"Proyectos",value:projects.length,color:"#a970ff"},{label:"Vencidas",value:overdue,color:"#e8384f"},{label:"Personas",value:people.length,color:"#2e9b78"}].map((metric) => (
          <article key={metric.label} className="asana-report-card"><span>{metric.label}</span><strong>{metric.value}</strong><div className="asana-chart-bar" style={{background: metric.color}} /></article>
        ))}
      </div>
    </section>
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
  onCreateTask,
  onProjectSelect,
  onProjectSettings,
  onSettings,
  onAdmin,
  onClients,
  onSignOut,
  onTimeReports,
  canViewTimeReports,
  isPlatformAdmin,
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
  onCreateTask: () => void;
  onProjectSelect: (projectId: string) => void;
  onProjectSettings: (projectId: string) => void;
  onSettings: () => void;
  onAdmin: () => void;
  onClients: () => void;
  onSignOut: () => void;
  onTimeReports: () => void;
  canViewTimeReports: boolean;
  isPlatformAdmin: boolean;
}) {
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const activeWorkspace =
    workspaces.find((workspace) => workspace.id === activeWorkspaceId) ??
    workspaces[0];
  const nav = [
    { id: "home" as const, label: "Inicio", icon: Home },
    { id: "my_tasks" as const, label: "Mis tareas", icon: CheckCircle2 },
    { id: "all_tasks" as const, label: "Todas las tareas", icon: ListTodo },
    { id: "inbox" as const, label: "Bandeja de entrada", icon: Inbox },
  ];
  const insights = [
    { id: "reporting" as const, label: "Informes", icon: Gauge },
    { id: "portfolios" as const, label: "Portafolios", icon: Briefcase },
    { id: "goals" as const, label: "Objetivos", icon: Target },
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
        <div className="asana-sidebar-top flex h-[56px] items-center justify-between px-1">
          <button
            className="asana-create-button focus-ring flex items-center gap-2 rounded-lg"
            onClick={onCreateTask}
          >
            <span className="grid size-6 place-items-center rounded-full bg-[#f06a6a] text-white">
              <Plus className="size-4 stroke-[2.5]" />
            </span>
            <span className="text-[12px] font-semibold text-slate-700">
              Crear
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

        <div className="relative mb-3">
          <button
            onClick={() => setWorkspaceOpen((current) => !current)}
            className="asana-workspace-switch focus-ring flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition hover:bg-black/[0.045]"
            aria-expanded={workspaceOpen}
            aria-label="Cambiar espacio de trabajo"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[11px] font-semibold text-slate-500">
                Trabajo
              </span>
            </span>
            <span className="truncate text-[9px] text-slate-400">{activeWorkspace?.name}</span>
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
          <p className="mb-2 mt-5 px-3 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">
            Información estratégica
          </p>
          {insights.map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            return (
              <button
                key={item.id}
                onClick={() => select(item.id)}
                className={clsx(
                  "focus-ring flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition",
                  active
                    ? "bg-[#f06a6a]/12 text-[#cf4b4b]"
                    : "text-slate-600 hover:bg-black/[0.045] hover:text-slate-900",
                )}
              >
                <Icon className="size-[17px]" />
                {item.label}
              </button>
            );
          })}
          <button
            onClick={() => select("archive")}
            className={clsx(
              "focus-ring mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition",
              view === "archive" ? "bg-[#f06a6a]/12 text-[#cf4b4b]" : "text-slate-600 hover:bg-black/[0.045]",
            )}
          >
            <Archive className="size-[17px]" />
            Archivo de procesos
          </button>
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
          <button
            onClick={() => {
              onClients();
              onClose();
            }}
            className="focus-ring flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium text-slate-600 transition hover:bg-black/[0.045] hover:text-slate-900"
          >
            <ContactRound className="size-[17px] text-[#0a84ff]" />
            Clientes
          </button>
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

        <div className="relative border-t border-black/[0.06] pt-3">
          {profileOpen && (
            <div className="mac-popover absolute inset-x-0 bottom-[calc(100%+8px)] z-30 rounded-xl border border-black/10 bg-white/95 p-1.5 shadow-xl backdrop-blur-xl">
              <div className="border-b border-slate-100 px-3 py-2">
                <p className="truncate text-[10px] font-bold text-slate-700">
                  {currentPerson?.name ?? "Integrante"}
                </p>
                <p className="mt-0.5 truncate text-[8px] text-slate-400">
                  {currentPerson?.email ?? currentPerson?.role ?? "Equipo creativo"}
                </p>
              </div>
              <button
                onClick={() => {
                  setProfileOpen(false);
                  onSettings();
                }}
                className="focus-ring mt-1 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[10px] font-semibold text-slate-600 hover:bg-slate-100"
              >
                <UserRound className="size-3.5" />
                Mi perfil y apariencia
              </button>
              {isPlatformAdmin && (
                <button
                  onClick={() => {
                    setProfileOpen(false);
                    onAdmin();
                  }}
                  className="focus-ring flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[10px] font-semibold text-[#0879ea] hover:bg-[#0a84ff]/8"
                >
                  <Shield className="size-3.5" />
                  Panel de administración
                </button>
              )}
              {mode === "supabase" && (
                <button
                  onClick={() => {
                    setProfileOpen(false);
                    onSignOut();
                  }}
                  className="focus-ring mt-1 flex w-full items-center gap-2.5 border-t border-slate-100 px-3 py-2.5 text-left text-[10px] font-semibold text-rose-600 hover:bg-rose-50"
                >
                  <LogOut className="size-3.5" />
                  Cerrar sesión
                </button>
              )}
            </div>
          )}
          <button
            onClick={() => setProfileOpen((current) => !current)}
            className="focus-ring flex w-full items-center gap-2 rounded-xl p-1.5 text-left hover:bg-black/[0.045]"
            aria-expanded={profileOpen}
            aria-label="Abrir menú de perfil"
          >
            <Avatar person={currentPerson} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[11px] font-semibold">
                {currentPerson?.name ?? "Integrante"}
              </span>
              <span className="block truncate text-[9px] text-slate-500">
                {currentPerson?.role ?? "Equipo creativo"}
              </span>
            </span>
            <ChevronDown
              className={clsx(
                "size-3.5 text-slate-400 transition",
                profileOpen && "rotate-180",
              )}
            />
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
  allTasks = tasks,
  onSelect,
  onComplete,
  compact = false,
  projectMode = false,
  selectedTaskId = null,
}: {
  tasks: Task[];
  allTasks?: Task[];
  onSelect: (task: Task) => void;
  onComplete: (task: Task) => void;
  compact?: boolean;
  projectMode?: boolean;
  selectedTaskId?: string | null;
}) {
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(
    () => new Set(),
  );
  const listedTaskIds = new Set(tasks.map((task) => task.id));
  const rootRows = tasks.filter(
    (task) => !task.parentTaskId || !listedTaskIds.has(task.parentTaskId),
  );

  function directSubtasks(taskId: string) {
    return allTasks.filter((task) => task.parentTaskId === taskId);
  }

  function toggleExpanded(taskId: string) {
    setExpandedTaskIds((current) => {
      const next = new Set(current);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  function renderTaskRow(task: Task, depth = 0) {
    const children = directSubtasks(task.id);
    const expanded = expandedTaskIds.has(task.id);
    const selected = projectMode && selectedTaskId === task.id;

    return (
      <div key={task.id}>
        <article
          className={clsx(
            "group border-b border-slate-100 last:border-b-0",
            selected && "task-row-selected",
          )}
          data-selected={selected ? "true" : undefined}
          data-task-depth={depth}
        >
          <div
            onClick={(event) => {
              const interactiveTarget = (event.target as HTMLElement).closest(
                "button, a, input, select, textarea, label",
              );
              if (!interactiveTarget) onSelect(task);
            }}
            className={clsx(
              "task-row-interactive hidden cursor-pointer grid-cols-[minmax(300px,1.7fr)_minmax(130px,.7fr)_108px_122px_54px] items-center px-5 transition md:grid",
              compact || projectMode ? "py-2" : "py-3.5",
            )}
          >
            <div
              className="flex min-w-0 items-center gap-2"
              style={{ paddingLeft: `${depth * 34}px` }}
            >
              {children.length > 0 ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleExpanded(task.id);
                  }}
                  className="focus-ring grid size-6 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  aria-label={`${expanded ? "Contraer" : "Expandir"} subtareas de ${task.title}`}
                  aria-expanded={expanded}
                >
                  <ChevronRight
                    className={clsx(
                      "size-4 transition-transform",
                      expanded && "rotate-90",
                    )}
                  />
                </button>
              ) : (
                <span className="size-6 shrink-0" aria-hidden="true" />
              )}
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
                <h3
                  className={clsx(
                    "truncate text-[13px] font-semibold text-slate-800 transition group-hover:text-[#8278ff]",
                    task.status === "resuelto" &&
                      "text-slate-400 line-through decoration-slate-500",
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
                task.dueLabel.startsWith("Hoy") && task.status !== "resuelto"
                  ? "text-rose-500"
                  : "text-slate-500",
              )}
            >
              <CalendarDays className="size-3.5" />
              {task.dueLabel}
            </span>
            <button
              onClick={() => onSelect(task)}
              className="focus-ring justify-self-end rounded-lg p-2 text-slate-400 opacity-0 transition hover:bg-slate-100 hover:text-slate-700 group-hover:opacity-100 focus:opacity-100"
              aria-label={`Abrir ${task.title}`}
            >
              <MoreHorizontal className="size-4" />
            </button>
          </div>

          <div className="flex items-start gap-2 p-3 md:hidden">
            {children.length > 0 ? (
              <button
                type="button"
                onClick={() => toggleExpanded(task.id)}
                className="focus-ring mt-0.5 grid size-7 shrink-0 place-items-center rounded-md text-slate-400"
                aria-label={`${expanded ? "Contraer" : "Expandir"} subtareas de ${task.title}`}
                aria-expanded={expanded}
              >
                <ChevronRight
                  className={clsx(
                    "size-4 transition-transform",
                    expanded && "rotate-90",
                  )}
                />
              </button>
            ) : (
              <span className="size-7 shrink-0" />
            )}
            <button
              onClick={() => onSelect(task)}
              className="focus-ring min-w-0 flex-1 rounded-md text-left"
              style={{ paddingLeft: `${depth * 18}px` }}
            >
              <h3
                className={clsx(
                  "truncate text-sm font-semibold text-slate-800",
                  task.status === "resuelto" && "text-slate-400 line-through",
                )}
              >
                {task.title}
              </h3>
              <p className="mt-1 text-[10px] text-slate-500">
                {task.assignee?.name ?? "Sin responsable"} · {task.dueLabel}
              </p>
            </button>
          </div>
        </article>
        {expanded && children.map((child) => renderTaskRow(child, depth + 1))}
      </div>
    );
  }

  return (
    <div
      className={clsx(
        "overflow-hidden border-[#e5e7ed] bg-white",
        projectMode
          ? "border-y"
          : "rounded-2xl border shadow-[0_1px_2px_rgba(25,32,50,0.03)]",
      )}
      data-testid={projectMode ? "project-task-list" : undefined}
    >
      <div className="hidden grid-cols-[minmax(300px,1.7fr)_minmax(130px,.7fr)_108px_122px_54px] items-center border-b border-slate-100 bg-[#fafbfc] px-5 py-3 text-[9px] font-bold uppercase tracking-[0.11em] text-slate-400 md:grid">
        <span>{projectMode ? "Nombre" : "Tarea"}</span>
        <span>Responsable</span>
        <span>Prioridad</span>
        <span>Fecha de entrega</span>
        <span />
      </div>

      {rootRows.map((task) => renderTaskRow(task))}
    </div>
  );
}

function ProjectWorkspaceView({
  project,
  tasks,
  allTasks,
  tab,
  selectedTaskId,
  onTabChange,
  onCreate,
  onSelect,
  onComplete,
  onMove,
  onUpdateDates,
}: {
  project: Project;
  tasks: Task[];
  allTasks: Task[];
  tab: ProjectTab;
  selectedTaskId: string | null;
  onTabChange: (tab: ProjectTab) => void;
  onCreate: () => void;
  onSelect: (task: Task) => void;
  onComplete: (task: Task) => void;
  onMove: (taskId: string, status: TaskStatus) => void;
  onUpdateDates: (
    taskId: string,
    input: Pick<UpdateTaskInput, "startDate" | "dueDate">,
  ) => void;
}) {
  const completed = tasks.filter((task) => task.status === "resuelto").length;
  const urgent = tasks.filter(
    (task) =>
      task.status !== "resuelto" &&
      (task.priority === "urgente" || task.priority === "alta"),
  ).length;
  const progress = tasks.length
    ? Math.round((completed / tasks.length) * 100)
    : 0;
  const tabs: Array<{ id: ProjectTab; label: string; icon?: typeof ListTodo }> =
    [
      { id: "overview", label: "Resumen" },
      { id: "list", label: "Lista", icon: ListTodo },
      { id: "board", label: "Tablero", icon: Columns3 },
      { id: "calendar", label: "Calendario", icon: CalendarDays },
      { id: "timeline", label: "Cronograma", icon: CalendarDays },
      { id: "gantt", label: "Gantt", icon: ChartGantt },
      { id: "dashboard", label: "Panel", icon: Gauge },
      { id: "workflow", label: "Flujo de trabajo", icon: Workflow },
      { id: "messages", label: "Mensajes", icon: MessagesSquare },
      { id: "files", label: "Archivos", icon: Files },
    ];

  const metrics = [
    {
      label: "Tareas",
      value: tasks.length,
      icon: ListTodo,
      color: "text-violet-600 bg-violet-50",
    },
    {
      label: "Completadas",
      value: completed,
      icon: CheckCircle2,
      color: "text-emerald-600 bg-emerald-50",
    },
    {
      label: "Prioridad alta",
      value: urgent,
      icon: Zap,
      color: "text-rose-600 bg-rose-50",
    },
    {
      label: "Avance",
      value: `${progress}%`,
      icon: BarChart3,
      color: "text-sky-600 bg-sky-50",
    },
  ];

  return (
    <section
      className="animate-enter min-h-[calc(100vh-70px)] bg-white"
      data-testid="project-workspace"
    >
      <header className="border-b border-slate-200 bg-white px-5 pt-5 sm:px-7">
        <div className="flex items-center gap-3">
          <span
            className="grid size-9 shrink-0 place-items-center rounded-xl text-white shadow-sm"
            style={{ backgroundColor: project.color }}
          >
            <ListTodo className="size-[18px]" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-[20px] font-bold tracking-[-0.025em] text-slate-900">
                {project.name}
              </h1>
              <ChevronDown className="size-3.5 text-slate-400" />
            </div>
            <p className="mt-0.5 flex items-center gap-1.5 text-[9px] text-slate-400">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              Proyecto activo · {tasks.length} tareas
            </p>
          </div>
          <button
            type="button"
            onClick={onCreate}
            className="mac-button-primary focus-ring ml-auto flex items-center gap-1.5 rounded-lg px-3 py-2 text-[10px] font-bold text-white"
          >
            <Plus className="size-3.5" />
            Agregar tarea
          </button>
        </div>
        <nav
          className="soft-scrollbar mt-5 flex gap-1 overflow-x-auto"
          aria-label="Vistas del proyecto"
        >
          {tabs.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={clsx(
                  "focus-ring relative flex shrink-0 items-center gap-1.5 px-3 pb-3 pt-1 text-[10px] font-semibold transition",
                  tab === item.id
                    ? "text-slate-900 after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-[#5b4bec]"
                    : "text-slate-400 hover:text-slate-700",
                )}
              >
                {Icon && <Icon className="size-3" />}
                {item.label}
              </button>
            );
          })}
        </nav>
      </header>

      <div className="py-4">
        {tab === "overview" ? (
          <div className="px-5 sm:px-7">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {metrics.map((metric) => {
                const Icon = metric.icon;
                return (
                  <article
                    key={metric.label}
                    className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <span
                      className={clsx(
                        "grid size-8 place-items-center rounded-lg",
                        metric.color,
                      )}
                    >
                      <Icon className="size-4" />
                    </span>
                    <p className="mt-3 text-[20px] font-bold tracking-[-0.03em] text-slate-900">
                      {metric.value}
                    </p>
                    <p className="mt-0.5 text-[9px] font-semibold text-slate-400">
                      {metric.label}
                    </p>
                  </article>
                );
              })}
            </div>
            <h2 className="mb-3 mt-6 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400">
              Trabajo del proyecto
            </h2>
            <TaskList
              tasks={tasks}
              allTasks={allTasks}
              projectMode
              selectedTaskId={selectedTaskId}
              onSelect={onSelect}
              onComplete={onComplete}
            />
          </div>
        ) : tab === "dashboard" ? (
          <div className="px-5 sm:px-7">
            <ProjectDashboard tasks={tasks} onSelect={onSelect} />
          </div>
        ) : tab === "board" || tab === "workflow" ? (
          <div className="px-5 sm:px-7">
            <KanbanBoard
              tasks={tasks}
              onSelect={onSelect}
              onCreate={() => onCreate()}
              onMove={onMove}
            />
          </div>
        ) : tab === "calendar" ? (
          <div className="px-5 sm:px-7">
            <ProjectCalendar tasks={tasks} onSelect={onSelect} />
          </div>
        ) : tab === "timeline" ? (
          <div className="px-5 sm:px-7">
            <ProjectSchedule tasks={tasks} onSelect={onSelect} />
          </div>
        ) : tab === "gantt" ? (
          <div className="px-5 sm:px-7">
            <GanttChart
              tasks={tasks}
              onSelect={onSelect}
              onUpdateDates={onUpdateDates}
            />
          </div>
        ) : tab === "messages" ? (
          <div className="px-5 sm:px-7">
            <ProjectMessagesView tasks={tasks} onSelect={onSelect} />
          </div>
        ) : tab === "files" ? (
          <div className="px-5 sm:px-7">
            <ProjectFilesView tasks={tasks} onSelect={onSelect} />
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-center px-5 sm:px-7">
              <button
                type="button"
                onClick={onCreate}
                className="focus-ring flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              >
                <Plus className="size-3.5" />
                Agregar tarea
                <ChevronDown className="size-3 text-slate-400" />
              </button>
              <span className="ml-auto text-[9px] text-slate-400">
                {completed}/{tasks.length} completadas
              </span>
            </div>
            <TaskList
              tasks={tasks}
              allTasks={allTasks}
              projectMode
              selectedTaskId={selectedTaskId}
              onSelect={onSelect}
              onComplete={onComplete}
            />
            <button
              type="button"
              onClick={onCreate}
              className="focus-ring mx-5 mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-[10px] font-semibold text-slate-400 hover:bg-slate-50 hover:text-slate-700 sm:mx-7"
            >
              <Plus className="size-3.5" />
              Agregar tarea…
            </button>
          </>
        )}
      </div>
    </section>
  );
}

function ProjectMessagesView({ tasks, onSelect }: { tasks: Task[]; onSelect: (task: Task) => void }) {
  const messages = tasks.flatMap((task) => task.comments.map((comment) => ({ task, comment }))).slice().reverse();
  return (
    <section className="asana-table-shell">
      <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <div><h2 className="text-[14px] font-semibold text-slate-800">Mensajes del proyecto</h2><p className="mt-1 text-[10px] text-slate-400">Conversaciones y decisiones de todas las tareas.</p></div>
      </header>
      <div className="divide-y divide-slate-100">
        {messages.map(({ task, comment }) => (
          <button key={comment.id} onClick={() => onSelect(task)} className="flex w-full gap-3 px-5 py-4 text-left hover:bg-slate-50">
            <Avatar person={comment.author} size="sm" />
            <span className="min-w-0 flex-1"><strong className="block text-[11px] text-slate-800">{comment.author.name} · {task.title}</strong><span className="mt-1 block line-clamp-2 text-[10px] leading-5 text-slate-500">{comment.body}</span><small className="mt-1 block text-[8px] text-slate-400">{comment.createdAt}</small></span>
          </button>
        ))}
        {!messages.length && <div className="asana-empty-panel"><MessagesSquare className="size-8" /><strong>Sin mensajes todavía</strong><span>Los comentarios de las tareas se reúnen en esta vista.</span></div>}
      </div>
    </section>
  );
}

function ProjectFilesView({ tasks, onSelect }: { tasks: Task[]; onSelect: (task: Task) => void }) {
  const files = tasks.flatMap((task) => task.attachments.filter((attachment) => !attachment.deletedAt).map((attachment) => ({ task, attachment })));
  return (
    <section className="asana-table-shell">
      <header className="border-b border-slate-200 px-5 py-4"><h2 className="text-[14px] font-semibold text-slate-800">Archivos</h2><p className="mt-1 text-[10px] text-slate-400">Todos los recursos compartidos en el proyecto.</p></header>
      <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
        {files.map(({ task, attachment }) => (
          <button key={attachment.id} onClick={() => onSelect(task)} className="flex min-w-0 items-center gap-3 rounded-lg border border-slate-200 p-3 text-left hover:border-slate-300 hover:bg-slate-50">
            <span className="grid size-10 place-items-center rounded-lg bg-slate-100 text-slate-500"><FileText className="size-4" /></span>
            <span className="min-w-0"><strong className="block truncate text-[10px] text-slate-800">{attachment.name}</strong><small className="mt-1 block truncate text-[8px] text-slate-400">{task.title} · {formatBytes(attachment.size)}</small></span>
          </button>
        ))}
        {!files.length && <div className="asana-empty-panel col-span-full"><Files className="size-8" /><strong>Sin archivos</strong><span>Los adjuntos de las tareas aparecerán acá.</span></div>}
      </div>
    </section>
  );
}

function ProjectDashboard({
  tasks,
  onSelect,
}: {
  tasks: Task[];
  onSelect: (task: Task) => void;
}) {
  const statusRows = (Object.keys(statusMeta) as TaskStatus[]).map((status) => ({
    status,
    label: statusMeta[status].label,
    count: tasks.filter((task) => task.status === status).length,
  }));
  const activeTasks = tasks.filter((task) => task.status !== "resuelto");
  const overdueTasks = activeTasks.filter(
    (task) => task.dueDate && new Date(`${task.dueDate}T23:59:59`) < new Date(),
  );
  const assignees = Array.from(
    activeTasks.reduce((result, task) => {
      const key = task.assignee?.id ?? "unassigned";
      const current = result.get(key) ?? {
        person: task.assignee,
        count: 0,
        urgent: 0,
      };
      current.count += 1;
      if (task.priority === "urgente" || task.priority === "alta") {
        current.urgent += 1;
      }
      result.set(key, current);
      return result;
    }, new Map<string, { person: Person | null; count: number; urgent: number }>()),
  ).sort((a, b) => b[1].count - a[1].count);
  const maxLoad = Math.max(1, ...assignees.map(([, item]) => item.count));
  const upcoming = [...activeTasks]
    .filter((task) => task.dueDate)
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))
    .slice(0, 5);

  return (
    <div className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]" data-testid="project-dashboard">
      <div className="grid gap-4 sm:grid-cols-2">
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-[12px] font-bold text-slate-800">Tareas por estado</h2>
          <p className="mt-1 text-[9px] text-slate-400">Distribución del trabajo del proyecto.</p>
          <div className="mt-5 flex h-3 overflow-hidden rounded-full bg-slate-100">
            {statusRows.map((row) => (
              <span
                key={row.status}
                style={{
                  width: `${tasks.length ? (row.count / tasks.length) * 100 : 0}%`,
                  backgroundColor:
                    row.status === "resuelto"
                      ? "#2e9b78"
                      : row.status === "en_progreso"
                        ? "#4573d2"
                        : row.status === "esperando"
                          ? "#f6c344"
                          : "#a970ff",
                }}
              />
            ))}
          </div>
          <div className="mt-5 space-y-3">
            {statusRows.map((row) => (
              <div key={row.status} className="flex items-center text-[10px]">
                <span className={clsx("mr-2 size-2 rounded-full", statusMeta[row.status].dot)} />
                <span className="text-slate-500">{row.label}</span>
                <strong className="ml-auto text-slate-800">{row.count}</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-[12px] font-bold text-slate-800">Carga del equipo</h2>
          <p className="mt-1 text-[9px] text-slate-400">Tareas abiertas por responsable.</p>
          <div className="mt-5 space-y-4">
            {assignees.map(([key, item]) => (
              <div key={key}>
                <div className="mb-1.5 flex items-center gap-2">
                  <Avatar person={item.person} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-[10px] font-semibold text-slate-600">
                    {item.person?.name ?? "Sin responsable"}
                  </span>
                  <span className="text-[9px] text-slate-400">{item.count}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={clsx(
                      "h-full rounded-full",
                      item.urgent > 1 ? "bg-rose-500" : "bg-violet-500",
                    )}
                    style={{ width: `${(item.count / maxLoad) * 100}%` }}
                  />
                </div>
              </div>
            ))}
            {!assignees.length && <p className="text-[10px] text-slate-400">No hay trabajo activo.</p>}
          </div>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:col-span-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[12px] font-bold text-slate-800">Próximas entregas</h2>
              <p className="mt-1 text-[9px] text-slate-400">Fechas que requieren atención.</p>
            </div>
            {overdueTasks.length > 0 && (
              <span className="rounded-full bg-rose-50 px-2.5 py-1 text-[9px] font-bold text-rose-600">
                {overdueTasks.length} vencidas
              </span>
            )}
          </div>
          <div className="mt-4 divide-y divide-slate-100">
            {upcoming.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => onSelect(task)}
                className="flex w-full items-center gap-3 py-3 text-left hover:bg-slate-50"
              >
                <span className={clsx("size-2 rounded-full", statusMeta[task.status].dot)} />
                <span className="min-w-0 flex-1 truncate text-[10px] font-semibold text-slate-700">
                  {task.title}
                </span>
                <PriorityBadge priority={task.priority} />
                <span className="text-[9px] text-slate-400">{task.dueLabel}</span>
              </button>
            ))}
            {!upcoming.length && <p className="py-5 text-[10px] text-slate-400">No hay entregas programadas.</p>}
          </div>
        </article>
      </div>

      <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-[12px] font-bold text-slate-800">Salud del proyecto</h2>
        <p className="mt-1 text-[9px] text-slate-400">Indicadores calculados en tiempo real.</p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          {[
            { label: "Abiertas", value: activeTasks.length, tone: "text-blue-600 bg-blue-50" },
            { label: "Vencidas", value: overdueTasks.length, tone: "text-rose-600 bg-rose-50" },
            { label: "Sin fecha", value: activeTasks.filter((task) => !task.dueDate).length, tone: "text-amber-600 bg-amber-50" },
            { label: "Completadas", value: tasks.length - activeTasks.length, tone: "text-emerald-600 bg-emerald-50" },
          ].map((metric) => (
            <div key={metric.label} className={clsx("rounded-xl p-4", metric.tone)}>
              <strong className="block text-[24px] tracking-tight">{metric.value}</strong>
              <span className="mt-1 block text-[9px] font-semibold opacity-75">{metric.label}</span>
            </div>
          ))}
        </div>
        <div className="mt-6 rounded-xl bg-slate-50 p-4">
          <div className="flex items-center justify-between text-[10px]">
            <span className="font-semibold text-slate-500">Avance general</span>
            <strong className="text-slate-800">
              {tasks.length ? Math.round(((tasks.length - activeTasks.length) / tasks.length) * 100) : 0}%
            </strong>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-emerald-500"
              style={{
                width: `${tasks.length ? ((tasks.length - activeTasks.length) / tasks.length) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
      </article>
    </div>
  );
}

function ProjectCalendar({
  tasks,
  onSelect,
}: {
  tasks: Task[];
  onSelect: (task: Task) => void;
}) {
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const todayKey = new Date().toISOString().slice(0, 10);
  const firstWeekday = (cursor.getDay() + 6) % 7;
  const gridStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1 - firstWeekday);
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return date;
  });
  const tasksByDate = tasks.reduce((result, task) => {
    if (!task.dueDate) return result;
    result[task.dueDate] = [...(result[task.dueDate] ?? []), task];
    return result;
  }, {} as Record<string, Task[]>);
  const unscheduled = tasks.filter((task) => !task.dueDate && task.status !== "resuelto");
  const monthLabel = new Intl.DateTimeFormat("es-UY", {
    month: "long",
    year: "numeric",
  }).format(cursor);
  const dateKey = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

  function moveMonth(offset: number) {
    setCursor((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" data-testid="project-calendar">
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3">
        <div>
          <h2 className="capitalize text-[13px] font-bold text-slate-800">{monthLabel}</h2>
          <p className="mt-0.5 text-[9px] text-slate-400">Entregas del proyecto por día.</p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => moveMonth(-1)} className="focus-ring rounded-md p-2 text-slate-500 hover:bg-slate-100" aria-label="Mes anterior">
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              const now = new Date();
              setCursor(new Date(now.getFullYear(), now.getMonth(), 1));
            }}
            className="focus-ring rounded-md px-3 py-2 text-[9px] font-semibold text-slate-600 hover:bg-slate-100"
          >
            Hoy
          </button>
          <button type="button" onClick={() => moveMonth(1)} className="focus-ring rounded-md p-2 text-slate-500 hover:bg-slate-100" aria-label="Mes siguiente">
            <ChevronRight className="size-4" />
          </button>
        </div>
      </header>
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
        {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((day) => (
          <span key={day} className="px-2 py-2 text-center text-[8px] font-bold uppercase tracking-[0.08em] text-slate-400">{day}</span>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const key = dateKey(day);
          const dayTasks = tasksByDate[key] ?? [];
          const inMonth = day.getMonth() === cursor.getMonth();
          return (
            <div
              key={key}
              className={clsx(
                "min-h-[104px] border-b border-r border-slate-100 p-1.5 sm:min-h-[126px] sm:p-2",
                !inMonth && "bg-slate-50/60",
              )}
            >
              <span className={clsx(
                "grid size-6 place-items-center rounded-full text-[9px] font-semibold",
                key === todayKey ? "bg-violet-600 text-white" : inMonth ? "text-slate-600" : "text-slate-300",
              )}>
                {day.getDate()}
              </span>
              <div className="mt-1 space-y-1">
                {dayTasks.slice(0, 3).map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => onSelect(task)}
                    className={clsx(
                      "focus-ring block w-full truncate rounded px-1.5 py-1 text-left text-[8px] font-semibold",
                      task.status === "resuelto"
                        ? "bg-emerald-50 text-emerald-700 line-through"
                        : task.priority === "urgente"
                          ? "bg-rose-50 text-rose-700"
                          : "bg-violet-50 text-violet-700",
                    )}
                    title={task.title}
                  >
                    {task.title}
                  </button>
                ))}
                {dayTasks.length > 3 && <span className="block px-1 text-[8px] text-slate-400">+{dayTasks.length - 3} más</span>}
              </div>
            </div>
          );
        })}
      </div>
      {unscheduled.length > 0 && (
        <footer className="border-t border-slate-200 bg-slate-50/70 px-4 py-3">
          <span className="text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400">Sin fecha · {unscheduled.length}</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {unscheduled.slice(0, 6).map((task) => (
              <button key={task.id} type="button" onClick={() => onSelect(task)} className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[9px] font-semibold text-slate-600 hover:border-violet-300 hover:text-violet-600">
                {task.title}
              </button>
            ))}
          </div>
        </footer>
      )}
    </div>
  );
}

function ProjectSchedule({
  tasks,
  onSelect,
}: {
  tasks: Task[];
  onSelect: (task: Task) => void;
}) {
  const sorted = [...tasks].sort((a, b) =>
    (a.dueDate ?? "9999-12-31").localeCompare(b.dueDate ?? "9999-12-31"),
  );
  const groups = sorted.reduce(
    (result, task) => {
      const key = task.dueDate ?? "Sin fecha";
      result[key] = [...(result[key] ?? []), task];
      return result;
    },
    {} as Record<string, Task[]>,
  );

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <header className="border-b border-slate-100 bg-slate-50/70 px-5 py-4">
        <h2 className="text-[14px] font-bold text-slate-800">
          Agenda de entregas
        </h2>
        <p className="mt-1 text-[10px] text-slate-500">
          Cronología por fecha. Usá Gantt para dependencias y duración.
        </p>
      </header>
      <div className="divide-y divide-slate-100">
        {Object.entries(groups).map(([date, dateTasks]) => (
          <div
            key={date}
            className="grid gap-3 px-4 py-4 sm:grid-cols-[150px_1fr] sm:px-5"
          >
            <div>
              <p className="text-[11px] font-bold text-slate-700">
                {date === "Sin fecha"
                  ? date
                  : new Intl.DateTimeFormat("es-UY", {
                      weekday: "short",
                      day: "numeric",
                      month: "long",
                    }).format(new Date(`${date}T12:00:00`))}
              </p>
              <p className="mt-1 text-[9px] text-slate-400">
                {dateTasks.length}{" "}
                {dateTasks.length === 1 ? "entrega" : "entregas"}
              </p>
            </div>
            <div className="space-y-2">
              {dateTasks.map((task) => (
                <button
                  key={task.id}
                  onClick={() => onSelect(task)}
                  className="focus-ring flex w-full items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-3 text-left transition hover:border-[#0a84ff]/25 hover:bg-[#0a84ff]/5"
                >
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: statusMeta[task.status].dot }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-semibold text-slate-800">
                      {task.title}
                    </span>
                    <span className="mt-0.5 block truncate text-[9px] text-slate-400">
                      {task.code} · {task.assignee?.name ?? "Sin responsable"}
                    </span>
                  </span>
                  {task.dueTime && (
                    <span className="font-mono text-[10px] font-semibold text-slate-500">
                      {task.dueTime.slice(0, 5)}
                    </span>
                  )}
                  <PriorityBadge priority={task.priority} />
                </button>
              ))}
            </div>
          </div>
        ))}
        {tasks.length === 0 && (
          <div className="grid min-h-52 place-items-center text-center">
            <div>
              <CalendarDays className="mx-auto size-8 text-slate-300" />
              <p className="mt-3 text-[11px] font-semibold text-slate-500">
                No hay entregas en este proyecto.
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
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
  const [collapsedStatuses, setCollapsedStatuses] = useState<TaskStatus[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const statuses: TaskStatus[] = [
    "nuevo",
    "en_progreso",
    "esperando",
    "resuelto",
  ];

  return (
    <div className="soft-scrollbar -mx-4 overflow-x-auto px-4 pb-3 sm:-mx-7 sm:px-7 lg:-mx-9 lg:px-9">
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
      <div className="grid min-w-[980px] grid-cols-4 gap-4">
        {statuses.map((status) => {
          const columnTasks = tasks.filter((task) => task.status === status);
          const meta = statusMeta[status];
          const collapsed = collapsedStatuses.includes(status);
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
                {columnTasks.length >= 6 && (
                  <span
                    className="ml-1 rounded-full bg-amber-50 px-2 py-0.5 text-[8px] font-semibold text-amber-700"
                    title="Revisá la carga de esta columna"
                  >
                    Alta carga
                  </span>
                )}
                <button
                  onClick={() => onCreate(status)}
                  className="focus-ring ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-[9px] font-semibold text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                  aria-label={`Agregar en ${meta.label}`}
                >
                  <Plus className="size-3.5" />
                  Agregar
                </button>
                {columnTasks.length === 0 && (
                  <button
                    onClick={() =>
                      setCollapsedStatuses((current) =>
                        current.includes(status)
                          ? current.filter((item) => item !== status)
                          : [...current, status],
                      )
                    }
                    className="focus-ring rounded-md p-1 text-slate-400 hover:bg-slate-200"
                    aria-label={`${collapsed ? "Expandir" : "Contraer"} ${meta.label}`}
                  >
                    <ChevronDown
                      className={clsx(
                        "size-3.5 transition",
                        collapsed && "-rotate-90",
                      )}
                    />
                  </button>
                )}
              </div>
              {!collapsed && (
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
                  if (taskId) {
                    const movedTask = tasks.find((task) => task.id === taskId);
                    onMove(taskId, status);
                    setAnnouncement(
                      `${movedTask?.title ?? "Tarea"} movida a ${meta.label}`,
                    );
                  }
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
                        className="sr-only focus:not-sr-only focus-ring w-full rounded-md border-0 bg-transparent py-1 text-[9px] font-semibold text-slate-400 hover:bg-slate-50"
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
                  <button
                    onClick={() => onCreate(status)}
                    className="focus-ring grid min-h-20 w-full place-items-center rounded-lg border border-dashed border-slate-300 text-[10px] text-slate-400 hover:border-[#0a84ff]/35 hover:bg-[#0a84ff]/5 hover:text-[#0879ea]"
                  >
                    <span className="flex items-center gap-1.5">
                      <Plus className="size-3.5" />
                      Agregar primera tarea
                    </span>
                  </button>
                )}
                {columnTasks.length > 0 && (
                  <button
                    onClick={() => onCreate(status)}
                    className="focus-ring flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-[9px] font-semibold text-slate-400 hover:border-[#0a84ff]/35 hover:text-[#0879ea]"
                  >
                    <Plus className="size-3.5" />
                    Agregar tarea
                  </button>
                )}
              </div>
              )}
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
  projects,
  clients,
  currentPerson,
  currentUserId,
  currency,
  canTrackTime,
  canAuditTime,
  onClose,
  onTaskUpdate,
  onTaskArchive,
  onTaskDelete,
  onTaskSelect,
  onComment,
  onCommentDelete,
  onSubtaskCreate,
  onSubtaskUpdate,
  onAttachmentUpload,
  onAttachmentDelete,
  onAttachmentRestore,
  onAttachmentStatus,
  onAttachmentOpen,
  notify,
  onTimerStart,
  onTimerStop,
  onManualTimeCreate,
  onTimeEntryDelete,
  embedded = false,
}: {
  task: Task;
  parentTask: Task | null;
  subtasks: Task[];
  timeEntries: TimeEntry[];
  activeTimeEntry: TimeEntry | null;
  people: Person[];
  projects: Project[];
  clients: Client[];
  currentPerson: Person | null;
  currentUserId: string;
  currency: string;
  canTrackTime: boolean;
  canAuditTime: boolean;
  onClose: () => void;
  onTaskUpdate: (input: UpdateTaskInput) => void;
  onTaskArchive: () => void;
  onTaskDelete: () => void;
  onTaskSelect: (taskId: string) => void;
  onComment: (
    body: string,
    type: CommentType,
    visibility: CommentVisibility,
  ) => void;
  onCommentDelete: (commentId: string) => void;
  onSubtaskCreate: (title: string, assigneeId: string) => void;
  onSubtaskUpdate: (taskId: string, input: UpdateTaskInput) => void;
  onAttachmentUpload: (files: File[]) => Promise<TaskAttachment[]>;
  onAttachmentDelete: (attachment: TaskAttachment) => void;
  onAttachmentRestore: (attachment: TaskAttachment) => void;
  onAttachmentStatus: (
    attachment: TaskAttachment,
    status: AttachmentApprovalStatus,
  ) => void;
  onAttachmentOpen: (attachment: TaskAttachment) => void;
  notify: (message: string) => void;
  onTimerStart: (description: string, billable: boolean) => void;
  onTimerStop: (entryId: string) => void;
  onManualTimeCreate: (input: NewManualTimeEntryInput) => void;
  onTimeEntryDelete: (entryId: string) => void;
  embedded?: boolean;
}) {
  const [comment, setComment] = useState("");
  const [commentType, setCommentType] = useState<CommentType>("comment");
  const [commentVisibility, setCommentVisibility] =
    useState<CommentVisibility>("team");
  const [commentComposerOpen, setCommentComposerOpen] = useState(false);
  const [activityTab, setActivityTab] = useState<
    "comments" | "all" | "attachments"
  >(
    "comments",
  );
  const [activityNewestFirst, setActivityNewestFirst] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [subtaskAssigneeId, setSubtaskAssigneeId] = useState(
    task.assignee?.id ?? currentPerson?.id ?? "",
  );
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  const attachmentInput = useRef<HTMLInputElement>(null);
  const selectedClient =
    clients.find((client) => client.id === task.clientId) ?? null;
  const trackedSeconds = timeEntries.reduce(
    (total, entry) => total + elapsedSeconds(entry),
    0,
  );
  const involvedPeople = new Set(
    [
      task.assignee?.id,
      ...subtasks.map((subtask) => subtask.assignee?.id),
      ...task.comments.map((item) => item.author.id),
      ...timeEntries.map((entry) => entry.user.id),
    ].filter((id): id is string => Boolean(id)),
  );
  const collaborators = people
    .filter((person) => involvedPeople.has(person.id))
    .slice(0, 4);
  const visibleComments = activityNewestFirst
    ? [...task.comments].reverse()
    : task.comments;
  const activityStartedAt =
    task.createdAt ??
    (task.startDate ? `${task.startDate}T12:00:00` : null);
  const elapsedDays = activityStartedAt
    ? Math.max(
        1,
        Math.ceil(
          ((task.resolvedAt ? new Date(task.resolvedAt) : new Date()).getTime() -
            new Date(activityStartedAt).getTime()) /
            86_400_000,
        ),
      )
    : null;

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const dialog = dialogRef.current;
    dialog?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (embedded || event.key !== "Tab" || !dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [embedded, task.id]);

  function submitComment(event: FormEvent) {
    event.preventDefault();
    const body = comment.trim();
    if (!body) return;
    onComment(body, commentType, commentVisibility);
    setComment("");
    setCommentComposerOpen(false);
  }

  function submitSubtask(event: FormEvent) {
    event.preventDefault();
    const title = subtaskTitle.trim();
    if (!title) return;
    onSubtaskCreate(title, subtaskAssigneeId);
    setSubtaskTitle("");
  }

  async function copyTaskLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      notify("Enlace de la tarea copiado");
    } catch {
      notify("No se pudo copiar el enlace de la tarea");
    }
  }

  return (
    <div
      className={clsx(
        "fixed z-[70] flex",
        embedded
          ? "inset-y-0 right-0 w-full max-w-[760px] border-l border-slate-200 bg-white lg:top-[56px] lg:w-[48vw]"
          : "inset-0 items-center justify-center p-0 sm:p-3 lg:p-5",
      )}
      data-testid="task-detail"
    >
      {!embedded && (
        <button
          className="absolute inset-0 bg-slate-950/55 backdrop-blur-[2px]"
          onClick={onClose}
          aria-label="Cerrar detalle"
        />
      )}
      <aside
        ref={dialogRef}
        tabIndex={-1}
        className={clsx(
          "task-detail-shell animate-task-modal relative flex h-full w-full flex-col overflow-hidden border-slate-200 bg-white shadow-[0_32px_100px_rgba(15,23,42,0.38)] transition-[max-width,height,border-radius] duration-200 sm:border",
          embedded
            ? "max-w-none border-0 shadow-none sm:rounded-none"
            : isFullscreen
            ? "max-w-none sm:h-[calc(100vh-1.5rem)] sm:rounded-xl"
            : "max-w-[1380px] sm:h-[calc(100vh-2rem)] sm:max-h-[980px] sm:rounded-xl lg:h-[calc(100vh-2.5rem)]",
        )}
        role="dialog"
        aria-modal={embedded ? undefined : true}
        aria-label={`Detalle de ${task.title}`}
      >
        <header className="task-detail-toolbar relative flex min-h-16 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 sm:gap-3 sm:px-5">
          <button
            onClick={() =>
              onTaskUpdate({
                status:
                  task.status === "resuelto" ? "en_progreso" : "resuelto",
              })
            }
            className={clsx(
              "focus-ring flex shrink-0 items-center gap-2 rounded-lg border px-2.5 py-2 text-[11px] font-semibold transition sm:px-3",
              task.status === "resuelto"
                ? "border-emerald-500 bg-emerald-500 text-white"
                : "border-slate-300 text-slate-600 hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-700",
            )}
          >
            <CheckCircle2 className="size-4" />
            <span className="hidden sm:inline">
              {task.status === "resuelto" ? "Completada" : "Completar tarea"}
            </span>
          </button>

          {!embedded && (
            <input
              key={`${task.id}-toolbar-title`}
              defaultValue={task.title}
              onBlur={(event) => {
                const title = event.target.value.trim();
                if (title.length >= 2 && title !== task.title) {
                  onTaskUpdate({ title });
                }
              }}
              className="focus-ring min-w-0 flex-1 truncate rounded-md border border-transparent bg-transparent px-2 py-1.5 text-[15px] font-semibold text-slate-900 hover:border-slate-200 focus:border-violet-300 sm:text-[17px]"
              aria-label="Título de la tarea"
            />
          )}

          <div
            className="hidden shrink-0 items-center -space-x-2 md:flex"
            aria-label="Colaboradores de la tarea"
          >
            {collaborators.map((person) => (
              <span
                key={person.id}
                className="group/collaborator relative rounded-full border-2 border-white"
              >
                <Avatar person={person} size="sm" />
                <span
                  role="tooltip"
                  className="pointer-events-none absolute left-1/2 top-[calc(100%+8px)] z-30 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-950 px-2 py-1 text-[9px] font-semibold text-white opacity-0 shadow-lg transition group-hover/collaborator:opacity-100 group-focus-within/collaborator:opacity-100"
                >
                  {person.name}
                </span>
              </span>
            ))}
            {involvedPeople.size > collaborators.length && (
              <span
                className="group/collaborator relative grid size-7 place-items-center rounded-full border-2 border-white bg-slate-100 text-[9px] font-semibold text-slate-500"
                tabIndex={0}
              >
                +{involvedPeople.size - collaborators.length}
                <span
                  role="tooltip"
                  className="pointer-events-none absolute right-0 top-[calc(100%+8px)] z-30 w-max max-w-64 rounded-md bg-slate-950 px-2 py-1 text-[9px] font-semibold text-white opacity-0 shadow-lg transition group-hover/collaborator:opacity-100 group-focus/collaborator:opacity-100"
                >
                  {people
                    .filter(
                      (person) =>
                        involvedPeople.has(person.id) &&
                        !collaborators.some((item) => item.id === person.id),
                    )
                    .map((person) => person.name)
                    .join(", ")}
                </span>
              </span>
            )}
            <button
              type="button"
              className="focus-ring ml-1 grid size-7 place-items-center rounded-full border border-slate-300 bg-white text-slate-500 hover:bg-slate-50"
              aria-label="Agregar colaborador"
              title="Agregar colaborador"
              onClick={() =>
                notify(
                  "Los colaboradores se agregan asignando responsables o comentando en la tarea",
                )
              }
            >
              <Plus className="size-3.5" />
            </button>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
            {canTrackTime && (
              <button
                type="button"
                onClick={() =>
                  activeTimeEntry
                    ? onTimerStop(activeTimeEntry.id)
                    : onTimerStart("", true)
                }
                className={clsx(
                  "focus-ring flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-[10px] font-semibold tabular-nums",
                  activeTimeEntry
                    ? "border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100"
                    : "border-[#0a84ff]/20 bg-[#0a84ff]/8 text-[#0879ea] hover:bg-[#0a84ff]/14",
                )}
                aria-label={
                  activeTimeEntry
                    ? "Detener timer de esta tarea"
                    : "Iniciar timer de esta tarea"
                }
              >
                {activeTimeEntry ? (
                  <Pause className="size-4 fill-current" />
                ) : (
                  <Play className="size-4 fill-current" />
                )}
                <span className="hidden sm:inline">
                  {activeTimeEntry
                    ? formatDuration(elapsedSeconds(activeTimeEntry))
                    : "Iniciar timer"}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => void copyTaskLink()}
              className="focus-ring hidden items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-[10px] font-semibold text-slate-600 hover:bg-slate-50 sm:flex"
              aria-label="Compartir tarea"
            >
              <UserPlus className="size-4" />
              Compartir
            </button>
            <button
              type="button"
              onClick={() => setIsLiked((value) => !value)}
              className={clsx(
                "focus-ring rounded-lg p-2",
                isLiked
                  ? "bg-rose-50 text-rose-500"
                  : "text-slate-400 hover:bg-slate-100 hover:text-slate-700",
              )}
              aria-label={isLiked ? "Quitar Me gusta" : "Me gusta"}
              aria-pressed={isLiked}
              title="Me gusta"
            >
              <ThumbsUp
                className={clsx("size-[18px]", isLiked && "fill-current")}
              />
            </button>
            <button
              type="button"
              onClick={() => void copyTaskLink()}
              className="focus-ring rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Copiar enlace de la tarea"
              title="Copiar enlace"
            >
              <Link2 className="size-[18px]" />
            </button>
            <button
              type="button"
              onClick={() => setIsFullscreen((value) => !value)}
              className={clsx(
                "focus-ring hidden rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 sm:block",
                embedded && "lg:hidden",
              )}
              aria-label={
                isFullscreen
                  ? "Salir de pantalla completa"
                  : "Abrir en pantalla completa"
              }
              title={
                isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"
              }
            >
              {isFullscreen ? (
                <Minimize2 className="size-[18px]" />
              ) : (
                <Maximize2 className="size-[18px]" />
              )}
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setMoreMenuOpen((value) => !value)}
                className="focus-ring rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Más acciones de la tarea"
                aria-expanded={moreMenuOpen}
              >
                <MoreHorizontal className="size-[18px]" />
              </button>
              {moreMenuOpen && (
                <div className="absolute right-0 top-full z-20 mt-1 w-52 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                  {!task.parentTaskId && (
                    <button
                      type="button"
                      onClick={onTaskArchive}
                      className="focus-ring flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[10px] font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      <Archive className="size-4" />
                      Archivar expediente
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onTaskDelete}
                    className="focus-ring flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[10px] font-semibold text-rose-600 hover:bg-rose-50"
                  >
                    <Trash2 className="size-4" />
                    Eliminar tarea
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              className="focus-ring rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Cerrar"
            >
              <X className="size-5" />
            </button>
          </div>
        </header>

        <div className="soft-scrollbar task-detail-content flex flex-1 flex-col overflow-y-auto px-5 py-6 sm:px-9 lg:px-12">
          {embedded && (
            <input
              key={`${task.id}-panel-title`}
              defaultValue={task.title}
              onBlur={(event) => {
                const title = event.target.value.trim();
                if (title.length >= 2 && title !== task.title) {
                  onTaskUpdate({ title });
                }
              }}
              className="task-panel-title focus-ring mb-5 w-full rounded-md border border-transparent bg-transparent px-1 py-2 text-[23px] font-semibold tracking-[-0.025em] text-slate-900 hover:border-slate-700 focus:border-slate-600"
              aria-label="Título de la tarea"
            />
          )}
          <section
            className="task-core-fields grid gap-2 border-b border-slate-200 pb-6 sm:grid-cols-3"
            aria-label="Datos principales de la tarea"
            data-testid="task-core-fields"
          >
            <label className="group/field rounded-lg px-3 py-2 transition hover:bg-slate-50">
              <span className="mb-1.5 flex items-center gap-2 text-[10px] font-semibold text-slate-400">
                <Circle className="size-3.5" />
                Estado
              </span>
              <select
                value={task.status}
                onChange={(event) =>
                  onTaskUpdate({ status: event.target.value as TaskStatus })
                }
                className="focus-ring w-full border-0 bg-transparent p-0 text-[12px] font-semibold text-slate-700"
                aria-label="Estado"
              >
                {(Object.keys(statusMeta) as TaskStatus[]).map((status) => (
                  <option value={status} key={status}>
                    {statusMeta[status].label}
                  </option>
                ))}
              </select>
            </label>

            <label className="group/field rounded-lg px-3 py-2 transition hover:bg-slate-50">
              <span className="mb-1.5 flex items-center gap-2 text-[10px] font-semibold text-slate-400">
                <UserRound className="size-3.5" />
                Responsable
              </span>
              <span className="flex items-center gap-2">
                <Avatar person={task.assignee} size="sm" />
                <select
                  value={task.assignee?.id ?? ""}
                  onChange={(event) =>
                    onTaskUpdate({ assigneeId: event.target.value || null })
                  }
                  className="focus-ring min-w-0 flex-1 border-0 bg-transparent p-0 text-[12px] font-semibold text-slate-700"
                  aria-label="Responsable"
                >
                  <option value="">Sin responsable</option>
                  {people.map((person) => (
                    <option value={person.id} key={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
              </span>
            </label>

            <details className="group/schedule relative rounded-lg transition hover:bg-slate-50">
              <summary className="focus-ring flex h-full cursor-pointer list-none items-center gap-3 rounded-lg px-3 py-2">
                <span className="grid size-8 shrink-0 place-items-center rounded-full border border-slate-300 text-slate-500">
                  <CalendarDays className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] font-semibold text-slate-400">
                    Planificación
                  </span>
                  <span className="mt-1 block truncate text-[12px] font-semibold text-slate-700">
                    {task.dueLabel || "Sin fecha"}
                    {(task.recurrenceRule ?? "none") !== "none" &&
                      ` · ${recurrenceLabels[task.recurrenceRule ?? "none"]}`}
                  </span>
                </span>
                <ChevronDown className="size-4 text-slate-400 transition group-open/schedule:rotate-180" />
              </summary>
              <div className="absolute right-0 top-[calc(100%+6px)] z-40 w-[min(360px,calc(100vw-48px))] rounded-xl border border-slate-200 bg-white p-4 shadow-2xl">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-[10px] font-semibold text-slate-500">
                    Inicio
                    <input
                      type="date"
                      value={task.startDate ?? ""}
                      max={task.dueDate ?? undefined}
                      onChange={(event) => {
                        const startDate = event.target.value || null;
                        onTaskUpdate({
                          startDate,
                          ...(startDate && task.dueDate && startDate > task.dueDate
                            ? { dueDate: startDate }
                            : {}),
                        });
                      }}
                      className="focus-ring mt-1.5 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-[11px] text-slate-700"
                      aria-label="Fecha de inicio"
                    />
                  </label>
                  <label className="text-[10px] font-semibold text-slate-500">
                    Vencimiento
                    <input
                      type="date"
                      value={task.dueDate ?? ""}
                      min={task.startDate ?? undefined}
                      onChange={(event) =>
                        onTaskUpdate({ dueDate: event.target.value || null })
                      }
                      className="focus-ring mt-1.5 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-[11px] text-slate-700"
                      aria-label="Fecha de vencimiento"
                    />
                  </label>
                  <label className="text-[10px] font-semibold text-slate-500">
                    Hora
                    <input
                      type="time"
                      value={task.dueTime ?? ""}
                      onChange={(event) =>
                        onTaskUpdate({ dueTime: event.target.value || null })
                      }
                      className="focus-ring mt-1.5 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-[11px] text-slate-700"
                      aria-label="Hora de vencimiento"
                    />
                  </label>
                  {!task.parentTaskId && (
                    <label className="text-[10px] font-semibold text-slate-500">
                      Repetición
                      <select
                        value={task.recurrenceRule ?? "none"}
                        onChange={(event) =>
                          onTaskUpdate({
                            recurrenceRule: event.target.value as TaskRecurrence,
                          })
                        }
                        className="focus-ring mt-1.5 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-[11px] text-slate-700"
                        aria-label="Repetición de la tarea"
                      >
                        {(Object.keys(recurrenceLabels) as TaskRecurrence[]).map(
                          (rule) => (
                            <option key={rule} value={rule}>
                              {recurrenceLabels[rule]}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                  )}
                </div>
                {!task.parentTaskId &&
                  (task.recurrenceRule ?? "none") !== "none" && (
                    <label className="mt-3 flex items-center gap-2 text-[10px] font-semibold text-slate-500">
                      Repetir cada
                      <input
                        type="number"
                        min={1}
                        max={52}
                        value={task.recurrenceInterval ?? 1}
                        onChange={(event) =>
                          onTaskUpdate({
                            recurrenceInterval: Math.max(
                              1,
                              Number(event.target.value) || 1,
                            ),
                          })
                        }
                        className="focus-ring h-8 w-16 rounded-lg border border-slate-200 bg-white px-2 text-center text-[11px] text-slate-700"
                        aria-label="Intervalo de repetición"
                      />
                      períodos
                    </label>
                  )}
              </div>
            </details>
          </section>

          <div className="hidden items-center gap-2">
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
              {task.projects.length > 1 && (
                <span className="rounded-full bg-[#0a84ff]/10 px-1.5 py-0.5 text-[8px] font-bold text-[#0879ea]">
                  +{task.projects.length - 1}
                </span>
              )}
            </span>
          </div>
          <div className="hidden"><TaskLastEdited task={task} /></div>

          <details className="hidden" open>
            <summary className="focus-ring flex cursor-pointer list-none items-center gap-2 rounded-lg py-2 text-[12px] font-semibold text-slate-700 hover:text-[#0879ea]">
              <ChevronDown className="size-4 transition group-open:rotate-180" />
              Detalles
              <span className="ml-2 hidden items-center gap-1.5 sm:flex">
                <span
                  className={clsx(
                    "rounded-full px-2 py-1 text-[9px] font-semibold",
                    statusMeta[task.status].surface,
                    statusMeta[task.status].text,
                  )}
                >
                  {statusMeta[task.status].label}
                </span>
                <PriorityBadge priority={task.priority} />
                <span className="truncate text-[10px] font-normal text-slate-400">
                  {task.assignee?.name ?? "Sin responsable"} · {task.dueLabel}
                </span>
              </span>
            </summary>
            <div className="mt-3 grid grid-cols-[116px_1fr] gap-y-3 text-[12px] sm:grid-cols-[150px_1fr] lg:grid-cols-[170px_1fr]">
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
              <FolderKanban className="size-3.5" />
              Proyectos
            </span>
            <div className="flex flex-wrap gap-2">
              {projects.map((project) => {
                const checked = task.projects.some(
                  (item) => item.id === project.id,
                );
                return (
                  <label
                    key={project.id}
                    className={clsx(
                      "flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[9px] font-semibold",
                      checked
                        ? "border-[#0a84ff]/30 bg-[#0a84ff]/8 text-[#0879ea]"
                        : "border-slate-200 text-slate-500",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={checked && task.projects.length === 1}
                      onChange={(event) => {
                        const projectIds = event.target.checked
                          ? [
                              ...new Set([
                                ...task.projects.map((item) => item.id),
                                project.id,
                              ]),
                            ]
                          : task.projects
                              .filter((item) => item.id !== project.id)
                              .map((item) => item.id);
                        onTaskUpdate({ projectIds });
                      }}
                      className="accent-[#0a84ff]"
                    />
                    <span
                      className="size-1.5 rounded-full"
                      style={{ backgroundColor: project.color }}
                    />
                    {project.name}
                  </label>
                );
              })}
            </div>

            <span className="flex items-center gap-2 text-slate-400">
              <Building2 className="size-3.5" />
              Cliente
            </span>
            <select
              value={task.clientId ?? ""}
              onChange={(event) =>
                onTaskUpdate({
                  clientId: event.target.value || null,
                  clientCategory: null,
                })
              }
              className="focus-ring min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-semibold text-slate-700"
              aria-label="Cliente de la tarea"
            >
              <option value="">Sin cliente</option>
              {clients
                .filter((client) => !client.archived)
                .map((client) => (
                  <option value={client.id} key={client.id}>
                    {client.name}
                  </option>
                ))}
            </select>

            <span className="flex items-center gap-2 text-slate-400">
              <Tags className="size-3.5" />
              Categoría
            </span>
            <select
              value={task.clientCategory ?? ""}
              disabled={!selectedClient}
              onChange={(event) =>
                onTaskUpdate({
                  clientCategory: event.target.value || null,
                })
              }
              className="focus-ring min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-semibold text-slate-700 disabled:bg-slate-50"
              aria-label="Categoría del cliente"
            >
              <option value="">Sin categoría</option>
              {(selectedClient?.categories ?? []).map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>

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
              Inicio
            </span>
            <input
              type="date"
              value={task.startDate ?? ""}
              max={task.dueDate ?? undefined}
              onChange={(event) => {
                const startDate = event.target.value || null;
                onTaskUpdate({
                  startDate,
                  ...(startDate &&
                  task.dueDate &&
                  startDate > task.dueDate
                    ? { dueDate: startDate }
                    : {}),
                });
              }}
              className="focus-ring w-fit rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-semibold text-slate-700"
              aria-label="Fecha de inicio"
            />

            <span className="flex items-center gap-2 text-slate-400">
              <CalendarDays className="size-3.5" />
              Vencimiento
            </span>
            <input
              type="date"
              value={task.dueDate ?? ""}
              min={task.startDate ?? undefined}
              onChange={(event) =>
                onTaskUpdate({ dueDate: event.target.value || null })
              }
              className="focus-ring w-fit rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-semibold text-slate-700"
              aria-label="Fecha de vencimiento"
            />

            <span className="flex items-center gap-2 text-slate-400">
              <Clock3 className="size-3.5" />
              Hora
            </span>
            <input
              type="time"
              value={task.dueTime ?? ""}
              onChange={(event) =>
                onTaskUpdate({ dueTime: event.target.value || null })
              }
              className="focus-ring w-fit rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-semibold text-slate-700"
              aria-label="Hora de vencimiento"
            />

            {!task.parentTaskId && (
              <>
                <span className="flex items-center gap-2 text-slate-400">
                  <Repeat2 className="size-3.5" />
                  Repetición
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={task.recurrenceRule ?? "none"}
                    onChange={(event) =>
                      onTaskUpdate({
                        recurrenceRule: event.target.value as TaskRecurrence,
                      })
                    }
                    className="focus-ring rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-semibold text-slate-700"
                    aria-label="Repetición de la tarea"
                  >
                    {(Object.keys(recurrenceLabels) as TaskRecurrence[]).map(
                      (rule) => (
                        <option key={rule} value={rule}>
                          {recurrenceLabels[rule]}
                        </option>
                      ),
                    )}
                  </select>
                  {(task.recurrenceRule ?? "none") !== "none" && (
                    <label className="flex items-center gap-1.5 text-[10px] text-slate-500">
                      cada
                      <input
                        type="number"
                        min={1}
                        max={52}
                        value={task.recurrenceInterval ?? 1}
                        onChange={(event) =>
                          onTaskUpdate({
                            recurrenceInterval: Math.max(
                              1,
                              Number(event.target.value) || 1,
                            ),
                          })
                        }
                        className="focus-ring w-14 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-center font-semibold text-slate-700"
                        aria-label="Intervalo de repetición"
                      />
                    </label>
                  )}
                </div>
              </>
            )}
            </div>
          </details>

          <div className="h-5" />

          <section className="task-detail-description">
            <h3 className="text-[15px] font-bold tracking-[-0.01em] text-slate-800">
              Descripción
            </h3>
            <TaskDescriptionEditor
              task={task}
              onUpdate={(description) => onTaskUpdate({ description })}
              onUpload={onAttachmentUpload}
              onOpen={onAttachmentOpen}
              onCreateSubtask={(title) =>
                onSubtaskCreate(
                  title,
                  task.assignee?.id ?? currentPerson?.id ?? "",
                )
              }
            />
            <label className="hidden">
              <span className="mb-2 flex items-center gap-2 text-[10px] font-semibold text-slate-500">
                <Tags className="size-3.5" />
                Etiquetas
              </span>
              <input
                key={`${task.id}-tags`}
                defaultValue={task.tags.join(", ")}
                onBlur={(event) => {
                  const tags = [
                    ...new Set(
                      event.target.value
                        .split(",")
                        .map((tag) => tag.trim())
                        .filter(Boolean),
                    ),
                  ];
                  if (tags.join("|") !== task.tags.join("|")) {
                    onTaskUpdate({ tags });
                  }
                }}
                placeholder="Diseño, Cartelería, Cambio de cliente"
                className="focus-ring w-full rounded-lg border border-transparent bg-transparent px-2 py-2 text-[12px] text-slate-700 placeholder:text-slate-400 hover:border-slate-200 focus:border-violet-300"
                aria-label="Etiquetas de la tarea"
              />
              <span className="mt-1.5 block text-[9px] text-slate-400">
                Separalas con comas. También se incluyen en la búsqueda.
              </span>
            </label>
          </section>

          <div className="hidden">
          <details className="task-detail-timer-panel group/audit overflow-hidden rounded-xl border border-slate-200 bg-white">
            <summary className="focus-ring flex cursor-pointer list-none items-center gap-3 px-4 py-3 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 hover:text-[#0879ea]">
              <Activity className="size-4 text-violet-500" />
              Tiempo, proceso e historial
              <span className="hidden text-[10px] font-normal text-slate-400 sm:inline">
                {formatDuration(trackedSeconds)} · {task.events?.length ?? 0} movimientos
              </span>
              <ChevronDown className="ml-auto size-4 transition group-open/audit:rotate-180" />
            </summary>
            <div className="border-t border-slate-100 px-4 pb-4">
              <ProcessBriefAndHistory
                task={task}
                subtasks={subtasks}
                timeEntries={timeEntries}
                onUpdate={onTaskUpdate}
                notify={notify}
              />

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

          <section className="mt-8 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">
                  <Activity className="size-3.5 text-violet-500" />
                  Resumen de actividad
                </h3>
                <p className="mt-1 text-[10px] leading-4 text-slate-400">
                  Una lectura rápida del esfuerzo y el intercambio acumulado.
                </p>
              </div>
              {task.recurrenceOriginId && (
                <span className="rounded-full bg-violet-100 px-2 py-1 text-[9px] font-semibold text-violet-700">
                  Generada automáticamente
                </span>
              )}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                {
                  label: "Personas",
                  value: String(involvedPeople.size),
                  icon: UsersRound,
                },
                {
                  label: "Intercambios",
                  value: String(
                    task.comments.length + task.attachments.length,
                  ),
                  icon: MessageSquare,
                },
                {
                  label: "Registrado",
                  value: formatDuration(trackedSeconds),
                  icon: Clock3,
                },
                {
                  label: "Ciclo",
                  value: elapsedDays ? `${elapsedDays} d` : "—",
                  icon: Hourglass,
                },
              ].map((metric) => {
                const Icon = metric.icon;
                return (
                  <div
                    key={metric.label}
                    className="rounded-xl border border-white bg-white px-3 py-3 shadow-sm"
                  >
                    <Icon className="size-3.5 text-slate-400" />
                    <p className="mt-2 truncate text-[14px] font-bold text-slate-800">
                      {metric.value}
                    </p>
                    <p className="mt-0.5 text-[8px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                      {metric.label}
                    </p>
                  </div>
                );
              })}
            </div>
            {(task.recurrenceRule ?? "none") !== "none" &&
              !task.parentTaskId && (
                <p className="mt-3 flex items-start gap-2 rounded-xl bg-violet-50 px-3 py-2.5 text-[10px] leading-4 text-violet-700">
                  <Repeat2 className="mt-0.5 size-3.5 shrink-0" />
                  Al completarla se crea la próxima ocurrencia con sus subtareas
                  y responsables. Este historial no se modifica.
                </p>
              )}
          </section>
            </div>
          </details>
          </div>

          <section className="hidden">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-[15px] font-bold text-slate-800">
                <Paperclip className="size-4 text-slate-400" />
                Adjuntos
                <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500">
                  {task.attachments.filter((item) => !item.deletedAt).length}
                </span>
              </h3>
              <button
                onClick={() => attachmentInput.current?.click()}
                className="focus-ring flex items-center gap-1.5 rounded-lg bg-[#0a84ff]/10 px-2.5 py-1.5 text-[10px] font-semibold text-[#0879ea] hover:bg-[#0a84ff]/15"
              >
                <Plus className="size-3.5" />
                Adjuntar
              </button>
            </div>
            <input
              ref={attachmentInput}
              type="file"
              multiple
              aria-label="Seleccionar adjuntos de la tarea"
              className="sr-only"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                if (files.length) void onAttachmentUpload(files);
                event.target.value = "";
              }}
            />
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {task.attachments.map((attachment) => (
                <div
                  key={attachment.id}
                  className={clsx(
                    "group flex min-w-0 flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3 hover:border-slate-300",
                    attachment.deletedAt && "opacity-55",
                  )}
                >
                  {!attachment.deletedAt &&
                    isImageFile(attachment.mimeType) && (
                      <div className="w-full overflow-hidden rounded-lg border border-slate-200 bg-white">
                        <EmbeddedTaskAttachment
                          attachment={attachment}
                          onOpen={() => onAttachmentOpen(attachment)}
                        />
                      </div>
                    )}
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white text-[#0a84ff] shadow-sm">
                    <FileText className="size-4" />
                  </span>
                  <button
                    disabled={Boolean(attachment.deletedAt)}
                    onClick={() => onAttachmentOpen(attachment)}
                    className="focus-ring min-w-0 flex-1 rounded-md text-left disabled:cursor-default"
                  >
                    <span className="block truncate text-[11px] font-semibold text-slate-700">
                      {attachment.name}
                    </span>
                    <span className="mt-0.5 block text-[9px] text-slate-400">
                      v{attachment.versionNumber ?? 1} ·{" "}
                      {formatBytes(attachment.size)} · {attachment.uploader.name}
                      {attachment.deletedAt && " · retirado"}
                    </span>
                  </button>
                  {!attachment.deletedAt && (
                    <>
                      <select
                        value={attachment.approvalStatus ?? "draft"}
                        onChange={(event) =>
                          onAttachmentStatus(
                            attachment,
                            event.target.value as AttachmentApprovalStatus,
                          )
                        }
                        className="focus-ring rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[9px] font-semibold text-slate-600"
                        aria-label={`Estado de aprobación de ${attachment.name}`}
                      >
                        {(
                          Object.keys(
                            attachmentStatusLabels,
                          ) as AttachmentApprovalStatus[]
                        ).map((status) => (
                          <option key={status} value={status}>
                            {attachmentStatusLabels[status]}
                          </option>
                        ))}
                      </select>
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
                        aria-label={`Retirar ${attachment.name}`}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </>
                  )}
                  {attachment.deletedAt && (
                    <button
                      onClick={() => onAttachmentRestore(attachment)}
                      className="focus-ring rounded-lg bg-[#0a84ff]/10 px-2.5 py-1.5 text-[9px] font-semibold text-[#0879ea]"
                    >
                      Restaurar
                    </button>
                  )}
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

          <section className="task-detail-subtasks mt-8">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-[15px] font-bold text-slate-800">
                <GitBranch className="size-4 text-slate-400" />
                Subtareas
                <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500">
                  {subtasks.filter((item) => item.status === "resuelto").length}/
                  {subtasks.length}
                </span>
              </h3>
              <button
                type="button"
                onClick={() =>
                  document
                    .querySelector<HTMLInputElement>(
                      'input[aria-label="Nombre de la subtarea"]',
                    )
                    ?.focus()
                }
                className="focus-ring grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Agregar subtarea"
              >
                <Plus className="size-4" />
              </button>
            </div>
            <div className="mt-3 divide-y divide-slate-200 border-y border-slate-200">
              {subtasks.map((subtask) => (
                <div
                  key={subtask.id}
                  className="flex items-center gap-3 px-2 py-3 transition hover:bg-slate-50"
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
                      {subtask.code}
                    </p>
                  </button>
                  <span className="ml-auto text-[9px] text-slate-400">
                    {subtask.dueLabel}
                  </span>
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
              className="mt-2 grid gap-2 sm:grid-cols-[1fr_170px_auto]"
            >
              <input
                value={subtaskTitle}
                onChange={(event) => setSubtaskTitle(event.target.value)}
                placeholder="Nueva subtarea…"
                className="focus-ring min-w-0 rounded-lg border border-transparent bg-transparent px-3 py-2 text-[11px] text-slate-700 hover:border-slate-200 focus:border-violet-300"
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

          <section className="task-detail-activity mt-10 border-t border-slate-200 pt-2">
            <div className="flex items-center border-b border-slate-200">
              <div className="flex items-center gap-7" role="tablist" aria-label="Actividad de la tarea">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activityTab === "comments"}
                  onClick={() => setActivityTab("comments")}
                  className={clsx(
                    "focus-ring -mb-px border-b-2 px-0.5 py-3 text-[12px] font-semibold",
                    activityTab === "comments"
                      ? "border-slate-700 text-slate-800"
                      : "border-transparent text-slate-400 hover:text-slate-700",
                  )}
                >
                  Comentarios
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activityTab === "all"}
                  onClick={() => setActivityTab("all")}
                  className={clsx(
                    "focus-ring -mb-px border-b-2 px-0.5 py-3 text-[12px] font-semibold",
                    activityTab === "all"
                      ? "border-slate-700 text-slate-800"
                      : "border-transparent text-slate-400 hover:text-slate-700",
                  )}
                >
                  Toda la actividad
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activityTab === "attachments"}
                  onClick={() => setActivityTab("attachments")}
                  className={clsx(
                    "focus-ring -mb-px flex items-center gap-1.5 border-b-2 px-0.5 py-3 text-[12px] font-semibold",
                    activityTab === "attachments"
                      ? "border-slate-700 text-slate-800"
                      : "border-transparent text-slate-400 hover:text-slate-700",
                  )}
                >
                  Adjuntos
                  <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[8px] text-slate-500">
                    {task.attachments.filter((item) => !item.deletedAt).length}
                  </span>
                </button>
              </div>
              <button
                type="button"
                onClick={() => setActivityNewestFirst((value) => !value)}
                className="focus-ring ml-auto rounded-lg px-2.5 py-2 text-[10px] font-semibold text-slate-400 hover:bg-slate-50 hover:text-slate-700"
                aria-label={
                  activityNewestFirst
                    ? "Ordenar actividad: más antiguas primero"
                    : "Ordenar actividad: más recientes primero"
                }
              >
                {activityNewestFirst ? "Más recientes" : "Más antiguas"}
              </button>
            </div>

            {activityTab === "all" ? (
              <div className="py-4" role="tabpanel">
                <ActivityHistory
                  task={task}
                  subtasks={subtasks}
                  defaultExpanded
                />
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
              </div>
            ) : activityTab === "attachments" ? (
              <div className="py-5" role="tabpanel">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-[13px] font-bold text-slate-800">
                      Archivos de la tarea
                    </h3>
                    <p className="mt-1 text-[9px] text-slate-400">
                      Las imágenes insertadas en la descripción también se conservan acá.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => attachmentInput.current?.click()}
                    className="focus-ring flex items-center gap-1.5 rounded-lg bg-[#0a84ff]/10 px-3 py-2 text-[10px] font-semibold text-[#5aa7ff] hover:bg-[#0a84ff]/15"
                  >
                    <Plus className="size-3.5" />
                    Adjuntar
                  </button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {task.attachments.map((attachment) => (
                    <article
                      key={attachment.id}
                      className={clsx(
                        "group/attachment flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3 transition hover:border-slate-300 hover:bg-slate-50",
                        attachment.deletedAt && "opacity-55",
                      )}
                    >
                      <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-white text-[#0a84ff] shadow-sm">
                        <FileText className="size-4" />
                      </span>
                      <button
                        type="button"
                        disabled={Boolean(attachment.deletedAt)}
                        onClick={() => onAttachmentOpen(attachment)}
                        className="focus-ring min-w-0 flex-1 rounded-md text-left"
                      >
                        <span className="block truncate text-[11px] font-semibold text-slate-700">
                          {attachment.name}
                        </span>
                        <span className="mt-0.5 block text-[9px] text-slate-400">
                          v{attachment.versionNumber ?? 1} · {formatBytes(attachment.size)} · {attachment.uploader.name}
                        </span>
                      </button>
                      {attachment.deletedAt ? (
                        <button
                          type="button"
                          onClick={() => onAttachmentRestore(attachment)}
                          className="focus-ring rounded-md px-2 py-1 text-[9px] font-semibold text-[#5aa7ff]"
                        >
                          Restaurar
                        </button>
                      ) : (
                        <>
                          <select
                            value={attachment.approvalStatus ?? "draft"}
                            onChange={(event) =>
                              onAttachmentStatus(
                                attachment,
                                event.target.value as AttachmentApprovalStatus,
                              )
                            }
                            className="focus-ring max-w-28 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[9px] font-semibold text-slate-600"
                            aria-label={`Estado de aprobación de ${attachment.name}`}
                          >
                            {(
                              Object.keys(
                                attachmentStatusLabels,
                              ) as AttachmentApprovalStatus[]
                            ).map((status) => (
                              <option key={status} value={status}>
                                {attachmentStatusLabels[status]}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => onAttachmentDelete(attachment)}
                            className="focus-ring rounded-md p-1.5 text-slate-400 opacity-0 hover:bg-rose-500/10 hover:text-rose-500 group-hover/attachment:opacity-100 focus:opacity-100"
                            aria-label={`Retirar ${attachment.name}`}
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </>
                      )}
                    </article>
                  ))}
                  {task.attachments.length === 0 && (
                    <button
                      type="button"
                      onClick={() => attachmentInput.current?.click()}
                      className="focus-ring col-span-full rounded-xl border border-dashed border-slate-300 p-8 text-center text-[10px] text-slate-400 hover:border-[#0a84ff]/50 hover:text-[#5aa7ff]"
                    >
                      Todavía no hay archivos. Hacé clic para adjuntar.
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-6 py-6" role="tabpanel">
                {visibleComments.map((item) => (
                  <div key={item.id} className="group/comment flex gap-3">
                    <Avatar person={item.author} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="min-w-0 text-[11px]">
                          <span className="font-bold text-slate-800">
                            {item.author.name}
                          </span>
                          <span className="ml-2 text-[9px] text-slate-400">
                            {item.createdAt}
                          </span>
                        </p>
                        <span className="rounded-full bg-[#0a84ff]/10 px-2 py-0.5 text-[8px] font-bold text-[#0879ea]">
                          {commentTypeLabels[item.type ?? "comment"]}
                        </span>
                        {item.visibility === "client" && (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[8px] font-bold text-amber-700">
                            Visible cliente
                          </span>
                        )}
                        {!item.deletedAt && (
                          <button
                            onClick={() => onCommentDelete(item.id)}
                            className="focus-ring ml-auto rounded-md p-1 text-slate-300 opacity-0 hover:bg-rose-50 hover:text-rose-600 group-hover/comment:opacity-100 focus:opacity-100"
                            aria-label="Retirar comentario"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
                      </div>
                      <p
                        className={clsx(
                          "mt-1.5 whitespace-pre-wrap text-[12px] leading-6 text-slate-700",
                          item.deletedAt && "italic text-slate-400",
                        )}
                      >
                        {item.deletedAt
                          ? "Comentario retirado. Su registro se conserva en el historial."
                          : item.body}
                      </p>
                    </div>
                  </div>
                ))}
                {task.comments.length === 0 && (
                  <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-[11px] text-slate-400">
                    Todavía no hay comentarios. Sumá el primero para dejar
                    contexto al equipo.
                  </p>
                )}
              </div>
            )}
          </section>
        </div>

        <form
          onSubmit={submitComment}
          className="task-detail-comment-composer shrink-0 border-t border-slate-200 bg-white px-4 py-3 sm:px-8"
        >
          <div className="flex items-center gap-3">
            <Avatar person={currentPerson} size="sm" />
            <div className="flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-2 shadow-sm focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-100">
              <textarea
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                onFocus={() => setCommentComposerOpen(true)}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    (event.metaKey || event.ctrlKey) &&
                    comment.trim()
                  ) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder="Agregar un comentario"
                aria-label="Agregar un comentario"
                rows={commentComposerOpen ? 2 : 1}
                className="block min-h-6 w-full resize-none border-0 bg-transparent px-1 py-1 text-[12px] leading-5 text-slate-700 outline-none placeholder:text-slate-400"
              />
              {commentComposerOpen && (
              <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2">
                <div className="flex flex-wrap gap-1.5">
                  <select
                    value={commentType}
                    onChange={(event) =>
                      setCommentType(event.target.value as CommentType)
                    }
                    className="focus-ring rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-[9px] font-semibold text-slate-600"
                    aria-label="Tipo de comentario"
                  >
                    {(Object.keys(commentTypeLabels) as CommentType[]).map(
                      (type) => (
                        <option key={type} value={type}>
                          {commentTypeLabels[type]}
                        </option>
                      ),
                    )}
                  </select>
                  <button
                    type="button"
                    onClick={() => attachmentInput.current?.click()}
                    className="focus-ring rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    aria-label="Adjuntar archivo desde el comentario"
                    title="Adjuntar archivo"
                  >
                    <Paperclip className="size-4" />
                  </button>
                  <select
                    value={commentVisibility}
                    onChange={(event) =>
                      setCommentVisibility(
                        event.target.value as CommentVisibility,
                      )
                    }
                    className="focus-ring rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-[9px] font-semibold text-slate-600"
                    aria-label="Visibilidad del comentario"
                  >
                    <option value="team">Solo equipo</option>
                    <option value="client">Visible cliente</option>
                  </select>
                </div>
                <div className="flex items-center gap-1.5">
                  {!comment.trim() && (
                    <button
                      type="button"
                      onClick={() => setCommentComposerOpen(false)}
                      className="focus-ring rounded-lg px-2 py-1.5 text-[9px] font-semibold text-slate-400 hover:bg-slate-100"
                    >
                      Contraer
                    </button>
                  )}
                  <button
                    disabled={!comment.trim()}
                    className="focus-ring rounded-lg bg-[#5b4bec] px-3.5 py-2 text-[10px] font-bold text-white transition hover:bg-[#4f40da] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Comentar
                  </button>
                </div>
              </div>
              )}
            </div>
          </div>
        </form>
      </aside>
    </div>
  );
}

function NewTaskModal({
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
  onCreate: (task: NewTaskInput, files: File[]) => Promise<void>;
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
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const descriptionAttachmentInput = useRef<HTMLInputElement>(null);
  const selectedClient =
    clients.find((client) => client.id === clientId) ?? null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onCreate(
        {
          title: title.trim(),
          description: description.trim(),
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
          tags: tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
          recurrenceRule,
          recurrenceInterval,
          templateId: templateId || undefined,
        },
        pendingFiles,
      );
    } finally {
      setSubmitting(false);
    }
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
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.requestSubmit();
          }
        }}
        className="animate-enter relative flex max-h-[94vh] w-full max-w-[720px] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_28px_80px_rgba(15,23,42,0.25)]"
      >
        <header className="flex shrink-0 items-center border-b border-slate-100 px-5 py-4 sm:px-7">
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

        <div className="soft-scrollbar flex-1 space-y-5 overflow-y-auto px-5 py-6 sm:px-7">
          <details className="group rounded-xl border border-slate-200 bg-slate-50/60">
            <summary className="focus-ring flex cursor-pointer list-none items-center gap-2 px-3 py-3 text-[11px] font-semibold text-slate-600">
              <Sparkles className="size-3.5 text-violet-500" />
              Usar una plantilla de proceso
              {templateId && (
                <span className="rounded-full bg-violet-50 px-2 py-1 text-[9px] text-violet-700">
                  {processTemplates.find((item) => item.id === templateId)?.name}
                </span>
              )}
              <ChevronDown className="ml-auto size-4 transition group-open:rotate-180" />
            </summary>
            <label className="block border-t border-slate-100 p-3">
              <span className="sr-only">Plantilla de proceso</span>
              <select
                value={templateId}
                onChange={(event) => {
                  const nextId = event.target.value;
                  const template = findProcessTemplate(nextId);
                  setTemplateId(nextId);
                  if (!template) return;
                  setPriority(template.priority);
                  setTags(template.tags.join(", "));
                  if (!description.trim()) setDescription(template.description);
                }}
                className="focus-ring w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-[12px] text-slate-700"
              >
                <option value="">Empezar sin plantilla</option>
                {processTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name} · {template.steps.length} pasos
                  </option>
                ))}
              </select>
              <span className="mt-1.5 block text-[9px] text-slate-400">
                Crea el brief y las subtareas estándar; después podés adaptarlas.
              </span>
            </label>
          </details>
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
          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <label
                htmlFor="new-task-description"
                className="block text-[11px] font-bold text-slate-600"
              >
                Descripción
              </label>
              <button
                type="button"
                onClick={() => descriptionAttachmentInput.current?.click()}
                className="focus-ring flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[9px] font-semibold text-[#0879ea] hover:bg-[#0a84ff]/10"
                aria-label="Adjuntar archivos a la descripción"
              >
                <Paperclip className="size-3.5" />
                Adjuntar archivos
              </button>
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white focus-within:border-violet-300 focus-within:ring-2 focus-within:ring-violet-100">
              <textarea
                id="new-task-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Agregá el brief, los formatos y el resultado esperado…"
                className="min-h-28 w-full resize-y border-0 px-4 py-3 text-[13px] leading-relaxed text-slate-800 outline-none placeholder:text-slate-400"
              />
              {pendingFiles.length > 0 && (
                <div
                  className="space-y-4 px-4 pb-4"
                  data-testid="new-task-description-attachments"
                >
                  <p className="text-[9px] font-semibold text-slate-400">
                    Insertado dentro de la descripción
                  </p>
                  {pendingFiles.map((file, index) => (
                    <PendingDescriptionAttachment
                      key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
                      file={file}
                      onRemove={() =>
                        setPendingFiles((current) =>
                          current.filter(
                            (_, currentIndex) => currentIndex !== index,
                          ),
                        )
                      }
                    />
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-3 py-2">
                <button
                  type="button"
                  onClick={() => descriptionAttachmentInput.current?.click()}
                  className="focus-ring flex items-center gap-1.5 rounded-lg px-2 py-1 text-[9px] font-semibold text-slate-500 hover:bg-white hover:text-[#0879ea]"
                >
                  <Paperclip className="size-3.5" />
                  Imagen o archivo
                </button>
                <span className="text-[8px] text-slate-400">
                  Hasta 10 MB por archivo
                </span>
              </div>
              <input
                ref={descriptionAttachmentInput}
                type="file"
                multiple
                aria-label="Seleccionar archivos para la descripción"
                className="sr-only"
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  if (files.length) {
                    setPendingFiles((current) => [...current, ...files]);
                  }
                  event.target.value = "";
                }}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className="mb-2 block text-[11px] font-bold text-slate-600">
                Proyecto principal
              </span>
              <select
                required
                aria-label="Proyecto principal"
                value={projectId}
                onChange={(event) => {
                  const nextProjectId = event.target.value;
                  const nextProject = projects.find(
                    (project) => project.id === nextProjectId,
                  );
                  setProjectId(nextProjectId);
                  setClientId(nextProject?.clientId ?? "");
                  setClientCategory(nextProject?.clientCategory ?? "");
                  setProjectIds((current) =>
                    current.includes(nextProjectId)
                      ? current
                      : [nextProjectId, ...current],
                  );
                }}
                className="focus-ring w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-[12px] text-slate-700"
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="sm:col-span-2">
              <legend className="mb-2 block text-[11px] font-bold text-slate-600">
                También visible en
              </legend>
              <p className="-mt-1 mb-2 text-[9px] text-slate-400">
                La tarea conserva un único historial aunque aparezca en varios
                proyectos.
              </p>
              <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3 sm:grid-cols-2">
                {projects.map((project) => {
                  const checked = projectIds.includes(project.id);
                  return (
                    <label
                      key={project.id}
                      className="flex cursor-pointer items-center gap-2 rounded-lg bg-white px-3 py-2 text-[10px] font-semibold text-slate-600 shadow-sm"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={project.id === projectId}
                        onChange={(event) =>
                          setProjectIds((current) =>
                            event.target.checked
                              ? [...new Set([...current, project.id])]
                              : current.filter((id) => id !== project.id),
                          )
                        }
                        className="accent-[#0a84ff]"
                      />
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: project.color }}
                      />
                      <span className="truncate">{project.name}</span>
                      {project.id === projectId && (
                        <span className="ml-auto text-[8px] text-[#0879ea]">
                          Principal
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </fieldset>
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
                Inicio
              </span>
              <input
                type="date"
                value={startDate}
                max={dueDate || undefined}
                onChange={(event) => {
                  const nextStart = event.target.value;
                  setStartDate(nextStart);
                  if (dueDate && nextStart > dueDate) {
                    setDueDate(nextStart);
                  }
                }}
                className="focus-ring w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-[12px] text-slate-700"
              />
            </label>
            <label>
              <span className="mb-2 block text-[11px] font-bold text-slate-600">
                Fecha de entrega
              </span>
              <input
                type="date"
                value={dueDate}
                min={startDate || undefined}
                onChange={(event) => setDueDate(event.target.value)}
                className="focus-ring w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-[12px] text-slate-700"
              />
            </label>
            <label>
              <span className="mb-2 block text-[11px] font-bold text-slate-600">
                Hora de entrega
              </span>
              <input
                type="time"
                value={dueTime}
                onChange={(event) => setDueTime(event.target.value)}
                className="focus-ring w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-[12px] text-slate-700"
              />
            </label>
            <label>
              <span className="mb-2 block text-[11px] font-bold text-slate-600">
                Repetición
              </span>
              <select
                value={recurrenceRule}
                onChange={(event) =>
                  setRecurrenceRule(event.target.value as TaskRecurrence)
                }
                className="focus-ring w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-[12px] text-slate-700"
              >
                {(Object.keys(recurrenceLabels) as TaskRecurrence[]).map(
                  (rule) => (
                    <option key={rule} value={rule}>
                      {recurrenceLabels[rule]}
                    </option>
                  ),
                )}
              </select>
            </label>
            {recurrenceRule !== "none" && (
              <label>
                <span className="mb-2 block text-[11px] font-bold text-slate-600">
                  Repetir cada
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={52}
                    value={recurrenceInterval}
                    onChange={(event) =>
                      setRecurrenceInterval(
                        Math.max(1, Number(event.target.value) || 1),
                      )
                    }
                    className="focus-ring w-20 rounded-xl border border-slate-200 bg-white px-3 py-3 text-[12px] text-slate-700"
                  />
                  <span className="text-[10px] text-slate-500">
                    {recurrenceRule === "monthly"
                      ? "mes(es)"
                      : recurrenceRule === "daily"
                        ? "día(s)"
                        : "período(s)"}
                  </span>
                </div>
              </label>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className="mb-2 block text-[11px] font-bold text-slate-600">
                Cliente
              </span>
              <select
                value={clientId}
                onChange={(event) => {
                  setClientId(event.target.value);
                  setClientCategory("");
                }}
                className="focus-ring w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-[12px] text-slate-700"
              >
                <option value="">Sin cliente</option>
                {clients
                  .filter((client) => !client.archived)
                  .map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              <span className="mb-2 block text-[11px] font-bold text-slate-600">
                Categoría / servicio
              </span>
              <select
                value={clientCategory}
                disabled={!selectedClient}
                onChange={(event) => setClientCategory(event.target.value)}
                className="focus-ring w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-[12px] text-slate-700 disabled:bg-slate-50"
              >
                <option value="">Sin categoría</option>
                {(selectedClient?.categories ?? []).map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="mb-2 block text-[11px] font-bold text-slate-600">
              Etiquetas
            </span>
            <input
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="Ej. Diseño, Cartelería, Cambio de cliente"
              className="focus-ring w-full rounded-xl border border-slate-200 px-4 py-3 text-[13px] text-slate-700"
            />
            <span className="mt-1.5 block text-[9px] text-slate-400">
              Separalas con comas para encontrarlas después en filtros y búsqueda.
            </span>
          </label>
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/90 px-5 py-4 backdrop-blur sm:px-7">
          <span className="hidden text-[9px] text-slate-400 sm:block">
            ⌘ Enter para crear · los archivos se cargarán dentro del documento
          </span>
          <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="focus-ring rounded-lg px-4 py-2.5 text-[11px] font-semibold text-slate-500 hover:bg-white"
          >
            Cancelar
          </button>
          <button
            disabled={submitting}
            className="focus-ring flex items-center gap-2 rounded-lg bg-[#5b4bec] px-4 py-2.5 text-[11px] font-bold text-white shadow-[0_6px_16px_rgba(91,75,236,0.24)] transition hover:bg-[#4f40da] disabled:cursor-wait disabled:opacity-70"
          >
            {submitting ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            {submitting ? "Creando y cargando…" : "Crear tarea"}
          </button>
          </div>
        </footer>
      </form>
    </div>
  );
}

function NewProjectModal({
  workspaceId,
  clients,
  onClose,
  onCreate,
}: {
  workspaceId: string;
  clients: Client[];
  onClose: () => void;
  onCreate: (input: NewProjectInput) => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#6556EE");
  const [description, setDescription] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientCategory, setClientCategory] = useState("");
  const selectedClient =
    clients.find((client) => client.id === clientId) ?? null;
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
      clientId: clientId || undefined,
      clientCategory: clientCategory || undefined,
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
            Cliente
          </span>
          <select
            value={clientId}
            onChange={(event) => {
              setClientId(event.target.value);
              setClientCategory("");
            }}
            className="focus-ring w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-[12px] text-slate-700"
          >
            <option value="">Sin cliente</option>
            {clients
              .filter((client) => !client.archived)
              .map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
          </select>
        </label>
        <label className="mt-4 block">
          <span className="mb-2 block text-[11px] font-bold text-slate-600">
            Categoría / servicio
          </span>
          <select
            value={clientCategory}
            disabled={!selectedClient}
            onChange={(event) => setClientCategory(event.target.value)}
            className="focus-ring w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-[12px] text-slate-700 disabled:bg-slate-50"
          >
            <option value="">Sin categoría</option>
            {(selectedClient?.categories ?? []).map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
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

function ClientsModal({
  clients,
  projects,
  tasks,
  workspaceId,
  canManage,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
}: {
  clients: Client[];
  projects: Project[];
  tasks: Task[];
  workspaceId: string;
  canManage: boolean;
  onClose: () => void;
  onCreate: (input: NewClientInput) => Promise<unknown>;
  onUpdate: (clientId: string, input: UpdateClientInput) => Promise<void>;
  onDelete: (clientId: string) => Promise<void>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [clientQuery, setClientQuery] = useState("");
  const [clientStatus, setClientStatus] = useState<
    "active" | "archived" | "all"
  >("active");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [categories, setCategories] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingClient, setDeletingClient] = useState<Client | null>(null);
  const visibleClients = clients.filter((client) => {
    const normalized = clientQuery.trim().toLowerCase();
    const matchesStatus =
      clientStatus === "all" ||
      (clientStatus === "archived" ? client.archived : !client.archived);
    return (
      matchesStatus &&
      (!normalized ||
        [client.name, client.email, client.notes, ...client.categories]
          .join(" ")
          .toLowerCase()
          .includes(normalized))
    );
  });

  function clearForm() {
    setEditingId(null);
    setName("");
    setEmail("");
    setNotes("");
    setCategories("");
    setFormOpen(false);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !canManage) return;
    setSaving(true);
    try {
      if (editingId) {
        await onUpdate(editingId, {
          name: name.trim(),
          email: email.trim(),
          notes: notes.trim(),
          categories: categories
            .split(",")
            .map((category) => category.trim())
            .filter(Boolean),
        });
      } else {
        await onCreate({
          name: name.trim(),
          email: email.trim(),
          notes: notes.trim(),
          categories: categories
            .split(",")
            .map((category) => category.trim())
            .filter(Boolean),
          workspaceId,
        });
      }
      clearForm();
    } catch {
      // El contenedor muestra el error y el formulario conserva los datos.
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex bg-slate-950/45 p-0 backdrop-blur-sm sm:p-5">
      <section className="mac-window m-auto flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-none border border-black/10 bg-[#f6f7f9] shadow-2xl sm:rounded-2xl">
        <header className="flex items-center border-b border-black/[0.07] bg-white/90 px-5 py-4 backdrop-blur-xl">
          <span className="grid size-10 place-items-center rounded-xl bg-[#0a84ff]/10 text-[#0a84ff]">
            <ContactRound className="size-5" />
          </span>
          <div className="ml-3">
            <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#0879ea]">
              Directorio comercial
            </p>
            <h2 className="text-[16px] font-bold text-slate-900">Clientes</h2>
          </div>
          <button
            onClick={() => {
              clearForm();
              setFormOpen(true);
            }}
            disabled={!canManage}
            className="mac-button-primary focus-ring ml-auto flex items-center gap-1.5 rounded-lg px-3 py-2 text-[10px] font-bold text-white disabled:opacity-40"
          >
            <Plus className="size-3.5" />
            Nuevo cliente
          </button>
          <button
            onClick={onClose}
            className="focus-ring ml-2 rounded-lg p-2 text-slate-400 hover:bg-slate-100"
            aria-label="Cerrar clientes"
          >
            <X className="size-5" />
          </button>
        </header>

        <div
          className={clsx(
            "grid min-h-0 flex-1",
            formOpen && "lg:grid-cols-[340px_1fr]",
          )}
        >
          {formOpen && (
          <form
            onSubmit={(event) => void submit(event)}
            className="border-b border-black/[0.06] bg-white/70 p-5 lg:border-b-0 lg:border-r"
          >
            <h3 className="text-[12px] font-bold text-slate-800">
              {editingId ? "Editar cliente" : "Nuevo cliente"}
            </h3>
            <p className="mt-1 text-[9px] leading-4 text-slate-500">
              Después podrás seleccionarlo al crear o editar un proyecto.
            </p>
            <label className="mt-5 block">
              <span className="mb-2 block text-[10px] font-bold text-slate-600">
                Nombre
              </span>
              <input
                required
                disabled={!canManage}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ej. Aura Cosmética"
                className="mac-input focus-ring w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-[11px]"
              />
            </label>
            <label className="mt-4 block">
              <span className="mb-2 block text-[10px] font-bold text-slate-600">
                Categorías / servicios
              </span>
              <input
                disabled={!canManage}
                value={categories}
                onChange={(event) => setCategories(event.target.value)}
                placeholder="Institucional, Cartelería, Autoliquidables"
                className="mac-input focus-ring w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-[11px]"
              />
              <span className="mt-1.5 block text-[8px] text-slate-400">
                Separalas con comas. Quedarán disponibles en proyectos y tareas.
              </span>
            </label>
            <label className="mt-4 block">
              <span className="mb-2 block text-[10px] font-bold text-slate-600">
                Correo de contacto
              </span>
              <input
                type="email"
                disabled={!canManage}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="marketing@cliente.com"
                className="mac-input focus-ring w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-[11px]"
              />
            </label>
            <label className="mt-4 block">
              <span className="mb-2 block text-[10px] font-bold text-slate-600">
                Notas
              </span>
              <textarea
                disabled={!canManage}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Contacto, facturación o contexto de la cuenta…"
                className="mac-input focus-ring min-h-24 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-3 text-[11px]"
              />
            </label>
            <div className="mt-5 flex gap-2">
              {editingId && (
                <button
                  type="button"
                  onClick={clearForm}
                  className="focus-ring rounded-lg border border-slate-200 px-3 py-2.5 text-[10px] font-semibold text-slate-600"
                >
                  Cancelar
                </button>
              )}
              <button
                disabled={saving || !canManage || name.trim().length < 2}
                className="mac-button-primary focus-ring flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-[10px] font-bold text-white disabled:opacity-45"
              >
                {saving ? (
                  <LoaderCircle className="size-3.5 animate-spin" />
                ) : (
                  <Plus className="size-3.5" />
                )}
                {editingId ? "Guardar cambios" : "Crear cliente"}
              </button>
            </div>
            {!canManage && (
              <p className="mt-4 rounded-lg bg-amber-50 p-3 text-[9px] leading-4 text-amber-700">
                Sólo propietarios y administradores pueden modificar clientes.
              </p>
            )}
          </form>
          )}

          <div className="soft-scrollbar min-h-0 overflow-y-auto p-4 sm:p-6">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <h3 className="text-[13px] font-bold text-slate-800">
                  Directorio del espacio
                </h3>
                <p className="mt-1 text-[9px] text-slate-400">
                  {visibleClients.length} de {clients.length}{" "}
                  {clients.length === 1 ? "cliente" : "clientes"}
                </p>
              </div>
              <label className="relative ml-auto min-w-[220px] flex-1 sm:max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={clientQuery}
                  onChange={(event) => setClientQuery(event.target.value)}
                  placeholder="Buscar cliente, contacto o servicio…"
                  className="focus-ring h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-[11px]"
                />
              </label>
              <select
                value={clientStatus}
                onChange={(event) =>
                  setClientStatus(
                    event.target.value as "active" | "archived" | "all",
                  )
                }
                className="focus-ring h-10 rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-semibold text-slate-600"
                aria-label="Filtrar clientes por estado"
              >
                <option value="active">Activos</option>
                <option value="archived">Archivados</option>
                <option value="all">Todos</option>
              </select>
            </div>
            <div className="mt-4 grid gap-3 xl:grid-cols-2">
              {visibleClients.map((client) => {
                const clientProjects = projects.filter(
                  (project) => project.clientId === client.id,
                );
                const clientTasks = tasks.filter(
                  (task) => task.clientId === client.id,
                );
                return (
                <article
                  key={client.id}
                  className={clsx(
                    "rounded-2xl border bg-white p-4 shadow-sm",
                    client.archived
                      ? "border-slate-200 opacity-65"
                      : "border-black/[0.07]",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#0a84ff]/10 text-[#0879ea]">
                      <Building2 className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="truncate text-[12px] font-bold text-slate-800">
                          {client.name}
                        </h4>
                        {client.archived && (
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-[8px] font-bold text-slate-500">
                            Archivado
                          </span>
                        )}
                      </div>
                      {client.email ? (
                        <a
                          href={`mailto:${client.email}`}
                          className="mt-1 block truncate text-[9px] font-medium text-[#0879ea] hover:underline"
                        >
                          {client.email}
                        </a>
                      ) : (
                        <p className="mt-1 truncate text-[9px] text-slate-400">
                          Sin correo
                        </p>
                      )}
                    </div>
                  </div>
                  <p className="mt-3 min-h-8 text-[9px] leading-4 text-slate-500">
                    {client.notes || "Sin notas adicionales."}
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-slate-50 px-3 py-2">
                      <p className="text-[12px] font-bold text-slate-800">
                        {clientProjects.length}
                      </p>
                      <p className="text-[8px] uppercase tracking-wide text-slate-400">
                        Proyectos
                      </p>
                    </div>
                    <div className="rounded-lg bg-slate-50 px-3 py-2">
                      <p className="text-[12px] font-bold text-slate-800">
                        {clientTasks.length}
                      </p>
                      <p className="text-[8px] uppercase tracking-wide text-slate-400">
                        Tareas
                      </p>
                    </div>
                  </div>
                  {client.categories.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {client.categories.map((category) => (
                        <span
                          key={category}
                          className="rounded-lg bg-[#0a84ff]/8 px-2 py-1 text-[8px] font-semibold text-[#0879ea]"
                        >
                          {category}
                        </span>
                      ))}
                    </div>
                  )}
                  {canManage && (
                    <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                      <button
                        onClick={() => {
                          setEditingId(client.id);
                          setName(client.name);
                          setEmail(client.email);
                          setNotes(client.notes);
                          setCategories(client.categories.join(", "));
                          setFormOpen(true);
                        }}
                        className="focus-ring rounded-lg border border-slate-200 px-3 py-2 text-[9px] font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => {
                          void onUpdate(client.id, {
                            archived: !client.archived,
                          }).catch(() => undefined);
                        }}
                        className="focus-ring rounded-lg border border-slate-200 px-3 py-2 text-[9px] font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        {client.archived ? "Restaurar" : "Archivar"}
                      </button>
                      <button
                        onClick={() => setDeletingClient(client)}
                        className="focus-ring ml-auto rounded-lg px-3 py-2 text-[9px] font-semibold text-rose-600 hover:bg-rose-50"
                      >
                        Eliminar
                      </button>
                    </div>
                  )}
                </article>
                );
              })}
              {!visibleClients.length && (
                <div className="col-span-full rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
                  <ContactRound className="mx-auto size-7 text-slate-300" />
                  <p className="mt-3 text-[11px] font-semibold text-slate-500">
                    Todavía no hay clientes cargados.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {deletingClient && (
        <ConfirmDialog
          title={`¿Eliminar ${deletingClient.name}?`}
          description="Los proyectos se conservarán, pero quedarán sin cliente asignado."
          confirmLabel="Eliminar cliente"
          onCancel={() => setDeletingClient(null)}
          onConfirm={() => {
            void onDelete(deletingClient.id).catch(() => undefined);
            setDeletingClient(null);
            if (editingId === deletingClient.id) clearForm();
          }}
        />
      )}
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
  clients,
  onClose,
  onSave,
  onArchive,
  onDelete,
}: {
  project: Project;
  clients: Client[];
  onClose: () => void;
  onSave: (input: UpdateProjectInput) => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [color, setColor] = useState(project.color);
  const [clientId, setClientId] = useState(project.clientId ?? "");
  const [clientCategory, setClientCategory] = useState(
    project.clientCategory ?? "",
  );
  const selectedClient =
    clients.find((client) => client.id === clientId) ?? null;
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
          onSave({
            name: name.trim(),
            description: description.trim(),
            color,
            clientId: clientId || null,
            clientCategory: clientCategory || null,
          });
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
              Cliente
            </span>
            <select
              value={clientId}
              onChange={(event) => {
                setClientId(event.target.value);
                setClientCategory("");
              }}
              className="mac-input focus-ring w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[12px]"
            >
              <option value="">Sin cliente</option>
              {clients
                .filter((client) => !client.archived)
                .map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-[11px] font-semibold text-slate-600">
              Categoría / servicio
            </span>
            <select
              value={clientCategory}
              disabled={!selectedClient}
              onChange={(event) => setClientCategory(event.target.value)}
              className="mac-input focus-ring w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[12px] disabled:bg-slate-50"
            >
              <option value="">Sin categoría</option>
              {(selectedClient?.categories ?? []).map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
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
              ? "Se eliminarán las tareas exclusivas de este proyecto. Las tareas vinculadas también a otros proyectos se conservarán allí."
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
  const [notificationFilter, setNotificationFilter] = useState<
    "unread" | "all"
  >("unread");
  const unreadCount = notifications.filter((item) => !item.readAt).length;
  const visibleNotifications =
    notificationFilter === "unread"
      ? notifications.filter((item) => !item.readAt)
      : notifications;

  return (
    <div className="mac-popover absolute right-0 top-[calc(100%+8px)] z-50 w-[340px] max-w-[calc(100vw-24px)] overflow-hidden rounded-2xl border border-black/10 bg-white/95 shadow-[0_22px_65px_rgba(15,23,42,.22)] backdrop-blur-2xl">
      <header className="flex items-center border-b border-black/5 px-4 py-3">
        <div>
          <p className="text-[12px] font-bold text-slate-800">Notificaciones</p>
          <p className="text-[9px] text-slate-400">
            {unreadCount} sin leer
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
      <div className="flex gap-1 border-b border-black/5 px-3 py-2">
        {(
          [
            ["unread", "No leídas"],
            ["all", "Todas"],
          ] as const
        ).map(([filter, label]) => (
          <button
            key={filter}
            onClick={() => setNotificationFilter(filter)}
            aria-pressed={notificationFilter === filter}
            className={clsx(
              "focus-ring rounded-lg px-3 py-1.5 text-[9px] font-semibold",
              notificationFilter === filter
                ? "bg-slate-100 text-slate-700"
                : "text-slate-400 hover:text-slate-600",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="soft-scrollbar max-h-[390px] overflow-y-auto p-2">
        {visibleNotifications.map((notification) => (
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
        {visibleNotifications.length === 0 && (
          <div className="grid min-h-36 place-items-center text-center">
            <div>
              <Bell className="mx-auto size-6 text-slate-300" />
              <p className="mt-2 text-[10px] text-slate-400">
                {notificationFilter === "unread"
                  ? "No tenés notificaciones pendientes."
                  : "No hay novedades todavía."}
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
  const effectiveSeconds = nonOverlappingTimeSeconds(filtered, now);
  const overlapSeconds = overlappingTimeSeconds(filtered, now);
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
  const missingRateCount = filtered.filter(
    (entry) => entry.billable && entry.hourlyRate <= 0,
  ).length;

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

  function escapeReportValue(value: unknown) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function reportRows() {
    return filtered
      .map(
        (entry) => `<tr>
          <td>${escapeReportValue(entry.user.name)}</td>
          <td>${escapeReportValue(entry.taskCode)}</td>
          <td>${escapeReportValue(entry.taskTitle)}</td>
          <td>${escapeReportValue(entry.projectName)}</td>
          <td>${escapeReportValue(entry.description || "Sin descripción")}</td>
          <td>${escapeReportValue(formatDuration(elapsedSeconds(entry, now)))}</td>
          <td>${entry.billable ? "Facturable" : "Interno"}</td>
          <td>${escapeReportValue(`${currency} ${timeEntryCost(entry, now).toFixed(2)}`)}</td>
        </tr>`,
      )
      .join("");
  }

  function reportDocument(printMode = false) {
    return `<!doctype html>
      <html lang="es">
        <head>
          <meta charset="utf-8" />
          <title>Reporte de tiempo Taska</title>
          <style>
            body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#172033;margin:32px}
            h1{font-size:24px;margin:0 0 6px}.meta{color:#667085;font-size:12px;margin-bottom:24px}
            .metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:24px}
            .metric{border:1px solid #e4e7ec;border-radius:10px;padding:12px}.metric strong{display:block;font-size:17px}.metric span{font-size:11px;color:#667085}
            table{width:100%;border-collapse:collapse;font-size:11px}th{text-align:left;background:#f2f4f7;color:#475467}
            th,td{border:1px solid #e4e7ec;padding:8px;vertical-align:top}tr:nth-child(even){background:#fafafa}
            .warning{background:#fffaeb;border:1px solid #fedf89;border-radius:8px;padding:10px;margin:0 0 16px;font-size:11px}
            @page{size:landscape;margin:12mm}@media print{body{margin:0}.no-print{display:none}}
          </style>
        </head>
        <body>
          <h1>Auditoría de tiempo y costos</h1>
          <p class="meta">${escapeReportValue(from || "Inicio")} — ${escapeReportValue(to || "Hoy")} · generado ${escapeReportValue(new Intl.DateTimeFormat("es-UY", { dateStyle: "medium", timeStyle: "short" }).format(now))}</p>
          ${
            overlapSeconds > 0
              ? `<p class="warning">Hay ${escapeReportValue(formatDuration(overlapSeconds))} de timers superpuestos. El tiempo real elimina el doble conteo por persona.</p>`
              : ""
          }
          <div class="metrics">
            <div class="metric"><strong>${escapeReportValue(formatDuration(effectiveSeconds))}</strong><span>Tiempo real</span></div>
            <div class="metric"><strong>${escapeReportValue(formatDuration(totalSeconds))}</strong><span>Tiempo bruto</span></div>
            <div class="metric"><strong>${escapeReportValue(formatDuration(billableSeconds))}</strong><span>Facturable</span></div>
            <div class="metric"><strong>${escapeReportValue(`${currency} ${totalCost.toFixed(2)}`)}</strong><span>Costo bruto</span></div>
          </div>
          <table>
            <thead><tr><th>Persona</th><th>Código</th><th>Tarea</th><th>Proyecto</th><th>Descripción</th><th>Duración</th><th>Tipo</th><th>Costo</th></tr></thead>
            <tbody>${reportRows()}</tbody>
          </table>
          ${printMode ? "<script>window.addEventListener('load',()=>window.print())</script>" : ""}
        </body>
      </html>`;
  }

  function exportExcel() {
    const blob = new Blob([`\uFEFF${reportDocument()}`], {
      type: "application/vnd.ms-excel;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `taska-tiempo-${from || "inicio"}-${to || "hoy"}.xls`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function printReport() {
    const reportWindow = window.open(
      "",
      "_blank",
      "popup=yes,width=1200,height=800",
    );
    if (!reportWindow) return;
    reportWindow.opener = null;
    reportWindow.document.write(reportDocument(true));
    reportWindow.document.close();
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
          <div className="ml-auto hidden items-center gap-1 sm:flex">
            <button
              onClick={exportCsv}
              disabled={filtered.length === 0}
              className="focus-ring flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold text-slate-600 disabled:opacity-40"
            >
              <FileDown className="size-3.5" />
              CSV
            </button>
            <button
              onClick={exportExcel}
              disabled={filtered.length === 0}
              className="focus-ring flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold text-slate-600 disabled:opacity-40"
            >
              <FileSpreadsheet className="size-3.5" />
              Excel
            </button>
            <button
              onClick={printReport}
              disabled={filtered.length === 0}
              className="mac-button-primary focus-ring flex items-center gap-2 rounded-lg px-3 py-2 text-[10px] font-bold text-white disabled:opacity-40"
            >
              <Printer className="size-3.5" />
              PDF / imprimir
            </button>
          </div>
          <button
            onClick={onClose}
            className="focus-ring ml-2 rounded-lg p-2 text-slate-400 hover:bg-slate-100"
            aria-label="Cerrar"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="soft-scrollbar flex-1 overflow-y-auto p-5 sm:p-7">
          <div className="mb-4 grid grid-cols-3 gap-2 sm:hidden">
            <button
              onClick={exportCsv}
              disabled={filtered.length === 0}
              className="focus-ring flex items-center justify-center gap-1 rounded-lg border border-slate-200 px-2 py-2 text-[9px] font-bold text-slate-600 disabled:opacity-40"
            >
              <FileDown className="size-3.5" /> CSV
            </button>
            <button
              onClick={exportExcel}
              disabled={filtered.length === 0}
              className="focus-ring flex items-center justify-center gap-1 rounded-lg border border-slate-200 px-2 py-2 text-[9px] font-bold text-slate-600 disabled:opacity-40"
            >
              <FileSpreadsheet className="size-3.5" /> Excel
            </button>
            <button
              onClick={printReport}
              disabled={filtered.length === 0}
              className="mac-button-primary focus-ring flex items-center justify-center gap-1 rounded-lg px-2 py-2 text-[9px] font-bold text-white disabled:opacity-40"
            >
              <Printer className="size-3.5" /> PDF
            </button>
          </div>
          {(overlapSeconds > 0 || missingRateCount > 0) && (
            <div className="mb-5 grid gap-2">
              {overlapSeconds > 0 && (
                <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[11px] font-semibold leading-5 text-amber-700">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  Se detectaron {formatDuration(overlapSeconds)} de timers
                  superpuestos. “Tiempo real” elimina el doble conteo por
                  persona; “tiempo bruto” conserva todos los registros para la
                  auditoría.
                </p>
              )}
              {missingRateCount > 0 && (
                <p className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[11px] font-semibold leading-5 text-rose-700">
                  <CircleDollarSign className="mt-0.5 size-4 shrink-0" />
                  Hay {missingRateCount} registros facturables sin tarifa
                  configurada. El costo mostrado está incompleto.
                </p>
              )}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              {
                label: "Tiempo real",
                value: formatDuration(effectiveSeconds),
                detail: "Sin doble conteo por persona",
                icon: TimerReset,
                color: "text-[#0a84ff] bg-[#0a84ff]/10",
              },
              {
                label: "Tiempo bruto",
                value: formatDuration(totalSeconds),
                detail: `${filtered.length} registros`,
                icon: Clock3,
                color: "text-sky-600 bg-sky-50",
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
                label: "Costo bruto",
                value: `${currency} ${totalCost.toFixed(2)}`,
                detail:
                  missingRateCount > 0
                    ? `${missingRateCount} sin tarifa`
                    : "Tarifa histórica por registro",
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
            <div className="hidden grid-cols-[120px_1fr_1fr_100px_100px_90px] border-b border-slate-100 bg-slate-50 px-4 py-3 text-[8px] font-bold uppercase tracking-wide text-slate-400 md:grid">
              <span>Persona</span>
              <span>Tarea</span>
              <span>Descripción</span>
              <span>Duración</span>
              <span>Costo</span>
              <span>Tipo / estado</span>
            </div>
            {filtered.map((entry) => (
              <article
                key={entry.id}
                className="grid gap-2 border-b border-slate-100 p-4 last:border-0 md:grid-cols-[120px_1fr_1fr_100px_100px_90px] md:items-center md:gap-0"
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
                    "inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-1 text-[9px] font-semibold",
                    !entry.endedAt
                      ? "bg-rose-50 text-rose-600"
                      : entry.billable
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-slate-100 text-slate-500",
                  )}
                >
                  <span
                    className={clsx(
                      "size-1.5 rounded-full",
                      !entry.endedAt
                        ? "animate-pulse bg-rose-500"
                        : entry.billable
                          ? "bg-emerald-400"
                          : "bg-slate-400",
                    )}
                  />
                  {!entry.endedAt
                    ? "En curso"
                    : entry.billable
                      ? "Facturable"
                      : "Interno"}
                </span>
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
  onProfileUpdate: (name: string, title: string) => Promise<void>;
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
  const [profileTitle, setProfileTitle] = useState(
    currentPerson?.role ?? "Equipo creativo",
  );
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
                  <div className="mt-3 flex items-start gap-3">
                    <Avatar person={currentPerson} size="lg" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <label className="block">
                        <span className="mb-1 block text-[9px] font-semibold text-slate-500">
                          Nombre visible
                        </span>
                        <input
                          value={name}
                          onChange={(event) => setName(event.target.value)}
                          className="mac-input focus-ring w-full rounded-lg border border-slate-200 px-3 py-2.5 text-[12px]"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-[9px] font-semibold text-slate-500">
                          Cargo o descripción
                        </span>
                        <input
                          value={profileTitle}
                          onChange={(event) =>
                            setProfileTitle(event.target.value)
                          }
                          className="mac-input focus-ring w-full rounded-lg border border-slate-200 px-3 py-2.5 text-[11px]"
                        />
                      </label>
                    </div>
                    <button
                      onClick={() => {
                        void onProfileUpdate(
                          name.trim(),
                          profileTitle.trim(),
                        )
                          .then(() => notify("Perfil actualizado"))
                          .catch(() =>
                            notify("No se pudo actualizar el perfil"),
                          );
                      }}
                      disabled={!name.trim() || !profileTitle.trim()}
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
                    <div className="flex items-center gap-3 p-4">
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
                        <Moon className="size-4" />
                      </span>
                      <span className="flex-1">
                        <span className="block text-[11px] font-semibold text-slate-700">
                          Modo oscuro
                        </span>
                        <span className="mt-0.5 block text-[9px] text-slate-400">
                          Reduce el brillo y mantiene el contraste de todo el
                          espacio.
                        </span>
                      </span>
                      <div
                        className="flex rounded-lg border border-slate-200 bg-slate-50 p-1"
                        aria-label="Tema de la interfaz"
                      >
                        {(
                          [
                            ["light", "Claro"],
                            ["dark", "Oscuro"],
                            ["system", "Sistema"],
                          ] as const
                        ).map(([theme, label]) => (
                          <button
                            key={theme}
                            type="button"
                            onClick={() => onSettingsUpdate({ theme })}
                            className={clsx(
                              "focus-ring rounded-md px-2.5 py-1.5 text-[9px] font-semibold transition",
                              settings.theme === theme
                                ? "bg-white text-slate-800 shadow-sm"
                                : "text-slate-400 hover:text-slate-700",
                            )}
                            aria-pressed={settings.theme === theme}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-4">
                      <span className="flex-1">
                        <span className="block text-[11px] font-semibold text-slate-700">
                          Vista compacta
                        </span>
                        <span className="mt-0.5 block text-[9px] text-slate-400">
                          Reduce el alto de cada fila en la lista.
                        </span>
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={settings.compactMode}
                        aria-label="Vista compacta"
                        onClick={() =>
                          onSettingsUpdate({
                            compactMode: !settings.compactMode,
                          })
                        }
                        className={clsx(
                          "focus-ring relative h-6 w-11 shrink-0 rounded-full p-0.5 transition",
                          settings.compactMode
                            ? "bg-[#0a84ff]"
                            : "bg-slate-300",
                        )}
                      >
                        <span
                          className={clsx(
                            "block size-5 rounded-full bg-white shadow-sm transition-transform",
                            settings.compactMode && "translate-x-5",
                          )}
                        />
                      </button>
                    </div>
                    <div className="flex items-center gap-3 p-4">
                      <span className="flex-1">
                        <span className="block text-[11px] font-semibold text-slate-700">
                          Mostrar completadas
                        </span>
                        <span className="mt-0.5 block text-[9px] text-slate-400">
                          Incluye las tareas completadas en lista y tablero.
                        </span>
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={settings.showCompleted}
                        aria-label="Mostrar completadas"
                        onClick={() =>
                          onSettingsUpdate({
                            showCompleted: !settings.showCompleted,
                          })
                        }
                        className={clsx(
                          "focus-ring relative h-6 w-11 shrink-0 rounded-full p-0.5 transition",
                          settings.showCompleted
                            ? "bg-[#0a84ff]"
                            : "bg-slate-300",
                        )}
                      >
                        <span
                          className={clsx(
                            "block size-5 rounded-full bg-white shadow-sm transition-transform",
                            settings.showCompleted && "translate-x-5",
                          )}
                        />
                      </button>
                    </div>
                  </div>
                </section>
                <section>
                  <h3 className="text-[12px] font-bold text-slate-800">
                    Registro de tiempo
                  </h3>
                  <div className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                    <div className="flex items-center gap-3 p-4">
                      <span className="flex-1">
                        <span className="block text-[11px] font-semibold text-slate-700">
                          Advertir timers superpuestos
                        </span>
                        <span className="mt-0.5 block text-[9px] text-slate-400">
                          Conserva timers paralelos, pero diferencia tiempo
                          bruto de tiempo real.
                        </span>
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={settings.warnTimerOverlaps}
                        aria-label="Advertir timers superpuestos"
                        onClick={() =>
                          onSettingsUpdate({
                            warnTimerOverlaps: !settings.warnTimerOverlaps,
                          })
                        }
                        className={clsx(
                          "focus-ring relative h-6 w-11 shrink-0 rounded-full p-0.5 transition",
                          settings.warnTimerOverlaps
                            ? "bg-[#0a84ff]"
                            : "bg-slate-300",
                        )}
                      >
                        <span
                          className={clsx(
                            "block size-5 rounded-full bg-white shadow-sm transition-transform",
                            settings.warnTimerOverlaps && "translate-x-5",
                          )}
                        />
                      </button>
                    </div>
                    <label className="flex items-center gap-3 p-4">
                      <span className="flex-1">
                        <span className="block text-[11px] font-semibold text-slate-700">
                          Avisar timer olvidado
                        </span>
                        <span className="mt-0.5 block text-[9px] text-slate-400">
                          Muestra una alerta después de este tiempo continuo.
                        </span>
                      </span>
                      <select
                        value={settings.staleTimerHours}
                        onChange={(event) =>
                          onSettingsUpdate({
                            staleTimerHours: Number(event.target.value),
                          })
                        }
                        className="focus-ring rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-semibold text-slate-600"
                      >
                        {[4, 6, 8, 12].map((hours) => (
                          <option key={hours} value={hours}>
                            {hours} horas
                          </option>
                        ))}
                      </select>
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
                <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50/70">
                  <table className="w-full min-w-[520px] text-left text-[9px]">
                    <thead className="border-b border-slate-200 text-slate-400">
                      <tr>
                        <th className="px-3 py-2.5 font-bold">Rol</th>
                        <th className="px-3 py-2.5 font-bold">Tareas</th>
                        <th className="px-3 py-2.5 font-bold">Integrantes</th>
                        <th className="px-3 py-2.5 font-bold">Reportes</th>
                        <th className="px-3 py-2.5 font-bold">Espacio</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-slate-600">
                      {[
                        ["Dueño", "Editar", "Administrar", "Auditar", "Eliminar"],
                        ["Admin", "Editar", "Administrar", "Auditar", "Configurar"],
                        ["Integrante", "Editar", "Ver", "Propios", "—"],
                        ["Solo lectura", "Ver", "Ver", "—", "—"],
                      ].map((row) => (
                        <tr key={row[0]}>
                          {row.map((cell, index) => (
                            <td
                              key={`${row[0]}-${index}`}
                              className={clsx(
                                "px-3 py-2.5",
                                index === 0 && "font-bold text-slate-700",
                              )}
                            >
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {canManage &&
                  members.some((member) => member.hourlyRate <= 0) && (
                    <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[9px] font-semibold leading-4 text-amber-700">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                      {members.filter((member) => member.hourlyRate <= 0).length}{" "}
                      integrantes no tienen tarifa horaria. Sus costos no se
                      incluirán correctamente en los reportes.
                    </p>
                  )}
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
                                Rol: {teamRoleLabels[invitation.role]} · vence{" "}
                                {new Intl.DateTimeFormat("es-UY", {
                                  day: "2-digit",
                                  month: "short",
                                }).format(new Date(invitation.expiresAt))}
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
    clients,
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
    initializing,
    setActiveWorkspaceId,
    updateTask,
    updateStatus,
    archiveTask,
    deleteTask,
    restoreTask,
    addComment,
    deleteComment,
    createTask,
    createProject,
    updateProject,
    deleteProject,
    createClient: createCatalogClient,
    updateClient,
    deleteClient,
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
    restoreAttachment,
    updateAttachmentStatus,
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
  const [view, setView] = useState<View>("home");
  const [taskScope, setTaskScope] = useState<TaskScope>("mine");
  const [projectTab, setProjectTab] = useState<ProjectTab>("list");
  const [query, setQuery] = useState("");
  const [priority, setPriority] = useState<TaskPriority | "todas">("todas");
  const [projectId, setProjectId] = useState("todos");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskUrlReady, setTaskUrlReady] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTaskStatus, setNewTaskStatus] = useState<TaskStatus>("nuevo");
  const [showNewProject, setShowNewProject] = useState(false);
  const [showNewWorkspace, setShowNewWorkspace] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [clientsOpen, setClientsOpen] = useState(false);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [timersOpen, setTimersOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [timeReportsOpen, setTimeReportsOpen] = useState(false);
  const [projectSettingsId, setProjectSettingsId] = useState<string | null>(
    null,
  );
  const [taskToDeleteId, setTaskToDeleteId] = useState<string | null>(null);
  const [taskToArchiveId, setTaskToArchiveId] = useState<string | null>(null);
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilters>({
    status: "todos",
    assigneeId: "todos",
    due: "todas",
  });
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "supabase") return;

    const controller = new AbortController();
    void fetch("/api/admin/access", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return { isAdmin: false };
        return (await response.json()) as { isAdmin?: boolean };
      })
      .then((result) => setIsPlatformAdmin(Boolean(result.isAdmin)))
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") {
          return;
        }
        setIsPlatformAdmin(false);
      });

    return () => controller.abort();
  }, [mode]);

  useEffect(() => {
    const initialSync = window.setTimeout(() => {
      setSelectedTaskId(
        new URLSearchParams(window.location.search).get("task"),
      );
      setTaskUrlReady(true);
    }, 0);
    const onPopState = () =>
      setSelectedTaskId(new URLSearchParams(window.location.search).get("task"));
    window.addEventListener("popstate", onPopState);
    return () => {
      window.clearTimeout(initialSync);
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  useEffect(() => {
    if (!taskUrlReady) return;
    const url = new URL(window.location.href);
    if (selectedTaskId) url.searchParams.set("task", selectedTaskId);
    else url.searchParams.delete("task");
    window.history.replaceState({}, "", url);
  }, [selectedTaskId, taskUrlReady]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [activeWorkspaceId, projectId, projectTab, view]);

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
  const activeTimeEntries = useMemo(
    () =>
      timeEntries.filter(
        (entry) => entry.user.id === currentUserId && !entry.endedAt,
      ),
    [currentUserId, timeEntries],
  );
  const topLevelTasks = useMemo(
    () => tasks.filter((task) => !task.parentTaskId),
    [tasks],
  );
  const activeTasks = useMemo(
    () =>
      tasks.filter((task) => !task.archivedAt && !task.deletedAt),
    [tasks],
  );
  const activeTopLevelTasks = useMemo(
    () => activeTasks.filter((task) => !task.parentTaskId),
    [activeTasks],
  );
  const archivedTopLevelTasks = useMemo(
    () =>
      topLevelTasks.filter((task) => task.archivedAt || task.deletedAt),
    [topLevelTasks],
  );
  const selectedTask =
    tasks.find((task) => task.id === selectedTaskId) ?? null;
  const focusedProject =
    projectId === "todos"
      ? null
      : (projects.find((project) => project.id === projectId) ?? null);
  const focusedProjectTasks = useMemo(
    () =>
      focusedProject
        ? activeTopLevelTasks.filter((task) =>
            task.projects.some((project) => project.id === focusedProject.id),
          )
        : [],
    [activeTopLevelTasks, focusedProject],
  );
  const focusedProjectAllTasks = useMemo(
    () =>
      focusedProject
        ? activeTasks.filter((task) =>
            task.projects.some((project) => project.id === focusedProject.id),
          )
        : [],
    [activeTasks, focusedProject],
  );
  const selectedActiveTimeEntry = selectedTask
    ? (activeTimeEntries.find((entry) => entry.taskId === selectedTask.id) ??
      null)
    : null;
  const selectedParentTask = selectedTask?.parentTaskId
    ? (tasks.find((task) => task.id === selectedTask.parentTaskId) ?? null)
    : null;
  const selectedSubtasks = selectedTask
    ? tasks.filter((task) => task.parentTaskId === selectedTask.id)
    : [];
  const selectedTimeEntries = selectedTask
    ? timeEntries.filter((entry) => entry.taskId === selectedTask.id)
    : [];
  const demoAssigneeId = mode === "demo" ? "martina" : undefined;
  const myTaskCount = activeTasks.filter((task) =>
    isTaskAssignedToCurrentUser(task, currentUserId, demoAssigneeId),
  ).length;

  const filteredTasks = useMemo(
    () => {
      const sourceTasks =
        view === "gantt" || taskScope === "mine"
          ? activeTasks
          : activeTopLevelTasks;
      return sourceTasks.filter((task) => {
        const isMine =
          taskScope !== "mine" ||
          isTaskAssignedToCurrentUser(
            task,
            currentUserId,
            demoAssigneeId,
          );
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
      });
    },
    [
      advancedFilters,
      currentUserId,
      demoAssigneeId,
      priority,
      projectId,
      query,
      settings.showCompleted,
      activeTasks,
      activeTopLevelTasks,
      taskScope,
      view,
    ],
  );

  const openCount = activeTopLevelTasks.filter(
    (task) => task.status !== "resuelto",
  ).length;
  const highPriorityCount = activeTopLevelTasks.filter(
    (task) =>
      (task.priority === "urgente" || task.priority === "alta") &&
      task.status !== "resuelto",
  ).length;
  const resolvedCount = activeTopLevelTasks.filter(
    (task) => task.status === "resuelto",
  ).length;
  const waitingCount = activeTopLevelTasks.filter(
    (task) => task.status === "esperando",
  ).length;
  const today = new Date();
  const weekLimit = new Date(today);
  weekLimit.setDate(today.getDate() + 7);
  const dueThisWeek = activeTopLevelTasks.filter((task) => {
    if (!task.dueDate || task.status === "resuelto") return false;
    const due = new Date(`${task.dueDate}T23:59:59`);
    return due >= today && due <= weekLimit;
  }).length;
  const datedTasks = activeTopLevelTasks.filter((task) => task.dueDate).length;
  const datedPercent = activeTopLevelTasks.length
    ? Math.round((datedTasks / activeTopLevelTasks.length) * 100)
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

  async function handleCreate(input: NewTaskInput, files: File[] = []) {
    try {
      const task = await createTask(input);
      const template = findProcessTemplate(input.templateId);
      if (template) {
        await updateTask(task.id, { brief: template.brief });
        for (const step of template.steps) {
          await createTask({
            ...input,
            title: step,
            description: "",
            parentTaskId: task.id,
            status: "nuevo",
            tags: [],
            recurrenceRule: "none",
            recurrenceInterval: 1,
            templateId: undefined,
          });
        }
      }
      let failedUploads = 0;
      const uploadedAttachmentIds: string[] = [];
      for (const file of files) {
        try {
          const attachment = await uploadAttachment(task, file);
          uploadedAttachmentIds.push(attachment.id);
        } catch {
          failedUploads += 1;
        }
      }
      if (uploadedAttachmentIds.length > 0) {
        await updateTask(task.id, {
          description: appendDescriptionAttachments(
            input.description,
            uploadedAttachmentIds,
          ),
        });
      }
      setShowNewTask(false);
      setSelectedTaskId(task.id);
      const creationMessage =
        input.parentTaskId
          ? "Subtarea creada correctamente"
          : template
            ? `Proceso creado con ${template.steps.length} pasos`
            : "Tarea creada correctamente";
      notify(
        failedUploads > 0
          ? `${creationMessage}; ${failedUploads} ${failedUploads === 1 ? "archivo no pudo cargarse" : "archivos no pudieron cargarse"}`
          : files.length > 0
            ? `${creationMessage} · ${files.length} ${files.length === 1 ? "archivo embebido" : "archivos embebidos"}`
            : creationMessage,
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
    await supabase.rpc("clear_presence");
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const viewTitle =
    view === "home"
      ? "Mis tareas"
      : view === "my_tasks" || view === "all_tasks"
      ? taskScope === "mine"
        ? "Mis tareas"
        : "Todas las tareas"
        : view === "board"
          ? taskScope === "mine"
            ? "Mi tablero"
            : "Tablero del espacio"
          : view === "gantt"
            ? taskScope === "mine"
              ? "Mi planificación"
              : "Gantt del espacio"
            : view === "inbox"
              ? "Bandeja de entrada"
              : view === "reporting"
                ? "Informes"
                : view === "portfolios"
                  ? "Portafolios"
                  : view === "goals"
                    ? "Objetivos"
                    : "Archivo de procesos";

  if (initializing) {
    return (
      <div className="mac-wallpaper grid min-h-screen place-items-center bg-[#f1f3f6]">
        <div className="mac-window flex items-center gap-3 rounded-2xl border border-white/80 bg-white/85 px-5 py-4 text-[12px] font-semibold text-slate-600 shadow-xl backdrop-blur-xl">
          <LoaderCircle className="size-5 animate-spin text-[#0a84ff]" />
          Cargando tu espacio de trabajo…
        </div>
      </div>
    );
  }

  return (
    <div
      className="asana-clone-shell mac-wallpaper flex min-h-screen bg-[#f1f3f6]"
      style={{ "--app-accent": settings.accentColor } as CSSProperties}
    >
      <a href="#main-content" className="skip-link">
        Saltar al contenido
      </a>
      <Sidebar
        view={view}
        onViewChange={(nextView) => {
          if (nextView === "home") setTaskScope("mine");
          if (nextView === "my_tasks") setTaskScope("mine");
          if (nextView === "all_tasks") setTaskScope("all");
          setView(nextView);
          setProjectId("todos");
          setSelectedTaskId(null);
        }}
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
          setProjectTab("list");
        }}
        onCreateWorkspace={() => setShowNewWorkspace(true)}
        onCreateProject={() => setShowNewProject(true)}
        onCreateTask={() => openNewTask()}
        onProjectSettings={setProjectSettingsId}
        onSettings={() => setSettingsOpen(true)}
        onAdmin={() => setAdminOpen(true)}
        onClients={() => setClientsOpen(true)}
        onSignOut={() => void signOut()}
        onTimeReports={() => setTimeReportsOpen(true)}
        canViewTimeReports={canAuditTime}
        isPlatformAdmin={isPlatformAdmin}
        onProjectSelect={(nextProjectId) => {
          setTaskScope("all");
          setProjectId(nextProjectId);
          setView("all_tasks");
          setProjectTab("list");
          setSelectedTaskId(null);
        }}
      />

      <main
        id="main-content"
        className={clsx(
          "min-w-0 flex-1 transition-[margin] duration-200",
          focusedProject && selectedTask && "lg:mr-[48vw]",
        )}
        tabIndex={-1}
      >
        <header className="sticky top-0 z-30 flex h-16 items-center border-b border-[#e6e8ee] bg-white/95 px-4 backdrop-blur sm:px-7 lg:h-[70px] lg:px-9">
          <button
            onClick={() => setMobileMenu(true)}
            className="focus-ring mr-2 rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
            aria-label="Abrir menú"
          >
            <Menu className="size-5" />
          </button>
          <div className="relative mx-auto hidden w-full max-w-[640px] sm:block">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar"
                className="focus-ring h-9 w-full rounded-full border border-slate-200 bg-[#f8f9fb] pl-10 pr-14 text-[12px] text-slate-700 placeholder:text-slate-400"
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
            <ActiveTimersMenu
              entries={activeTimeEntries}
              open={timersOpen}
              staleTimerHours={settings.staleTimerHours}
              warnOverlaps={settings.warnTimerOverlaps}
              onToggle={() => {
                setNotificationsOpen(false);
                setTimersOpen((current) => !current);
              }}
              onClose={() => setTimersOpen(false)}
              onOpen={(taskId) => {
                setSelectedTaskId(taskId);
                setTimersOpen(false);
              }}
              onStop={(entryId) => {
                void stopTimer(entryId)
                  .then(() => notify("Timer detenido"))
                  .catch(() => notify("No se pudo detener el timer"));
              }}
              onStopAll={() => {
                void Promise.all(
                  activeTimeEntries.map((entry) => stopTimer(entry.id)),
                )
                  .then(() => notify("Todos los timers fueron detenidos"))
                  .catch(() =>
                    notify("Algunos timers no pudieron detenerse"),
                  );
              }}
            />
            <div className="relative">
              <button
                onClick={() => {
                  setTimersOpen(false);
                  setNotificationsOpen((current) => !current);
                }}
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
          </div>
        </header>

        <div
          className={clsx(
            focusedProject
              ? "pb-24 lg:pb-0"
              : "mx-auto max-w-[1500px] px-4 pb-24 pt-6 sm:px-7 lg:px-9 lg:pb-10 lg:pt-8",
          )}
        >
          {focusedProject ? (
            <ProjectWorkspaceView
              project={focusedProject}
              tasks={focusedProjectTasks}
              allTasks={focusedProjectAllTasks}
              tab={projectTab}
              selectedTaskId={selectedTaskId}
              onTabChange={setProjectTab}
              onCreate={() => openNewTask()}
              onSelect={(task) => setSelectedTaskId(task.id)}
              onComplete={(task) => {
                const next =
                  task.status === "resuelto" ? "en_progreso" : "resuelto";
                void updateStatus(task.id, next);
                notify(
                  next === "resuelto"
                    ? "Tarea completada"
                    : "Tarea reabierta",
                );
              }}
              onMove={(taskId, status) => {
                void updateStatus(taskId, status);
                notify(`Tarea movida a ${statusMeta[status].label}`);
              }}
              onUpdateDates={(taskId, input) => {
                void updateTask(taskId, input);
                notify("Fechas reprogramadas");
              }}
            />
          ) : view === "inbox" ? (
            <InboxView
              notifications={notifications}
              onOpenTask={setSelectedTaskId}
              onRead={(notificationId) => void markNotificationRead(notificationId)}
              onReadAll={() => void markAllNotificationsRead()}
            />
          ) : view === "portfolios" ? (
            <PortfoliosView workspaceId={activeWorkspaceId} projects={projects} tasks={activeTopLevelTasks} people={people} />
          ) : view === "goals" ? (
            <GoalsView workspaceId={activeWorkspaceId} projects={projects} people={people} />
          ) : view === "reporting" ? (
            <ReportingView tasks={activeTopLevelTasks} projects={projects} people={people} />
          ) : (
            <>
              {view === "home" && (
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
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
              {[
                {
                  label: "Tareas activas",
                  value: openCount,
                  trend: `${openCount} tareas raíz sin completar`,
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
                  label: "Completadas",
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
              )}

              <section className={view === "archive" ? "mt-0" : "mt-8"}>
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-[17px] font-bold tracking-[-0.02em] text-slate-900">
                    {viewTitle}
                  </h2>
                  <p className="mt-1 text-[10px] text-slate-400">
                    {view === "archive"
                      ? `${archivedTopLevelTasks.length} expedientes conservados`
                      : `${filteredTasks.length} ${
                          filteredTasks.length === 1 ? "tarea" : "tareas"
                        } en esta vista`}
                  </p>
                </div>
                {view !== "archive" && (
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <div
                      className="flex items-center rounded-lg border border-slate-200 bg-white p-1"
                      aria-label="Alcance de tareas"
                    >
                      {(
                        [
                          ["mine", "Mías"],
                          ["all", "Todas"],
                        ] as const
                      ).map(([scope, label]) => (
                        <button
                          key={scope}
                          onClick={() => {
                            setTaskScope(scope);
                            if (
                              view === "my_tasks" ||
                              view === "all_tasks"
                            ) {
                              setView(
                                scope === "mine"
                                  ? "my_tasks"
                                  : "all_tasks",
                              );
                            }
                          }}
                          aria-pressed={taskScope === scope}
                          className={clsx(
                            "focus-ring rounded-md px-3 py-1.5 text-[10px] font-semibold transition",
                            taskScope === scope
                              ? "bg-slate-100 text-slate-800"
                              : "text-slate-400 hover:text-slate-600",
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <div
                      className="flex items-center rounded-lg border border-slate-200 bg-white p-1"
                      aria-label="Tipo de vista"
                    >
                      {[
                        {
                          id: "list" as const,
                          label: "Lista",
                          icon: ListTodo,
                        },
                        {
                          id: "board" as const,
                          label: "Tablero",
                          icon: Columns3,
                        },
                        {
                          id: "gantt" as const,
                          label: "Gantt",
                          icon: ChartGantt,
                        },
                      ].map((item) => {
                        const active =
                          item.id === "list"
                            ? view === "my_tasks" || view === "all_tasks"
                            : view === item.id;
                        const Icon = item.icon;
                        return (
                          <button
                            key={item.id}
                            onClick={() =>
                              setView(
                                item.id === "list"
                                  ? taskScope === "mine"
                                    ? "my_tasks"
                                    : "all_tasks"
                                  : item.id,
                              )
                            }
                            aria-pressed={active}
                            className={clsx(
                              "focus-ring flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[10px] font-semibold transition",
                              active
                                ? "bg-slate-100 text-slate-800"
                                : "text-slate-400 hover:text-slate-600",
                            )}
                          >
                            <Icon className="size-3.5" />
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
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
                {view !== "archive" && (
                  <>
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
                  </>
                )}
              </div>
            </div>

            <div className="mt-4 animate-enter">
              {view === "archive" ? (
                <ArchiveView
                  tasks={archivedTopLevelTasks}
                  query={query}
                  onOpen={setSelectedTaskId}
                  onRestore={(taskId) => {
                    void restoreTask(taskId);
                    notify("Expediente restaurado");
                  }}
                  onTrash={(taskId) => setTaskToDeleteId(taskId)}
                />
              ) : filteredTasks.length === 0 ? (
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
              ) : view === "gantt" ? (
                <GanttChart
                  tasks={filteredTasks}
                  onSelect={(task) => setSelectedTaskId(task.id)}
                  onUpdateDates={(taskId, input) => {
                    void updateTask(taskId, input);
                    notify("Fechas reprogramadas");
                  }}
                />
              ) : (
                <TaskList
                  tasks={filteredTasks}
                  allTasks={activeTasks}
                  compact={settings.compactMode}
                  onSelect={(task) => setSelectedTaskId(task.id)}
                  onComplete={(task) => {
                    const next =
                      task.status === "resuelto" ? "en_progreso" : "resuelto";
                    void updateStatus(task.id, next);
                    notify(
                      next === "resuelto"
                        ? "Tarea completada"
                        : "Tarea reabierta",
                    );
                  }}
                />
              )}
            </div>
              </section>
            </>
          )}
        </div>
      </main>

      <nav
        aria-label="Navegación móvil"
        className="fixed inset-x-0 bottom-0 z-30 flex h-[66px] items-center justify-around border-t border-slate-200 bg-white/95 px-3 backdrop-blur lg:hidden"
      >
        {[
          { id: "home" as const, label: "Inicio", icon: Home },
          { id: "all_tasks" as const, label: "Tareas", icon: ListTodo },
          { id: "inbox" as const, label: "Bandeja", icon: Inbox },
          { id: "portfolios" as const, label: "Portafolios", icon: Briefcase },
          { id: "goals" as const, label: "Objetivos", icon: Target },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => {
                if (item.id === "all_tasks") setTaskScope("all");
                if (item.id === "home") setTaskScope("mine");
                setView(item.id);
              }}
              className={clsx(
                "focus-ring flex min-w-0 flex-1 flex-col items-center gap-1 rounded-lg py-2 text-[9px] font-semibold",
                view === item.id ? "text-violet-600" : "text-slate-400",
              )}
            >
              <Icon className="size-[18px]" />
              {item.label}
            </button>
          );
        })}
      </nav>

      {selectedTask &&
      (selectedTask.archivedAt || selectedTask.deletedAt ? (
        <ArchivedTaskDrawer
          task={selectedTask}
          subtasks={selectedSubtasks}
          timeEntries={selectedTimeEntries}
          onClose={() => setSelectedTaskId(null)}
          onRestore={() => {
            void restoreTask(selectedTask.id);
            setSelectedTaskId(null);
            notify("Expediente restaurado");
          }}
          onTrash={() => setTaskToDeleteId(selectedTask.id)}
          onAttachmentOpen={(attachmentId) => {
            const attachment = selectedTask.attachments.find(
              (item) => item.id === attachmentId,
            );
            if (!attachment) return;
            void openAttachment(attachment).catch(() =>
              notify("No se pudo descargar el adjunto"),
            );
          }}
          notify={notify}
        />
      ) : (
        <TaskDrawer
          task={selectedTask}
          parentTask={selectedParentTask}
          subtasks={selectedSubtasks}
          timeEntries={selectedTimeEntries}
          activeTimeEntry={selectedActiveTimeEntry}
          people={people}
          projects={projects}
          clients={clients}
          currentPerson={currentPerson}
          currentUserId={currentUserId}
          currency={activeWorkspace?.currency ?? "USD"}
          canTrackTime={canTrackTime}
          canAuditTime={canAuditTime}
          onClose={() => setSelectedTaskId(null)}
          onTaskSelect={setSelectedTaskId}
          onTaskArchive={() => setTaskToArchiveId(selectedTask.id)}
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
          onComment={(body, type, visibility) => {
            void addComment(selectedTask.id, body, type, visibility);
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
                  projectIds: selectedTask.projects.map(
                    (project) => project.id,
                  ),
                  parentTaskId: parentId,
                  status: "nuevo",
                  priority: selectedTask.priority,
                  assigneeId,
                  client: selectedTask.client,
                  clientId:
                    selectedTask.clientId ??
                    selectedTask.project.clientId ??
                    null,
                  clientCategory:
                    selectedTask.clientCategory ??
                    selectedTask.project.clientCategory ??
                    null,
                  startDate: selectedTask.startDate ?? "",
                  dueDate: selectedTask.dueDate ?? "",
                  dueTime: selectedTask.dueTime ?? "",
                  tags: [],
                  recurrenceRule: "none",
                  recurrenceInterval: 1,
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
          onAttachmentUpload={async (files) => {
            const uploaded: TaskAttachment[] = [];
            try {
              for (const file of files) {
                uploaded.push(await uploadAttachment(selectedTask, file));
              }
              notify(
                files.length === 1
                  ? "Archivo insertado"
                  : `${files.length} archivos insertados`,
              );
              return uploaded;
            } catch (error: unknown) {
              notify(
                error instanceof Error
                  ? error.message
                  : "No se pudieron adjuntar los archivos",
              );
              return uploaded;
            }
          }}
          onAttachmentDelete={(attachment) => {
            void deleteAttachment(selectedTask.id, attachment);
            notify("Adjunto retirado del expediente");
          }}
          onAttachmentRestore={(attachment) => {
            void restoreAttachment(selectedTask.id, attachment.id);
            notify("Adjunto restaurado");
          }}
          onAttachmentStatus={(attachment, status) => {
            void updateAttachmentStatus(
              selectedTask.id,
              attachment.id,
              status,
            );
            notify(`Adjunto marcado como ${attachmentStatusLabels[status]}`);
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
          embedded={Boolean(focusedProject)}
          notify={notify}
        />
      ))}

      {taskToDeleteId && (
        <ConfirmDialog
          title="¿Mover el expediente a la papelera?"
          description="La tarea, sus subtareas y todo el historial quedarán conservados en la papelera. Un administrador puede restaurarlos."
          confirmLabel="Mover a papelera"
          onCancel={() => setTaskToDeleteId(null)}
          onConfirm={() => {
            void deleteTask(taskToDeleteId);
            setTaskToDeleteId(null);
            setSelectedTaskId(null);
            setView("archive");
            notify("Expediente movido a la papelera");
          }}
        />
      )}

      {taskToArchiveId &&
        tasks.find((task) => task.id === taskToArchiveId) && (
          <ArchiveTaskModal
            task={tasks.find((task) => task.id === taskToArchiveId)!}
            onClose={() => setTaskToArchiveId(null)}
            onConfirm={(input: ArchiveTaskInput) => {
              void archiveTask(taskToArchiveId, input);
              setTaskToArchiveId(null);
              setSelectedTaskId(null);
              setView("archive");
              notify("Proceso cerrado y archivado");
            }}
          />
        )}

      {showNewTask && (
        <NewTaskModal
          projects={projects}
          clients={clients}
          people={people}
          defaultProjectId={
            projectId === "todos" ? undefined : projectId
          }
          defaultStatus={newTaskStatus}
          onClose={() => setShowNewTask(false)}
          onCreate={handleCreate}
        />
      )}

      {showNewProject && (
        <NewProjectModal
          workspaceId={activeWorkspaceId}
          clients={clients}
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
            clients={clients}
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

      {clientsOpen && activeWorkspace && (
        <ClientsModal
          clients={clients}
          projects={projects}
          tasks={activeTasks}
          workspaceId={activeWorkspace.id}
          canManage={["owner", "admin"].includes(activeWorkspace.role)}
          onClose={() => setClientsOpen(false)}
          onCreate={async (input) => {
            try {
              const client = await createCatalogClient(input);
              notify("Cliente creado");
              return client;
            } catch (error) {
              notify(
                error instanceof Error
                  ? error.message
                  : "No se pudo crear el cliente",
              );
              throw error;
            }
          }}
          onUpdate={async (clientId, input) => {
            try {
              await updateClient(clientId, input);
              notify("Cliente actualizado");
            } catch (error) {
              notify(
                error instanceof Error
                  ? error.message
                  : "No se pudo actualizar el cliente",
              );
              throw error;
            }
          }}
          onDelete={async (clientId) => {
            try {
              await deleteClient(clientId);
              notify("Cliente eliminado");
            } catch (error) {
              notify(
                error instanceof Error
                  ? error.message
                  : "No se pudo eliminar el cliente",
              );
              throw error;
            }
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
          onProfileUpdate={updateProfile}
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

      <AdminPanel
        open={adminOpen && isPlatformAdmin}
        onClose={() => setAdminOpen(false)}
        notify={notify}
      />

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
