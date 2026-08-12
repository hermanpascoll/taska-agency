import type { Task } from "@/lib/types";

function taskNumber(code: string) {
  const value = Number(code.replace(/\D/g, ""));
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

export function sortTasksByCreation(tasks: Task[]) {
  return [...tasks].sort((left, right) => {
    const byCreation = (left.createdAt ?? "").localeCompare(
      right.createdAt ?? "",
    );
    if (byCreation !== 0) return byCreation;
    const byNumber = taskNumber(left.code) - taskNumber(right.code);
    if (byNumber !== 0) return byNumber;
    return left.id.localeCompare(right.id);
  });
}
