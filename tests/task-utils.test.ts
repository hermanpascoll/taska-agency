import { describe, expect, it } from "vitest";
import {
  formatBytes,
  formatDuration,
  formatDueLabel,
  buildTimeReportCsv,
  canAuditTimeReports,
  elapsedSeconds,
  matchesTaskFilters,
  nextTaskCode,
  safeStorageName,
  timeEntryCost,
} from "@/lib/task-utils";
import { initialTasks, timeEntries } from "@/lib/demo-data";
import type { AdvancedFilters } from "@/lib/types";

const noAdvancedFilters: AdvancedFilters = {
  status: "todos",
  assigneeId: "todos",
  due: "todas",
};

describe("task utils", () => {
  it("genera el próximo código sin colisiones", () => {
    expect(nextTaskCode(initialTasks)).toMatch(/^AG-\d+$/);
    expect(Number(nextTaskCode(initialTasks).slice(3))).toBeGreaterThan(150);
  });

  it("formatea fechas relativas en español", () => {
    const now = new Date("2026-07-24T09:00:00-03:00");
    expect(formatDueLabel("2026-07-24", now)).toBe("Hoy");
    expect(formatDueLabel("2026-07-25", now)).toBe("Mañana");
    expect(formatDueLabel(null, now)).toBe("Sin fecha");
  });

  it("combina búsqueda, prioridad, responsable y estado", () => {
    const task = initialTasks[0];
    expect(
      matchesTaskFilters(task, {
        query: task.project.name,
        priority: task.priority,
        projectId: task.project.id,
        advanced: {
          ...noAdvancedFilters,
          status: task.status,
          assigneeId: task.assignee?.id ?? "sin_asignar",
        },
      }),
    ).toBe(true);
    expect(
      matchesTaskFilters(task, {
        query: "contenido inexistente",
        priority: "todas",
        projectId: "todos",
        advanced: noAdvancedFilters,
      }),
    ).toBe(false);
  });

  it("filtra vencimientos y archivos de forma segura", () => {
    const overdueTask = {
      ...initialTasks[0],
      dueDate: "2026-07-20",
      status: "nuevo" as const,
    };
    expect(
      matchesTaskFilters(overdueTask, {
        query: "",
        priority: "todas",
        projectId: "todos",
        advanced: { ...noAdvancedFilters, due: "vencidas" },
        now: new Date("2026-07-24T12:00:00-03:00"),
      }),
    ).toBe(true);
    expect(safeStorageName("Brief campaña #1 (final).pdf")).toBe(
      "Brief-campana-1-final-.pdf",
    );
    expect(formatBytes(1_572_864)).toBe("1.5 MB");
  });

  it("calcula duración, costo y exportación auditable", () => {
    const entry = timeEntries[0];
    expect(elapsedSeconds(entry)).toBe(8100);
    expect(formatDuration(8100)).toBe("02:15:00");
    expect(timeEntryCost(entry)).toBe(117);
    const csv = buildTimeReportCsv([entry], "USD");
    expect(csv).toContain("Duración (horas)");
    expect(csv).toContain("Adaptar campaña de lanzamiento a stories");
    expect(csv).toContain("117.00");
    expect(canAuditTimeReports("owner")).toBe(true);
    expect(canAuditTimeReports("admin")).toBe(true);
    expect(canAuditTimeReports("agent")).toBe(false);
    expect(canAuditTimeReports("viewer")).toBe(false);
  });
});
