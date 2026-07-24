"use client";

import {
  Archive,
  ArchiveRestore,
  Ban,
  Building2,
  CheckCircle2,
  FolderKanban,
  KeyRound,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserCog,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  const [editingUser, setEditingUser] =
    useState<PlatformAdminUser | null>(null);
  const [profileName, setProfileName] = useState("");
  const [profileTitle, setProfileTitle] = useState("");
  const [deletingWorkspace, setDeletingWorkspace] =
    useState<PlatformAdminWorkspace | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");

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
    return () => window.clearTimeout(timeoutId);
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
        };
        if (!response.ok) {
          throw new Error(payload.error || "No se pudo guardar el cambio.");
        }
        notify(successMessage);
        await loadOverview();
        return true;
      } catch (reason) {
        const message =
          reason instanceof Error
            ? reason.message
            : "No se pudo guardar el cambio.";
        setError(message);
        notify(message);
        return false;
      } finally {
        setSaving(false);
      }
    },
    [loadOverview, notify],
  );

  const filteredUsers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return overview?.users ?? [];
    return (overview?.users ?? []).filter((user) =>
      [user.name, user.email, user.title, ...user.memberships.map((item) => item.workspaceName)]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [overview?.users, query]);

  const filteredWorkspaces = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return overview?.workspaces ?? [];
    return (overview?.workspaces ?? []).filter((workspace) =>
      [
        workspace.name,
        workspace.slug,
        workspace.ownerName,
        workspace.ownerEmail,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [overview?.workspaces, query]);

  if (!open) return null;

  const suspendedCount =
    overview?.users.filter((user) => user.suspended).length ?? 0;
  const activeWorkspaceCount =
    overview?.workspaces.filter((workspace) => !workspace.archived).length ?? 0;

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
          <aside className="border-b border-black/[0.06] bg-[#e9ebef]/80 p-4 lg:border-b-0 lg:border-r lg:p-5">
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
                  detail={`${suspendedCount} suspendidos`}
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
                          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[linear-gradient(145deg,#0a84ff,#6659e8)] text-[11px] font-bold text-white shadow-sm">
                            {initials(user.name)}
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
                              void mutate(
                                "PATCH",
                                {
                                  action: "user-status",
                                  userId: user.id,
                                  suspended: !user.suspended,
                                },
                                user.suspended
                                  ? "Usuario reactivado"
                                  : "Usuario suspendido",
                              )
                            }
                            disabled={saving}
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
