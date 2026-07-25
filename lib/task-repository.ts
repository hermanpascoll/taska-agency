import { createClient } from "@/lib/supabase/client";
import { formatDueLabel, safeStorageName } from "@/lib/task-utils";
import type {
  AppNotification,
  Client,
  NewClientInput,
  NewManualTimeEntryInput,
  NewProjectInput,
  NewTaskInput,
  Person,
  Project,
  Task,
  TaskAttachment,
  TaskComment,
  TaskPriority,
  TaskStatus,
  TeamInvitation,
  TeamRole,
  TimeEntry,
  UpdateClientInput,
  UpdateProjectInput,
  UpdateTaskInput,
  UpdateWorkspaceInput,
  Workspace,
  WorkspaceMember,
} from "@/lib/types";

type RemotePerson = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
};

type RemoteProject = {
  id: string;
  name: string;
  color: string;
  team_id: string;
  description: string | null;
  client_id: string | null;
  client: RemoteClient | RemoteClient[] | null;
  archived: boolean;
};

type RemoteClient = {
  id: string;
  team_id: string;
  name: string;
  email: string | null;
  notes: string | null;
  archived: boolean;
};

type RemoteComment = {
  id: string;
  body: string;
  created_at: string;
  author: RemotePerson | RemotePerson[] | null;
};

type RemoteAttachment = {
  id: string;
  task_id: string;
  name: string;
  size_bytes: number;
  mime_type: string;
  storage_path: string;
  created_at: string;
  uploader: RemotePerson | RemotePerson[] | null;
};

type RemoteTask = {
  id: string;
  task_number: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  start_date: string | null;
  due_date: string | null;
  client_name: string | null;
  client_email: string | null;
  updated_at: string;
  tags: string[] | null;
  parent_task_id: string | null;
  projects: RemoteProject | RemoteProject[] | null;
  task_projects:
    | {
        project: RemoteProject | RemoteProject[] | null;
      }[]
    | null;
  assignee: RemotePerson | RemotePerson[] | null;
  comments: RemoteComment[] | null;
  attachments: RemoteAttachment[] | null;
};

type RemoteMembership = {
  team_id: string;
  user_id: string;
  role: TeamRole;
  joined_at: string;
  hourly_rate: number;
  profiles: RemotePerson | RemotePerson[] | null;
};

type RemoteTimeEntry = {
  id: string;
  team_id: string;
  task_id: string;
  description: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  billable: boolean;
  hourly_rate: number;
  created_at: string;
  task:
    | {
        task_number: number;
        title: string;
        project:
          | { id: string; name: string }
          | { id: string; name: string }[]
          | null;
      }
    | {
        task_number: number;
        title: string;
        project:
          | { id: string; name: string }
          | { id: string; name: string }[]
          | null;
      }[]
    | null;
  user: RemotePerson | RemotePerson[] | null;
};

export type LoadedWorkspace = {
  currentUserId: string;
  workspaces: Workspace[];
  clients: Client[];
  projects: Project[];
  people: Person[];
  peopleByWorkspace: Record<string, string[]>;
  members: WorkspaceMember[];
  invitations: TeamInvitation[];
  notifications: AppNotification[];
  timeEntries: TimeEntry[];
  tasks: Task[];
};

const avatarColors = [
  "#5E5CE6",
  "#30B0C7",
  "#FF9F0A",
  "#BF5AF2",
  "#32D74B",
  "#FF375F",
];

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function mapClient(row: RemoteClient): Client {
  return {
    id: row.id,
    name: row.name,
    email: row.email ?? "",
    notes: row.notes ?? "",
    workspaceId: row.team_id,
    archived: row.archived,
  };
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function personFromRemote(person: RemotePerson | null, index = 0): Person | null {
  if (!person) return null;
  const name = person.full_name || person.email?.split("@")[0] || "Sin nombre";
  return {
    id: person.id,
    name,
    initials: initials(name),
    color: avatarColors[index % avatarColors.length],
    role: person.role || "Equipo creativo",
    email: person.email ?? undefined,
  };
}

function relativeTime(value: string) {
  const minutes = Math.max(
    1,
    Math.round((Date.now() - new Date(value).getTime()) / 60_000),
  );
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Hace ${hours} h`;
  return new Intl.DateTimeFormat("es-UY", {
    day: "numeric",
    month: "short",
  }).format(new Date(value));
}

function mapProject(project: RemoteProject): Project {
  const client = one(project.client);
  return {
    id: project.id,
    name: project.name,
    color: project.color,
    workspaceId: project.team_id,
    description: project.description ?? undefined,
    clientId: project.client_id,
    clientName: client?.name ?? null,
    archived: project.archived,
  };
}

function fallbackPerson(): Person {
  return {
    id: "unknown",
    name: "Colaborador",
    initials: "CO",
    color: "#8E8E93",
  };
}

function mapAttachment(
  attachment: RemoteAttachment,
  index: number,
): TaskAttachment {
  return {
    id: attachment.id,
    taskId: attachment.task_id,
    name: attachment.name,
    size: Number(attachment.size_bytes),
    mimeType: attachment.mime_type,
    storagePath: attachment.storage_path,
    createdAt: relativeTime(attachment.created_at),
    uploader:
      personFromRemote(one(attachment.uploader), index) ?? fallbackPerson(),
  };
}

function mapTask(row: RemoteTask, index: number): Task {
  const remoteProject = one(row.projects);
  const project = remoteProject
    ? mapProject(remoteProject)
    : ({
        id: "unknown",
        name: "Sin proyecto",
        color: "#8E8E93",
        workspaceId: "unknown",
        clientId: null,
        clientName: null,
        archived: false,
      } satisfies Project);
  const relatedProjects = (row.task_projects ?? [])
    .map((relation) => one(relation.project))
    .filter((item): item is RemoteProject => Boolean(item))
    .map(mapProject);
  const projects = [project, ...relatedProjects].filter(
    (item, itemIndex, items) =>
      items.findIndex((candidate) => candidate.id === item.id) === itemIndex,
  );

  const comments: TaskComment[] = (row.comments ?? []).map((comment, i) => ({
    id: comment.id,
    body: comment.body,
    createdAt: relativeTime(comment.created_at),
    author:
      personFromRemote(one(comment.author), i) ?? fallbackPerson(),
  }));

  return {
    id: row.id,
    code: `AG-${String(row.task_number).padStart(3, "0")}`,
    title: row.title,
    description: row.description ?? "",
    project,
    projects,
    parentTaskId: row.parent_task_id,
    status: row.status,
    priority: row.priority,
    assignee: personFromRemote(one(row.assignee), index),
    client: project.clientName || row.client_name || "Sin cliente",
    clientEmail: row.client_email ?? undefined,
    startDate: row.start_date,
    dueDate: row.due_date,
    dueLabel: formatDueLabel(row.due_date),
    updatedAt: relativeTime(row.updated_at),
    tags: row.tags ?? [],
    comments,
    attachments: (row.attachments ?? []).map(mapAttachment),
  };
}

function mapTimeEntry(row: RemoteTimeEntry, index: number): TimeEntry {
  const task = one(row.task);
  const project = task ? one(task.project) : null;
  return {
    id: row.id,
    workspaceId: row.team_id,
    taskId: row.task_id,
    taskCode: task
      ? `AG-${String(task.task_number).padStart(3, "0")}`
      : "Sin código",
    taskTitle: task?.title ?? "Tarea eliminada",
    projectId: project?.id ?? "unknown",
    projectName: project?.name ?? "Sin proyecto",
    user: personFromRemote(one(row.user), index) ?? fallbackPerson(),
    description: row.description,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationSeconds: Number(row.duration_seconds),
    billable: row.billable,
    hourlyRate: Number(row.hourly_rate),
    createdAt: relativeTime(row.created_at),
  };
}

export async function loadWorkspace(): Promise<LoadedWorkspace | null> {
  const supabase = createClient();
  if (!supabase) return null;

  const bootstrap = await supabase.rpc("bootstrap_workspace");
  if (bootstrap.error) throw bootstrap.error;

  const [
    { data: sessionData },
    workspacesResult,
    membershipsResult,
    clientsResult,
    projectsResult,
    profilesResult,
    tasksResult,
    invitationsResult,
    notificationsResult,
    timeEntriesResult,
  ] = await Promise.all([
    supabase.auth.getSession(),
    supabase
      .from("teams")
      .select("id, name, archived, currency")
      .order("created_at"),
    supabase
      .from("team_members")
      .select(
        "team_id, user_id, role, joined_at, hourly_rate, profiles(id, full_name, email, role)",
      ),
    supabase
      .from("clients")
      .select("id, team_id, name, email, notes, archived")
      .order("name"),
    supabase
      .from("projects")
      .select(
        "id, team_id, name, color, description, archived, client_id, client:clients(id, team_id, name, email, notes, archived)",
      )
      .order("name"),
    supabase
      .from("profiles")
      .select("id, full_name, email, role")
      .order("full_name"),
    supabase
      .from("tasks")
      .select(
        "id, task_number, title, description, status, priority, start_date, due_date, client_name, client_email, updated_at, tags, parent_task_id, projects!tasks_project_id_fkey(id, name, color, team_id, description, archived, client_id, client:clients(id, team_id, name, email, notes, archived)), task_projects(project:projects(id, name, color, team_id, description, archived, client_id, client:clients(id, team_id, name, email, notes, archived))), assignee:profiles!tasks_assignee_id_fkey(id, full_name, email, role), comments(id, body, created_at, author:profiles!comments_author_id_fkey(id, full_name, email, role)), attachments:task_attachments(id, task_id, name, size_bytes, mime_type, storage_path, created_at, uploader:profiles!task_attachments_uploaded_by_fkey(id, full_name, email, role))",
      )
      .order("updated_at", { ascending: false }),
    supabase
      .from("team_invitations")
      .select(
        "id, team_id, email, role, token, created_at, expires_at, accepted_at",
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("notifications")
      .select("id, task_id, title, body, created_at, read_at")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("time_entries")
      .select(
        "id, team_id, task_id, description, started_at, ended_at, duration_seconds, billable, hourly_rate, created_at, task:tasks!time_entries_task_id_fkey(task_number, title, project:projects!tasks_project_id_fkey(id, name)), user:profiles!time_entries_user_id_fkey(id, full_name, email, role)",
      )
      .order("started_at", { ascending: false })
      .limit(2000),
  ]);

  for (const result of [
    workspacesResult,
    membershipsResult,
    clientsResult,
    projectsResult,
    profilesResult,
    tasksResult,
    invitationsResult,
    notificationsResult,
    timeEntriesResult,
  ]) {
    if (result.error) throw result.error;
  }

  const currentUserId = sessionData.session?.user.id ?? "";
  const memberships = (membershipsResult.data ?? []) as unknown as RemoteMembership[];
  const people = ((profilesResult.data ?? []) as RemotePerson[]).map(
    (person, index) => personFromRemote(person, index)!,
  );
  const personMap = new Map(people.map((person) => [person.id, person]));
  const peopleByWorkspace = memberships.reduce((groups, membership) => {
    groups[membership.team_id] = [
      ...(groups[membership.team_id] ?? []),
      membership.user_id,
    ];
    return groups;
  }, {} as Record<string, string[]>);

  const members: WorkspaceMember[] = memberships.map((membership, index) => ({
    workspaceId: membership.team_id,
    user:
      personMap.get(membership.user_id) ??
      personFromRemote(one(membership.profiles), index) ??
      fallbackPerson(),
    role: membership.role,
    hourlyRate: Number(membership.hourly_rate),
    joinedAt: new Intl.DateTimeFormat("es-UY", {
      month: "long",
      year: "numeric",
    }).format(new Date(membership.joined_at)),
  }));

  const memberCounts = memberships.reduce((counts, membership) => {
    counts[membership.team_id] = (counts[membership.team_id] ?? 0) + 1;
    return counts;
  }, {} as Record<string, number>);
  const roleByWorkspace = memberships.reduce((roles, membership) => {
    if (membership.user_id === currentUserId) {
      roles[membership.team_id] = membership.role;
    }
    return roles;
  }, {} as Record<string, TeamRole>);

  const remoteWorkspaces = (workspacesResult.data ?? []) as {
    id: string;
    name: string;
    archived: boolean;
    currency: string;
  }[];
  const remoteInvitations = (invitationsResult.data ?? []) as {
    id: string;
    team_id: string;
    email: string;
    role: Exclude<TeamRole, "owner">;
    token: string;
    created_at: string;
    expires_at: string;
    accepted_at: string | null;
  }[];
  const remoteNotifications = (notificationsResult.data ?? []) as {
    id: string;
    task_id: string | null;
    title: string;
    body: string;
    created_at: string;
    read_at: string | null;
  }[];

  return {
    currentUserId,
    workspaces: remoteWorkspaces.map((workspace) => ({
      id: workspace.id,
      name: workspace.name,
      memberCount: memberCounts[workspace.id] ?? 1,
      role: roleByWorkspace[workspace.id] ?? "viewer",
      archived: workspace.archived,
      currency: workspace.currency || "USD",
    })),
    clients: ((clientsResult.data ?? []) as RemoteClient[]).map(mapClient),
    projects: ((projectsResult.data ?? []) as RemoteProject[]).map(mapProject),
    people,
    peopleByWorkspace,
    members,
    invitations: remoteInvitations.map((invitation) => ({
      id: invitation.id,
      workspaceId: invitation.team_id,
      email: invitation.email,
      role: invitation.role,
      token: invitation.token,
      createdAt: relativeTime(invitation.created_at),
      expiresAt: invitation.expires_at,
      acceptedAt: invitation.accepted_at,
    })),
    notifications: remoteNotifications.map((notification) => ({
      id: notification.id,
      taskId: notification.task_id,
      title: notification.title,
      body: notification.body,
      createdAt: relativeTime(notification.created_at),
      readAt: notification.read_at,
    })),
    timeEntries: (
      (timeEntriesResult.data ?? []) as unknown as RemoteTimeEntry[]
    ).map(mapTimeEntry),
    tasks: ((tasksResult.data ?? []) as unknown as RemoteTask[]).map(mapTask),
  };
}

export async function createRemoteTask(input: NewTaskInput) {
  const supabase = createClient();
  if (!supabase) return;
  const projectIds = [...new Set(input.projectIds)].filter(Boolean);
  if (!projectIds.length || !projectIds.includes(input.projectId)) {
    throw new Error("Seleccioná al menos un proyecto válido.");
  }
  const { data: selectedProjects, error: projectError } = await supabase
    .from("projects")
    .select("id, team_id")
    .in("id", projectIds);
  if (projectError) throw projectError;
  const teamIds = new Set(
    ((selectedProjects ?? []) as { id: string; team_id: string }[]).map(
      (project) => project.team_id,
    ),
  );
  if ((selectedProjects?.length ?? 0) !== projectIds.length || teamIds.size !== 1) {
    throw new Error("Todos los proyectos deben pertenecer al mismo espacio.");
  }
  const teamId = selectedProjects![0].team_id;

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      team_id: teamId,
      project_id: input.projectId,
      assignee_id: input.assigneeId || null,
      title: input.title,
      description: input.description,
      priority: input.priority,
      start_date: input.startDate || null,
      due_date: input.dueDate || null,
      client_name: input.client,
      status: input.status ?? "nuevo",
      parent_task_id: input.parentTaskId || null,
    })
    .select("id")
    .single();
  if (error) throw error;
  const relations = projectIds.map((projectId) => ({
    task_id: data.id,
    project_id: projectId,
    team_id: teamId,
  }));
  const relationResult = await supabase.from("task_projects").upsert(relations);
  if (relationResult.error) throw relationResult.error;
  return data.id as string;
}

export async function updateRemoteTask(id: string, input: UpdateTaskInput) {
  const supabase = createClient();
  if (!supabase) return;
  if (input.projectIds !== undefined) {
    const projectIds = [...new Set(input.projectIds)].filter(Boolean);
    if (!projectIds.length) {
      throw new Error("La tarea debe pertenecer al menos a un proyecto.");
    }
    const { data: selectedProjects, error: projectsError } = await supabase
      .from("projects")
      .select("id, team_id")
      .in("id", projectIds);
    if (projectsError) throw projectsError;
    const teamIds = new Set(
      ((selectedProjects ?? []) as { id: string; team_id: string }[]).map(
        (project) => project.team_id,
      ),
    );
    if ((selectedProjects?.length ?? 0) !== projectIds.length || teamIds.size !== 1) {
      throw new Error("Todos los proyectos deben pertenecer al mismo espacio.");
    }
    const teamId = selectedProjects![0].team_id;
    const deleteResult = await supabase
      .from("task_projects")
      .delete()
      .eq("task_id", id);
    if (deleteResult.error) throw deleteResult.error;
    const primaryResult = await supabase
      .from("tasks")
      .update({ project_id: projectIds[0] })
      .eq("id", id);
    if (primaryResult.error) throw primaryResult.error;
    const relationResult = await supabase.from("task_projects").upsert(
      projectIds.map((projectId) => ({
        task_id: id,
        project_id: projectId,
        team_id: teamId,
      })),
    );
    if (relationResult.error) throw relationResult.error;
  }
  const payload: Record<string, string | null> = {};
  if (input.title !== undefined) payload.title = input.title;
  if (input.description !== undefined) payload.description = input.description;
  if (input.status !== undefined) payload.status = input.status;
  if (input.priority !== undefined) payload.priority = input.priority;
  if (input.assigneeId !== undefined) payload.assignee_id = input.assigneeId;
  if (input.startDate !== undefined) payload.start_date = input.startDate;
  if (input.dueDate !== undefined) payload.due_date = input.dueDate;
  if (!Object.keys(payload).length) return;
  const { error } = await supabase.from("tasks").update(payload).eq("id", id);
  if (error) throw error;
}

export async function deleteRemoteTask(id: string) {
  const supabase = createClient();
  if (!supabase) return;
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) throw error;
}

export async function createRemoteProject(input: NewProjectInput) {
  const supabase = createClient();
  if (!supabase) return null;
  const slugBase =
    input.name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "proyecto";
  const { data, error } = await supabase
    .from("projects")
    .insert({
      team_id: input.workspaceId,
      name: input.name,
      description: input.description || null,
      client_id: input.clientId || null,
      slug: `${slugBase}-${Date.now().toString(36)}`,
      color: input.color,
    })
    .select(
      "id, team_id, name, color, description, archived, client_id, client:clients(id, team_id, name, email, notes, archived)",
    )
    .single();
  if (error) throw error;
  return mapProject(data as RemoteProject);
}

export async function updateRemoteProject(
  id: string,
  input: UpdateProjectInput,
) {
  const supabase = createClient();
  if (!supabase) return;
  const payload: Record<string, string | boolean | null> = {};
  if (input.name !== undefined) payload.name = input.name;
  if (input.color !== undefined) payload.color = input.color;
  if (input.description !== undefined) payload.description = input.description;
  if (input.clientId !== undefined) payload.client_id = input.clientId;
  if (input.archived !== undefined) payload.archived = input.archived;
  const { error } = await supabase.from("projects").update(payload).eq("id", id);
  if (error) throw error;
}

export async function createRemoteClient(input: NewClientInput) {
  const supabase = createClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("clients")
    .insert({
      team_id: input.workspaceId,
      name: input.name,
      email: input.email || null,
      notes: input.notes,
    })
    .select("id, team_id, name, email, notes, archived")
    .single();
  if (error) throw error;
  return mapClient(data as RemoteClient);
}

export async function updateRemoteClient(
  id: string,
  input: UpdateClientInput,
) {
  const supabase = createClient();
  if (!supabase) return;
  const { error } = await supabase.from("clients").update(input).eq("id", id);
  if (error) throw error;
}

export async function deleteRemoteClient(id: string) {
  const supabase = createClient();
  if (!supabase) return;
  const { error } = await supabase.from("clients").delete().eq("id", id);
  if (error) throw error;
}

export async function touchRemotePresence() {
  const supabase = createClient();
  if (!supabase) return;
  const { error } = await supabase.rpc("touch_presence");
  if (error) throw error;
}

export async function deleteRemoteProject(id: string) {
  const supabase = createClient();
  if (!supabase) return;
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) throw error;
}

export async function createRemoteWorkspace(name: string) {
  const supabase = createClient();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("create_workspace", {
    workspace_name: name,
  });
  if (error) throw error;
  return data as string;
}

export async function updateRemoteWorkspace(
  id: string,
  input: UpdateWorkspaceInput,
) {
  const supabase = createClient();
  if (!supabase) return;
  const { error } = await supabase.from("teams").update(input).eq("id", id);
  if (error) throw error;
}

export async function deleteRemoteWorkspace(id: string) {
  const supabase = createClient();
  if (!supabase) return;
  const { error } = await supabase.from("teams").delete().eq("id", id);
  if (error) throw error;
}

export async function updateRemoteMemberRole(
  workspaceId: string,
  userId: string,
  role: TeamRole,
) {
  const supabase = createClient();
  if (!supabase) return;
  const { error } = await supabase.rpc("update_member_role", {
    candidate_team_id: workspaceId,
    candidate_user_id: userId,
    candidate_role: role,
  });
  if (error) throw error;
}

export async function updateRemoteMemberHourlyRate(
  workspaceId: string,
  userId: string,
  hourlyRate: number,
) {
  const supabase = createClient();
  if (!supabase) return;
  const { error } = await supabase.rpc("update_member_hourly_rate", {
    candidate_team_id: workspaceId,
    candidate_user_id: userId,
    candidate_hourly_rate: hourlyRate,
  });
  if (error) throw error;
}

export async function startRemoteTimer(
  taskId: string,
  description: string,
  billable: boolean,
) {
  const supabase = createClient();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("start_task_timer", {
    candidate_task_id: taskId,
    candidate_description: description,
    candidate_billable: billable,
  });
  if (error) throw error;
  return data as string;
}

export async function stopRemoteTimer(entryId: string) {
  const supabase = createClient();
  if (!supabase) return;
  const { error } = await supabase.rpc("stop_task_timer", {
    candidate_entry_id: entryId,
  });
  if (error) throw error;
}

export async function createRemoteManualTimeEntry(
  input: NewManualTimeEntryInput,
) {
  const supabase = createClient();
  if (!supabase) return null;
  const startedAt = new Date(`${input.date}T12:00:00`).toISOString();
  const { data, error } = await supabase.rpc("create_manual_time_entry", {
    candidate_task_id: input.taskId,
    candidate_description: input.description,
    candidate_started_at: startedAt,
    candidate_duration_seconds: input.durationSeconds,
    candidate_billable: input.billable,
  });
  if (error) throw error;
  return data as string;
}

export async function deleteRemoteTimeEntry(entryId: string) {
  const supabase = createClient();
  if (!supabase) return;
  const { error } = await supabase
    .from("time_entries")
    .delete()
    .eq("id", entryId);
  if (error) throw error;
}

export async function removeRemoteMember(
  workspaceId: string,
  userId: string,
) {
  const supabase = createClient();
  if (!supabase) return;
  const { error } = await supabase.rpc("remove_team_member", {
    candidate_team_id: workspaceId,
    candidate_user_id: userId,
  });
  if (error) throw error;
}

export async function createRemoteInvitation(
  workspaceId: string,
  email: string,
  role: Exclude<TeamRole, "owner">,
) {
  const response = await fetch("/api/invitations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspaceId, email, role }),
  });
  const result = (await response.json()) as {
    invitation?: TeamInvitation;
    emailed?: boolean;
    error?: string;
  };
  if (!response.ok || !result.invitation) {
    throw new Error(result.error || "No se pudo crear la invitación.");
  }
  return { invitation: result.invitation, emailed: Boolean(result.emailed) };
}

export async function revokeRemoteInvitation(id: string) {
  const supabase = createClient();
  if (!supabase) return;
  const { error } = await supabase
    .from("team_invitations")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export async function acceptRemoteInvitation(token: string) {
  const supabase = createClient();
  if (!supabase) throw new Error("Supabase no está configurado.");
  const { data, error } = await supabase.rpc("accept_team_invitation", {
    invitation_token: token,
  });
  if (error) throw error;
  return data as string;
}

export async function addRemoteComment(taskId: string, body: string) {
  const supabase = createClient();
  if (!supabase) return;
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("No hay una sesión activa.");
  const { error } = await supabase.from("comments").insert({
    task_id: taskId,
    author_id: data.user.id,
    body,
  });
  if (error) throw error;
}

export async function deleteRemoteComment(id: string) {
  const supabase = createClient();
  if (!supabase) return;
  const { error } = await supabase.from("comments").delete().eq("id", id);
  if (error) throw error;
}

export async function uploadRemoteAttachment(task: Task, file: File) {
  const supabase = createClient();
  if (!supabase) return null;
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("No hay una sesión activa.");
  const path = `${task.project.workspaceId}/${task.id}/${crypto.randomUUID()}-${safeStorageName(file.name)}`;
  const upload = await supabase.storage
    .from("task-attachments")
    .upload(path, file, { contentType: file.type || undefined });
  if (upload.error) throw upload.error;

  const { data, error } = await supabase
    .from("task_attachments")
    .insert({
      task_id: task.id,
      uploaded_by: userData.user.id,
      name: file.name,
      storage_path: path,
      size_bytes: file.size,
      mime_type: file.type || "application/octet-stream",
    })
    .select("id, task_id, name, size_bytes, mime_type, storage_path, created_at")
    .single();
  if (error) {
    await supabase.storage.from("task-attachments").remove([path]);
    throw error;
  }
  return data as Omit<RemoteAttachment, "uploader">;
}

export async function deleteRemoteAttachment(attachment: TaskAttachment) {
  const supabase = createClient();
  if (!supabase) return;
  if (attachment.storagePath) {
    const storageResult = await supabase.storage
      .from("task-attachments")
      .remove([attachment.storagePath]);
    if (storageResult.error) throw storageResult.error;
  }
  const { error } = await supabase
    .from("task_attachments")
    .delete()
    .eq("id", attachment.id);
  if (error) throw error;
}

export async function downloadRemoteAttachment(attachment: TaskAttachment) {
  const supabase = createClient();
  if (!supabase || !attachment.storagePath) return null;
  const { data, error } = await supabase.storage
    .from("task-attachments")
    .download(attachment.storagePath);
  if (error) throw error;
  return data;
}

export async function markRemoteNotificationRead(id: string) {
  const supabase = createClient();
  if (!supabase) return;
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function markAllRemoteNotificationsRead() {
  const supabase = createClient();
  if (!supabase) return;
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", data.user.id)
    .is("read_at", null);
  if (error) throw error;
}

export async function updateRemoteProfile(name: string, title: string) {
  const supabase = createClient();
  if (!supabase) return;
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("No hay una sesión activa.");
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: name, role: title })
    .eq("id", data.user.id);
  if (error) throw error;
  await supabase.auth.updateUser({
    data: { full_name: name, role: title },
  });
}
