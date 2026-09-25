/* particle-system.ts — Система частиц и снега (Этап 9: интеграция с IRenderer) */

import type { GraphicsHandle, IRenderer } from '../renderer/IRenderer';
import { logger } from '../debug/logger';

/** Частица взрыва (урон, смерть, магия) */
export interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  life: number; max: number;
  size: number; color: number;
  grav: number; alpha: number;
}

/** Снежинка */
export interface Snowflake {
  x: number; y: number;
  s: number; d: number; w: number;
}

/**
 * ParticleSystem — система частиц и снега.
 *
 * Этап 9: полностью интегрирован с IRenderer.
 * - worldParticleG — GraphicsHandle вместо PixiJS Graphics
 * - drawWorldFx() — использует r.drawRect() вместо g.rect().fill()
 * - drawSnow() — использует r.drawRect() вместо g.rect().fill()
 */
export class ParticleSystem {
  private particles: Particle[] = [];
  public snow: Snowflake[] = [];
  private viewW = 640;
  private viewH = 560;

  /** Максимальное количество частиц */
  private maxParticles = 420;

  /** GraphicsHandle для отрисовки мировых частиц (Этап 9: IRenderer API) */
  private _worldParticleG: GraphicsHandle = -1 as GraphicsHandle;
  private _renderer: IRenderer | null = null;
  private _initialized = false;

  /** Инициализация GraphicsHandle для частиц */
  init(renderer: import('../renderer/IRenderer').IRenderer, layer?: import('../renderer/IRenderer').LayerHandle): void {
    if (this._initialized) return;
    this._worldParticleG = renderer.createGraphics(layer);
    this._renderer = renderer;
    this._initialized = true;
    // logger.debug('particle-system', 'ParticleSystem initialized with IRenderer');
  }

  /** Получить GraphicsHandle для частиц */
  get worldParticleG(): GraphicsHandle {
    return this._worldParticleG;
  }

  /** Проверка инициализации */
  get isInitialized(): boolean {
    return this._initialized;
  }

  /* ---------- Инициализация ---------- */

  public resize(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
  }

  /** Создать взрыв частиц. Вызывается из engine в местах урона/смерти. */
  public burst(x: number, y: number, color: number, n: number, speed: number, life: number, size: number, grav: number): void {
    if (this.particles.length > this.maxParticles) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      this.particles.push({
        x, y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: life * (0.5 + Math.random() * 0.7),
        max: life,
        size: size * (0.7 + Math.random() * 0.7),
        color, grav, alpha: 0.95,
      });
    }
  }

  /** Инициализация снега (вызывается один раз). */
  public initSnow(): void {
    for (let i = 0; i < 130; i++) {
      this.snow.push({
        x: Math.random() * this.viewW,
        y: Math.random() * this.viewH,
        s: 14 + Math.random() * 26,
        d: Math.random() * 6,
        w: Math.random() < 0.3 ? 2 : 1,
      });
    }
  }

  /** Обновление частиц. Вызывается каждый тик. */
  public updateParticles(rdt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= rdt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += p.grav * rdt;
      p.x += p.vx * rdt;
      p.y += p.vy * rdt;
    }
  }

  /** Обновление состояния снега. Вызывается в update(). */
  public updateSnow(realT: number): void {
    for (const f of this.snow) {
      f.y += f.s * 0.016;
      f.x += Math.sin(realT * 0.8 + f.d) * 8 * 0.016 - 4 * 0.016;
      if (f.y > this.viewH) { f.y = -2; f.x = Math.random() * this.viewW; }
      if (f.x < -2) f.x = this.viewW;
    }
  }

  /**
   * Отрисовка мировых частиц. Вызывается в render().
   * Этап 9: использует IRenderer API вместо PixiJS Graphics.
   */
  public drawWorldFx(): void {
    const r = this._renderer!;
    r.clearGraphics(this._worldParticleG);
    for (const p of this.particles) {
      const half = p.size / 2;
      // Конвертируем hex-цвет в {r, g, b, a}
      const color = {
        r: ((p.color >> 16) & 0xff) / 255,
        g: ((p.color >> 8) & 0xff) / 255,
        b: (p.color & 0xff) / 255,
        a: p.alpha * (p.life / p.max),
      };
      r.drawRect(this._worldParticleG, { x: p.x - half, y: p.y - half, width: p.size, height: p.size }, color);
    }
  }

  /**
   * Отрисовка снежного слоя.
   * Этап 9: использует IRenderer API вместо PixiJS Graphics.
   */
  public drawSnow(g: GraphicsHandle): void {
    const r = this._renderer!;
    for (const f of this.snow) {
      const color = { r: 0xc8 / 255, g: 0xd8 / 255, b: 0xe8 / 255, a: 0.4 };
      r.drawRect(g, { x: f.x, y: f.y, width: f.w, height: f.w }, color);
    }
  }

  /** Очистить все частицы. */
  public clearParticles(): void {
    this.particles.length = 0;
  }

  /** Очистить весь снег. */
  public clearSnow(): void {
    this.snow.length = 0;
  }

  /** Уничтожить систему и освободить ресурсы. */
  public destroy(): void {
    this.particles.length = 0;
    this.snow.length = 0;
  }
}
