import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type OutboxRow = {
  id: string;
  notification_id: string;
  user_id: string;
  recipient_email: string;
  category: string;
  subject: string;
  body: string;
  task_id: string | null;
  delivery_mode: "instant" | "daily";
  attempts: number;
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

function emailHtml(row: OutboxRow, appUrl: string) {
  const taskUrl = row.task_id
    ? `${appUrl}/?task=${encodeURIComponent(row.task_id)}`
    : appUrl;
  return `<!doctype html>
<html lang="es"><body style="margin:0;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#172033">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 16px">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e9f0;border-radius:18px;overflow:hidden">
      <tr><td style="padding:22px 28px;background:#15171b;color:#ffffff;font-size:18px;font-weight:700">Taska</td></tr>
      <tr><td style="padding:30px 28px">
        <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#6b7280">Notificación</div>
        <h1 style="margin:10px 0 12px;font-size:22px;line-height:1.25">${escapeHtml(row.subject)}</h1>
        <p style="margin:0 0 24px;color:#596273;font-size:15px;line-height:1.6">${escapeHtml(row.body)}</p>
        <a href="${taskUrl}" style="display:inline-block;background:#0a84ff;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 18px;border-radius:10px">Abrir en Taska</a>
      </td></tr>
      <tr><td style="padding:18px 28px;border-top:1px solid #eef1f5;color:#8a93a3;font-size:11px;line-height:1.5">Podés cambiar qué correos recibís desde Configuración → Notificaciones.</td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const dispatchSecret = Deno.env.get("EMAIL_DISPATCH_SECRET");
  if (!dispatchSecret || request.headers.get("x-dispatch-secret") !== dispatchSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const emailFrom = Deno.env.get("EMAIL_FROM");
  const appUrl = (Deno.env.get("APP_URL") || "https://taska-agency.vercel.app").replace(/\/$/, "");

  if (!supabaseUrl || !serviceRoleKey || !resendApiKey || !emailFrom) {
    return Response.json({ error: "Email service is not configured" }, { status: 503 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.rpc("claim_email_outbox", {
    candidate_limit: 25,
  });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  let sent = 0;
  let failed = 0;
  for (const row of (data ?? []) as OutboxRow[]) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `taska-notification-${row.notification_id}`,
        },
        body: JSON.stringify({
          from: emailFrom,
          to: [row.recipient_email],
          subject: row.subject,
          html: emailHtml(row, appUrl),
          text: `${row.subject}\n\n${row.body}\n\nAbrir en Taska: ${row.task_id ? `${appUrl}/?task=${row.task_id}` : appUrl}`,
          tags: [
            { name: "category", value: row.category.replace(/[^a-zA-Z0-9_-]/g, "_") },
            { name: "environment", value: "production" },
          ],
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.message || `Resend error ${response.status}`);

      await supabase.rpc("complete_email_outbox", {
        candidate_id: row.id,
        candidate_provider_id: result.id,
      });
      sent += 1;
    } catch (sendError) {
      await supabase.rpc("fail_email_outbox", {
        candidate_id: row.id,
        candidate_error: sendError instanceof Error ? sendError.message : "Unknown email error",
        candidate_retry_at: new Date(
          Date.now() + Math.min(60, 2 ** row.attempts) * 60_000,
        ).toISOString(),
      });
      failed += 1;
    }
  }

  return Response.json({ processed: sent + failed, sent, failed });
});
