import { useEffect, useRef } from "react";

const px = { imageRendering: "pixelated" as const };

export function WorldMapScreen({ zone, draw, onClose }: { zone: string; draw: (c: HTMLCanvasElement) => void; onClose: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { if (ref.current) draw(ref.current); }, [draw]);
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#04060ad9] anim-fade-in p-3" onClick={onClose}>
      <div className="nord-panel nord-frame w-full max-w-[620px] px-5 py-5 anim-fade-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-baseline justify-between">
          <div className="font-display text-xl tracking-[0.25em] text-[#dfe8f0] uppercase text-shadow-carve">Карта Нидов</div>
          <button className="text-[#6e7f8d] hover:text-[#dfe8f0] text-xl leading-none cursor-pointer" onClick={onClose}>✕</button>
        </div>
        <div className="mt-1 text-[11px] text-[#6e7f8d] tracking-widest uppercase">ты здесь: <span className="text-[#8fd8e8]">{zone}</span></div>
        <canvas ref={ref} className="mt-3 w-full border border-[#2c3d4d]" style={{ ...px, background: "#0a121c" }} />
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10.5px] text-[#6e7f8d] tracking-wider">
          <span><span className="inline-block w-2 h-2 align-middle" style={{ background: "#c9a24b" }} /> подземелья</span>
          <span><span className="inline-block w-2 h-2 align-middle" style={{ background: "#63d8c8" }} /> руны / алтарь</span>
          <span><span className="inline-block w-2 h-2 align-middle" style={{ background: "#8fd8e8" }} /> святилища</span>
          <span><span className="inline-block w-2 h-2 align-middle" style={{ background: "#e8c979" }} /> цель</span>
          <span><span className="inline-block w-2 h-2 align-middle" style={{ background: "#f4f8fc" }} /> ты</span>
        </div>
        <div className="mt-3 text-[10.5px] text-[#4a5a68] tracking-widest"><span className="kbd">ESC</span> ЗАКРЫТЬ</div>
      </div>
    </div>
  );
}