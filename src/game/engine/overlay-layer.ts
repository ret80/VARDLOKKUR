/* overlay-layer.ts — Слой оверлеев: подсказки взаимодействия, UI */

import type { World } from 'bitecs';
import type { IRenderLayer, RenderLayerContext } from './render-layer';
import type { IRenderer, LayerHandle } from '../renderer/IRenderer';
import type { CameraPosition } from './camera-controller';
import type { InteractableHit } from '../ecs/ecs-systems/interaction-system';

/**
 * OverlayLayer — слой оверлеев (screen-space UI).
 *
 * Отвечает за:
 * - Подсказки взаимодействия (E) над интерактивными объектами
 * - Другие screen-space элементы UI (в будущем)
 *
 * hintLayer управляется через LayerHandle от IRenderer.
 */
export class OverlayLayer implements IRenderLayer {
  private hintLayer: LayerHandle | null = null;
  private nearestInteractable: InteractableHit | null | undefined = null;
  private cam!: CameraPosition;
  private time = 0;
  private renderer!: IRenderer;

  init(_renderer: IRenderer, _ctx: RenderLayerContext): void {
    this.renderer = _renderer;
    // hintLayer будет создан в ecs-game-loop при инициализации render
  }

  /** Установить hintLayer (вызывается из ecs-game-loop) */
  setHintLayer(handle: LayerHandle): void {
    this.hintLayer = handle;
  }

  update(_ctx: RenderLayerContext): void {
    // OverlayLayer не требует обновления состояния
  }

  render(_ctx: RenderLayerContext): void {
    // Interaction hint рисуется внутри renderSystem через renderInteractionHint
    // Этот слой только инициализирует hintLayer
  }

  /** Обновить ближайший интерактивный объект. Вызывается каждый кадр из ecs-game-loop. */
  setNearestInteractable(interactable: InteractableHit | null | undefined): void {
    this.nearestInteractable = interactable;
  }

  /** Обновить камеру. Вызывается каждый кадр. */
  setCamera(cam: CameraPosition): void {
    this.cam = cam;
  }

  /** Обновить время. Вызывается каждый кадр. */
  setTime(time: number): void {
    this.time = time;
  }

  resize(_viewW: number, _viewH: number): void {
    // OverlayLayer не требует обновления при ресайзе
  }

  destroy(): void {
    this.hintLayer = null;
  }
}
