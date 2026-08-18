import { NextResponse } from "next/server";
import { processDriveMembershipJobs } from "@/lib/google-drive-membership";
import { createPlatformAdminClient } from "@/lib/platform-admin";
import { createClient } from "@/lib/supabase/server";
import type { TeamRole } from "@/lib/types";

async function authenticatedClients() {
  const supabase = await createClient();
  const admin = createPlatformAdminClient();
  if (!supabase || !admin) return { error: "Taska no está configurado.", status: 503 } as const;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { error: "Sesión requerida.", status: 401 } as const;
  return { supabase, admin, user: data.user } as const;
}

export async function POST() {
  const context = await authenticatedClients();
  if ("error" in context) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const memberships = await context.supabase
    .from("team_members")
    .select("team_id, role, project_limited, can_administer")
    .eq("user_id", context.user.id);
  if (memberships.error) {
    return NextResponse.json({ error: memberships.error.message }, { status: 400 });
  }
  const administeredTeamIds = (memberships.data ?? [])
    .filter(
      (member) =>
        !member.project_limited &&
        (member.role === "owner" || member.can_administer),
    )
    .map((member) => member.team_id);

  const own = await processDriveMembershipJobs(context.admin, {
    userId: context.user.id,
    limit: 20,
  });
  const managed = administeredTeamIds.length
    ? await processDriveMembershipJobs(context.admin, {
        teamIds: administeredTeamIds,
        limit: 100,
      })
    : { configured: own.configured, processed: 0, failed: 0 };
  return NextResponse.json({
    configured: own.configured,
    processed: own.processed + managed.processed,
    failed: own.failed + managed.failed,
  });
}

export async function PATCH(request: Request) {
  const context = await authenticatedClients();
  if ("error" in context) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }
  const body = (await request.json()) as {
    workspaceId?: string;
    userId?: string;
    role?: TeamRole;
  };
  if (
    !body.workspaceId ||
    !body.userId ||
    !body.role ||
    !["owner", "admin", "controller", "agent", "viewer"].includes(
      body.role,
    )
  ) {
    return NextResponse.json({ error: "Datos de rol inválidos." }, { status: 400 });
  }
  const updated = await context.supabase.rpc("update_member_role", {
    candidate_team_id: body.workspaceId,
    candidate_user_id: body.userId,
    candidate_role: body.role,
  });
  if (updated.error) {
    return NextResponse.json({ error: updated.error.message }, { status: 403 });
  }
  const drive = await processDriveMembershipJobs(context.admin, {
    userId: body.userId,
    teamIds: [body.workspaceId],
    limit: 1,
  });
  return NextResponse.json({ ok: true, drive });
}


export async function DELETE(request: Request) {
  const context = await authenticatedClients();
  if ("error" in context) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }
  const body = (await request.json()) as {
    workspaceId?: string;
    userId?: string;
  };
  if (!body.workspaceId || !body.userId) {
    return NextResponse.json({ error: "Integrante inválido." }, { status: 400 });
  }
  const removed = await context.supabase.rpc("remove_team_member", {
    candidate_team_id: body.workspaceId,
    candidate_user_id: body.userId,
  });
  if (removed.error) {
    return NextResponse.json({ error: removed.error.message }, { status: 403 });
  }
  const drive = await processDriveMembershipJobs(context.admin, {
    userId: body.userId,
    teamIds: [body.workspaceId],
    limit: 1,
  });
  return NextResponse.json({ ok: true, drive });
}
