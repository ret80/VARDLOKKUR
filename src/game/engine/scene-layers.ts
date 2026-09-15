/* scene-layers.ts — Управление слоями сцены через IRenderer */

import type { IRenderer, LayerHandle } from '../renderer/IRenderer';
import { Container, Graphics } from 'pixi.js';
import { logger } from '../debug/logger';

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
 * Этап 8: полная замена SceneManager.
 * MapLoaderService всё ещё использует addChild на Container-полях (legacy).
 * Этап 9: MapLoaderService будет переведён на IRenderer API.
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
  // TODO: Этап 9 — заменить все addChild на IRenderer API
  private _tileLayer: Container | null = null;
  private _world: Container | null = null;
  private _dynamic: Container | null = null;
  private _fxWorld: Container | null = null;
  private _floatLayer: Container | null = null;

  // FX screen-space элементы — реальные PixiJS Graphics (добавляются в app.stage напрямую)
  // Эти объекты НЕ управляются через IRenderer, т.к. находятся на app.stage (screen-space)
  readonly fxScreen: Graphics;
  readonly fadeG: Graphics;

  /** Инициализация слоёв через IRenderer */
  init(renderer: IRenderer, app: { stage: { addChild(child: any): void } }): void {
    this._renderer = renderer;

    // Создаём слои через IRenderer
    (this.tileLayerHandle as any) = renderer.createLayer('tiles', 10);
    (this.worldHandle as any) = renderer.createLayer('world', 40);
    (this.dynamicHandle as any) = renderer.createLayer('dynamic', 50);
    (this.fxWorldHandle as any) = renderer.createLayer('fx', 60);
    (this.floatLayerHandle as any) = renderer.createLayer('float', 90);

    // FX screen-space элементы — реальные PixiJS Graphics для app.stage
    this.fxScreen = new Graphics();
    this.fadeG = new Graphics();

    // Legacy Container-слои для MapLoaderService (Этап 9: удалить)
    this._tileLayer = new Container();
    this._tileLayer.sortableChildren = true;
    this._world = new Container();
    this._world.sortableChildren = true;
    this._dynamic = new Container();
    this._dynamic.sortableChildren = true;
    this._fxWorld = new Container();
    this._floatLayer = new Container();

    // Добавляем слои в stage
    this._world.addChild(this._tileLayer);
    this._world.addChild(this._dynamic);
    this._world.addChild(this._fxWorld);
    this._world.addChild(this._floatLayer);
    app.stage.addChild(this._world);
    app.stage.addChild(this.fxScreen);
    app.stage.addChild(this.fadeG);

    logger.info('scene-layers', `SceneLayers initialized: 5 layers + 2 FX graphics`);
  }

  /** Получить рендерер */
  get renderer(): IRenderer {
    return this._renderer;
  }

  // === Legacy Container-геттеры (Этап 9: удалить) ===

  /** Legacy: tileLayer Container для MapLoaderService */
  get tileLayer(): Container {
    return this._tileLayer!;
  }

  /** Legacy: world Container для MapLoaderService */
  get world(): Container {
    return this._world!;
  }

  /** Legacy: dynamic Container для MapLoaderService */
  get dynamic(): Container {
    return this._dynamic!;
  }

  /** Legacy: fxWorld Container для MapLoaderService */
  get fxWorld(): Container {
    return this._fxWorld!;
  }

  /** Legacy: floatLayer Container для MapLoaderService */
  get floatLayer(): Container {
    return this._floatLayer!;
  }

  /** Legacy: добавить FX-графику в fxWorld */
  addFxGraphics(g: Graphics): void {
    this._fxWorld?.addChild(g);
  }

  /** Очистить tileLayer и уничтожить все спрайты */
  clearTiles(): void {
    for (const child of this._tileLayer?.children ?? []) {
      if (child instanceof Container) {
        child.destroy({ children: true, texture: true });
      }
    }
    this._tileLayer?.removeChildren();
  }

  /** Очистить dynamic контейнер, не уничтожая playerG */
  clearDynamic(preservePlayerG?: Graphics): void {
    for (const child of this._dynamic?.children ?? []) {
      if (preservePlayerG && child === preservePlayerG) continue;
      if (child instanceof Container) {
        child.destroy({ children: true });
      }
    }
    this._dynamic?.removeChildren();
  }

  /** Очистить floatLayer */
  clearFloatLayer(): void {
    for (const child of this._floatLayer?.children ?? []) {
      if (child instanceof Container) {
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
