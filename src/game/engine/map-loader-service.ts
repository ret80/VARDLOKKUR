/* map-loader-service.ts – Загрузка карт: тайлы, ECS-сущности, миникарта */

import { Sprite } from "pixi.js";
import { PlanckWorld } from "../physics/planck-world";
import type { WorldData, Vec } from "../world";
import type { GameStore } from "../store";
import type { World } from "bitecs";
import { EcsMapLoader } from "../ecs/ecs-map-loader";
import type { SceneManager } from "./scene-manager";
import type { ViewportController } from "./viewport-controller";
import type { PlayerDomain } from "../store/player-domain";
import {
  buildAllTileTextures,
  WallTextureCache,
  HouseTextureCache,
} from "../tiles";
import { buildMinimapBase } from "../map-display";

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

  constructor(
    private scene: SceneManager,
    private store: GameStore,
    private viewport: ViewportController,
    private ecsWorld: World
  ) {}

  get mmBase(): ImageData | null { return this._mmBase; }

  /** Очистить tileLayer и уничтожить все спрайты тайлов */
  clearTiles(): void {
    for (const child of [...this.scene.tileLayer.children]) {
      if (child instanceof Sprite) child.destroy({ texture: true });
    }
    this.scene.tileLayer.removeChildren();
  }

  /** ECS загрузка карты: тайлы + сущности + миникарта */
  loadMapEcs(
    map: WorldData,
    spawn: Vec,
    playerDomain: PlayerDomain,
    playerG: any,
    savedDrops: Array<{ kind: string; x: number; y: number; life: number; ambientIdx?: number }>,
    toast: (msg: string) => void
  ): LoadMapResult {
    // Строим текстуры — ground как фон, стены/дома в tileLayer
    const tileResult = buildAllTileTextures(map, this.store.roofSnow);

    const groundSprite = new Sprite(tileResult.groundTexture);
    groundSprite.position.set(0, 0);
    groundSprite.zIndex = 0;
    this.scene.tileLayer.addChildAt(groundSprite, 0);

    // Переносим дома, ёлки, камни, монументы в dynamic — сортируются по layer + bottomY
    for (const ws of tileResult.wallSprites) {
      (ws as any).userData = (ws as any).userData || {};
      (ws as any).userData.layer = 40;
      (ws as any).userData.y = ws.position.y + ws.height / 2;
      this.scene.dynamic.addChild(ws);
    }
    for (const hs of tileResult.houseSprites) {
      (hs.spr as any).userData = (hs.spr as any).userData || {};
      (hs.spr as any).userData.layer = 40;
      (hs.spr as any).userData.y = hs.spr.position.y + hs.spr.height / 2;
      this.scene.dynamic.addChild(hs.spr);
    }
    this.wallCache = tileResult.wallCache;
    this.houseCache = tileResult.houseCache;

    // Создаём ECS Map Loader (используется общий ECS-мир движка)
    this.ecsMapLoader = new EcsMapLoader({
      world: this.ecsWorld,
      planckWorld: new PlanckWorld(),
      dynamicContainer: this.scene.dynamic,
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
    });

    const result = this.ecsMapLoader.loadMap(playerG, playerDomain);
    this._mmBase = buildMinimapBase(map);
    return result;
  }

  /** Уничтожить кэши текстур */
  destroy(): void {
    this.wallCache.destroy();
    this.houseCache.destroy();
  }
}
