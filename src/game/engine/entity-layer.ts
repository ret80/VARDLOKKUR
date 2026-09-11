/* entity-layer.ts — Слой отрисовки ECS-сущностей */

import type { Application } from 'pixi.js';
import type { World } from 'bitecs';
import type { IRenderLayer, RenderLayerContext } from './render-layer';
import type { RenderSystemOptions } from '../ecs/ecs-systems/render-system';
import { renderSystem as renderSystemFn } from '../ecs/ecs-systems/render-system';

/**
 * EntityLayer — слой отрисовки ECS-сущностей.
 *
 * Обёртка над renderSystem(), инкапсулирующая логику рендеринга:
 * - Слежение камеры за игроком
 * - Обновление позиций и видимости спрайтов
 * - Сортировка по глубине (z-index)
 * - Отрисовка сущностей: игрок, враги, дропы, снаряды, NPC, объекты
 * - Interaction hints
 *
 * НЕ вызывает app.render() — это делает RenderPipeline.
 */
export class EntityLayer implements IRenderLayer {
  private app: Application | null = null;
  private opts: RenderSystemOptions | null = null;

  /**
   * Обновить параметры рендеринга. Вызывается каждый кадр из ecs-game-loop.
   */
  setOptions(opts: RenderSystemOptions): void {
    this.opts = opts;
  }

  init(app: Application, _ctx: RenderLayerContext): void {
    this.app = app;
  }

  update(_ctx: RenderLayerContext): void {
    // EntityLayer не требует обновления состояния — вся логика в render()
  }

  render(_ctx: RenderLayerContext): void {
    if (!this.opts) return;
    // Delegating to renderSystem — она не вызывает app.render() (это делает RenderPipeline)
    renderSystemFn(this.opts.world, this.opts);
  }

  resize(_viewW: number, _viewH: number): void {
    // EntityLayer не требует обновления при ресайзе
  }

  destroy(): void {
    this.app = null;
    this.opts = null;
  }
}
