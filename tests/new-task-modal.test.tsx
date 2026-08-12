import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NewTaskModal } from "@/components/new-task-modal";
import type { Person, Project } from "@/lib/types";

vi.mock("@/components/task-rich-text-editor", () => ({
  TaskRichTextEditor: () => <div data-testid="rich-text-editor" />,
}));

const people: Person[] = [
  {
    id: "carolina-id",
    name: "Carolina",
    initials: "CA",
    color: "#e879f9",
  },
  {
    id: "logged-user-id",
    name: "Usuario logueado",
    initials: "UL",
    color: "#6366f1",
  },
];

const projects: Project[] = [
  {
    id: "project-id",
    name: "Proyecto",
    color: "#6366f1",
    workspaceId: "workspace-id",
    clientId: null,
    clientName: null,
    clientCategory: null,
    archived: false,
  },
];

describe("Nueva tarea", () => {
  it("asigna por defecto al usuario autenticado y no a la primera persona", async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(
      <NewTaskModal
        projects={projects}
        clients={[]}
        people={people}
        currentUserId="logged-user-id"
        defaultStatus="nuevo"
        onClose={vi.fn()}
        onCreate={onCreate}
      />,
    );

    expect(screen.getByLabelText("Responsable")).toHaveValue(
      "logged-user-id",
    );

    await user.type(
      screen.getByRole("textbox", { name: "Título de la nueva tarea" }),
      "Tarea de prueba",
    );
    await user.click(screen.getByRole("button", { name: "Crear tarea" }));

    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Tarea de prueba",
        assigneeId: "logged-user-id",
      }),
      [],
    );
  });
});
