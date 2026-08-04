"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(isSupabaseConfigured());

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const supabase = createClient();
    if (!supabase) return;

    void (async () => {
      const result = await supabase.auth.getSession();
      if (!result.data.session) {
        router.replace(`/login?next=${encodeURIComponent(pathname)}`);
        return;
      }
      setChecking(false);
    })();
  }, [pathname, router]);

  if (checking) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#f6f7f9]">
        <div className="flex items-center gap-3 text-sm font-medium text-slate-500">
          <LoaderCircle className="size-5 animate-spin text-violet-600" />
          Preparando tu espacio…
        </div>
      </div>
    );
  }

  return children;
}
