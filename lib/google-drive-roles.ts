import type { TeamRole } from "@/lib/types";

export type GoogleDriveMemberRole =
  | "organizer"
  | "fileOrganizer"
  | "writer"
  | "reader";

export function googleDriveRoleForTeamRole(
  role: TeamRole,
): GoogleDriveMemberRole {
  if (role === "owner") return "organizer";
  if (role === "admin") return "fileOrganizer";
  if (role === "viewer") return "reader";
  return "writer";
}

