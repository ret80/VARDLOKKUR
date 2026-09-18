/* scene-layers.ts — Управление слоями сцены через IRenderer */

import type { IRenderer, LayerHandle } from '../renderer/IRenderer';
import { logger } from '../debug/logger';

/** Фабрика Container-объектов (передаётся из engine.ts, чтобы избежать импорта pixi.js) */
export type ContainerFactory = () => { addChild(child: any): void; sortableChildren: boolean; removeChildren(): void; destroy(options?: any): void; children: any[] };

/** Фабрика Graphics-объектов (передаётся из engine.ts, чтобы избежать импорта pixi.js) */
export type GraphicsFactory = () => { destroy(options?: any): void };

/**
 * SceneLayers — абстракция над слоями сцены.
 * Заменяет SceneManager (PixiJS Containers) на IRenderer LayerHandle.
 *
 * Слои:
 * - tileLayer   — тайлы карты (фон, стены, дома)
 * - world       — мир (сортировка по Y)
 * - dynamic     — динамические объекты (враги, дропы, снаряды)
 * - fxWorld     — FX-графика (частицы)
 * - floatLayer  — плавающий текст
 *
 * FX-уровень (fxScreen, fadeG) — screen-space элементы,
 * управляются напрямую через PixiJS (добавляются в app.stage).
 *
 * Этап 9: удалены методы addFxGraphics/clearTiles/clearDynamic/clearFloatLayer.
 * Container-поля оставлены для обратной совместимости с MapLoaderService.
 * TODO: Этап 10 — полностью удалить Container-поля и перевести MapLoaderService на IRenderer.
 */
export class SceneLayers {
  private _renderer!: IRenderer;

  // IRenderer LayerHandle (основной путь)
  readonly tileLayerHandle: LayerHandle = -1 as LayerHandle;
  readonly worldHandle: LayerHandle = -1 as LayerHandle;
  readonly dynamicHandle: LayerHandle = -1 as LayerHandle;
  readonly fxWorldHandle: LayerHandle = -1 as LayerHandle;
  readonly floatLayerHandle: LayerHandle = -1 as LayerHandle;

  // Container-ссылки для обратной совместимости с MapLoaderService
  // @deprecated Этап 10 — удалить после миграции MapLoaderService на IRenderer
  private _tileLayer: any = null;
  private _world: any = null;
  private _dynamic: any = null;
  private _fxWorld: any = null;
  private _floatLayer: any = null;

  // FX screen-space элементы — реальные PixiJS Graphics (добавляются в app.stage напрямую)
  // Эти объекты НЕ управляются через IRenderer, т.к. находятся на app.stage (screen-space)
  fxScreen!: any;
  fadeG!: any;

  /** Инициализация слоёв через IRenderer */
  init(renderer: IRenderer, app: { stage: { addChild(child: any): void } }, containerFactory: ContainerFactory, graphicsFactory: GraphicsFactory): void {
    this._renderer = renderer;

    // Создаём слои через IRenderer
    (this.tileLayerHandle as any) = renderer.createLayer('tiles', 10);
    (this.worldHandle as any) = renderer.createLayer('world', 40);
    (this.dynamicHandle as any) = renderer.createLayer('dynamic', 50);
    (this.fxWorldHandle as any) = renderer.createLayer('fx', 60);
    (this.floatLayerHandle as any) = renderer.createLayer('float', 90);

    // Создаём Container через factory (из engine.ts) — без импорта pixi.js
    this._tileLayer = containerFactory();
    this._tileLayer.sortableChildren = true;
    this._world = containerFactory();
    this._world.sortableChildren = true;
    this._dynamic = containerFactory();
    this._dynamic.sortableChildren = true;
    this._fxWorld = containerFactory();
    this._floatLayer = containerFactory();

    // FX screen-space элементы — PixiJS Graphics для app.stage
    this.fxScreen = graphicsFactory();
    this.fadeG = graphicsFactory();

    // Добавляем слои в stage
    this._world.addChild(this._tileLayer);
    this._world.addChild(this._dynamic);
    this._world.addChild(this._fxWorld);
    this._world.addChild(this._floatLayer);

    // Legacy-контейнеры НЕ добавляются в stage.
    // Всё рендерится через ECS layers (tileLayerHandle, dynamicHandle и т.д.),
    // которые создаются через IRenderer.createLayer() и добавляются в worldContainer.
    // Legacy Containers оставлены только для обратной совместимости (Этап 10 — удалить).
    // Если нужно добавить legacy-контейнеры позже — использовать renderer.getWorldContainer().addChild().
    app.stage.addChild(this.fxScreen);
    app.stage.addChild(this.fadeG);

    logger.info('scene-layers', `SceneLayers initialized: 5 ECS layers + 2 FX graphics (legacy containers not added to stage)`);
  }

  /** Получить рендерер */
  get renderer(): IRenderer {
    return this._renderer;
  }

  // === Legacy Container-геттеры (Этап 10: удалить) ===

  /** Legacy: tileLayer Container для MapLoaderService */
  get tileLayer(): any {
    return this._tileLayer!;
  }

  /** Legacy: world Container для MapLoaderService */
  get world(): any {
    return this._world!;
  }

  /** Legacy: dynamic Container для MapLoaderService */
  get dynamic(): any {
    return this._dynamic!;
  }

  /** Legacy: fxWorld Container для MapLoaderService */
  get fxWorld(): any {
    return this._fxWorld!;
  }

  /** Legacy: floatLayer Container для MapLoaderService */
  get floatLayer(): any {
    return this._floatLayer!;
  }

  /** Очистить tileLayer и уничтожить все спрайты */
  clearTiles(): void {
    for (const child of this._tileLayer?.children ?? []) {
      if (typeof child?.destroy === 'function') {
        child.destroy({ children: true, texture: true });
      }
    }
    this._tileLayer?.removeChildren();
  }

  /** Очистить dynamic контейнер (только legacy tile sprites, не ECS-сущности) */
  clearDynamic(): void {
    for (const child of this._dynamic?.children ?? []) {
      if (typeof child?.destroy === 'function') {
        child.destroy({ children: true });
      }
    }
    this._dynamic?.removeChildren();
  }

  /** Очистить floatLayer */
  clearFloatLayer(): void {
    for (const child of this._floatLayer?.children ?? []) {
      if (typeof child?.destroy === 'function') {
        child.destroy({ children: true, texture: true });
      }
    }
    this._floatLayer?.removeChildren();
  }

  /** Уничтожить все слои */
  destroy(): void {
    this.clearTiles();
    this.clearDynamic();
    this.clearFloatLayer();
    this._fxWorld?.removeChildren();

    // Уничтожить FX-графику (реальные PixiJS Graphics)
    this.fxScreen.destroy({ texture: true });
    this.fadeG.destroy({ texture: true });

    // Уничтожить legacy Containers
    this._tileLayer?.destroy({ children: true });
    this._world?.destroy({ children: true });
    this._dynamic?.destroy({ children: true });
    this._fxWorld?.destroy({ children: true });
    this._floatLayer?.destroy({ children: true });

    logger.info('scene-layers', 'SceneLayers destroyed');
  }
}
