// @vitest-environment node
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.SUPABASE_TEST_URL;
const anonKey = process.env.SUPABASE_TEST_ANON_KEY;
const email = process.env.SUPABASE_TEST_EMAIL;
const password = process.env.SUPABASE_TEST_PASSWORD;
const configured = Boolean(url && anonKey && email && password);
const supabase = configured ? createClient(url!, anonKey!) : null;
let createdWorkspaceId: string | null = null;

describe.skipIf(!configured)("Supabase real: autenticación y persistencia", () => {
  afterAll(async () => {
    if (supabase && createdWorkspaceId) {
      await supabase.from("teams").delete().eq("id", createdWorkspaceId);
    }
    await supabase?.auth.signOut();
  });

  it("autentica, persiste y vuelve a leer una tarea", async () => {
    const auth = await supabase!.auth.signInWithPassword({
      email: email!,
      password: password!,
    });
    expect(auth.error).toBeNull();

    const workspace = await supabase!.rpc("create_workspace", {
      workspace_name: `Taska integración ${Date.now()}`,
    });
    expect(workspace.error).toBeNull();
    createdWorkspaceId = workspace.data as string;

    const presence = await supabase!.rpc("touch_presence");
    expect(presence.error).toBeNull();
    const profile = await supabase!
      .from("profiles")
      .select("last_seen_at")
      .eq("id", auth.data.user!.id)
      .single();
    expect(profile.error).toBeNull();
    expect(profile.data?.last_seen_at).toBeTruthy();

    const client = await supabase!
      .from("clients")
      .insert({
        team_id: createdWorkspaceId,
        name: "Cliente E2E",
        email: "cliente@taska.test",
        notes: "Creado por la suite de integración.",
        categories: ["Institucional", "Cartelería"],
      })
      .select("id")
      .single();
    expect(client.error).toBeNull();

    const project = await supabase!
      .from("projects")
      .insert({
        team_id: createdWorkspaceId,
        name: "Proyecto E2E",
        slug: `proyecto-e2e-${Date.now()}`,
        color: "#0A84FF",
        client_id: client.data!.id,
        client_category: "Cartelería",
      })
      .select("id, client_id, client_category")
      .single();
    expect(project.error).toBeNull();
    expect(project.data?.client_id).toBe(client.data!.id);
    expect(project.data?.client_category).toBe("Cartelería");

    const secondaryProject = await supabase!
      .from("projects")
      .insert({
        team_id: createdWorkspaceId,
        name: "Proyecto secundario E2E",
        slug: `proyecto-secundario-e2e-${Date.now()}`,
        color: "#30D158",
      })
      .select("id")
      .single();
    expect(secondaryProject.error).toBeNull();

    const title = `Persistencia E2E ${Date.now()}`;
    const created = await supabase!
      .from("tasks")
      .insert({
        team_id: createdWorkspaceId,
        project_id: project.data!.id,
        title,
        description: "Registro temporal del test automatizado.",
        status: "nuevo",
        priority: "media",
        client_id: client.data!.id,
        client_category: "Cartelería",
        start_date: "2099-01-01",
        due_date: "2099-01-07",
        due_time: "16:45",
        tags: ["Diseño", "Aprobación"],
        recurrence_rule: "weekly",
        recurrence_interval: 1,
      })
      .select("id")
      .single();
    expect(created.error).toBeNull();

    const relation = await supabase!.from("task_projects").upsert({
      task_id: created.data!.id,
      project_id: secondaryProject.data!.id,
      team_id: createdWorkspaceId,
    });
    expect(relation.error).toBeNull();
    const relatedProjects = await supabase!
      .from("task_projects")
      .select("project_id")
      .eq("task_id", created.data!.id);
    expect(relatedProjects.error).toBeNull();
    expect(relatedProjects.data).toHaveLength(2);

    const persisted = await supabase!
      .from("tasks")
      .select("id, title")
      .eq("id", created.data!.id)
      .single();
    expect(persisted.error).toBeNull();
    expect(persisted.data?.title).toBe(title);

    const subtask = await supabase!
      .from("tasks")
      .insert({
        team_id: createdWorkspaceId,
        project_id: project.data!.id,
        parent_task_id: created.data!.id,
        title: "Subtarea recurrente E2E",
        description: "Debe conservar responsable y desplazarse una semana.",
        status: "en_progreso",
        priority: "alta",
        assignee_id: auth.data.user!.id,
        client_id: client.data!.id,
        client_category: "Cartelería",
        start_date: "2099-01-02",
        due_date: "2099-01-06",
        due_time: "15:30",
      })
      .select("id")
      .single();
    expect(subtask.error).toBeNull();

    const completed = await supabase!
      .from("tasks")
      .update({ status: "resuelto" })
      .eq("id", created.data!.id)
      .select("resolved_at")
      .single();
    expect(completed.error).toBeNull();
    expect(completed.data?.resolved_at).toBeTruthy();
    const completedSource = await supabase!
      .from("tasks")
      .select("recurrence_generated_at")
      .eq("id", created.data!.id)
      .single();
    expect(completedSource.error).toBeNull();
    expect(completedSource.data?.recurrence_generated_at).toBeTruthy();

    const nextOccurrence = await supabase!
      .from("tasks")
      .select(
        "id, due_date, due_time, client_id, client_category, tags, recurrence_origin_id",
      )
      .eq("recurrence_origin_id", created.data!.id)
      .single();
    expect(nextOccurrence.error).toBeNull();
    expect(nextOccurrence.data).toMatchObject({
      due_date: "2099-01-14",
      due_time: "16:45:00",
      client_id: client.data!.id,
      client_category: "Cartelería",
      tags: ["Diseño", "Aprobación"],
      recurrence_origin_id: created.data!.id,
    });
    const clonedSubtasks = await supabase!
      .from("tasks")
      .select("title, due_date, due_time, assignee_id")
      .eq("parent_task_id", nextOccurrence.data!.id);
    expect(clonedSubtasks.error).toBeNull();
    expect(clonedSubtasks.data).toEqual([
      expect.objectContaining({
        title: "Subtarea recurrente E2E",
        due_date: "2099-01-13",
        due_time: "15:30:00",
        assignee_id: auth.data.user!.id,
      }),
    ]);

    const timer = await supabase!.rpc("start_task_timer", {
      candidate_task_id: created.data!.id,
      candidate_description: "Timer de integración",
      candidate_billable: true,
    });
    expect(timer.error).toBeNull();
    const secondTimer = await supabase!.rpc("start_task_timer", {
      candidate_task_id: nextOccurrence.data!.id,
      candidate_description: "Segundo timer simultáneo",
      candidate_billable: false,
    });
    expect(secondTimer.error).toBeNull();
    const activeTimers = await supabase!
      .from("time_entries")
      .select("id, task_id")
      .eq("team_id", createdWorkspaceId)
      .eq("user_id", auth.data.user!.id)
      .is("ended_at", null);
    expect(activeTimers.error).toBeNull();
    expect(activeTimers.data).toHaveLength(2);
    expect(activeTimers.data?.map((entry) => entry.task_id)).toEqual(
      expect.arrayContaining([created.data!.id, nextOccurrence.data!.id]),
    );

    const duplicateTimer = await supabase!.rpc("start_task_timer", {
      candidate_task_id: created.data!.id,
      candidate_description: "No debe duplicarse",
      candidate_billable: true,
    });
    expect(duplicateTimer.error?.message).toContain(
      "already active for this task",
    );

    const stopped = await supabase!.rpc("stop_task_timer", {
      candidate_entry_id: timer.data,
    });
    expect(stopped.error).toBeNull();
    const stoppedSecond = await supabase!.rpc("stop_task_timer", {
      candidate_entry_id: secondTimer.data,
    });
    expect(stoppedSecond.error).toBeNull();
    const persistedTime = await supabase!
      .from("time_entries")
      .select("id, description, ended_at")
      .eq("id", timer.data)
      .single();
    expect(persistedTime.error).toBeNull();
    expect(persistedTime.data?.description).toBe("Timer de integración");
    expect(persistedTime.data?.ended_at).toBeTruthy();

    const removedPrimaryProject = await supabase!
      .from("projects")
      .delete()
      .eq("id", project.data!.id);
    expect(removedPrimaryProject.error).toBeNull();
    const preservedTask = await supabase!
      .from("tasks")
      .select("id, project_id")
      .eq("id", created.data!.id)
      .single();
    expect(preservedTask.error).toBeNull();
    expect(preservedTask.data?.project_id).toBe(secondaryProject.data!.id);

    const clearedPresence = await supabase!.rpc("clear_presence");
    expect(clearedPresence.error).toBeNull();
  });
});

const archiveUrl =
  process.env.SUPABASE_TEST_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const archiveAnonKey =
  process.env.SUPABASE_TEST_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SECRET_KEY;
const archiveConfigured = Boolean(archiveUrl && archiveAnonKey && serviceKey);

describe.skipIf(!archiveConfigured)(
  "Supabase real: expediente, auditoría y recuperación",
  () => {
    const service = archiveConfigured
      ? createClient(archiveUrl!, serviceKey!, {
          auth: { autoRefreshToken: false, persistSession: false },
        })
      : null;
    const session = archiveConfigured
      ? createClient(archiveUrl!, archiveAnonKey!, {
          auth: { autoRefreshToken: false, persistSession: false },
        })
      : null;
    let userId: string | null = null;
    let workspaceId: string | null = null;

    beforeAll(async () => {
      const email = `taska-archive-${randomUUID()}@example.com`;
      const password = `Taska-${randomUUID()}-Test!`;
      const createdUser = await service!.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: "Auditoría automatizada" },
      });
      expect(createdUser.error).toBeNull();
      userId = createdUser.data.user!.id;

      const auth = await session!.auth.signInWithPassword({ email, password });
      expect(auth.error).toBeNull();
      const workspace = await session!.rpc("create_workspace", {
        workspace_name: `Archivo integración ${Date.now()}`,
      });
      expect(workspace.error).toBeNull();
      workspaceId = workspace.data as string;
    });

    afterAll(async () => {
      if (workspaceId) {
        await service!.from("teams").delete().eq("id", workspaceId);
      }
      await session?.auth.signOut();
      if (userId) await service!.auth.admin.deleteUser(userId);
    });

    it("versiona, registra eventos, bloquea el archivo y restaura", async () => {
      const project = await session!
        .from("projects")
        .insert({
          team_id: workspaceId,
          name: "Proceso auditable",
          slug: `proceso-${randomUUID()}`,
          color: "#0A84FF",
        })
        .select("id")
        .single();
      expect(project.error).toBeNull();

      const task = await session!
        .from("tasks")
        .insert({
          team_id: workspaceId,
          project_id: project.data!.id,
          title: "Expediente de prueba",
          description: "Antecedente conservado por la suite.",
          status: "en_progreso",
          priority: "alta",
          brief: {
            objective: "Validar el archivo de procesos",
            deliverables: "Historial y versiones",
          },
        })
        .select("id")
        .single();
      expect(task.error).toBeNull();

      const parallelTask = await session!
        .from("tasks")
        .insert({
          team_id: workspaceId,
          project_id: project.data!.id,
          title: "Trabajo paralelo",
          description: "Valida timers simultáneos del mismo usuario.",
          status: "en_progreso",
          priority: "media",
        })
        .select("id")
        .single();
      expect(parallelTask.error).toBeNull();

      const comment = await session!.from("comments").insert({
        task_id: task.data!.id,
        author_id: userId,
        body: "Se aprueba conservar esta decisión.",
        comment_type: "decision",
        visibility: "team",
      });
      expect(comment.error).toBeNull();

      const firstFile = await session!
        .from("task_attachments")
        .insert({
          task_id: task.data!.id,
          uploaded_by: userId,
          name: "entregable.pdf",
          storage_path: `${workspaceId}/${task.data!.id}/${randomUUID()}.pdf`,
          size_bytes: 100,
          mime_type: "application/pdf",
        })
        .select("version_group_id, version_number")
        .single();
      expect(firstFile.error).toBeNull();
      expect(firstFile.data?.version_number).toBe(1);

      const secondFile = await session!
        .from("task_attachments")
        .insert({
          task_id: task.data!.id,
          uploaded_by: userId,
          name: "entregable.pdf",
          storage_path: `${workspaceId}/${task.data!.id}/${randomUUID()}.pdf`,
          size_bytes: 120,
          mime_type: "application/pdf",
          approval_status: "approved",
        })
        .select("version_group_id, version_number, approval_status")
        .single();
      expect(secondFile.error).toBeNull();
      expect(secondFile.data).toMatchObject({
        version_group_id: firstFile.data!.version_group_id,
        version_number: 2,
        approval_status: "approved",
      });

      const timer = await session!.rpc("start_task_timer", {
        candidate_task_id: task.data!.id,
        candidate_description: "Validación de cierre",
        candidate_billable: true,
      });
      expect(timer.error).toBeNull();
      const parallelTimer = await session!.rpc("start_task_timer", {
        candidate_task_id: parallelTask.data!.id,
        candidate_description: "Trabajo en paralelo",
        candidate_billable: false,
      });
      expect(parallelTimer.error).toBeNull();
      const activeTimers = await session!
        .from("time_entries")
        .select("id, task_id")
        .eq("team_id", workspaceId)
        .eq("user_id", userId)
        .is("ended_at", null);
      expect(activeTimers.error).toBeNull();
      expect(activeTimers.data).toHaveLength(2);

      const duplicateTimer = await session!.rpc("start_task_timer", {
        candidate_task_id: task.data!.id,
        candidate_description: "Duplicado",
        candidate_billable: true,
      });
      expect(duplicateTimer.error?.message).toContain(
        "already active for this task",
      );

      const archived = await session!.rpc("archive_task_record", {
        candidate_task_id: task.data!.id,
        candidate_closure_summary: "Expediente validado correctamente.",
        candidate_lessons_learned: "Mantener el cierre obligatorio.",
      });
      expect(archived.error).toBeNull();

      const persisted = await session!
        .from("tasks")
        .select(
          "archived_at, closure_summary, lessons_learned, status, task_events(event_type)",
        )
        .eq("id", task.data!.id)
        .single();
      expect(persisted.error).toBeNull();
      expect(persisted.data).toMatchObject({
        closure_summary: "Expediente validado correctamente.",
        lessons_learned: "Mantener el cierre obligatorio.",
        status: "resuelto",
      });
      expect(persisted.data?.archived_at).toBeTruthy();
      expect(
        (persisted.data?.task_events as Array<{ event_type: string }>).some(
          (event) => event.event_type === "task_archived",
        ),
      ).toBe(true);

      const stoppedTimer = await session!
        .from("time_entries")
        .select("ended_at")
        .eq("id", timer.data)
        .single();
      expect(stoppedTimer.error).toBeNull();
      expect(stoppedTimer.data?.ended_at).toBeTruthy();
      const parallelTimerState = await session!
        .from("time_entries")
        .select("ended_at")
        .eq("id", parallelTimer.data)
        .single();
      expect(parallelTimerState.error).toBeNull();
      expect(parallelTimerState.data?.ended_at).toBeNull();
      const stoppedParallel = await session!.rpc("stop_task_timer", {
        candidate_entry_id: parallelTimer.data,
      });
      expect(stoppedParallel.error).toBeNull();

      const forbiddenEdit = await session!
        .from("tasks")
        .update({ title: "No debe modificarse" })
        .eq("id", task.data!.id);
      expect(forbiddenEdit.error?.message).toContain("read-only");

      const restored = await session!.rpc("restore_task_record", {
        candidate_task_id: task.data!.id,
      });
      expect(restored.error).toBeNull();
      const editableAgain = await session!
        .from("tasks")
        .update({ title: "Expediente restaurado" })
        .eq("id", task.data!.id);
      expect(editableAgain.error).toBeNull();

      const trashed = await session!.rpc("trash_task_record", {
        candidate_task_id: task.data!.id,
      });
      expect(trashed.error).toBeNull();
      const trashState = await session!
        .from("tasks")
        .select("archived_at, deleted_at")
        .eq("id", task.data!.id)
        .single();
      expect(trashState.error).toBeNull();
      expect(trashState.data?.archived_at).toBeTruthy();
      expect(trashState.data?.deleted_at).toBeTruthy();

      const finalRestore = await session!.rpc("restore_task_record", {
        candidate_task_id: task.data!.id,
      });
      expect(finalRestore.error).toBeNull();
    }, 15_000);
  },
);
