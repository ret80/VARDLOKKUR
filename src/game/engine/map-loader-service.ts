/* map-loader-service.ts — Загрузка карт: тайлы, ECS-сущности, миникарта */

import { PlanckWorld } from "../physics/planck-world";
import type { WorldData, Vec } from "../world";
import type { GameStore } from "../store";
import type { World } from "bitecs";
import { EcsMapLoader, type SpriteFactory } from "../ecs/ecs-map-loader";
import { createEntityFactory, type EntityFactory } from "../ecs/entity-factory";
import type { SceneLayers } from "./scene-layers";
import type { ViewportController } from "./viewport-controller";
import type { PlayerDomain } from "../store/player-domain";
import {
  buildAllTileTextures,
  WallTextureCache,
  HouseTextureCache,
  houseMetrics,
} from "../tiles";
import { buildMinimapBase } from "../map-display";
import { T } from "../world";
import type { IRenderer, LayerHandle } from "../renderer";
import { logger } from "../debug/logger";

/** Результат ECS-загрузки карты */
export interface LoadMapResult {
  playerBody: any;
  playerEid: number;
}

/**
 * MapLoaderService — загрузка и очистка карт.
 *
 * Этап 8: принимает SceneLayers вместо SceneManager.
 * Этап 9: добавлена SpriteFactory для создания графических объектов без импорта Graphics.
 * Фаза 3: работает через IRenderer, без прямых импортов pixi.js.
 */
export class MapLoaderService {
  wallCache = new WallTextureCache();
  houseCache = new HouseTextureCache();
  ecsMapLoader: EcsMapLoader | null = null;
  private _mmBase: ImageData | null = null;
  /** Предыдущий PlanckWorld — уничтожается при загрузке новой карты */
  private _prevPlanckWorld: PlanckWorld | null = null;
  /** Фабрика чистых ECS-сущностей (без графики/физики) */
  entityFactory: EntityFactory;
  /** Фабрика графических объектов (создаёт через IRenderer, не через legacy containers) */
  private _spriteFactory: SpriteFactory;
  /** IRenderer для создания спрайтов карты */
  private _renderer!: IRenderer;
  /** Handle слоя dynamic для добавления спрайтов (IRenderer layer, не legacy Container) */
  private _dynamicLayer!: LayerHandle;

  constructor(
    private scene: SceneLayers,
    private store: GameStore,
    private viewport: ViewportController,
    private ecsWorld: World,
    private prefabWorld: World,
    spriteFactory?: SpriteFactory
  ) {
    // Фабрика создаётся ОДИН раз при инициализации сервиса
    this.entityFactory = createEntityFactory(this.ecsWorld, this.prefabWorld);
    // Фаза 3/Регрессия: default-фабрика создаёт через IRenderer.createGraphics()
    // и добавляет в dynamic layer (в worldContainer), а не в legacy Container.
    // Это исправляет регрессию: ECS-сущности теперь двигаются с камерой.
    this._spriteFactory = spriteFactory ?? {
      create: (x: number, y: number) => {
        const g = this._renderer.createGraphics(this._dynamicLayer);
        this._renderer.setGraphicsPosition(g, { x, y });
        return g;
      },
    };
  }

  /** Инициализация с IRenderer (вызывается один раз при загрузке карты) */
  init(renderer: IRenderer): void {
    this._renderer = renderer;
    this._dynamicLayer = (this.scene as any).dynamicHandle as LayerHandle;
  }

  /** Фабрика графических объектов */
  get spriteFactory(): SpriteFactory {
    return this._spriteFactory;
  }

  get mmBase(): ImageData | null { return this._mmBase; }

  /** Очистить tileLayer и dynamic контейнеры перед загрузкой новой карты */
  clearTiles(preservePlayerG?: number): void {
    // preservePlayerG — это GraphicsHandle, legacy dynamic Container не содержит ECS-сущности
    this.scene.clearTiles();
    this.scene.clearDynamic();
  }

  /** ECS загрузка карты: тайлы + сущности + миникарта */
  loadMapEcs(
    map: WorldData,
    spawn: Vec,
    playerDomain: PlayerDomain,
    playerG: number,
    savedDrops: Array<{ kind: string; x: number; y: number; life: number; ambientIdx?: number }>,
    toast: (msg: string) => void,
    onPlayerCreated?: (eid: number) => void
  ): LoadMapResult {
    // 0. Уничтожить предыдущий PlanckWorld — избежать утечки физических тел
    if (this._prevPlanckWorld) {
      this._prevPlanckWorld.destroy();
      this._prevPlanckWorld = null;
    }

    // Очищаем старые тайлы перед построением новых, сохраняем playerG
    this.clearTiles(playerG);

    // Фаза 3: строим текстуры через IRenderer
    const tileResult = buildAllTileTextures(map, this.store.roofSnow, this._renderer);

    // Получаем Container для legacy tileLayer (Y-sorting через userData)
    const tileLayerContainer = this.scene.tileLayer;
    const dynamicContainer = this.scene.dynamic;

    // Ground — создаём спрайт напрямую в tileLayer (не через createSprite — он добавляет в worldContainer)
    const groundHandle = this._renderer.createSprite({
      texture: tileResult.groundTexture,
      x: 0,
      y: 0,
      _container: tileLayerContainer,
    });
    this._renderer.setSpriteZIndex(groundHandle, 0);

    // Переносим дома, ёлки, камни, монументы в dynamic — сортируются по layer + bottomY
    for (const ws of tileResult.wallSprites) {
      const spriteHandle = this._renderer.createSprite({
        texture: ws.textureHandle,
        x: ws.x,
        y: ws.y,
        _container: dynamicContainer,
      });
      this._renderer.setSpriteZIndex(spriteHandle, ws.zIndex);
      const spritePixi = this._renderer.getSpritePixi(spriteHandle);
      if (spritePixi) {
        (spritePixi as any).userData = (spritePixi as any).userData || {};
        (spritePixi as any).userData.layer = 40;
        (spritePixi as any).userData.y = ws.y + 28;
      }
    }
    for (const hs of tileResult.houseSprites) {
      const spriteHandle = this._renderer.createSprite({
        texture: hs.textureHandle,
        x: hs.x,
        y: hs.y,
        _container: dynamicContainer,
      });
      this._renderer.setSpriteZIndex(spriteHandle, hs.zIndex);
      const spritePixi = this._renderer.getSpritePixi(spriteHandle);
      if (spritePixi) {
        (spritePixi as any).userData = (spritePixi as any).userData || {};
        (spritePixi as any).userData.layer = 40;
        const m = houseMetrics(hs.hw, hs.hh);
        (spritePixi as any).userData.y = hs.y + m.wallTop + m.wallH + m.foundH - 1;
      }
    }
    this.wallCache = tileResult.wallCache;
    this.houseCache = tileResult.houseCache;

    // Создаём ECS Map Loader (используется общий ECS-мир движка)
    const newPlanckWorld = new PlanckWorld();
    this.ecsMapLoader = new EcsMapLoader({
      world: this.ecsWorld,
      planckWorld: newPlanckWorld,
      openedChests: this.store.openedChests,
      takenPedestals: this.store.takenPedestals,
      visitedShrines: this.store.visitedShrines,
      spriteFactory: this._spriteFactory,
      flags: {
        secretKnown: this.store.flags.secretKnown,
        shrineIdx: this.store.flags.shrineIdx,
        runes: this.store.flags.runes,
        snakeStarted: this.store.flags.snakeStarted,
        hasKey: this.store.flags.hasKey,
      },
      map,
      spawn,
      viewW: this.viewport.viewW,
      viewH: this.viewport.viewH,
      savedDrops,
      toast,
      entityFactory: this.entityFactory,
    });
    // Сохраняем для уничтожения при следующей загрузке карты
    this._prevPlanckWorld = newPlanckWorld;

    const result = this.ecsMapLoader.loadMap(playerG, playerDomain, onPlayerCreated);
    this._mmBase = buildMinimapBase(map);
    return result;
  }

  /** Уничтожить кэши текстур */
  destroy(): void {
    this.wallCache.destroy();
    this.houseCache.destroy();
  }
}
