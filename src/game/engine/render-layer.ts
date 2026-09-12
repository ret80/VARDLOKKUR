/* render-layer.ts — Интерфейс слоя рендеринга для RenderPipeline
   Этап 6: удалён import { Application, Container } из pixi.js */

import type REGL from 'regl';
import type { World } from 'bitecs';
import type { Batchers } from './batcher-types.js';

/** Контекст, передаваемый в update() и render() каждого слоя */
export interface RenderLayerContext {
  /** Delta time текущего кадра (секунды) */
  dt: number;
  /** Реальное время (секунды, монотонно растёт) */
  time: number;
  /** ECS-мир */
  world: World;
  /** @deprecated — Этап 6: fxWorld удалён (частицы через PrimitiveBatcher) */
  fxWorld?: unknown;
  /** Regl-контекст (Этап 1: добавлен для миграции PixiJS → Regl) */
  regl?: REGL.Regl;
  /** Canvas Regl (Этап 1: добавлен для прямого доступа к canvas) */
  reglCanvas?: HTMLCanvasElement;
  /** Батчеры для Regl-рендеринга (Этап 2: Sprite + Primitive) */
  batchers?: Batchers;
  /** Позиция камеры для world → screen (Этап 6) */
  cam?: { x: number; y: number };
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
  /**
   * Инициализация слоя. Вызывается один раз при создании пайплайна.
   * @param _app — удалён на Этапе 6 (Application больше не нужен)
   * @param ctx — контекст с regl, canvas, batchers и другими данными
   */
  init(_app: unknown, ctx: RenderLayerContext): void;

  /** Обновление состояния слоя. Вызывается каждый тик, ДО render(). */
  update(ctx: RenderLayerContext): void;

  /** Отрисовка слоя. Вызывается каждый кадр, ПОСЛЕ update() всех слоёв. */
  render(ctx: RenderLayerContext): void;

  /** Обновление размеров viewport. Вызывается при ресайзе окна. */
  resize(viewW: number, viewH: number): void;

  /** Уничтожение слоя и очистка ресурсов. Вызывается один раз при уничтожении пайплайна. */
  destroy(): void;
}
