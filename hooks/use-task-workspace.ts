"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  initialTasks,
  invitations as demoInvitations,
  notifications as demoNotifications,
  people as demoPeople,
  projects as demoProjects,
  timeEntries as demoTimeEntries,
  workspaceMembers as demoMembers,
  workspaces as demoWorkspaces,
} from "@/lib/demo-data";
import {
  addRemoteComment,
  createRemoteInvitation,
  createRemoteManualTimeEntry,
  createRemoteProject,
  createRemoteTask,
  createRemoteWorkspace,
  deleteRemoteAttachment,
  deleteRemoteComment,
  deleteRemoteProject,
  deleteRemoteTask,
  deleteRemoteTimeEntry,
  deleteRemoteWorkspace,
  downloadRemoteAttachment,
  loadWorkspace,
  markAllRemoteNotificationsRead,
  markRemoteNotificationRead,
  removeRemoteMember,
  revokeRemoteInvitation,
  startRemoteTimer,
  stopRemoteTimer,
  updateRemoteMemberHourlyRate,
  updateRemoteMemberRole,
  updateRemoteProfile,
  updateRemoteProject,
  updateRemoteTask,
  updateRemoteWorkspace,
  uploadRemoteAttachment,
} from "@/lib/task-repository";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { formatDueLabel, nextTaskCode } from "@/lib/task-utils";
import type {
  AppNotification,
  AppSettings,
  NewManualTimeEntryInput,
  NewProjectInput,
  NewTaskInput,
  Person,
  Project,
  Task,
  TaskAttachment,
  TaskStatus,
  TeamInvitation,
  TeamRole,
  TimeEntry,
  UpdateProjectInput,
  UpdateTaskInput,
  UpdateWorkspaceInput,
  Workspace,
  WorkspaceMember,
} from "@/lib/types";

const demoStorageKey = "taska-demo-workspace-v2";
const defaultSettings: AppSettings = {
  compactMode: false,
  showCompleted: true,
  accentColor: "#0A84FF",
};

function localId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () =>
      reject(new Error("No se pudo leer el archivo.")),
    );
    reader.readAsDataURL(file);
  });
}

export function useTaskWorkspace() {
  const [allTasks, setAllTasks] = useState<Task[]>(initialTasks);
  const [allProjects, setAllProjects] = useState<Project[]>(demoProjects);
  const [workspaces, setWorkspaces] = useState<Workspace[]>(demoWorkspaces);
  const [allPeople, setAllPeople] = useState<Person[]>(demoPeople);
  const [members, setMembers] = useState<WorkspaceMember[]>(demoMembers);
  const [invitations, setInvitations] =
    useState<TeamInvitation[]>(demoInvitations);
  const [notifications, setNotifications] =
    useState<AppNotification[]>(demoNotifications);
  const [allTimeEntries, setAllTimeEntries] =
    useState<TimeEntry[]>(demoTimeEntries);
  const [peopleByWorkspace, setPeopleByWorkspace] = useState<
    Record<string, string[]>
  >({
    [demoWorkspaces[0].id]: demoPeople.map((person) => person.id),
  });
  const [currentUserId, setCurrentUserId] = useState("martina");
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(
    demoWorkspaces[0].id,
  );
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [mode, setMode] = useState<"demo" | "supabase">("demo");
  const [syncing, setSyncing] = useState(isSupabaseConfigured());
  const [demoReady, setDemoReady] = useState(false);

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured()) return;
    try {
      const workspace = await loadWorkspace();
      if (!workspace) return;
      setAllTasks(workspace.tasks);
      setAllProjects(workspace.projects);
      setWorkspaces(workspace.workspaces);
      setAllPeople(workspace.people);
      setPeopleByWorkspace(workspace.peopleByWorkspace);
      setMembers(workspace.members);
      setInvitations(workspace.invitations);
      setNotifications(workspace.notifications);
      setAllTimeEntries(workspace.timeEntries);
      setCurrentUserId(workspace.currentUserId);
      setActiveWorkspaceId((current) =>
        workspace.workspaces.some(
          (item) => item.id === current && !item.archived,
        )
          ? current
          : (workspace.workspaces.find((item) => !item.archived)?.id ?? ""),
      );
      setMode("supabase");
    } catch (error) {
      console.error("No se pudo sincronizar Supabase:", error);
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    if (isSupabaseConfigured()) {
      const timeout = window.setTimeout(() => void refresh(), 0);
      return () => window.clearTimeout(timeout);
    }

    const timeout = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem(demoStorageKey);
        if (stored) {
          const snapshot = JSON.parse(stored) as {
            tasks?: Task[];
            projects?: Project[];
            workspaces?: Workspace[];
            people?: Person[];
            members?: WorkspaceMember[];
            invitations?: TeamInvitation[];
            notifications?: AppNotification[];
            timeEntries?: TimeEntry[];
            peopleByWorkspace?: Record<string, string[]>;
            activeWorkspaceId?: string;
            settings?: AppSettings;
          };
          if (Array.isArray(snapshot.tasks)) setAllTasks(snapshot.tasks);
          if (Array.isArray(snapshot.projects)) {
            setAllProjects(snapshot.projects);
          }
          if (Array.isArray(snapshot.workspaces) && snapshot.workspaces.length) {
            setWorkspaces(
              snapshot.workspaces.map((workspace) => ({
                ...workspace,
                currency: workspace.currency || "USD",
              })),
            );
            setActiveWorkspaceId(
              snapshot.activeWorkspaceId ??
                snapshot.workspaces.find((item) => !item.archived)?.id ??
                snapshot.workspaces[0].id,
            );
          }
          if (Array.isArray(snapshot.people)) setAllPeople(snapshot.people);
          if (Array.isArray(snapshot.members)) {
            setMembers(
              snapshot.members.map((member) => ({
                ...member,
                hourlyRate: Number(member.hourlyRate ?? 0),
              })),
            );
          }
          if (Array.isArray(snapshot.invitations)) {
            setInvitations(snapshot.invitations);
          }
          if (Array.isArray(snapshot.notifications)) {
            setNotifications(snapshot.notifications);
          }
          if (Array.isArray(snapshot.timeEntries)) {
            setAllTimeEntries(snapshot.timeEntries);
          }
          if (snapshot.peopleByWorkspace) {
            setPeopleByWorkspace(snapshot.peopleByWorkspace);
          }
          if (snapshot.settings) setSettings(snapshot.settings);
        }
      } catch (error) {
        console.warn("No se pudo restaurar la demo guardada:", error);
      } finally {
        setDemoReady(true);
      }
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [refresh]);

  useEffect(() => {
    if (mode !== "demo" || !demoReady) return;
    window.localStorage.setItem(
      demoStorageKey,
      JSON.stringify({
        tasks: allTasks,
        projects: allProjects,
        workspaces,
        people: allPeople,
        members,
        invitations,
        notifications,
        timeEntries: allTimeEntries,
        peopleByWorkspace,
        activeWorkspaceId,
        settings,
      }),
    );
  }, [
    activeWorkspaceId,
    allPeople,
    allProjects,
    allTasks,
    allTimeEntries,
    demoReady,
    invitations,
    members,
    mode,
    notifications,
    peopleByWorkspace,
    settings,
    workspaces,
  ]);

  const people = useMemo(() => {
    const memberIds = peopleByWorkspace[activeWorkspaceId];
    if (!memberIds) {
      return allPeople.filter((person) => person.id === currentUserId);
    }
    const idSet = new Set(memberIds);
    return allPeople.filter((person) => idSet.has(person.id));
  }, [activeWorkspaceId, allPeople, currentUserId, peopleByWorkspace]);

  const workspaceMembers = useMemo(
    () => members.filter((member) => member.workspaceId === activeWorkspaceId),
    [activeWorkspaceId, members],
  );
  const workspaceInvitations = useMemo(
    () =>
      invitations.filter(
        (invitation) => invitation.workspaceId === activeWorkspaceId,
      ),
    [activeWorkspaceId, invitations],
  );
  const projects = useMemo(
    () =>
      allProjects.filter(
        (project) => project.workspaceId === activeWorkspaceId,
      ),
    [activeWorkspaceId, allProjects],
  );
  const projectIds = useMemo(
    () => new Set(projects.map((project) => project.id)),
    [projects],
  );
  const tasks = useMemo(
    () => allTasks.filter((task) => projectIds.has(task.project.id)),
    [allTasks, projectIds],
  );
  const timeEntries = useMemo(
    () =>
      allTimeEntries.filter(
        (entry) => entry.workspaceId === activeWorkspaceId,
      ),
    [activeWorkspaceId, allTimeEntries],
  );

  const updateTask = useCallback(
    async (taskId: string, input: UpdateTaskInput) => {
      setAllTasks((current) =>
        current.map((task) => {
          if (task.id !== taskId) return task;
          const assignee =
            input.assigneeId === undefined
              ? task.assignee
              : (allPeople.find(
                  (person) => person.id === input.assigneeId,
                ) ?? null);
          const nextDueDate =
            input.dueDate === undefined ? task.dueDate : input.dueDate;
          return {
            ...task,
            ...input,
            assignee,
            dueDate: nextDueDate,
            dueLabel: formatDueLabel(nextDueDate),
            updatedAt: "Ahora",
          };
        }),
      );
      if (mode === "supabase") {
        try {
          await updateRemoteTask(taskId, input);
        } catch (error) {
          await refresh();
          throw error;
        }
      }
    },
    [allPeople, mode, refresh],
  );

  const updateStatus = useCallback(
    (taskId: string, status: TaskStatus) => updateTask(taskId, { status }),
    [updateTask],
  );

  const deleteTask = useCallback(
    async (taskId: string) => {
      const descendantIds = new Set([taskId]);
      let changed = true;
      while (changed) {
        changed = false;
        allTasks.forEach((task) => {
          if (
            task.parentTaskId &&
            descendantIds.has(task.parentTaskId) &&
            !descendantIds.has(task.id)
          ) {
            descendantIds.add(task.id);
            changed = true;
          }
        });
      }
      setAllTasks((current) =>
        current.filter((task) => !descendantIds.has(task.id)),
      );
      setAllTimeEntries((current) =>
        current.filter((entry) => !descendantIds.has(entry.taskId)),
      );
      if (mode === "supabase") {
        try {
          await deleteRemoteTask(taskId);
        } catch (error) {
          await refresh();
          throw error;
        }
      }
    },
    [allTasks, mode, refresh],
  );

  const addComment = useCallback(
    async (taskId: string, body: string) => {
      const author =
        allPeople.find((person) => person.id === currentUserId) ?? demoPeople[0];
      setAllTasks((current) =>
        current.map((task) =>
          task.id === taskId
            ? {
                ...task,
                comments: [
                  ...task.comments,
                  {
                    id: localId("comment"),
                    author,
                    body,
                    createdAt: "Ahora",
                  },
                ],
                updatedAt: "Ahora",
              }
            : task,
        ),
      );
      if (mode === "supabase") {
        try {
          await addRemoteComment(taskId, body);
          await refresh();
        } catch (error) {
          await refresh();
          throw error;
        }
      }
    },
    [allPeople, currentUserId, mode, refresh],
  );

  const deleteComment = useCallback(
    async (taskId: string, commentId: string) => {
      setAllTasks((current) =>
        current.map((task) =>
          task.id === taskId
            ? {
                ...task,
                comments: task.comments.filter(
                  (comment) => comment.id !== commentId,
                ),
              }
            : task,
        ),
      );
      if (mode === "supabase") {
        try {
          await deleteRemoteComment(commentId);
        } catch (error) {
          await refresh();
          throw error;
        }
      }
    },
    [mode, refresh],
  );

  const createTask = useCallback(
    async (input: NewTaskInput) => {
      const project =
        allProjects.find((item) => item.id === input.projectId) ?? projects[0];
      if (!project) throw new Error("Creá un proyecto antes de sumar tareas.");
      const assignee =
        allPeople.find((person) => person.id === input.assigneeId) ?? null;
      const task: Task = {
        id: localId("task"),
        code: nextTaskCode(allTasks),
        title: input.title,
        description: input.description,
        project,
        parentTaskId: input.parentTaskId ?? null,
        status: input.status ?? "nuevo",
        priority: input.priority,
        assignee,
        client: input.client || "Sin cliente",
        dueDate: input.dueDate || null,
        dueLabel: formatDueLabel(input.dueDate || null),
        updatedAt: "Ahora",
        tags: [],
        comments: [],
        attachments: [],
      };
      setAllTasks((current) => [task, ...current]);
      if (mode === "supabase") {
        try {
          const remoteId = await createRemoteTask(input);
          await refresh();
          return { ...task, id: remoteId ?? task.id };
        } catch (error) {
          await refresh();
          throw error;
        }
      }
      return task;
    },
    [allPeople, allProjects, allTasks, mode, projects, refresh],
  );

  const createProject = useCallback(
    async (input: NewProjectInput) => {
      if (mode === "supabase") {
        const project = await createRemoteProject(input);
        await refresh();
        return project;
      }
      const project: Project = {
        id: localId("project"),
        name: input.name,
        color: input.color,
        description: input.description,
        workspaceId: input.workspaceId,
        archived: false,
      };
      setAllProjects((current) => [...current, project]);
      return project;
    },
    [mode, refresh],
  );

  const updateProject = useCallback(
    async (projectId: string, input: UpdateProjectInput) => {
      setAllProjects((current) =>
        current.map((project) =>
          project.id === projectId ? { ...project, ...input } : project,
        ),
      );
      setAllTasks((current) =>
        current.map((task) =>
          task.project.id === projectId
            ? { ...task, project: { ...task.project, ...input } }
            : task,
        ),
      );
      if (mode === "supabase") {
        try {
          await updateRemoteProject(projectId, input);
        } catch (error) {
          await refresh();
          throw error;
        }
      }
    },
    [mode, refresh],
  );

  const deleteProject = useCallback(
    async (projectId: string) => {
      setAllProjects((current) =>
        current.filter((project) => project.id !== projectId),
      );
      setAllTasks((current) =>
        current.filter((task) => task.project.id !== projectId),
      );
      setAllTimeEntries((current) =>
        current.filter((entry) => entry.projectId !== projectId),
      );
      if (mode === "supabase") {
        try {
          await deleteRemoteProject(projectId);
        } catch (error) {
          await refresh();
          throw error;
        }
      }
    },
    [mode, refresh],
  );

  const createWorkspace = useCallback(
    async (name: string) => {
      if (mode === "supabase") {
        const workspaceId = await createRemoteWorkspace(name);
        await refresh();
        if (workspaceId) setActiveWorkspaceId(workspaceId);
        return workspaceId;
      }
      const workspace: Workspace = {
        id: localId("workspace"),
        name,
        memberCount: 1,
        role: "owner",
        archived: false,
        currency: "USD",
      };
      const currentPerson =
        allPeople.find((person) => person.id === currentUserId) ?? demoPeople[0];
      setWorkspaces((current) => [...current, workspace]);
      setPeopleByWorkspace((current) => ({
        ...current,
        [workspace.id]: [currentUserId],
      }));
      setMembers((current) => [
        ...current,
        {
          workspaceId: workspace.id,
          user: currentPerson,
          role: "owner",
          joinedAt: "Ahora",
          hourlyRate: 0,
        },
      ]);
      setActiveWorkspaceId(workspace.id);
      return workspace.id;
    },
    [allPeople, currentUserId, mode, refresh],
  );

  const updateWorkspace = useCallback(
    async (
      workspaceId: string,
      input: UpdateWorkspaceInput,
    ) => {
      setWorkspaces((current) =>
        current.map((workspace) =>
          workspace.id === workspaceId ? { ...workspace, ...input } : workspace,
        ),
      );
      if (input.archived && workspaceId === activeWorkspaceId) {
        setActiveWorkspaceId(
          workspaces.find(
            (workspace) => workspace.id !== workspaceId && !workspace.archived,
          )?.id ?? "",
        );
      }
      if (mode === "supabase") {
        try {
          await updateRemoteWorkspace(workspaceId, input);
        } catch (error) {
          await refresh();
          throw error;
        }
      }
    },
    [activeWorkspaceId, mode, refresh, workspaces],
  );

  const deleteWorkspace = useCallback(
    async (workspaceId: string) => {
      const workspaceProjectIds = new Set(
        allProjects
          .filter((project) => project.workspaceId === workspaceId)
          .map((project) => project.id),
      );
      setWorkspaces((current) =>
        current.filter((workspace) => workspace.id !== workspaceId),
      );
      setAllProjects((current) =>
        current.filter((project) => project.workspaceId !== workspaceId),
      );
      setAllTasks((current) =>
        current.filter((task) => !workspaceProjectIds.has(task.project.id)),
      );
      setAllTimeEntries((current) =>
        current.filter((entry) => entry.workspaceId !== workspaceId),
      );
      setMembers((current) =>
        current.filter((member) => member.workspaceId !== workspaceId),
      );
      setInvitations((current) =>
        current.filter(
          (invitation) => invitation.workspaceId !== workspaceId,
        ),
      );
      setActiveWorkspaceId(
        workspaces.find((workspace) => workspace.id !== workspaceId)?.id ?? "",
      );
      if (mode === "supabase") {
        try {
          await deleteRemoteWorkspace(workspaceId);
        } catch (error) {
          await refresh();
          throw error;
        }
      }
    },
    [allProjects, mode, refresh, workspaces],
  );

  const updateMemberRole = useCallback(
    async (userId: string, role: TeamRole) => {
      setMembers((current) =>
        current.map((member) =>
          member.workspaceId === activeWorkspaceId &&
          member.user.id === userId
            ? { ...member, role }
            : member,
        ),
      );
      if (mode === "supabase") {
        try {
          await updateRemoteMemberRole(activeWorkspaceId, userId, role);
        } catch (error) {
          await refresh();
          throw error;
        }
      }
    },
    [activeWorkspaceId, mode, refresh],
  );

  const updateMemberHourlyRate = useCallback(
    async (userId: string, hourlyRate: number) => {
      setMembers((current) =>
        current.map((member) =>
          member.workspaceId === activeWorkspaceId &&
          member.user.id === userId
            ? { ...member, hourlyRate }
            : member,
        ),
      );
      if (mode === "supabase") {
        try {
          await updateRemoteMemberHourlyRate(
            activeWorkspaceId,
            userId,
            hourlyRate,
          );
        } catch (error) {
          await refresh();
          throw error;
        }
      }
    },
    [activeWorkspaceId, mode, refresh],
  );

  const removeMember = useCallback(
    async (userId: string) => {
      setMembers((current) =>
        current.filter(
          (member) =>
            !(
              member.workspaceId === activeWorkspaceId &&
              member.user.id === userId
            ),
        ),
      );
      setPeopleByWorkspace((current) => ({
        ...current,
        [activeWorkspaceId]: (current[activeWorkspaceId] ?? []).filter(
          (id) => id !== userId,
        ),
      }));
      if (mode === "supabase") {
        try {
          await removeRemoteMember(activeWorkspaceId, userId);
        } catch (error) {
          await refresh();
          throw error;
        }
      }
    },
    [activeWorkspaceId, mode, refresh],
  );

  const inviteMember = useCallback(
    async (
      email: string,
      role: Exclude<TeamRole, "owner">,
    ): Promise<{ invitation: TeamInvitation; emailed: boolean }> => {
      if (mode === "supabase") {
        const result = await createRemoteInvitation(
          activeWorkspaceId,
          email,
          role,
        );
        await refresh();
        return result;
      }
      const invitation: TeamInvitation = {
        id: localId("invite"),
        workspaceId: activeWorkspaceId,
        email: email.toLowerCase(),
        role,
        token: localId("token"),
        createdAt: "Ahora",
        expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        acceptedAt: null,
      };
      setInvitations((current) => [invitation, ...current]);
      return { invitation, emailed: false };
    },
    [activeWorkspaceId, mode, refresh],
  );

  const revokeInvitation = useCallback(
    async (id: string) => {
      setInvitations((current) =>
        current.filter((invitation) => invitation.id !== id),
      );
      if (mode === "supabase") {
        try {
          await revokeRemoteInvitation(id);
        } catch (error) {
          await refresh();
          throw error;
        }
      }
    },
    [mode, refresh],
  );

  const uploadAttachment = useCallback(
    async (task: Task, file: File) => {
      if (file.size > 10 * 1024 * 1024) {
        throw new Error("El archivo supera el límite de 10 MB.");
      }
      const uploader =
        allPeople.find((person) => person.id === currentUserId) ?? demoPeople[0];
      if (mode === "supabase") {
        await uploadRemoteAttachment(task, file);
        await refresh();
        return;
      }
      const attachment: TaskAttachment = {
        id: localId("attachment"),
        taskId: task.id,
        name: file.name,
        size: file.size,
        mimeType: file.type || "application/octet-stream",
        storagePath: null,
        dataUrl: await readFileAsDataUrl(file),
        createdAt: "Ahora",
        uploader,
      };
      setAllTasks((current) =>
        current.map((item) =>
          item.id === task.id
            ? { ...item, attachments: [...item.attachments, attachment] }
            : item,
        ),
      );
    },
    [allPeople, currentUserId, mode, refresh],
  );

  const deleteAttachment = useCallback(
    async (taskId: string, attachment: TaskAttachment) => {
      setAllTasks((current) =>
        current.map((task) =>
          task.id === taskId
            ? {
                ...task,
                attachments: task.attachments.filter(
                  (item) => item.id !== attachment.id,
                ),
              }
            : task,
        ),
      );
      if (mode === "supabase") {
        try {
          await deleteRemoteAttachment(attachment);
        } catch (error) {
          await refresh();
          throw error;
        }
      }
    },
    [mode, refresh],
  );

  const openAttachment = useCallback(
    async (attachment: TaskAttachment) => {
      let href = attachment.dataUrl;
      let objectUrl: string | null = null;
      if (mode === "supabase") {
        const blob = await downloadRemoteAttachment(attachment);
        if (!blob) throw new Error("No se pudo descargar el archivo.");
        objectUrl = URL.createObjectURL(blob);
        href = objectUrl;
      }
      if (!href) throw new Error("El archivo no está disponible.");
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = attachment.name;
      anchor.click();
      if (objectUrl) window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    },
    [mode],
  );

  const markNotificationRead = useCallback(
    async (id: string) => {
      const now = new Date().toISOString();
      setNotifications((current) =>
        current.map((notification) =>
          notification.id === id
            ? { ...notification, readAt: now }
            : notification,
        ),
      );
      if (mode === "supabase") await markRemoteNotificationRead(id);
    },
    [mode],
  );

  const markAllNotificationsRead = useCallback(async () => {
    const now = new Date().toISOString();
    setNotifications((current) =>
      current.map((notification) => ({ ...notification, readAt: now })),
    );
    if (mode === "supabase") await markAllRemoteNotificationsRead();
  }, [mode]);

  const updateProfile = useCallback(
    async (name: string) => {
      setAllPeople((current) =>
        current.map((person) =>
          person.id === currentUserId
            ? {
                ...person,
                name,
                initials: name
                  .split(" ")
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((part) => part[0])
                  .join("")
                  .toUpperCase(),
              }
            : person,
        ),
      );
      if (mode === "supabase") {
        try {
          await updateRemoteProfile(name);
        } catch (error) {
          await refresh();
          throw error;
        }
      }
    },
    [currentUserId, mode, refresh],
  );

  const updateSettings = useCallback((input: Partial<AppSettings>) => {
    setSettings((current) => ({ ...current, ...input }));
  }, []);

  const startTimer = useCallback(
    async (taskId: string, description: string, billable: boolean) => {
      const task = allTasks.find((item) => item.id === taskId);
      if (!task) throw new Error("La tarea no existe.");
      const user =
        allPeople.find((person) => person.id === currentUserId) ?? demoPeople[0];
      const hourlyRate =
        members.find(
          (member) =>
            member.workspaceId === activeWorkspaceId &&
            member.user.id === currentUserId,
        )?.hourlyRate ?? 0;
      const now = new Date();
      const nowIso = now.toISOString();
      const entry: TimeEntry = {
        id: localId("time"),
        workspaceId: activeWorkspaceId,
        taskId,
        taskCode: task.code,
        taskTitle: task.title,
        projectId: task.project.id,
        projectName: task.project.name,
        user,
        description: description.trim(),
        startedAt: nowIso,
        endedAt: null,
        durationSeconds: 0,
        billable,
        hourlyRate,
        createdAt: "Ahora",
      };
      setAllTimeEntries((current) => [
        entry,
        ...current.map((item) =>
          item.workspaceId === activeWorkspaceId &&
          item.user.id === currentUserId &&
          !item.endedAt
            ? {
                ...item,
                endedAt: nowIso,
                durationSeconds: Math.max(
                  item.durationSeconds,
                  Math.floor(
                    (now.getTime() - new Date(item.startedAt).getTime()) / 1000,
                  ),
                ),
              }
            : item,
        ),
      ]);
      if (mode === "supabase") {
        try {
          await startRemoteTimer(taskId, description, billable);
          await refresh();
        } catch (error) {
          await refresh();
          throw error;
        }
      }
      return entry;
    },
    [
      activeWorkspaceId,
      allPeople,
      allTasks,
      currentUserId,
      members,
      mode,
      refresh,
    ],
  );

  const stopTimer = useCallback(
    async (entryId: string) => {
      const now = new Date();
      setAllTimeEntries((current) =>
        current.map((entry) =>
          entry.id === entryId && !entry.endedAt
            ? {
                ...entry,
                endedAt: now.toISOString(),
                durationSeconds: Math.max(
                  entry.durationSeconds,
                  Math.floor(
                    (now.getTime() - new Date(entry.startedAt).getTime()) / 1000,
                  ),
                ),
              }
            : entry,
        ),
      );
      if (mode === "supabase") {
        try {
          await stopRemoteTimer(entryId);
          await refresh();
        } catch (error) {
          await refresh();
          throw error;
        }
      }
    },
    [mode, refresh],
  );

  const createManualTimeEntry = useCallback(
    async (input: NewManualTimeEntryInput) => {
      const task = allTasks.find((item) => item.id === input.taskId);
      if (!task) throw new Error("La tarea no existe.");
      const user =
        allPeople.find((person) => person.id === currentUserId) ?? demoPeople[0];
      const hourlyRate =
        members.find(
          (member) =>
            member.workspaceId === activeWorkspaceId &&
            member.user.id === currentUserId,
        )?.hourlyRate ?? 0;
      const startedAt = new Date(`${input.date}T12:00:00`);
      const entry: TimeEntry = {
        id: localId("time"),
        workspaceId: activeWorkspaceId,
        taskId: input.taskId,
        taskCode: task.code,
        taskTitle: task.title,
        projectId: task.project.id,
        projectName: task.project.name,
        user,
        description: input.description.trim(),
        startedAt: startedAt.toISOString(),
        endedAt: new Date(
          startedAt.getTime() + input.durationSeconds * 1000,
        ).toISOString(),
        durationSeconds: input.durationSeconds,
        billable: input.billable,
        hourlyRate,
        createdAt: "Ahora",
      };
      setAllTimeEntries((current) => [entry, ...current]);
      if (mode === "supabase") {
        try {
          await createRemoteManualTimeEntry(input);
          await refresh();
        } catch (error) {
          await refresh();
          throw error;
        }
      }
      return entry;
    },
    [
      activeWorkspaceId,
      allPeople,
      allTasks,
      currentUserId,
      members,
      mode,
      refresh,
    ],
  );

  const deleteTimeEntry = useCallback(
    async (entryId: string) => {
      setAllTimeEntries((current) =>
        current.filter((entry) => entry.id !== entryId),
      );
      if (mode === "supabase") {
        try {
          await deleteRemoteTimeEntry(entryId);
        } catch (error) {
          await refresh();
          throw error;
        }
      }
    },
    [mode, refresh],
  );

  const resetDemo = useCallback(() => {
    if (mode !== "demo") return;
    window.localStorage.removeItem(demoStorageKey);
    setAllTasks(initialTasks);
    setAllProjects(demoProjects);
    setWorkspaces(demoWorkspaces);
    setAllPeople(demoPeople);
    setMembers(demoMembers);
    setInvitations(demoInvitations);
    setNotifications(demoNotifications);
    setAllTimeEntries(demoTimeEntries);
    setPeopleByWorkspace({
      [demoWorkspaces[0].id]: demoPeople.map((person) => person.id),
    });
    setActiveWorkspaceId(demoWorkspaces[0].id);
    setSettings(defaultSettings);
  }, [mode]);

  return {
    tasks,
    projects,
    workspaces,
    people,
    members: workspaceMembers,
    invitations: workspaceInvitations,
    notifications,
    timeEntries,
    currentUserId,
    activeWorkspaceId,
    settings,
    mode,
    syncing,
    setActiveWorkspaceId,
    updateTask,
    updateStatus,
    deleteTask,
    addComment,
    deleteComment,
    createTask,
    createProject,
    updateProject,
    deleteProject,
    createWorkspace,
    updateWorkspace,
    deleteWorkspace,
    updateMemberRole,
    updateMemberHourlyRate,
    removeMember,
    inviteMember,
    revokeInvitation,
    uploadAttachment,
    deleteAttachment,
    openAttachment,
    markNotificationRead,
    markAllNotificationsRead,
    updateProfile,
    updateSettings,
    startTimer,
    stopTimer,
    createManualTimeEntry,
    deleteTimeEntry,
    resetDemo,
  };
}
