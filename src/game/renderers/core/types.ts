/* renderers/core/types.ts — единый контракт всех рендереров (SOLID: DIP) */

import type { Container, Graphics, Texture } from "pixi.js";

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
 * Для REALTIME_GRAPHICS — используется render(g, data, ctx).
 * Для STATIC_TEXTURE — используется renderToContainer + getCacheKey.
 * Для DYNAMIC_TEXTURE — используется renderToContainer + needsTextureUpdate.
 */
export interface Renderer<TData> {
  /** Основная metoda отрисовки в Graphics (для REALTIME_GRAPHICS) */
  render(g: Graphics, data: TData, ctx: RenderContext): void;

  /**
   * Отрисовка во временный Container для последующего запекания в текстуру
   * (для STATIC_TEXTURE и DYNAMIC_TEXTURE).
   */
  renderToContainer?(container: Container, data: TData, ctx: RenderContext): void;

  /**
   * Ключ для переиспользования текстуры (для STATIC_TEXTURE).
   * Например: "chest_closed", "tree_oak_1".
   */
  getCacheKey?(data: TData): string;

  /**
   * Нужно ли обновлять текстуру в этом кадре? (для DYNAMIC_TEXTURE).
   * Возвращает true, если состояние изменилось с прошлого кадра.
   */
  needsTextureUpdate?(data: TData, prevData: TData, ctx: RenderContext): boolean;

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
  texture: Texture;
  width: number;
  height: number;
}

/**
 * Результат динамического кэширования (DYNAMIC_TEXTURE).
 * Содержит Sprite, который обновляется каждый кадр (при необходимости).
 */
export interface DynamicTextureRef {
  sprite: any; // PixiJS Sprite
  width: number;
  height: number;
}