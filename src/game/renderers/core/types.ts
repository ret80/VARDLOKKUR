/* renderers/core/types.ts — единый контракт всех рендереров (SOLID: DIP) */

import type { GraphicsHandle } from '../../renderer/IRenderer';

/** Контекст, общий для всех рендереров */
export interface RenderContext {
  time: number;
  [key: string]: unknown;
}

/**
 * Стратегия кэширования текстуры для рендерера.
 *
 * REALTIME_GRAPHICS  — каждый кадр рисуем в общий Graphics (частицы, простые эффекты);
 * STATIC_TEXTURE     — запекаем ОДИН РАЗ при спавне (деревья, камни, стены, закрытые сундуки);
 * DYNAMIC_TEXTURE    — запекаем в RenderTexture ТОЛЬКО при изменениях и если в кадре (враги, игрок).
 */
export enum CacheStrategy {
  REALTIME_GRAPHICS = "realtime",
  STATIC_TEXTURE = "static",
  DYNAMIC_TEXTURE = "dynamic",
}

/**
 * Единый интерфейс рендерера: один класс = отрисовка одного объекта.
 * Оркестратор (RenderSystem) зависит только от этого интерфейса и реестра,
 * а не от конкретных классов.
 *
 * Использует GraphicsHandle — абстракцию над пиксельной графикой.
 * Все детали PixiJS скрыты в PixiJSRenderer.
 */
export interface Renderer<TData> {
  /** Основная metoda отрисовки в GraphicsHandle (для REALTIME_GRAPHICS) */
  render(g: GraphicsHandle, data: TData, ctx: RenderContext): void;

  /**
   * Нужно ли обновлять текстуру в этом кадре? (для DYNAMIC_TEXTURE).
   * Возвращает true, если состояние изменилось с прошлого кадра.
   */
  needsTextureUpdate?(data: TData, prevData: TData | null): boolean;

  /**
   * Ключ для переиспользования текстуры (для STATIC_TEXTURE).
   * Например: "chest_closed", "tree_oak_1".
   */
  getCacheKey?(data: TData): string;

  /**
   * Стратегия кэширования — диктует RenderSystem, как рендерить.
   * По умолчанию — REALTIME_GRAPHICS ( backward compatible ).
   */
  readonly strategy?: CacheStrategy;
}

/**
 * Результат кэширования текстуры для STATIC_TEXTURE рендерера.
 */
export interface CachedTexture {
  texture: number; // TextureHandle — абстрактный идентификатор текстуры
  width: number;
  height: number;
}
