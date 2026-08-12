import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TaskRichTextEditor } from "@/components/task-rich-text-editor";
import { initialTasks, people } from "@/lib/demo-data";
import type { TaskAttachment } from "@/lib/types";

describe("editor enriquecido", () => {
  it("guarda inmediatamente el texto pendiente cuando se cierra la tarea", async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    const view = render(
      <TaskRichTextEditor
        task={{ ...initialTasks[0], description: "", attachments: [] }}
        onUpdate={onUpdate}
        onUpload={vi.fn().mockResolvedValue([])}
        onOpen={vi.fn()}
        updateDelay={60_000}
      />,
    );

    const editor = screen.getByLabelText("Descripción de la tarea");
    await user.click(editor);
    await user.type(editor, "Contenido que no se puede perder");
    expect(onUpdate).not.toHaveBeenCalled();

    view.unmount();

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate.mock.calls[0][0]).toContain(
      "Contenido que no se puede perder",
    );
  });

  it("conserva texto e imagen embebida al cerrar", async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    const attachment: TaskAttachment = {
      id: "embedded-image",
      taskId: initialTasks[0].id,
      name: "referencia.png",
      size: 68,
      mimeType: "image/png",
      storagePath: null,
      dataUrl:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      createdAt: "Ahora",
      uploader: people[0],
      versionGroupId: "embedded-image",
      versionNumber: 1,
      approvalStatus: "draft",
      deletedAt: null,
    };
    const user = userEvent.setup();
    const view = render(
      <TaskRichTextEditor
        task={{ ...initialTasks[0], description: "", attachments: [] }}
        onUpdate={onUpdate}
        onUpload={vi.fn().mockResolvedValue([attachment])}
        onOpen={vi.fn()}
        updateDelay={60_000}
      />,
    );

    const editor = screen.getByLabelText("Descripción de la tarea");
    await user.click(editor);
    await user.type(editor, "Texto antes");
    await user.upload(
      screen.getByLabelText("Seleccionar imágenes para la descripción"),
      new File(["image"], "referencia.png", { type: "image/png" }),
    );
    await waitFor(() =>
      expect(editor.querySelector("img[data-attachment-id='embedded-image']")).toBeTruthy(),
    );
    await user.type(editor, "Texto después");

    view.unmount();

    const saved = onUpdate.mock.calls.at(-1)?.[0] ?? "";
    expect(saved).toContain("Texto antes");
    expect(saved).toContain('data-attachment-id="embedded-image"');
    expect(saved).toContain("Texto después");
  });

  it("no informa Guardado cuando la persistencia rechaza el cambio", async () => {
    const onUpdate = vi
      .fn()
      .mockRejectedValue(new Error("La tarea no se guardó"));
    const user = userEvent.setup();
    render(
      <TaskRichTextEditor
        task={{ ...initialTasks[0], description: "", attachments: [] }}
        onUpdate={onUpdate}
        onUpload={vi.fn().mockResolvedValue([])}
        onOpen={vi.fn()}
        updateDelay={0}
      />,
    );

    const editor = screen.getByLabelText("Descripción de la tarea");
    await user.click(editor);
    await user.type(editor, "Cambio sin permisos");

    await waitFor(() =>
      expect(
        screen.getByText("No se pudo guardar. Se reintentará al editar."),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText("Guardado")).not.toBeInTheDocument();
    expect(editor).toHaveTextContent("Cambio sin permisos");
  });
});
