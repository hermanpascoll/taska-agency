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

    const project = await supabase!
      .from("projects")
      .insert({
        team_id: createdWorkspaceId,
        name: "Proyecto E2E",
        slug: `proyecto-e2e-${Date.now()}`,
        color: "#0A84FF",
      })
      .select("id")
      .single();
    expect(project.error).toBeNull();

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
  });
});
