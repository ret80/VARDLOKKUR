/* regl-engine.ts — Создание и управление контекстом Regl */

import REGL from 'regl';
import { logger } from '../debug/logger';

export interface ReglEngine {
  regl: REGL.Regl;
  canvas: HTMLCanvasElement;
  resize: (w: number, h: number) => void;
  destroy: () => void;
}

/**
 * Создаёт контекст Regl на выделенном canvas.
 *
 * Canvas вставляется в container с position:absolute, inset:0.
 * Масштабирование через devicePixelRatio (макс. 2x) для pixel-art.
 *
 * @param container — DOM-элемент, в который вставляется canvas
 * @returns ReglEngine с методами resize и destroy
 */
export function createReglEngine(container: HTMLElement): ReglEngine {
  const canvas = document.createElement('canvas');
  canvas.style.cssText =
    'position:absolute;inset:0;width:100%;height:100%;image-rendering:pixelated;';
  container.appendChild(canvas);

  logger.info('regl-engine', 'Creating Regl context...');

  const regl = REGL({
    canvas,
    extensions: ['OES_element_index_uint', 'OES_texture_float'],
    attributes: { antialias: false, alpha: false },
    profile: false,
  });

  logger.info('regl-engine', 'Regl context created successfully');

  // DEBUG: доступ к regl из консоли браузера
  (window as any).__regl = regl;

  const resize = (w: number, h: number): void => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    // CSS: canvas растягивается на весь контейнер (width:100%;height:100% из cssText),
    // здесь задаём только размер drawing buffer
    regl.poll();
  };

  return {
    regl,
    canvas,
    resize,
    destroy: (): void => {
      logger.info('regl-engine', 'Destroying Regl context');
      regl.destroy();
      try {
        container.removeChild(canvas);
      } catch {
        // canvas может быть уже удалён
      }
    },
  };
}
