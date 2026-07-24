// @vitest-environment node
import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";

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
      })
      .select("id, client_id")
      .single();
    expect(project.error).toBeNull();
    expect(project.data?.client_id).toBe(client.data!.id);

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

    const timer = await supabase!.rpc("start_task_timer", {
      candidate_task_id: created.data!.id,
      candidate_description: "Timer de integración",
      candidate_billable: true,
    });
    expect(timer.error).toBeNull();
    const stopped = await supabase!.rpc("stop_task_timer", {
      candidate_entry_id: timer.data,
    });
    expect(stopped.error).toBeNull();
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
