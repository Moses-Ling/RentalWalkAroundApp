"use client";
import Link from "next/link";
import { use, useState } from "react";
import { api, enumLabel, uploadPhoto, useApi } from "../../../lib/client";

type Lease = {
  id: string; renterName: string; startDate: string; endDate: string; status: string;
  property: { id: string; name: string };
  inspections: { id: string; type: "MOVE_IN" | "MOVE_OUT"; status: "DRAFT" | "SIGNED" }[];
};
type Repair = {
  id: string; date: string; description: string; vendor: string; costCents: number; responsibility: string;
  blemish: { description: string } | null; item: { name: string } | null; photos: { id: string; caption: string }[];
};
type Insp = { rooms: { id: string; name: string; blemishes: { id: string; description: string; status: string }[]; items: { id: string; name: string }[] }[] };

export default function LeasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: lease, error, reload } = useApi<Lease>(`leases/${id}`);
  const { data: repairs, reload: reloadRepairs } = useApi<Repair[]>(`leases/${id}/repairs`);
  const moveInId = lease?.inspections.find((i) => i.type === "MOVE_IN")?.id;
  const { data: moveIn } = useApi<Insp>(moveInId ? `inspections/${moveInId}` : "templates");
  const [err, setErr] = useState("");
  const [form, setForm] = useState({ date: "", description: "", vendor: "", cost: "", responsibility: "LANDLORD_MAINTENANCE", link: "" });
  const [files, setFiles] = useState<{ before?: File; after?: File; receipt?: File }>({});

  if (error) return <p className="text-red-600">{error}</p>;
  if (!lease) return <p>Loading…</p>;

  const inspection = (t: "MOVE_IN" | "MOVE_OUT") => lease.inspections.find((i) => i.type === t);
  const blemishes = (moveInId && (moveIn as Insp)?.rooms ? (moveIn as Insp).rooms : []).flatMap((r) => r.blemishes.map((b) => ({ ...b, room: r.name })));
  const equipment = (moveInId && (moveIn as Insp)?.rooms ? (moveIn as Insp).rooms : []).flatMap((r) => r.items.map((i) => ({ ...i, room: r.name })));

  async function start(type: "MOVE_IN" | "MOVE_OUT") {
    setErr("");
    try { const i = await api<{ id: string }>("POST", `leases/${id}/inspections`, { type }); location.href = `/inspections/${i.id}`; }
    catch (e) { setErr((e as Error).message); }
  }

  async function addRepair(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    try {
      const [kind, linkId] = form.link.split(":");
      const r = await api<{ id: string }>("POST", `leases/${id}/repairs`, {
        date: form.date, description: form.description, vendor: form.vendor,
        costCents: Math.round(parseFloat(form.cost || "0") * 100), responsibility: form.responsibility,
        blemishId: kind === "b" ? linkId : undefined, itemId: kind === "i" ? linkId : undefined,
      });
      for (const [caption, f] of Object.entries(files)) if (f) await uploadPhoto(`repairs/${r.id}/photos`, f, { caption });
      setForm({ date: "", description: "", vendor: "", cost: "", responsibility: "LANDLORD_MAINTENANCE", link: "" });
      setFiles({});
      reload(); reloadRepairs();
    } catch (e2) { setErr((e2 as Error).message); }
  }

  return (
    <div className="space-y-5">
      <Link href={`/properties/${lease.property.id}`} className="text-sm text-slate-500">← {lease.property.name}</Link>
      <div>
        <h1 className="text-xl font-semibold">{lease.renterName}</h1>
        <p className="text-sm text-slate-500">{lease.startDate.slice(0, 10)} → {lease.endDate.slice(0, 10)}</p>
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}

      <section className="space-y-2">
        <h2 className="font-medium">Inspections</h2>
        {(["MOVE_IN", "MOVE_OUT"] as const).map((t) => {
          const i = inspection(t);
          return (
            <div key={t} className="card flex items-center justify-between">
              <div>
                <div className="font-medium">{enumLabel(t)}</div>
                <div className="text-sm text-slate-500">{i ? (i.status === "SIGNED" ? "Signed & locked" : "In progress") : "Not started"}</div>
              </div>
              {i ? <Link className="btn-secondary" href={`/inspections/${i.id}`}>Open</Link> : <button className="btn" onClick={() => start(t)}>Start</button>}
            </div>
          );
        })}
        {inspection("MOVE_IN") && inspection("MOVE_OUT") && (
          <div className="card space-y-2">
            <a className="btn w-full" href={`/api/leases/${id}/comparison.pdf`} target="_blank">Comparison report (PDF)</a>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Repair log</h2>
        {repairs?.map((r) => (
          <div key={r.id} className="card text-sm">
            <div className="font-medium">{r.description}</div>
            <div className="text-slate-500">
              {r.date.slice(0, 10)}{r.vendor && ` · ${r.vendor}`} · ${(r.costCents / 100).toFixed(2)} · {enumLabel(r.responsibility)}
            </div>
            {(r.blemish || r.item) && <div className="text-slate-500">Fixes: {r.blemish?.description ?? r.item?.name}</div>}
            <div className="mt-2 flex flex-wrap gap-2">
              {r.photos.map((p) => (
                <div key={p.id} className="text-center text-xs text-slate-500">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/photos/${p.id}`} alt={p.caption} className="h-16 w-16 rounded object-cover" />{p.caption}
                </div>
              ))}
            </div>
            <button className="mt-2 text-red-600" onClick={async () => { if (confirm("Delete this repair?")) { await api("DELETE", `repairs/${r.id}`); reloadRepairs(); } }}>Delete</button>
          </div>
        ))}
        {!inspection("MOVE_IN") ? (
          <p className="text-sm text-slate-500">Complete the move-in inspection to log repairs against blemishes or equipment.</p>
        ) : (
          <form className="card space-y-2" onSubmit={addRepair}>
            <h3 className="text-sm font-medium">Log a repair</h3>
            <input className="input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            <textarea className="input py-2" placeholder="What was repaired?" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <input className="input" placeholder="Contractor / vendor" value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} />
            <input className="input" placeholder="Cost ($)" inputMode="decimal" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
            <select className="input" value={form.responsibility} onChange={(e) => setForm({ ...form, responsibility: e.target.value })}>
              <option value="LANDLORD_MAINTENANCE">Landlord maintenance</option>
              <option value="TENANT">Tenant caused</option>
              <option value="NORMAL_WEAR">Normal wear</option>
            </select>
            <select className="input" value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })}>
              <option value="">Not linked to a record</option>
              <optgroup label="Blemishes">{blemishes.map((b) => <option key={b.id} value={`b:${b.id}`}>{b.room}: {b.description}{b.status === "REPAIRED" ? " (fixed)" : ""}</option>)}</optgroup>
              <optgroup label="Items / equipment">{equipment.map((i) => <option key={i.id} value={`i:${i.id}`}>{i.room}: {i.name}</option>)}</optgroup>
            </select>
            {(["before", "after", "receipt"] as const).map((k) => (
              <div key={k}><label className="label">{k} photo</label><input type="file" accept="image/*" capture="environment" onChange={(e) => setFiles({ ...files, [k]: e.target.files?.[0] })} /></div>
            ))}
            <button className="btn w-full">Save repair</button>
          </form>
        )}
      </section>
      {!lease.inspections.some((i) => i.status === "SIGNED") && (
        <button className="text-sm text-red-600" onClick={async () => { if (confirm("Delete this lease and all its inspections and repairs?")) { try { await api("DELETE", `leases/${id}`); location.href = `/properties/${lease.property.id}`; } catch (e) { setErr((e as Error).message); } } }}>Delete lease</button>
      )}
    </div>
  );
}
