/* ecs-bridge.ts — мост между старым кодом и ECS

   Фабрика (EntityFactory) создаёт чистые ECS-сущности без графики и физики.
   Этот модуль координирует: вызов Фабрики → навешивание Sprite → навешивание PhysicsBody.
*/

import { type World } from 'bitecs';
import {
  Position,
  Sprite,
  SpriteRegistry,
  PhysicsBodyRegistry,
} from './ecs-components';
import { type EntityFactory } from './entity-factory';
import type { EnemyKind, DropKind, ProjectileKind } from '../generators/types';
import type { Graphics } from 'pixi.js';
import type { PlanckWorld } from '../physics/planck-world';
import type { Cat } from '../physics/planck-world';
import { createBodyForEntity } from './ecs-systems';
import { ENEMY_STATS } from '../entities';

// ============================================================
// ECS Entity Bridge — создаёт ECS сущности из данных карты
// ============================================================

/** Создать игрока в ECS */
export function createPlayerInEcs(
  factory: EntityFactory,
  world: World,
  x: number,
  y: number,
  spriteRef: Graphics,
  planckWorld: PlanckWorld,
  category: number,
  mask: number
): number {
  const eid = factory.createPlayer(x, y);
  addComponent(world, eid, Sprite);
  SpriteRegistry.push(spriteRef);
  Sprite.ref[eid] = SpriteRegistry.length;
  // Create physics body
  createBodyForEntity(planckWorld, world, eid, 5, category, mask);
  return eid;
}

/** Создать врага в ECS */
export function createEnemyInEcs(
  factory: EntityFactory,
  world: World,
  kind: EnemyKind,
  x: number,
  y: number,
  spriteRef: Graphics,
  planckWorld: PlanckWorld,
  category: number,
  mask: number
): number {
  const stats = ENEMY_STATS[kind];
  const eid = factory.createEnemy(kind, x, y, stats.hp, stats.r, stats.speed, stats.dmg);
  addComponent(world, eid, Sprite);
  SpriteRegistry.push(spriteRef);
  Sprite.ref[eid] = SpriteRegistry.length;
  // Create physics body
  createBodyForEntity(planckWorld, world, eid, stats.r, category, mask);
  return eid;
}

/** Создать NPC в ECS */
export function createNpcInEcs(
  factory: EntityFactory,
  world: World,
  id: string,
  name: string,
  x: number,
  y: number,
  spriteRef: Graphics
): number {
  const eid = factory.createStaticEntity(10);
  addNpcComponents(world, eid, id, name, x, y, spriteRef);
  return eid;
}

/** Создать сундук в ECS */
export function createChestInEcs(
  factory: EntityFactory,
  world: World,
  x: number,
  y: number,
  item: string,
  spriteRef: Graphics
): number {
  const eid = factory.createStaticEntity(20);
  addChestComponents(world, eid, item, x, y, spriteRef);
  return eid;
}

/** Создать пьедестал в ECS */
export function createPedestalInEcs(
  factory: EntityFactory,
  world: World,
  id: string,
  x: number,
  y: number,
  guardsLeft: number,
  spriteRef: Graphics
): number {
  const eid = factory.createStaticEntity(10);
  addPedestalComponents(world, eid, id, x, y, guardsLeft, spriteRef);
  return eid;
}

/** Создать святилище в ECS */
export function createShrineInEcs(
  factory: EntityFactory,
  world: World,
  x: number,
  y: number,
  spriteRef: Graphics
): number {
  const eid = factory.createStaticEntity(10);
  addShrineComponents(world, eid, x, y, spriteRef);
  return eid;
}

/** Создать дверь в ECS */
export function createDoorInEcs(
  factory: EntityFactory,
  world: World,
  x: number,
  y: number,
  locked: boolean,
  spriteRef: Graphics
): number {
  const eid = factory.createStaticEntity(15);
  addDoorComponents(world, eid, x, y, locked, spriteRef);
  return eid;
}

/** Создать барьер в ECS */
export function createBarrierInEcs(
  factory: EntityFactory,
  world: World,
  x: number,
  y: number,
  active: boolean,
  spriteRef: Graphics
): number {
  const eid = factory.createStaticEntity(10);
  addBarrierComponents(world, eid, x, y, active, spriteRef);
  return eid;
}

/** Создать алтарь в ECS */
export function createAltarInEcs(
  factory: EntityFactory,
  world: World,
  x: number,
  y: number,
  spriteRef: Graphics
): number {
  const eid = factory.createStaticEntity(10);
  addAltarComponents(world, eid, x, y, spriteRef);
  return eid;
}

/** Создать снаряд в ECS */
export function createProjectileInEcs(
  factory: EntityFactory,
  world: World,
  kind: ProjectileKind,
  x: number,
  y: number,
  vx: number,
  vy: number,
  dmg: number,
  life: number,
  spriteRef: Graphics
): number {
  const eid = factory.createProjectile(kind, x, y, vx, vy, dmg, life);
  addComponent(world, eid, Sprite);
  SpriteRegistry.push(spriteRef);
  Sprite.ref[eid] = SpriteRegistry.length;
  return eid;
}

/** Создать дроп в ECS */
export function createDropInEcs(
  factory: EntityFactory,
  world: World,
  kind: DropKind,
  x: number,
  y: number,
  spriteRef: Graphics
): number {
  const eid = factory.createDrop(kind, x, y);
  addComponent(world, eid, Sprite);
  SpriteRegistry.push(spriteRef);
  Sprite.ref[eid] = SpriteRegistry.length;
  return eid;
}

// ============================================================
// Вспомогательные функции
// ============================================================

import { addComponent, addComponents } from 'bitecs';
import {
  NPC,
  Chest,
  Pedestal,
  Shrine,
  Door,
  Barrier,
  Altar,
  poolAdd,
  StringPool,
  RenderLayer,
} from './ecs-components';

function addNpcComponents(world: World, eid: number, id: string, name: string, x: number, y: number, spriteRef: Graphics): void {
  addComponents(world, eid, NPC, Sprite);
  NPC.id[eid] = poolAdd(StringPool.npcIds, id);
  NPC.name[eid] = poolAdd(StringPool.npcNames, name);
  SpriteRegistry.push(spriteRef);
  Sprite.ref[eid] = SpriteRegistry.length;
  Position.x[eid] = x;
  Position.y[eid] = y;
}

function addChestComponents(world: World, eid: number, item: string, x: number, y: number, spriteRef: Graphics): void {
  addComponents(world, eid, Chest);
  addComponent(world, eid, Sprite);
  Chest.item[eid] = poolAdd(StringPool.chestItems, item);
  Chest.opened[eid] = 0;
  SpriteRegistry.push(spriteRef);
  Sprite.ref[eid] = SpriteRegistry.length;
  Position.x[eid] = x;
  Position.y[eid] = y;
}

function addPedestalComponents(world: World, eid: number, id: string, x: number, y: number, guardsLeft: number, spriteRef: Graphics): void {
  addComponents(world, eid, Pedestal);
  addComponent(world, eid, Sprite);
  Pedestal.id[eid] = poolAdd(StringPool.pedestalIds, id);
  Pedestal.taken[eid] = 0;
  Pedestal.guardsLeft[eid] = guardsLeft;
  Pedestal.guardsSpawned[eid] = 0;
  SpriteRegistry.push(spriteRef);
  Sprite.ref[eid] = SpriteRegistry.length;
  Position.x[eid] = x;
  Position.y[eid] = y;
}

function addShrineComponents(world: World, eid: number, x: number, y: number, spriteRef: Graphics): void {
  addComponents(world, eid, Shrine, Position);
  addComponent(world, eid, Sprite);
  Shrine.lit[eid] = 0;
  SpriteRegistry.push(spriteRef);
  Sprite.ref[eid] = SpriteRegistry.length;
  Position.x[eid] = x;
  Position.y[eid] = y;
}

function addDoorComponents(world: World, eid: number, x: number, y: number, locked: boolean, spriteRef: Graphics): void {
  addComponents(world, eid, Door);
  addComponent(world, eid, Sprite);
  Door.open[eid] = 0;
  Door.locked[eid] = locked ? 1 : 0;
  SpriteRegistry.push(spriteRef);
  Sprite.ref[eid] = SpriteRegistry.length;
  Position.x[eid] = x;
  Position.y[eid] = y;
}

function addBarrierComponents(world: World, eid: number, x: number, y: number, active: boolean, spriteRef: Graphics): void {
  addComponents(world, eid, Barrier);
  addComponent(world, eid, Sprite);
  Barrier.active[eid] = active ? 1 : 0;
  SpriteRegistry.push(spriteRef);
  Sprite.ref[eid] = SpriteRegistry.length;
  RenderLayer.value[eid] = 30; // barrier — средний слой
  Position.x[eid] = x;
  Position.y[eid] = y;
}

function addAltarComponents(world: World, eid: number, x: number, y: number, spriteRef: Graphics): void {
  addComponents(world, eid, Altar);
  addComponent(world, eid, Sprite);
  Altar.runes[eid] = 0;
  SpriteRegistry.push(spriteRef);
  Sprite.ref[eid] = SpriteRegistry.length;
  RenderLayer.value[eid] = 30; // altar — средний слой
  Position.x[eid] = x;
  Position.y[eid] = y;
}
