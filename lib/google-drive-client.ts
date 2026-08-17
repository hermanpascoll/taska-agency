import type { Task } from "@/lib/types";

export type GoogleDriveUpload = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  webViewLink?: string;
  webContentLink?: string;
  thumbnailLink?: string;
  createdTime?: string;
};

export async function uploadTaskFileToGoogleDrive(
  task: Task,
  file: File,
) {
  const session = await fetch("/api/drive-uploads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      taskId: task.id,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
    }),
  });
  if (!session.ok) {
    const detail = (await session.json().catch(() => ({}))) as { error?: string };
    throw new Error(detail.error || `Drive no pudo iniciar la carga (${session.status}).`);
  }
  const { uploadUrl } = (await session.json()) as { uploadUrl?: string };
  if (!uploadUrl) {
    throw new Error("Drive no devolvió una sesión de carga válida.");
  }

  const upload = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
    },
    body: file,
  });
  if (!upload.ok) {
    const detail = await upload.text();
    throw new Error(`Drive no pudo completar la carga (${upload.status}). ${detail}`);
  }
  return (await upload.json()) as GoogleDriveUpload;
}

export function googleDrivePreviewUrl(fileId: string) {
  return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`;
}

export function googleDriveImageUrl(fileId: string) {
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w1600`;
}
