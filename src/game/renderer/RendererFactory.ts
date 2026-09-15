/* RendererFactory.ts — фабрика рендереров и глобальный DI-контейнер */

import { PixiJSRenderer } from './PixiJSRenderer';
import type { IRenderer } from './IRenderer';
import { logger } from '../debug/logger';

// ============================================================
// Типы рендереров
// ============================================================

export type RendererType = 'pixi' | 'canvas' | 'headless';

// ============================================================
// Фабрика
// ============================================================

/**
 * Factory Method — создаёт нужную реализацию IRenderer.
 * Позволяет в будущем добавить CanvasRenderer, WebGPURenderer,
 * HeadlessRenderer (для тестов) без изменения вызывающего кода.
 */
export class RendererFactory {
  static create(type: RendererType = 'pixi'): IRenderer {
    switch (type) {
      case 'pixi':
        logger.info('renderer', 'Creating PixiJSRenderer');
        return new PixiJSRenderer();

      // TODO: реализовать CanvasRenderer
      // case 'canvas':
      //   logger.info('renderer', 'Creating CanvasRenderer');
      //   return new CanvasRenderer();

      // TODO: реализовать HeadlessRenderer (для unit-тестов без GPU)
      // case 'headless':
      //   logger.info('renderer', 'Creating HeadlessRenderer');
      //   return new HeadlessRenderer();

      default: {
        throw new Error(`Unknown renderer type: ${type as string}`);
      }
    }
  }
}

// ============================================================
// Глобальный DI-контейнер
// ============================================================

let _renderer: IRenderer | null = null;

/** Установить глобальный рендерер (вызывается из engine.ts) */
export function setGlobalRenderer(r: IRenderer): void {
  if (_renderer) {
    logger.warn('renderer', 'Global renderer already set, replacing');
  }
  _renderer = r;
  logger.info('renderer', 'Global renderer set');
}

/** Получить глобальный рендерер */
export function getRenderer(): IRenderer {
  if (!_renderer) {
    throw new Error('Renderer not initialized. Call setGlobalRenderer() first.');
  }
  return _renderer;
}

/** Проверить, инициализирован ли рендерер */
export function isRendererInitialized(): boolean {
  return _renderer !== null;
}

/** Явно освободить глобальный рендерер (для тестов / перезапуска) */
export function resetGlobalRenderer(): void {
  logger.info('renderer', 'Global renderer reset');
  _renderer = null;
}
