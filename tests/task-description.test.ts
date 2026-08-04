import { describe, expect, it } from "vitest";
import {
  appendDescriptionAttachments,
  parseTaskDescription,
  serializeTaskDescription,
  taskDescriptionPlainText,
} from "@/lib/task-description";
import { legacyDescriptionToHtml } from "@/lib/rich-text-description";
import {
  descriptionWithUploadedImages,
  descriptionWithoutDraftImages,
} from "@/lib/pending-task-description";
import { linkProviderForUrl } from "@/lib/link-provider";
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

  it("mantiene los adjuntos comunes fuera del documento hasta que se insertan", () => {
    expect(parseTaskDescription("Brief existente", [attachment])).toEqual([
      { type: "text", text: "Brief existente" },
    ]);
    expect(
      appendDescriptionAttachments("Brief existente", ["image-1"]),
    ).toContain("{{taska-attachment:image-1}}");
  });

  it("convierte el contenido anterior en un documento texto-imagen-texto", () => {
    const description = serializeTaskDescription([
      { type: "text", text: "**Mensaje principal**" },
      { type: "attachment", attachmentId: "image-1" },
      { type: "text", text: "Cierre del brief" },
    ]);
    const html = legacyDescriptionToHtml(
      description,
      [attachment],
      new Map([["image-1", "data:image/png;base64,aGVsbG8="]]),
    );

    expect(html).toContain("<strong>Mensaje principal</strong>");
    expect(html).toContain('data-attachment-id="image-1"');
    expect(html.indexOf("Mensaje principal")).toBeLessThan(html.indexOf("<img"));
    expect(html.indexOf("<img")).toBeLessThan(html.indexOf("Cierre del brief"));
  });

  it("extrae texto legible de una descripción HTML", () => {
    expect(
      taskDescriptionPlainText(
        "<h2>Objetivo</h2><p>Texto <strong>importante</strong></p><ul><li>Entrega</li></ul>",
      ),
    ).toBe("Objetivo\nTexto importante\n• Entrega");
  });

  it("reemplaza imágenes temporales sin alterar su posición en el documento", () => {
    const draft =
      '<p>Antes</p><img src="data:image/png;base64,abc" data-attachment-id="draft-1"><p>Después</p>';
    const persisted = descriptionWithUploadedImages(
      draft,
      new Set(["draft-1"]),
      new Map([
        [
          "draft-1",
          { attachmentId: "image-remote", src: "https://files.test/image.png" },
        ],
      ]),
    );

    expect(persisted).toContain('data-attachment-id="image-remote"');
    expect(persisted).toContain('src="https://files.test/image.png"');
    expect(persisted.indexOf("Antes")).toBeLessThan(persisted.indexOf("<img"));
    expect(persisted.indexOf("<img")).toBeLessThan(persisted.indexOf("Después"));
    expect(persisted).not.toContain("base64");
  });

  it("retira la imagen temporal antes de crear la tarea inicial", () => {
    const draft =
      '<p>Antes</p><img src="data:image/png;base64,abc" data-attachment-id="draft-1"><p>Después</p>';
    const initial = descriptionWithoutDraftImages(
      draft,
      new Set(["draft-1"]),
    );

    expect(initial).toContain("Antes");
    expect(initial).toContain("Después");
    expect(initial).not.toContain("base64");
    expect(initial).not.toContain("draft-1");
  });

  it("identifica el origen de enlaces conocidos", () => {
    expect(linkProviderForUrl("https://drive.google.com/file/d/123")).toBe(
      "drive",
    );
    expect(linkProviderForUrl("https://docs.google.com/document/d/123")).toBe(
      "drive",
    );
    expect(linkProviderForUrl("https://youtu.be/abc123")).toBe("youtube");
    expect(linkProviderForUrl("https://www.youtube.com/watch?v=abc123")).toBe(
      "youtube",
    );
    expect(linkProviderForUrl("https://example.com/reference")).toBeNull();
  });
});
