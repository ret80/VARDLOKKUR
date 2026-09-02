/* ============ StateManager ============ */
import type { Screen } from "../engine";

export type ScreenChangedHandler = (screen: Screen) => void;
export type ToastHandler = (msg: string) => void;

export class StateManager {
  // Публичные поля состояния
  screen: Screen = "title";
  deathT = 0;
  fadeA = 0;
  fadeTarget = 0;
  timeScale = 1;
  tsTarget = 1;
  hitstop = 0;
  shake = 0;
  playerDead = false;

  private onScreenChanged?: ScreenChangedHandler;
  private onToast?: ToastHandler;

  constructor() {}

  setHandlers(onScreen: ScreenChangedHandler, onToast: ToastHandler): void {
    this.onScreenChanged = onScreen;
    this.onToast = onToast;
  }

  /* ===== Обновление состояний (вызывается из tick) ===== */

  update(dt: number): void {
    this.timeScale += (this.tsTarget - this.timeScale) * Math.min(1, dt * 8);
    this.fadeA += (this.fadeTarget - this.fadeA) * Math.min(1, dt * 5);
    this.shake *= Math.pow(0.001, dt);
  }

  /* ===== Управление экранами ===== */

  setScreen(s: Screen): void {
    this.screen = s;
    this.onScreenChanged?.(s);
  }

  togglePause(): void {
    if (this.screen === "play") this.setScreen("pause");
    else if (this.screen === "pause") this.setScreen("play");
  }

  backToTitle(): void {
    this.setScreen("title");
  }

  /* ===== Смерть и респавн ===== */

  onPlayerDied(): void {
    if (this.playerDead) return;
    this.playerDead = true;
    this.setScreen("death");
    this.deathT = 1.8;
  }

  tickDeathTimer(dt: number): number {
    this.deathT -= dt;
    return this.deathT;
  }

  isDeathReady(): boolean {
    return this.deathT <= 0;
  }

  /* ===== Эффекты ===== */

  setFadeTarget(a: number): void { this.fadeTarget = a; }
  setTsTarget(ts: number): void { this.tsTarget = ts; }
  setHitstop(t: number): void { this.hitstop = t; }
  setShake(v: number): void { this.shake = v; }

  toast(msg: string): void {
    this.onToast?.(msg);
  }

  /* ===== Сброс ===== */

  reset(): void {
    this.screen = "title";
    this.deathT = 0;
    this.fadeA = 0;
    this.fadeTarget = 0;
    this.timeScale = 1;
    this.tsTarget = 1;
    this.hitstop = 0;
    this.shake = 0;
    this.playerDead = false;
  }
}
