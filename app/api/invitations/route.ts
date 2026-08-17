import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { sendTransactionalInvitationEmail } from "@/lib/invitation-email";
import type {
  ProjectInvitation,
  ProjectRole,
  TeamInvitation,
  TeamRole,
} from "@/lib/types";

type InvitationRow = {
  id: string;
  team_id: string;
  email: string;
  role: Exclude<TeamRole, "owner">;
  token: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
};

type ProjectInvitationRow = {
  id: string;
  project_id: string;
  team_id: string;
  email: string;
  role: ProjectRole;
  notify_on_new_tasks: boolean;
  token: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
};

type WorkspaceGroupInvitationRow = {
  id: string;
  group_id: string;
  email: string;
  token: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
};

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase no está configurado." },
      { status: 503 },
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  }

  const body = (await request.json()) as {
    workspaceId?: string;
    email?: string;
    role?: Exclude<TeamRole, "owner">;
    projectId?: string;
    projectRole?: ProjectRole;
    notifyOnNewTasks?: boolean;
    workspaceGroupId?: string;
  };
  const role = body.role ?? "agent";
  if (
    !body.workspaceId ||
    !body.email ||
    !["admin", "agent", "viewer"].includes(role)
  ) {
    return NextResponse.json(
      { error: "Datos de invitación inválidos." },
      { status: 400 },
    );
  }

  if (body.workspaceGroupId) {
    const { data, error } = await supabase.rpc("create_workspace_group_invitation", {
      candidate_group_id: body.workspaceGroupId,
      candidate_email: body.email,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 403 });
    const row = (Array.isArray(data) ? data[0] : data) as WorkspaceGroupInvitationRow;
    const groupName = await getTargetName("workspace_groups", row.group_id, "Equipo");
    const emailed = await sendInvitationEmail(
      request, row.email, row.token, "group", groupName, row.id,
    );
    return NextResponse.json({ groupInvitation: row, emailed });
  }

  if (body.projectId) {
    const projectRole = body.projectRole ?? "editor";
    if (!["admin", "editor", "commenter", "viewer"].includes(projectRole)) {
      return NextResponse.json(
        { error: "Nivel de acceso al proyecto inválido." },
        { status: 400 },
      );
    }
    const { data, error } = await supabase.rpc("create_project_invitation", {
      candidate_project_id: body.projectId,
      candidate_email: body.email,
      candidate_role: projectRole,
      candidate_notify_on_new_tasks: body.notifyOnNewTasks ?? true,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    const row = (Array.isArray(data) ? data[0] : data) as ProjectInvitationRow;
    const projectInvitation: ProjectInvitation = {
      id: row.id,
      projectId: row.project_id,
      workspaceId: row.team_id,
      email: row.email,
      role: row.role,
      notifyOnNewTasks: row.notify_on_new_tasks,
      token: row.token,
      createdAt: "Ahora",
      expiresAt: row.expires_at,
      acceptedAt: row.accepted_at,
    };
    const projectName = await getTargetName("projects", row.project_id, "Proyecto");
    const emailed = await sendInvitationEmail(
      request,
      row.email,
      row.token,
      "project",
      projectName,
      row.id,
    );
    return NextResponse.json({ projectInvitation, emailed });
  }

  const { data, error } = await supabase.rpc("create_team_invitation", {
    candidate_team_id: body.workspaceId,
    candidate_email: body.email,
    candidate_role: role,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  const row = (Array.isArray(data) ? data[0] : data) as InvitationRow;
  const invitation: TeamInvitation = {
    id: row.id,
    workspaceId: row.team_id,
    email: row.email,
    role: row.role,
    token: row.token,
    createdAt: "Ahora",
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at,
  };

  const workspaceName = await getTargetName("teams", row.team_id, "Espacio de trabajo");
  const emailed = await sendInvitationEmail(
    request,
    row.email,
    row.token,
    "workspace",
    workspaceName,
    row.id,
  );

  return NextResponse.json({ invitation, emailed });
}

async function sendInvitationEmail(
  request: Request,
  email: string,
  token: string,
  invitationKind: "workspace" | "project" | "group",
  targetName: string,
  invitationId: string,
) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) return false;
  const admin = createAdminClient(url, secret, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  const existingProfile = await admin
    .from("profiles")
    .select("id, deactivated_at")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  if (existingProfile.data?.deactivated_at) {
    const reactivated = await admin.auth.admin.updateUserById(
      existingProfile.data.id,
      { ban_duration: "none" },
    );
    if (reactivated.error) return false;
    const restored = await admin
      .from("profiles")
      .update({ deactivated_at: null, deactivated_by: null })
      .eq("id", existingProfile.data.id);
    if (restored.error) return false;
  }
  return sendTransactionalInvitationEmail({
    recipientEmail: email,
    invitationUrl: `${origin}/invite/${token}`,
    invitationKind,
    targetName,
    idempotencyKey: `taska-invitation-${invitationId}-${token}`,
  });
}

async function getTargetName(
  table: "teams" | "projects" | "workspace_groups",
  id: string,
  fallback: string,
) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) return fallback;
  const admin = createAdminClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const result = await admin.from(table).select("name").eq("id", id).maybeSingle();
  return (result.data as { name?: string } | null)?.name || fallback;
}
