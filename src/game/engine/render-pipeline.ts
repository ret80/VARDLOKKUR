/* render-pipeline.ts — Единый конвейер рендеринга */

import type { World } from 'bitecs';
import type { Application } from 'pixi.js';
import type { IRenderLayer, RenderLayerContext } from './render-layer';

/**
 * RenderPipeline — единый конвейер рендеринга игры.
 *
 * Управляет порядком отрисовки слоёв:
 * 1. EntityLayer — ECS-сущности (игрок, враги, дропы, NPC, объекты)
 * 2. ParticleLayer — частицы, снег, FX-графика
 * 3. FogLayer — туман, руны, глаза в тумане
 * 4. OverlayLayer — UI, подсказки, плавающий текст
 *
 * После render() всех слоёв вызывается app.render() для финального вывода.
 *
 * Использование:
 *   const pipeline = new RenderPipeline();
 *   pipeline.addLayer(entityLayer);
 *   pipeline.addLayer(particleLayer);
 *   pipeline.addLayer(fogLayer);
 *   pipeline.addLayer(overlayLayer);
 *   pipeline.init(app, context);
 *
 *   // Каждый тик:
 *   pipeline.update(dt);
 *   pipeline.render();
 *
 *   // При уничтожении:
 *   pipeline.destroy();
 */
export class RenderPipeline {
  private layers: IRenderLayer[] = [];
  private initialized = false;

  /** Добавить слой в пайплайн. Слои вызываются в порядке добавления. */
  addLayer(layer: IRenderLayer): void {
    this.layers.push(layer);
  }

  /** Инициализировать все слои. Вызывается один раз при создании пайплайна. */
  init(app: Application, ctx: RenderLayerContext): void {
    for (const layer of this.layers) {
      layer.init(app, ctx);
    }
    this.initialized = true;
  }

  /** Обновить все слои. Вызывается каждый тик, ДО render(). */
  update(ctx: RenderLayerContext): void {
    if (!this.initialized) return;
    for (const layer of this.layers) {
      layer.update(ctx);
    }
  }

  /** Отрисовать все слои и выполнить финальный рендер. Вызывается каждый кадр. */
  render(ctx: RenderLayerContext): void {
    if (!this.initialized) return;
    for (const layer of this.layers) {
      layer.render(ctx);
    }
  }

  /** Обновить размеры viewport во всех слоях. Вызывается при ресайзе. */
  resize(viewW: number, viewH: number): void {
    for (const layer of this.layers) {
      layer.resize(viewW, viewH);
    }
  }

  /** Уничтожить все слои и освободить ресурсы. Вызывается один раз при завершении. */
  destroy(): void {
    for (const layer of this.layers) {
      layer.destroy();
    }
    this.layers.length = 0;
    this.initialized = false;
  }
}
