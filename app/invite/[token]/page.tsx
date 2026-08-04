"use client";

import { CheckCircle2, LoaderCircle, TriangleAlert } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { acceptRemoteInvitation } from "@/lib/task-repository";

export default function AcceptInvitationPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [state, setState] = useState<"loading" | "success" | "error">(
    "loading",
  );
  const [message, setMessage] = useState("Validando tu invitación…");

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void (async () => {
        try {
          const result = await acceptRemoteInvitation(params.token);
          setState("success");
          setMessage(
            result.kind === "project"
              ? "Ya tenés acceso a la campaña compartida."
              : "Ya sos parte del espacio de trabajo.",
          );
          window.setTimeout(() => router.replace("/"), 1200);
        } catch (error) {
          setState("error");
          setMessage(
            error instanceof Error
              ? error.message
              : "La invitación no pudo aceptarse.",
          );
        }
      })();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [params.token, router]);

  const Icon =
    state === "loading"
      ? LoaderCircle
      : state === "success"
        ? CheckCircle2
        : TriangleAlert;

  return (
    <main className="mac-wallpaper grid min-h-screen place-items-center p-6">
      <section className="mac-window w-full max-w-md p-8 text-center">
        <Icon
          className={`mx-auto size-10 ${
            state === "loading"
              ? "animate-spin text-blue-500"
              : state === "success"
                ? "text-emerald-500"
                : "text-amber-500"
          }`}
        />
        <h1 className="mt-5 text-xl font-semibold text-slate-900">
          Invitación a Taska
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">{message}</p>
        {state === "error" && (
          <button
            onClick={() => router.replace("/")}
            className="mac-button-primary mt-6"
          >
            Volver a Taska
          </button>
        )}
      </section>
    </main>
  );
}
