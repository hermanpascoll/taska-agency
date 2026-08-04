import type { Task } from "@/lib/types";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const GOOGLE_SCRIPT_ID = "taska-google-identity-services";

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type GoogleTokenClient = {
  requestAccessToken(config?: { prompt?: string }): void;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (response: GoogleTokenResponse) => void;
            error_callback?: (error: { type?: string; message?: string }) => void;
          }): GoogleTokenClient;
        };
      };
    };
  }
}

let cachedToken: { value: string; expiresAt: number } | null = null;
let googleScriptPromise: Promise<void> | null = null;

function loadGoogleIdentityServices() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Drive solo está disponible en el navegador."));
  }
  if (window.google?.accounts.oauth2) return Promise.resolve();
  if (googleScriptPromise) return googleScriptPromise;

  googleScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(GOOGLE_SCRIPT_ID) as HTMLScriptElement | null;
    const script = existing ?? document.createElement("script");
    script.id = GOOGLE_SCRIPT_ID;
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("No se pudo cargar la autorización de Google."));
    if (!existing) document.head.appendChild(script);
  });
  return googleScriptPromise;
}

export async function requestGoogleDriveToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID;
  if (!clientId) {
    throw new Error("Google Drive todavía no está configurado para este entorno.");
  }
  await loadGoogleIdentityServices();

  return new Promise<string>((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: (response) => {
        if (!response.access_token) {
          reject(
            new Error(
              response.error_description || response.error || "Google no autorizó el acceso a Drive.",
            ),
          );
          return;
        }
        cachedToken = {
          value: response.access_token,
          expiresAt: Date.now() + Math.max(60, response.expires_in ?? 3600) * 1000,
        };
        resolve(response.access_token);
      },
      error_callback: (error) =>
        reject(new Error(error.message || "Se cerró la autorización de Google Drive.")),
    });
    client.requestAccessToken({ prompt: "" });
  });
}

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
  driveId: string,
) {
  const token = await requestGoogleDriveToken();
  const fields = [
    "id",
    "name",
    "mimeType",
    "size",
    "webViewLink",
    "webContentLink",
    "thumbnailLink",
    "createdTime",
  ].join(",");
  const session = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=${encodeURIComponent(fields)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": file.type || "application/octet-stream",
        "X-Upload-Content-Length": String(file.size),
      },
      body: JSON.stringify({
        name: file.name,
        parents: [driveId],
        description: `Taska · ${task.code} · ${task.title}`,
        appProperties: {
          taskaTaskId: task.id,
          taskaWorkspaceId: task.project.workspaceId,
          taskaProjectId: task.project.id,
        },
      }),
    },
  );
  if (!session.ok) {
    const detail = await session.text();
    throw new Error(`Drive no pudo iniciar la carga (${session.status}). ${detail}`);
  }
  const uploadUrl = session.headers.get("location");
  if (!uploadUrl) throw new Error("Drive no devolvió una sesión de carga válida.");

  const upload = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": file.type || "application/octet-stream",
      "Content-Length": String(file.size),
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
