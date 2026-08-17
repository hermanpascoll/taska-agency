"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Person, WorkspaceGroup } from "@/lib/types";

const demoKey = "taska-workspace-groups-v1";

type GroupRow = {
  id: string;
  team_id: string;
  name: string;
  description: string;
  color: string;
  created_by: string;
  created_at: string;
};
type MemberRow = { group_id: string; user_id: string; role: "owner" | "member"; joined_at: string };
type InvitationRow = {
  id: string;
  group_id: string;
  email: string;
  token: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
};

function readDemoGroups(): WorkspaceGroup[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(demoKey) ?? "[]") as WorkspaceGroup[];
  } catch {
    return [];
  }
}

export function useWorkspaceGroups(workspaceId: string, people: Person[], currentUserId: string) {
  const remote = isSupabaseConfigured();
  const [groups, setGroups] = useState<WorkspaceGroup[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    if (!remote) {
      setGroups(readDemoGroups().filter((group) => group.workspaceId === workspaceId));
      setLoading(false);
      return;
    }
    const supabase = createClient();
    if (!supabase) return;
    const groupResult = await supabase
      .from("workspace_groups")
      .select("id, team_id, name, description, color, created_by, created_at")
      .eq("team_id", workspaceId)
      .order("created_at");
    if (groupResult.error) throw groupResult.error;
    const rows = (groupResult.data ?? []) as GroupRow[];
    const ids = rows.map((row) => row.id);
    const [memberResult, invitationResult] = ids.length
      ? await Promise.all([
          supabase.from("workspace_group_members").select("group_id, user_id, role, joined_at").in("group_id", ids),
          supabase.from("workspace_group_invitations").select("id, group_id, email, token, created_at, expires_at, accepted_at").in("group_id", ids),
        ])
      : [{ data: [], error: null }, { data: [], error: null }];
    if (memberResult.error) throw memberResult.error;
    if (invitationResult.error) throw invitationResult.error;
    const members = (memberResult.data ?? []) as MemberRow[];
    const invitations = (invitationResult.data ?? []) as InvitationRow[];
    setGroups(rows.map((row) => ({
      id: row.id,
      workspaceId: row.team_id,
      name: row.name,
      description: row.description,
      color: row.color,
      createdBy: row.created_by,
      createdAt: row.created_at,
      members: members.filter((member) => member.group_id === row.id).flatMap((member) => {
        const user = people.find((person) => person.id === member.user_id);
        return user ? [{ groupId: row.id, user, role: member.role, joinedAt: member.joined_at }] : [];
      }),
      invitations: invitations.filter((invitation) => invitation.group_id === row.id).map((invitation) => ({
        id: invitation.id,
        groupId: invitation.group_id,
        email: invitation.email,
        token: invitation.token,
        createdAt: invitation.created_at,
        expiresAt: invitation.expires_at,
        acceptedAt: invitation.accepted_at,
      })),
    })));
    setLoading(false);
  }, [people, remote, workspaceId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void refresh().catch((error) => {
        console.error("No se pudieron cargar los equipos:", error);
        setLoading(false);
      });
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [refresh]);

  const saveDemo = useCallback((next: WorkspaceGroup[]) => {
    const other = readDemoGroups().filter((group) => group.workspaceId !== workspaceId);
    window.localStorage.setItem(demoKey, JSON.stringify([...other, ...next]));
    setGroups(next);
  }, [workspaceId]);

  const createGroup = useCallback(async (name: string, description: string, color: string) => {
    if (!remote) {
      const person = people.find((item) => item.id === currentUserId);
      if (!person) throw new Error("No se encontró tu usuario.");
      const item: WorkspaceGroup = {
        id: crypto.randomUUID(), workspaceId, name, description, color,
        createdBy: currentUserId, createdAt: new Date().toISOString(),
        members: [{ groupId: "", user: person, role: "owner", joinedAt: new Date().toISOString() }],
        invitations: [],
      };
      item.members[0].groupId = item.id;
      saveDemo([...groups, item]);
      return item.id;
    }
    const supabase = createClient();
    if (!supabase) throw new Error("Supabase no está configurado.");
    const result = await supabase.rpc("create_workspace_group", {
      candidate_team_id: workspaceId,
      candidate_name: name,
      candidate_description: description,
      candidate_color: color,
    });
    if (result.error) throw result.error;
    await refresh();
    return result.data as string;
  }, [currentUserId, groups, people, refresh, remote, saveDemo, workspaceId]);

  const addMember = useCallback(async (groupId: string, userId: string) => {
    if (!remote) {
      const user = people.find((person) => person.id === userId);
      if (!user) throw new Error("El usuario no pertenece al espacio.");
      saveDemo(groups.map((group) => group.id === groupId && !group.members.some((member) => member.user.id === userId)
        ? { ...group, members: [...group.members, { groupId, user, role: "member" as const, joinedAt: new Date().toISOString() }] }
        : group));
      return;
    }
    const supabase = createClient();
    if (!supabase) return;
    const result = await supabase.rpc("add_workspace_group_member", { candidate_group_id: groupId, candidate_user_id: userId });
    if (result.error) throw result.error;
    await refresh();
  }, [groups, people, refresh, remote, saveDemo]);

  const removeMember = useCallback(async (groupId: string, userId: string) => {
    if (!remote) {
      saveDemo(groups.map((group) => group.id === groupId
        ? { ...group, members: group.members.filter((member) => member.user.id !== userId) }
        : group));
      return;
    }
    const supabase = createClient();
    if (!supabase) return;
    const result = await supabase.rpc("remove_workspace_group_member", { candidate_group_id: groupId, candidate_user_id: userId });
    if (result.error) throw result.error;
    await refresh();
  }, [groups, refresh, remote, saveDemo]);

  const invite = useCallback(async (groupId: string, email: string) => {
    if (!remote) throw new Error("Las invitaciones por correo requieren conexión.");
    const response = await fetch("/api/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, workspaceGroupId: groupId, email }),
    });
    const result = await response.json() as { emailed?: boolean; error?: string };
    if (!response.ok) throw new Error(result.error || "No se pudo enviar la invitación.");
    await refresh();
    return Boolean(result.emailed);
  }, [refresh, remote, workspaceId]);

  const deleteGroup = useCallback(async (groupId: string) => {
    if (!remote) {
      saveDemo(groups.filter((group) => group.id !== groupId));
      return;
    }
    const supabase = createClient();
    if (!supabase) return;
    const result = await supabase.from("workspace_groups").delete().eq("id", groupId);
    if (result.error) throw result.error;
    await refresh();
  }, [groups, refresh, remote, saveDemo]);

  return { groups, loading, createGroup, addMember, removeMember, invite, deleteGroup, refresh };
}
