"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  LoaderCircle,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(() =>
    searchParams.get("error") === "auth_callback"
      ? "El enlace de acceso no pudo validarse. Solicitá uno nuevo."
      : null,
  );
  const configured = isSupabaseConfigured();
  const nextPath = searchParams.get("next") || "/";

  async function signInWithGoogle() {
    const supabase = createClient();
    if (!supabase) {
      router.push("/");
      return;
    }
    setLoading(true);
    setMessage(null);
    const safeNextPath =
      nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/";
    document.cookie = [
      `taska_auth_next=${encodeURIComponent(safeNextPath)}`,
      "Path=/",
      "Max-Age=600",
      "SameSite=Lax",
      window.location.protocol === "https:" ? "Secure" : "",
    ]
      .filter(Boolean)
      .join("; ");
    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        queryParams: {
          prompt: "select_account",
        },
      },
    });
    if (error) {
      setMessage(error.message);
      setLoading(false);
    }
  }

  return (
    <main className="mac-wallpaper grid min-h-screen bg-white lg:grid-cols-[minmax(420px,.82fr)_1.18fr]">
      <section className="relative hidden overflow-hidden bg-[linear-gradient(145deg,#1c1c1e,#303036)] p-12 text-white lg:flex lg:flex-col xl:p-16">
        <div className="absolute -right-24 top-20 size-72 rounded-full border border-white/[0.07]" />
        <div className="absolute -right-8 top-36 size-44 rounded-full border border-violet-400/15" />
        <div className="relative flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-[10px] bg-[#0a84ff] shadow-[0_8px_24px_rgba(10,132,255,0.32)]">
            <Zap className="size-[19px] fill-white stroke-[2.4]" />
          </span>
          <span className="text-xl font-bold tracking-[-0.02em]">taska</span>
        </div>

        <div className="relative my-auto max-w-md py-16">
          <span className="inline-flex items-center gap-2 rounded-full border border-violet-300/15 bg-violet-300/10 px-3 py-1.5 text-[10px] font-semibold text-violet-200">
            <Sparkles className="size-3.5" />
            La agencia, en ritmo
          </span>
          <h1 className="mt-6 text-[42px] font-bold leading-[1.08] tracking-[-0.045em] xl:text-[48px]">
            Cada idea,
            <br />
            a tiempo.
          </h1>
          <p className="mt-5 max-w-sm text-sm leading-7 text-slate-400">
            Organizá campañas, entregables y feedback en un solo espacio
            pensado para equipos creativos.
          </p>
          <div className="mt-9 space-y-4">
            {[
              "Campañas y fechas de entrega visibles",
              "Lista y tablero Kanban sincronizados",
              "Feedback centralizado en cada tarea",
            ].map((item) => (
              <div
                key={item}
                className="flex items-center gap-3 text-xs font-medium text-slate-300"
              >
                <span className="grid size-5 place-items-center rounded-full bg-emerald-400/15 text-emerald-300">
                  <Check className="size-3 stroke-[3]" />
                </span>
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="relative flex items-center gap-3 border-t border-white/[0.08] pt-6">
          <span className="grid size-9 place-items-center rounded-full bg-emerald-400/15 text-emerald-300">
            <ShieldCheck className="size-4" />
          </span>
          <div>
            <p className="text-[10px] font-semibold text-slate-300">
              Datos protegidos
            </p>
            <p className="mt-0.5 text-[9px] text-slate-500">
              Autenticación segura y políticas por equipo
            </p>
          </div>
        </div>
      </section>

      <section className="flex min-h-screen items-center justify-center bg-white/20 px-5 py-10 backdrop-blur-sm sm:px-10">
        <div className="mac-window w-full max-w-[440px] rounded-[22px] border border-white/80 bg-white/82 p-7 shadow-[0_30px_90px_rgba(15,23,42,.18)] backdrop-blur-2xl sm:p-9">
          <div className="-mt-2 mb-7 hidden justify-center gap-2 lg:flex" aria-hidden="true">
            <span className="size-3 rounded-full bg-[#ff5f57]" />
            <span className="size-3 rounded-full bg-[#febc2e]" />
            <span className="size-3 rounded-full bg-[#28c840]" />
          </div>
          <div className="mb-10 flex items-center justify-between lg:hidden">
            <div className="flex items-center gap-2.5">
              <span className="grid size-8 place-items-center rounded-[9px] bg-[#0a84ff] text-white">
                <Zap className="size-[17px] fill-white" />
              </span>
              <span className="text-lg font-bold text-slate-900">taska</span>
            </div>
            <button
              onClick={() => router.push("/")}
              className="focus-ring rounded-lg p-2 text-slate-400"
              aria-label="Volver"
            >
              <ArrowLeft className="size-5" />
            </button>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#0879ea]">
              Bienvenido
            </p>
            <h2 className="mt-2 text-[30px] font-bold tracking-[-0.04em] text-slate-900">
              Volvé a tu equipo
            </h2>
            <p className="mt-2 text-[13px] leading-6 text-slate-500">
              Ingresá con tu cuenta de Google para continuar gestionando tus
              campañas.
            </p>
          </div>

          {!configured ? (
            <div className="mt-6 rounded-2xl border border-violet-200 bg-violet-50 p-5">
              <p className="text-xs font-bold text-violet-800">
                Modo demostración activo
              </p>
              <p className="mt-2 text-[11px] leading-5 text-violet-700/80">
                Supabase todavía no está configurado. Podés recorrer la
                aplicación con datos de muestra y conectar tus credenciales
                cuando quieras.
              </p>
              <button
                onClick={() => router.push("/")}
                className="focus-ring mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-[#5b4bec] px-4 py-3 text-[11px] font-bold text-white"
              >
                Entrar a la demo
                <ArrowRight className="size-4" />
              </button>
            </div>
          ) : (
            <div className="mt-8">
              <button
                type="button"
                disabled={loading}
                onClick={() => void signInWithGoogle()}
                className="focus-ring flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
              >
                <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M21.6 12.23c0-.71-.06-1.39-.18-2.04H12v3.86h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.35Z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 22c2.7 0 4.98-.9 6.63-2.42l-3.24-2.51c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.77-5.61-4.14H3.05v2.59A10 10 0 0 0 12 22Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M6.39 13.89A6.01 6.01 0 0 1 6.08 12c0-.66.11-1.3.31-1.89V7.52H3.05A10 10 0 0 0 2 12c0 1.61.39 3.14 1.05 4.48l3.34-2.59Z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.97c1.47 0 2.79.5 3.82 1.5l2.88-2.88A9.66 9.66 0 0 0 12 2a10 10 0 0 0-8.95 5.52l3.34 2.59C7.18 7.74 9.39 5.97 12 5.97Z"
                  />
                </svg>
                Continuar con Google
              </button>
              {message && (
                <p className="mt-4 rounded-lg bg-slate-100 p-3 text-[11px] leading-5 text-slate-600">
                  {message}
                </p>
              )}
              <p className="mt-5 text-center text-[10px] leading-5 text-slate-500">
                Si todavía no tenés cuenta, Google la crea automáticamente en
                tu primer acceso.
              </p>
            </div>
          )}

          <p className="mt-8 text-center text-[9px] leading-5 text-slate-400">
            Al continuar, aceptás los términos de uso y la política de
            privacidad de Taska.
          </p>
        </div>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-screen place-items-center bg-[#f8f9fb]">
          <LoaderCircle className="size-5 animate-spin text-violet-600" />
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
