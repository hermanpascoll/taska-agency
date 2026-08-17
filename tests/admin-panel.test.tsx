import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminPanel } from "@/components/admin-panel";
import type { PlatformAdminOverview } from "@/lib/admin-types";

const overview: PlatformAdminOverview = {
  currentUserId: "user-root",
  generatedAt: "2026-07-24T14:00:00.000Z",
  users: [
    {
      id: "user-root",
      name: "Admin Root",
      email: "root@taska.test",
      title: "Dirección",
      avatarUrl: null,
      superAdmin: true,
      rootAdmin: true,
      createdAt: "2026-07-20T10:00:00.000Z",
      lastSignInAt: "2026-07-24T13:00:00.000Z",
      lastSeenAt: "2026-07-24T13:59:30.000Z",
      online: true,
      providers: ["google"],
      suspended: false,
      memberships: [
        {
          workspaceId: "workspace-1",
          workspaceName: "Agencia Test",
          role: "owner",
          projectLimited: false,
        },
      ],
    },
    {
      id: "user-2",
      name: "Ana Equipo",
      email: "ana@taska.test",
      title: "Diseño",
      avatarUrl: null,
      superAdmin: false,
      rootAdmin: false,
      createdAt: "2026-07-21T10:00:00.000Z",
      lastSignInAt: null,
      lastSeenAt: null,
      online: false,
      providers: ["email"],
      suspended: false,
      memberships: [
        {
          workspaceId: "workspace-1",
          workspaceName: "Agencia Test",
          role: "agent",
          projectLimited: true,
        },
      ],
    },
    {
      id: "user-3",
      name: "Bruno Nuevo",
      email: "bruno@taska.test",
      title: "Producción",
      avatarUrl: null,
      superAdmin: false,
      rootAdmin: false,
      createdAt: "2026-07-22T10:00:00.000Z",
      lastSignInAt: "2026-07-24T12:00:00.000Z",
      lastSeenAt: null,
      online: false,
      providers: ["google"],
      suspended: false,
      memberships: [],
    },
  ],
  workspaces: [
    {
      id: "workspace-1",
      name: "Agencia Test",
      slug: "agencia-test",
      archived: false,
      currency: "USD",
      createdAt: "2026-07-20T10:00:00.000Z",
      ownerName: "Admin Root",
      ownerEmail: "root@taska.test",
      memberCount: 2,
      projectCount: 3,
      taskCount: 8,
      rolePermissions: {
        owner: { administer: true, billing: true, trackTime: true, auditTime: true },
        admin: { administer: true, billing: true, trackTime: true, auditTime: true },
        agent: { administer: false, billing: false, trackTime: true, auditTime: false },
        viewer: { administer: false, billing: false, trackTime: false, auditTime: false },
      },
      members: [
        {
          userId: "user-root",
          name: "Admin Root",
          email: "root@taska.test",
          title: "Dirección",
          avatarUrl: null,
          role: "owner",
          projectLimited: false,
          online: true,
        },
        {
          userId: "user-2",
          name: "Ana Equipo",
          email: "ana@taska.test",
          title: "Diseño",
          avatarUrl: null,
          role: "agent",
          projectLimited: true,
          online: false,
        },
      ],
      invitations: [
        {
          id: "invitation-1",
          email: "pendiente@taska.test",
          role: "viewer",
          token: "token-1",
          createdAt: "2026-07-24T10:00:00.000Z",
          expiresAt: "2026-07-31T10:00:00.000Z",
        },
      ],
    },
  ],
};

function jsonResponse(payload: unknown) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(payload),
  } as Response);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Panel global de administración", () => {
  it("promueve usuarios y abre la gestión de integrantes por espacio", async () => {
    const fetchMock = vi.fn<typeof fetch>(() => jsonResponse(overview));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(
      <AdminPanel open onClose={vi.fn()} notify={vi.fn()} />,
    );

    expect(
      await screen.findByRole("heading", {
        name: "Administración de plataforma",
      }),
    ).toBeInTheDocument();
    const rootButton = await screen.findByRole("button", {
      name: "Superadmin raíz",
    });
    expect(rootButton).toBeDisabled();
    expect(screen.getByLabelText("Usuario en línea")).toBeInTheDocument();

    const promoteButtons = await screen.findAllByRole("button", {
      name: "Hacer superadmin",
    });
    await user.click(promoteButtons[0]);
    expect(
      screen.getByRole("heading", {
        name: "Otorgar acceso de superadministrador",
      }),
    ).toBeInTheDocument();
    await user.type(
      screen.getByRole("textbox", {
        name: /Escribí ana@taska.test para confirmar/i,
      }),
      "ana@taska.test",
    );
    await user.click(
      screen.getByRole("button", { name: "Confirmar cambio" }),
    );
    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        ([, options]) => (options as RequestInit | undefined)?.method === "PATCH",
      );
      expect(patchCall).toBeTruthy();
      const patchOptions = patchCall?.[1] as RequestInit | undefined;
      expect(
        JSON.parse(String(patchOptions?.body)),
      ).toMatchObject({
        action: "superadmin-status",
        userId: "user-2",
        superAdmin: true,
      });
    });

    await user.click(screen.getByRole("button", { name: /Espacios/ }));
    await user.click(
      screen.getByRole("button", { name: "Administrar integrantes" }),
    );

    expect(
      screen.getByRole("dialog", { name: "Integrantes de Agencia Test" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Correo para invitar")).toBeInTheDocument();
    expect(screen.getByText("pendiente@taska.test")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Rol de Ana Equipo en Agencia Test"),
    ).toHaveValue("agent");

    expect(
      screen.queryByText("Agregar usuario directamente"),
    ).not.toBeInTheDocument();

    await user.type(
      screen.getByLabelText("Correo para invitar"),
      "nuevo@taska.test",
    );
    await user.click(
      screen.getByRole("button", { name: "Enviar invitación" }),
    );
    await waitFor(() => {
      const invitationCall = fetchMock.mock.calls.find(([, options]) => {
        const body = String((options as RequestInit | undefined)?.body ?? "");
        return body.includes('"workspace-invite"');
      });
      expect(invitationCall).toBeTruthy();
      const invitationOptions = invitationCall?.[1] as RequestInit | undefined;
      expect(
        JSON.parse(String(invitationOptions?.body)),
      ).toMatchObject({
        action: "workspace-invite",
        workspaceId: "workspace-1",
        email: "nuevo@taska.test",
        role: "agent",
      });
    });
  });

  it("configura permisos por rol y permite eliminar un usuario con confirmación", async () => {
    const fetchMock = vi.fn<typeof fetch>(() => jsonResponse(overview));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<AdminPanel open onClose={vi.fn()} notify={vi.fn()} />);
    await screen.findByRole("heading", { name: "Administración de plataforma" });

    await user.click(screen.getByRole("button", { name: /Espacios/ }));
    await user.click(screen.getByRole("button", { name: "Permisos por rol" }));
    const permissionsDialog = screen.getByRole("dialog", {
      name: "Permisos de Agencia Test",
    });
    await user.click(
      within(permissionsDialog).getByRole("switch", {
        name: "Facturación y rentabilidad para Integrante",
      }),
    );
    await waitFor(() => {
      const permissionsCall = fetchMock.mock.calls.find(([, options]) =>
        String((options as RequestInit | undefined)?.body ?? "").includes(
          '"role-permissions"',
        ),
      );
      expect(permissionsCall).toBeTruthy();
      expect(
        JSON.parse(String((permissionsCall?.[1] as RequestInit)?.body)),
      ).toMatchObject({
        action: "role-permissions",
        workspaceId: "workspace-1",
        role: "agent",
        permissions: { billing: true },
      });
    });

    await user.click(within(permissionsDialog).getByLabelText("Cerrar permisos"));
    await user.click(screen.getByRole("button", { name: /Usuarios/ }));
    const anaCard = screen.getByRole("heading", { name: "Ana Equipo" }).closest("article");
    expect(anaCard).not.toBeNull();
    await user.click(
      within(anaCard as HTMLElement).getByRole("button", {
        name: "Eliminar usuario",
      }),
    );
    await user.type(
      screen.getByRole("textbox", {
        name: /Escribí ana@taska.test para confirmar/i,
      }),
      "ana@taska.test",
    );
    await user.click(
      screen.getByRole("button", { name: "Eliminar definitivamente" }),
    );
    await waitFor(() => {
      const deleteCall = fetchMock.mock.calls.find(
        ([, options]) => (options as RequestInit | undefined)?.method === "DELETE",
      );
      expect(deleteCall).toBeTruthy();
      expect(JSON.parse(String((deleteCall?.[1] as RequestInit)?.body))).toEqual({
        userId: "user-2",
        confirmation: "ana@taska.test",
      });
    });
  });
});
