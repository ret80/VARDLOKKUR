import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { Engine } from "../game/engine";
import type { Screen, HudData, DialogueData, Stats } from "../game/models";

export interface Toast {
  id: number;
  msg: string;
}

/** Жизненный цикл движка + базовое состояние UI (экран, HUD, диалог, тосты) */
export function useEngine(hostRef: RefObject<HTMLElement>) {
  const engineRef = useRef<Engine | null>(null);
  const toastId = useRef(0);

  const [screen, setScreen] = useState<Screen>("title");
  const [hud, setHud] = useState<HudData | null>(null);
  const [dialogue, setDialogue] = useState<DialogueData | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Debug mode: ?debug в URL
  const debugMode = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("debug") !== null;
  // Test map mode: ?test_map в URL
  const testMapMode = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("test_map") !== null;

  const pushToast = useCallback((msg: string) => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-2), { id, msg }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  useEffect(() => {
    if (!hostRef.current) return;
    const eng = new Engine(hostRef.current, {
      onHud: setHud,
      onScreen: setScreen,
      onDialogue: setDialogue,
      onToast: pushToast,
      onStats: setStats,
    }, debugMode, testMapMode);
    engineRef.current = eng;
    return () => {
      eng.destroy();
      engineRef.current = null;
    };
  }, [hostRef, pushToast, debugMode, testMapMode]);

  const eng = useCallback(() => engineRef.current, []);

  return { engineRef, eng, screen, hud, dialogue, stats, toasts, debugMode, testMapMode };
}