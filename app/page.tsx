import { AuthGate } from "@/components/auth-gate";
import { TaskaApp } from "@/components/taska-app";

export default function Home() {
  return (
    <AuthGate>
      <TaskaApp />
    </AuthGate>
  );
}
