/* particle-layer.ts — Слой частиц и снега (Этап 5: мигрирован на Batchers) */

import type { IRenderLayer, RenderLayerContext } from './render-layer';
import type { ParticleSystem } from './particle-system';

/**
 * ParticleLayer — слой частиц и снега.
 *
 * Этап 5: мигрирован на Batchers.
 * - drawWorldFx() теперь принимает Batchers вместо Graphics
 * - snow rendering также мигрирован на PrimitiveBatcher
 */
export class ParticleLayer implements IRenderLayer {
  private sys!: ParticleSystem;
  private viewW = 0;
  private viewH = 0;

  constructor(sys: ParticleSystem) {
    this.sys = sys;
  }

  init(_app: unknown, _ctx: RenderLayerContext): void {
    // Этап 6: Application больше не нужен
  }

  update(ctx: RenderLayerContext): void {
    // Обновление частиц и снега
    this.sys.updateParticles(ctx.dt);
    this.sys.updateSnow(ctx.time);
  }

  render(ctx: RenderLayerContext): void {
    // Отрисовка частиц через PrimitiveBatcher
    const batchers = ctx.batchers;
    if (batchers) {
      this.sys.drawWorldFx(batchers, ctx.cam);
    }
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
