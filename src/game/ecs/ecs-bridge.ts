/* ecs-bridge.ts — мост между старым кодом и ECS */

import { type World } from 'bitecs';
import {
  createPlayerEntity,
  createEnemyEntity,
  createProjectileEntity,
  createDropEntity,
  createEntity,
} from './ecs-utils';
import {
  Position,
  Velocity,
  Health,
  Radius,
  Sprite,
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
  PhysicsBody,
  EnemyAI,
  Time,
  RenderLayer,
  Magnet,
  Taken,
  Flashing,
  StringPool,
  poolAdd,
  SpriteRegistry,
  PhysicsBodyRegistry,
  EnemyAIRegistry,
} from './ecs-components';
import type { EnemyKind, DropKind, ProjectileKind } from '../generators/types';
import type { Graphics } from 'pixi.js';
import type { PlanckWorld } from '../physics/planck-world';
import type { Cat } from '../physics/planck-world';
import { createBodyForEntity } from './ecs-systems';
import { addComponent, addComponents } from 'bitecs';

// ============================================================
// ECS Entity Bridge — создаёт ECS сущности из данных карты
// ============================================================

/** Создать игрока в ECS */
export function createPlayerInEcs(
  world: World,
  x: number,
  y: number,
  spriteRef: Graphics
): number {
  const eid = createPlayerEntity(world, x, y);
  addComponent(world, eid, Sprite);
  SpriteRegistry.push(spriteRef);
  Sprite.ref[eid] = SpriteRegistry.length;
  return eid;
}

/** Создать врага в ECS */
export function createEnemyInEcs(
  world: World,
  kind: EnemyKind,
  x: number,
  y: number,
  spriteRef: Graphics,
  planckWorld: PlanckWorld,
  category: number,
  mask: number
): number {
  const stats = getEnemyStats(kind);
  const eid = createEnemyEntity(world, kind, x, y, stats.hp, stats.r, stats.speed, stats.dmg);
  addComponent(world, eid, Sprite);
  SpriteRegistry.push(spriteRef);
  Sprite.ref[eid] = SpriteRegistry.length;
  
  // Create physics body
  createBodyForEntity(planckWorld, world, eid, stats.r, category, mask);
  
  return eid;
}

/** Создать NPC в ECS */
export function createNpcInEcs(
  world: World,
  id: string,
  name: string,
  x: number,
  y: number,
  spriteRef: Graphics
): number {
  const eid = createEntity(world, 30);
  addNpcComponents(world, eid, id, name, x, y, spriteRef);
  return eid;
}

/** Создать сундук в ECS */
export function createChestInEcs(
  world: World,
  x: number,
  y: number,
  item: string,
  spriteRef: Graphics
): number {
  const eid = createEntity(world, 20);
  addChestComponents(world, eid, item, x, y, spriteRef);
  return eid;
}

/** Создать пьедестал в ECS */
export function createPedestalInEcs(
  world: World,
  id: string,
  x: number,
  y: number,
  guardsLeft: number,
  spriteRef: Graphics
): number {
  const eid = createEntity(world, 10);
  addPedestalComponents(world, eid, id, x, y, guardsLeft, spriteRef);
  return eid;
}

/** Создать святилище в ECS */
export function createShrineInEcs(
  world: World,
  x: number,
  y: number,
  spriteRef: Graphics
): number {
  const eid = createEntity(world, 10);
  addShrineComponents(world, eid, x, y, spriteRef);
  return eid;
}

/** Создать дверь в ECS */
export function createDoorInEcs(
  world: World,
  x: number,
  y: number,
  locked: boolean,
  spriteRef: Graphics
): number {
  const eid = createEntity(world, 15);
  addDoorComponents(world, eid, x, y, locked, spriteRef);
  return eid;
}

/** Создать барьер в ECS */
export function createBarrierInEcs(
  world: World,
  x: number,
  y: number,
  active: boolean,
  spriteRef: Graphics
): number {
  const eid = createEntity(world, 10);
  addBarrierComponents(world, eid, x, y, active, spriteRef);
  return eid;
}

/** Создать алтарь в ECS */
export function createAltarInEcs(
  world: World,
  x: number,
  y: number,
  spriteRef: Graphics
): number {
  const eid = createEntity(world, 10);
  addAltarComponents(world, eid, x, y, spriteRef);
  return eid;
}

/** Создать снаряд в ECS */
export function createProjectileInEcs(
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
  const eid = createProjectileEntity(world, kind, x, y, vx, vy, dmg, life);
  addComponent(world, eid, Sprite);
  SpriteRegistry.push(spriteRef);
  Sprite.ref[eid] = SpriteRegistry.length;
  return eid;
}

/** Создать дроп в ECS */
export function createDropInEcs(
  world: World,
  kind: DropKind,
  x: number,
  y: number,
  spriteRef: Graphics
): number {
  const eid = createDropEntity(world, kind, x, y);
  addComponent(world, eid, Sprite);
  SpriteRegistry.push(spriteRef);
  Sprite.ref[eid] = SpriteRegistry.length;
  return eid;
}

// ============================================================
// Вспомогательные функции
// ============================================================

function getEnemyStats(kind: EnemyKind) {
  const stats: Record<string, { r: number; hp: number; speed: number; dmg: number }> = {
    draugr:  { r: 6, hp: 3, speed: 52, dmg: 1 },
    varg:    { r: 6, hp: 3, speed: 68, dmg: 1 },
    raven:   { r: 5, hp: 2, speed: 78, dmg: 1 },
    shroom:  { r: 5, hp: 3, speed: 40, dmg: 1 },
    crawler: { r: 6, hp: 2, speed: 56, dmg: 1 },
    frost:   { r: 7, hp: 4, speed: 48, dmg: 1 },
    reaper:  { r: 10, hp: 16, speed: 58, dmg: 1 },
    spider:  { r: 11, hp: 12, speed: 44, dmg: 1 },
    giant:   { r: 13, hp: 20, speed: 44, dmg: 2 },
    snake:   { r: 16, hp: 14, speed: 0,  dmg: 1 },
    ghost:   { r: 6, hp: 5, speed: 100, dmg: 1 },
  };
  return stats[kind] || { r: 5, hp: 1, speed: 50, dmg: 1 };
}

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
  addComponents(world, eid, Shrine);
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
  Position.x[eid] = x;
  Position.y[eid] = y;
}

function addAltarComponents(world: World, eid: number, x: number, y: number, spriteRef: Graphics): void {
  addComponents(world, eid, Altar);
  addComponent(world, eid, Sprite);
  Altar.runes[eid] = 0;
  SpriteRegistry.push(spriteRef);
  Sprite.ref[eid] = SpriteRegistry.length;
  Position.x[eid] = x;
  Position.y[eid] = y;
}
