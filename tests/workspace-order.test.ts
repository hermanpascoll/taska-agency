import { describe, expect, it } from "vitest";
import { initialTasks, workspaces } from "@/lib/demo-data";
import { sortTasksByCreation } from "@/lib/task-order";
import { selectActiveWorkspaceId } from "@/lib/workspace-selection";
import type { Workspace } from "@/lib/types";

describe("contexto y orden estable", () => {
  it("restaura el último espacio válido después de iniciar sesión", () => {
    const available: Workspace[] = [
      workspaces[0],
      { ...workspaces[0], id: "workspace-b", name: "Workspace B" },
    ];

    expect(selectActiveWorkspaceId(available, "", "workspace-b")).toBe(
      "workspace-b",
    );
    expect(selectActiveWorkspaceId(available, "missing", "workspace-b")).toBe(
      "workspace-b",
    );
  });

  it("ignora espacios archivados y conserva uno disponible", () => {
    const available: Workspace[] = [
      { ...workspaces[0], archived: true },
      { ...workspaces[0], id: "workspace-b", name: "Workspace B" },
    ];

    expect(selectActiveWorkspaceId(available, "prisma", "prisma")).toBe(
      "workspace-b",
    );
  });

  it("ordena por creación aunque una tarea haya sido editada recientemente", () => {
    const older = {
      ...initialTasks[0],
      id: "older",
      code: "AG-001",
      createdAt: "2026-01-01T10:00:00.000Z",
      updatedAt: "Ahora",
    };
    const newer = {
      ...initialTasks[0],
      id: "newer",
      code: "AG-002",
      createdAt: "2026-01-02T10:00:00.000Z",
      updatedAt: "Hace 2 días",
    };

    expect(sortTasksByCreation([newer, older]).map((task) => task.id)).toEqual([
      "older",
      "newer",
    ]);
  });
});
