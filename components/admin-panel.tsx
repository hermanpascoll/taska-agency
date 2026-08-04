"use client";

import {
  Archive,
  ArchiveRestore,
  Ban,
  Building2,
  CheckCircle2,
  Copy,
  Crown,
  FolderKanban,
  KeyRound,
  LoaderCircle,
  MailPlus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserCog,
  UserMinus,
  UserPlus,
  UserRound,
  Users,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { clsx } from "clsx";
import type {
  PlatformAdminOverview,
  PlatformAdminUser,
  PlatformAdminWorkspace,
} from "@/lib/admin-types";
import type { TeamRole } from "@/lib/types";

const roleLabels: Record<TeamRole, string> = {
  owner: "Propietario",
  admin: "Administrador",
  agent: "Integrante",
  viewer: "Sólo lectura",
};

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function formatDate(value: string | null) {
  if (!value) return "Nunca";
  return new Intl.DateTimeFormat("es-UY", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function providerLabel(provider: string) {
  if (provider === "google") return "Google";
  if (provider === "email") return "Correo";
  return provider;
}

export function AdminPanel({
  open,
  onClose,
  notify,
}: {
  open: boolean;
  onClose: () => void;
  notify: (message: string) => void;
}) {
  const [overview, setOverview] = useState<PlatformAdminOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"users" | "workspaces">("users");
  const [query, setQuery] = useState("");
  const [userStatusFilter, setUserStatusFilter] = useState<
    "all" | "online" | "active" | "suspended" | "superadmin"
  >("all");
  const [userRoleFilter, setUserRoleFilter] = useState<"all" | TeamRole>("all");
  const [workspaceStatusFilter, setWorkspaceStatusFilter] = useState<
    "all" | "active" | "archived"
  >("all");
  const [editingUser, setEditingUser] =
    useState<PlatformAdminUser | null>(null);
  const [profileName, setProfileName] = useState("");
  const [profileTitle, setProfileTitle] = useState("");
  const [deletingWorkspace, setDeletingWorkspace] =
    useState<PlatformAdminWorkspace | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [managingWorkspaceId, setManagingWorkspaceId] = useState<string | null>(
    null,
  );
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] =
    useState<Exclude<TeamRole, "owner">>("agent");
  const [directUserId, setDirectUserId] = useState("");
  const [directRole, setDirectRole] =
    useState<Exclude<TeamRole, "owner">>("agent");
  const [removingMember, setRemovingMember] = useState<{
    workspaceId: string;
    userId: string;
    name: string;
  } | null>(null);
  const [sensitiveAction, setSensitiveAction] = useState<{
    kind: "superadmin" | "status";
    user: PlatformAdminUser;
  } | null>(null);
  const [sensitiveConfirmation, setSensitiveConfirmation] = useState("");

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/overview", {
        cache: "no-store",
      });
      const payload = (await response.json()) as
        | PlatformAdminOverview
        | { error?: string };
      if (!response.ok) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "No se pudo cargar el panel.",
        );
      }
      setOverview(payload as PlatformAdminOverview);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "No se pudo cargar el panel.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const timeoutId = window.setTimeout(() => void loadOverview(), 0);
    const intervalId = window.setInterval(() => void loadOverview(), 30_000);
    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, [loadOverview, open]);

  const mutate = useCallback(
    async (
      method: "PATCH" | "DELETE",
      body: Record<string, unknown>,
      successMessage: string,
    ) => {
      setSaving(true);
      setError(null);
      try {
        const response = await fetch("/api/admin/overview", {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const payload = (await response.json()) as {
          error?: string;
          emailed?: boolean;
          invitationUrl?: string;
        };
        if (!response.ok) {
          throw new Error(payload.error || "No se pudo guardar el cambio.");
        }
        if (successMessage) notify(successMessage);
        await loadOverview();
        return payload;
      } catch (reason) {
        const message =
          reason instanceof Error
            ? reason.message
            : "No se pudo guardar el cambio.";
        setError(message);
        notify(message);
        return null;
      } finally {
        setSaving(false);
      }
    },
    [loadOverview, notify],
  );

  const filteredUsers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (overview?.users ?? []).filter((user) => {
      const matchesQuery =
        !normalized ||
        [
          user.name,
          user.email,
          user.title,
          ...user.memberships.map((item) => item.workspaceName),
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalized);
      const matchesStatus =
        userStatusFilter === "all" ||
        (userStatusFilter === "online" && user.online) ||
        (userStatusFilter === "active" && !user.suspended) ||
        (userStatusFilter === "suspended" && user.suspended) ||
        (userStatusFilter === "superadmin" && user.superAdmin);
      const matchesRole =
        userRoleFilter === "all" ||
        user.memberships.some((membership) => membership.role === userRoleFilter);
      return matchesQuery && matchesStatus && matchesRole;
    });
  }, [overview?.users, query, userRoleFilter, userStatusFilter]);

  const filteredWorkspaces = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (overview?.workspaces ?? []).filter((workspace) => {
      const matchesQuery =
        !normalized ||
        [
          workspace.name,
          workspace.slug,
          workspace.ownerName,
          workspace.ownerEmail,
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalized);
      const matchesStatus =
        workspaceStatusFilter === "all" ||
        (workspaceStatusFilter === "active" && !workspace.archived) ||
        (workspaceStatusFilter === "archived" && workspace.archived);
      return matchesQuery && matchesStatus;
    });
  }, [overview?.workspaces, query, workspaceStatusFilter]);

  function requestSensitiveAction(
    kind: "superadmin" | "status",
    user: PlatformAdminUser,
  ) {
    setSensitiveAction({ kind, user });
    setSensitiveConfirmation("");
  }

  async function confirmSensitiveAction(event: FormEvent) {
    event.preventDefault();
    if (
      !sensitiveAction ||
      sensitiveConfirmation.trim().toLowerCase() !==
        sensitiveAction.user.email.toLowerCase()
    ) {
      return;
    }
    const { kind, user } = sensitiveAction;
    const result =
      kind === "superadmin"
        ? await mutate(
            "PATCH",
            {
              action: "superadmin-status",
              userId: user.id,
              superAdmin: !user.superAdmin,
            },
            user.superAdmin
              ? "Acceso global revocado"
              : "Usuario promovido a superadministrador",
          )
        : await mutate(
            "PATCH",
            {
              action: "user-status",
              userId: user.id,
              suspended: !user.suspended,
            },
            user.suspended ? "Usuario reactivado" : "Usuario suspendido",
          );
    if (result) setSensitiveAction(null);
  }

  if (!open) return null;

  const suspendedCount =
    overview?.users.filter((user) => user.suspended).length ?? 0;
  const activeWorkspaceCount =
    overview?.workspaces.filter((workspace) => !workspace.archived).length ?? 0;
  const superAdminCount =
    overview?.users.filter((user) => user.superAdmin).length ?? 0;
  const managingWorkspace =
    overview?.workspaces.find(
      (workspace) => workspace.id === managingWorkspaceId,
    ) ?? null;
  const usersOutsideWorkspace = (overview?.users ?? []).filter(
    (user) =>
      !managingWorkspace?.members.some((member) => member.userId === user.id),
  );

  async function submitDirectMembership(event: FormEvent) {
    event.preventDefault();
    if (!managingWorkspace || !directUserId) return;
    const result = await mutate(
      "PATCH",
      {
        action: "workspace-member-add",
        workspaceId: managingWorkspace.id,
        userId: directUserId,
        role: directRole,
      },
      "Usuario agregado directamente al espacio",
    );
    if (result) setDirectUserId("");
  }

  async function submitWorkspaceInvitation(event: FormEvent) {
    event.preventDefault();
    if (!managingWorkspace || !inviteEmail.trim()) return;
    const result = await mutate(
      "PATCH",
      {
        action: "workspace-invite",
        workspaceId: managingWorkspace.id,
        email: inviteEmail.trim(),
        role: inviteRole,
      },
      "",
    );
    if (!result) return;
    setInviteEmail("");
    if (result.emailed) {
      notify("Invitación enviada por correo");
      return;
    }
    if (result.invitationUrl) {
      let copied = false;
      try {
        await navigator.clipboard?.writeText(result.invitationUrl);
        copied = Boolean(navigator.clipboard);
      } catch {
        // The pending invitation remains visible with a manual copy action.
      }
      notify(
        copied
          ? "Invitación creada y enlace copiado"
          : "Invitación creada; podés copiar el enlace pendiente",
      );
      return;
    }
    notify("Invitación creada");
  }

  return (
    <div className="fixed inset-0 z-[90] flex bg-slate-950/45 p-0 backdrop-blur-sm sm:p-4 lg:p-7">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="platform-admin-title"
        className="mac-window mx-auto flex min-h-0 w-full max-w-[1440px] flex-col overflow-hidden rounded-none border border-black/10 bg-[#f6f7f9] shadow-2xl sm:rounded-2xl"
      >
        <header className="flex min-h-[72px] items-center border-b border-black/[0.07] bg-white/90 px-4 backdrop-blur-xl sm:px-6">
          <span className="grid size-10 place-items-center rounded-xl bg-[#0a84ff] text-white shadow-[0_8px_22px_rgba(10,132,255,.25)]">
            <ShieldCheck className="size-5" />
          </span>
          <div className="ml-3">
            <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-[#0a84ff]">
              Taska Control Center
            </p>
            <h2
              id="platform-admin-title"
              className="text-[16px] font-bold tracking-[-0.02em] text-slate-900"
            >
              Administración de plataforma
            </h2>
          </div>
          <button
            onClick={() => void loadOverview()}
            disabled={loading || saving}
            className="focus-ring ml-auto rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
            aria-label="Actualizar panel"
          >
            <RefreshCw className={clsx("size-4", loading && "animate-spin")} />
          </button>
          <button
            onClick={onClose}
            className="focus-ring ml-1 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Cerrar panel de administración"
          >
            <X className="size-5" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="admin-panel-sidebar border-b border-black/[0.08] p-4 lg:border-b-0 lg:border-r lg:p-5">
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
              <button
                onClick={() => setTab("users")}
                className={clsx(
                  "focus-ring flex items-center gap-3 rounded-xl px-3 py-3 text-left text-[12px] font-semibold",
                  tab === "users"
                    ? "bg-white text-[#0879ea] shadow-sm"
                    : "text-slate-600 hover:bg-white/60",
                )}
              >
                <Users className="size-4" />
                Usuarios
                <span className="ml-auto text-[10px] text-slate-400">
                  {overview?.users.length ?? 0}
                </span>
              </button>
              <button
                onClick={() => setTab("workspaces")}
                className={clsx(
                  "focus-ring flex items-center gap-3 rounded-xl px-3 py-3 text-left text-[12px] font-semibold",
                  tab === "workspaces"
                    ? "bg-white text-[#0879ea] shadow-sm"
                    : "text-slate-600 hover:bg-white/60",
                )}
              >
                <Building2 className="size-4" />
                Espacios
                <span className="ml-auto text-[10px] text-slate-400">
                  {overview?.workspaces.length ?? 0}
                </span>
              </button>
            </div>
            <div className="mt-5 hidden rounded-xl border border-[#0a84ff]/10 bg-[#0a84ff]/8 p-3 lg:block">
              <div className="flex items-center gap-2 text-[10px] font-bold text-[#0879ea]">
                <KeyRound className="size-3.5" />
                Acceso restringido
              </div>
              <p className="mt-1.5 text-[9px] leading-4 text-slate-500">
                Este panel usa una autorización separada de los roles de cada
                espacio.
              </p>
            </div>
          </aside>

          <main className="soft-scrollbar min-h-0 overflow-y-auto">
            <div className="mx-auto max-w-[1180px] p-4 sm:p-6 lg:p-8">
              <div className="grid gap-3 sm:grid-cols-3">
                <StatCard
                  icon={Users}
                  label="Usuarios registrados"
                  value={overview?.users.length ?? 0}
                  detail={`${superAdminCount} superadmin · ${suspendedCount} suspendidos`}
                />
                <StatCard
                  icon={Building2}
                  label="Espacios activos"
                  value={activeWorkspaceCount}
                  detail={`${overview?.workspaces.length ?? 0} totales`}
                />
                <StatCard
                  icon={FolderKanban}
                  label="Tareas administradas"
                  value={
                    overview?.workspaces.reduce(
                      (total, workspace) => total + workspace.taskCount,
                      0,
                    ) ?? 0
                  }
                  detail="En todos los espacios"
                />
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                <div>
                  <h3 className="text-[15px] font-bold text-slate-900">
                    {tab === "users"
                      ? "Directorio de usuarios"
                      : "Espacios de trabajo"}
                  </h3>
                  <p className="mt-1 text-[10px] text-slate-500">
                    {tab === "users"
                      ? "Perfiles, accesos y roles en toda la plataforma."
                      : "Propietarios, actividad y estado de cada espacio."}
                  </p>
                </div>
                <label className="relative sm:ml-auto sm:w-[320px]">
                  <span className="sr-only">Buscar en administración</span>
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={
                      tab === "users"
                        ? "Buscar usuario o espacio…"
                        : "Buscar espacio o propietario…"
                    }
                    className="mac-input focus-ring h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-[11px]"
                  />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {tab === "users" ? (
                  <>
                    <label>
                      <span className="sr-only">Filtrar usuarios por estado</span>
                      <select
                        value={userStatusFilter}
                        onChange={(event) =>
                          setUserStatusFilter(
                            event.target.value as typeof userStatusFilter,
                          )
                        }
                        className="mac-input focus-ring h-9 rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-semibold text-slate-600"
                      >
                        <option value="all">Todos los estados</option>
                        <option value="online">En línea ahora</option>
                        <option value="active">Activos</option>
                        <option value="suspended">Suspendidos</option>
                        <option value="superadmin">Superadministradores</option>
                      </select>
                    </label>
                    <label>
                      <span className="sr-only">Filtrar usuarios por rol</span>
                      <select
                        value={userRoleFilter}
                        onChange={(event) =>
                          setUserRoleFilter(
                            event.target.value as typeof userRoleFilter,
                          )
                        }
                        className="mac-input focus-ring h-9 rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-semibold text-slate-600"
                      >
                        <option value="all">Todos los roles</option>
                        {(Object.keys(roleLabels) as TeamRole[]).map((role) => (
                          <option key={role} value={role}>
                            {roleLabels[role]}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                ) : (
                  <label>
                    <span className="sr-only">Filtrar espacios por estado</span>
                    <select
                      value={workspaceStatusFilter}
                      onChange={(event) =>
                        setWorkspaceStatusFilter(
                          event.target.value as typeof workspaceStatusFilter,
                        )
                      }
                      className="mac-input focus-ring h-9 rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-semibold text-slate-600"
                    >
                      <option value="all">Todos los espacios</option>
                      <option value="active">Activos</option>
                      <option value="archived">Archivados</option>
                    </select>
                  </label>
                )}
                <span className="ml-auto text-[9px] font-semibold text-slate-400">
                  {tab === "users"
                    ? `${filteredUsers.length} resultados`
                    : `${filteredWorkspaces.length} resultados`}
                </span>
              </div>

              {error && (
                <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[10px] font-medium text-rose-700">
                  {error}
                </div>
              )}

              {loading && !overview ? (
                <div className="grid min-h-[360px] place-items-center">
                  <div className="text-center text-slate-500">
                    <LoaderCircle className="mx-auto size-7 animate-spin text-[#0a84ff]" />
                    <p className="mt-3 text-[11px] font-medium">
                      Cargando administración…
                    </p>
                  </div>
                </div>
              ) : tab === "users" ? (
                <div className="mt-4 space-y-3">
                  {filteredUsers.map((user) => (
                    <article
                      key={user.id}
                      className="rounded-2xl border border-black/[0.07] bg-white p-4 shadow-sm sm:p-5"
                    >
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
                        <div className="flex min-w-0 flex-1 items-start gap-3">
                          <span className="relative grid size-11 shrink-0 place-items-center rounded-xl bg-[linear-gradient(145deg,#0a84ff,#6659e8)] text-[11px] font-bold text-white shadow-sm">
                            {initials(user.name)}
                            <span
                              className={clsx(
                                "absolute -bottom-1 -right-1 size-3 rounded-full border-2 border-white",
                                user.online
                                  ? "bg-emerald-500"
                                  : "bg-slate-300",
                              )}
                              title={user.online ? "En línea" : "Desconectado"}
                              aria-label={
                                user.online ? "Usuario en línea" : "Usuario desconectado"
                              }
                            />
                          </span>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="truncate text-[13px] font-bold text-slate-900">
                                {user.name}
                              </h4>
                              <span
                                className={clsx(
                                  "rounded-full px-2 py-1 text-[8px] font-bold uppercase tracking-wide",
                                  user.suspended
                                    ? "bg-rose-50 text-rose-600"
                                    : "bg-emerald-50 text-emerald-700",
                                )}
                              >
                                {user.suspended ? "Suspendido" : "Activo"}
                              </span>
                              {user.superAdmin && (
                                <span className="flex items-center gap-1 rounded-full bg-violet-50 px-2 py-1 text-[8px] font-bold uppercase tracking-wide text-violet-700">
                                  <Crown className="size-3" />
                                  Superadmin
                                </span>
                              )}
                              <span
                                className={clsx(
                                  "flex items-center gap-1 rounded-full px-2 py-1 text-[8px] font-bold",
                                  user.online
                                    ? "bg-emerald-50 text-emerald-700"
                                    : "bg-slate-100 text-slate-500",
                                )}
                              >
                                <span
                                  className={clsx(
                                    "size-1.5 rounded-full",
                                    user.online
                                      ? "bg-emerald-500"
                                      : "bg-slate-400",
                                  )}
                                />
                                {user.online ? "En línea" : "Desconectado"}
                              </span>
                            </div>
                            <p className="mt-0.5 truncate text-[10px] text-slate-500">
                              {user.email}
                            </p>
                            <p className="mt-1 text-[9px] font-medium text-slate-400">
                              {user.title} · Último acceso{" "}
                              {formatDate(user.lastSignInAt)}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {user.providers.map((provider) => (
                                <span
                                  key={provider}
                                  className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[8px] font-semibold text-slate-500"
                                >
                                  {providerLabel(provider)}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() =>
                              requestSensitiveAction("superadmin", user)
                            }
                            disabled={
                              saving ||
                              user.rootAdmin ||
                              (user.superAdmin &&
                                user.id === overview?.currentUserId)
                            }
                            title={
                              user.rootAdmin
                                ? "El administrador raíz se configura en el servidor"
                                : undefined
                            }
                            className={clsx(
                              "focus-ring flex items-center gap-2 rounded-lg border px-3 py-2 text-[9px] font-semibold disabled:cursor-not-allowed disabled:opacity-45",
                              user.superAdmin
                                ? "border-violet-200 text-violet-700 hover:bg-violet-50"
                                : "border-slate-200 text-slate-600 hover:bg-slate-50",
                            )}
                          >
                            <Crown className="size-3.5" />
                            {user.superAdmin
                              ? user.rootAdmin
                                ? "Superadmin raíz"
                                : "Quitar superadmin"
                              : "Hacer superadmin"}
                          </button>
                          <button
                            onClick={() => {
                              setEditingUser(user);
                              setProfileName(user.name);
                              setProfileTitle(user.title);
                            }}
                            disabled={saving}
                            className="focus-ring flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-[9px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                          >
                            <UserCog className="size-3.5" />
                            Editar perfil
                          </button>
                          <button
                            onClick={() =>
                              requestSensitiveAction("status", user)
                            }
                            disabled={saving || user.superAdmin}
                            className={clsx(
                              "focus-ring flex items-center gap-2 rounded-lg border px-3 py-2 text-[9px] font-semibold disabled:opacity-50",
                              user.suspended
                                ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                                : "border-rose-200 text-rose-600 hover:bg-rose-50",
                            )}
                          >
                            {user.suspended ? (
                              <CheckCircle2 className="size-3.5" />
                            ) : (
                              <Ban className="size-3.5" />
                            )}
                            {user.suspended ? "Reactivar" : "Suspender"}
                          </button>
                        </div>
                      </div>

                      <div className="mt-4 border-t border-slate-100 pt-3">
                        <p className="mb-2 text-[8px] font-bold uppercase tracking-[0.13em] text-slate-400">
                          Membresías
                        </p>
                        {user.memberships.length ? (
                          <div className="grid gap-2 lg:grid-cols-2">
                            {user.memberships.map((membership) => (
                              <div
                                key={membership.workspaceId}
                                className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2"
                              >
                                <Building2 className="size-3.5 shrink-0 text-slate-400" />
                                <span className="min-w-0 flex-1 truncate text-[10px] font-semibold text-slate-600">
                                  {membership.workspaceName}
                                </span>
                                {membership.projectLimited && (
                                  <span className="shrink-0 rounded-full bg-amber-100 px-2 py-1 text-[8px] font-bold text-amber-700">
                                    Sólo proyectos invitados
                                  </span>
                                )}
                                <select
                                  value={membership.role}
                                  disabled={saving}
                                  onChange={(event) =>
                                    void mutate(
                                      "PATCH",
                                      {
                                        action: "membership-role",
                                        userId: user.id,
                                        workspaceId: membership.workspaceId,
                                        role: event.target.value,
                                      },
                                      "Rol actualizado",
                                    )
                                  }
                                  className="focus-ring rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[9px] font-semibold text-slate-600"
                                  aria-label={`Rol de ${user.name} en ${membership.workspaceName}`}
                                >
                                  {(Object.keys(roleLabels) as TeamRole[]).map(
                                    (role) => (
                                      <option key={role} value={role}>
                                        {roleLabels[role]}
                                      </option>
                                    ),
                                  )}
                                </select>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[9px] text-slate-400">
                            Este usuario no pertenece a ningún espacio.
                          </p>
                        )}
                      </div>
                    </article>
                  ))}
                  {!filteredUsers.length && (
                    <EmptyResults label="No se encontraron usuarios." />
                  )}
                </div>
              ) : (
                <div className="mt-4 grid gap-3 xl:grid-cols-2">
                  {filteredWorkspaces.map((workspace) => (
                    <article
                      key={workspace.id}
                      className="rounded-2xl border border-black/[0.07] bg-white p-5 shadow-sm"
                    >
                      <div className="flex items-start gap-3">
                        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
                          <Building2 className="size-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="truncate text-[13px] font-bold text-slate-900">
                              {workspace.name}
                            </h4>
                            {workspace.archived && (
                              <span className="rounded-full bg-amber-50 px-2 py-1 text-[8px] font-bold text-amber-700">
                                Archivado
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 truncate text-[9px] text-slate-400">
                            /{workspace.slug}
                          </p>
                        </div>
                      </div>
                      <div className="mt-4 grid grid-cols-3 gap-2">
                        <MiniStat
                          label="Integrantes"
                          value={workspace.memberCount}
                        />
                        <MiniStat
                          label="Proyectos"
                          value={workspace.projectCount}
                        />
                        <MiniStat label="Tareas" value={workspace.taskCount} />
                      </div>
                      <div className="mt-4 rounded-xl bg-slate-50 p-3">
                        <p className="text-[8px] font-bold uppercase tracking-wide text-slate-400">
                          Propietario
                        </p>
                        <p className="mt-1 text-[10px] font-semibold text-slate-700">
                          {workspace.ownerName}
                        </p>
                        <p className="text-[9px] text-slate-400">
                          {workspace.ownerEmail}
                        </p>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          onClick={() => {
                            setManagingWorkspaceId(workspace.id);
                            setInviteEmail("");
                            setInviteRole("agent");
                            setDirectUserId("");
                            setDirectRole("agent");
                          }}
                          disabled={saving}
                          className="focus-ring flex items-center gap-2 rounded-lg border border-[#0a84ff]/20 bg-[#0a84ff]/5 px-3 py-2 text-[9px] font-semibold text-[#0879ea] hover:bg-[#0a84ff]/10 disabled:opacity-50"
                        >
                          <UserPlus className="size-3.5" />
                          Administrar integrantes
                        </button>
                        <button
                          onClick={() =>
                            void mutate(
                              "PATCH",
                              {
                                action: "workspace-status",
                                workspaceId: workspace.id,
                                archived: !workspace.archived,
                              },
                              workspace.archived
                                ? "Espacio restaurado"
                                : "Espacio archivado",
                            )
                          }
                          disabled={saving}
                          className="focus-ring flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-[9px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                        >
                          {workspace.archived ? (
                            <ArchiveRestore className="size-3.5" />
                          ) : (
                            <Archive className="size-3.5" />
                          )}
                          {workspace.archived ? "Restaurar" : "Archivar"}
                        </button>
                        <button
                          onClick={() => {
                            setDeletingWorkspace(workspace);
                            setDeleteConfirmation("");
                          }}
                          disabled={saving}
                          className="focus-ring ml-auto flex items-center gap-2 rounded-lg border border-rose-200 px-3 py-2 text-[9px] font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                        >
                          <Trash2 className="size-3.5" />
                          Eliminar
                        </button>
                      </div>
                    </article>
                  ))}
                  {!filteredWorkspaces.length && (
                    <EmptyResults label="No se encontraron espacios." />
                  )}
                </div>
              )}
            </div>
          </main>
        </div>
      </section>

      {managingWorkspace && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/40 p-3 backdrop-blur-sm sm:p-6">
          <section
            role="dialog"
            aria-modal="true"
            aria-label={`Integrantes de ${managingWorkspace.name}`}
            className="mac-window flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-black/10 bg-[#f7f8fa] shadow-2xl"
          >
            <header className="flex items-center border-b border-black/[0.07] bg-white/90 px-5 py-4 backdrop-blur-xl">
              <span className="grid size-10 place-items-center rounded-xl bg-[#0a84ff]/10 text-[#0a84ff]">
                <Users className="size-5" />
              </span>
              <div className="ml-3 min-w-0">
                <p className="text-[9px] font-bold uppercase tracking-wide text-[#0879ea]">
                  Acceso al espacio
                </p>
                <h3 className="truncate text-[14px] font-bold text-slate-900">
                  {managingWorkspace.name}
                </h3>
              </div>
              <button
                onClick={() => setManagingWorkspaceId(null)}
                className="focus-ring ml-auto rounded-lg p-2 text-slate-400 hover:bg-slate-100"
                aria-label="Cerrar integrantes del espacio"
              >
                <X className="size-4" />
              </button>
            </header>

            <div className="soft-scrollbar min-h-0 overflow-y-auto p-4 sm:p-6">
              <form
                onSubmit={(event) => void submitDirectMembership(event)}
                className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4"
              >
                <div className="flex items-center gap-2">
                  <UserPlus className="size-4 text-emerald-700" />
                  <div>
                    <h4 className="text-[11px] font-bold text-slate-800">
                      Agregar usuario directamente
                    </h4>
                    <p className="mt-0.5 text-[9px] text-slate-500">
                      Otorga acceso inmediato, sin invitación ni aceptación.
                    </p>
                  </div>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_140px_auto]">
                  <select
                    required
                    value={directUserId}
                    onChange={(event) => setDirectUserId(event.target.value)}
                    aria-label="Usuario para agregar directamente"
                    className="mac-input focus-ring rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[10px]"
                  >
                    <option value="">Seleccionar usuario…</option>
                    {usersOutsideWorkspace.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name} · {user.email}
                      </option>
                    ))}
                  </select>
                  <select
                    value={directRole}
                    onChange={(event) =>
                      setDirectRole(
                        event.target.value as Exclude<TeamRole, "owner">,
                      )
                    }
                    aria-label="Rol del acceso directo"
                    className="mac-input focus-ring rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[10px]"
                  >
                    <option value="admin">Administrador</option>
                    <option value="agent">Integrante</option>
                    <option value="viewer">Sólo lectura</option>
                  </select>
                  <button
                    disabled={saving || !directUserId}
                    className="focus-ring flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-[10px] font-bold text-white disabled:opacity-45"
                  >
                    <UserPlus className="size-3.5" />
                    Agregar ahora
                  </button>
                </div>
                {!usersOutsideWorkspace.length && (
                  <p className="mt-3 text-[9px] text-emerald-800/70">
                    Todos los usuarios registrados ya pertenecen a este espacio.
                  </p>
                )}
              </form>

              <form
                onSubmit={(event) =>
                  void submitWorkspaceInvitation(event)
                }
                className="rounded-2xl border border-[#0a84ff]/15 bg-[#0a84ff]/5 p-4"
              >
                <div className="flex items-center gap-2">
                  <MailPlus className="size-4 text-[#0879ea]" />
                  <div>
                    <h4 className="text-[11px] font-bold text-slate-800">
                      Invitar a este espacio
                    </h4>
                    <p className="mt-0.5 text-[9px] text-slate-500">
                      La invitación vence después de siete días.
                    </p>
                  </div>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_140px_auto]">
                  <input
                    required
                    type="email"
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    placeholder="persona@empresa.com"
                    aria-label="Correo para invitar"
                    className="mac-input focus-ring rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[10px]"
                  />
                  <select
                    value={inviteRole}
                    onChange={(event) =>
                      setInviteRole(
                        event.target.value as Exclude<TeamRole, "owner">,
                      )
                    }
                    aria-label="Rol de la invitación"
                    className="mac-input focus-ring rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[10px]"
                  >
                    <option value="admin">Administrador</option>
                    <option value="agent">Integrante</option>
                    <option value="viewer">Sólo lectura</option>
                  </select>
                  <button
                    disabled={saving || !inviteEmail.trim()}
                    className="mac-button-primary focus-ring flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[10px] font-bold text-white disabled:opacity-45"
                  >
                    {saving ? (
                      <LoaderCircle className="size-3.5 animate-spin" />
                    ) : (
                      <UserPlus className="size-3.5" />
                    )}
                    Enviar invitación
                  </button>
                </div>
              </form>

              <section className="mt-5">
                <div className="flex items-center">
                  <div>
                    <h4 className="text-[12px] font-bold text-slate-800">
                      Integrantes actuales
                    </h4>
                    <p className="mt-0.5 text-[9px] text-slate-400">
                      Cambiá roles o quitá accesos desde cualquier espacio.
                    </p>
                  </div>
                  <span className="ml-auto rounded-full bg-slate-200/70 px-2.5 py-1 text-[9px] font-bold text-slate-500">
                    {managingWorkspace.members.length}
                  </span>
                </div>
                <div className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-black/[0.07] bg-white">
                  {managingWorkspace.members.map((member) => (
                    <div
                      key={member.userId}
                      className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"
                    >
                      <span className="relative grid size-9 shrink-0 place-items-center rounded-xl bg-[linear-gradient(145deg,#0a84ff,#6659e8)] text-[9px] font-bold text-white">
                        {initials(member.name)}
                        <span
                          className={clsx(
                            "absolute -bottom-1 -right-1 size-3 rounded-full border-2 border-white",
                            member.online
                              ? "bg-emerald-500"
                              : "bg-slate-300",
                          )}
                          title={
                            member.online ? "En línea" : "Desconectado"
                          }
                        />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[10px] font-bold text-slate-700">
                          {member.name}
                        </p>
                        <p className="truncate text-[9px] text-slate-400">
                          {member.email} · {member.title}
                        </p>
                        {member.projectLimited && (
                          <p className="mt-1 text-[8px] font-bold text-amber-600">
                            Acceso limitado a proyectos invitados
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          value={member.role}
                          disabled={saving}
                          onChange={(event) =>
                            void mutate(
                              "PATCH",
                              {
                                action: "membership-role",
                                workspaceId: managingWorkspace.id,
                                userId: member.userId,
                                role: event.target.value,
                              },
                              "Rol actualizado",
                            )
                          }
                          aria-label={`Rol de ${member.name} en ${managingWorkspace.name}`}
                          className="focus-ring rounded-lg border border-slate-200 bg-white px-2 py-2 text-[9px] font-semibold text-slate-600"
                        >
                          {(Object.keys(roleLabels) as TeamRole[]).map(
                            (role) => (
                              <option key={role} value={role}>
                                {roleLabels[role]}
                              </option>
                            ),
                          )}
                        </select>
                        <button
                          onClick={() =>
                            setRemovingMember({
                              workspaceId: managingWorkspace.id,
                              userId: member.userId,
                              name: member.name,
                            })
                          }
                          disabled={saving}
                          className="focus-ring rounded-lg border border-rose-100 p-2 text-slate-300 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                          aria-label={`Quitar a ${member.name} de ${managingWorkspace.name}`}
                        >
                          <UserMinus className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {managingWorkspace.invitations.length > 0 && (
                <section className="mt-5">
                  <h4 className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    Invitaciones pendientes
                  </h4>
                  <div className="mt-2 space-y-2">
                    {managingWorkspace.invitations.map((invitation) => (
                      <div
                        key={invitation.id}
                        className="flex flex-col gap-2 rounded-xl border border-black/[0.06] bg-white p-3 sm:flex-row sm:items-center"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[10px] font-bold text-slate-700">
                            {invitation.email}
                          </span>
                          <span className="block text-[8px] text-slate-400">
                            {roleLabels[invitation.role]} · vence{" "}
                            {formatDate(invitation.expiresAt)}
                          </span>
                        </span>
                        <button
                          onClick={() => {
                            const invitationUrl = `${window.location.origin}/invite/${invitation.token}`;
                            void navigator.clipboard?.writeText(invitationUrl);
                            notify("Enlace de invitación copiado");
                          }}
                          className="focus-ring flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-[9px] font-semibold text-[#0879ea] hover:bg-[#0a84ff]/8"
                        >
                          <Copy className="size-3.5" />
                          Copiar enlace
                        </button>
                        <button
                          onClick={() =>
                            void mutate(
                              "PATCH",
                              {
                                action: "invitation-revoke",
                                invitationId: invitation.id,
                              },
                              "Invitación revocada",
                            )
                          }
                          disabled={saving}
                          className="focus-ring rounded-lg px-2.5 py-2 text-[9px] font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-40"
                        >
                          Revocar
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </section>
        </div>
      )}

      {sensitiveAction && (
        <div className="fixed inset-0 z-[115] grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <form
            onSubmit={(event) => void confirmSensitiveAction(event)}
            className="mac-window w-full max-w-md rounded-2xl border border-amber-200 bg-white p-6 shadow-2xl"
          >
            <span className="grid size-11 place-items-center rounded-xl bg-amber-50 text-amber-700">
              {sensitiveAction.kind === "superadmin" ? (
                <Crown className="size-5" />
              ) : sensitiveAction.user.suspended ? (
                <CheckCircle2 className="size-5" />
              ) : (
                <Ban className="size-5" />
              )}
            </span>
            <h3 className="mt-4 text-[15px] font-bold text-slate-900">
              {sensitiveAction.kind === "superadmin"
                ? sensitiveAction.user.superAdmin
                  ? "Revocar acceso global"
                  : "Otorgar acceso de superadministrador"
                : sensitiveAction.user.suspended
                  ? "Reactivar usuario"
                  : "Suspender usuario"}
            </h3>
            <p className="mt-2 text-[10px] leading-5 text-slate-500">
              {sensitiveAction.kind === "superadmin"
                ? "Este permiso permite administrar todos los usuarios, espacios y roles de la plataforma."
                : sensitiveAction.user.suspended
                  ? "La persona volverá a poder iniciar sesión y acceder a sus espacios."
                  : "La persona perderá el acceso a la aplicación, pero sus datos y asignaciones permanecerán."}
            </p>
            <label className="mt-4 block">
              <span className="mb-2 block text-[9px] font-semibold text-slate-500">
                Escribí <strong>{sensitiveAction.user.email}</strong> para
                confirmar
              </span>
              <input
                autoFocus
                value={sensitiveConfirmation}
                onChange={(event) =>
                  setSensitiveConfirmation(event.target.value)
                }
                autoComplete="off"
                className="mac-input focus-ring w-full rounded-xl border border-amber-200 px-3 py-3 text-[11px]"
              />
            </label>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSensitiveAction(null)}
                className="focus-ring rounded-lg border border-slate-200 px-4 py-2.5 text-[10px] font-semibold text-slate-600"
              >
                Cancelar
              </button>
              <button
                disabled={
                  saving ||
                  sensitiveConfirmation.trim().toLowerCase() !==
                    sensitiveAction.user.email.toLowerCase()
                }
                className="focus-ring rounded-lg bg-amber-600 px-4 py-2.5 text-[10px] font-bold text-white disabled:opacity-40"
              >
                {saving ? "Aplicando…" : "Confirmar cambio"}
              </button>
            </div>
          </form>
        </div>
      )}

      {removingMember && (
        <div className="fixed inset-0 z-[110] grid place-items-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Confirmar eliminación de integrante"
            className="mac-window w-full max-w-sm rounded-2xl border border-rose-200 bg-white p-6 shadow-2xl"
          >
            <span className="grid size-11 place-items-center rounded-xl bg-rose-50 text-rose-600">
              <UserMinus className="size-5" />
            </span>
            <h3 className="mt-4 text-[14px] font-bold text-slate-900">
              Quitar a {removingMember.name}
            </h3>
            <p className="mt-2 text-[10px] leading-5 text-slate-500">
              Perderá acceso a este espacio. Sus tareas permanecerán y podrán
              reasignarse.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setRemovingMember(null)}
                className="focus-ring rounded-lg border border-slate-200 px-4 py-2.5 text-[10px] font-semibold text-slate-600"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  void (async () => {
                    const removed = await mutate(
                      "PATCH",
                      {
                        action: "workspace-member-remove",
                        workspaceId: removingMember.workspaceId,
                        userId: removingMember.userId,
                      },
                      "Integrante removido del espacio",
                    );
                    if (removed) setRemovingMember(null);
                  })();
                }}
                disabled={saving}
                className="focus-ring rounded-lg bg-rose-600 px-4 py-2.5 text-[10px] font-bold text-white disabled:opacity-45"
              >
                {saving ? "Quitando…" : "Quitar acceso"}
              </button>
            </div>
          </section>
        </div>
      )}

      {editingUser && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/35 p-4 backdrop-blur-sm">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void (async () => {
                const changed = await mutate(
                  "PATCH",
                  {
                    action: "profile",
                    userId: editingUser.id,
                    name: profileName,
                    title: profileTitle,
                  },
                  "Perfil actualizado",
                );
                if (changed) setEditingUser(null);
              })();
            }}
            className="mac-window w-full max-w-md rounded-2xl border border-black/10 bg-white p-6 shadow-2xl"
          >
            <div className="flex items-center">
              <span className="grid size-10 place-items-center rounded-xl bg-[#0a84ff]/10 text-[#0a84ff]">
                <UserRound className="size-5" />
              </span>
              <div className="ml-3">
                <h3 className="text-[14px] font-bold text-slate-900">
                  Editar perfil
                </h3>
                <p className="text-[9px] text-slate-400">{editingUser.email}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="focus-ring ml-auto rounded-lg p-2 text-slate-400 hover:bg-slate-100"
                aria-label="Cerrar edición de perfil"
              >
                <X className="size-4" />
              </button>
            </div>
            <label className="mt-5 block">
              <span className="mb-2 block text-[10px] font-bold text-slate-600">
                Nombre visible
              </span>
              <input
                required
                value={profileName}
                onChange={(event) => setProfileName(event.target.value)}
                className="mac-input focus-ring w-full rounded-xl border border-slate-200 px-3 py-3 text-[11px]"
              />
            </label>
            <label className="mt-4 block">
              <span className="mb-2 block text-[10px] font-bold text-slate-600">
                Cargo o descripción
              </span>
              <input
                required
                value={profileTitle}
                onChange={(event) => setProfileTitle(event.target.value)}
                className="mac-input focus-ring w-full rounded-xl border border-slate-200 px-3 py-3 text-[11px]"
              />
            </label>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="focus-ring rounded-lg border border-slate-200 px-4 py-2.5 text-[10px] font-semibold text-slate-600"
              >
                Cancelar
              </button>
              <button
                disabled={
                  saving || !profileName.trim() || !profileTitle.trim()
                }
                className="mac-button-primary focus-ring rounded-lg px-4 py-2.5 text-[10px] font-bold text-white disabled:opacity-50"
              >
                {saving ? "Guardando…" : "Guardar perfil"}
              </button>
            </div>
          </form>
        </div>
      )}

      {deletingWorkspace && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/40 p-4 backdrop-blur-sm">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void (async () => {
                const deleted = await mutate(
                  "DELETE",
                  {
                    workspaceId: deletingWorkspace.id,
                    confirmation: deleteConfirmation,
                  },
                  "Espacio eliminado definitivamente",
                );
                if (deleted) setDeletingWorkspace(null);
              })();
            }}
            className="mac-window w-full max-w-md rounded-2xl border border-rose-200 bg-white p-6 shadow-2xl"
          >
            <span className="grid size-11 place-items-center rounded-xl bg-rose-50 text-rose-600">
              <Trash2 className="size-5" />
            </span>
            <h3 className="mt-4 text-[15px] font-bold text-slate-900">
              Eliminar “{deletingWorkspace.name}”
            </h3>
            <p className="mt-2 text-[10px] leading-5 text-slate-500">
              Se eliminarán proyectos, tareas, comentarios, adjuntos y tiempos
              asociados. Esta acción no se puede deshacer.
            </p>
            <label className="mt-4 block">
              <span className="mb-2 block text-[9px] font-semibold text-slate-500">
                Escribí <strong>{deletingWorkspace.name}</strong> para confirmar
              </span>
              <input
                value={deleteConfirmation}
                onChange={(event) => setDeleteConfirmation(event.target.value)}
                autoComplete="off"
                className="mac-input focus-ring w-full rounded-xl border border-rose-200 px-3 py-3 text-[11px]"
                aria-label="Confirmar nombre del espacio"
              />
            </label>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeletingWorkspace(null)}
                className="focus-ring rounded-lg border border-slate-200 px-4 py-2.5 text-[10px] font-semibold text-slate-600"
              >
                Cancelar
              </button>
              <button
                disabled={
                  saving || deleteConfirmation !== deletingWorkspace.name
                }
                className="focus-ring rounded-lg bg-rose-600 px-4 py-2.5 text-[10px] font-bold text-white disabled:opacity-40"
              >
                {saving ? "Eliminando…" : "Eliminar definitivamente"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <article className="rounded-2xl border border-black/[0.07] bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-xl bg-[#0a84ff]/10 text-[#0a84ff]">
          <Icon className="size-4" />
        </span>
        <div>
          <p className="text-[9px] font-semibold text-slate-400">{label}</p>
          <p className="text-[22px] font-bold tracking-[-0.04em] text-slate-900">
            {value}
          </p>
        </div>
      </div>
      <p className="mt-2 text-[9px] text-slate-400">{detail}</p>
    </article>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-center">
      <p className="text-[14px] font-bold text-slate-800">{value}</p>
      <p className="mt-0.5 text-[8px] font-medium text-slate-400">{label}</p>
    </div>
  );
}

function EmptyResults({ label }: { label: string }) {
  return (
    <div className="col-span-full grid min-h-48 place-items-center rounded-2xl border border-dashed border-slate-300 bg-white text-center">
      <div>
        <Search className="mx-auto size-6 text-slate-300" />
        <p className="mt-3 text-[10px] font-medium text-slate-500">{label}</p>
      </div>
    </div>
  );
}
