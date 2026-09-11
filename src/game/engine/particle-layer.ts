/* particle-layer.ts — Слой частиц и снега (Этап 6: извлечение из FxManager) */

import type { Application } from 'pixi.js';
import type { IRenderLayer, RenderLayerContext } from './render-layer';
import type { ParticleSystem } from './particle-system';

/**
 * ParticleLayer — слой частиц и снега.
 *
 * Этап 6: извлечён из FxManager.
 * Отвечает за:
 * - Обновление и отрисовку частиц (взрывы, урон, смерть)
 * - Обновление и отрисовку снега
 * - Владение ParticleSystem
 *
 * Владее ParticleSystem напрямую — больше нет зависимости от FxManager.
 */
export class ParticleLayer implements IRenderLayer {
  private sys!: ParticleSystem;
  private viewW = 0;
  private viewH = 0;

  constructor(sys: ParticleSystem) {
    this.sys = sys;
  }

  init(_app: Application, _ctx: RenderLayerContext): void {
    // ParticleLayer не требует инициализации — sys уже создан в engine
  }

  update(ctx: RenderLayerContext): void {
    // Обновление частиц и снега
    this.sys.updateParticles(ctx.dt);
    this.sys.updateSnow(ctx.time);
  }

  render(_ctx: RenderLayerContext): void {
    // Отрисовка частиц в worldParticleG
    this.sys.drawWorldFx();
  }

  resize(viewW: number, viewH: number): void {
    this.viewW = viewW;
    this.viewH = viewH;
    this.sys.resize(viewW, viewH);
  }

  destroy(): void {
    this.sys.destroy();
  }
}
