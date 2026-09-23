/* scene-layers.ts — Управление слоями сцены через IRenderer */

import { Graphics } from 'pixi.js';
import type { IRenderer, LayerHandle } from '../renderer/IRenderer';
import { logger } from '../debug/logger';

/**
 * SceneLayers — абстракция над слоями сцены.
 * Заменяет SceneManager (PixiJS Containers) на IRenderer LayerHandle.
 *
 * Слои (IRenderer):
 * - tileLayer   — тайлы карты (фон, стены, дома)
 * - world       — мир (сортировка по Y)
 * - dynamic     — динамические объекты (враги, дропы, снаряды)
 * - fxWorld     — FX-графика (частицы)
 * - floatLayer  — плавающий текст
 *
 * FX-уровень (fxScreen, fadeG) — screen-space элементы,
 * управляются напрямую через PixiJS (добавляются в app.stage).
 */
export class SceneLayers {
  private _renderer!: IRenderer;

  // IRenderer LayerHandle (основной путь)
  readonly tileLayerHandle: LayerHandle = -1 as LayerHandle;
  readonly worldHandle: LayerHandle = -1 as LayerHandle;
  readonly dynamicHandle: LayerHandle = -1 as LayerHandle;
  readonly fxWorldHandle: LayerHandle = -1 as LayerHandle;
  readonly floatLayerHandle: LayerHandle = -1 as LayerHandle;

  // FX screen-space элементы — реальные PixiJS Graphics (добавляются в app.stage напрямую)
  // Эти объекты НЕ управляются через IRenderer, т.к. находятся на app.stage (screen-space)
  fxScreen!: any;
  fadeG!: any;

  /** Инициализация слоёв через IRenderer */
  init(renderer: IRenderer, app: { stage: { addChild(child: any): void } }): void {
    this._renderer = renderer;

    // Создаём слои через IRenderer
    (this.tileLayerHandle as any) = renderer.createLayer('tiles', 10);
    (this.worldHandle as any) = renderer.createLayer('world', 40);
    (this.dynamicHandle as any) = renderer.createLayer('dynamic', 50);
    (this.fxWorldHandle as any) = renderer.createLayer('fx', 60);
    (this.floatLayerHandle as any) = renderer.createLayer('float', 90);

    // FX screen-space элементы — PixiJS Graphics для app.stage
    this.fxScreen = new Graphics();
    this.fadeG = new Graphics();

    // Добавляем FX-графику в stage
    app.stage.addChild(this.fxScreen);
    app.stage.addChild(this.fadeG);

    logger.info('scene-layers', `SceneLayers initialized: 5 ECS layers + 2 FX graphics`);
  }

  /** Получить рендерер */
  get renderer(): IRenderer {
    return this._renderer;
  }

  /** Уничтожить все слои */
  destroy(): void {
    // Уничтожить FX-графику (реальные PixiJS Graphics)
    this.fxScreen.destroy({ texture: true });
    this.fadeG.destroy({ texture: true });

    logger.info('scene-layers', 'SceneLayers destroyed');
  }
}
