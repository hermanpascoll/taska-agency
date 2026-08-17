import { NextResponse } from "next/server";
import { createGoogleDriveUploadSession } from "@/lib/google-drive-membership";
import { createClient } from "@/lib/supabase/server";

const MAX_FILE_SIZE = 100 * 1024 * 1024;

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase no está configurado." },
      { status: 503 },
    );
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  }

  const body = (await request.json()) as {
    taskId?: string;
    fileName?: string;
    mimeType?: string;
    size?: number;
  };
  const fileName = body.fileName?.trim();
  const mimeType = body.mimeType?.trim() || "application/octet-stream";
  if (
    !body.taskId ||
    !fileName ||
    fileName.length > 255 ||
    mimeType.length > 255 ||
    !Number.isSafeInteger(body.size) ||
    !body.size ||
    body.size < 1 ||
    body.size > MAX_FILE_SIZE
  ) {
    return NextResponse.json(
      { error: "El archivo es inválido o supera el límite de 100 MB." },
      { status: 400 },
    );
  }

  const permission = await supabase.rpc("can_comment_task", {
    candidate_task_id: body.taskId,
  });
  if (permission.error || !permission.data) {
    return NextResponse.json(
      { error: "No tenés permiso para adjuntar archivos a esta tarea." },
      { status: 403 },
    );
  }

  const task = await supabase
    .from("tasks")
    .select("id, team_id, project_id, task_number, title")
    .eq("id", body.taskId)
    .single();
  if (task.error) {
    return NextResponse.json({ error: "La tarea no existe." }, { status: 404 });
  }
  const workspace = await supabase
    .from("teams")
    .select("google_drive_id")
    .eq("id", task.data.team_id)
    .single();
  const driveId = workspace.data?.google_drive_id;
  if (workspace.error || !driveId) {
    return NextResponse.json(
      { error: "Este espacio no tiene una unidad compartida configurada." },
      { status: 409 },
    );
  }

  try {
    const uploadUrl = await createGoogleDriveUploadSession({
      driveId,
      fileName,
      mimeType,
      size: body.size,
      taskId: task.data.id,
      taskCode: `AG-${String(task.data.task_number).padStart(3, "0")}`,
      taskTitle: task.data.title,
      workspaceId: task.data.team_id,
      projectId: task.data.project_id,
      origin: new URL(request.url).origin,
    });
    return NextResponse.json({ uploadUrl });
  } catch (error) {
    console.error("Google Drive upload session failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo iniciar la carga en Google Drive.",
      },
      { status: 502 },
    );
  }
}
