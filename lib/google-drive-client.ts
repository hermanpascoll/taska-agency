import type { Task } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const GOOGLE_TOKEN_SESSION_KEY = "taska-google-drive-token-v2";
const GOOGLE_SCOPE_SESSION_KEY = "taska-google-drive-scope-v2";

type CachedGoogleToken = { value: string; expiresAt: number };

let cachedToken: CachedGoogleToken | null = null;

function readSessionToken() {
  if (cachedToken || typeof window === "undefined") return cachedToken;
  try {
    const stored = window.sessionStorage.getItem(GOOGLE_TOKEN_SESSION_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as CachedGoogleToken;
    if (parsed.value && parsed.expiresAt > Date.now() + 60_000) {
      cachedToken = parsed;
      return parsed;
    }
    window.sessionStorage.removeItem(GOOGLE_TOKEN_SESSION_KEY);
  } catch {
    window.sessionStorage.removeItem(GOOGLE_TOKEN_SESSION_KEY);
  }
  return null;
}

function writeSessionToken(token: CachedGoogleToken) {
  cachedToken = token;
  try {
    window.sessionStorage.setItem(GOOGLE_TOKEN_SESSION_KEY, JSON.stringify(token));
  } catch {
    // El token sigue disponible en memoria si sessionStorage está bloqueado.
  }
}

export function hasGoogleDriveToken() {
  const token = readSessionToken();
  return Boolean(token && token.expiresAt > Date.now() + 60_000);
}

export async function preloadGoogleDriveIdentityServices() {
  if (typeof window === "undefined") {
    throw new Error("Google Drive solo está disponible en el navegador.");
  }
  if (hasGoogleDriveToken()) return;
  if (window.sessionStorage.getItem(GOOGLE_SCOPE_SESSION_KEY) !== "pending") {
    return;
  }

  const supabase = createClient();
  if (!supabase) return;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const providerToken = data.session?.provider_token;
  if (!providerToken) return;

  writeSessionToken({
    value: providerToken,
    expiresAt: Date.now() + 55 * 60 * 1000,
  });
  window.sessionStorage.setItem(GOOGLE_SCOPE_SESSION_KEY, "granted");
}

export async function requestGoogleDriveToken() {
  const availableToken = readSessionToken();
  if (availableToken && availableToken.expiresAt > Date.now() + 60_000) {
    return availableToken.value;
  }
  throw new Error("Conectá Google Drive antes de adjuntar archivos.");
}

export async function connectGoogleDrive() {
  if (typeof window === "undefined") {
    throw new Error("Google Drive solo está disponible en el navegador.");
  }
  const supabase = createClient();
  if (!supabase) {
    throw new Error("La autenticación de Google no está configurada.");
  }

  const nextPath = `${window.location.pathname}${window.location.search}`;
  document.cookie = [
    `taska_auth_next=${encodeURIComponent(nextPath)}`,
    "Path=/",
    "Max-Age=600",
    "SameSite=Lax",
    window.location.protocol === "https:" ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
  window.sessionStorage.setItem(GOOGLE_SCOPE_SESSION_KEY, "pending");

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
      scopes: DRIVE_SCOPE,
      queryParams: {
        access_type: "offline",
        prompt: "consent select_account",
      },
    },
  });
  if (error) {
    window.sessionStorage.removeItem(GOOGLE_SCOPE_SESSION_KEY);
    throw error;
  }

  return new Promise<string>(() => undefined);
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
