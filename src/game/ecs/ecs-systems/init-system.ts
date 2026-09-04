/* init-system.ts — инициализация ECS мира и префабов */

import {
  type World,
  addEntity,
  addComponent,
  addComponents,
} from 'bitecs';
import {
  Position,
  Velocity,
  Health,
  Radius,
  Direction,
  Player,
  Enemy,
  Projectile,
  Drop,
  NPC,
  Chest,
  Pedestal,
  Shrine,
  Door,
  Barrier,
  Altar,
  Sprite,
  PhysicsBody,
  EnemyAI,
  EnemyState,
  Time,
  RenderLayer,
  poolAdd,
  StringPool,
  SpriteRegistry,
  EnemyAIRegistry,
} from '../ecs-components';
import { ENEMY_STATS, type EnemyKind } from '../../entities';

// ============================================================
// Префабы (шаблоны сущностей)
// ============================================================

let _playerPrefab: number | null = null;
let _enemyPrefabs: Record<string, number> = {};

/** Создать префаб игрока */
export function createPlayerPrefab(world: World): number {
  const eid = addEntity(world);
  addComponents(world, eid, Position, Radius, Direction, Health, Player, RenderLayer);
  Position.x[eid] = 0;
  Position.y[eid] = 0;
  Radius.value[eid] = 5;
  Direction.x[eid] = 0;
  Direction.y[eid] = 1;
  Health.current[eid] = 12;
  Health.max[eid] = 12;
  RenderLayer.value[eid] = 100;
  // SoA поля Player
  Player.moving[eid] = 0;
  Player.animT[eid] = 0;
  Player.swingT[eid] = 0;
  Player.hurtT[eid] = 0;
  Player.slowT[eid] = 0;
  Player.hasSword[eid] = 0;
  Player.runes[eid] = 0;
  Player.swingDirX[eid] = 0;
  Player.swingDirY[eid] = 1;
  Player.aiming[eid] = 0;
  _playerPrefab = eid;
  return eid;
}

/** Создать префаб врага */
export function createEnemyPrefabs(world: World): Record<string, number> {
  const prefabs: Record<string, number> = {};
  for (const kind of Object.keys(ENEMY_STATS) as EnemyKind[]) {
    const stats = ENEMY_STATS[kind];
    const eid = addEntity(world);
    addComponents(world, eid, Position, Radius, Velocity, Health, Enemy, EnemyAI, RenderLayer);
    Position.x[eid] = 0;
    Position.y[eid] = 0;
    Radius.value[eid] = stats.r;
    Velocity.x[eid] = 0;
    Velocity.y[eid] = 0;
    Health.current[eid] = stats.hp;
    Health.max[eid] = stats.hp;
    RenderLayer.value[eid] = 50;
    // SoA поля Enemy
    Enemy.kind[eid] = poolAdd(StringPool.enemyKinds, kind);
    Enemy.radius[eid] = stats.r;
    Enemy.facingX[eid] = 1;
    Enemy.facingY[eid] = 0;
    Enemy.t[eid] = 0;
    Enemy.state[eid] = EnemyState.idle;
    Enemy.aggro[eid] = 0;
    Enemy.hidden[eid] = kind === 'crawler' ? 1 : 0;
    Enemy.lungeT[eid] = 0;
    Enemy.freezeT[eid] = 0;
    Enemy.flashT[eid] = 0;
    Enemy.seed[eid] = 0;
    Enemy.speed[eid] = stats.speed;
    Enemy.dmg[eid] = stats.dmg;
    Enemy.stateT[eid] = 0;
    Enemy.pathI[eid] = 0;
    Enemy.repathT[eid] = 0.5;
    Enemy.contactCd[eid] = 0;
    Enemy.guardOf[eid] = -1;
    Enemy.fade[eid] = kind === 'ghost' ? 0 : 1;
    Enemy.dropDew[eid] = 0;
    // EnemyAI
    EnemyAI.path[eid] = 0;
    EnemyAIRegistry[eid] = null;
    prefabs[kind] = eid;
  }
  _enemyPrefabs = prefabs;
  return prefabs;
}

/** Создать префабы снарядов */
export function createProjectilePrefabs(world: World): void {
  // Базовый префаб снаряда
  const eid = addEntity(world);
  addComponents(world, eid, Position, Radius, Velocity, Projectile, Time, RenderLayer);
  Radius.value[eid] = 3;
  Velocity.x[eid] = 0;
  Velocity.y[eid] = 0;
  Time.value[eid] = 0;
  RenderLayer.value[eid] = 60;
  // SoA поля Projectile
  Projectile.kind[eid] = poolAdd(StringPool.projectileKinds, 'arrow');
  Projectile.dmg[eid] = 1;
  Projectile.life[eid] = 3;
  Projectile.dist[eid] = 0;
  Projectile.returning[eid] = 0;
  Projectile.spin[eid] = 0;
}

/** Создать префаб дропа */
export function createDropPrefabs(world: World): void {
  const eid = addEntity(world);
  addComponents(world, eid, Position, Radius, Drop, Time, RenderLayer);
  Radius.value[eid] = 3;
  Time.value[eid] = 0;
  RenderLayer.value[eid] = 40;
  // SoA поля Drop
  Drop.kind[eid] = poolAdd(StringPool.dropKinds, 'heart');
  Drop.t[eid] = 0;
  Drop.magnet[eid] = 0;
  Drop.life[eid] = 0;
}

/** Создать префабы NPC */
export function createNPCPrefabs(world: World): void {
  const eid = addEntity(world);
  addComponents(world, eid, Position, Radius, NPC, Sprite, RenderLayer);
  Radius.value[eid] = 5;
  RenderLayer.value[eid] = 30;
  // SoA поля NPC
  NPC.id[eid] = poolAdd(StringPool.npcIds, 'default');
  NPC.name[eid] = poolAdd(StringPool.npcNames, '');
  // Sprite
  Sprite.ref[eid] = 0;
}

/** Создать префаб сундука */
export function createChestPrefabs(world: World): void {
  const eid = addEntity(world);
  addComponents(world, eid, Position, Radius, Chest, Sprite, RenderLayer);
  Radius.value[eid] = 6;
  RenderLayer.value[eid] = 20;
  // SoA поля Chest
  Chest.item[eid] = poolAdd(StringPool.chestItems, 'arrows');
  Chest.opened[eid] = 0;
  // Sprite
  Sprite.ref[eid] = 0;
}

/** Создать префаб пьедестала */
export function createPedestalPrefabs(world: World): void {
  const eid = addEntity(world);
  addComponents(world, eid, Position, Radius, Pedestal, Sprite, RenderLayer);
  Radius.value[eid] = 6;
  RenderLayer.value[eid] = 10;
  // SoA поля Pedestal
  Pedestal.id[eid] = poolAdd(StringPool.pedestalIds, 'default');
  Pedestal.taken[eid] = 0;
  Pedestal.guardsLeft[eid] = 3;
  Pedestal.guardsSpawned[eid] = 0;
  // Sprite
  Sprite.ref[eid] = 0;
}

/** Создать префаб святилища */
export function createShrinePrefabs(world: World): void {
  const eid = addEntity(world);
  addComponents(world, eid, Position, Radius, Shrine, Sprite, RenderLayer);
  Radius.value[eid] = 6;
  RenderLayer.value[eid] = 10;
  // SoA поля Shrine
  Shrine.lit[eid] = 0;
  // Sprite
  Sprite.ref[eid] = 0;
}

/** Создать префаб двери */
export function createDoorPrefabs(world: World): void {
  const eid = addEntity(world);
  addComponents(world, eid, Position, Radius, Door, Sprite, RenderLayer);
  Radius.value[eid] = 6;
  RenderLayer.value[eid] = 15;
  // SoA поля Door
  Door.open[eid] = 0;
  Door.locked[eid] = 0;
  // Sprite
  Sprite.ref[eid] = 0;
}

/** Создать префаб барьера */
export function createBarrierPrefabs(world: World): void {
  const eid = addEntity(world);
  addComponents(world, eid, Position, Radius, Barrier, Sprite, RenderLayer);
  Radius.value[eid] = 8;
  RenderLayer.value[eid] = 10;
  // SoA поля Barrier
  Barrier.active[eid] = 1;
  // Sprite
  Sprite.ref[eid] = 0;
}

/** Создать префаб алтаря */
export function createAltarPrefabs(world: World): void {
  const eid = addEntity(world);
  addComponents(world, eid, Position, Radius, Altar, Sprite, RenderLayer);
  Radius.value[eid] = 8;
  RenderLayer.value[eid] = 10;
  // SoA поля Altar
  Altar.runes[eid] = 0;
  // Sprite
  Sprite.ref[eid] = 0;
}

// ============================================================
// Публичный API
// ============================================================

/** Инициализировать все префабы в мире */
export function initPrefabs(world: World): void {
  createPlayerPrefab(world);
  createEnemyPrefabs(world);
  createProjectilePrefabs(world);
  createDropPrefabs(world);
  createNPCPrefabs(world);
  createChestPrefabs(world);
  createPedestalPrefabs(world);
  createShrinePrefabs(world);
  createDoorPrefabs(world);
  createBarrierPrefabs(world);
  createAltarPrefabs(world);
}

/** Получить префаб игрока */
export function getPlayerPrefab(): number | null {
  return _playerPrefab;
}

/** Получить префаб врага по типу */
export function getEnemyPrefab(kind: string): number | null {
  return _enemyPrefabs[kind] ?? null;
}
