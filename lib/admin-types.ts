import type { TeamRole } from "@/lib/types";

export type PlatformAdminMembership = {
  workspaceId: string;
  workspaceName: string;
  role: TeamRole;
  projectLimited: boolean;
};

export type PlatformAdminUser = {
  id: string;
  name: string;
  email: string;
  title: string;
  superAdmin: boolean;
  rootAdmin: boolean;
  createdAt: string;
  lastSignInAt: string | null;
  lastSeenAt: string | null;
  online: boolean;
  providers: string[];
  suspended: boolean;
  memberships: PlatformAdminMembership[];
};

export type PlatformAdminWorkspaceMember = {
  userId: string;
  name: string;
  email: string;
  title: string;
  role: TeamRole;
  projectLimited: boolean;
  online: boolean;
};

export type PlatformAdminInvitation = {
  id: string;
  email: string;
  role: Exclude<TeamRole, "owner">;
  token: string;
  createdAt: string;
  expiresAt: string;
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
  members: PlatformAdminWorkspaceMember[];
  invitations: PlatformAdminInvitation[];
};

export type PlatformAdminOverview = {
  currentUserId: string;
  generatedAt: string;
  users: PlatformAdminUser[];
  workspaces: PlatformAdminWorkspace[];
};
