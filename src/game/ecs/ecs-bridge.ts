/* ecs-bridge.ts — мост между старым кодом и ECS

   Фабрика (EntityFactory) создаёт чистые ECS-сущности без графики и физики.
   Этот модуль координирует: вызов Фабрики → навешивание Sprite → навешивание PhysicsBody.
*/

import { type World, query } from 'bitecs';
import {
  Sprite,
  PhysicsBodyRegistry,
  PhysicsBody,
} from './ecs-components';
import { type EntityFactory } from './entity-factory';
import type { EnemyKind, DropKind, ProjectileKind } from '../generators/types';
import type { PlanckWorld } from '../physics/planck-world';
import type { Cat } from '../physics/planck-world';
import type { GraphicsHandle } from '../renderer/IRenderer';
import { createBodyForEntity } from './ecs-systems';
import { ENEMY_STATS } from '../entities';
import { getRenderer } from '../renderer/RendererFactory';

// ============================================================
// Teardown — корректное уничтожение ресурсов при смене карты
// ============================================================

/**
 * Уничтожить все спрайты и физические тела в мире.
 * Вызывается ПЕРЕД clearWorld() — чтобы компоненты ещё были валидными.
 *
 * @param world    — ECS мир, сущности которого нужно очистить
 * @param pw       — PlanckWorld для уничтожения физических тел
 * @param preservePlayerG — спрайт игрока, который НЕ нужно уничтожать (GraphicsHandle)
 */
export function teardownWorld(
  world: World,
  pw: PlanckWorld,
  preservePlayerG?: number
): void {
  const renderer = getRenderer();

  // 1. Уничтожить спрайты и физические тела всех сущностей
  for (const eid of query(world, [PhysicsBody])) {
    // Уничтожить спрайт (GraphicsHandle) — хранится напрямую в Sprite.ref
    const spriteRef = Sprite[eid].ref;
    if (spriteRef && spriteRef !== preservePlayerG) {
      renderer.destroyGraphics(spriteRef as GraphicsHandle);
    }
    Sprite[eid] = { ref: 0 };

    // Уничтожить физическое тело
    const pbIdx = PhysicsBody[eid].body;
    if (pbIdx > 0 && pbIdx <= PhysicsBodyRegistry.length) {
      const body = PhysicsBodyRegistry[pbIdx - 1];
      if (body) {
        pw.destroyBody(body);
        PhysicsBody[eid] = { body: 0 };
        PhysicsBodyRegistry[pbIdx - 1] = null as any;
      }
    }
    PhysicsBody[eid] = { body: 0 };
  }

  // 2. Уничтожить спрайты сущностей БЕЗ физического тела (NPC, сундуки, пьедесталы и т.д.)
  for (const eid of query(world, [Sprite])) {
    const spriteRef = Sprite[eid].ref;
    if (spriteRef && spriteRef !== preservePlayerG) {
      renderer.destroyGraphics(spriteRef as GraphicsHandle);
    }
    Sprite[eid] = { ref: 0 };
  }

  // 3. Очистить PlanckWorld (tile bodies)
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
  spriteRef: number,
  planckWorld: PlanckWorld,
  category: number,
  mask: number
): number {
  const eid = factory.createPlayer(x, y);
  addComponent(world, eid, Sprite);
  Sprite[eid] = { ref: spriteRef };
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
  spriteRef: number,
  planckWorld: PlanckWorld,
  category: number,
  mask: number
): number {
  const stats = ENEMY_STATS[kind];
  const eid = factory.createEnemy(kind, x, y, stats.hp, stats.r, stats.speed, stats.dmg);
  addComponent(world, eid, Sprite);
  Sprite[eid] = { ref: spriteRef };
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
  _spriteRef: number
): number {
  const eid = factory.createStaticEntity(10);
  addNpcComponents(world, eid, id, name, x, y, _spriteRef);
  return eid;
}

/** Создать сундук в ECS */
export function createChestInEcs(
  factory: EntityFactory,
  world: World,
  x: number,
  y: number,
  item: string,
  _spriteRef: number
): number {
  const eid = factory.createStaticEntity(20);
  addChestComponents(world, eid, item, x, y, _spriteRef);
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
  _spriteRef: number
): number {
  const eid = factory.createStaticEntity(10);
  addPedestalComponents(world, eid, id, x, y, guardsLeft, _spriteRef);
  return eid;
}

/** Создать святилище в ECS */
export function createShrineInEcs(
  factory: EntityFactory,
  world: World,
  x: number,
  y: number,
  _spriteRef: number
): number {
  const eid = factory.createStaticEntity(10);
  addShrineComponents(world, eid, x, y, _spriteRef);
  return eid;
}

/** Создать дверь в ECS */
export function createDoorInEcs(
  factory: EntityFactory,
  world: World,
  x: number,
  y: number,
  locked: boolean,
  _spriteRef: number
): number {
  const eid = factory.createStaticEntity(15);
  addDoorComponents(world, eid, x, y, locked, _spriteRef);
  return eid;
}

/** Создать барьер в ECS */
export function createBarrierInEcs(
  factory: EntityFactory,
  world: World,
  x: number,
  y: number,
  active: boolean,
  _spriteRef: number
): number {
  const eid = factory.createStaticEntity(10);
  addBarrierComponents(world, eid, x, y, active, _spriteRef);
  return eid;
}

/** Создать алтарь в ECS */
export function createAltarInEcs(
  factory: EntityFactory,
  world: World,
  x: number,
  y: number,
  _spriteRef: number
): number {
  const eid = factory.createStaticEntity(10);
  addAltarComponents(world, eid, x, y, _spriteRef);
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
  spriteRef: number
): number {
  const eid = factory.createProjectile(kind, x, y, vx, vy, dmg, life);
  addComponent(world, eid, Sprite);
  Sprite[eid] = { ref: spriteRef };
  return eid;
}

/** Создать дроп в ECS */
export function createDropInEcs(
  factory: EntityFactory,
  world: World,
  kind: DropKind,
  x: number,
  y: number,
  spriteRef: number
): number {
  const eid = factory.createDrop(kind, x, y);
  addComponent(world, eid, Sprite);
  Sprite[eid] = { ref: spriteRef };
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
  Position,
  RenderLayer,
} from './ecs-components';

function addNpcComponents(world: World, eid: number, id: string, name: string, x: number, y: number, spriteRef: number): void {
  addComponents(world, eid, [NPC, Sprite]);
  NPC[eid] = { id: poolAdd(StringPool.npcIds, id), name: poolAdd(StringPool.npcNames, name) };
  Sprite[eid] = { ref: spriteRef };
  Position[eid].x = x;
  Position[eid].y = y;
}

function addChestComponents(world: World, eid: number, item: string, x: number, y: number, spriteRef: number): void {
  addComponents(world, eid, [Chest, Sprite]);
  Chest[eid] = { item: poolAdd(StringPool.chestItems, item), opened: 0 };
  Sprite[eid] = { ref: spriteRef };
  Position[eid].x = x;
  Position[eid].y = y;
}

function addPedestalComponents(world: World, eid: number, id: string, x: number, y: number, guardsLeft: number, spriteRef: number): void {
  addComponents(world, eid, [Pedestal, Sprite]);
  Pedestal[eid] = { id: poolAdd(StringPool.pedestalIds, id), taken: 0, guardsLeft, guardsSpawned: 0 };
  Sprite[eid] = { ref: spriteRef };
  Position[eid].x = x;
  Position[eid].y = y;
}

function addShrineComponents(world: World, eid: number, x: number, y: number, spriteRef: number): void {
  addComponents(world, eid, [Shrine, Sprite]);
  Shrine[eid] = { lit: 0 };
  Sprite[eid] = { ref: spriteRef };
  Position[eid].x = x;
  Position[eid].y = y;
}

function addDoorComponents(world: World, eid: number, x: number, y: number, locked: boolean, spriteRef: number): void {
  addComponents(world, eid, [Door, Sprite]);
  Door[eid] = { open: 0, locked: locked ? 1 : 0 };
  Sprite[eid] = { ref: spriteRef };
  Position[eid].x = x;
  Position[eid].y = y;
}

function addBarrierComponents(world: World, eid: number, x: number, y: number, active: boolean, spriteRef: number): void {
  addComponents(world, eid, [Barrier, Sprite]);
  Barrier[eid] = { active: active ? 1 : 0 };
  Sprite[eid] = { ref: spriteRef };
  RenderLayer[eid].value = 30; // barrier — средний слой
  Position[eid].x = x;
  Position[eid].y = y;
}

function addAltarComponents(world: World, eid: number, x: number, y: number, spriteRef: number): void {
  addComponents(world, eid, [Altar, Sprite]);
  Altar[eid] = { runes: 0 };
  Sprite[eid] = { ref: spriteRef };
  RenderLayer[eid].value = 30; // altar — средний слой
  Position[eid].x = x;
  Position[eid].y = y;
}
