import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const NEXT_COOKIE = "taska_auth_next";

function safeNextPath(value: string | null) {
  if (!value) return "/";

  try {
    const decoded = decodeURIComponent(value);
    return decoded.startsWith("/") && !decoded.startsWith("//") ? decoded : "/";
  } catch {
    return "/";
  }
}

function redirectAndClearNext(request: NextRequest, path: string) {
  const response = NextResponse.redirect(new URL(path, request.url));
  response.cookies.delete(NEXT_COOKIE);
  return response;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNextPath(
    searchParams.get("next") ?? request.cookies.get(NEXT_COOKIE)?.value ?? null,
  );

  if (code) {
    const supabase = await createClient();
    const result = await supabase?.auth.exchangeCodeForSession(code);
    if (result?.error) {
      console.error("Auth callback exchange failed", {
        name: result.error.name,
        status: result.error.status,
        code: result.error.code,
        message: result.error.message,
      });
      return redirectAndClearNext(request, "/login?error=auth_callback");
    }
  }

  return redirectAndClearNext(request, `${origin}${next}`);
}
