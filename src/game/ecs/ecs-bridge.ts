/* ecs-bridge.ts — мост между старым кодом и ECS

   Фабрика (EntityFactory) создаёт чистые ECS-сущности без графики и физики.
   Этот модуль координирует: вызов Фабрики → навешивание Renderable → навешивание PhysicsBody.

   Этап 4: удалена зависимость от PixiJS (Graphics, SpriteRegistry).
*/

import { type World, query } from 'bitecs';
import {
  Position,
  Renderable,
  PhysicsBodyRegistry,
  PhysicsBody,
} from './ecs-components';
import { type EntityFactory } from './entity-factory';
import type { EnemyKind, DropKind, ProjectileKind } from '../generators/types';
import type { PlanckWorld } from '../physics/planck-world';
import type { Cat } from '../physics/planck-world';
import { createBodyForEntity } from './ecs-systems';
import { ENEMY_STATS } from '../entities';

// ============================================================
// Teardown — корректное уничтожение ресурсов при смене карты
// ============================================================

/**
 * Уничтожить все физические тела в мире.
 * Вызывается ПЕРЕД clearWorld() — чтобы компоненты ещё были валидными.
 *
 * Этап 4: удалена логика уничтожения PixiJS спрайтов.
 *
 * @param world  — ECS мир, сущности которого нужно очистить
 * @param pw     — PlanckWorld для уничтожения физических тел
 */
export function teardownWorld(world: World, pw: PlanckWorld): void {
  // 1. Уничтожить физические тела всех сущностей
  for (const eid of query(world, [PhysicsBody])) {
    const pbIdx = PhysicsBody.body[eid];
    if (pbIdx > 0 && pbIdx <= PhysicsBodyRegistry.length) {
      const body = PhysicsBodyRegistry[pbIdx - 1];
      if (body) {
        pw.destroyBody(body);
        PhysicsBody.body[eid] = 0;
        PhysicsBodyRegistry[pbIdx - 1] = null as any;
      }
    }
    PhysicsBody.body[eid] = 0;
  }

  // 2. Очистить PlanckWorld (tile bodies)
  try { pw.clear(); } catch {}
}

// ============================================================
// ECS Entity Bridge — создаёт ECS сущности из данных карты
// ============================================================

/** Создать игрока в ECS */
export function createPlayerInEcs(
  factory: EntityFactory,
  world: World,
  x: number,
  y: number,
  planckWorld: PlanckWorld,
  category: number,
  mask: number
): number {
  const eid = factory.createPlayer(x, y);
  addRenderable(world, eid, 0, 8, 12);
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
  planckWorld: PlanckWorld,
  category: number,
  mask: number
): number {
  const stats = ENEMY_STATS[kind];
  const eid = factory.createEnemy(kind, x, y, stats.hp, stats.r, stats.speed, stats.dmg);
  addRenderable(world, eid, 0, stats.r * 2, stats.r * 2);
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
  y: number
): number {
  const eid = factory.createStaticEntity(10);
  addNpcComponents(world, eid, id, name, x, y);
  return eid;
}

/** Создать сундук в ECS */
export function createChestInEcs(
  factory: EntityFactory,
  world: World,
  x: number,
  y: number,
  item: string
): number {
  const eid = factory.createStaticEntity(20);
  addChestComponents(world, eid, item, x, y);
  return eid;
}

/** Создать пьедестал в ECS */
export function createPedestalInEcs(
  factory: EntityFactory,
  world: World,
  id: string,
  x: number,
  y: number,
  guardsLeft: number
): number {
  const eid = factory.createStaticEntity(10);
  addPedestalComponents(world, eid, id, x, y, guardsLeft);
  return eid;
}

/** Создать святилище в ECS */
export function createShrineInEcs(
  factory: EntityFactory,
  world: World,
  x: number,
  y: number
): number {
  const eid = factory.createStaticEntity(10);
  addShrineComponents(world, eid, x, y);
  return eid;
}

/** Создать дверь в ECS */
export function createDoorInEcs(
  factory: EntityFactory,
  world: World,
  x: number,
  y: number,
  locked: boolean
): number {
  const eid = factory.createStaticEntity(15);
  addDoorComponents(world, eid, x, y, locked);
  return eid;
}

/** Создать барьер в ECS */
export function createBarrierInEcs(
  factory: EntityFactory,
  world: World,
  x: number,
  y: number,
  active: boolean
): number {
  const eid = factory.createStaticEntity(10);
  addBarrierComponents(world, eid, x, y, active);
  return eid;
}

/** Создать алтарь в ECS */
export function createAltarInEcs(
  factory: EntityFactory,
  world: World,
  x: number,
  y: number
): number {
  const eid = factory.createStaticEntity(10);
  addAltarComponents(world, eid, x, y);
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
  life: number
): number {
  const eid = factory.createProjectile(kind, x, y, vx, vy, dmg, life);
  addRenderable(world, eid, 0, 6, 6);
  return eid;
}

/** Создать дроп в ECS */
export function createDropInEcs(
  factory: EntityFactory,
  world: World,
  kind: DropKind,
  x: number,
  y: number
): number {
  const eid = factory.createDrop(kind, x, y);
  addRenderable(world, eid, 0, 6, 6);
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

/** Добавить компонент Renderable с заданными параметрами */
function addRenderable(
  world: World,
  eid: number,
  textureId: number,
  width: number,
  height: number
): void {
  addComponent(world, eid, Renderable);
  Renderable.textureId[eid] = textureId;
  Renderable.width[eid] = width;
  Renderable.height[eid] = height;
  Renderable.visible[eid] = 1;
  Position.x[eid] = 0;
  Position.y[eid] = 0;
}

function addNpcComponents(world: World, eid: number, id: string, name: string, x: number, y: number): void {
  addComponents(world, eid, NPC, Renderable);
  NPC.id[eid] = poolAdd(StringPool.npcIds, id);
  NPC.name[eid] = poolAdd(StringPool.npcNames, name);
  Renderable.textureId[eid] = 0;
  Renderable.width[eid] = 8;
  Renderable.height[eid] = 12;
  Position.x[eid] = x;
  Position.y[eid] = y;
}

function addChestComponents(world: World, eid: number, item: string, x: number, y: number): void {
  addComponents(world, eid, Chest);
  addComponent(world, eid, Renderable);
  Chest.item[eid] = poolAdd(StringPool.chestItems, item);
  Chest.opened[eid] = 0;
  Renderable.textureId[eid] = 0;
  Renderable.width[eid] = 12;
  Renderable.height[eid] = 9;
  Position.x[eid] = x;
  Position.y[eid] = y;
}

function addPedestalComponents(world: World, eid: number, id: string, x: number, y: number, guardsLeft: number): void {
  addComponents(world, eid, Pedestal);
  addComponent(world, eid, Renderable);
  Pedestal.id[eid] = poolAdd(StringPool.pedestalIds, id);
  Pedestal.taken[eid] = 0;
  Pedestal.guardsLeft[eid] = guardsLeft;
  Pedestal.guardsSpawned[eid] = 0;
  Renderable.textureId[eid] = 0;
  Renderable.width[eid] = 10;
  Renderable.height[eid] = 14;
  Position.x[eid] = x;
  Position.y[eid] = y;
}

function addShrineComponents(world: World, eid: number, x: number, y: number): void {
  addComponents(world, eid, Shrine, Position);
  addComponent(world, eid, Renderable);
  Shrine.lit[eid] = 0;
  Renderable.textureId[eid] = 0;
  Renderable.width[eid] = 10;
  Renderable.height[eid] = 14;
  Position.x[eid] = x;
  Position.y[eid] = y;
}

function addDoorComponents(world: World, eid: number, x: number, y: number, locked: boolean): void {
  addComponents(world, eid, Door);
  addComponent(world, eid, Renderable);
  Door.open[eid] = 0;
  Door.locked[eid] = locked ? 1 : 0;
  Renderable.textureId[eid] = 0;
  Renderable.width[eid] = 10;
  Renderable.height[eid] = 16;
  Position.x[eid] = x;
  Position.y[eid] = y;
}

function addBarrierComponents(world: World, eid: number, x: number, y: number, active: boolean): void {
  addComponents(world, eid, Barrier);
  addComponent(world, eid, Renderable);
  Barrier.active[eid] = active ? 1 : 0;
  Renderable.textureId[eid] = 0;
  Renderable.width[eid] = 16;
  Renderable.height[eid] = 16;
  RenderLayer.value[eid] = 30; // barrier — средний слой
  Position.x[eid] = x;
  Position.y[eid] = y;
}

function addAltarComponents(world: World, eid: number, x: number, y: number): void {
  addComponents(world, eid, Altar);
  addComponent(world, eid, Renderable);
  Altar.runes[eid] = 0;
  Renderable.textureId[eid] = 0;
  Renderable.width[eid] = 8;
  Renderable.height[eid] = 15;
  RenderLayer.value[eid] = 30; // altar — средний слой
  Position.x[eid] = x;
  Position.y[eid] = y;
}
