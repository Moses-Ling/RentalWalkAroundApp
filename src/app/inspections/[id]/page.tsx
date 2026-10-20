"use client";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import Photos from "../../../components/Photos";
import SignaturePad from "../../../components/SignaturePad";
import { api, enumLabel, useApi } from "../../../lib/client";
import { MOVE_IN_ACKNOWLEDGMENT } from "../../../lib/acknowledgment";

const CONDITIONS = ["EXCELLENT", "GOOD", "FAIR", "POOR", "DAMAGED"];
const WORKING = ["WORKING", "PARTIAL", "NOT_WORKING", "NA"];
const CHANGES = ["UNCHANGED", "NEW_DAMAGE", "REPAIRED", "WORKING_ORDER_CHANGED"];

type Photo = { id: string; kind: "ORIGINAL" | "ANNOTATED"; originalId: string | null; caption: string };
type Comment = { id: string; author: string; text: string };
type Blemish = { id: string; description: string; status: string; priorBlemishId: string | null; photos: Photo[]; comments: Comment[]; itemId: string | null };
type Item = { id: string; name: string; isEquipment: boolean; condition: string | null; workingOrder: string | null; notes: string; changeStatus: string | null; priorItemId: string | null; photos: Photo[]; comments: Comment[] };
type Room = { id: string; name: string; condition: string | null; notes: string; items: Item[]; blemishes: Blemish[]; photos: Photo[]; comments: Comment[] };
type Insp = {
  id: string; type: "MOVE_IN" | "MOVE_OUT"; status: "DRAFT" | "SIGNED"; rooms: Room[];
  lease: { id: string; renterName: string; property: { name: string } };
  signatures: { role: string; name: string }[];
};

function Select({ value, options, onChange, disabled, placeholder = "—" }: { value: string | null; options: string[]; onChange: (v: string | null) => void; disabled: boolean; placeholder?: string }) {
  return (
    <select className="input" disabled={disabled} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o} value={o}>{enumLabel(o)}</option>)}
    </select>
  );
}

function Notes({ value, disabled, onSave, placeholder }: { value: string; disabled: boolean; onSave: (v: string) => void; placeholder: string }) {
  // Native keyboard dictation (mic key) works in any textarea.
  return <textarea key={value} className="input py-2" rows={2} disabled={disabled} placeholder={placeholder} defaultValue={value} onBlur={(e) => e.target.value !== value && onSave(e.target.value)} />;
}

function Comments({ list, target, locked, onChange }: { list: Comment[]; target: Record<string, string>; locked: boolean; onChange: () => void }) {
  const [text, setText] = useState("");
  const [author, setAuthor] = useState("RENTER");
  return (
    <div className="space-y-1">
      {list.map((c) => <p key={c.id} className="rounded bg-amber-50 px-2 py-1 text-sm"><b>{enumLabel(c.author)}:</b> {c.text}</p>)}
      {!locked && (
        <form className="flex gap-1" onSubmit={async (e) => { e.preventDefault(); if (!text.trim()) return; await api("POST", "comments", { ...target, author, text }); setText(""); onChange(); }}>
          <select className="input w-28" value={author} onChange={(e) => setAuthor(e.target.value)}><option value="RENTER">renter</option><option value="LANDLORD">landlord</option></select>
          <input className="input" placeholder="Add comment" value={text} onChange={(e) => setText(e.target.value)} />
        </form>
      )}
    </div>
  );
}

export default function InspectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: insp, error, reload } = useApi<Insp>(`inspections/${id}`);
  const [open, setOpen] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [blemish, setBlemish] = useState("");
  const [sigRole, setSigRole] = useState("LANDLORD");
  const [sigName, setSigName] = useState("");
  const [sigImg, setSigImg] = useState<string | null>(null);
  const [showSign, setShowSign] = useState(false);
  const [editing, setEditing] = useState<{ kind: "room" | "item"; id: string; name: string } | null>(null);
  const [newItem, setNewItem] = useState("");
  const [newRoom, setNewRoom] = useState("");
  const firstRoom = insp?.rooms[0]?.id;
  useEffect(() => { window.scrollTo(0, 0); }, []);
  useEffect(() => { if (firstRoom) setOpen((o) => o ?? firstRoom); }, [firstRoom]);

  if (error) return <p className="text-red-600">{error}</p>;
  if (!insp) return <p>Loading…</p>;
  const locked = insp.status === "SIGNED";
  const moveOut = insp.type === "MOVE_OUT";

  const canEditLayout = !locked && !moveOut;
  const saveEdit = () => { const e = editing; setEditing(null); if (e && e.name.trim()) patch(`inspection-${e.kind}s/${e.id}`, { name: e.name }); };
  const editor = (kind: "room" | "item", rid: string) => (
    <form className="flex flex-1 gap-2" onSubmit={(ev) => { ev.preventDefault(); saveEdit(); }}>
      <input autoFocus className="input" value={editing!.name} onChange={(ev) => setEditing({ kind, id: rid, name: ev.target.value })} />
      <button className="btn">Save</button>
      <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
    </form>
  );

  const run = async (fn: () => Promise<unknown>) => { setErr(""); try { await fn(); await reload(); } catch (e) { setErr((e as Error).message); } };
  const patch = (path: string, body: unknown) => run(() => api("PATCH", path, body));

  return (
    <div className="space-y-4">
      <Link href={`/leases/${insp.lease.id}`} className="text-sm text-slate-500">← {insp.lease.property.name} · {insp.lease.renterName}</Link>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{enumLabel(insp.type)} inspection</h1>
        {locked && <span className="rounded bg-green-100 px-2 py-1 text-sm text-green-800">Signed & locked</span>}
      </div>
      {err && <p className="rounded bg-red-50 p-2 text-sm text-red-700">{err}</p>}
      {!locked && insp.signatures.length > 0 && <p className="rounded bg-blue-50 p-2 text-sm text-blue-800">Signed by {insp.signatures.map((s) => s.name).join(", ")}. Any change or comment clears signatures, so both parties re-sign.</p>}

      {insp.rooms.map((room) => (
        <div key={room.id} className="card">
          <button className="flex w-full items-center justify-between text-left" onClick={() => setOpen(open === room.id ? null : room.id)}>
            <span className="font-medium">{room.name}</span>
            <span className="text-sm text-slate-500">{enumLabel(room.condition)} · {room.blemishes.length} blemish{room.blemishes.length === 1 ? "" : "es"}</span>
          </button>
          {open === room.id && (
            <div className="mt-3 space-y-4">
              {canEditLayout && (
                <div className="flex items-center gap-4 text-sm">
                  {editing?.kind === "room" && editing.id === room.id ? editor("room", room.id) : <button className="text-slate-600" onClick={() => setEditing({ kind: "room", id: room.id, name: room.name })}>Rename room</button>}
                  <button className="text-red-600" onClick={() => confirm(`Remove ${room.name} from this inspection?`) && run(() => api("DELETE", `inspection-rooms/${room.id}`))}>Remove room</button>
                </div>
              )}
              <div className="space-y-2">
                <label className="label">Room condition</label>
                <Select value={room.condition} options={CONDITIONS} disabled={locked} onChange={(v) => patch(`inspection-rooms/${room.id}`, { condition: v })} />
                <Notes value={room.notes} disabled={locked} placeholder="Room notes (tap mic on keyboard to dictate)" onSave={(v) => patch(`inspection-rooms/${room.id}`, { notes: v })} />
                <Photos photos={room.photos} target={{ roomId: room.id }} locked={locked} onChange={reload} />
                <Comments list={room.comments} target={{ roomId: room.id }} locked={locked} onChange={reload} />
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Items</h3>
                {room.items.map((it) => (
                  <div key={it.id} className="space-y-2 rounded-lg bg-slate-50 p-3">
                    {editing?.kind === "item" && editing.id === it.id ? editor("item", it.id) : (
                      <div className="flex items-center justify-between">
                        <div className="font-medium">{it.name}{it.isEquipment && <span className="ml-2 rounded bg-slate-200 px-1.5 text-xs">equipment</span>}</div>
                        {canEditLayout && (
                          <span className="flex gap-3 text-sm">
                            <button className="text-slate-600" onClick={() => setEditing({ kind: "item", id: it.id, name: it.name })}>rename</button>
                            <button className="text-red-600" onClick={() => confirm(`Remove ${it.name}?`) && run(() => api("DELETE", `inspection-items/${it.id}`))}>remove</button>
                          </span>
                        )}
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <div><label className="label">Condition</label><Select value={it.condition} options={CONDITIONS} disabled={locked} onChange={(v) => patch(`inspection-items/${it.id}`, { condition: v })} /></div>
                      {it.isEquipment && <div><label className="label">Working order</label><Select value={it.workingOrder} options={WORKING} disabled={locked} onChange={(v) => patch(`inspection-items/${it.id}`, { workingOrder: v })} /></div>}
                    </div>
                    {moveOut && <div><label className="label">Compared to move-in</label><Select value={it.changeStatus} options={CHANGES} disabled={locked} onChange={(v) => patch(`inspection-items/${it.id}`, { changeStatus: v })} /></div>}
                    <Notes value={it.notes} disabled={locked} placeholder="Notes" onSave={(v) => patch(`inspection-items/${it.id}`, { notes: v })} />
                    <Photos photos={it.photos} target={{ itemId: it.id }} locked={locked} onChange={reload} />
                    <Comments list={it.comments} target={{ itemId: it.id }} locked={locked} onChange={reload} />
                  </div>
                ))}
              </div>

              {canEditLayout && (
                <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); run(async () => { await api("POST", `inspection-rooms/${room.id}/items`, { name: newItem, isEquipment: /(fridge|oven|stove|washer|dryer|unit|fan|heater|detector|toilet|dishwasher|microwave|lock)/i.test(newItem) }); setNewItem(""); }); }}>
                  <input className="input" placeholder="Add item to this room" value={newItem} onChange={(e) => setNewItem(e.target.value)} />
                  <button className="btn">Add</button>
                </form>
              )}

              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Blemishes</h3>
                {room.blemishes.map((b) => (
                  <div key={b.id} className="space-y-2 rounded-lg bg-red-50 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <Notes value={b.description} disabled={locked || (moveOut && !!b.priorBlemishId)} placeholder="Describe the blemish" onSave={(v) => patch(`blemishes/${b.id}`, { description: v })} />
                      {b.status === "REPAIRED" && <span className="rounded bg-green-100 px-2 text-xs text-green-800">repaired</span>}
                    </div>
                    {moveOut && !b.priorBlemishId && <span className="text-xs font-medium text-red-700">NEW since move-in</span>}
                    <Photos photos={b.photos} target={{ blemishId: b.id }} locked={locked} onChange={reload} />
                    <Comments list={b.comments} target={{ blemishId: b.id }} locked={locked} onChange={reload} />
                    {!locked && !b.priorBlemishId && <button className="text-sm text-red-600" onClick={() => confirm("Delete blemish?") && run(() => api("DELETE", `blemishes/${b.id}`))}>Delete blemish</button>}
                  </div>
                ))}
                {!locked && (
                  <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); run(async () => { await api("POST", `inspection-rooms/${room.id}/blemishes`, { description: blemish }); setBlemish(""); }); }}>
                    <input className="input" placeholder="New blemish (e.g. 2in scratch by door)" value={blemish} onChange={(e) => setBlemish(e.target.value)} />
                    <button className="btn">Add</button>
                  </form>
                )}
              </div>
            </div>
          )}
        </div>
      ))}

      {canEditLayout && (
        <form className="card flex gap-2" onSubmit={(e) => { e.preventDefault(); run(async () => { await api("POST", `inspections/${id}/rooms`, { name: newRoom }); setNewRoom(""); }); }}>
          <input className="input" placeholder="Add a room to this inspection" value={newRoom} onChange={(e) => setNewRoom(e.target.value)} />
          <button className="btn">Add room</button>
        </form>
      )}

      <section className="card space-y-3">
        <h2 className="font-medium">Sign-off</h2>
        {!moveOut && (
          <div className="space-y-2 rounded bg-slate-50 p-3 text-xs text-slate-700">
            <p className="font-medium">{MOVE_IN_ACKNOWLEDGMENT.title}</p>
            {MOVE_IN_ACKNOWLEDGMENT.paragraphs.map((p) => <p key={p}>{p}</p>)}
          </div>
        )}
        {locked ? (
          <p className="text-sm text-slate-600">Both parties signed. This record can no longer be edited.</p>
        ) : (
          !showSign && insp.signatures.length === 0 ? (
            <button className="btn w-full" onClick={() => setShowSign(true)}>Ready to sign</button>
          ) : (
          <>
            <p className="text-sm text-slate-600">Hand the phone to the renter to review, comment and sign. The inspection locks once both parties have signed.</p>
            {insp.signatures.map((s) => <p key={s.role} className="text-sm text-green-700">✓ {enumLabel(s.role)} signed: {s.name}</p>)}
            <select className="input" value={sigRole} onChange={(e) => setSigRole(e.target.value)}><option value="LANDLORD">Landlord</option><option value="RENTER">Renter</option></select>
            <input className="input" placeholder="Full name" value={sigName} onChange={(e) => setSigName(e.target.value)} />
            <SignaturePad onChange={setSigImg} />
            <button className="btn w-full" disabled={!sigImg || !sigName.trim()} onClick={() => run(async () => { await api("POST", `inspections/${id}/sign`, { role: sigRole, name: sigName, imageDataUrl: sigImg }); setSigName(""); setSigImg(null); })}>Sign</button>
          </>
          )
        )}
        <a className="btn-secondary w-full" href={`/api/inspections/${id}/report.pdf`} target="_blank">Download PDF</a>
      </section>
    </div>
  );
}
