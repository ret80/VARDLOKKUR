/* render-layer.ts — Интерфейс слоя рендеринга для RenderPipeline */

import type { Application, Container } from 'pixi.js';
import type { World } from 'bitecs';

/** Контекст, передаваемый в update() и render() каждого слоя */
export interface RenderLayerContext {
  /** Delta time текущего кадра (секунды) */
  dt: number;
  /** Реальное время (секунды, монотонно растёт) */
  time: number;
  /** ECS-мир */
  world: World;
  /** FX-контейнер для частиц и эффектов (Этап 6) */
  fxWorld?: Container;
}

/**
 * Интерфейс слоя рендеринга.
 *
 * Каждый слой отвечает за свою группу визуальных элементов:
 * - EntityLayer: сущности ECS (игрок, враги, дропы, NPC, объекты)
 * - ParticleLayer: частицы, снег, FX-графика
 * - FogLayer: туман, руны, глаза в тумане
 * - OverlayLayer: UI, подсказки взаимодействия, плавающий текст
 *
 * Порядок вызова в RenderPipeline:
 * 1. init() — один раз при создании пайплайна
 * 2. update() — каждый тик, до render()
 * 3. render() — каждый кадр, после update() всех слоёв
 * 4. resize() — при изменении размера viewport
 * 5. destroy() — один раз при уничтожении пайплайна
 */
export interface IRenderLayer {
  /** Инициализация слоя. Вызывается один раз при создании пайплайна. */
  init(app: Application, ctx: RenderLayerContext): void;

  /** Обновление состояния слоя. Вызывается каждый тик, ДО render(). */
  update(ctx: RenderLayerContext): void;

  /** Отрисовка слоя. Вызывается каждый кадр, ПОСЛЕ update() всех слоёв. */
  render(ctx: RenderLayerContext): void;

  /** Обновление размеров viewport. Вызывается при ресайзе окна. */
  resize(viewW: number, viewH: number): void;

  /** Уничтожение слоя и очистка ресурсов. Вызывается один раз при уничтожении пайплайна. */
  destroy(): void;
}
