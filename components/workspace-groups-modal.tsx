"use client";

import { Check, LoaderCircle, MailPlus, Plus, Trash2, UserMinus, UsersRound, X } from "lucide-react";
import { useMemo, useState } from "react";
import { clsx } from "clsx";
import { useWorkspaceGroups } from "@/hooks/use-workspace-groups";
import type { Person } from "@/lib/types";

const colors = ["#0a84ff", "#8b5cf6", "#f06a6a", "#10b981", "#f59e0b", "#ec4899"];

export function WorkspaceGroupsModal({
  workspaceId,
  workspaceName,
  people,
  currentUserId,
  canAdminister,
  onClose,
  notify,
}: {
  workspaceId: string;
  workspaceName: string;
  people: Person[];
  currentUserId: string;
  canAdminister: boolean;
  onClose: () => void;
  notify: (message: string) => void;
}) {
  const { groups, loading, createGroup, addMember, removeMember, invite, deleteGroup } =
    useWorkspaceGroups(workspaceId, people, currentUserId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(colors[0]);
  const [memberId, setMemberId] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const selected = groups.find((group) => group.id === selectedId) ?? groups[0] ?? null;
  const canManageSelected = Boolean(selected && (canAdminister || selected.createdBy === currentUserId));
  const availablePeople = useMemo(
    () => people.filter((person) => !person.deactivated && !selected?.members.some((member) => member.user.id === person.id)),
    [people, selected],
  );

  async function handleCreate() {
    if (name.trim().length < 2) return;
    setSaving(true);
    try {
      const id = await createGroup(name.trim(), description.trim(), color);
      setSelectedId(id);
      setCreating(false);
      setName("");
      setDescription("");
      notify("Equipo creado");
    } catch (error) {
      notify(error instanceof Error ? error.message : "No se pudo crear el equipo");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/55 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Equipos">
      <section className="flex h-[min(760px,92vh)] w-full max-w-5xl overflow-hidden rounded-2xl border border-white/10 bg-white shadow-2xl dark:bg-[#1c1c1e]">
        <aside className="w-[280px] shrink-0 border-r border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-[#242426]">
          <div className="flex items-center gap-3 px-2 py-1">
            <span className="grid size-9 place-items-center rounded-xl bg-[#0a84ff]/12 text-[#0a84ff]"><UsersRound className="size-[18px]" /></span>
            <div className="min-w-0"><h2 className="text-[14px] font-bold text-slate-900">Equipos</h2><p className="truncate text-[9px] text-slate-400">{workspaceName}</p></div>
          </div>
          <button type="button" onClick={() => setCreating(true)} className="focus-ring mt-4 flex w-full items-center gap-2 rounded-lg bg-[#0a84ff] px-3 py-2.5 text-[11px] font-bold text-white hover:bg-[#0879ea]"><Plus className="size-4" />Crear equipo</button>
          <div className="mt-4 space-y-1">
            {groups.map((group) => (
              <button key={group.id} type="button" onClick={() => { setSelectedId(group.id); setCreating(false); }} className={clsx("focus-ring flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left", selected?.id === group.id && !creating ? "bg-[#0a84ff]/12 text-[#0879ea]" : "text-slate-600 hover:bg-black/5")}>
                <span className="size-2.5 rounded-full" style={{ backgroundColor: group.color }} />
                <span className="min-w-0 flex-1 truncate text-[11px] font-semibold">{group.name}</span>
                <span className="text-[9px] text-slate-400">{group.members.length}</span>
              </button>
            ))}
            {!loading && groups.length === 0 && <p className="px-3 py-5 text-[10px] leading-5 text-slate-400">Creá equipos para agrupar personas por área, disciplina o proyecto.</p>}
            {loading && <LoaderCircle className="mx-auto mt-8 size-5 animate-spin text-slate-400" />}
          </div>
        </aside>

        <div className="min-w-0 flex-1 overflow-y-auto p-5 sm:p-7">
          <button type="button" onClick={onClose} className="focus-ring float-right rounded-lg p-2 text-slate-400 hover:bg-slate-100" aria-label="Cerrar equipos"><X className="size-5" /></button>
          {creating ? (
            <div className="mx-auto max-w-xl pt-8">
              <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#0a84ff]">Nuevo equipo</p>
              <h3 className="mt-2 text-2xl font-bold text-slate-900">Organizá un grupo de personas</h3>
              <p className="mt-2 text-[11px] leading-5 text-slate-500">Después de crearlo podés sumar integrantes del espacio o invitarlos por correo.</p>
              <label className="mt-7 block text-[10px] font-bold text-slate-600">Nombre<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej. Equipo creativo" className="focus-ring mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-[12px]" /></label>
              <label className="mt-4 block text-[10px] font-bold text-slate-600">Descripción<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Qué hace este equipo" className="focus-ring mt-2 min-h-24 w-full resize-none rounded-lg border border-slate-200 bg-white p-3 text-[11px]" /></label>
              <div className="mt-4"><p className="text-[10px] font-bold text-slate-600">Color</p><div className="mt-2 flex gap-2">{colors.map((item) => <button key={item} type="button" onClick={() => setColor(item)} className="grid size-8 place-items-center rounded-full" style={{ backgroundColor: item }} aria-label={`Elegir color ${item}`}>{color === item && <Check className="size-4 text-white" />}</button>)}</div></div>
              <div className="mt-7 flex justify-end gap-2"><button type="button" onClick={() => setCreating(false)} className="rounded-lg border border-slate-200 px-4 py-2.5 text-[10px] font-semibold text-slate-600">Cancelar</button><button type="button" disabled={saving || name.trim().length < 2} onClick={() => void handleCreate()} className="rounded-lg bg-[#0a84ff] px-4 py-2.5 text-[10px] font-bold text-white disabled:opacity-40">{saving ? "Creando…" : "Crear equipo"}</button></div>
            </div>
          ) : selected ? (
            <div className="pt-2">
              <div className="flex items-start gap-4">
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl text-white" style={{ backgroundColor: selected.color }}><UsersRound className="size-6" /></span>
                <div><h3 className="text-[22px] font-bold text-slate-900">{selected.name}</h3><p className="mt-1 text-[11px] text-slate-500">{selected.description || "Sin descripción"}</p></div>
                {canManageSelected && <button type="button" onClick={() => void deleteGroup(selected.id).then(() => notify("Equipo eliminado")).catch(() => notify("No se pudo eliminar el equipo"))} className="ml-auto rounded-lg p-2 text-rose-500 hover:bg-rose-500/10" aria-label="Eliminar equipo"><Trash2 className="size-4" /></button>}
              </div>

              {canManageSelected && (
                <div className="mt-7 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:grid-cols-2">
                  <div><p className="text-[10px] font-bold text-slate-700">Sumar desde el espacio</p><div className="mt-2 flex gap-2"><select value={memberId} onChange={(event) => setMemberId(event.target.value)} className="focus-ring h-10 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-[10px]"><option value="">Seleccionar integrante…</option>{availablePeople.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select><button type="button" disabled={!memberId} onClick={() => void addMember(selected.id, memberId).then(() => { setMemberId(""); notify("Integrante agregado"); }).catch((error) => notify(error instanceof Error ? error.message : "No se pudo agregar"))} className="rounded-lg bg-slate-900 px-3 text-[10px] font-bold text-white disabled:opacity-40"><Plus className="size-4" /></button></div></div>
                  <div><p className="text-[10px] font-bold text-slate-700">Invitar por correo</p><div className="mt-2 flex gap-2"><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="persona@empresa.com" className="focus-ring h-10 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-[10px]" /><button type="button" disabled={!email.includes("@")} onClick={() => void invite(selected.id, email).then((emailed) => { setEmail(""); notify(emailed ? "Invitación enviada" : "Invitación creada; el correo quedó pendiente"); }).catch((error) => notify(error instanceof Error ? error.message : "No se pudo invitar"))} className="rounded-lg bg-[#0a84ff] px-3 text-white disabled:opacity-40" aria-label="Invitar por correo"><MailPlus className="size-4" /></button></div></div>
                </div>
              )}

              <div className="mt-7"><div className="flex items-center justify-between"><h4 className="text-[13px] font-bold text-slate-800">Integrantes</h4><span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-semibold text-slate-500">{selected.members.length}</span></div><div className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">{selected.members.map((member) => <div key={member.user.id} className="flex items-center gap-3 px-4 py-3"><span className="grid size-9 place-items-center overflow-hidden rounded-full bg-cover bg-center text-[10px] font-bold text-white" style={{ backgroundColor: member.user.color, backgroundImage: member.user.avatarUrl ? `url(${member.user.avatarUrl})` : undefined }}>{member.user.avatarUrl ? <span className="sr-only">Foto de {member.user.name}</span> : member.user.initials}</span><div className="min-w-0 flex-1"><p className="truncate text-[11px] font-bold text-slate-700">{member.user.name}</p><p className="truncate text-[9px] text-slate-400">{member.user.email}</p></div><span className="text-[9px] font-semibold text-slate-400">{member.role === "owner" ? "Creador" : "Integrante"}</span>{canManageSelected && member.role !== "owner" && <button type="button" onClick={() => void removeMember(selected.id, member.user.id).then(() => notify("Integrante removido")).catch(() => notify("No se pudo remover"))} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-500" aria-label={`Quitar a ${member.user.name}`}><UserMinus className="size-4" /></button>}</div>)}</div></div>
              {selected.invitations.some((item) => !item.acceptedAt) && <div className="mt-6"><h4 className="text-[11px] font-bold text-slate-700">Invitaciones pendientes</h4><div className="mt-2 space-y-2">{selected.invitations.filter((item) => !item.acceptedAt).map((item) => <div key={item.id} className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2.5"><MailPlus className="size-4 text-slate-400" /><span className="text-[10px] text-slate-600">{item.email}</span><span className="ml-auto text-[8px] uppercase text-amber-500">Pendiente</span></div>)}</div></div>}
            </div>
          ) : (
            <div className="grid h-full place-items-center text-center"><div><UsersRound className="mx-auto size-10 text-slate-300" /><h3 className="mt-4 text-[16px] font-bold text-slate-700">Todavía no hay equipos</h3><p className="mt-2 text-[10px] text-slate-400">Creá el primero para organizar a las personas.</p></div></div>
          )}
        </div>
      </section>
    </div>
  );
}
