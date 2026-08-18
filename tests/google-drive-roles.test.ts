import { describe, expect, it } from "vitest";
import { googleDriveRoleForTeamRole } from "@/lib/google-drive-roles";

describe("roles de integrantes en Google Drive", () => {
  it("mantiene administración y edición sin convertir integrantes en managers", () => {
    expect(googleDriveRoleForTeamRole("owner")).toBe("organizer");
    expect(googleDriveRoleForTeamRole("admin")).toBe("fileOrganizer");
    expect(googleDriveRoleForTeamRole("controller")).toBe("writer");
    expect(googleDriveRoleForTeamRole("agent")).toBe("writer");
    expect(googleDriveRoleForTeamRole("viewer")).toBe("reader");
  });
});
