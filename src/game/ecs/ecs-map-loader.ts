/* ecs-map-loader.ts — загрузка сущностей карты в ECS */

import { type World, query, removeEntity, addEntity, addComponent } from 'bitecs';
import { Cat, getEnemyCategory, getEnemyMask } from '../physics/planck-world';
import { T, WorldData, Vec, solidTileAt } from '../world';
import { clamp } from '../utils';
import type { PlanckWorld } from '../physics/planck-world';
import type { DropKind } from '../generators/types';
import {
  createEnemyInEcs,
  createNpcInEcs,
  createChestInEcs,
  createPedestalInEcs,
  createShrineInEcs,
  createDoorInEcs,
  createBarrierInEcs,
  createAltarInEcs,
  createDropInEcs,
  createPlayerInEcs,
  teardownWorld,
} from './ecs-bridge';
import type { EntityFactory } from './entity-factory';
import { EventBus } from '../event-bus';
import { logger } from '../debug/logger';
import {
  Shrine,
  Sprite,
  SpriteRegistry,
  PhysicsBodyRegistry,
  EnemyAIRegistry,
  Chest,
  MapState,
  resetAllComponents,
} from './ecs-components';
import type { IRenderer, LayerHandle } from '../renderer/IRenderer';
import { createMapBatches, destroyMapBatches } from '../render/map-render-system';

// ============================================================
// Конфигурация Map Loader
// ============================================================

/**
 * Фабрика графических объектов для ECS-сущностей.
 * Фаза 7 (Регрессия): возвращает GraphicsHandle (number), сущности создаются через IRenderer.
 */
export interface SpriteFactory {
  /** Создать GraphicsHandle для сущности с позицией */
  create(x: number, y: number): number;
}

export interface EcsMapLoaderConfig {
  world: World;
  planckWorld: PlanckWorld;
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
  savedDrops: { kind: string; x: number; y: number; life?: number; ambientIdx?: number }[];
  toast: (msg: string) => void;
  bus?: EventBus;
  /** Фабрика чистых ECS-сущностей (без графики/физики) */
  entityFactory: EntityFactory;
  /** Фабрика графических объектов (возвращает GraphicsHandle) */
  spriteFactory: SpriteFactory;
  /** IRenderer для создания статичных батчей карты (земля/стены/дома) */
  renderer?: IRenderer;
  /** Handle слоя tiles (для ground-батча) */
  tileLayer?: LayerHandle;
  /** Handle слоя dynamic (для стен/домов) */
  dynamicLayer?: LayerHandle;
  /** Снег на крышах домов */
  roofSnow?: boolean;
}

// ============================================================
// ECS Map Loader
// ============================================================

export class EcsMapLoader {
  private config: EcsMapLoaderConfig;
  private playerEid: number = -1;
  private barrierBody: any = null;

  constructor(config: EcsMapLoaderConfig) {
    this.config = config;
  }

  get planckWorld(): PlanckWorld { return this.config.planckWorld; }
  get entityFactory(): EntityFactory { return this.config.entityFactory; }
  get playerEidValue(): number { return this.playerEid; }

  /** Загрузить карту в ECS */
  loadMap(
    playerG: number,
    playerDomain: any,
    onPlayerCreated?: (eid: number) => void
  ): { playerEid: number; playerBody: any; cam: { x: number; y: number } } {
    const { world, planckWorld, map, spawn, viewW, viewH, flags } = this.config;

    logger.info('map-loader', `=== MAP INFO: W=${map.W}, H=${map.H}, isDungeon=${map.isDungeon}, spawn=${JSON.stringify(spawn)} ===`);
    logger.info('map-loader', `=== MAP SIZE in pixels: ${(map.W * 16)}x${(map.H * 16)}, VIEW: ${viewW}x${viewH} ===`);

    // 1. Сохранить playerG перед очисткой
    const savedPlayerG = playerG;

    // 1-0. TEARDOWN: корректно уничтожить спрайты и физические тела старого мира
    teardownWorld(world, planckWorld, savedPlayerG);

    // 1-1. Очистить старый мир (ECS сущности + SoA массивы)
    this.clearWorld(world, savedPlayerG);

    // 1-2. Сбросить ссылку на barrierBody
    this.barrierBody = null;

    // 2. Создать тайловые коллайдеры
    this.createTileBodies(map, planckWorld);

    // 3. Создать игрока
    this.playerEid = this.createPlayer(world, spawn, playerG, planckWorld);
    // playerG уже добавлен в IRenderer layer через spriteFactory

    // 4. Вызвать callback после создания игрока — SpriteRegistry уже заполнен
    logger.debug('map-loader', `playerEid=${this.playerEid} onPlayerCreated=${!!onPlayerCreated}`);
    if (onPlayerCreated) onPlayerCreated(this.playerEid);

    // 5. Камера
    const cam = {
      x: clamp(spawn.x - viewW / 2, 0, Math.max(0, map.W * T - viewW)),
      y: clamp(spawn.y - viewH / 2, 0, Math.max(0, map.H * T - viewH)),
    };

    // 5-11. Спавн всех сущностей (все уже в IRenderer layer)
    this.spawnEnemies(world, map, planckWorld);
    this.spawnChests(world, map);
    this.spawnPedestals(world, map);
    this.spawnShrines(world, map);
    this.spawnNpcs(world, map);
    if (map.isDungeon) {
      this.spawnDungeonDoors(world, map, planckWorld);
    } else {
      this.spawnOverworldObjects(world, map, planckWorld);
    }
    this.spawnDrops(world, map);

    // 12. ECS-рефакторинг рендеринга: создать синглтон-сущность карты
    //     с компонентом MapState (GraphicsHandle статичных батчей).
    //     Процедурная генерация геометрии происходит ОДИН раз здесь;
    //     регистрация батчей в RenderQueue — задача mapRenderSystem (каждый кадр).
    this.createMapEntity(world, map);

    return { playerEid: this.playerEid, playerBody: null, cam };
  }

  /**
   * Создать синглтон-сущность карты: один раз сгенерировать Graphics-батчи
   * (земля / стены / дома) и сохранить их хэндлы и размеры в компоненте MapState.
   */
  private createMapEntity(world: World, map: WorldData): void {
    const renderer = this.config.renderer;
    if (!renderer) {
      logger.warn('map-loader', 'createMapEntity: renderer not provided, map batches skipped');
      return;
    }

    // Генерация батчей — ОДИН раз при загрузке карты
    const batches = createMapBatches(map, renderer, {
      tileLayer: this.config.tileLayer,
      dynamicLayer: this.config.dynamicLayer,
      roofSnow: this.config.roofSnow ?? false,
    });

    // Синглтон-сущность с компонентом MapState
    const eid = addEntity(world);
    addComponent(world, eid, MapState);
    MapState.groundHandle[eid] = batches.groundHandle;
    MapState.wallsHandle[eid] = batches.wallsHandle;
    MapState.housesHandle[eid] = batches.housesHandle;
    MapState.width[eid] = map.W;
    MapState.height[eid] = map.H;
    MapState.dungeonId[eid] = map.dungeonId ?? 0;

    logger.debug('map-loader', `Map entity created: eid=${eid}, ${map.W}x${map.H}, dungeonId=${map.dungeonId ?? 0}`);
  }

  private clearWorld(world: World, preservePlayerSprite?: number): void {
    const registryBefore = SpriteRegistry.length;

    // Удалить ВСЕ сущности из ECS мира
    const eids: number[] = [];
    for (const eid of query(world, [])) {
      eids.push(eid);
    }
    for (const eid of eids) {
      removeEntity(world, eid);
    }

    // Сбросить все SoA массивы компонентов
    resetAllComponents();

    // Очистить SpriteRegistry — но не уничтожать playerG
    const playerG = preservePlayerSprite;
    let playerFound = false;
    for (const s of [...SpriteRegistry]) {
      if (s === playerG) {
        playerFound = true;
      } else {
        // GraphicsHandle — уничтожаем через IRenderer (но здесь мы не имеем доступа к renderer)
        // Поэтому просто очищаем массив
      }
    }
    SpriteRegistry.length = 0;

    // Спрайт игрока — это GraphicsHandle (number), push как есть
    if (playerG) {
      SpriteRegistry.push(playerG);
    }

    // Очистить другие реестры
    EnemyAIRegistry.length = 0;
    PhysicsBodyRegistry.length = 0;

    logger.debug('map-loader', `cleared ${eids.length} entities, sprites: ${registryBefore} -> ${SpriteRegistry.length}`);
  }

  private createTileBodies(map: WorldData, planckWorld: PlanckWorld): void {
    const r = T / 2;
    for (let ty = 0; ty < map.H; ty++) {
      for (let tx = 0; tx < map.W; tx++) {
        if (!solidTileAt(map, tx, ty)) continue;
        const px = tx * T + T / 2;
        const py = ty * T + T / 2;
        planckWorld.createTileBody(px, py, r);
      }
    }
  }

  private createPlayer(
    world: World, spawn: Vec, playerG: number, planckWorld: PlanckWorld
  ): number {
    const factory = this.config.entityFactory;
    // Создаём ECS сущность игрока (playerG — GraphicsHandle)
    const eid = createPlayerInEcs(factory, world, spawn.x, spawn.y, playerG, planckWorld,
      Cat.Player, Cat.Player | Cat.Ground | Cat.Enemy | Cat.Projectile);
    return eid;
  }

  private spawnEnemies(world: World, map: WorldData, planckWorld: PlanckWorld): void {
    const factory = this.config.entityFactory;
    const sf = this.config.spriteFactory;
    for (const s of map.spawns) {
      const g = sf.create(s.x, s.y);
      const category = getEnemyCategory(s.kind);
      const mask = getEnemyMask(s.kind);
      const eid = createEnemyInEcs(factory, world, s.kind, s.x, s.y, g, planckWorld, category, mask);
      // g уже в IRenderer layer через spriteFactory
    }
  }

  private spawnChests(world: World, map: WorldData): void {
    const factory = this.config.entityFactory;
    const sf = this.config.spriteFactory;
    logger.debug('map-loader', `spawnChests chests=${map.chests.length}`);
    const { openedChests } = this.config;
    for (const c of map.chests) {
      const cx = c.x * T + 8;
      const cy = c.y * T + 8;
      logger.info('map-loader', `  Chest at tile(${c.x},${c.y}) -> pixel(${cx},${cy})`);
      const g = sf.create(cx, cy);
      const eid = createChestInEcs(factory, world, cx, cy, c.item, g);
      // Восстановить состояние opened из store.openedChests
      if (openedChests.has(`${c.x}_${c.y}`)) {
        Chest.opened[eid] = 1;
      }
    }
    if (!map.isDungeon && this.config.flags.secretKnown) {
      const g = sf.create(map.stashSpot.x * T + 8, map.stashSpot.y * T + 8);
      const eid = createChestInEcs(factory, world, map.stashSpot.x * T + 8, map.stashSpot.y * T + 8, "heartPiece", g);
      if (openedChests.has(`${map.stashSpot.x}_${map.stashSpot.y}`)) {
        Chest.opened[eid] = 1;
      }
    }
  }

  private spawnPedestals(world: World, map: WorldData): void {
    const factory = this.config.entityFactory;
    const sf = this.config.spriteFactory;
    const { takenPedestals } = this.config;
    for (const pd of map.pedestals) {
      const id = "ped_" + pd.x + "_" + pd.y;
      const px = pd.x * T + 8;
      const py = pd.y * T + 8;
      const g = sf.create(px, py);
      const eid = createPedestalInEcs(factory, world, id, px, py, takenPedestals.has(id) ? 0 : pd.guards.length, g);
      // Статическое тело для коллизии
      this.planckWorld.createStaticBody(px, py, 6, Cat.Pedestal);
    }
  }

  private spawnShrines(world: World, map: WorldData): void {
    const factory = this.config.entityFactory;
    const sf = this.config.spriteFactory;
    logger.debug('map-loader', `spawnShrines shrines=${map.shrines.length}`);
    for (let j = 0; j < map.shrines.length; j++) {
      const s = map.shrines[j];
      const sx = s.x * T + 8;
      const sy = s.y * T + 8;
      const g = sf.create(sx, sy);
      const eid = createShrineInEcs(factory, world, sx, sy, g);
      if (this.config.visitedShrines.has(j)) {
        Shrine.lit[eid] = 1;
      }
      // Статическое тело для коллизии
      this.planckWorld.createStaticBody(sx, sy, 6, Cat.Shrine);
    }
  }

  private spawnNpcs(world: World, map: WorldData): void {
    const factory = this.config.entityFactory;
    const sf = this.config.spriteFactory;
    logger.debug('map-loader', `spawnNpcs npcs=${map.npcs.length} souls=${map.souls?.length ?? 0}`);
    for (const n of map.npcs) {
      const g = sf.create(n.x * T + 8, n.y * T + 8);
      const eid = createNpcInEcs(factory, world, n.id, n.name, n.x * T + 8, n.y * T + 8, g);
    }
    if (!map.isDungeon) {
      for (const s of map.souls) {
        const g = sf.create(s.x * T + 8, s.y * T + 8);
        const eid = createNpcInEcs(factory, world, `soul${map.souls.indexOf(s)}`, "Потерянная душа", s.x * T + 8, s.y * T + 8, g);
      }
    }
  }

  private spawnDungeonDoors(world: World, map: WorldData, planckWorld: PlanckWorld): void {
    const factory = this.config.entityFactory;
    const sf = this.config.spriteFactory;
    for (const d of map.doors) {
      const g = sf.create(d.x, d.y);
      const eid = createDoorInEcs(factory, world, d.x, d.y, true, g);
      planckWorld.createKinematicBody(d.x, d.y, 18, 16, Cat.Door);
    }
  }

  private spawnOverworldObjects(world: World, map: WorldData, planckWorld: PlanckWorld): void {
    const factory = this.config.entityFactory;
    const sf = this.config.spriteFactory;
    const { flags } = this.config;
    if (!map.noBarrier) {
      const bx = map.treeAltar.x * T + 8;
      const by = (map.treeAltar.y + 5) * T + 8;
      const active = flags.runes < 5 && !flags.snakeStarted;
      const barrierG = sf.create(bx, by);
      const barrierEid = createBarrierInEcs(factory, world, bx, by, active, barrierG);
      if (active) this.barrierBody = planckWorld.createKinematicBody(bx, by, 40, 16, Cat.Barrier);
    }

    const ax = map.treeAltar.x * T + 8;
    const ay = map.treeAltar.y * T + 8;
    const altarG = sf.create(ax, ay);
    const altarEid = createAltarInEcs(factory, world, ax, ay, altarG);
    // Статическое тело для коллизии
    this.planckWorld.createStaticBody(ax, ay, 8, Cat.Altar);
  }

  private spawnDrops(world: World, map: WorldData): void {
    const factory = this.config.entityFactory;
    const sf = this.config.spriteFactory;
    for (const sd of this.config.savedDrops) {
      const g = sf.create(sd.x, sd.y);
      const eid = createDropInEcs(factory, world, sd.kind as DropKind, sd.x, sd.y, g);
    }
    for (const ambient of map.ambient) {
      const g = sf.create(ambient.x * T + 8, ambient.y * T + 8);
      const kind = ambient.kind === 'shard' ? 'shard' : 'bones';
      const eid = createDropInEcs(factory, world, kind as DropKind, ambient.x * T + 8, ambient.y * T + 8, g);
    }
  }
}
