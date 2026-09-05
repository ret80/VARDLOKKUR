/* map-loader-service.ts – Загрузка карт (тайлы, ECS сущности, миникарта) */

import { Sprite, Texture } from "pixi.js";
import type { WorldData, Vec } from "../world";
import type { GameStore } from "../store";
import type { EventBus } from "../event-bus";
import type { World } from "bitecs";
import type { PlanckWorld } from "../physics/planck-world";
import type { EcsMapLoader } from "../ecs/ecs-map-loader";
import type { SceneManager } from "./scene-manager";
import type { ViewportController } from "./viewport-controller";
import type { PlayerDomain } from "../store/player-domain";
import type { FloatText } from "../models";
import {
  buildAllTileTextures,
  WallTextureCache,
  HouseTextureCache,
} from "../tiles";
import { buildMinimapBase } from "../map-display";

export interface MapLoaderCallbacks {
  /** Создать ECS мир */
  createEcsWorld: () => World;
  /** Инициализировать префабы */
  initPrefabs: (world: World) => void;
  /** Создать EcsMapLoader */
  createEcsMapLoader: (params: MapLoaderParams) => EcsMapLoader;
  /** Обновить game loop при смене карты */
  updateGameLoop: (params: Partial<GameLoopUpdateParams>) => void;
  /** Уведомление */
  toast: (msg: string) => void;
}

export interface MapLoaderParams {
  world: World;
  planckWorld: PlanckWorld;
  dynamicContainer: any;
  openedChests: Set<string>;
  takenPedestals: Set<string>;
  visitedShrines: Set<number>;
  flags: {
    secretKnown: boolean;
    shrineIdx: number;
    runes: number;
    snakeStarted: boolean;
    hasKey: boolean;
  };
  map: WorldData;
  spawn: Vec;
  viewW: number;
  viewH: number;
  savedDrops: Array<{ kind: string; x: number; y: number; life: number; ambientIdx?: number }>;
  toast: (msg: string) => void;
}

export interface GameLoopUpdateParams {
  world: World;
  bus: EventBus;
  store: GameStore;
  planckWorld: PlanckWorld;
  app: any;
  dynamic: any;
  floatLayer: any;
  gameWorld: any;
  fx: any;
  input: any;
  state: any;
  cam: { x: number; y: number };
  viewW: number;
  viewH: number;
  map: WorldData;
  ow: WorldData;
  flags: any;
  talkedSig: Map<string, string>;
  dialogueActive: boolean;
  stepT: number;
  realT: number;
  playerEid: number;
  playerDomain: PlayerDomain;
  hud: any;
  quests: any;
  dialogue: any;
  dungeonBossDead: (id: number) => boolean;
  toast: (msg: string) => void;
  float: (x: number, y: number, text: string, color: number) => void;
  pushHud: (force?: boolean) => void;
  startDialogue: (id: string) => void;
  npcSig: (id: string) => string;
  onStepAudio: () => void;
  stepTRef: number;
  realTRef: number;
  guardSpawn: (kind: string, x: number, y: number, idx: number) => void;
}

export interface MapLoadResult {
  playerBody: any;
  playerEid: number;
}

export class MapLoaderService {
  private wallCache = new WallTextureCache();
  private houseCache = new HouseTextureCache();
  private ecsMapLoader: EcsMapLoader | null = null;
  private mmBase: ImageData | null = null;

  constructor(
    private scene: SceneManager,
    private store: GameStore,
    private viewport: ViewportController,
    private cbs: MapLoaderCallbacks
  ) {}

  get wallCacheInstance(): WallTextureCache { return this.wallCache; }
  get houseCacheInstance(): HouseTextureCache { return this.houseCache; }
  get mmBase(): ImageData | null { return this.mmBase; }

  /** Загрузить карту (тайлы + позиция игрока) */
  loadMap(map: WorldData, spawn: Vec, playerDomain: PlayerDomain): void {
    this.store.setMap(map);

    const p = this.store.player;
    p.x = spawn.x;
    p.y = spawn.y;
    playerDomain.setPosition(spawn.x, spawn.y);
    playerDomain.setVelocity(0, 0);
    playerDomain.resetTimers();
    p.hp = Math.min(p.hp, p.maxHp);

    this.viewport.clampCamera(
      map.W * 16, map.H * 16,
      spawn.x, spawn.y
    );
  }

  /** ECS загрузка карты (тайлы + ECS сущности) */
  async loadMapEcs(
    map: WorldData,
    spawn: Vec,
    playerDomain: PlayerDomain,
    savedDrops: Array<{ kind: string; x: number; y: number; life: number; ambientIdx?: number }>
  ): Promise<MapLoadResult> {
    // Предварительная загрузка (тайлы, позиция)
    this.loadMap(map, spawn, playerDomain);

    // Строим текстуры — ground как фон, стены/дома в tileLayer
    const tileResult = buildAllTileTextures(map, this.store.roofSnow);

    // Ground texture — фон мира
    const groundSprite = new Sprite(tileResult.groundTexture);
    groundSprite.position.set(0, 0);
    groundSprite.zIndex = 0;
    this.scene.tileLayer.addChildAt(groundSprite, 0);

    tileResult.wallSprites.forEach(ws => this.scene.tileLayer.addChild(ws));
    tileResult.houseSprites.forEach(hs => this.scene.tileLayer.addChild(hs.spr));
    this.wallCache = tileResult.wallCache;
    this.houseCache = tileResult.houseCache;

    // Создаём ECS Map Loader
    this.ecsMapLoader = this.cbs.createEcsMapLoader({
      world: this.cbs.createEcsWorld(),
      planckWorld: new (require('../physics/planck-world').PlanckWorld)(),
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
      toast: this.cbs.toast,
    });

    const result = this.ecsMapLoader.loadMap(
      {} as any, // playerG — используется только для позиции в оригинальном коде
      playerDomain
    );

    // Построить mmBase для minimap и big map
    this.mmBase = buildMinimapBase(map);

    return result;
  }

  /** Установить PlanckWorld в game loop */
  setPlanckWorld(planckWorld: PlanckWorld): void {
    if (this.ecsMapLoader) {
      this.ecsMapLoader.setPlanckWorld(planckWorld);
    }
  }

  /** Установить playerEid в game loop */
  setPlayerEid(playerEid: number): void {
    // Передано через updateGameLoop
  }

  /** Очистить тайловые текстуры */
  clearTiles(): void {
    this.scene.clearTiles();
  }

  /** Уничтожить кэши текстур */
  destroy(): void {
    this.wallCache.destroy();
    this.houseCache.destroy();
  }
}
