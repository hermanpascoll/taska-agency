import "server-only";

import { createSign } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { googleDriveRoleForTeamRole } from "@/lib/google-drive-roles";
import type { TeamRole } from "@/lib/types";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const DRIVE_API = "https://www.googleapis.com/drive/v3";

type DrivePermission = {
  id: string;
  emailAddress?: string;
  type: "user" | "group" | "domain" | "anyone";
  role: string;
  deleted?: boolean;
};

export type DriveMembershipSyncJob = {
  team_id: string;
  user_id: string;
  email: string;
  drive_id: string;
  desired_action: "upsert" | "remove";
  desired_role: TeamRole | null;
  permission_id: string | null;
  attempts: number;
};

let cachedAccessToken: { value: string; expiresAt: number } | null = null;

function base64Url(value: string) {
  return Buffer.from(value).toString("base64url");
}

export function googleDriveMembershipConfigured() {
  return Boolean(
    process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL &&
      process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_PRIVATE_KEY &&
      process.env.GOOGLE_WORKSPACE_ADMIN_EMAIL,
  );
}

async function getGoogleAccessToken() {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.value;
  }

  const serviceAccountEmail = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(
    /\\n/g,
    "\n",
  );
  const delegatedAdmin = process.env.GOOGLE_WORKSPACE_ADMIN_EMAIL;
  if (!serviceAccountEmail || !privateKey || !delegatedAdmin) {
    throw new Error("La sincronización de integrantes con Google Drive no está configurada.");
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(
    JSON.stringify({
      iss: serviceAccountEmail,
      sub: delegatedAdmin,
      scope: DRIVE_SCOPE,
      aud: TOKEN_ENDPOINT,
      iat: issuedAt,
      exp: issuedAt + 3600,
    }),
  );
  const unsigned = `${header}.${claims}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const assertion = `${unsigned}.${signer.sign(privateKey, "base64url")}`;

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const result = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
  };
  if (!response.ok || !result.access_token) {
    throw new Error(result.error_description || "Google no autorizó la cuenta de servicio.");
  }

  cachedAccessToken = {
    value: result.access_token,
    expiresAt: Date.now() + (result.expires_in ?? 3600) * 1000,
  };
  return cachedAccessToken.value;
}

export async function createGoogleDriveUploadSession(input: {
  driveId: string;
  fileName: string;
  mimeType: string;
  size: number;
  taskId: string;
  taskCode: string;
  taskTitle: string;
  workspaceId: string;
  projectId: string;
  origin: string;
}) {
  const accessToken = await getGoogleAccessToken();
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
  const query = new URLSearchParams({
    uploadType: "resumable",
    supportsAllDrives: "true",
    fields,
  });
  const response = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files?${query}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Origin: input.origin,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": input.mimeType,
        "X-Upload-Content-Length": String(input.size),
      },
      body: JSON.stringify({
        name: input.fileName,
        parents: [input.driveId],
        description: `Taska · ${input.taskCode} · ${input.taskTitle}`,
        appProperties: {
          taskaTaskId: input.taskId,
          taskaWorkspaceId: input.workspaceId,
          taskaProjectId: input.projectId,
        },
      }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Google Drive no pudo iniciar la carga (${response.status}). ${detail}`,
    );
  }
  const uploadUrl = response.headers.get("location");
  if (!uploadUrl) {
    throw new Error("Google Drive no devolvió una sesión de carga válida.");
  }
  return uploadUrl;
}

async function googleDriveRequest(path: string, init: RequestInit = {}) {
  const accessToken = await getGoogleAccessToken();
  const response = await fetch(`${DRIVE_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Google Drive rechazó la sincronización (${response.status}). ${detail}`);
  }
  return response;
}

async function listDrivePermissions(driveId: string) {
  const permissions: DrivePermission[] = [];
  let pageToken: string | undefined;
  do {
    const query = new URLSearchParams({
      supportsAllDrives: "true",
      useDomainAdminAccess: "true",
      pageSize: "100",
      fields: "nextPageToken,permissions(id,emailAddress,type,role,deleted)",
    });
    if (pageToken) query.set("pageToken", pageToken);
    const response = await googleDriveRequest(
      `/files/${encodeURIComponent(driveId)}/permissions?${query}`,
    );
    const result = (await response.json()) as {
      permissions?: DrivePermission[];
      nextPageToken?: string;
    };
    permissions.push(...(result.permissions ?? []));
    pageToken = result.nextPageToken;
  } while (pageToken);
  return permissions;
}

async function applyDriveMembership(job: DriveMembershipSyncJob) {
  const permissions = await listDrivePermissions(job.drive_id);
  const matching = permissions.filter(
    (permission) =>
      permission.type === "user" &&
      !permission.deleted &&
      permission.emailAddress?.toLowerCase() === job.email.toLowerCase(),
  );

  if (job.desired_action === "remove") {
    for (const permission of matching) {
      await googleDriveRequest(
        `/files/${encodeURIComponent(job.drive_id)}/permissions/${encodeURIComponent(permission.id)}?supportsAllDrives=true&useDomainAdminAccess=true`,
        { method: "DELETE" },
      );
    }
    return null;
  }

  if (!job.desired_role) throw new Error("El rol de Drive no está definido.");
  const desiredRole = googleDriveRoleForTeamRole(job.desired_role);
  const permission = matching[0];
  if (!permission) {
    const response = await googleDriveRequest(
      `/files/${encodeURIComponent(job.drive_id)}/permissions?supportsAllDrives=true&useDomainAdminAccess=true&sendNotificationEmail=false&fields=id,emailAddress,role`,
      {
        method: "POST",
        body: JSON.stringify({
          type: "user",
          role: desiredRole,
          emailAddress: job.email,
        }),
      },
    );
    const created = (await response.json()) as DrivePermission;
    return created.id;
  }

  if (permission.role !== desiredRole) {
    await googleDriveRequest(
      `/files/${encodeURIComponent(job.drive_id)}/permissions/${encodeURIComponent(permission.id)}?supportsAllDrives=true&useDomainAdminAccess=true&fields=id,role`,
      { method: "PATCH", body: JSON.stringify({ role: desiredRole }) },
    );
  }
  return permission.id;
}

export async function processDriveMembershipJobs(
  admin: SupabaseClient,
  options: { userId?: string; teamIds?: string[]; limit?: number } = {},
) {
  if (!googleDriveMembershipConfigured()) {
    return { configured: false, processed: 0, failed: 0 };
  }

  let query = admin
    .from("google_drive_membership_sync_jobs")
    .select(
      "team_id, user_id, email, drive_id, desired_action, desired_role, permission_id, attempts",
    )
    .is("synced_at", null)
    .order("updated_at", { ascending: true })
    .limit(options.limit ?? 100);
  if (options.userId) query = query.eq("user_id", options.userId);
  if (options.teamIds?.length) query = query.in("team_id", options.teamIds);
  const pending = await query;
  if (pending.error) throw pending.error;

  let processed = 0;
  let failed = 0;
  for (const job of (pending.data ?? []) as DriveMembershipSyncJob[]) {
    try {
      const permissionId = await applyDriveMembership(job);
      const saved = await admin
        .from("google_drive_membership_sync_jobs")
        .update({
          permission_id: permissionId,
          synced_at: new Date().toISOString(),
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("team_id", job.team_id)
        .eq("user_id", job.user_id)
        .eq("drive_id", job.drive_id)
        .eq("desired_action", job.desired_action);
      if (saved.error) throw saved.error;
      processed += 1;
    } catch (error) {
      failed += 1;
      await admin
        .from("google_drive_membership_sync_jobs")
        .update({
          attempts: job.attempts + 1,
          last_error:
            error instanceof Error ? error.message.slice(0, 2000) : "Error desconocido",
          updated_at: new Date().toISOString(),
        })
        .eq("team_id", job.team_id)
        .eq("user_id", job.user_id)
        .eq("drive_id", job.drive_id);
    }
  }
  return { configured: true, processed, failed };
}
