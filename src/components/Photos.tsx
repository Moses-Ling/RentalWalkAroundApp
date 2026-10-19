"use client";
import { useRef, useState } from "react";
import Annotator from "./Annotator";
import { api, uploadPhoto } from "../lib/client";

type Photo = { id: string; kind: "ORIGINAL" | "ANNOTATED"; originalId: string | null; caption: string };

export default function Photos({
  photos, target, locked, onChange,
}: { photos: Photo[]; target: Record<string, string>; locked: boolean; onChange: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const annotatedFor = new Map(photos.filter((p) => p.kind === "ANNOTATED").map((p) => [p.originalId, p.id]));
  const originals = photos.filter((p) => p.kind === "ORIGINAL");

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true); setErr("");
    try {
      for (const f of Array.from(files)) await uploadPhoto("photos", f, target);
      onChange();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {originals.map((p) => {
          const shown = annotatedFor.get(p.id) ?? p.id;
          return (
            <div key={p.id} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/photos/${shown}`} alt={p.caption || "photo"} className="h-24 w-24 rounded-lg object-cover" onClick={() => !locked && setEditing(p.id)} />
              {annotatedFor.has(p.id) && <span className="absolute bottom-1 left-1 rounded bg-red-600 px-1 text-[10px] text-white">marked</span>}
              {!locked && (
                <button aria-label="delete photo" className="absolute right-1 top-1 h-6 w-6 rounded-full bg-black/60 text-xs text-white"
                  onClick={async () => { if (confirm("Delete this photo?")) { await api("DELETE", `photos/${p.id}`); onChange(); } }}>×</button>
              )}
            </div>
          );
        })}
        {!locked && (
          <button className="flex h-24 w-24 items-center justify-center rounded-lg border-2 border-dashed border-slate-300 text-sm text-slate-500" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? "…" : "+ photo"}
          </button>
        )}
      </div>
      <input ref={input} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => add(e.target.files)} />
      {err && <p className="mt-1 text-sm text-red-600">{err}</p>}
      {editing && (
        <Annotator
          src={`/api/photos/${editing}`}
          onCancel={() => setEditing(null)}
          onSave={async (dataUrl) => { await api("POST", `photos/${editing}/annotate`, { dataUrl }); setEditing(null); onChange(); }}
        />
      )}
    </div>
  );
}
