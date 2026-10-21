"use client";
import { useEffect, useRef, useState } from "react";
import { arrowHead, ellipseFromDrag, Pt } from "../lib/annotate";

type Tool = "pen" | "circle" | "arrow";
type Shape = { tool: Tool; color: string; pts: Pt[] };

function draw(ctx: CanvasRenderingContext2D, s: Shape, lw: number) {
  ctx.strokeStyle = s.color;
  ctx.lineWidth = lw;
  ctx.lineCap = ctx.lineJoin = "round";
  ctx.beginPath();
  const a = s.pts[0];
  const b = s.pts[s.pts.length - 1];
  if (s.tool === "pen") {
    ctx.moveTo(a.x, a.y);
    s.pts.forEach((p) => ctx.lineTo(p.x, p.y));
  } else if (s.tool === "circle") {
    const e = ellipseFromDrag(a, b);
    ctx.ellipse(e.cx, e.cy, Math.max(e.rx, 1), Math.max(e.ry, 1), 0, 0, Math.PI * 2);
  } else {
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    const [l, r] = arrowHead(a, b, lw * 5);
    ctx.moveTo(l.x, l.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(r.x, r.y);
  }
  ctx.stroke();
}

/** Draws on top of a photo; the original is never modified. Saves a flattened JPEG. */
export default function Annotator({ src, onSave, onCancel }: { src: string; onSave: (dataUrl: string) => Promise<void>; onCancel: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const img = useRef<HTMLImageElement | null>(null);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [tool, setTool] = useState<Tool>("circle");
  const [color, setColor] = useState("#ef4444");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const current = useRef<Shape | null>(null);

  const render = (extra?: Shape | null) => {
    const c = canvas.current, im = img.current;
    if (!c || !im) return;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(im, 0, 0, c.width, c.height);
    const lw = Math.max(4, c.width / 150);
    [...shapes, ...(extra ? [extra] : [])].forEach((s) => draw(ctx, s, lw));
  };

  useEffect(() => {
    const im = new Image();
    im.onload = () => {
      img.current = im;
      const c = canvas.current!;
      c.width = im.naturalWidth;
      c.height = im.naturalHeight;
      render();
    };
    im.src = src;
  }, [src]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { render(); }, [shapes]); // eslint-disable-line react-hooks/exhaustive-deps

  const pt = (e: React.PointerEvent): Pt => {
    const c = canvas.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex flex-1 items-center justify-center overflow-hidden p-2">
        <canvas
          ref={canvas}
          className="max-h-full max-w-full touch-none"
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); current.current = { tool, color, pts: [pt(e)] }; }}
          onPointerMove={(e) => {
            if (!current.current) return;
            current.current.pts.push(pt(e));
            render(current.current);
          }}
          onPointerUp={() => {
            const s = current.current;
            current.current = null;
            if (s && s.pts.length > 1) setShapes((x) => [...x, s]);
            else render();
          }}
        />
      </div>
      {err && <p className="bg-red-600 px-3 py-2 text-sm text-white">Could not save: {err}</p>}
      <div className="flex flex-wrap items-center gap-2 bg-slate-900 p-3">
        {(["circle", "arrow", "pen"] as Tool[]).map((t) => (
          <button key={t} onClick={() => setTool(t)} className={`min-h-[44px] rounded-lg px-3 text-sm ${tool === t ? "bg-white text-black" : "bg-slate-700 text-white"}`}>{t}</button>
        ))}
        {["#ef4444", "#facc15", "#22c55e", "#3b82f6"].map((c) => (
          <button key={c} aria-label={`color ${c}`} onClick={() => setColor(c)} style={{ background: c }} className={`h-9 w-9 rounded-full ${color === c ? "ring-2 ring-white" : ""}`} />
        ))}
        <button className="min-h-[44px] rounded-lg bg-slate-700 px-3 text-sm text-white" onClick={() => setShapes((s) => s.slice(0, -1))}>undo</button>
        <div className="ml-auto flex gap-2">
          <button className="min-h-[44px] rounded-lg bg-slate-700 px-3 text-sm text-white" onClick={onCancel}>cancel</button>
          <button
            disabled={busy || shapes.length === 0}
            className="min-h-[44px] rounded-lg bg-blue-600 px-4 text-sm font-medium text-white disabled:opacity-50"
            onClick={async () => { setBusy(true); setErr(""); try { await onSave(canvas.current!.toDataURL("image/jpeg", 0.88)); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } }}
          >save</button>
        </div>
      </div>
    </div>
  );
}
