export function HealthBar({ hp, maxHp }: { hp: number; maxHp: number }) {
  const segs = maxHp;
  const filled = hp;
  return (
    <div className="flex items-center gap-1.5">
      <span className="font-display text-[11px] tracking-widest text-[#e06060] uppercase">Жизнь</span>
      <div className="flex gap-[2px]">
        {Array.from({ length: segs }, (_, i) => (
          <div key={i} className="w-[7px] h-[13px] border border-[#c9a24b66]"
            style={{ background: i < filled ? "linear-gradient(180deg,#d05555,#7a1e2e)" : "rgba(20,26,34,0.7)", transform: "skewX(-8deg)" }} />
        ))}
      </div>
      <span className="text-[11px] font-bold text-[#e8dcc0]">{filled}/{segs}</span>
    </div>
  );
}