import "server-only";

import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

function platformAdminEmails() {
  return new Set(
    (process.env.TASKA_PLATFORM_ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isPlatformAdminEmail(email: string | null | undefined) {
  return Boolean(email && platformAdminEmails().has(email.toLowerCase()));
}

export async function getPlatformAdminAccess() {
  const supabase = await createClient();
  if (!supabase) return { configured: false, user: null, isAdmin: false };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      configured: true,
      user: null,
      isAdmin: false,
      rootAdmin: false,
    };
  }

  const rootAdmin = isPlatformAdminEmail(user.email);
  if (rootAdmin) {
    return {
      configured: true,
      user,
      isAdmin: true,
      rootAdmin: true,
    };
  }

  const admin = createPlatformAdminClient();
  const persistentAdmin = admin
    ? await admin
        .from("platform_admins")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle()
    : null;

  return {
    configured: true,
    user,
    isAdmin: Boolean(persistentAdmin?.data),
    rootAdmin: false,
  };
}

export function createPlatformAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) return null;

  return createAdminClient(url, secret, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
