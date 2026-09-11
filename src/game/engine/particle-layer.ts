/* particle-layer.ts — Слой частиц, снега и FX-графики */

import type { Application } from 'pixi.js';
import type { IRenderLayer, RenderLayerContext } from './render-layer';
import type { FxManager } from '../fx';

/**
 * ParticleLayer — слой частиц, снега и FX-графики.
 *
 * Отвечает за:
 * - Обновление и отрисовку частиц (взрывы, урон, смерть)
 * - Обновление и отрисовку снега
 * - Отрисовку FX-графики (worldParticleG)
 */
export class ParticleLayer implements IRenderLayer {
  private fx!: FxManager;
  private viewW = 0;
  private viewH = 0;

  constructor(fx: FxManager) {
    this.fx = fx;
  }

  init(_app: Application, ctx: RenderLayerContext): void {
    this.viewW = ctx.dt; // placeholder — размеры обновятся в resize
  }

  update(ctx: RenderLayerContext): void {
    // Обновление частиц и снега
    this.fx.updateParticles(ctx.dt);
    this.fx.updateSnow(ctx.time);
  }

  render(_ctx: RenderLayerContext): void {
    // Частицы и снег рисуются через FxManager в worldParticleG,
    // который уже добавлен в fxWorld контейнер SceneManager.
    // FxManager.drawWorldFx() вызывается из tick() перед рендером сущностей.
    // Здесь только обновляем графику частиц
    this.fx.drawWorldFx(0, 0); // dt и time не нужны для drawWorldFx
  }

  resize(viewW: number, viewH: number): void {
    this.viewW = viewW;
    this.viewH = viewH;
  }

  destroy(): void {
    // FxManager управляется отдельно (engine.destroy())
  }
}
