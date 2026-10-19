"use client";
import { useRef, useState } from "react";

export default function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  const pos = (e: React.PointerEvent) => {
    const c = ref.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  };

  return (
    <div>
      <canvas
        ref={ref}
        width={600}
        height={200}
        className="w-full touch-none rounded-lg border border-slate-300 bg-white"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = true;
          const ctx = ref.current!.getContext("2d")!;
          ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.strokeStyle = "#111";
          const p = pos(e);
          ctx.beginPath(); ctx.moveTo(p.x, p.y);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const p = pos(e);
          const ctx = ref.current!.getContext("2d")!;
          ctx.lineTo(p.x, p.y); ctx.stroke();
        }}
        onPointerUp={() => {
          drawing.current = false;
          setEmpty(false);
          onChange(ref.current!.toDataURL("image/png"));
        }}
      />
      <button
        type="button"
        className="mt-1 text-sm text-slate-500 underline"
        disabled={empty}
        onClick={() => {
          const c = ref.current!;
          c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
          setEmpty(true);
          onChange(null);
        }}
      >Clear</button>
    </div>
  );
}
