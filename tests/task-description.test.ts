import { describe, expect, it } from "vitest";
import {
  appendDescriptionAttachments,
  parseTaskDescription,
  serializeTaskDescription,
  taskDescriptionPlainText,
} from "@/lib/task-description";
import type { TaskAttachment } from "@/lib/types";

const attachment = {
  id: "image-1",
  taskId: "task-1",
  name: "referencia.png",
  size: 1024,
  mimeType: "image/png",
  storagePath: null,
  createdAt: "Ahora",
  uploader: {
    id: "user-1",
    name: "Martina",
    email: "martina@example.com",
    role: "Diseño",
    initials: "MS",
    color: "#5b4bec",
  },
} satisfies TaskAttachment;

describe("documento enriquecido de la tarea", () => {
  it("conserva una imagen entre dos bloques de texto", () => {
    const serialized = serializeTaskDescription([
      { type: "text", text: "Contexto de la campaña" },
      { type: "attachment", attachmentId: "image-1" },
      { type: "text", text: "Usar esta referencia como guía" },
    ]);

    expect(parseTaskDescription(serialized, [attachment])).toEqual([
      { type: "text", text: "Contexto de la campaña" },
      { type: "attachment", attachmentId: "image-1" },
      { type: "text", text: "Usar esta referencia como guía" },
    ]);
    expect(taskDescriptionPlainText(serialized)).toBe(
      "Contexto de la campaña\n\nUsar esta referencia como guía",
    );
  });

  it("integra adjuntos anteriores que todavía no tenían posición", () => {
    expect(parseTaskDescription("Brief existente", [attachment])).toEqual([
      { type: "text", text: "Brief existente" },
      { type: "attachment", attachmentId: "image-1" },
    ]);
    expect(
      appendDescriptionAttachments("Brief existente", ["image-1"]),
    ).toContain("{{taska-attachment:image-1}}");
  });
});
