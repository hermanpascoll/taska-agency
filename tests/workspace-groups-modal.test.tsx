import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceGroupsModal } from "@/components/workspace-groups-modal";

const createGroup = vi.fn().mockResolvedValue("group-1");
const addMember = vi.fn().mockResolvedValue(undefined);
const invite = vi.fn().mockResolvedValue(true);

vi.mock("@/hooks/use-workspace-groups", () => ({
  useWorkspaceGroups: () => ({
    groups: [],
    loading: false,
    createGroup,
    addMember,
    removeMember: vi.fn(),
    invite,
    deleteGroup: vi.fn(),
  }),
}));

describe("Equipos del espacio", () => {
  it("permite que un integrante cree un equipo", async () => {
    const user = userEvent.setup();
    render(
      <WorkspaceGroupsModal
        workspaceId="workspace-1"
        workspaceName="Agencia"
        people={[{ id: "user-1", name: "Ana", initials: "AN", color: "#0a84ff" }]}
        currentUserId="user-1"
        canAdminister={false}
        onClose={vi.fn()}
        notify={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Crear equipo" }));
    await user.type(screen.getByRole("textbox", { name: "Nombre" }), "Diseño");
    await user.type(screen.getByRole("textbox", { name: "Descripción" }), "Equipo creativo");
    await user.click(screen.getAllByRole("button", { name: "Crear equipo" })[1]);

    expect(createGroup).toHaveBeenCalledWith("Diseño", "Equipo creativo", "#0a84ff");
  });
});
