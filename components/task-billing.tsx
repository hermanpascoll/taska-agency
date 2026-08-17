"use client";

import {
  AlertCircle,
  BadgeDollarSign,
  Banknote,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Download,
  FileCheck2,
  ReceiptText,
  Save,
  TrendingUp,
  UserRound,
  X,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { clsx } from "clsx";
import {
  billingNeedsAttention,
  billingStatusLabels,
  billingStatusOrder,
  commercialConditionLabels,
  defaultTaskBilling,
  nextBillingStatusForCondition,
  taskLaborCost,
  taskMargin,
  taskTrackedSeconds,
} from "@/lib/billing-utils";
import { formatDuration } from "@/lib/task-utils";
import type {
  BillingStatus,
  CommercialCondition,
  Person,
  Task,
  TaskBillingUpdate,
  TimeEntry,
  UpdateTaskInput,
} from "@/lib/types";

const statusStyles: Record<BillingStatus, string> = {
  not_required: "bg-slate-100 text-slate-600",
  pending_info: "bg-amber-100 text-amber-800",
  ready: "bg-sky-100 text-sky-800",
  invoiced: "bg-violet-100 text-violet-800",
  collected: "bg-emerald-100 text-emerald-800",
  observed: "bg-rose-100 text-rose-800",
  cancelled: "bg-slate-200 text-slate-500",
};

function money(value: number, currency: string) {
  return new Intl.NumberFormat("es-UY", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function billingDraft(task: Task, currency: string): TaskBillingUpdate {
  const billing = defaultTaskBilling(task.billing, currency);
  return {
    commercialCondition: billing.commercialCondition,
    status: billing.status,
    amount: billing.amount,
    externalCost: billing.externalCost,
    currency: billing.currency ?? currency,
    assigneeId: billing.assignee?.id ?? null,
    invoiceNumber: billing.invoiceNumber,
    purchaseOrder: billing.purchaseOrder,
    notes: billing.notes,
    invoicedAt: billing.invoicedAt,
    collectedAt: billing.collectedAt,
  };
}

export function TaskBillingPanel({
  task,
  entries,
  people,
  currency,
  canView = true,
  canEdit,
  onUpdate,
  notify,
  compact = false,
}: {
  task: Task;
  entries: TimeEntry[];
  people: Person[];
  currency: string;
  canView?: boolean;
  canEdit: boolean;
  onUpdate: (input: UpdateTaskInput) => Promise<void> | void;
  notify: (message: string) => void;
  compact?: boolean;
}) {
  const [draft, setDraft] = useState(() => billingDraft(task, currency));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const laborCost = taskLaborCost(task, entries);
  const trackedSeconds = taskTrackedSeconds(task, entries);
  const margin = draft.amount - draft.externalCost - laborCost;
  const marginPercent = draft.amount > 0 ? (margin / draft.amount) * 100 : 0;
  const effectiveCurrency = draft.currency || currency;

  if (!canView) {
    return (
      <section className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-slate-200 text-slate-500">
            <ReceiptText className="size-4" />
          </span>
          <span>
            <strong className="block text-[11px] text-slate-700">Etapa administrativa</strong>
            <span className="text-[9px] text-slate-500">
              Esta información está disponible sólo para personas autorizadas.
            </span>
          </span>
        </div>
      </section>
    );
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onUpdate({ billing: draft });
      notify("Ficha de facturación actualizada");
    } catch (saveError: unknown) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "No se pudo actualizar la facturación",
      );
    } finally {
      setSaving(false);
    }
  }

  const condition = draft.commercialCondition;
  const isExtra = condition === "extra";

  return (
    <details
      className={clsx(
        "group/billing overflow-hidden rounded-xl border bg-white",
        billingNeedsAttention(task)
          ? "border-amber-300 shadow-[0_0_0_3px_rgba(245,158,11,.08)]"
          : "border-slate-200",
      )}
      open={compact || undefined}
    >
      <summary className="focus-ring flex cursor-pointer list-none items-center gap-3 px-4 py-3.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700">
          <BadgeDollarSign className="size-4.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <strong className="text-[12px] text-slate-800">Facturación y rentabilidad</strong>
            <span className={clsx("rounded-full px-2 py-1 text-[8px] font-bold", statusStyles[draft.status])}>
              {billingStatusLabels[draft.status]}
            </span>
          </span>
          <span className="mt-0.5 block text-[9px] text-slate-500">
            {commercialConditionLabels[condition]}
            {isExtra ? ` · ${money(draft.amount, effectiveCurrency)}` : ""}
          </span>
        </span>
        {billingNeedsAttention(task) && (
          <span className="hidden items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-[8px] font-bold text-amber-800 sm:flex">
            <AlertCircle className="size-3" /> Requiere atención
          </span>
        )}
        <ChevronDown className="size-4 text-slate-400 transition group-open/billing:rotate-180" />
      </summary>

      <form onSubmit={save} className="border-t border-slate-200 p-4 sm:p-5">
        {task.status === "resuelto" && condition === "pending" && (
          <p className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[9px] font-semibold leading-4 text-amber-800">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            El proceso está finalizado. Definí si estaba incluido en el fee o si debe facturarse por fuera.
          </p>
        )}

        <fieldset disabled={!canEdit} className={!canEdit ? "opacity-80" : undefined}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-[9px] font-semibold text-slate-600">
            Condición comercial
            <select
              value={condition}
              onChange={(event) => {
                const commercialCondition = event.target.value as CommercialCondition;
                setDraft((current) => ({
                  ...current,
                  commercialCondition,
                  status: nextBillingStatusForCondition(commercialCondition, current.status),
                }));
              }}
              className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-[10px] text-slate-800"
            >
              {(Object.keys(commercialConditionLabels) as CommercialCondition[]).map((item) => (
                <option key={item} value={item}>{commercialConditionLabels[item]}</option>
              ))}
            </select>
          </label>
          <label className="text-[9px] font-semibold text-slate-600">
            Estado de facturación
            <select
              value={draft.status}
              disabled={!isExtra}
              onChange={(event) => {
                const status = event.target.value as BillingStatus;
                const today = new Date().toISOString().slice(0, 10);
                setDraft((current) => ({
                  ...current,
                  status,
                  invoicedAt:
                    (status === "invoiced" || status === "collected") && !current.invoicedAt
                      ? today
                      : current.invoicedAt,
                  collectedAt:
                    status === "collected" && !current.collectedAt
                      ? today
                      : current.collectedAt,
                }));
              }}
              className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-[10px] text-slate-800 disabled:bg-slate-100 disabled:text-slate-400"
            >
              {billingStatusOrder.map((status) => (
                <option key={status} value={status}>{billingStatusLabels[status]}</option>
              ))}
            </select>
          </label>
          <label className="text-[9px] font-semibold text-slate-600">
            Responsable de facturación
            <span className="mt-1.5 flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-3">
              <UserRound className="size-3.5 text-slate-400" />
              <select
                value={draft.assigneeId ?? ""}
                onChange={(event) => setDraft((current) => ({ ...current, assigneeId: event.target.value || null }))}
                className="min-w-0 flex-1 bg-transparent text-[10px] text-slate-800 outline-none"
              >
                <option value="">Sin responsable</option>
                {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
              </select>
            </span>
          </label>
          <label className="text-[9px] font-semibold text-slate-600">
            Moneda
            <input
              value={draft.currency ?? ""}
              maxLength={3}
              onChange={(event) => setDraft((current) => ({ ...current, currency: event.target.value.toUpperCase() }))}
              className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-[10px] uppercase text-slate-800"
            />
          </label>
        </div>

        {isExtra && (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-[9px] font-semibold text-slate-600">Importe a facturar<input type="number" min="0" step="0.01" value={draft.amount} onChange={(event) => setDraft((current) => ({ ...current, amount: Math.max(0, Number(event.target.value) || 0) }))} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-[10px]" /></label>
              <label className="text-[9px] font-semibold text-slate-600">Costos externos<input type="number" min="0" step="0.01" value={draft.externalCost} onChange={(event) => setDraft((current) => ({ ...current, externalCost: Math.max(0, Number(event.target.value) || 0) }))} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-[10px]" /></label>
              <label className="text-[9px] font-semibold text-slate-600">Orden de compra<input value={draft.purchaseOrder} onChange={(event) => setDraft((current) => ({ ...current, purchaseOrder: event.target.value }))} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-[10px]" /></label>
              <label className="text-[9px] font-semibold text-slate-600">N.º de factura<input value={draft.invoiceNumber} onChange={(event) => setDraft((current) => ({ ...current, invoiceNumber: event.target.value }))} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-[10px]" /></label>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: "Ingreso", value: money(draft.amount, effectiveCurrency), icon: Banknote, tone: "text-sky-700 bg-sky-50" },
                { label: "Costo externo", value: money(draft.externalCost, effectiveCurrency), icon: ReceiptText, tone: "text-amber-700 bg-amber-50" },
                { label: "Costo de horas", value: money(laborCost, effectiveCurrency), icon: CircleDollarSign, tone: "text-violet-700 bg-violet-50" },
                { label: "Margen estimado", value: `${money(margin, effectiveCurrency)} · ${marginPercent.toFixed(1)}%`, icon: TrendingUp, tone: margin >= 0 ? "text-emerald-700 bg-emerald-50" : "text-rose-700 bg-rose-50" },
              ].map((metric) => {
                const Icon = metric.icon;
                return <article key={metric.label} className="rounded-lg border border-slate-200 p-3"><span className={clsx("grid size-7 place-items-center rounded-lg", metric.tone)}><Icon className="size-3.5" /></span><strong className="mt-2 block text-[11px] text-slate-800">{metric.value}</strong><span className="text-[8px] text-slate-500">{metric.label}</span></article>;
              })}
            </div>
            <p className="mt-2 text-[8px] text-slate-400">{formatDuration(trackedSeconds)} registradas. El margen descuenta costos externos y costo horario auditado.</p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-[9px] font-semibold text-slate-600">Fecha de factura<input type="date" value={draft.invoicedAt ?? ""} onChange={(event) => setDraft((current) => ({ ...current, invoicedAt: event.target.value || null }))} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-[10px]" /></label>
              <label className="text-[9px] font-semibold text-slate-600">Fecha de cobro<input type="date" value={draft.collectedAt ?? ""} onChange={(event) => setDraft((current) => ({ ...current, collectedAt: event.target.value || null }))} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-[10px]" /></label>
            </div>
          </>
        )}

        <label className="mt-4 block text-[9px] font-semibold text-slate-600">
          Notas administrativas
          <textarea value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} placeholder="Información para facturar, condiciones acordadas o seguimiento de cobro…" className="mt-1.5 min-h-20 w-full rounded-lg border border-slate-200 p-3 text-[10px] leading-5" />
        </label>
        </fieldset>
        {error && <p role="alert" className="mt-3 text-[9px] font-semibold text-rose-600">{error}</p>}
        {canEdit && <div className="mt-4 flex justify-end">
          <button disabled={saving} className="focus-ring flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-[10px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
            <Save className="size-3.5" />{saving ? "Guardando…" : "Guardar facturación"}
          </button>
        </div>}
      </form>
    </details>
  );
}

export function BillingView({
  tasks,
  entries,
  people,
  currency,
  onUpdateTask,
  notify,
  canEdit = true,
}: {
  tasks: Task[];
  entries: TimeEntry[];
  people: Person[];
  currency: string;
  onUpdateTask: (taskId: string, input: UpdateTaskInput) => Promise<void>;
  notify: (message: string) => void;
  canEdit?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [condition, setCondition] = useState<CommercialCondition | "all">("all");
  const [status, setStatus] = useState<BillingStatus | "all">("all");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const rows = useMemo(
    () => tasks.filter((task) => !task.parentTaskId && !task.deletedAt),
    [tasks],
  );
  const filtered = rows.filter((task) => {
    const billing = defaultTaskBilling(task.billing, currency);
    const normalized = query.trim().toLowerCase();
    return (
      (!normalized || `${task.title} ${task.code} ${task.client} ${task.project.name}`.toLowerCase().includes(normalized)) &&
      (condition === "all" || billing.commercialCondition === condition) &&
      (status === "all" || billing.status === status)
    );
  });
  const extra = rows.filter((task) => defaultTaskBilling(task.billing).commercialCondition === "extra");
  const pending = rows.filter(billingNeedsAttention).length;
  const invoiced = extra.filter((task) => ["invoiced", "collected"].includes(defaultTaskBilling(task.billing).status)).reduce((total, task) => total + defaultTaskBilling(task.billing).amount, 0);
  const collected = extra.filter((task) => defaultTaskBilling(task.billing).status === "collected").reduce((total, task) => total + defaultTaskBilling(task.billing).amount, 0);
  const margin = extra.reduce((total, task) => total + taskMargin(task, entries), 0);
  const selectedTask = rows.find((task) => task.id === selectedTaskId) ?? null;

  function exportCsv() {
    const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const lines = [
      ["Código", "Tarea", "Cliente", "Proyecto", "Condición", "Estado", "Importe", "Costos externos", "Costo de horas", "Margen", "Moneda", "Responsable", "Factura", "OC"],
      ...filtered.map((task) => {
        const billing = defaultTaskBilling(task.billing, currency);
        const labor = taskLaborCost(task, entries);
        return [task.code, task.title, task.client, task.project.name, commercialConditionLabels[billing.commercialCondition], billingStatusLabels[billing.status], billing.amount, billing.externalCost, labor, billing.amount - billing.externalCost - labor, billing.currency ?? currency, billing.assignee?.name ?? "", billing.invoiceNumber, billing.purchaseOrder];
      }),
    ];
    const blob = new Blob([`\uFEFF${lines.map((line) => line.map(escape).join(",")).join("\n")}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `taska-facturacion-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="asana-page animate-enter">
      <div className="asana-page-heading">
        <div><h1>Facturación</h1><p>Prefacturación, cobros y rentabilidad vinculados a cada proceso.</p></div>
        <button onClick={exportCsv} className="asana-secondary-button"><Download className="size-4" />Exportar CSV</button>
      </div>
      <div className="asana-report-grid">
        {[
          { label: "Requieren atención", value: pending, icon: AlertCircle, color: "#e89732" },
          { label: "Facturado", value: money(invoiced, currency), icon: FileCheck2, color: "#6c5ce7" },
          { label: "Cobrado", value: money(collected, currency), icon: CheckCircle2, color: "#2e9b78" },
          { label: "Margen estimado", value: money(margin, currency), icon: TrendingUp, color: margin >= 0 ? "#2e9b78" : "#e8384f" },
        ].map((metric) => {
          const Icon = metric.icon;
          return <article key={metric.label} className="asana-report-card"><span className="flex items-center gap-2"><Icon className="size-4" style={{ color: metric.color }} />{metric.label}</span><strong>{metric.value}</strong><div className="asana-chart-bar" style={{ background: metric.color }} /></article>;
        })}
      </div>
      <div className="mt-5 grid gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-3">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar tarea, cliente o proyecto…" className="h-10 rounded-lg border border-slate-200 px-3 text-[10px]" />
        <select value={condition} onChange={(event) => setCondition(event.target.value as CommercialCondition | "all")} className="h-10 rounded-lg border border-slate-200 px-3 text-[10px]"><option value="all">Todas las condiciones</option>{(Object.keys(commercialConditionLabels) as CommercialCondition[]).map((item) => <option key={item} value={item}>{commercialConditionLabels[item]}</option>)}</select>
        <select value={status} onChange={(event) => setStatus(event.target.value as BillingStatus | "all")} className="h-10 rounded-lg border border-slate-200 px-3 text-[10px]"><option value="all">Todos los estados</option>{billingStatusOrder.map((item) => <option key={item} value={item}>{billingStatusLabels[item]}</option>)}</select>
      </div>
      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="hidden grid-cols-[1.5fr_1fr_1fr_130px_120px_40px] border-b border-slate-200 bg-slate-50 px-4 py-3 text-[8px] font-bold uppercase tracking-wide text-slate-500 lg:grid"><span>Proceso</span><span>Cliente / proyecto</span><span>Condición</span><span>Importe</span><span>Estado</span><span /></div>
        {filtered.map((task) => {
          const billing = defaultTaskBilling(task.billing, currency);
          return <button key={task.id} onClick={() => setSelectedTaskId(task.id)} className="grid w-full gap-2 border-b border-slate-100 px-4 py-3 text-left last:border-0 hover:bg-slate-50 lg:grid-cols-[1.5fr_1fr_1fr_130px_120px_40px] lg:items-center"><span className="min-w-0"><strong className="block truncate text-[10px] text-slate-800">{task.title}</strong><span className="text-[8px] text-slate-400">{task.code}{task.status === "resuelto" ? " · Finalizada" : " · En proceso"}</span></span><span className="min-w-0 text-[9px] text-slate-600"><span className="block truncate">{task.client}</span><span className="block truncate text-[8px] text-slate-400">{task.project.name}</span></span><span className="text-[9px] text-slate-600">{commercialConditionLabels[billing.commercialCondition]}</span><strong className="text-[10px] text-slate-800">{billing.commercialCondition === "extra" ? money(billing.amount, billing.currency ?? currency) : "—"}</strong><span className={clsx("w-fit rounded-full px-2 py-1 text-[8px] font-bold", statusStyles[billing.status])}>{billingStatusLabels[billing.status]}</span><span className="text-slate-400">›</span></button>;
        })}
        {filtered.length === 0 && <p className="p-8 text-center text-[10px] text-slate-400">No hay procesos que coincidan con los filtros.</p>}
      </div>

      {selectedTask && (
        <div className="fixed inset-0 z-[95] grid place-items-center p-3 sm:p-6">
          <button className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm" onClick={() => setSelectedTaskId(null)} aria-label="Cerrar facturación" />
          <section role="dialog" aria-modal="true" aria-label={`Facturación de ${selectedTask.title}`} className="relative max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-7">
            <header className="mb-5 flex items-start gap-3"><span className="grid size-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><ReceiptText className="size-5" /></span><span><h2 className="text-[16px] font-bold text-slate-900">{selectedTask.title}</h2><p className="text-[9px] text-slate-500">{selectedTask.code} · {selectedTask.client} · {selectedTask.project.name}</p></span><button onClick={() => setSelectedTaskId(null)} className="ml-auto rounded-lg p-2 text-slate-400 hover:bg-slate-100" aria-label="Cerrar"><X className="size-4" /></button></header>
            <TaskBillingPanel
              key={`${selectedTask.id}-${selectedTask.billing?.updatedAt ?? "new"}`}
              task={selectedTask}
              entries={entries.filter((entry) => entry.taskId === selectedTask.id)}
              people={people}
              currency={currency}
              canEdit={canEdit}
              canView
              onUpdate={(input) => onUpdateTask(selectedTask.id, input)}
              notify={notify}
              compact
            />
          </section>
        </div>
      )}
    </section>
  );
}
