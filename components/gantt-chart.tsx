"use client";

import {
  CalendarDays,
  CalendarRange,
  ChevronDown,
  GitBranch,
  MoveHorizontal,
  UserRound,
} from "lucide-react";
import { type DragEvent, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import {
  buildTimelineDates,
  differenceInDays,
  formatISODate,
  getTaskDateRange,
  parseISODate,
  shiftTaskDateRange,
} from "@/lib/gantt-utils";
import type { Project, Task, TaskStatus, UpdateTaskInput } from "@/lib/types";

type Scale = "day" | "week" | "month";

const scaleMeta: Record<Scale, { label: string; dayWidth: number }> = {
  day: { label: "Día", dayWidth: 42 },
  week: { label: "Semana", dayWidth: 22 },
  month: { label: "Mes", dayWidth: 11 },
};

const statusMeta: Record<
  TaskStatus,
  { label: string; bar: string; text: string }
> = {
  nuevo: {
    label: "Por hacer",
    bar: "bg-violet-500",
    text: "text-violet-700",
  },
  en_progreso: {
    label: "En curso",
    bar: "bg-amber-500",
    text: "text-amber-700",
  },
  esperando: {
    label: "En revisión",
    bar: "bg-sky-500",
    text: "text-sky-700",
  },
  resuelto: {
    label: "Aprobado",
    bar: "bg-emerald-500",
    text: "text-emerald-700",
  },
};

type ProjectGroup = {
  project: Project;
  tasks: Array<{ task: Task; depth: number }>;
};

function hierarchyForProject(tasks: Task[]) {
  const taskIds = new Set(tasks.map((task) => task.id));
  const children = new Map<string, Task[]>();
  tasks.forEach((task) => {
    if (!task.parentTaskId || !taskIds.has(task.parentTaskId)) return;
    const current = children.get(task.parentTaskId) ?? [];
    current.push(task);
    children.set(task.parentTaskId, current);
  });

  const ordered: Array<{ task: Task; depth: number }> = [];
  const visited = new Set<string>();
  const append = (task: Task, depth: number) => {
    if (visited.has(task.id)) return;
    visited.add(task.id);
    ordered.push({ task, depth });
    (children.get(task.id) ?? []).forEach((child) =>
      append(child, depth + 1),
    );
  };

  tasks
    .filter(
      (task) => !task.parentTaskId || !taskIds.has(task.parentTaskId),
    )
    .forEach((task) => append(task, 0));
  tasks.forEach((task) => append(task, task.parentTaskId ? 1 : 0));
  return ordered;
}

function groupTasks(tasks: Task[]): ProjectGroup[] {
  const projects = new Map<string, { project: Project; tasks: Task[] }>();
  tasks.forEach((task) => {
    const current = projects.get(task.project.id);
    if (current) current.tasks.push(task);
    else projects.set(task.project.id, { project: task.project, tasks: [task] });
  });
  return [...projects.values()].map((group) => ({
    project: group.project,
    tasks: hierarchyForProject(group.tasks),
  }));
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat("es-UY", {
    day: "numeric",
    month: "short",
  }).format(parseISODate(value));
}

export function GanttChart({
  tasks,
  onSelect,
  onUpdateDates,
}: {
  tasks: Task[];
  onSelect: (task: Task) => void;
  onUpdateDates: (taskId: string, input: UpdateTaskInput) => void;
}) {
  const [scale, setScale] = useState<Scale>("week");
  const [scaleOpen, setScaleOpen] = useState(false);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const timelineViewportRef = useRef<HTMLDivElement>(null);
  const groups = useMemo(() => groupTasks(tasks), [tasks]);
  const dates = useMemo(() => buildTimelineDates(tasks), [tasks]);
  const dayWidth = scaleMeta[scale].dayWidth;
  const timelineWidth = dates.length * dayWidth;
  const timelineStart = dates[0];
  const today = formatISODate(new Date());
  const todayOffset = differenceInDays(timelineStart, today) * dayWidth;

  const monthSegments = useMemo(() => {
    const result: Array<{
      key: string;
      label: string;
      start: number;
      length: number;
    }> = [];
    dates.forEach((value, index) => {
      const date = parseISODate(value);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      const previous = result.at(-1);
      if (previous?.key === key) previous.length += 1;
      else {
        result.push({
          key,
          label: new Intl.DateTimeFormat("es-UY", {
            month: "long",
            year: "numeric",
          }).format(date),
          start: index,
          length: 1,
        });
      }
    });
    return result;
  }, [dates]);

  function goToToday() {
    timelineViewportRef.current?.scrollTo({
      left: Math.max(0, todayOffset - 120),
      behavior: "smooth",
    });
  }

  function autoFit() {
    const span = dates.length;
    setScale(span <= 30 ? "day" : span <= 150 ? "week" : "month");
    window.setTimeout(goToToday, 0);
  }

  function dropAt(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const draggedId =
      draggedTaskId || event.dataTransfer.getData("text/task-id");
    const draggedTask = tasks.find((task) => task.id === draggedId);
    const viewport = timelineViewportRef.current;
    if (!draggedTask || !viewport) return;
    const rect = viewport.getBoundingClientRect();
    const x = event.clientX - rect.left + viewport.scrollLeft;
    const dayIndex = Math.max(
      0,
      Math.min(dates.length - 1, Math.floor(x / dayWidth)),
    );
    onUpdateDates(
      draggedTask.id,
      shiftTaskDateRange(draggedTask, dates[dayIndex]),
    );
    setDraggedTaskId(null);
  }

  return (
    <section
      className="overflow-hidden rounded-2xl border border-[#dfe3ea] bg-white shadow-[0_1px_2px_rgba(25,32,50,0.04)]"
      aria-label="Diagrama de Gantt"
      data-testid="gantt-chart"
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-[#fafbfc] px-4 py-3">
        <span className="flex items-center gap-2 text-[11px] font-bold text-slate-700">
          <CalendarRange className="size-4 text-[#0a84ff]" />
          Cronograma
        </span>
        <span className="hidden text-[10px] text-slate-400 sm:inline">
          Arrastrá una barra para reprogramarla
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={goToToday}
            className="focus-ring rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"
          >
            Hoy
          </button>
          <button
            type="button"
            onClick={autoFit}
            className="focus-ring hidden rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50 sm:block"
          >
            Autoajustar
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setScaleOpen((current) => !current)}
              className="focus-ring flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"
              aria-expanded={scaleOpen}
            >
              {scaleMeta[scale].label}
              <ChevronDown className="size-3" />
            </button>
            {scaleOpen && (
              <div className="absolute right-0 top-[calc(100%+5px)] z-30 min-w-28 rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
                {(Object.keys(scaleMeta) as Scale[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => {
                      setScale(item);
                      setScaleOpen(false);
                    }}
                    className={clsx(
                      "focus-ring block w-full rounded-lg px-3 py-2 text-left text-[10px] font-semibold",
                      scale === item
                        ? "bg-[#0a84ff]/10 text-[#0879ea]"
                        : "text-slate-500 hover:bg-slate-50",
                    )}
                  >
                    {scaleMeta[item].label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[220px_minmax(0,1fr)] sm:grid-cols-[286px_minmax(0,1fr)]">
        <div className="z-10 border-r border-slate-200 bg-white">
          <div className="flex h-[62px] items-end border-b border-slate-200 bg-[#f8f9fb] px-4 pb-2 text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400">
            Tarea / responsable
          </div>
          {groups.map((group) => (
            <div key={group.project.id}>
              <div className="flex h-9 items-center gap-2 border-b border-slate-100 bg-slate-50/80 px-3">
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: group.project.color }}
                />
                <span className="truncate text-[10px] font-bold text-slate-600">
                  {group.project.name}
                </span>
                <span className="ml-auto text-[9px] text-slate-400">
                  {group.tasks.length}
                </span>
              </div>
              {group.tasks.map(({ task, depth }) => {
                const range = getTaskDateRange(task);
                return (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => onSelect(task)}
                    className="focus-ring flex h-[52px] w-full items-center border-b border-slate-100 px-3 text-left transition hover:bg-[#f2f7ff]"
                    style={{ paddingLeft: 12 + depth * 18 }}
                    data-testid={`gantt-row-${task.id}`}
                  >
                    {depth > 0 && (
                      <GitBranch className="mr-2 size-3.5 shrink-0 text-slate-300" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11px] font-semibold text-slate-700">
                        {task.title}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1 text-[9px] text-slate-400">
                        <UserRound className="size-2.5" />
                        {task.assignee?.name.split(" ")[0] ?? "Sin asignar"}
                        <span>·</span>
                        {range
                          ? `${shortDate(range.startDate)} – ${shortDate(range.dueDate)}`
                          : "Sin fechas"}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div
          ref={timelineViewportRef}
          className="soft-scrollbar overflow-x-auto bg-white"
          onDragOver={(event) => event.preventDefault()}
          onDrop={dropAt}
          data-testid="gantt-timeline"
        >
          <div
            className="relative"
            style={{ width: timelineWidth, minWidth: "100%" }}
            data-gantt-timeline
          >
            <div className="sticky top-0 z-20 h-[62px] border-b border-slate-200 bg-[#f8f9fb]">
              <div className="relative h-8 border-b border-slate-200/70">
                {monthSegments.map((segment) => (
                  <span
                    key={segment.key}
                    className="absolute top-0 flex h-8 items-center border-r border-slate-200 px-2 text-[9px] font-bold capitalize text-slate-500"
                    style={{
                      left: segment.start * dayWidth,
                      width: segment.length * dayWidth,
                    }}
                  >
                    {segment.label}
                  </span>
                ))}
              </div>
              <div className="flex h-[30px]">
                {dates.map((value) => {
                  const date = parseISODate(value);
                  const showLabel =
                    scale === "day" ||
                    (scale === "week" && date.getDay() === 1) ||
                    (scale === "month" && date.getDate() === 1);
                  const isWeekend =
                    date.getDay() === 0 || date.getDay() === 6;
                  return (
                    <span
                      key={value}
                      className={clsx(
                        "flex shrink-0 items-center justify-center border-r border-slate-200/70 text-[8px] font-semibold text-slate-400",
                        isWeekend && "bg-slate-100/70",
                        value === today && "text-[#0879ea]",
                      )}
                      style={{ width: dayWidth }}
                      title={shortDate(value)}
                    >
                      {showLabel &&
                        (scale === "month"
                          ? new Intl.DateTimeFormat("es-UY", {
                              month: "short",
                            }).format(date)
                          : date.getDate())}
                    </span>
                  );
                })}
              </div>
            </div>

            <div className="relative">
              {groups.map((group) => (
                <div key={group.project.id}>
                  <div
                    className="h-9 border-b border-slate-100 bg-slate-50/60"
                    style={{
                      backgroundImage: `repeating-linear-gradient(to right, transparent 0, transparent ${dayWidth - 1}px, rgba(226,232,240,.72) ${dayWidth - 1}px, rgba(226,232,240,.72) ${dayWidth}px)`,
                    }}
                  />
                  {group.tasks.map(({ task }) => {
                    const range = getTaskDateRange(task);
                    const left = range
                      ? differenceInDays(timelineStart, range.startDate) *
                        dayWidth
                      : 0;
                    const width = range
                      ? Math.max(dayWidth, range.durationDays * dayWidth)
                      : 0;
                    return (
                      <div
                        key={task.id}
                        className="relative h-[52px] border-b border-slate-100"
                        style={{
                          backgroundImage: `repeating-linear-gradient(to right, transparent 0, transparent ${dayWidth - 1}px, rgba(226,232,240,.58) ${dayWidth - 1}px, rgba(226,232,240,.58) ${dayWidth}px)`,
                        }}
                      >
                        {range ? (
                          <button
                            type="button"
                            draggable
                            onDragStart={(event) => {
                              setDraggedTaskId(task.id);
                              event.dataTransfer.effectAllowed = "move";
                              event.dataTransfer.setData(
                                "text/task-id",
                                task.id,
                              );
                            }}
                            onDragEnd={() => setDraggedTaskId(null)}
                            onClick={() => onSelect(task)}
                            className={clsx(
                              "focus-ring group absolute top-3 flex h-7 items-center rounded-md px-2 text-left text-white shadow-sm transition hover:brightness-95 active:cursor-grabbing",
                              statusMeta[task.status].bar,
                              draggedTaskId === task.id && "opacity-50",
                            )}
                            style={{ left: left + 2, width: width - 4 }}
                            title={`${task.title} · ${shortDate(range.startDate)} – ${shortDate(range.dueDate)} · Arrastrar para reprogramar`}
                            aria-label={`Abrir o reprogramar ${task.title}`}
                            data-testid={`gantt-bar-${task.id}`}
                          >
                            <MoveHorizontal className="mr-1.5 size-3 shrink-0 opacity-60" />
                            <span className="truncate text-[9px] font-bold">
                              {task.title}
                            </span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onSelect(task)}
                            className="focus-ring absolute left-2 top-3 flex h-7 items-center gap-1.5 rounded-md border border-dashed border-slate-300 bg-white px-2 text-[9px] font-semibold text-slate-400 hover:border-[#0a84ff]/50 hover:text-[#0879ea]"
                          >
                            <CalendarDays className="size-3" />
                            Definir fechas
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
              {todayOffset >= 0 && todayOffset <= timelineWidth && (
                <div
                  className="pointer-events-none absolute inset-y-0 z-10 w-px bg-[#0a84ff]/80"
                  style={{ left: todayOffset + dayWidth / 2 }}
                  aria-hidden
                >
                  <span className="absolute -left-[3px] -top-1 size-[7px] rounded-full bg-[#0a84ff]" />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-200 bg-[#fafbfc] px-4 py-2">
        {(Object.keys(statusMeta) as TaskStatus[]).map((status) => (
          <span
            key={status}
            className={clsx(
              "flex items-center gap-1.5 text-[9px] font-semibold",
              statusMeta[status].text,
            )}
          >
            <span
              className={clsx("size-2 rounded-sm", statusMeta[status].bar)}
            />
            {statusMeta[status].label}
          </span>
        ))}
      </footer>
    </section>
  );
}
