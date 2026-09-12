/* entity-layer.ts — Слой отрисовки ECS-сущностей
   Этап 6: удалён import { Application } из pixi.js */

import type { World } from 'bitecs';
import type { IRenderLayer, RenderLayerContext } from './render-layer';
import type { RenderSystemOptions } from '../ecs/ecs-systems/render-system';
import { RenderSystem } from '../ecs/ecs-systems/render-system';

/**
 * EntityLayer — слой отрисовки ECS-сущностей.
 *
 * Этап 6: владее RenderSystem instance вместо вызова функции.
 *
 * Обёртка над RenderSystem.render(), инкапсулирующая логику рендеринга:
 * - Слежение камеры за игроком
 * - Обновление позиций и видимости спрайтов
 * - Сортировка по глубине (z-index)
 * - Отрисовка сущностей: игрок, враги, дропы, снаряды, NPC, объекты
 * - Interaction hints
 *
 * НЕ вызывает app.render() — это делает RenderPipeline.
 */
export class EntityLayer implements IRenderLayer {
  private system = new RenderSystem();
  private opts: RenderSystemOptions | null = null;

  /**
   * Обновить параметры рендеринга. Вызывается каждый кадр из ecs-game-loop.
   */
  setOptions(opts: RenderSystemOptions): void {
    this.opts = opts;
  }

  init(_app: unknown, _ctx: RenderLayerContext): void {
    // Этап 6: Application больше не нужен
  }

  update(_ctx: RenderLayerContext): void {
    // EntityLayer не требует обновления состояния — вся логика в render()
  }

  render(_ctx: RenderLayerContext): void {
    if (!this.opts) return;
    // Delegating to RenderSystem instance — он не вызывает app.render() (это делает RenderPipeline)
    this.system.render(this.opts.world, this.opts);
  }

  resize(_viewW: number, _viewH: number): void {
    // EntityLayer не требует обновления при ресайзе
  }

  destroy(): void {
    this.opts = null;
  }
}
