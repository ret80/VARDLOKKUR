/* particle-system.ts — Система частиц и снега (Этап 6: извлечение из FxManager) */

import { Graphics } from 'pixi.js';

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
 * Извлечена из FxManager (Этап 6). Отвечает за:
 * - Создание взрывов частиц (burst)
 * - Обновление физики частиц
 * - Отрисовку частиц в Graphics
 * - Обновление и отрисовку снега
 * - Владение worldParticleG (Graphics для мировых частиц)
 */
export class ParticleSystem {
  private particles: Particle[] = [];
  public snow: Snowflake[] = [];
  private viewW = 640;
  private viewH = 560;

  /** Максимальное количество частиц */
  private maxParticles = 420;

  /** Graphics для отрисовки мировых частиц (перемещён из FxManager) */
  public worldParticleG = new Graphics();

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

  /** Отрисовка мировых частиц. Вызывается в render(). */
  public drawWorldFx(): void {
    this.worldParticleG.clear();
    for (const p of this.particles) {
      this.worldParticleG.rect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size)
        .fill({ color: p.color, alpha: p.alpha * (p.life / p.max) });
    }
  }

  /** Отрисовка снежного слоя. */
  public drawSnow(fx: Graphics): void {
    for (const f of this.snow) {
      fx.rect(f.x, f.y, f.w, f.w).fill({ color: 0xc8d8e8, alpha: 0.4 });
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
