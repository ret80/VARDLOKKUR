/* camera-controller.ts – Управление камерой: слежение за игроком, viewport culling и матрицы */

import { logger } from '../debug/logger';
import { ortho, translate } from './math-utils.js';

export interface CameraPosition {
  x: number;
  y: number;
}

export interface CameraControllerOptions {
  /** Текущая позиция камеры (мутируется контроллером) */
  cam: CameraPosition;
  /** Размеры viewport (полные, не половина) */
  viewportW: number;
  viewportH: number;
}

/**
 * Контроллер камеры — извлечён из render-system.ts (Этап 4).
 *
 * Этап 3: добавлены методы getViewMatrix() и getProjectionMatrix()
 * для передачи матриц в Regl-шейдеры.
 *
 * Отвечает за:
 * 1. Слежение за игроком (центрирование камеры на playerEid)
 * 2. Viewport culling — проверка видимости сущности в кадре
 * 3. Генерация view- и projection-матриц для Regl-рендеринга
 */
export class CameraController {
  private _opts: CameraControllerOptions;

  constructor(opts: CameraControllerOptions) {
    this._opts = opts;
  }

  /** Обновить позицию камеры — центрировать на игроке */
  trackPlayer(playerX: number, playerY: number): void {
    const { cam, viewportW, viewportH } = this._opts;
    const halfW = viewportW / 2;
    const halfH = viewportH / 2;
    cam.x = playerX - halfW;
    cam.y = playerY - halfH;
  }

  /** Проверить, видна ли сущность в viewport камеры */
  isVisibleInViewport(
    entityX: number,
    entityY: number,
    entityRadius: number
  ): boolean {
    const { cam, viewportW, viewportH } = this._opts;
    const dx = Math.abs(entityX - cam.x);
    const dy = Math.abs(entityY - cam.y);
    // viewportW/H — ПОЛНЫЕ размеры viewport
    return dx < viewportW && dy < viewportH;
  }

  /** Применить камеру к контейнеру (сдвиг world) */
  applyToWorld(worldContainer: { position: { set: (x: number, y: number) => void } }): void {
    const { cam } = this._opts;
    worldContainer.position.set(-Math.round(cam.x), -Math.round(cam.y));
  }

  /** Текущая позиция камеры (read-only) */
  get cam(): CameraPosition {
    return this._opts.cam;
  }

  /** Размеры viewport */
  get viewportW(): number { return this._opts.viewportW; }
  get viewportH(): number { return this._opts.viewportH; }

  /** Обновить опции (например, при ресайзе viewport) */
  updateOptions(opts: Partial<CameraControllerOptions>): void {
    if (opts.cam !== undefined) this._opts.cam = opts.cam;
    if (opts.viewportW !== undefined) this._opts.viewportW = opts.viewportW;
    if (opts.viewportH !== undefined) this._opts.viewportH = opts.viewportH;
  }

  // ============================================================
  // Этап 3: матрицы для Regl
  // ============================================================

  /**
   * Получить view-матрицу.
   *
   * View-матрица сдвигает мир так, что камера оказывается в начале координат.
   * Для 2D: translate(-camX, -camY).
   *
   * Возвращает column-major Float32Array[16].
   */
  getViewMatrix(): Float32Array {
    const { cam } = this._opts;
    return translate(-cam.x, -cam.y);
  }

  /**
   * Получить projection-матрицу.
   *
   * Ортографическая проекция для top-left origin (y вниз):
   *   left=0, right=viewW, top=0, bottom=viewH
   *
   * Возвращает column-major Float32Array[16].
   */
  getProjectionMatrix(viewW: number, viewH: number): Float32Array {
    return ortho(0, viewW, viewH, 0, -1000, 1000);
  }
}
