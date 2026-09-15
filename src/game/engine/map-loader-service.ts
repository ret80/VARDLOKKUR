/* map-loader-service.ts — Загрузка карт: тайлы, ECS-сущности, миникарта */

import { Sprite, Graphics } from "pixi.js";
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
  /** Фабрика графических объектов (без импорта Graphics из pixi.js) */
  private _spriteFactory: SpriteFactory;

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
    this._spriteFactory = spriteFactory ?? {
      create: (x: number, y: number) => {
        const g = new Graphics();
        g.position.set(x, y);
        return g;
      },
    };
  }

  /** Фабрика графических объектов */
  get spriteFactory(): SpriteFactory {
    return this._spriteFactory;
  }

  get mmBase(): ImageData | null { return this._mmBase; }

  /** Очистить tileLayer и dynamic контейнеры перед загрузкой новой карты */
  clearTiles(preservePlayerG?: Graphics): void {
    // Сохраняем playerG перед очисткой dynamic — он мог быть уничтожен clearDynamic()
    // без этого playerG.destroy() вызовется и playerG.position станет null
    this.scene.clearTiles();
    this.scene.clearDynamic(preservePlayerG);
  }

  /** ECS загрузка карты: тайлы + сущности + миникарта */
  loadMapEcs(
    map: WorldData,
    spawn: Vec,
    playerDomain: PlayerDomain,
    playerG: any,
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

    // Строим текстуры — ground как фон, стены/дома в tileLayer
    const tileResult = buildAllTileTextures(map, this.store.roofSnow);

    const groundSprite = new Sprite(tileResult.groundTexture);
    groundSprite.position.set(0, 0);
    groundSprite.zIndex = 0;
    this.scene.tileLayer.addChildAt(groundSprite, 0);

    // Переносим дома, ёлки, камни, монументы в dynamic — сортируются по layer + bottomY
    // sprite.height может быть 0 (Texture.from асинхронный), поэтому используем фиксированные высоты
    const WALL_H = 44;
    for (const ws of tileResult.wallSprites) {
      (ws as any).userData = (ws as any).userData || {};
      (ws as any).userData.layer = 40;
      // ws.position.y = Y - 20, значит Y = ws.position.y + 20
      // bottomY = Y + T/2 = ws.position.y + 20 + 8 = ws.position.y + 28
      (ws as any).userData.y = ws.position.y + 28;
      this.scene.dynamic.addChild(ws);
    }
    for (const hs of tileResult.houseSprites) {
      (hs.spr as any).userData = (hs.spr as any).userData || {};
      (hs.spr as any).userData.layer = 40;
      const m = houseMetrics(hs.hw, hs.hh);
      // bottomY = y*T + hh*T (нижняя точка дома)
      (hs.spr as any).userData.y = hs.spr.position.y + m.wallTop + m.wallH + m.foundH - 1;
      this.scene.dynamic.addChild(hs.spr);
    }
    this.wallCache = tileResult.wallCache;
    this.houseCache = tileResult.houseCache;

    // Создаём ECS Map Loader (используется общий ECS-мир движка)
    const newPlanckWorld = new PlanckWorld();
    this.ecsMapLoader = new EcsMapLoader({
      world: this.ecsWorld,
      planckWorld: newPlanckWorld,
      dynamicContainer: this.scene.dynamic,
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
