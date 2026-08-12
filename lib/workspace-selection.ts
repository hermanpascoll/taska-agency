import type { Workspace } from "@/lib/types";

export function selectActiveWorkspaceId(
  workspaces: Workspace[],
  currentId: string | null | undefined,
  storedId: string | null | undefined,
) {
  const available = workspaces.filter((workspace) => !workspace.archived);
  for (const candidate of [currentId, storedId]) {
    if (candidate && available.some((workspace) => workspace.id === candidate)) {
      return candidate;
    }
  }
  return available[0]?.id ?? "";
}
