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
} from './ecs-components';
import type { EnemyKind, DropKind, ProjectileKind } from '../generators/types';
import type { Graphics } from 'pixi.js';
import type { PlanckWorld } from '../system/planck-world';
import type { Cat } from '../system/planck-world';
import { createBodyForEntity } from './ecs-systems';

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
  Sprite[eid] = { ref: spriteRef };
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
  Sprite[eid] = { ref: spriteRef };
  
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
  Sprite[eid] = { ref: spriteRef };
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
  Sprite[eid] = { ref: spriteRef };
  return eid;
}

// ============================================================
// Вспомогательные функции
// ============================================================

import { addComponents } from 'bitecs';

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
  NPC[eid] = { id, name };
  Sprite[eid] = { ref: spriteRef };
  Position.x[eid] = x;
  Position.y[eid] = y;
}

function addChestComponents(world: World, eid: number, item: string, x: number, y: number, spriteRef: Graphics): void {
  addComponents(world, eid, Chest, Sprite);
  Chest[eid] = { item, opened: false };
  Sprite[eid] = { ref: spriteRef };
  Position.x[eid] = x;
  Position.y[eid] = y;
}

function addPedestalComponents(world: World, eid: number, id: string, x: number, y: number, guardsLeft: number, spriteRef: Graphics): void {
  addComponents(world, eid, Pedestal, Sprite);
  Pedestal[eid] = { id, taken: false, guardsLeft, guardsSpawned: false };
  Sprite[eid] = { ref: spriteRef };
  Position.x[eid] = x;
  Position.y[eid] = y;
}

function addShrineComponents(world: World, eid: number, x: number, y: number, spriteRef: Graphics): void {
  addComponents(world, eid, Shrine, Sprite);
  Shrine[eid] = { lit: false };
  Sprite[eid] = { ref: spriteRef };
  Position.x[eid] = x;
  Position.y[eid] = y;
}

function addDoorComponents(world: World, eid: number, x: number, y: number, locked: boolean, spriteRef: Graphics): void {
  addComponents(world, eid, Door, Sprite);
  Door[eid] = { open: 0, locked };
  Sprite[eid] = { ref: spriteRef };
  Position.x[eid] = x;
  Position.y[eid] = y;
}

function addBarrierComponents(world: World, eid: number, x: number, y: number, active: boolean, spriteRef: Graphics): void {
  addComponents(world, eid, Barrier, Sprite);
  Barrier[eid] = { active };
  Sprite[eid] = { ref: spriteRef };
  Position.x[eid] = x;
  Position.y[eid] = y;
}

function addAltarComponents(world: World, eid: number, x: number, y: number, spriteRef: Graphics): void {
  addComponents(world, eid, Altar, Sprite);
  Altar[eid] = { runes: 0 };
  Sprite[eid] = { ref: spriteRef };
  Position.x[eid] = x;
  Position.y[eid] = y;
}
