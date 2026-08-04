import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { TeamInvitation, TeamRole } from "@/lib/types";

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

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  let emailed = false;
  if (url && secret) {
    const admin = createAdminClient(url, secret, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
    const origin =
      process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
    const inviteResult = await admin.auth.admin.inviteUserByEmail(row.email, {
      redirectTo: `${origin}/invite/${row.token}`,
      data: { workspace_invitation_token: row.token },
    });
    emailed = !inviteResult.error;
  }

  return NextResponse.json({ invitation, emailed });
}
