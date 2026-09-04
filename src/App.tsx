import { useCallback, useEffect, useRef, useState } from "react";
import {
  Engine, Screen, HudData, DialogueData, Stats, QuestView,
} from "./game/engine";

let toastId = 0;
type Toast = { id: number; msg: string };

/* ---------- пиксельные иконки ---------- */
const px = { imageRendering: "pixelated" as const };
const SwordIco = ({ dim }: { dim?: boolean }) => (
  <svg width="15" height="15" viewBox="0 0 12 12" style={{ ...px, opacity: dim ? 0.3 : 1 }}>
    <rect x="8" y="1" width="2" height="2" fill="#c8d3dc" />
    <rect x="7" y="2" width="2" height="2" fill="#c8d3dc" />
    <rect x="6" y="3" width="2" height="2" fill="#c8d3dc" />
    <rect x="5" y="4" width="2" height="2" fill="#a9b6c2" />
    <rect x="3" y="5" width="3" height="2" fill="#8a744a" />
    <rect x="2" y="8" width="2" height="2" fill="#5a4632" />
    <rect x="1" y="10" width="2" height="1" fill="#c9a24b" />
  </svg>
);
const AxeIco = ({ dim }: { dim?: boolean }) => (
  <svg width="15" height="15" viewBox="0 0 12 12" style={{ ...px, opacity: dim ? 0.3 : 1 }}>
    <rect x="5" y="1" width="4" height="4" fill="#9fe0ee" />
    <rect x="4" y="2" width="2" height="3" fill="#7fc4d4" />
    <rect x="5" y="5" width="2" height="6" fill="#5a4632" />
    <rect x="6" y="2" width="1" height="1" fill="#d8f4fa" />
  </svg>
);
const BowIco = ({ dim }: { dim?: boolean }) => (
  <svg width="15" height="15" viewBox="0 0 12 12" style={{ ...px, opacity: dim ? 0.3 : 1 }}>
    <rect x="2" y="1" width="1" height="3" fill="#8a744a" />
    <rect x="1" y="4" width="1" height="4" fill="#8a744a" />
    <rect x="2" y="8" width="1" height="3" fill="#8a744a" />
    <rect x="2" y="1" width="1" height="10" fill="#c9a24b" opacity="0.5" />
    <rect x="3" y="5" width="7" height="1" fill="#c8d3dc" />
    <rect x="10" y="5" width="2" height="1" fill="#e8c979" />
  </svg>
);
const HammerIco = ({ dim }: { dim?: boolean }) => (
  <svg width="15" height="15" viewBox="0 0 12 12" style={{ ...px, opacity: dim ? 0.3 : 1 }}>
    <rect x="2" y="1" width="8" height="4" fill="#63d8c8" />
    <rect x="2" y="1" width="8" height="1" fill="#a8ece2" />
    <rect x="5" y="5" width="2" height="6" fill="#5a4632" />
  </svg>
);
const HeartIco = () => (
  <svg width="13" height="13" viewBox="0 0 12 12" style={px}>
    <rect x="2" y="2" width="3" height="2" fill="#c03050" />
    <rect x="7" y="2" width="3" height="2" fill="#c03050" />
    <rect x="1" y="4" width="10" height="3" fill="#c03050" />
    <rect x="3" y="7" width="6" height="2" fill="#a02840" />
    <rect x="4" y="9" width="4" height="1" fill="#a02840" />
    <rect x="5" y="10" width="2" height="1" fill="#a02840" />
  </svg>
);
const ArrowIco = () => (
  <svg width="13" height="13" viewBox="0 0 12 12" style={px}>
    <rect x="9" y="1" width="2" height="2" fill="#e8c979" />
    <rect x="5" y="3" width="5" height="1" fill="#c8d3dc" />
    <rect x="1" y="7" width="6" height="1" fill="#8a744a" />
    <rect x="1" y="6" width="2" height="1" fill="#6e7f8d" />
    <rect x="1" y="8" width="2" height="1" fill="#6e7f8d" />
  </svg>
);
const RuneIco = () => (
  <svg width="13" height="13" viewBox="0 0 12 12" style={px}>
    <rect x="4" y="1" width="4" height="10" fill="#3d5a66" />
    <rect x="5" y="2" width="2" height="8" fill="#63d8c8" />
    <rect x="3" y="4" width="1" height="4" fill="#63d8c8" />
    <rect x="8" y="4" width="1" height="4" fill="#63d8c8" />
  </svg>
);
const KnotFrame = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 100 100" className={className} fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="50" cy="50" r="46" opacity="0.5" />
    <circle cx="50" cy="50" r="38" opacity="0.25" strokeDasharray="6 5" />
    <path d="M50 8 L58 22 L50 18 L42 22 Z" fill="currentColor" stroke="none" opacity="0.8" />
    <path d="M50 92 L58 78 L50 82 L42 78 Z" fill="currentColor" stroke="none" opacity="0.8" />
    <path d="M8 50 L22 42 L18 50 L22 58 Z" fill="currentColor" stroke="none" opacity="0.8" />
    <path d="M92 50 L78 42 L82 50 L78 58 Z" fill="currentColor" stroke="none" opacity="0.8" />
  </svg>
);

const CONTROLS: [string, string][] = [
  ["WASD / стрелки", "движение"],
  ["Пробел / K", "удар мечом"],
  ["E", "взаимодействие и речь"],
  ["J", "бросок Ледяной Секиры"],
  ["L (удерживать)", "прицел и выстрел из лука"],
  ["F", "съесть сердце из сумы"],
  ["Tab / I", "инвентарь"],
  ["Q", "журнал квестов"],
  ["Клик по плашке цели", "журнал квестов"],
  ["Клик по миникарте", "большая карта"],
  ["Esc / P", "пауза"],
  ["M", "звук вкл/выкл"],
];

const TIPS: string[] = [
  "Щит драугра держит удар спереди — бей сбоку или заморозь секирой [J].",
  "Удержание [L] замедляет время: целься спокойно.",
  "Святилища запоминают тебя: смерть вернёт к последнему из них.",
  "Волны Тумана сжимают мир до круга света и будят элитных врагов.",
  "Золотая стрелка ведёт к цели отслеживаемого квеста — выбрать её можно в журнале [Q].",
  "Поселение — безопасная зона: враги не заходят за частокол.",
  "Сердце подбирается в суму, когда здоровье полное. Ешь его на [F].",
];

function HelpOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#04060ae6] anim-fade-in p-4" onClick={onClose}>
      <div className="nord-panel nord-frame w-full max-w-[540px] max-h-[92%] overflow-y-auto px-6 py-6 anim-fade-up" onClick={(e) => e.stopPropagation()}>
        <div className="font-display text-2xl tracking-[0.3em] text-[#dfe8f0] uppercase text-shadow-carve text-center">Помощь</div>
        <div className="mt-1 text-center text-[12px] tracking-widest text-[#6e7f8d]">как выжить в Нидах</div>
        <div className="mt-5 space-y-1.5">
          {CONTROLS.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-3 text-[13px]">
              <span className="kbd whitespace-nowrap">{k}</span>
              <span className="text-[#8fa0ae] text-right">{v}</span>
            </div>
          ))}
        </div>
        <div className="mt-5 border-t border-[#2c3d4d] pt-4">
          <div className="font-display text-[13px] tracking-[0.25em] text-[#8fd8e8] uppercase">Советы выжившему</div>
          <ul className="mt-2 space-y-1.5">
            {TIPS.map((t, i) => (
              <li key={i} className="text-[12.5px] leading-snug text-[#8fa0ae] flex gap-2">
                <span className="text-[#c9a24b]">᛫</span>{t}
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-5 text-center">
          <button className="btn-rune btn-ice text-[13px]" onClick={onClose}>Понятно</button>
        </div>
      </div>
    </div>
  );
}

function QuestScreen({ quests, trackedId, onTrack, onClose }: {
  quests: QuestView[]; trackedId: string; onTrack: (id: string) => void; onClose: () => void;
}) {
  const [prevTrackedId, setPrevTrackedId] = useState(trackedId);
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    if (trackedId !== prevTrackedId) {
      setPrevTrackedId(trackedId);
      setRefreshKey((k) => k + 1);
    }
  }, [trackedId, prevTrackedId]);
  const main = quests.filter((q) => q.main);
  const side = quests.filter((q) => !q.main);
  const Row = ({ q }: { q: QuestView }) => {
    const isTracked = q.id === trackedId;
    return (
      <button
        onClick={() => { if (!q.done) onTrack(q.id); }}
        className={`w-full text-left px-3 py-2 border transition-colors cursor-pointer ${
          isTracked ? "border-[#c9a24b] bg-[#c9a24b14]" : q.done ? "border-[#2c3d4d] opacity-50" : "border-[#2c3d4d] hover:border-[#4a6a7a]"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className={`font-display text-[13px] tracking-[0.12em] uppercase ${q.done ? "text-[#6e7f8d] line-through" : "text-[#dfe8f0]"}`}>{q.title}</span>
          {isTracked && <span className="text-[10px] font-bold tracking-widest text-[#e8c979] uppercase">ведёт</span>}
          {q.done && <span className="text-[10px] font-bold tracking-widest text-[#63d8c8] uppercase">сделано</span>}
        </div>
        <div className="mt-0.5 text-[11.5px] text-[#8fa0ae]">{q.desc}</div>
      </button>
    );
  };
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#04060acc] anim-fade-in p-3" onClick={onClose}>
      <div className="nord-panel nord-frame w-full max-w-[560px] max-h-[92%] overflow-y-auto px-5 py-5 anim-fade-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-baseline justify-between">
          <div className="font-display text-xl tracking-[0.25em] text-[#dfe8f0] uppercase text-shadow-carve">Журнал саги</div>
          <button className="text-[#6e7f8d] hover:text-[#dfe8f0] text-xl leading-none cursor-pointer" onClick={onClose}>✕</button>
        </div>
        <div className="mt-3 font-display text-[12px] tracking-[0.25em] text-[#c9a24b] uppercase">Путь саги</div>
        <div className="mt-1.5 space-y-1.5">
          {main.length ? main.map((q) => <Row key={q.id} q={q} />) : <div className="text-[12px] text-[#6e7f8d]">Сага ещё не началась…</div>}
        </div>
        <div className="mt-4 font-display text-[12px] tracking-[0.25em] text-[#8fd8e8] uppercase">Побочные тропы</div>
        <div className="mt-1.5 space-y-1.5">
          {side.length ? side.map((q) => <Row key={q.id} q={q} />) : (
            <div className="text-[12px] text-[#6e7f8d]">Пока тихо. Жители Нидов хранят свои просьбы — заговори с ними.</div>
          )}
        </div>
        <div className="mt-4 text-[10.5px] text-[#4a5a68] tracking-widest">КВЕСТЫ ВПИСЫВАЮТСЯ САМИ · КЛИК — СЛЕДИТЬ · <span className="kbd">Q</span>/<span className="kbd">ESC</span> ЗАКРЫТЬ</div>
      </div>
    </div>
  );
}

function InventoryScreen({ hud, onClose }: { hud: HudData; onClose: () => void }) {
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

function WorldMapScreen({ zone, draw, onClose }: { zone: string; draw: (c: HTMLCanvasElement) => void; onClose: () => void }) {
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

function HealthBar({ hp, maxHp }: { hp: number; maxHp: number }) {
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

export default function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const [screen, setScreen] = useState<Screen>("title");
  const [hud, setHud] = useState<HudData | null>(null);
  const [dialogue, setDialogue] = useState<DialogueData | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [coarse] = useState(() => window.matchMedia("(pointer: coarse)").matches);
  const mmRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<HTMLDivElement>(null);

  // Debug mode: проверяем ?debug в URL
  const debugMode = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("debug") !== null;

  const pushToast = useCallback((msg: string) => {
    const id = ++toastId;
    setToasts((t) => [...t.slice(-2), { id, msg }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  useEffect(() => {
    if (!hostRef.current) return;
    const eng = new Engine(hostRef.current, {
      onHud: setHud, onScreen: setScreen, onDialogue: setDialogue, onToast: pushToast, onStats: setStats,
    }, debugMode);
    engineRef.current = eng;
    return () => { eng.destroy(); engineRef.current = null; };
  }, [pushToast, debugMode]);

  const eng = () => engineRef.current;

  useEffect(() => {
    if (screen === "play" && mmRef.current) eng()?.attachMinimap(mmRef.current);
  }, [screen, hud]);

  const drawBigMap = useCallback((c: HTMLCanvasElement) => { engineRef.current?.drawBigMap(c); }, []);

  /* запуск саги с видимой обратной связью */
  const [summoning, setSummoning] = useState(false);
  const [bootErr, setBootErr] = useState<string | null>(null);
  const startSaga = () => {
    setBootErr(null);
    setSummoning(true);
    const fail = (m: string) => { setBootErr(m); setSummoning(false); };
    const e = engineRef.current;
    if (!e) { fail("Движок ещё не создан — подождите секунду и нажмите снова."); return; }
    const watchdog = window.setTimeout(() => {
      fail("Ниды не откликнулись за 8 секунд. Попробуйте ещё раз; если сбой повторяется — откройте консоль (F12) и пришлите текст ошибки.");
    }, 8000);
    e.startGame()
      .then(() => { window.clearTimeout(watchdog); setSummoning(false); })
      .catch((err) => {
        window.clearTimeout(watchdog);
        console.error("Сбой запуска саги:", err);
        fail("Не удалось начать сагу: " + (err?.message ?? String(err)));
      });
  };

  // Автозапуск в debug-режиме — пропускаем меню
  useEffect(() => {
    if (debugMode && engineRef.current && screen === "title") {
      console.log("[App] DEBUG MODE: auto-starting game...");
      startSaga();
    }
  }, [debugMode, screen]);

  /* диалог: печатная машинка */
  const [lineIdx, setLineIdx] = useState(0);
  const [chars, setChars] = useState(0);
  useEffect(() => { setLineIdx(0); setChars(0); }, [dialogue]);
  const line = dialogue ? dialogue.lines[Math.min(lineIdx, dialogue.lines.length - 1)] : "";
  useEffect(() => {
    if (!dialogue) return;
    if (chars >= line.length) return;
    const t = window.setTimeout(() => setChars((c) => c + 1), 22);
    return () => window.clearTimeout(t);
  }, [dialogue, chars, line]);
  const advanceDialogue = useCallback(() => {
    if (!dialogue) return;
    if (chars < line.length) { setChars(line.length); return; }
    if (lineIdx < dialogue.lines.length - 1) { setLineIdx((i) => i + 1); setChars(0); return; }
    eng()?.advanceDialogue();
  }, [dialogue, chars, line, lineIdx]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "KeyE" && dialogue) {
        e.preventDefault();
        advanceDialogue();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialogue, advanceDialogue]);

  /* тач-управление: классический джойстик — большой круг + ручка */
  const knobRef = useRef<HTMLDivElement>(null);
  const STICK_MAX = 44; // максимальное смещение ручки, px
  const updateStick = (clientX: number, clientY: number) => {
    const base = padRef.current, knob = knobRef.current;
    if (!base || !knob) return;
    const r = base.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let dx = clientX - cx, dy = clientY - cy;
    const m = Math.hypot(dx, dy);
    if (m > STICK_MAX) { dx = (dx / m) * STICK_MAX; dy = (dy / m) * STICK_MAX; }
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    const nx = dx / STICK_MAX, ny = dy / STICK_MAX;
    const len = Math.hypot(nx, ny);
    const dead = 0.14; // мёртвая зона в центре
    eng()?.setVirtual({ x: len < dead ? 0 : nx, y: len < dead ? 0 : ny });
  };
  const resetStick = () => {
    if (knobRef.current) knobRef.current.style.transform = "translate(-50%, -50%)";
    eng()?.setVirtual({ x: 0, y: 0 });
  };
  const onPadDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    updateStick(e.clientX, e.clientY);
  };
  const onPadMove = (e: React.PointerEvent) => {
    if ((e.currentTarget as HTMLElement).hasPointerCapture?.(e.pointerId)) updateStick(e.clientX, e.clientY);
  };
  const bindBtn = (key: "atk" | "axe" | "bow" | "act") => ({
    onPointerDown: () => eng()?.setVirtual({ [key]: true } as any),
    onPointerUp: () => eng()?.setVirtual({ [key]: false } as any),
    onPointerCancel: () => eng()?.setVirtual({ [key]: false } as any),
  });

  const inGame = screen === "play" || screen === "pause" || screen === "death" ||
    screen === "quests" || screen === "inventory" || screen === "map";

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#05080d] select-none">
      {/* сцена */}
      <div ref={hostRef} className="absolute inset-0 overflow-hidden" />

      {/* ======================= HUD ======================= */}
      {inGame && hud && (
        <>
          <div className="absolute top-2 left-2 sm:top-3 sm:left-3 flex flex-col gap-1.5 z-20 pointer-events-none">
            <div className="nord-panel px-2.5 py-2 flex flex-col gap-1.5">
              <HealthBar hp={hud.hp} maxHp={hud.maxHp} />
              <div className="flex items-center gap-2.5 pl-[22px]">
                <span className="flex items-center gap-1 text-[12px] font-bold text-[#e8dcc0]"><ArrowIco />{hud.arrows}</span>
                <span className="flex items-center gap-1 text-[12px] font-bold text-[#e8dcc0]"><HeartIco />{hud.hearts}</span>
                <span className="flex items-center gap-1 text-[12px] font-bold text-[#a8ece2]"><RuneIco />{hud.runes}/5</span>
              </div>
              <div className="flex items-center gap-1.5 pl-[22px]">
                <SwordIco dim={!hud.hasSword} /><AxeIco dim={!hud.hasAxe} /><BowIco dim={!hud.hasBow} /><HammerIco dim={!hud.hasHammer} />
                {hud.hasKey && <span className="text-[#c9a24b] text-[13px]">⚿</span>}
              </div>
            </div>
            <button
              className="nord-panel w-9 h-9 flex items-center justify-center pointer-events-auto cursor-pointer"
              onClick={() => eng()?.openInventory()} title="Инвентарь (Tab)"
            >
              <svg width="15" height="15" viewBox="0 0 12 12" style={px}><rect x="4" y="1" width="4" height="1" fill="#8a744a" /><rect x="2" y="4" width="8" height="6" fill="#5a4632" /><rect x="2" y="4" width="8" height="2" fill="#7a6248" /><rect x="5" y="6" width="2" height="2" fill="#c9a24b" /></svg>
            </button>
          </div>

          <div className="absolute top-2 right-2 sm:top-3 sm:right-3 flex flex-col items-end gap-1 z-20 pointer-events-none">
            <button className="nord-panel p-1.5 pointer-events-auto cursor-pointer group relative" onClick={() => eng()?.openMap()} title="Большая карта">
              <canvas ref={mmRef} width={192} height={128} className="block" style={{ width: "min(24vw,128px)", ...px, border: "1px solid #23354433" }} />
              <span className="absolute inset-0 hidden group-hover:flex items-center justify-center bg-[#04060a99] font-display text-[10px] tracking-[0.25em] text-[#8fd8e8] uppercase">Карта</span>
            </button>
            <div className="nord-panel px-2 py-1 text-right">
              <div className="font-display text-[11px] sm:text-[12px] tracking-[0.18em] text-[#8fd8e8] uppercase">{hud.zone}</div>
              <div className="text-[10px] text-[#6e7f8d] tracking-widest flex justify-end gap-2">
                <span>{hud.time}</span><span>⚔ {hud.kills}</span><span className="text-[#a06060]">† {hud.deaths}</span>
              </div>
            </div>
            <button className="nord-panel w-9 h-9 flex items-center justify-center pointer-events-auto cursor-pointer" onClick={() => eng()?.openQuests()} title="Журнал квестов (Q)">
              <svg width="15" height="15" viewBox="0 0 12 12" style={px}><rect x="5" y="1" width="2" height="2" fill="#e8c979" /><rect x="4" y="3" width="4" height="1" fill="#e8c979" /><rect x="5" y="4" width="2" height="4" fill="#c9a24b" /><rect x="5" y="8" width="2" height="1" fill="#8a744a" /></svg>
            </button>
          </div>

          {/* цель */}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 w-full flex justify-center px-2 pointer-events-none">
            <button onClick={() => eng()?.openQuests()} title="Журнал квестов (Q)"
              className="nord-panel px-3.5 py-1.5 flex items-center gap-2 max-w-full pointer-events-auto cursor-pointer">
              <span className="font-display text-[11px] tracking-[0.2em] text-[#e8c979] uppercase whitespace-nowrap">᛫ цель</span>
              <span className="text-[12px] text-[#d8e2ea] truncate">{hud.objective}</span>
            </button>
          </div>

          {/* диалог */}
          {dialogue && (
            <div className="absolute bottom-6 sm:bottom-8 left-1/2 -translate-x-1/2 z-30 w-[min(94vw,620px)]" onClick={advanceDialogue}>
              <div className="nord-panel nord-frame px-4 py-3 cursor-pointer">
                <div className="font-display text-[13px] tracking-[0.25em] text-[#8fd8e8] uppercase">{dialogue.name}</div>
                <p className="dialogue-text mt-1 text-[14px] sm:text-[15px] text-[#d8e2ea] min-h-[3.2em]">
                  {line.slice(0, chars)}
                  <span className="text-[#c9a24b]">{chars < line.length ? "▌" : ""}</span>
                </p>
                <div className="flex justify-between items-center mt-1">
                  <span className="text-[10px] text-[#6e7f8d]">{lineIdx + 1} / {dialogue.lines.length}</span>
                  <span className="text-[11px] text-[#c9a24b] tracking-widest font-display uppercase flex items-center gap-1.5"><span className="kbd">E</span> далее</span>
                </div>
              </div>
            </div>
          )}

          {/* тач */}
          {coarse && screen === "play" && (
            <>
              <div ref={padRef}
                className="absolute bottom-16 left-5 w-36 h-36 rounded-full border-2 border-[#33475a] bg-[#0a101866] touch-none z-20"
                onPointerDown={onPadDown} onPointerMove={onPadMove}
                onPointerUp={resetStick} onPointerCancel={resetStick}>
                <div ref={knobRef}
                  className="absolute left-1/2 top-1/2 w-16 h-16 rounded-full border-2 border-[#8fd8e8] bg-[#1a2833cc] shadow-[0_0_14px_rgba(143,216,232,0.35)] pointer-events-none"
                  style={{ transform: "translate(-50%, -50%)" }} />
              </div>
              <div className="absolute bottom-16 right-5 grid grid-cols-2 gap-2.5 z-20">
                <button className="touch-btn w-14 h-14" {...bindBtn("atk")}><SwordIco /></button>
                <button className="touch-btn w-14 h-14" {...bindBtn("act")}><span className="font-display text-lg">E</span></button>
                <button className="touch-btn w-14 h-14" {...bindBtn("axe")}><AxeIco /></button>
                <button className="touch-btn w-14 h-14" {...bindBtn("bow")}><BowIco /></button>
              </div>
            </>
          )}
        </>
      )}

      {/* оверлеи */}
      {screen === "quests" && hud && (
        <QuestScreen quests={hud.quests} trackedId={hud.trackedId} onTrack={(id) => eng()?.trackQuest(id)} onClose={() => eng()?.closeOverlay()} />
      )}
      {screen === "inventory" && hud && <InventoryScreen hud={hud} onClose={() => eng()?.closeOverlay()} />}
      {screen === "map" && hud && <WorldMapScreen zone={hud.zone} draw={drawBigMap} onClose={() => eng()?.closeOverlay()} />}

      {/* ======================= титул ======================= */}
      {screen === "title" && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#05080d] overflow-y-auto">
          <div className="mist-band" />
          <div className="absolute inset-0" style={{ background: "radial-gradient(80% 60% at 50% 38%, rgba(30,58,74,0.35), transparent 70%)" }} />
          <div className="relative flex flex-col items-center text-center px-6 py-8">
            <div className="relative mb-2">
              <KnotFrame className="w-32 h-32 sm:w-40 sm:h-40 text-[#8fd8e8] title-rune-ring" />
              <div className="absolute inset-0 flex items-center justify-center"><span className="font-display text-4xl text-[#e8c979] text-shadow-gold">ᛒ</span></div>
            </div>
            <h1 className="font-display text-[clamp(38px,8vw,84px)] leading-none tracking-[0.14em] text-[#dfe8f0] text-shadow-carve">ВАРДЛОКУР</h1>
            {debugMode && (
              <div className="mt-1 font-display text-[11px] tracking-[0.3em] text-[#e06060] uppercase animate-pulse">⚠ DEBUG MODE ⚠</div>
            )}
            <div className="mt-2 font-display text-[clamp(13px,2.4vw,20px)] tracking-[0.4em] text-[#8fd8e8] uppercase anim-pulse-ice">Эхо Ветвей Иггдрасиля</div>
            <div className="mt-8 flex flex-col sm:flex-row items-center gap-3.5">
              <button className="btn-rune text-[17px]" onClick={startSaga} disabled={summoning}>
                {summoning ? "… Ниды пробуждаются …" : "⟡ Начать сагу ⟡"}
              </button>
              <button className="btn-rune btn-ice text-[15px]" onClick={() => setShowHelp(true)}>Помощь</button>
            </div>
            {bootErr && (
              <div className="mt-5 nord-panel border-[#a0323288] px-5 py-4 max-w-[520px] anim-fade-up">
                <div className="font-display text-[14px] tracking-[0.2em] text-[#e06060] uppercase">Петля дала сбой</div>
                <p className="mt-1.5 text-[13px] text-[#d8b8b8] leading-snug">{bootErr}</p>
                <div className="mt-3 flex gap-2 justify-center">
                  <button className="btn-rune text-[12px]" onClick={startSaga}>Ещё раз</button>
                  <button className="btn-rune btn-ice text-[12px]" onClick={() => setBootErr(null)}>Закрыть</button>
                </div>
              </div>
            )}
            <div className="mt-4 text-[11px] text-[#4a5a68] tracking-widest">ДУХОВНЫЙ НАСЛЕДНИК LINK'S AWAKENING · МИР ГЕНЕРИРУЕТСЯ ЗАНОВО В КАЖДОЙ САГЕ</div>
          </div>
        </div>
      )}

      {showHelp && <HelpOverlay onClose={() => setShowHelp(false)} />}

      {/* ======================= пауза ======================= */}
      {screen === "pause" && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#04060acc] anim-fade-in z-40 p-4">
          <div className="nord-panel nord-frame px-8 sm:px-10 py-8 text-center">
            <div className="font-display text-2xl sm:text-3xl tracking-[0.25em] text-[#dfe8f0] uppercase text-shadow-carve">Сага прервана</div>
            <div className="mt-1 text-[13px] text-[#6e7f8d] tracking-widest">петля замерла...</div>
            <div className="mt-6 flex flex-col gap-2.5 items-center">
              <button className="btn-rune btn-ice w-56" onClick={() => eng()?.togglePause()}>Продолжить</button>
              <button className="btn-rune w-56" onClick={() => setShowHelp(true)}>Помощь</button>
              <button className="btn-rune w-56" onClick={() => eng()?.toggleMute()}>Звук: {hud?.muted ? "выкл" : "вкл"}</button>
              <button className="btn-rune btn-blood w-56" onClick={() => eng()?.backToTitle()}>К титулу</button>
            </div>
            <div className="mt-5 text-[11px] text-[#4a5a68]"><span className="kbd">Esc</span> — вернуться в бой</div>
          </div>
        </div>
      )}

      {/* ======================= смерть ======================= */}
      {screen === "death" && (
        <div className="absolute inset-0 flex items-center justify-center z-40 anim-fade-in" style={{ background: "rgba(30,4,4,0.55)" }}>
          <div className="absolute inset-0 anim-blood pointer-events-none" />
          <div className="text-center anim-fade-up px-4">
            <div className="font-display text-[clamp(32px,6vw,58px)] tracking-[0.2em] text-[#e06060] uppercase" style={{ textShadow: "0 0 34px rgba(160,50,50,0.7)" }}>Петля сжалась</div>
            <div className="mt-2 text-[14px] text-[#d8b8b8] tracking-widest">Бьорн пал — но Ниды вернут его</div>
            {stats && (
              <div className="mt-4 text-[12px] text-[#a08888] tracking-wider">
                в саге: {stats.time} · врагов пало {stats.kills} · смертей {stats.deaths} · рун {stats.runes}/5
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================= победа ======================= */}
      {screen === "victory" && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#05080d] z-50 overflow-y-auto">
          <div className="mist-band" />
          <div className="absolute inset-0" style={{ background: "radial-gradient(70% 55% at 50% 40%, rgba(99,216,200,0.12), transparent 70%)" }} />
          <div className="relative text-center px-6 py-8 max-w-[640px] anim-fade-up">
            <KnotFrame className="w-28 h-28 mx-auto text-[#c9a24b] title-rune-ring" />
            <div className="font-display text-[clamp(28px,5vw,46px)] tracking-[0.18em] text-[#dfe8f0] uppercase text-shadow-carve mt-2">Песнь Разрыва спета</div>
            <p className="mt-4 text-[15px] leading-relaxed text-[#8fa0ae]">
              Мираж Ёрмунганда растаял, как иней на клинке. Петля лопнула — и Ниды
              растворились в рассвете. Души, что были тебе друзьями, обрели покой.
              Бьорн, последний из Варлоков, ушёл в Вальхаллу.
            </p>
            {stats && (
              <div className="mt-5 nord-panel inline-block px-6 py-4 text-left grid grid-cols-2 gap-x-8 gap-y-1.5 text-[13px]">
                <span className="text-[#6e7f8d]">Время саги</span><span className="text-[#d8e2ea] font-bold text-right">{stats.time}</span>
                <span className="text-[#6e7f8d]">Врагов пало</span><span className="text-[#d8e2ea] font-bold text-right">{stats.kills}</span>
                <span className="text-[#6e7f8d]">Смертей Бьорна</span><span className="text-[#d8e2ea] font-bold text-right">{stats.deaths}</span>
                <span className="text-[#6e7f8d]">Забытых Рун</span><span className="text-[#63d8c8] font-bold text-right">{stats.runes}/5</span>
              </div>
            )}
            <div className="mt-7 flex flex-col sm:flex-row justify-center gap-3">
              <button className="btn-rune" onClick={startSaga}>Новая сага</button>
              <button className="btn-rune btn-blood" onClick={() => eng()?.backToTitle()}>К титулу</button>
            </div>
          </div>
        </div>
      )}

      {/* тосты — глобальный слой поверх всех экранов */}
      <div className="absolute top-[14%] left-1/2 -translate-x-1/2 z-[70] flex flex-col items-center gap-1.5 pointer-events-none px-3 w-full">
        {toasts.map((t) => (
          <div key={t.id} className="anim-toast nord-panel px-4 py-1.5 font-display text-[13px] tracking-[0.1em] text-[#e8dcc0] uppercase text-center">{t.msg}</div>
        ))}
      </div>
    </div>
  );
}
