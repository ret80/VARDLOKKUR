/* fx.ts — Атмосферные визуальные эффекты: виньетка, частицы, снег.
   Отделён от engine.ts для разделения ответственности.
   
   Этап 6: частицы и снег извлечены в ParticleSystem.
   Фаза 5: удалён import pixi.js, все типы заменены на Handle.
   Туман перенесён в FogRenderer (шейдерный).
*/

import { clamp } from "./utils";
import type { ParticleSystem } from './engine/particle-system';
import type { IRenderer, SpriteHandle, TextureHandle } from './renderer';
// getRenderer удалён в Фаза 6 — используется this._renderer

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
  private _renderer!: IRenderer;
  private viewW = 0;
  private viewH = 0;

  /** Ссылка на ParticleSystem для делегирования burst/initSnow (Этап 6) */
  private _particleSys: ParticleSystem | null = null;

  // --- Слои ---
  // --- Слои (публичные для отрисовки из engine) ---
  // worldParticleG удалён в Этап 6 — перемещён в ParticleSystem
  private screenFxG: any = null; // Для снега (поверх UI) — GraphicsHandle
  public vignette: SpriteHandle | null = null;

  // --- Данные (deprecated: перенесено в ParticleSystem) ---
  private particles: Particle[] = [];
  public snow: Snowflake[] = [];

  /* ---------- Инициализация ---------- */

  public init(renderer: IRenderer, w: number, h: number) {
    this._renderer = renderer;
    this.viewW = w;
    this.viewH = h;
  }

  /** Установить ParticleSystem для делегирования burst/initSnow (Этап 6) */
  public setParticleSystem(sys: ParticleSystem): void {
    this._particleSys = sys;
  }

  /** Вызывается один раз после создания сцены в engine. */
  public attachToStage(_stage: any, screenFx: any) {
    this.screenFxG = screenFx;
    // particleG уже добавлен в fxWorld в engine, но мы его здесь не трогаем —
    // engine сам добавляет worldParticleG через addChild.
  }

  public resize(w: number, h: number) {
    if (w === this.viewW && h === this.viewH) return;
    this.viewW = w;
    this.viewH = h;
    this.buildVignette();
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
    const vw = Math.ceil(this.viewW * 1.1);
    const vh = Math.ceil(this.viewH * 1.1);
    const vc = document.createElement("canvas");
    vc.width = vw; vc.height = vh;
    const vx = vc.getContext("2d")!;
    const grad = vx.createRadialGradient(vw / 2, vh / 2, vh * 0.36, vw / 2, vh / 2, vh * 0.85);
    grad.addColorStop(0, "rgba(5,8,13,0)");
    grad.addColorStop(1, "rgba(4,6,10,0.66)");
    vx.fillStyle = grad; vx.fillRect(0, 0, vw, vh);
    
    const texHandle = this._renderer.createTextureFromCanvas(vc);
    if (this.vignette !== null) {
      // Обновляем существующий спрайт (пересоздаём с новой текстурой)
      this._renderer.destroySprite(this.vignette);
      this.vignette = this._renderer.createScreenSprite({
        texture: texHandle,
        x: -this.viewW * 0.05,
        y: -this.viewH * 0.05,
      });
    } else {
      this.vignette = this._renderer.createScreenSprite({
        texture: texHandle,
        x: -this.viewW * 0.05,
        y: -this.viewH * 0.05,
      });
    }
  }

  /* ---------- Отрисовка ---------- */

  /** Отрисовка мировых частиц и SlamZone. Вызывается в tick() перед рендером сущностей.
   *  Этап 6: делегирует в ParticleSystem. */
  public drawWorldFx(_rdt: number, _realT: number) {
    if (this._particleSys) {
      this._particleSys.drawWorldFx();
      return;
    }
    // Fallback (deprecated): старый путь через FxManager
    const r = this._renderer;
    r.clearGraphics(this.screenFxG as any);
    for (const p of this.particles) {
      const half = p.size / 2;
      r.drawRect(this.screenFxG as any, { x: p.x - half, y: p.y - half, width: p.size, height: p.size }, {
        r: ((p.color >> 16) & 0xff) / 255,
        g: ((p.color >> 8) & 0xff) / 255,
        b: (p.color & 0xff) / 255,
        a: p.alpha * (p.life / p.max),
      });
    }
  }

  /** Отрисовка снежного слоя на screenFx. Вызывается в tick().
     *  Этап 9: ParticleSystem.drawSnow использует IRenderer API,
     *  поэтому FxManager рисует снег самостоятельно (legacy-путь). */
  public drawSnow(g: any, _realT: number) {
    // ParticleSystem теперь использует IRenderer API (GraphicsHandle),
    // поэтому снег рисуется здесь через IRenderer.
    const r = this._renderer;
    for (const f of this.snow) {
      r.drawRect(g, { x: f.x, y: f.y, width: f.w, height: f.w }, {
        r: 0xc8 / 255, g: 0xd8 / 255, b: 0xe8 / 255, a: 0.4,
      });
    }
  }

  /* ---------- Геттеры для слоёв ---------- */

  // worldParticleGraphics удалён — перемещён в ParticleSystem

  /* ---------- Жизненный цикл ---------- */

  public destroy() {
    if (this.vignette !== null) {
      this._renderer.destroySprite(this.vignette);
      this.vignette = null;
    }
  }
}

/* ======================== Утилиты ======================== */


