import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import type {
  PlatformAdminOverview,
  PlatformAdminUser,
  PlatformAdminWorkspace,
  WorkspaceRolePermissions,
} from "@/lib/admin-types";
import {
  createPlatformAdminClient,
  getPlatformAdminAccess,
  isPlatformAdminEmail,
} from "@/lib/platform-admin";
import type { TeamRole } from "@/lib/types";

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  avatar_url: string | null;
  created_at: string;
  last_seen_at: string | null;
};

type WorkspaceRow = {
  id: string;
  name: string;
  slug: string;
  created_by: string;
  archived: boolean;
  currency: string;
  created_at: string;
};

type MembershipRow = {
  team_id: string;
  user_id: string;
  role: TeamRole;
  project_limited: boolean;
};

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

type PlatformAdminRow = {
  user_id: string;
};

type RolePermissionRow = {
  team_id: string;
  role: TeamRole;
  can_administer: boolean;
  can_manage_billing: boolean;
  can_track_time: boolean;
  can_audit_time: boolean;
};

function defaultRolePermissions(): WorkspaceRolePermissions {
  return {
    owner: { administer: true, billing: true, trackTime: true, auditTime: true },
    admin: { administer: true, billing: true, trackTime: true, auditTime: true },
    agent: { administer: false, billing: false, trackTime: true, auditTime: false },
    viewer: { administer: false, billing: false, trackTime: false, auditTime: false },
  };
}

function isSuspended(user: User) {
  return Boolean(
    user.banned_until && new Date(user.banned_until).getTime() > Date.now(),
  );
}

async function authorize() {
  const access = await getPlatformAdminAccess();
  if (!access.user) {
    return {
      response: NextResponse.json(
        { error: "Sesión requerida." },
        { status: 401 },
      ),
      admin: null,
      user: null,
    };
  }
  if (!access.isAdmin) {
    return {
      response: NextResponse.json(
        { error: "Acceso de administrador requerido." },
        { status: 403 },
      ),
      admin: null,
      user: access.user,
    };
  }

  const admin = createPlatformAdminClient();
  if (!admin) {
    return {
      response: NextResponse.json(
        { error: "La administración global no está configurada." },
        { status: 503 },
      ),
      admin: null,
      user: access.user,
    };
  }

  return { response: null, admin, user: access.user };
}

export async function GET() {
  const authorization = await authorize();
  if (
    authorization.response ||
    !authorization.admin ||
    !authorization.user
  ) {
    return authorization.response;
  }
  const admin = authorization.admin;

  const [
    authUsersResult,
    profilesResult,
    workspacesResult,
    membershipsResult,
    projectsResult,
    tasksResult,
    invitationsResult,
    platformAdminsResult,
    rolePermissionsResult,
  ] = await Promise.all([
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    admin
      .from("profiles")
      .select("id, full_name, email, role, avatar_url, created_at, last_seen_at"),
    admin
      .from("teams")
      .select("id, name, slug, created_by, archived, currency, created_at"),
    admin
      .from("team_members")
      .select("team_id, user_id, role, project_limited"),
    admin.from("projects").select("id, team_id"),
    admin.from("tasks").select("id, team_id"),
    admin
      .from("team_invitations")
      .select(
        "id, team_id, email, role, token, created_at, expires_at, accepted_at",
      ),
    admin.from("platform_admins").select("user_id"),
    admin
      .from("team_role_permissions")
      .select(
        "team_id, role, can_administer, can_manage_billing, can_track_time, can_audit_time",
      ),
  ]);

  const firstError =
    authUsersResult.error ??
    profilesResult.error ??
    workspacesResult.error ??
    membershipsResult.error ??
    projectsResult.error ??
    tasksResult.error ??
    invitationsResult.error ??
    platformAdminsResult.error ??
    rolePermissionsResult.error;
  if (firstError) {
    return NextResponse.json({ error: firstError.message }, { status: 500 });
  }

  const profiles = (profilesResult.data ?? []) as ProfileRow[];
  const workspaces = (workspacesResult.data ?? []) as WorkspaceRow[];
  const memberships = (membershipsResult.data ?? []) as MembershipRow[];
  const invitations = (invitationsResult.data ?? []) as InvitationRow[];
  const platformAdmins = (platformAdminsResult.data ?? []) as PlatformAdminRow[];
  const rolePermissions = (rolePermissionsResult.data ?? []) as RolePermissionRow[];
  const platformAdminIds = new Set(
    platformAdmins.map((platformAdmin) => platformAdmin.user_id),
  );
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const workspaceById = new Map(
    workspaces.map((workspace) => [workspace.id, workspace]),
  );

  const users: PlatformAdminUser[] = authUsersResult.data.users
    .map((user) => {
      const profile = profileById.get(user.id);
      return {
        id: user.id,
        name:
          profile?.full_name ||
          String(user.user_metadata?.full_name ?? "") ||
          user.email?.split("@")[0] ||
          "Sin nombre",
        email: profile?.email || user.email || "Sin correo",
        title: profile?.role || "Equipo creativo",
        avatarUrl:
          profile?.avatar_url ||
          String(user.user_metadata?.avatar_url ?? user.user_metadata?.picture ?? "") ||
          null,
        superAdmin:
          isPlatformAdminEmail(profile?.email || user.email) ||
          platformAdminIds.has(user.id),
        rootAdmin: isPlatformAdminEmail(profile?.email || user.email),
        createdAt: user.created_at,
        lastSignInAt: user.last_sign_in_at ?? null,
        lastSeenAt: profile?.last_seen_at ?? null,
        online: Boolean(
          profile?.last_seen_at &&
            Date.now() - new Date(profile.last_seen_at).getTime() < 120_000,
        ),
        providers: Array.isArray(user.app_metadata?.providers)
          ? user.app_metadata.providers.map(String)
          : [],
        suspended: isSuspended(user),
        memberships: memberships
          .filter((membership) => membership.user_id === user.id)
          .map((membership) => ({
            workspaceId: membership.team_id,
            workspaceName:
              workspaceById.get(membership.team_id)?.name ??
              "Espacio eliminado",
            role: membership.role,
            projectLimited: membership.project_limited,
          }))
          .sort((a, b) => a.workspaceName.localeCompare(b.workspaceName)),
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const projectCountByWorkspace = (projectsResult.data ?? []).reduce(
    (counts, project) => {
      counts[project.team_id] = (counts[project.team_id] ?? 0) + 1;
      return counts;
    },
    {} as Record<string, number>,
  );
  const taskCountByWorkspace = (tasksResult.data ?? []).reduce(
    (counts, task) => {
      counts[task.team_id] = (counts[task.team_id] ?? 0) + 1;
      return counts;
    },
    {} as Record<string, number>,
  );

  const adminWorkspaces: PlatformAdminWorkspace[] = workspaces
    .map((workspace) => {
      const workspaceMemberships = memberships.filter(
        (membership) => membership.team_id === workspace.id,
      );
      const ownerMembership =
        workspaceMemberships.find((membership) => membership.role === "owner") ??
        workspaceMemberships.find(
          (membership) => membership.user_id === workspace.created_by,
        );
      const owner = ownerMembership
        ? profileById.get(ownerMembership.user_id)
        : profileById.get(workspace.created_by);

      return {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        archived: workspace.archived,
        currency: workspace.currency || "USD",
        createdAt: workspace.created_at,
        ownerName: owner?.full_name || "Sin responsable",
        ownerEmail: owner?.email || "Sin correo",
        memberCount: workspaceMemberships.length,
        projectCount: projectCountByWorkspace[workspace.id] ?? 0,
        taskCount: taskCountByWorkspace[workspace.id] ?? 0,
        members: workspaceMemberships
          .map((membership) => {
            const profile = profileById.get(membership.user_id);
            return {
              userId: membership.user_id,
              name: profile?.full_name || "Sin nombre",
              email: profile?.email || "Sin correo",
              title: profile?.role || "Equipo creativo",
              avatarUrl: profile?.avatar_url ?? null,
              role: membership.role,
              projectLimited: membership.project_limited,
              online: Boolean(
                profile?.last_seen_at &&
                  Date.now() - new Date(profile.last_seen_at).getTime() <
                    120_000,
              ),
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name)),
        invitations: invitations
          .filter(
            (invitation) =>
              invitation.team_id === workspace.id &&
              !invitation.accepted_at &&
              new Date(invitation.expires_at).getTime() > Date.now(),
          )
          .map((invitation) => ({
            id: invitation.id,
            email: invitation.email,
            role: invitation.role,
            token: invitation.token,
            createdAt: invitation.created_at,
            expiresAt: invitation.expires_at,
          }))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        rolePermissions: rolePermissions
          .filter((permission) => permission.team_id === workspace.id)
          .reduce((permissions, permission) => {
            permissions[permission.role] = {
              administer: permission.can_administer,
              billing: permission.can_manage_billing,
              trackTime: permission.can_track_time,
              auditTime: permission.can_audit_time,
            };
            return permissions;
          }, defaultRolePermissions()),
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const overview: PlatformAdminOverview = {
    currentUserId: authorization.user.id,
    generatedAt: new Date().toISOString(),
    users,
    workspaces: adminWorkspaces,
  };
  return NextResponse.json(overview);
}

export async function PATCH(request: Request) {
  const authorization = await authorize();
  if (
    authorization.response ||
    !authorization.admin ||
    !authorization.user
  ) {
    return authorization.response;
  }
  const admin = authorization.admin;
  const body = (await request.json()) as {
    action?:
      | "user-status"
      | "superadmin-status"
      | "membership-role"
      | "workspace-member-remove"
      | "workspace-invite"
      | "invitation-revoke"
      | "workspace-status"
      | "role-permissions"
      | "profile";
    userId?: string;
    workspaceId?: string;
    invitationId?: string;
    suspended?: boolean;
    superAdmin?: boolean;
    archived?: boolean;
    role?: TeamRole | string;
    name?: string;
    title?: string;
    email?: string;
    permissions?: {
      administer?: boolean;
      billing?: boolean;
      trackTime?: boolean;
      auditTime?: boolean;
    };
  };

  if (
    body.action === "role-permissions" &&
    body.workspaceId &&
    body.role &&
    ["admin", "agent", "viewer"].includes(body.role) &&
    body.permissions
  ) {
    const permissions = body.permissions;
    if (
      [
        permissions.administer,
        permissions.billing,
        permissions.trackTime,
        permissions.auditTime,
      ].some((value) => typeof value !== "boolean")
    ) {
      return NextResponse.json(
        { error: "La configuración de permisos está incompleta." },
        { status: 400 },
      );
    }
    const result = await admin.from("team_role_permissions").upsert(
      {
        team_id: body.workspaceId,
        role: body.role,
        can_administer: permissions.administer,
        can_manage_billing: permissions.billing,
        can_track_time: permissions.trackTime,
        can_audit_time: permissions.auditTime,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "team_id,role" },
    );
    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  if (body.action === "user-status" && body.userId) {
    const target = await admin.auth.admin.getUserById(body.userId);
    if (target.error) {
      return NextResponse.json(
        { error: target.error.message },
        { status: 404 },
      );
    }
    const persistentAdmin = await admin
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", body.userId)
      .maybeSingle();
    if (
      isPlatformAdminEmail(target.data.user.email) ||
      Boolean(persistentAdmin.data)
    ) {
      return NextResponse.json(
        { error: "No se puede suspender a un superadministrador." },
        { status: 400 },
      );
    }
    const result = await admin.auth.admin.updateUserById(body.userId, {
      ban_duration: body.suspended ? "876000h" : "none",
    });
    if (result.error) {
      return NextResponse.json(
        { error: result.error.message },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true });
  }

  if (
    body.action === "superadmin-status" &&
    body.userId &&
    typeof body.superAdmin === "boolean"
  ) {
    const target = await admin.auth.admin.getUserById(body.userId);
    if (target.error) {
      return NextResponse.json(
        { error: "El usuario no existe." },
        { status: 404 },
      );
    }
    if (!body.superAdmin && isPlatformAdminEmail(target.data.user.email)) {
      return NextResponse.json(
        {
          error:
            "El administrador raíz se gestiona desde la configuración del servidor.",
        },
        { status: 400 },
      );
    }
    if (!body.superAdmin && body.userId === authorization.user.id) {
      return NextResponse.json(
        { error: "No podés quitarte tu propio acceso global." },
        { status: 400 },
      );
    }

    const result = body.superAdmin
      ? await admin.from("platform_admins").upsert({
          user_id: body.userId,
          granted_by: authorization.user.id,
        })
      : await admin
          .from("platform_admins")
          .delete()
          .eq("user_id", body.userId);
    if (result.error) {
      return NextResponse.json(
        { error: result.error.message },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true });
  }

  if (
    body.action === "membership-role" &&
    body.userId &&
    body.workspaceId &&
    body.role &&
    ["owner", "admin", "agent", "viewer"].includes(body.role)
  ) {
    const current = await admin
      .from("team_members")
      .select("role")
      .eq("team_id", body.workspaceId)
      .eq("user_id", body.userId)
      .single();
    if (current.error) {
      return NextResponse.json(
        { error: "La membresía no existe." },
        { status: 404 },
      );
    }
    if (current.data.role === "owner" && body.role !== "owner") {
      const owners = await admin
        .from("team_members")
        .select("user_id", { count: "exact", head: true })
        .eq("team_id", body.workspaceId)
        .eq("role", "owner");
      if ((owners.count ?? 0) <= 1) {
        return NextResponse.json(
          { error: "El espacio debe conservar al menos un propietario." },
          { status: 400 },
        );
      }
    }
    const result = await admin
      .from("team_members")
      .update({ role: body.role, project_limited: false })
      .eq("team_id", body.workspaceId)
      .eq("user_id", body.userId);
    if (result.error) {
      return NextResponse.json(
        { error: result.error.message },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true });
  }

  if (
    body.action === "workspace-member-remove" &&
    body.workspaceId &&
    body.userId
  ) {
    const membership = await admin
      .from("team_members")
      .select("role")
      .eq("team_id", body.workspaceId)
      .eq("user_id", body.userId)
      .single();
    if (membership.error) {
      return NextResponse.json(
        { error: "La membresía no existe." },
        { status: 404 },
      );
    }
    if (membership.data.role === "owner") {
      const owners = await admin
        .from("team_members")
        .select("user_id", { count: "exact", head: true })
        .eq("team_id", body.workspaceId)
        .eq("role", "owner");
      if ((owners.count ?? 0) <= 1) {
        return NextResponse.json(
          { error: "El espacio debe conservar al menos un propietario." },
          { status: 400 },
        );
      }
    }
    const result = await admin
      .from("team_members")
      .delete()
      .eq("team_id", body.workspaceId)
      .eq("user_id", body.userId);
    if (result.error) {
      return NextResponse.json(
        { error: result.error.message },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true });
  }

  if (
    body.action === "workspace-invite" &&
    body.workspaceId &&
    body.email?.trim() &&
    body.role &&
    ["admin", "agent", "viewer"].includes(body.role)
  ) {
    const email = body.email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json(
        { error: "Ingresá un correo válido." },
        { status: 400 },
      );
    }
    const workspace = await admin
      .from("teams")
      .select("id")
      .eq("id", body.workspaceId)
      .single();
    if (workspace.error) {
      return NextResponse.json(
        { error: "El espacio no existe." },
        { status: 404 },
      );
    }
    const existingProfile = await admin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (existingProfile.data) {
      const existingMembership = await admin
        .from("team_members")
        .select("user_id")
        .eq("team_id", body.workspaceId)
        .eq("user_id", existingProfile.data.id)
        .maybeSingle();
      if (existingMembership.data) {
        return NextResponse.json(
          { error: "La persona ya integra este espacio." },
          { status: 400 },
        );
      }
    }

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const invitationResult = await admin
      .from("team_invitations")
      .upsert(
        {
          team_id: body.workspaceId,
          email,
          role: body.role,
          token,
          invited_by: authorization.user.id,
          created_at: new Date().toISOString(),
          expires_at: expiresAt,
          accepted_at: null,
        },
        { onConflict: "team_id,email" },
      )
      .select("id, token")
      .single();
    if (invitationResult.error) {
      return NextResponse.json(
        { error: invitationResult.error.message },
        { status: 400 },
      );
    }

    const origin =
      process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
    const invitationUrl = `${origin}/invite/${invitationResult.data.token}`;
    const emailResult = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: invitationUrl,
      data: { workspace_invitation_token: invitationResult.data.token },
    });
    return NextResponse.json({
      ok: true,
      emailed: !emailResult.error,
      invitationUrl,
    });
  }

  if (body.action === "invitation-revoke" && body.invitationId) {
    const result = await admin
      .from("team_invitations")
      .delete()
      .eq("id", body.invitationId);
    if (result.error) {
      return NextResponse.json(
        { error: result.error.message },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true });
  }

  if (
    body.action === "workspace-status" &&
    body.workspaceId &&
    typeof body.archived === "boolean"
  ) {
    const result = await admin
      .from("teams")
      .update({ archived: body.archived })
      .eq("id", body.workspaceId);
    if (result.error) {
      return NextResponse.json(
        { error: result.error.message },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true });
  }

  if (
    body.action === "profile" &&
    body.userId &&
    body.name?.trim() &&
    body.title?.trim()
  ) {
    const name = body.name.trim().slice(0, 120);
    const title = body.title.trim().slice(0, 120);
    const profileResult = await admin
      .from("profiles")
      .update({ full_name: name, role: title })
      .eq("id", body.userId);
    if (profileResult.error) {
      return NextResponse.json(
        { error: profileResult.error.message },
        { status: 400 },
      );
    }
    const authResult = await admin.auth.admin.updateUserById(body.userId, {
      user_metadata: { full_name: name, role: title },
    });
    if (authResult.error) {
      return NextResponse.json(
        { error: authResult.error.message },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Acción inválida." }, { status: 400 });
}

export async function DELETE(request: Request) {
  const authorization = await authorize();
  if (authorization.response || !authorization.admin || !authorization.user) {
    return authorization.response;
  }
  const admin = authorization.admin;
  const body = (await request.json()) as {
    workspaceId?: string;
    userId?: string;
    confirmation?: string;
  };

  if (body.userId) {
    const target = await admin.auth.admin.getUserById(body.userId);
    if (target.error || !target.data.user) {
      return NextResponse.json({ error: "El usuario no existe." }, { status: 404 });
    }
    const email = target.data.user.email ?? "";
    if (!body.confirmation || body.confirmation.trim().toLowerCase() !== email.toLowerCase()) {
      return NextResponse.json(
        { error: "El correo de confirmación no coincide." },
        { status: 400 },
      );
    }
    if (body.userId === authorization.user.id) {
      return NextResponse.json(
        { error: "No podés eliminar tu propio usuario." },
        { status: 400 },
      );
    }
    const persistentAdmin = await admin
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", body.userId)
      .maybeSingle();
    if (isPlatformAdminEmail(email) || Boolean(persistentAdmin.data)) {
      return NextResponse.json(
        { error: "Primero revocá el acceso de superadministrador." },
        { status: 400 },
      );
    }
    const [createdWorkspaces, ownerMemberships] = await Promise.all([
      admin.from("teams").select("id, name").eq("created_by", body.userId),
      admin
        .from("team_members")
        .select("team_id, teams(name)")
        .eq("user_id", body.userId)
        .eq("role", "owner"),
    ]);
    if (createdWorkspaces.error || ownerMemberships.error) {
      return NextResponse.json(
        { error: createdWorkspaces.error?.message ?? ownerMemberships.error?.message },
        { status: 400 },
      );
    }
    if ((createdWorkspaces.data?.length ?? 0) > 0 || (ownerMemberships.data?.length ?? 0) > 0) {
      return NextResponse.json(
        {
          error:
            "Este usuario es propietario de uno o más espacios. Transferí la propiedad antes de eliminarlo.",
        },
        { status: 400 },
      );
    }

    if (email) {
      await Promise.all([
        admin.from("team_invitations").delete().eq("email", email),
        admin.from("project_invitations").delete().eq("email", email),
      ]);
    }
    const deleted = await admin.auth.admin.deleteUser(body.userId, false);
    if (deleted.error) {
      return NextResponse.json({ error: deleted.error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  if (!body.workspaceId || !body.confirmation) {
    return NextResponse.json(
      { error: "Confirmación requerida." },
      { status: 400 },
    );
  }

  const workspace = await admin
    .from("teams")
    .select("id, name")
    .eq("id", body.workspaceId)
    .single();
  if (workspace.error) {
    return NextResponse.json(
      { error: "El espacio no existe." },
      { status: 404 },
    );
  }
  if (body.confirmation.trim() !== workspace.data.name) {
    return NextResponse.json(
      { error: "El nombre de confirmación no coincide." },
      { status: 400 },
    );
  }

  const attachments = await admin
    .from("task_attachments")
    .select("storage_path, tasks!inner(team_id)")
    .eq("tasks.team_id", body.workspaceId);
  if (attachments.error) {
    return NextResponse.json(
      { error: attachments.error.message },
      { status: 400 },
    );
  }
  const attachmentPaths = (attachments.data ?? []).map(
    (attachment) => attachment.storage_path,
  );
  if (attachmentPaths.length) {
    const storageResult = await admin.storage
      .from("task-attachments")
      .remove(attachmentPaths);
    if (storageResult.error) {
      return NextResponse.json(
        { error: storageResult.error.message },
        { status: 400 },
      );
    }
  }

  const result = await admin.from("teams").delete().eq("id", body.workspaceId);
  if (result.error) {
    return NextResponse.json(
      { error: result.error.message },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true });
}
