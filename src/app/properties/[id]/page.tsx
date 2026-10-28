"use client";
import Link from "next/link";
import { use, useState } from "react";
import { api, useApi } from "../../../lib/client";

type Item = { id: string; name: string; isEquipment: boolean };
type Room = { id: string; name: string; items: Item[] };
type Property = { isDefaultLayout: boolean; id: string; name: string; address: string; rooms: Room[]; leases: { id: string; renterName: string; startDate: string; endDate: string; status: string }[] };

export default function PropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: p, error, reload } = useApi<Property>(`properties/${id}`);
  const { data: templates } = useApi<{ key: string; name: string; itemCount: number }[]>("templates");
  const [open, setOpen] = useState<string | null>(null);
  const [roomName, setRoomName] = useState("");
  const [itemName, setItemName] = useState("");
  const [lease, setLease] = useState({ renterName: "", renterEmail: "", renterPhone: "", startDate: "", endDate: "" });
  const [err, setErr] = useState("");
  const [editing, setEditing] = useState<{ kind: "rooms" | "items"; id: string; name: string } | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setErr("");
    try { await fn(); await reload(); } catch (e) { setErr((e as Error).message); }
  };

  const saveEdit = () => {
    const e = editing;
    setEditing(null);
    if (e && e.name.trim()) run(() => api("PATCH", `${e.kind}/${e.id}`, { name: e.name }));
  };
  const editor = (kind: "rooms" | "items", id: string) => (
    <form className="flex flex-1 gap-2" onSubmit={(ev) => { ev.preventDefault(); saveEdit(); }}>
      <input autoFocus className="input" value={editing!.name} onChange={(ev) => setEditing({ kind, id, name: ev.target.value })} />
      <button className="btn">Save</button>
      <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
    </form>
  );

  if (error) return <p className="text-red-600">{error}</p>;
  if (!p) return <p>Loading…</p>;

  return (
    <div className="space-y-5">
      <Link href="/" className="text-sm text-slate-500">← Properties</Link>
      <div>
        <h1 className="text-xl font-semibold">{p.name}</h1>
        <p className="text-sm text-slate-500">{p.address}</p>
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}

      <section className="space-y-2">
        <h2 className="font-medium">Leases</h2>
        {p.leases.map((l) => (
          <div key={l.id} className="card flex items-center justify-between">
            <Link href={`/leases/${l.id}`} className="block flex-1">
              <div className="font-medium">{l.renterName}</div>
              <div className="text-sm text-slate-500">{l.startDate.slice(0, 10)} → {l.endDate.slice(0, 10)} · {l.status.toLowerCase()}</div>
            </Link>
            <button className="text-sm text-red-600" onClick={() => confirm("Delete this lease and all its inspections and repairs?") && run(() => api("DELETE", `leases/${l.id}`))}>Delete</button>
          </div>
        ))}
        <form className="card space-y-2" onSubmit={(e) => { e.preventDefault(); run(() => api("POST", `properties/${id}/leases`, lease)); }}>
          <h3 className="text-sm font-medium">New lease</h3>
          <input className="input" placeholder="Renter name" value={lease.renterName} onChange={(e) => setLease({ ...lease, renterName: e.target.value })} />
          <input className="input" placeholder="Email" type="email" value={lease.renterEmail} onChange={(e) => setLease({ ...lease, renterEmail: e.target.value })} />
          <input className="input" placeholder="Phone" type="tel" value={lease.renterPhone} onChange={(e) => setLease({ ...lease, renterPhone: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <div><label className="label">Start</label><input className="input" type="date" value={lease.startDate} onChange={(e) => setLease({ ...lease, startDate: e.target.value })} /></div>
            <div><label className="label">End</label><input className="input" type="date" value={lease.endDate} onChange={(e) => setLease({ ...lease, endDate: e.target.value })} /></div>
          </div>
          <button className="btn w-full">Create lease</button>
        </form>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Rooms and equipment</h2>
        {p.rooms.length === 0 && (
          <button className="btn w-full" onClick={() => run(() => api("POST", `properties/${id}/starting-layout`, {}))}>Add the standard rooms</button>
        )}
        {p.isDefaultLayout
          ? <p className="text-sm text-green-700">✓ This layout is the default for new properties.</p>
          : <button className="btn-secondary" onClick={() => confirm("Use this layout as the default for all new properties?") && run(() => api("POST", `properties/${id}/default-layout`, {}))}>Use as default for new properties</button>}
        <p className="text-sm text-slate-500">This layout is copied into each inspection. Changing it later does not alter past reports.</p>
        {p.rooms.map((r) => (
          <div key={r.id} className="card">
            <button className="flex w-full items-center justify-between text-left" onClick={() => setOpen(open === r.id ? null : r.id)}>
              <span className="font-medium">{r.name}</span>
              <span className="text-sm text-slate-500">{r.items.length} items</span>
            </button>
            {open === r.id && (
              <div className="mt-3 space-y-2">
                {r.items.map((it) => (
                  <div key={it.id} className="flex items-center justify-between text-sm">
                    {editing?.kind === "items" && editing.id === it.id ? editor("items", it.id) : (<>
                      <span>{it.name}{it.isEquipment && <span className="ml-2 rounded bg-slate-100 px-1.5 text-xs">equipment</span>}</span>
                      <span className="flex gap-3">
                        <button className="text-slate-600" onClick={() => setEditing({ kind: "items", id: it.id, name: it.name })}>rename</button>
                        <button className="text-red-600" onClick={() => run(() => api("DELETE", `items/${it.id}`))}>remove</button>
                      </span></>)}
                  </div>
                ))}
                <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); run(async () => { await api("POST", `rooms/${r.id}/items`, { name: itemName, isEquipment: /(fridge|oven|stove|washer|dryer|unit|fan|heater|detector|toilet|dishwasher|microwave|lock)/i.test(itemName) }); setItemName(""); }); }}>
                  <input className="input" placeholder="Add item" value={itemName} onChange={(e) => setItemName(e.target.value)} />
                  <button className="btn">Add</button>
                </form>
                {editing?.kind === "rooms" && editing.id === r.id ? editor("rooms", r.id) : <button className="mr-4 text-sm text-slate-600" onClick={() => setEditing({ kind: "rooms", id: r.id, name: r.name })}>Rename room</button>}
                <button className="text-sm text-red-600" onClick={() => confirm(`Delete ${r.name}?`) && run(() => api("DELETE", `rooms/${r.id}`))}>Delete room</button>
              </div>
            )}
          </div>
        ))}
        <div className="card space-y-2">
          <h3 className="text-sm font-medium">Add room from template</h3>
          <div className="flex flex-wrap gap-2">
            {templates?.map((t) => (
              <button key={t.key} className="btn-secondary" onClick={() => run(() => api("POST", `properties/${id}/rooms`, { templateKey: t.key }))}>{t.name}</button>
            ))}
          </div>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); run(async () => { await api("POST", `properties/${id}/rooms`, { name: roomName }); setRoomName(""); }); }}>
            <input className="input" placeholder="Custom room name" value={roomName} onChange={(e) => setRoomName(e.target.value)} />
            <button className="btn">Add</button>
          </form>
        </div>
      </section>
    </div>
  );
}
