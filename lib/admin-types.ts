import type { TeamRole } from "@/lib/types";

export type PlatformAdminMembership = {
  workspaceId: string;
  workspaceName: string;
  role: TeamRole;
};

export type PlatformAdminUser = {
  id: string;
  name: string;
  email: string;
  title: string;
  createdAt: string;
  lastSignInAt: string | null;
  providers: string[];
  suspended: boolean;
  memberships: PlatformAdminMembership[];
};

export type PlatformAdminWorkspace = {
  id: string;
  name: string;
  slug: string;
  archived: boolean;
  currency: string;
  createdAt: string;
  ownerName: string;
  ownerEmail: string;
  memberCount: number;
  projectCount: number;
  taskCount: number;
};

export type PlatformAdminOverview = {
  generatedAt: string;
  users: PlatformAdminUser[];
  workspaces: PlatformAdminWorkspace[];
};
