"use client";

import { mergeAttributes, type Editor } from "@tiptap/core";
import FileHandler from "@tiptap/extension-file-handler";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import StarterKit from "@tiptap/starter-kit";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import {
  Bold,
  CheckSquare2,
  Code2,
  Heading2,
  Highlighter,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  LoaderCircle,
  Quote,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Underline,
  Undo2,
  Unlink,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { clsx } from "clsx";
import {
  isRichTextDescription,
  legacyDescriptionToHtml,
} from "@/lib/rich-text-description";
import {
  linkProviderForUrl,
  linkProviderLabels,
} from "@/lib/link-provider";
import { createClient } from "@/lib/supabase/client";
import type { Person, Task, TaskAttachment } from "@/lib/types";

type TaskDocument = Pick<Task, "id" | "description" | "attachments">;

const TaskImage = Image.extend({
  addAttributes() {
    return {
      ...(this.parent?.() ?? {}),
      attachmentId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-attachment-id"),
        renderHTML: (attributes) =>
          attributes.attachmentId
            ? { "data-attachment-id": attributes.attachmentId }
            : {},
      },
    };
  },
}).configure({
  allowBase64: true,
  HTMLAttributes: { class: "task-document-image" },
  resize: {
    enabled: true,
    minWidth: 180,
    minHeight: 100,
    directions: [
      "left",
      "right",
      "top-left",
      "top-right",
      "bottom-left",
      "bottom-right",
    ],
  },
});

const SmartLink = Link.extend({
  renderHTML({ HTMLAttributes }) {
    const href = String(HTMLAttributes.href ?? "");
    const provider = linkProviderForUrl(href);
    return [
      "a",
      mergeAttributes(
        this.options.HTMLAttributes,
        HTMLAttributes,
        provider
          ? {
              "data-link-provider": provider,
              title: `${linkProviderLabels[provider]} · ${href}`,
            }
          : {},
      ),
      0,
    ];
  },
}).configure({
  openOnClick: false,
  autolink: true,
  defaultProtocol: "https",
});

export async function resolveTaskAttachmentUrl(attachment: TaskAttachment) {
  if (attachment.dataUrl) return attachment.dataUrl;
  if (attachment.storageProvider === "google_drive" && attachment.externalFileId) {
    return `https://drive.google.com/thumbnail?id=${encodeURIComponent(attachment.externalFileId)}&sz=w1600`;
  }
  if (!attachment.storagePath) return null;
  const supabase = createClient();
  if (!supabase) return null;
  const { data } = await supabase.storage
    .from("task-attachments")
    .createSignedUrl(attachment.storagePath, 60 * 60 * 24 * 7);
  return data?.signedUrl ?? null;
}

async function hydrateDescription(task: TaskDocument) {
  const activeImages = task.attachments.filter(
    (attachment) =>
      !attachment.deletedAt && attachment.mimeType.startsWith("image/"),
  );
  const urls = new Map<string, string>();
  await Promise.all(
    activeImages.map(async (attachment) => {
      const url = await resolveTaskAttachmentUrl(attachment);
      if (url) urls.set(attachment.id, url);
    }),
  );

  const html = legacyDescriptionToHtml(
    task.description,
    task.attachments,
    urls,
  );
  if (!isRichTextDescription(task.description) || typeof DOMParser === "undefined") {
    return html;
  }

  const document = new DOMParser().parseFromString(html, "text/html");
  for (const image of document.querySelectorAll<HTMLImageElement>(
    "img[data-attachment-id]",
  )) {
    const attachmentId = image.dataset.attachmentId;
    const freshUrl = attachmentId ? urls.get(attachmentId) : null;
    if (freshUrl) image.src = freshUrl;
  }
  return document.body.innerHTML || "<p></p>";
}

function ToolbarButton({
  label,
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={clsx(
        "focus-ring grid size-8 shrink-0 place-items-center rounded-md transition-colors",
        active
          ? "bg-[#0a84ff] text-white"
          : "text-slate-500 hover:bg-slate-200/70 hover:text-slate-900",
        disabled && "cursor-not-allowed opacity-35",
      )}
    >
      {children}
    </button>
  );
}

export function TaskRichTextEditor({
  task,
  onUpdate,
  onUpload,
  onOpen,
  onCreateSubtask,
  people = [],
  updateDelay = 450,
  editable = true,
}: {
  task: TaskDocument;
  onUpdate: (description: string) => Promise<void> | void;
  onUpload: (files: File[]) => Promise<TaskAttachment[]>;
  onOpen: (attachment: TaskAttachment) => void;
  onCreateSubtask?: (title: string) => void;
  people?: Person[];
  updateDelay?: number;
  editable?: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);
  const mountedRef = useRef(true);
  const latestHtmlRef = useRef("");
  const onUpdateRef = useRef(onUpdate);
  const lastEmittedRef = useRef("");
  const lastSubmittedRef = useRef("");
  const loadedTaskIdRef = useRef("");
  const loadedSourceDescriptionRef = useRef("");
  const mentionRangeRef = useRef<{ from: number; to: number } | null>(null);
  const mentionCandidatesRef = useRef<Person[]>([]);
  const mentionIndexRef = useRef(0);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionPosition, setMentionPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);

  const mentionCandidates = useMemo(() => {
    if (mentionQuery === null) return [];
    const query = mentionQuery.toLocaleLowerCase("es");
    return people
      .filter(
        (person) =>
          !person.deactivated &&
          (!query ||
            person.name.toLocaleLowerCase("es").includes(query) ||
            person.email?.toLocaleLowerCase("es").includes(query)),
      )
      .slice(0, 6);
  }, [mentionQuery, people]);

  useEffect(() => {
    mentionCandidatesRef.current = mentionCandidates;
    mentionIndexRef.current = mentionIndex;
  }, [mentionCandidates, mentionIndex]);

  const detectMention = useCallback((currentEditor: Editor) => {
    const { from, empty } = currentEditor.state.selection;
    if (!empty) {
      mentionRangeRef.current = null;
      setMentionQuery(null);
      setMentionPosition(null);
      return;
    }
    const start = Math.max(0, from - 100);
    const beforeCursor = currentEditor.state.doc.textBetween(start, from, "\n", "\0");
    const match = beforeCursor.match(/(?:^|\s)@([^\s@]*)$/u);
    if (!match) {
      mentionRangeRef.current = null;
      setMentionQuery(null);
      setMentionPosition(null);
      return;
    }
    mentionRangeRef.current = {
      from: from - match[1].length - 1,
      to: from,
    };
    setMentionQuery(match[1]);
    setMentionIndex(0);

    try {
      const cursor = currentEditor.view.coordsAtPos(from);
      const menuWidth = 336;
      const menuHeight = 280;
      const viewportPadding = 12;
      const left = Math.max(
        viewportPadding,
        Math.min(cursor.left, window.innerWidth - menuWidth - viewportPadding),
      );
      const top =
        cursor.bottom + menuHeight + viewportPadding <= window.innerHeight
          ? cursor.bottom + 8
          : Math.max(viewportPadding, cursor.top - menuHeight - 8);
      setMentionPosition({ left, top });
    } catch {
      setMentionPosition(null);
    }
  }, []);

  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  const submitDescription = useCallback((html: string, reportState = true) => {
    if (html === lastSubmittedRef.current) {
      dirtyRef.current = false;
      return;
    }
    lastSubmittedRef.current = html;
    dirtyRef.current = false;
    if (reportState && mountedRef.current) setSaveState("saving");
    try {
      const operation = onUpdateRef.current(html);
      void Promise.resolve(operation).then(
        () => {
          if (!reportState || !mountedRef.current) return;
          setSaveState("saved");
          window.setTimeout(() => {
            if (mountedRef.current) setSaveState("idle");
          }, 1600);
        },
        () => {
          lastSubmittedRef.current = "";
          if (reportState && mountedRef.current) setSaveState("error");
        },
      );
    } catch {
      lastSubmittedRef.current = "";
      if (reportState && mountedRef.current) setSaveState("error");
    }
  }, []);
  const insertImages = useCallback(
    async (targetEditor: Editor, files: File[], position?: number) => {
      const images = files.filter((file) => file.type.startsWith("image/"));
      if (!images.length) {
        setUploadError("Solo se pueden insertar imágenes dentro del documento.");
        return;
      }
      setUploading(true);
      setUploadError(null);
      try {
        const uploaded = await onUpload(images);
        const content: Array<Record<string, unknown>> = [];
        for (const attachment of uploaded) {
          const src = await resolveTaskAttachmentUrl(attachment);
          if (!src) continue;
          content.push({
            type: "image",
            attrs: {
              src,
              alt: attachment.name,
              title: attachment.name,
              attachmentId: attachment.id,
            },
          });
          content.push({ type: "paragraph" });
        }
        if (!content.length) {
          throw new Error("No se pudo obtener la imagen cargada.");
        }
        const chain = targetEditor.chain().focus();
        if (typeof position === "number") {
          chain.insertContentAt(position, content).run();
        } else {
          chain.insertContent(content).run();
        }
      } catch (error) {
        setUploadError(
          error instanceof Error
            ? error.message
            : "No se pudo insertar la imagen.",
        );
      } finally {
        setUploading(false);
      }
    },
    [onUpload],
  );

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: false,
      }),
      SmartLink,
      Highlight.configure({ multicolor: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      TaskImage,
      Placeholder.configure({
        placeholder: "Escribí la descripción como en un documento…",
      }),
      FileHandler.configure({
        allowedMimeTypes: ["image/jpeg", "image/png", "image/gif", "image/webp"],
        consumePasteEvent: true,
        onPaste: (editor, files) => {
          void insertImages(editor, files);
        },
        onDrop: (editor, files, position) => {
          void insertImages(editor, files, position);
        },
      }),
    ],
    [insertImages],
  );

  const editor = useEditor({
    immediatelyRender: false,
    editable,
    extensions,
    content: "<p></p>",
    editorProps: {
      attributes: {
        class: "task-document-body",
        spellcheck: "true",
        "aria-label": "Descripción de la tarea",
      },
      handleClick: (_view, _position, event) => {
        const target = event.target;
        if (!(target instanceof HTMLImageElement)) return false;
        const attachmentId = target.dataset.attachmentId;
        const attachment = task.attachments.find(
          (item) => item.id === attachmentId,
        );
        if (attachment && (event.metaKey || event.ctrlKey)) {
          onOpen(attachment);
          return true;
        }
        return false;
      },
      handleKeyDown: (_view, event) => {
        const candidates = mentionCandidatesRef.current;
        if (!mentionRangeRef.current || !candidates.length) return false;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          setMentionIndex((current) =>
            event.key === "ArrowDown"
              ? (current + 1) % candidates.length
              : (current - 1 + candidates.length) % candidates.length,
          );
          return true;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          event.preventDefault();
          const person = candidates[mentionIndexRef.current] ?? candidates[0];
          const range = mentionRangeRef.current;
          if (person && range) {
            editor
              ?.chain()
              .focus()
              .deleteRange(range)
              .insertContent(`@${person.name} `)
              .run();
            mentionRangeRef.current = null;
            setMentionQuery(null);
            setMentionPosition(null);
          }
          return true;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          mentionRangeRef.current = null;
          setMentionQuery(null);
          setMentionPosition(null);
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      detectMention(currentEditor);
      const html = currentEditor.getHTML();
      latestHtmlRef.current = html;
      lastEmittedRef.current = html;
      if (updateDelay === 0) {
        dirtyRef.current = false;
        submitDescription(html);
        return;
      }
      dirtyRef.current = true;
      setSaveState("saving");
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        submitDescription(latestHtmlRef.current);
        saveTimerRef.current = null;
      }, updateDelay);
    },
    onSelectionUpdate: ({ editor: currentEditor }) => {
      detectMention(currentEditor);
    },
    onBlur: ({ editor: currentEditor }) => {
      if (!dirtyRef.current) return;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      const html = currentEditor.getHTML();
      latestHtmlRef.current = html;
      lastEmittedRef.current = html;
      submitDescription(html);
    },
  }, [detectMention, submitDescription]);

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editable, editor]);

  useEffect(() => {
    if (!editor) return;
    const sameTask = loadedTaskIdRef.current === task.id;
    if (
      sameTask &&
      loadedSourceDescriptionRef.current === task.description
    ) return;

    let active = true;
    loadedTaskIdRef.current = task.id;
    loadedSourceDescriptionRef.current = task.description;
    if (sameTask && task.description === lastEmittedRef.current) {
      return;
    }
    void hydrateDescription(task).then((html) => {
      if (!active || editor.isDestroyed) return;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      latestHtmlRef.current = html;
      lastEmittedRef.current = html;
      lastSubmittedRef.current = task.description;
      dirtyRef.current = false;
      editor.commands.setContent(html, { emitUpdate: false });
    });
    return () => {
      active = false;
    };
  }, [editor, task]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      if (dirtyRef.current) {
        submitDescription(latestHtmlRef.current, false);
      }
    };
  }, [submitDescription]);

  const toolbar = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      bold: currentEditor?.isActive("bold") ?? false,
      italic: currentEditor?.isActive("italic") ?? false,
      underline: currentEditor?.isActive("underline") ?? false,
      strike: currentEditor?.isActive("strike") ?? false,
      highlight: currentEditor?.isActive("highlight") ?? false,
      heading: currentEditor?.isActive("heading", { level: 2 }) ?? false,
      bulletList: currentEditor?.isActive("bulletList") ?? false,
      orderedList: currentEditor?.isActive("orderedList") ?? false,
      taskList: currentEditor?.isActive("taskList") ?? false,
      blockquote: currentEditor?.isActive("blockquote") ?? false,
      codeBlock: currentEditor?.isActive("codeBlock") ?? false,
      link: currentEditor?.isActive("link") ?? false,
      canUndo: currentEditor?.can().undo() ?? false,
      canRedo: currentEditor?.can().redo() ?? false,
    }),
  });

  const editLink = () => {
    if (!editor) return;
    const previous = editor.getAttributes("link").href as string | undefined;
    const href = window.prompt("Dirección del enlace", previous ?? "https://");
    if (href === null) return;
    if (!href.trim()) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
  };

  const createSubtaskFromSelection = () => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const title = editor.state.doc.textBetween(from, to, " ").trim();
    if (title) onCreateSubtask?.(title);
  };

  return (
    <div
      data-testid="task-description-document"
      className="task-rich-editor mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white"
    >
      {editable && <div className="task-document-toolbar flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-slate-50/90 px-2 py-1.5">
        <ToolbarButton label="Deshacer" disabled={!toolbar?.canUndo} onClick={() => editor?.chain().focus().undo().run()}>
          <Undo2 className="size-4" />
        </ToolbarButton>
        <ToolbarButton label="Rehacer" disabled={!toolbar?.canRedo} onClick={() => editor?.chain().focus().redo().run()}>
          <Redo2 className="size-4" />
        </ToolbarButton>
        <span className="mx-1 h-5 w-px bg-slate-200" />
        <ToolbarButton label="Título" active={toolbar?.heading} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>
          <Heading2 className="size-4" />
        </ToolbarButton>
        <ToolbarButton label="Negrita" active={toolbar?.bold} onClick={() => editor?.chain().focus().toggleBold().run()}>
          <Bold className="size-4" />
        </ToolbarButton>
        <ToolbarButton label="Cursiva" active={toolbar?.italic} onClick={() => editor?.chain().focus().toggleItalic().run()}>
          <Italic className="size-4" />
        </ToolbarButton>
        <ToolbarButton label="Subrayado" active={toolbar?.underline} onClick={() => editor?.chain().focus().toggleUnderline().run()}>
          <Underline className="size-4" />
        </ToolbarButton>
        <ToolbarButton label="Tachado" active={toolbar?.strike} onClick={() => editor?.chain().focus().toggleStrike().run()}>
          <Strikethrough className="size-4" />
        </ToolbarButton>
        <ToolbarButton label="Resaltar" active={toolbar?.highlight} onClick={() => editor?.chain().focus().toggleHighlight().run()}>
          <Highlighter className="size-4" />
        </ToolbarButton>
        <span className="mx-1 h-5 w-px bg-slate-200" />
        <ToolbarButton label="Lista con viñetas" active={toolbar?.bulletList} onClick={() => editor?.chain().focus().toggleBulletList().run()}>
          <List className="size-4" />
        </ToolbarButton>
        <ToolbarButton label="Lista numerada" active={toolbar?.orderedList} onClick={() => editor?.chain().focus().toggleOrderedList().run()}>
          <ListOrdered className="size-4" />
        </ToolbarButton>
        <ToolbarButton label="Lista de verificación" active={toolbar?.taskList} onClick={() => editor?.chain().focus().toggleTaskList().run()}>
          <ListChecks className="size-4" />
        </ToolbarButton>
        <ToolbarButton label="Cita" active={toolbar?.blockquote} onClick={() => editor?.chain().focus().toggleBlockquote().run()}>
          <Quote className="size-4" />
        </ToolbarButton>
        <ToolbarButton label="Bloque de código" active={toolbar?.codeBlock} onClick={() => editor?.chain().focus().toggleCodeBlock().run()}>
          <Code2 className="size-4" />
        </ToolbarButton>
        <span className="mx-1 h-5 w-px bg-slate-200" />
        <ToolbarButton label="Agregar enlace" active={toolbar?.link} onClick={editLink}>
          <Link2 className="size-4" />
        </ToolbarButton>
        <ToolbarButton label="Quitar enlace" disabled={!toolbar?.link} onClick={() => editor?.chain().focus().unsetLink().run()}>
          <Unlink className="size-4" />
        </ToolbarButton>
        <ToolbarButton label="Insertar imagen en la descripción" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
          {uploading ? <LoaderCircle className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
        </ToolbarButton>
        <ToolbarButton label="Quitar formato" onClick={() => editor?.chain().focus().unsetAllMarks().clearNodes().run()}>
          <RemoveFormatting className="size-4" />
        </ToolbarButton>
        {onCreateSubtask && (
          <ToolbarButton label="Crear subtarea con el texto seleccionado" onClick={createSubtaskFromSelection}>
            <CheckSquare2 className="size-4" />
          </ToolbarButton>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          aria-label="Seleccionar imágenes para la descripción"
          onChange={(event) => {
            if (editor && event.target.files?.length) {
              void insertImages(editor, Array.from(event.target.files));
            }
            event.target.value = "";
          }}
        />
      </div>}
      <EditorContent editor={editor} />
      {mentionQuery !== null &&
        mentionCandidates.length > 0 &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed z-[100] max-h-[280px] w-[min(336px,calc(100vw-24px))] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl"
            style={mentionPosition ?? { left: 12, top: 12 }}
            data-testid="mention-menu"
          >
          <p className="px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-slate-400">
            Mencionar a
          </p>
          {mentionCandidates.map((person, index) => (
            <button
              key={person.id}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                const range = mentionRangeRef.current;
                if (!editor || !range) return;
                editor
                  .chain()
                  .focus()
                  .deleteRange(range)
                  .insertContent(`@${person.name} `)
                  .run();
                mentionRangeRef.current = null;
                setMentionQuery(null);
                setMentionPosition(null);
              }}
              className={clsx(
                "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left",
                index === mentionIndex
                  ? "bg-[#0a84ff]/10"
                  : "hover:bg-slate-50",
              )}
            >
              <span
                className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-full text-[9px] font-bold text-white"
                style={{ background: person.color }}
              >
                {person.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={person.avatarUrl} alt="" className="size-full object-cover" />
                ) : (
                  person.initials
                )}
              </span>
              <span className="min-w-0">
                <strong className="block truncate text-[11px] text-slate-800">
                  {person.name}
                </strong>
                <span className="block truncate text-[9px] text-slate-400">
                  {person.email}
                </span>
              </span>
            </button>
          ))}
          </div>,
          document.body,
        )}
      {editable && <div className="flex min-h-8 items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/70 px-3 py-1.5 text-[10px] text-slate-500">
        <span>{uploading ? "Insertando imagen…" : "Pegá o arrastrá imágenes directamente en el texto"}</span>
        <span
          className={clsx(
            "font-semibold",
            (uploadError || saveState === "error") && "text-rose-500",
          )}
        >
          {uploadError
            ? uploadError
            : saveState === "saving"
              ? "Guardando…"
              : saveState === "saved"
                ? "Guardado"
                : saveState === "error"
                  ? "No se pudo guardar. Se reintentará al editar."
                  : ""}
        </span>
      </div>}
    </div>
  );
}
