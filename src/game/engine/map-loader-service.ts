/* map-loader-service.ts – Загрузка карт: тайлы, ECS-сущности, миникарта
   Этап 6: удалён import { Sprite, Graphics } из pixi.js */

import { PlanckWorld } from "../physics/planck-world";
import type { WorldData, Vec } from "../world";
import type { GameStore } from "../store";
import type { World } from "bitecs";
import { EcsMapLoader } from "../ecs/ecs-map-loader";
import { createEntityFactory, type EntityFactory } from "../ecs/entity-factory";
import type { SceneManager } from "./scene-manager";
import type { ViewportController } from "./viewport-controller";
import type { TileLayer } from "./tile-layer";
import type { PlayerDomain } from "../store/player-domain";
import {
  buildAllTileTextures,
  WallTextureCache,
  HouseTextureCache,
  houseMetrics,
} from "../tiles";
import { buildMinimapBase } from "../map-display";
import { T } from "../world";

/** Результат ECS-загрузки карты */
export interface LoadMapResult {
  playerBody: any;
  playerEid: number;
}

export class MapLoaderService {
  wallCache = new WallTextureCache();
  houseCache = new HouseTextureCache();
  ecsMapLoader: EcsMapLoader | null = null;
  private _mmBase: ImageData | null = null;
  /** Предыдущий PlanckWorld — уничтожается при загрузке новой карты */
  private _prevPlanckWorld: PlanckWorld | null = null;
  /** Фабрика чистых ECS-сущностей (без графики/физики) */
  entityFactory: EntityFactory;

  constructor(
    private scene: SceneManager,
    private store: GameStore,
    private viewport: ViewportController,
    private ecsWorld: World,
    private prefabWorld: World,
    private tileLayer?: TileLayer | null
  ) {
    // Фабрика создаётся ОДИН раз при инициализации сервиса
    this.entityFactory = createEntityFactory(this.ecsWorld, this.prefabWorld);
    this.entityFactory.initPrefabs();
  }

  get mmBase(): ImageData | null { return this._mmBase; }

  /** Очистить tileLayer и dynamic контейнеры перед загрузкой новой карты (Этап 6: заглушка) */
  clearTiles(_preservePlayerG?: unknown): void {
    // Этап 6: тайлы больше не добавляются в PixiJS слои
    this.scene.clearTiles();
    this.scene.clearDynamic();
  }

  /** ECS загрузка карты: тайлы + сущности + миникарта */
  loadMapEcs(
    map: WorldData,
    spawn: Vec,
    playerDomain: PlayerDomain,
    _playerG: unknown,
    savedDrops: Array<{ kind: string; x: number; y: number; life: number; ambientIdx?: number }>,
    toast: (msg: string) => void,
    onPlayerCreated?: (eid: number) => void
  ): LoadMapResult {
    // 0. Уничтожить предыдущий PlanckWorld — избежать утечки физических тел
    if (this._prevPlanckWorld) {
      this._prevPlanckWorld.destroy();
      this._prevPlanckWorld = null;
    }

    // Этап 6: тайлы рендерятся через Regl TileLayer (атлас + SpriteBatcher)
    const tileResult = buildAllTileTextures(map, this.store.roofSnow);
    this.wallCache = tileResult.wallCache;
    this.houseCache = tileResult.houseCache;

    // Передаём данные карты в TileLayer (ground + стены/дома → GPU-атлас)
    if (this.tileLayer) {
      this.tileLayer.setMap({
        groundCanvas: tileResult.groundCanvas,
        walls: tileResult.wallCanvases.map((w) => ({
          canvas: w.canvas,
          x: w.x,
          y: w.y,
          zIndex: w.zIndex,
        })),
      });
    }

    // Создаём ECS Map Loader (используется общий ECS-мир движка)
    const newPlanckWorld = new PlanckWorld();
    this.ecsMapLoader = new EcsMapLoader({
      world: this.ecsWorld,
      planckWorld: newPlanckWorld,
      openedChests: this.store.openedChests,
      takenPedestals: this.store.takenPedestals,
      visitedShrines: this.store.visitedShrines,
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

    const result = this.ecsMapLoader.loadMap(null, playerDomain, onPlayerCreated);
    this._mmBase = buildMinimapBase(map);
    return result;
  }

  /** Уничтожить кэши текстур */
  destroy(): void {
    this.wallCache.destroy();
    this.houseCache.destroy();
  }
}
