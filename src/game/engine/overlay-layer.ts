/* overlay-layer.ts — Слой оверлеев: подсказки взаимодействия, UI */

import type { Application, Container } from 'pixi.js';
import type { World } from 'bitecs';
import type { IRenderLayer, RenderLayerContext } from './render-layer';
import type { CameraPosition } from './camera-controller';
import type { InteractableHit } from '../ecs/ecs-systems/interaction-system';
import { initInteractionHint } from '../ecs/ecs-systems/render-system';

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
  private hintLayer: Container | null = null;
  private nearestInteractable: InteractableHit | null | undefined = null;
  private cam!: CameraPosition;
  private time = 0;

  constructor(hintLayer: Container) {
    this.hintLayer = hintLayer;
  }

  init(_app: Application, _ctx: RenderLayerContext): void {
    if (this.hintLayer) {
      initInteractionHint(this.hintLayer);
    }
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
