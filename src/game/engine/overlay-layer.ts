/* overlay-layer.ts — Слой оверлеев: подсказки взаимодействия, UI
   Этап 6: удалён import { Application, Container } из pixi.js */

import type { World } from 'bitecs';
import type { IRenderLayer, RenderLayerContext } from './render-layer';
import type { CameraPosition } from './camera-controller';
import type { InteractableHit } from '../ecs/ecs-systems/interaction-system';

/**
 * OverlayLayer — слой оверлеев (screen-space UI).
 *
 * Отвечает за:
 * - Подсказки взаимодействия (E) над интерактивными объектами
 * - Другие screen-space элементы UI (в будущем)
 *
 * hintLayer находится на app.stage (не сдвигается камерой).
 */
export class OverlayLayer implements IRenderLayer {
  private nearestInteractable: InteractableHit | null | undefined = null;
  private cam!: CameraPosition;
  private time = 0;

  constructor() {
    // Этап 6: hintLayer удалён — подсказка рисуется через PrimitiveBatcher
  }

  init(_app: unknown, _ctx: RenderLayerContext): void {
    // Этап 6: Application больше не нужен
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
    // hintLayer удалён на Этапе 6
  }
}
