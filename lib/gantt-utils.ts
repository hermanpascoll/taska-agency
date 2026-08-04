import type { Task } from "@/lib/types";

const DAY_MS = 86_400_000;

export type TaskDateRange = {
  startDate: string;
  dueDate: string;
  durationDays: number;
};

export function parseISODate(value: string) {
  return new Date(`${value}T12:00:00`);
}

export function formatISODate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(value: string, amount: number) {
  const date = parseISODate(value);
  date.setDate(date.getDate() + amount);
  return formatISODate(date);
}

export function differenceInDays(from: string, to: string) {
  const start = parseISODate(from);
  const end = parseISODate(to);
  const startUtc = Date.UTC(
    start.getFullYear(),
    start.getMonth(),
    start.getDate(),
  );
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((endUtc - startUtc) / DAY_MS);
}

export function getTaskDateRange(
  task: Pick<Task, "startDate" | "dueDate">,
): TaskDateRange | null {
  if (!task.startDate && !task.dueDate) return null;
  const startDate = task.startDate ?? task.dueDate!;
  const dueDate = task.dueDate ?? task.startDate!;
  const normalizedStart = startDate <= dueDate ? startDate : dueDate;
  const normalizedDue = startDate <= dueDate ? dueDate : startDate;
  return {
    startDate: normalizedStart,
    dueDate: normalizedDue,
    durationDays: differenceInDays(normalizedStart, normalizedDue) + 1,
  };
}

export function shiftTaskDateRange(
  task: Pick<Task, "startDate" | "dueDate">,
  nextStartDate: string,
) {
  const range = getTaskDateRange(task);
  const durationDays = range?.durationDays ?? 1;
  return {
    startDate: nextStartDate,
    dueDate: addDays(nextStartDate, durationDays - 1),
  };
}

export function buildTimelineDates(tasks: Task[], today = new Date()) {
  const todayValue = formatISODate(today);
  const datedRanges = tasks
    .map((task) => getTaskDateRange(task))
    .filter((range): range is TaskDateRange => Boolean(range));
  const earliest = datedRanges.reduce(
    (current, range) =>
      range.startDate < current ? range.startDate : current,
    todayValue,
  );
  const latest = datedRanges.reduce(
    (current, range) => (range.dueDate > current ? range.dueDate : current),
    todayValue,
  );
  const start = addDays(earliest, -3);
  const end = addDays(latest, 7);
  const totalDays = Math.min(730, differenceInDays(start, end) + 1);
  return Array.from({ length: totalDays }, (_, index) =>
    addDays(start, index),
  );
}
