import type {
  BillingStatus,
  CommercialCondition,
  Task,
  TaskBilling,
  TimeEntry,
} from "@/lib/types";
import { elapsedSeconds, timeEntryCost } from "@/lib/task-utils";

export const commercialConditionLabels: Record<CommercialCondition, string> = {
  pending: "Pendiente de definir",
  fee: "Incluido en fee",
  extra: "Facturable fuera del fee",
  non_billable: "Bonificado / no facturable",
};

export const billingStatusLabels: Record<BillingStatus, string> = {
  not_required: "No requiere facturación",
  pending_info: "Pendiente de información",
  ready: "Lista para facturar",
  invoiced: "Facturada",
  collected: "Cobrada",
  observed: "Observada",
  cancelled: "Cancelada",
};

export const billingStatusOrder: BillingStatus[] = [
  "pending_info",
  "ready",
  "invoiced",
  "collected",
  "observed",
  "not_required",
  "cancelled",
];

export function defaultTaskBilling(
  billing?: TaskBilling,
  currency: string | null = null,
): TaskBilling {
  return {
    commercialCondition: billing?.commercialCondition ?? "pending",
    status: billing?.status ?? "not_required",
    amount: Number(billing?.amount ?? 0),
    externalCost: Number(billing?.externalCost ?? 0),
    currency: billing?.currency ?? currency,
    assignee: billing?.assignee ?? null,
    invoiceNumber: billing?.invoiceNumber ?? "",
    purchaseOrder: billing?.purchaseOrder ?? "",
    notes: billing?.notes ?? "",
    invoicedAt: billing?.invoicedAt ?? null,
    collectedAt: billing?.collectedAt ?? null,
    updatedAt: billing?.updatedAt ?? null,
  };
}

export function taskLaborCost(task: Task, entries: TimeEntry[], now = new Date()) {
  return entries
    .filter((entry) => entry.taskId === task.id)
    .reduce((total, entry) => total + timeEntryCost(entry, now), 0);
}

export function taskTrackedSeconds(task: Task, entries: TimeEntry[], now = new Date()) {
  return entries
    .filter((entry) => entry.taskId === task.id)
    .reduce((total, entry) => total + elapsedSeconds(entry, now), 0);
}

export function taskMargin(task: Task, entries: TimeEntry[], now = new Date()) {
  const billing = defaultTaskBilling(task.billing);
  return billing.amount - billing.externalCost - taskLaborCost(task, entries, now);
}

export function nextBillingStatusForCondition(
  condition: CommercialCondition,
  current: BillingStatus,
): BillingStatus {
  if (condition === "extra") {
    return current === "not_required" || current === "cancelled"
      ? "pending_info"
      : current;
  }
  return "not_required";
}

export function billingNeedsAttention(task: Task) {
  const billing = defaultTaskBilling(task.billing);
  return (
    task.status === "resuelto" &&
    (billing.commercialCondition === "pending" ||
      (billing.commercialCondition === "extra" &&
        !["collected", "cancelled"].includes(billing.status)))
  );
}
