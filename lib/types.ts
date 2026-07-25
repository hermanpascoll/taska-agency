export type TaskStatus = "nuevo" | "en_progreso" | "esperando" | "resuelto";
export type TaskPriority = "urgente" | "alta" | "media" | "baja";
export type TaskRecurrence =
  | "none"
  | "daily"
  | "weekly"
  | "biweekly"
  | "monthly";
export type TeamRole = "owner" | "admin" | "agent" | "viewer";

export type Person = {
  id: string;
  name: string;
  initials: string;
  color: string;
  role?: string;
  email?: string;
};

export type Workspace = {
  id: string;
  name: string;
  memberCount: number;
  role: TeamRole;
  archived: boolean;
  currency: string;
};

export type Client = {
  id: string;
  name: string;
  email: string;
  notes: string;
  categories: string[];
  workspaceId: string;
  archived: boolean;
};

export type Project = {
  id: string;
  name: string;
  color: string;
  workspaceId: string;
  description?: string;
  clientId: string | null;
  clientName: string | null;
  clientCategory: string | null;
  archived: boolean;
};

export type TaskComment = {
  id: string;
  author: Person;
  body: string;
  createdAt: string;
};

export type TaskAttachment = {
  id: string;
  taskId: string;
  name: string;
  size: number;
  mimeType: string;
  storagePath: string | null;
  dataUrl?: string;
  createdAt: string;
  uploader: Person;
};

export type Task = {
  id: string;
  code: string;
  title: string;
  description: string;
  project: Project;
  projects: Project[];
  parentTaskId: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assignee: Person | null;
  client: string;
  clientId?: string | null;
  clientCategory?: string | null;
  clientEmail?: string;
  startDate: string | null;
  dueDate: string | null;
  dueTime?: string | null;
  dueLabel: string;
  recurrenceRule?: TaskRecurrence;
  recurrenceInterval?: number;
  recurrenceOriginId?: string | null;
  recurrenceGeneratedAt?: string | null;
  createdAt?: string;
  resolvedAt?: string | null;
  updatedAt: string;
  tags: string[];
  comments: TaskComment[];
  attachments: TaskAttachment[];
};

export type WorkspaceMember = {
  workspaceId: string;
  user: Person;
  role: TeamRole;
  joinedAt: string;
  hourlyRate: number;
};

export type TimeEntry = {
  id: string;
  workspaceId: string;
  taskId: string;
  taskCode: string;
  taskTitle: string;
  projectId: string;
  projectName: string;
  user: Person;
  description: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number;
  billable: boolean;
  hourlyRate: number;
  createdAt: string;
};

export type NewManualTimeEntryInput = {
  taskId: string;
  description: string;
  date: string;
  durationSeconds: number;
  billable: boolean;
};

export type TeamInvitation = {
  id: string;
  workspaceId: string;
  email: string;
  role: Exclude<TeamRole, "owner">;
  token: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
};

export type AppNotification = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  taskId: string | null;
};

export type AppSettings = {
  compactMode: boolean;
  showCompleted: boolean;
  accentColor: string;
};

export type AdvancedFilters = {
  status: TaskStatus | "todos";
  assigneeId: string | "todos" | "sin_asignar";
  due: "todas" | "vencidas" | "hoy" | "semana" | "sin_fecha";
};

export type NewTaskInput = {
  title: string;
  description: string;
  projectId: string;
  projectIds: string[];
  parentTaskId?: string;
  status?: TaskStatus;
  priority: TaskPriority;
  assigneeId: string;
  client: string;
  clientId: string | null;
  clientCategory: string | null;
  startDate: string;
  dueDate: string;
  dueTime: string;
  tags: string[];
  recurrenceRule: TaskRecurrence;
  recurrenceInterval: number;
};

export type UpdateTaskInput = {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: string | null;
  projectIds?: string[];
  clientId?: string | null;
  clientCategory?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  dueTime?: string | null;
  tags?: string[];
  recurrenceRule?: TaskRecurrence;
  recurrenceInterval?: number;
};

export type NewProjectInput = {
  name: string;
  color: string;
  workspaceId: string;
  description?: string;
  clientId?: string;
  clientCategory?: string;
};

export type UpdateProjectInput = {
  name?: string;
  color?: string;
  description?: string;
  clientId?: string | null;
  clientCategory?: string | null;
  archived?: boolean;
};

export type NewClientInput = {
  name: string;
  email: string;
  notes: string;
  categories: string[];
  workspaceId: string;
};

export type UpdateClientInput = {
  name?: string;
  email?: string;
  notes?: string;
  categories?: string[];
  archived?: boolean;
};

export type UpdateWorkspaceInput = {
  name?: string;
  archived?: boolean;
  currency?: string;
};
