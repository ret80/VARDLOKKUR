/* ecs-map-loader.ts — загрузка сущностей карты в ECS
   Этап 6: удалена зависимость от PixiJS (Graphics).
   Все spawn-методы больше не создают Graphics-заглушки —
   графика рендерится через ECS batchers.
*/

import { type World, query, removeEntity } from 'bitecs';
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
import { logger } from '../debug/logger';
import {
  Shrine,
  PhysicsBodyRegistry,
  EnemyAIRegistry,
  Chest,
  resetAllComponents,
} from './ecs-components';

// ============================================================
// Конфигурация Map Loader
// ============================================================

export interface EcsMapLoaderConfig {
  world: World;
  planckWorld: PlanckWorld;
  /** @deprecated — Этап 6: dynamicContainer больше не используется (графика через ECS batchers) */
  dynamicContainer?: unknown;
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
  bus?: import('../event-bus').EventBus;
  /** Фабрика чистых ECS-сущностей (без графики/физики) */
  entityFactory: EntityFactory;
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
    _playerG: unknown,
    playerDomain: any,
    onPlayerCreated?: (eid: number) => void
  ): { playerEid: number; playerBody: any; cam: { x: number; y: number } } {
    const { world, planckWorld, map, spawn, viewW, viewH, flags } = this.config;

    // TEARDOWN: корректно уничтожить физические тела старого мира
    teardownWorld(world, planckWorld);

    // Очистить старый мир (ECS сущности + SoA массивы)
    this.clearWorld(world);

    // Сбросить ссылку на barrierBody — новое тело создастся при spawnOverworldObjects
    this.barrierBody = null;

    // Создать тайловые коллайдеры
    this.createTileBodies(map, planckWorld);

    // Создать игрока (графика удалена — ECS renderers handle visuals)
    this.playerEid = this.createPlayer(world, spawn, planckWorld);

    // Вызвать callback после создания игрока
    logger.debug('map-loader', `playerEid=${this.playerEid} onPlayerCreated=${!!onPlayerCreated}`);
    if (onPlayerCreated) onPlayerCreated(this.playerEid);

    // Камера
    const cam = {
      x: clamp(spawn.x - viewW / 2, 0, Math.max(0, map.W * T - viewW)),
      y: clamp(spawn.y - viewH / 2, 0, Math.max(0, map.H * T - viewH)),
    };

    // Спавн всех сущностей (графика удалена — ECS renderers handle visuals)
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

    return { playerEid: this.playerEid, playerBody: null, cam };
  }

  private clearWorld(world: World): void {
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

    // Очистить другие реестры
    EnemyAIRegistry.length = 0;
    PhysicsBodyRegistry.length = 0;

    logger.debug('map-loader', `cleared ${eids.length} entities`);
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
    world: World, spawn: Vec, planckWorld: PlanckWorld
  ): number {
    const factory = this.config.entityFactory;
    // Создаём ECS сущность игрока (графика удалена на Этапе 6)
    const eid = createPlayerInEcs(factory, world, spawn.x, spawn.y, planckWorld,
      Cat.Player, Cat.Player | Cat.Ground | Cat.Enemy | Cat.Projectile);
    return eid;
  }

  private spawnEnemies(world: World, map: WorldData, planckWorld: PlanckWorld): void {
    const factory = this.config.entityFactory;
    for (const s of map.spawns) {
      const category = getEnemyCategory(s.kind);
      const mask = getEnemyMask(s.kind);
      createEnemyInEcs(factory, world, s.kind, s.x, s.y, planckWorld, category, mask);
    }
  }

  private spawnChests(world: World, map: WorldData): void {
    const factory = this.config.entityFactory;
    logger.debug('map-loader', `spawnChests chests=${map.chests.length}`);
    const { openedChests } = this.config;
    for (const c of map.chests) {
      const eid = createChestInEcs(factory, world, c.x * T + 8, c.y * T + 8, c.item);
      // Восстановить состояние opened из store.openedChests
      if (openedChests.has(`${c.x}_${c.y}`)) {
        Chest.opened[eid] = 1;
      }
    }
    if (!map.isDungeon && this.config.flags.secretKnown) {
      const eid = createChestInEcs(factory, world, map.stashSpot.x * T + 8, map.stashSpot.y * T + 8, "heartPiece");
      if (openedChests.has(`${map.stashSpot.x}_${map.stashSpot.y}`)) {
        Chest.opened[eid] = 1;
      }
    }
  }

  private spawnPedestals(world: World, map: WorldData): void {
    const factory = this.config.entityFactory;
    const { takenPedestals } = this.config;
    for (const pd of map.pedestals) {
      const id = "ped_" + pd.x + "_" + pd.y;
      const px = pd.x * T + 8;
      const py = pd.y * T + 8;
      const eid = createPedestalInEcs(factory, world, id, px, py, takenPedestals.has(id) ? 0 : pd.guards.length);
      // Статическое тело для коллизии — через него нельзя пройти
      this.planckWorld.createStaticBody(px, py, 6, Cat.Pedestal);
    }
  }

  private spawnShrines(world: World, map: WorldData): void {
    const factory = this.config.entityFactory;
    logger.debug('map-loader', `spawnShrines shrines=${map.shrines.length}`);
    for (let j = 0; j < map.shrines.length; j++) {
      const s = map.shrines[j];
      const sx = s.x * T + 8;
      const sy = s.y * T + 8;
      const eid = createShrineInEcs(factory, world, sx, sy);
      // Восстановить состояние lit из visitedShrines
      if (this.config.visitedShrines.has(j)) {
        Shrine.lit[eid] = 1;
      }
      // Статическое тело для коллизии — через него нельзя пройти
      this.planckWorld.createStaticBody(sx, sy, 6, Cat.Shrine);
    }
  }

  private spawnNpcs(world: World, map: WorldData): void {
    const factory = this.config.entityFactory;
    logger.debug('map-loader', `spawnNpcs npcs=${map.npcs.length} souls=${map.souls?.length ?? 0}`);
    for (const n of map.npcs) {
      createNpcInEcs(factory, world, n.id, n.name, n.x * T + 8, n.y * T + 8);
    }
    if (!map.isDungeon) {
      for (const s of map.souls) {
        createNpcInEcs(factory, world, `soul${map.souls.indexOf(s)}`, "Потерянная душа", s.x * T + 8, s.y * T + 8);
      }
    }
  }

  private spawnDungeonDoors(world: World, map: WorldData, planckWorld: PlanckWorld): void {
    const factory = this.config.entityFactory;
    for (const d of map.doors) {
      createDoorInEcs(factory, world, d.x, d.y, true);
      planckWorld.createKinematicBody(d.x, d.y, 18, 16, Cat.Door);
    }
  }

  private spawnOverworldObjects(world: World, map: WorldData, planckWorld: PlanckWorld): void {
    const factory = this.config.entityFactory;
    const { flags } = this.config;
    // Создаём barrier только если noBarrier не установлен
    if (!map.noBarrier) {
      const bx = map.treeAltar.x * T + 8;
      const by = (map.treeAltar.y + 5) * T + 8;
      const active = flags.runes < 5 && !flags.snakeStarted;
      const barrierEid = createBarrierInEcs(factory, world, bx, by, active);
      if (active) this.barrierBody = planckWorld.createKinematicBody(bx, by, 40, 16, Cat.Barrier);
    }

    const ax = map.treeAltar.x * T + 8;
    const ay = map.treeAltar.y * T + 8;
    createAltarInEcs(factory, world, ax, ay);
    // Статическое тело для коллизии — через алтарь нельзя пройти
    this.planckWorld.createStaticBody(ax, ay, 8, Cat.Altar);
  }

  private spawnDrops(world: World, map: WorldData): void {
    const factory = this.config.entityFactory;
    for (const sd of this.config.savedDrops) {
      createDropInEcs(factory, world, sd.kind as DropKind, sd.x, sd.y);
    }
    for (const ambient of map.ambient) {
      const kind = ambient.kind === 'shard' ? 'shard' : 'bones';
      createDropInEcs(factory, world, kind as DropKind, ambient.x * T + 8, ambient.y * T + 8);
    }
  }
}
