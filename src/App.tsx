import { useCallback, useEffect, useRef, useState } from "react";
import { useEngine } from "./hooks/useEngine";
import { KnotFrame } from "./components/icons";
import {
  SwordIco, AxeIco, BowIco, HammerIco, HeartIco, ArrowIco, RuneIco, BagIco, BookIco,
} from "./components/icons";
import { QuestsScreen } from "./components/screens/QuestsScreen";
import { InventoryScreen } from "./components/screens/InventoryScreen";
import { WorldMapScreen } from "./components/screens/WorldMapScreen";
import { SettingsScreen } from "./components/screens/SettingsScreen";
import { HealthBar } from "./components/hud/HealthBar";
import { DebugPanel } from "./components/DebugPanel";

const px = { imageRendering: "pixelated" as const };

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

export default function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const { engineRef, eng, screen, hud, dialogue, stats, toasts, debugMode, testMapMode } = useEngine(hostRef);
  const [showHelp, setShowHelp] = useState(false);
  const [summoning, setSummoning] = useState(false);
  const [bootErr, setBootErr] = useState<string | null>(null);
  const [coarse] = useState(() => window.matchMedia("(pointer: coarse)").matches);
  const mmRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (screen === "play" && mmRef.current) eng()?.attachMinimap(mmRef.current);
  }, [screen, hud, eng]);

  const drawBigMap = useCallback((c: HTMLCanvasElement) => { engineRef.current?.drawBigMap(c); }, [engineRef]);

  /* запуск саги с видимой обратной связью */
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debugMode, screen]);

  // Автозапуск в test_map режиме — тоже пропускаем меню
  useEffect(() => {
    if (testMapMode && engineRef.current && screen === "title") {
      console.log("[App] TEST MAP MODE: auto-starting game...");
      startSaga();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testMapMode, screen]);

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
  }, [dialogue, chars, line, lineIdx, eng]);

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

  /* тач-управление: классический джойстик */
  const knobRef = useRef<HTMLDivElement>(null);
  const STICK_MAX = 44;
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
    const dead = 0.14;
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
    screen === "quests" || screen === "inventory" || screen === "map" || screen === "settings";

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
            <div className="nord-panel px-2 py-1 text-right">
              <div className="font-display text-[11px] sm:text-[12px] tracking-[0.18em] text-[#8fd8e8] uppercase">{hud.zone}</div>
              <div className="text-[10px] text-[#6e7f8d] tracking-widest flex justify-end gap-2">
                <span>{hud.time}</span><span>⚔ {hud.kills}</span><span className="text-[#a06060]">† {hud.deaths}</span>
              </div>
            </div>
          </div>

          <div className="absolute top-2 right-2 sm:top-3 sm:right-3 flex flex-col items-end gap-1 z-20 pointer-events-none">
            <button className="nord-panel p-1.5 pointer-events-auto cursor-pointer group relative" onClick={() => eng()?.openMap()} title="Большая карта">
              <canvas ref={mmRef} width={192} height={128} className="block" style={{ width: "min(24vw,128px)", ...px, border: "1px solid #23354433" }} />
              <span className="absolute inset-0 hidden group-hover:flex items-center justify-center bg-[#04060a99] font-display text-[10px] tracking-[0.25em] text-[#8fd8e8] uppercase">Карта</span>
            </button>
            <div className="flex gap-1">
              <button
                className="nord-panel w-9 h-9 flex items-center justify-center pointer-events-auto cursor-pointer"
                onClick={() => eng()?.openInventory()} title="Инвентарь (Tab)"
              >
                <BagIco />
              </button>
              <button className="nord-panel w-9 h-9 flex items-center justify-center pointer-events-auto cursor-pointer" onClick={() => eng()?.openQuests()} title="Журнал квестов (Q)">
                <BookIco />
              </button>
            </div>
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
        <QuestsScreen quests={hud.quests} trackedId={hud.trackedId} onTrack={(id) => eng()?.trackQuest(id)} onClose={() => eng()?.closeOverlay()} />
      )}
      {screen === "inventory" && hud && <InventoryScreen hud={hud} onClose={() => eng()?.closeOverlay()} />}
      {screen === "map" && hud && <WorldMapScreen zone={hud.zone} draw={drawBigMap} onClose={() => eng()?.closeOverlay()} />}
      {screen === "settings" && (
        <SettingsScreen
          onClose={() => eng()?.handleSettings()}
          eng={eng}
        />
      )}

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
            {testMapMode && !debugMode && (
              <div className="mt-1 font-display text-[11px] tracking-[0.3em] text-[#8fd8e8] uppercase animate-pulse">🗺 TEST MAP</div>
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
              <button className="btn-rune w-56" onClick={() => eng()?.openSettings()}>Настройки</button>
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

      {/* Debug Panel — только в debug-режиме */}
      {debugMode && <DebugPanel />}
    </div>
  );
}
