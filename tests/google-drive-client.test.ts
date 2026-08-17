import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadTaskFileToGoogleDrive } from "@/lib/google-drive-client";
import type { Task } from "@/lib/types";

const task = {
  id: "task-1",
  code: "AG-001",
  title: "Prueba de carga",
} as Task;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("automatic Google Drive uploads", () => {
  it("requests a server session and uploads without a user Drive token", async () => {
    const driveFile = {
      id: "drive-file-1",
      name: "brief.pdf",
      mimeType: "application/pdf",
      size: "4",
      webViewLink: "https://drive.google.com/file/d/drive-file-1/view",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ uploadUrl: "https://upload.example/session" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(driveFile), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const file = new File(["test"], "brief.pdf", { type: "application/pdf" });

    await expect(uploadTaskFileToGoogleDrive(task, file)).resolves.toEqual(
      driveFile,
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/drive-uploads",
      expect.objectContaining({ method: "POST" }),
    );
    const uploadRequest = fetchMock.mock.calls[1][1] as RequestInit;
    expect(uploadRequest.method).toBe("PUT");
    expect(uploadRequest.headers).not.toHaveProperty("Authorization");
    expect(uploadRequest.body).toBe(file);
  });

  it("surfaces the server authorization error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Sin permiso para adjuntar." }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const file = new File(["test"], "brief.pdf", { type: "application/pdf" });

    await expect(uploadTaskFileToGoogleDrive(task, file)).rejects.toThrow(
      "Sin permiso para adjuntar.",
    );
  });
});
