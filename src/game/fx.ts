/* fx.ts — Атмосферные визуальные эффекты: туман, виньетка.
   Отделён от engine.ts для разделения ответственности.
   
   Этап 6: удалён import { Application, Container, Graphics, RenderTexture, Sprite, Texture } из pixi.js.
   Вигнетку и туман можно перенести на Regl в будущем.
*/

import { NoiseGenerator } from "./noise";
import { clamp } from "./utils";
import type { ParticleSystem } from './engine/particle-system';

/* ======================== Интерфейсы ======================== */

export interface FxState {
  viewW: number; viewH: number;
  playerX: number; playerY: number;
  camX: number; camY: number;
  realT: number; dt: number; rdt: number;
  fogRadius: number; fogActive: boolean;
  isDungeon: boolean;
}

export interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; max: number; size: number;
  color: number; grav: number; alpha: number;
}

export interface Snowflake {
  x: number; y: number; s: number; d: number; w: number;
}

/* ======================== FxManager ======================== */

export class FxManager {
  private app!: unknown;
  private viewW = 0;
  private viewH = 0;

  /** Ссылка на ParticleSystem для делегирования burst/initSnow (Этап 5-6) */
  private _particleSys: ParticleSystem | null = null;

  // --- Слои ---
  // --- Слои (публичные для отрисовки из engine) ---
  // worldParticleG удалён на Этапе 5 — частицы рендерятся через PrimitiveBatcher
  private screenFxG: unknown = null; // Для снега (поверх UI) — Этап 6
  public vignette: unknown = null;
  public fogVignette: unknown = null;

  // --- Данные (deprecated: перенесено в ParticleSystem) ---
  private particles: Particle[] = [];
  public snow: Snowflake[] = [];

  // --- Fog Canvases (внутренние, не экспортируются) ---
  private fogCanvas: HTMLCanvasElement | null = null;
  private fogCtx: CanvasRenderingContext2D | null = null;
  private fogTex: unknown = null;
  private fogRT: unknown = null;
  private fogCopySpr: unknown = null;
  private fogMaskCanvas: HTMLCanvasElement | null = null;
  private fogMaskCtx: CanvasRenderingContext2D | null = null;
  private noiseCanvas: HTMLCanvasElement | null = null;
  private fogNoiseT = 0;
  private fogNoiseGen = new NoiseGenerator(0x51ab); // фикс. сид — текстура дыма
  private fogAlpha = 0; // текущая прозрачность тумана (0 = невидим, 1 = полностью виден)

  /* ---------- Инициализация ---------- */

  public init(_app: unknown, w: number, h: number) {
    this.app = _app;
    this.viewW = w;
    this.viewH = h;
    this.fogAlpha = 0;
  }

  /** Установить ParticleSystem для делегирования burst/initSnow (Этап 6) */
  public setParticleSystem(sys: ParticleSystem): void {
    this._particleSys = sys;
  }

  /** Вызывается один раз после создания сцены в engine. (Этап 6: заглушка) */
  public attachToStage(_stage: unknown, _screenFx: unknown) {
    // Этап 6: больше не используется
  }

  public resize(w: number, h: number) {
    if (w === this.viewW && h === this.viewH) return;
    this.viewW = w;
    this.viewH = h;
    this.buildVignette();
    this.buildFogVignette();
  }

  /* ---------- API для Engine ---------- */

  /** Создать взрыв частиц. Вызывается из engine в местах урона/смерти.
   *  Этап 6: делегирует в ParticleSystem. */
  public burst(x: number, y: number, color: number, n: number, speed: number, life: number, size: number, grav: number) {
    if (this._particleSys) {
      this._particleSys.burst(x, y, color, n, speed, life, size, grav);
      return;
    }
    // Fallback (deprecated): старый путь через FxManager
    if (this.particles.length > 420) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      this.particles.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life: life * (0.5 + Math.random() * 0.7), max: life,
        size: size * (0.7 + Math.random() * 0.7),
        color, grav, alpha: 0.95,
      });
    }
  }

  /** Инициализация снега (вызывается один раз в init engine).
   *  Этап 6: делегирует в ParticleSystem. */
  public initSnow() {
    if (this._particleSys) {
      this._particleSys.initSnow();
      return;
    }
    // Fallback (deprecated): старый путь через FxManager
    for (let i = 0; i < 130; i++) {
      this.snow.push({
        x: Math.random() * 640,
        y: Math.random() * 560,
        s: 14 + Math.random() * 26,
        d: Math.random() * 6,
        w: Math.random() < 0.3 ? 2 : 1,
      });
    }
  }

  /** Обновление частиц. Вызывается каждый тик.
   *  Этап 6: делегирует в ParticleSystem. */
  public updateParticles(rdt: number) {
    if (this._particleSys) {
      this._particleSys.updateParticles(rdt);
      return;
    }
    // Fallback (deprecated): старый путь через FxManager
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= rdt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.vy += p.grav * rdt;
      p.x += p.vx * rdt;
      p.y += p.vy * rdt;
    }
  }

  /** Обновление состояния снега. Вызывается в update().
   *  Этап 6: делегирует в ParticleSystem. */
  public updateSnow(realT: number) {
    if (this._particleSys) {
      this._particleSys.updateSnow(realT);
      return;
    }
    // Fallback (deprecated): старый путь через FxManager
    for (const f of this.snow) {
      f.y += f.s * 0.016;
      f.x += Math.sin(realT * 0.8 + f.d) * 8 * 0.016 - 4 * 0.016;
      if (f.y > this.viewH) { f.y = -2; f.x = Math.random() * this.viewW; }
      if (f.x < -2) f.x = this.viewW;
    }
  }

  /* ---------- Внутренняя логика: Виньетка ---------- */

  public buildVignette() {
    // Этап 6: PixiJS Sprite удалён — виньетку можно перенести на Regl в будущем
    this.vignette = null;
  }

  /* ---------- Внутренняя логика: Туман ---------- */

  public buildFogVignette() {
    // Этап 6: PixiJS RenderTexture/Sprite удалены — туман можно перенести на Regl в будущем
    this.fogVignette = null;
    this.fogAlpha = 0;
  }

  public buildNoiseTexture() {
    if (this.noiseCanvas) return;
    const size = 128;
    const c = document.createElement("canvas");
    c.width = size; c.height = size;
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const n = this.fogNoiseGen.fbm(x * 0.05, y * 0.05, 3);
        const i = (y * size + x) * 4;
        img.data[i] = 105; img.data[i + 1] = 118; img.data[i + 2] = 132;
        img.data[i + 3] = Math.floor(Math.max(0, n - 0.25) * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    this.noiseCanvas = c;
  }

  private fogWaveNoise(a: number, t: number): number {
    return (
      Math.sin(a * 3 + t * 0.9) * 0.5 +
      Math.sin(a * 7 - t * 1.3 + 1.7) * 0.3 +
      Math.sin(a * 13 + t * 2.1 + 4.2) * 0.2
    );
  }

  public redrawFog(_rdt: number, _fogRadius: number, _playerX: number, _playerY: number, _camX: number, _camY: number, _viewW: number, _viewH: number, _shrineSpots?: {x: number, y: number}[]) {
    // Этап 6: PixiJS fogVignette удалён — туман можно перенести на Regl в будущем
    // Canvas 2D логика оставлена для будущего использования
  }

  public drawFogEyes(_fx: unknown, _warn: boolean, _realT: number, _viewW: number, _viewH: number) {
    // Этап 6: PixiJS Graphics удалён
  }

  /** Отрисовка снежного слоя.
   *  Этап 5: делегирование удалено — снег рендерится через PrimitiveBatcher в ParticleLayer.
   *  Этот метод оставлен как заглушка (deprecated). */
  public drawSnow(_fx: unknown, _realT: number): void {
    // Deprecated: снег теперь рендерится через ParticleLayer.draw() → batchers.primitive
  }

  /** Отрисовка «рун» по углам экрана при сильном тумане. (Этап 6: заглушка) */
  public drawFogRunes(_fx: unknown, _fogRadius: number, _viewW: number, _viewH: number) {
    // Этап 6: PixiJS Graphics удалён
  }

  /** Метод для пересчёта тумана. Вызывается из engine.tick(). */
  public updateFog(rdt: number, fogRadius: number, fogActive: boolean, isDungeon: boolean,
                   playerX: number, playerY: number, camX: number, camY: number,
                   viewW: number, viewH: number, holes?: { x: number; y: number }[]) {
    this.redrawFog(rdt, fogRadius, playerX, playerY, camX, camY, viewW, viewH, holes);
  }

  /* ---------- Геттеры для слоёв ---------- */
  // worldParticleGraphics удалён на Этапе 5 — частицы рендерятся через PrimitiveBatcher

  /* ---------- Жизненный цикл ---------- */

  public destroy() {
    // Этап 6: PixiJS объекты удалены
    this.vignette = null;
    this.fogVignette = null;
    if (this.fogCanvas) { this.fogCanvas.remove(); this.fogCanvas = null; }
    if (this.fogMaskCanvas) { this.fogMaskCanvas.remove(); this.fogMaskCanvas = null; }
    if (this.noiseCanvas) { this.noiseCanvas.remove(); this.noiseCanvas = null; }
  }
}

/* ======================== Утилиты ======================== */


