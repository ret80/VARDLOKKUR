import type { HudData } from "../../game/models";
import { SwordIco, AxeIco, BowIco, HammerIco, HeartIco, ArrowIco, RuneIco } from "../icons";

export function InventoryScreen({ hud, onClose }: { hud: HudData; onClose: () => void }) {
  const Weapon = ({ owned, name, rune, desc, kbd, tag, children }: {
    owned: boolean; name: string; rune: string; desc: string; kbd: string; tag?: string; children: React.ReactNode;
  }) => (
    <div className={`relative px-3 py-2.5 border ${owned ? "border-[#c9a24b88] bg-[#c9a24b0d]" : "border-[#2c3d4d] opacity-45"}`}>
      <div className="flex items-center gap-2.5">
        <span className="font-display text-lg text-[#63d8c8]">{rune}</span>
        {children}
        <div className="flex-1">
          <div className="font-display text-[13px] tracking-[0.1em] text-[#dfe8f0] uppercase">{name}{tag && <span className="ml-2 text-[9px] text-[#7ee2a8] border border-[#7ee2a866] px-1 py-0.5 align-middle">{tag}</span>}</div>
          <div className="text-[11px] text-[#8fa0ae] leading-snug">{desc}</div>
        </div>
        <span className="kbd">{kbd}</span>
      </div>
    </div>
  );
  const Gift = ({ on, name, desc }: { on: boolean; name: string; desc: string }) => (
    <div className={`px-3 py-2 border text-[12px] ${on ? "border-[#63d8c888] text-[#a8ece2]" : "border-[#2c3d4d] text-[#4a5a68]"}`}>
      <span className="font-display tracking-wider">{on ? "✦ " : "· "}{name}</span>
      <span className="text-[#6e7f8d]"> — {desc}</span>
    </div>
  );
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#04060acc] anim-fade-in p-3" onClick={onClose}>
      <div className="nord-panel nord-frame w-full max-w-[540px] max-h-[92%] overflow-y-auto px-5 py-5 anim-fade-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-baseline justify-between">
          <div className="font-display text-xl tracking-[0.25em] text-[#dfe8f0] uppercase text-shadow-carve">Сума Бьорна</div>
          <button className="text-[#6e7f8d] hover:text-[#dfe8f0] text-xl leading-none cursor-pointer" onClick={onClose}>✕</button>
        </div>
        <div className="mt-3 font-display text-[12px] tracking-[0.25em] text-[#c9a24b] uppercase">Оружие</div>
        <div className="mt-1.5 space-y-1.5">
          <Weapon owned={hud.hasSword} name="Ржавый Меч" rune="ᚦ" desc="Клинок клана. Короткий, но верный удар." kbd="SPACE" tag={hud.swordUp ? "+УРОН" : undefined}><SwordIco dim={!hud.hasSword} /></Weapon>
          <Weapon owned={hud.hasAxe} name="Ледяная Секира" rune="ᛁ" desc="Летит и возвращается. Замораживает врагов — щиты не спасут." kbd="J" tag={hud.axeUp ? "+УРОН" : undefined}><AxeIco dim={!hud.hasAxe} /></Weapon>
          <Weapon owned={hud.hasBow} name="Лук Сумерек" rune="ᛖ" desc="Удерживай, чтобы замерло время. Стрелы бьют издалека." kbd="L"><BowIco dim={!hud.hasBow} /></Weapon>
          <Weapon owned={hud.hasHammer} name="Рунический Молот" rune="ᚺ" desc="Дар Каменной Крепости. Удары меча теперь оглушают." kbd="ПАС." tag={hud.hasHammer ? "ОГЛУШЕНИЕ" : undefined}><HammerIco dim={!hud.hasHammer} /></Weapon>
        </div>
        <div className="mt-4 font-display text-[12px] tracking-[0.25em] text-[#8fd8e8] uppercase">Припасы и дары</div>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5 text-[12px]">
          <div className="px-3 py-2 border border-[#2c3d4d] flex items-center gap-2"><ArrowIco /><span className="text-[#dfe8f0] font-bold">{hud.arrows}</span><span className="text-[#6e7f8d]">стрел</span></div>
          <div className="px-3 py-2 border border-[#2c3d4d] flex items-center gap-2"><HeartIco /><span className="text-[#dfe8f0] font-bold">{hud.hearts}</span><span className="text-[#6e7f8d]">в суме <span className="kbd">F</span></span></div>
          <div className="px-3 py-2 border border-[#2c3d4d] flex items-center gap-2"><RuneIco /><span className="text-[#dfe8f0] font-bold">{hud.runes}/5</span><span className="text-[#6e7f8d]">Забытых Рун</span></div>
          <div className="px-3 py-2 border border-[#2c3d4d] flex items-center gap-2"><span className="text-[#c9a24b]">{hud.hasKey ? "⚿" : "·"}</span><span className={hud.hasKey ? "text-[#dfe8f0]" : "text-[#4a5a68]"}>Ключ Хранителя</span></div>
        </div>
        <div className="mt-1.5 space-y-1.5">
          <Gift on={hud.furyRune} name="Руна Ярости" desc="быстрее замах" />
          <Gift on={hud.nornsFavor} name="Благоволенье Норн" desc="пьедесталы видны на карте" />
          <Gift on={hud.secretKnown} name="Тайник" desc="клад отмечен на карте" />
          <Gift on={hud.bear} name="Медвежонок" desc="ждёт хозяйку" />
        </div>
        <div className="mt-4 text-[10.5px] text-[#4a5a68] tracking-widest"><span className="kbd">TAB</span>/<span className="kbd">ESC</span> ЗАКРЫТЬ</div>
      </div>
    </div>
  );
}