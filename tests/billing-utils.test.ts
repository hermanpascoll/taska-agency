import { describe, expect, it } from "vitest";
import {
  billingNeedsAttention,
  defaultTaskBilling,
  nextBillingStatusForCondition,
  taskLaborCost,
  taskMargin,
} from "@/lib/billing-utils";
import type { Person, Project, Task, TimeEntry } from "@/lib/types";

const person: Person = {
  id: "user-1",
  name: "Ana",
  initials: "AN",
  color: "#6366f1",
};

const project: Project = {
  id: "project-1",
  name: "Campaña",
  color: "#6366f1",
  workspaceId: "workspace-1",
  clientId: null,
  clientName: "Cliente",
  clientCategory: null,
  archived: false,
};

const task: Task = {
  id: "task-1",
  code: "AG-001",
  title: "Spot de radio",
  description: "",
  project,
  projects: [project],
  parentTaskId: null,
  status: "resuelto",
  priority: "media",
  assignee: person,
  client: "Cliente",
  startDate: null,
  dueDate: null,
  dueLabel: "Sin fecha",
  updatedAt: "Ahora",
  tags: [],
  comments: [],
  attachments: [],
  billing: {
    ...defaultTaskBilling(undefined, "USD"),
    commercialCondition: "extra",
    status: "ready",
    amount: 1000,
    externalCost: 200,
  },
};

const entry: TimeEntry = {
  id: "entry-1",
  workspaceId: "workspace-1",
  taskId: task.id,
  taskCode: task.code,
  taskTitle: task.title,
  projectId: project.id,
  projectName: project.name,
  user: person,
  description: "Producción",
  startedAt: "2026-08-12T10:00:00.000Z",
  endedAt: "2026-08-12T12:00:00.000Z",
  durationSeconds: 7200,
  billable: true,
  hourlyRate: 50,
  createdAt: "2026-08-12T10:00:00.000Z",
};

describe("facturación de procesos", () => {
  it("calcula costo horario y margen del trabajo extra", () => {
    expect(taskLaborCost(task, [entry])).toBe(100);
    expect(taskMargin(task, [entry])).toBe(700);
  });

  it("abre la etapa de prefacturación al clasificar una tarea como extra", () => {
    expect(nextBillingStatusForCondition("extra", "not_required")).toBe(
      "pending_info",
    );
    expect(nextBillingStatusForCondition("fee", "ready")).toBe("not_required");
  });

  it("marca como pendiente una finalización sin condición comercial", () => {
    expect(
      billingNeedsAttention({
        ...task,
        billing: defaultTaskBilling(undefined, "USD"),
      }),
    ).toBe(true);
  });
});
