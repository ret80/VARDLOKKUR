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
  Time,
  RenderLayer,
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
  Player[eid] = {
    moving: false, animT: 0, swingT: 0, hurtT: 0, slowT: 0,
    hasSword: false, runes: 0, swingDirX: 0, swingDirY: 1, aiming: false,
  };
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
    Enemy[eid] = {
      kind, radius: stats.r, facingX: 1, facingY: 0, t: 0, state: 'idle', aggro: false,
      hidden: kind === 'crawler', lungeT: 0, freezeT: 0, flashT: 0,
      seed: 0, speed: stats.speed, dmg: stats.dmg, stateT: 0,
      pathI: 0, repathT: 0.5, contactCd: 0, guardOf: -1,
      fade: kind === 'ghost' ? 0 : 1, dropDew: false,
    };
    EnemyAI[eid] = { path: null };
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
  Projectile[eid] = { kind: 'arrow', dmg: 1, life: 3, dist: 0, returning: false, spin: 0 };
}

/** Создать префаб дропа */
export function createDropPrefabs(world: World): void {
  const eid = addEntity(world);
  addComponents(world, eid, Position, Radius, Drop, Time, RenderLayer);
  Radius.value[eid] = 3;
  Time.value[eid] = 0;
  RenderLayer.value[eid] = 40;
  Drop[eid] = { kind: 'heart', t: 0, magnet: false };
}

/** Создать префабы NPC */
export function createNPCPrefabs(world: World): void {
  const eid = addEntity(world);
  addComponents(world, eid, Position, Radius, NPC, Sprite, RenderLayer);
  Radius.value[eid] = 5;
  RenderLayer.value[eid] = 30;
  NPC[eid] = { id: 'default', name: '' };
}

/** Создать префаб сундука */
export function createChestPrefabs(world: World): void {
  const eid = addEntity(world);
  addComponents(world, eid, Position, Radius, Chest, Sprite, RenderLayer);
  Radius.value[eid] = 6;
  RenderLayer.value[eid] = 20;
  Chest[eid] = { item: 'arrows', opened: false };
}

/** Создать префаб пьедестала */
export function createPedestalPrefabs(world: World): void {
  const eid = addEntity(world);
  addComponents(world, eid, Position, Radius, Pedestal, Sprite, RenderLayer);
  Radius.value[eid] = 6;
  RenderLayer.value[eid] = 10;
  Pedestal[eid] = { id: 'default', taken: false, guardsLeft: 3, guardsSpawned: false };
}

/** Создать префаб святилища */
export function createShrinePrefabs(world: World): void {
  const eid = addEntity(world);
  addComponents(world, eid, Position, Radius, Shrine, Sprite, RenderLayer);
  Radius.value[eid] = 6;
  RenderLayer.value[eid] = 10;
  Shrine[eid] = { lit: false };
}

/** Создать префаб двери */
export function createDoorPrefabs(world: World): void {
  const eid = addEntity(world);
  addComponents(world, eid, Position, Radius, Door, Sprite, RenderLayer);
  Radius.value[eid] = 6;
  RenderLayer.value[eid] = 15;
  Door[eid] = { open: 0, locked: false };
}

/** Создать префаб барьера */
export function createBarrierPrefabs(world: World): void {
  const eid = addEntity(world);
  addComponents(world, eid, Position, Radius, Barrier, Sprite, RenderLayer);
  Radius.value[eid] = 8;
  RenderLayer.value[eid] = 10;
  Barrier[eid] = { active: true };
}

/** Создать префаб алтаря */
export function createAltarPrefabs(world: World): void {
  const eid = addEntity(world);
  addComponents(world, eid, Position, Radius, Altar, Sprite, RenderLayer);
  Radius.value[eid] = 8;
  RenderLayer.value[eid] = 10;
  Altar[eid] = { runes: 0 };
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
