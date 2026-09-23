/* entity-layer.ts — Слой отрисовки ECS-сущностей */

import type { World } from 'bitecs';
import type { FloatTextLayer } from '../renderers/float/FloatTextLayer';
import type { InteractableHit } from '../ecs/ecs-systems/interaction-system';
import { renderSystem } from '../ecs/ecs-systems/render-system';
import type { IRenderLayer, RenderLayerContext } from './render-layer';
import type { RenderQueue } from '../render/RenderQueue';

export interface EntityLayerOptions {
  world: World;
  time: number;
  dt: number;
  float: FloatTextLayer;
  playerEid: number;
  cam: { x: number; y: number };
  getNpcSig?: (npcId: string) => string;
  talkedSig?: Map<string, string>;
  nearestInteractable?: InteractableHit | null;
}

/**
 * EntityLayer — обёртка над RenderSystem (ECS-рендеринг).
 *
 * Записи RenderQueue обновляются в renderSystem(), а применяются
 * (сортировка + zIndex) в RenderQueue.flush() после всех слоёв пайплайна.
 */
export class EntityLayer implements IRenderLayer {
  readonly name = 'entity';

  constructor(private readonly queue?: RenderQueue | null) {}

  render(ctx: RenderLayerContext): void {
    const o = ctx.options as EntityLayerOptions | undefined;
    if (!o) return;
    renderSystem(o.world, o);
  }

  setOptions(opts: EntityLayerOptions): void {
    this._opts = opts;
  }

  private _opts: EntityLayerOptions | null = null;

  // IRenderLayer stubs (EntityLayer управляется через setOptions + render)
  init(_renderer: any, _ctx: RenderLayerContext): void {}
  update(_ctx: RenderLayerContext): void {}
  resize(_viewW: number, _viewH: number): void {}
  destroy(): void {}
}
