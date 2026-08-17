import "server-only";

type InvitationEmailInput = {
  recipientEmail: string;
  invitationUrl: string;
  invitationKind: "workspace" | "project" | "group";
  targetName: string;
  idempotencyKey: string;
};

export async function sendTransactionalInvitationEmail(
  input: InvitationEmailInput,
) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const dispatchSecret = process.env.EMAIL_DISPATCH_SECRET;
  if (!supabaseUrl || !dispatchSecret) return false;

  try {
    const response = await fetch(
      `${supabaseUrl}/functions/v1/notification-email-dispatch`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-dispatch-secret": dispatchSecret,
        },
        body: JSON.stringify({ type: "invitation", ...input }),
        cache: "no-store",
      },
    );
    return response.ok;
  } catch {
    return false;
  }
}
