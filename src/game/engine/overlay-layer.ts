/* overlay-layer.ts — Слой оверлеев: подсказки взаимодействия, UI */

import type { World } from 'bitecs';
import type { IRenderLayer, RenderLayerContext } from './render-layer';
import type { IRenderer, GraphicsHandle } from '../renderer/IRenderer';
import type { CameraPosition } from './camera-controller';
import type { InteractableHit } from '../ecs/ecs-systems/interaction-system';
import { getRenderQueue, RENDER_LAYER } from '../render/RenderQueue';

/**
 * OverlayLayer — слой оверлеев (screen-space UI).
 *
 * Отвечает за:
 * - Подсказки взаимодействия (E) над интерактивными объектами
 * - Другие screen-space элементы UI (в будущем)
 *
 * Подсказка рисуется через RenderQueue с максимальным слоем (OVERLAY: 9999).
 */
export class OverlayLayer implements IRenderLayer {
  private hintG: GraphicsHandle | null = null;
  private nearestInteractable: InteractableHit | null | undefined = null;
  private cam!: CameraPosition;
  private time = 0;
  private renderer!: IRenderer;

  init(renderer: IRenderer, _ctx: RenderLayerContext): void {
    this.renderer = renderer;
    // Подсказка — Graphics без привязки к слою (рендерится через RenderQueue)
    this.hintG = renderer.createGraphics();
  }

  update(_ctx: RenderLayerContext): void {
    // OverlayLayer не требует обновления состояния
  }

  render(_ctx: RenderLayerContext): void {
    this.renderHint();
  }

  /** Отрисовать подсказку взаимодействия над ближайшим интерактивным объектом */
  private renderHint(): void {
    if (!this.hintG) return;
    const r = this.renderer;

    const queue = getRenderQueue();

    if (!this.nearestInteractable) {
      r.setGraphicsVisible(this.hintG, false);
      return;
    }

    // Мировые координаты интерактивного объекта
    const hx = this.nearestInteractable.x;
    const hy = this.nearestInteractable.y - 20 + Math.sin(this.time * 5) * 1.5;

    // Очистить и нарисовать подсказку в ЛОКАЛЬНЫХ координатах (центр в 0,0).
    // Позиция задаётся через RenderQueue entry — flush() сдвинет Graphics в (hx, hy).
    r.clearGraphics(this.hintG);

    // Тёмный фон (центр в 0,0)
    r.drawRect(this.hintG,
      { x: -6, y: -6, width: 12, height: 10 },
      { r: 0x0a / 255, g: 0x0f / 255, b: 0x16 / 255, a: 0.85 }, true);

    // Золотая рамка (центр в 0,0)
    r.drawRect(this.hintG,
      { x: -6, y: -6, width: 12, height: 10 },
      { r: 0xc9 / 255, g: 0xa2 / 255, b: 0x4b / 255, a: 0.8 }, false, 1);

    // Буква "E" — пиксель-арт стиль (центр в 0,0)
    r.drawPoly(this.hintG, [
      -2, -3, 2, -3,
      2, -1, 0, -1,
      0, 2, -2, 2
    ], { r: 0xe8 / 255, g: 0xdc / 255, b: 0xc0 / 255, a: 1 });

    // Добавить в RenderQueue с максимальным слоем и пропуском culling.
    if (queue && this.hintG) {
      queue.enqueue({
        x: hx,
        y: hy,
        layer: RENDER_LAYER.OVERLAY,
        alpha: 1,
        visible: true,
        handle: this.hintG,
        skipCull: true,
      });
    }
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
    this.hintG = null;
  }
}
