/* physics-system.ts — интеграция с Planck.js */

import { query, hasComponent, addComponent, type World } from 'bitecs';
import { Vec2 } from 'planck-js';
import {
  Position,
  Velocity,
  Radius,
  PhysicsBody,
  PhysicsBodyRegistry,
} from '../ecs-components';

// ============================================================
// Callbacks для Planck.js collision
// ============================================================

export interface PhysicsCallbacks {
  /** Снаряд попал во врага */
  onProjectileHitEnemy?: (projEid: number, enemyEid: number) => void;
  /** Снаряд попал в игрока */
  onProjectileHitPlayer?: (projEid: number) => void;
  /** Враг коснулся игрока */
  onEnemyHitPlayer?: (enemyEid: number) => void;
  /** Снаряд попал в тайл */
  onProjectileHitTile?: (projEid: number) => void;
  /** Игрок подобрал дроп */
  onPlayerPickupDrop?: (dropEid: number) => void;
}

// ============================================================
// Управление физическими телами
// ============================================================

/** Получить Planck.js body из registry */
function getBody(eid: number): any {
  const pb = PhysicsBody[eid];
  if (!pb) return undefined;
  const idx = pb.body;
  return idx > 0 ? PhysicsBodyRegistry[idx - 1] : undefined;
}

/** Синхронизировать позицию из Position в Planck.js body */
export function syncPositionToBody(world: World): void {
  for (const eid of query(world, [Position, PhysicsBody])) {
    const pos = Position[eid];
    if (!pos) continue; // AoS элемент может быть undefined
    const body = getBody(eid);
    if (body) {
      body.setPosition({ x: pos.x, y: pos.y });
    }
  }
}

/** Синхронизировать Velocity из ECS в Planck.js body */
export function syncVelocityToBody(world: World, playerEid?: number): void {
  for (const eid of query(world, [Velocity, PhysicsBody])) {
    const vel = Velocity[eid];
    if (!vel) continue; // AoS элемент может быть undefined
    const body = getBody(eid);
    if (body) {
      body.setLinearVelocity(Vec2(vel.x, vel.y));
    }
  }
}

/** Синхронизировать позицию из Planck.js body в Position */
export function syncBodyToPosition(world: World, playerEid?: number): void {
  for (const eid of query(world, [Position, PhysicsBody])) {
    const pos = Position[eid];
    if (!pos) continue; // AoS элемент может быть undefined
    const body = getBody(eid);
    if (body) {
      const pos2 = body.getPosition();
      pos.x = pos2.x;
      pos.y = pos2.y;
    }
  }
}

/** Создать физическое тело для сущности (круг) — через PlanckWorld API */
export function createBodyForEntity(
  planckWorld: any, // PlanckWorld
  world: World,
  eid: number,
  radius: number,
  category: number,
  mask: number
): void {
  // Добавляем компонент PhysicsBody (если ещё не добавлен)
  addComponent(world, eid, PhysicsBody);
  PhysicsBody[eid] = { body: 0 }; // Инициализируем AoS-объект

  // Создаём физическое тело
  const pos = Position[eid];
  if (!pos) return; // AoS элемент может быть undefined
  const body = planckWorld.createEntityBody(pos.x, pos.y, radius, category, {});
  PhysicsBody[eid].body = PhysicsBodyRegistry.length + 1;
  PhysicsBodyRegistry.push(body);
}

/** Удалить физическое тело сущности */
export function destroyBodyForEntity(
  planckWorld: any,
  eid: number
): void {
  const idx = PhysicsBody[eid].body;
  if (idx > 0) {
    const body = PhysicsBodyRegistry[idx - 1];
    if (body) {
      planckWorld.destroyBody(body);
    }
    PhysicsBody[eid].body = 0;
  }
}

// ============================================================
// Collision detection helpers
// ============================================================

/** Проверить пересечение двух кругов */
export function circlesOverlap(
  x1: number, y1: number, r1: number,
  x2: number, y2: number, r2: number
): boolean {
  const dx = x1 - x2;
  const dy = y1 - y2;
  const minDist = r1 + r2;
  return (dx * dx + dy * dy) < (minDist * minDist);
}

/** Проверить пересечение сущности с другими */
export function checkEntityOverlap(
  world: World,
  eid: number,
  predicate: (otherEid: number) => boolean
): boolean {
  const pos = Position[eid];
  const rad = Radius[eid];
  if (!pos || !rad) return false;
  const ex = pos.x;
  const ey = pos.y;
  const er = rad.value;

  for (const otherEid of query(world, [Position, Radius])) {
    if (otherEid === eid) continue;
    const oPos = Position[otherEid];
    const oRad = Radius[otherEid];
    if (!oPos || !oRad) continue;

    if (circlesOverlap(ex, ey, er, oPos.x, oPos.y, oRad.value)) {
      if (predicate(otherEid)) {
        return true;
      }
    }
  }
  return false;
}

/** Найти все перекрывающиеся сущности */
export function findOverlappingEntities(
  world: World,
  eid: number,
  predicate: (otherEid: number) => boolean
): number[] {
  const pos = Position[eid];
  const rad = Radius[eid];
  if (!pos || !rad) return [];
  const ex = pos.x;
  const ey = pos.y;
  const er = rad.value;
  const results: number[] = [];

  for (const otherEid of query(world, [Position, Radius])) {
    if (otherEid === eid) continue;
    const oPos = Position[otherEid];
    const oRad = Radius[otherEid];
    if (!oPos || !oRad) continue;

    if (circlesOverlap(ex, ey, er, oPos.x, oPos.y, oRad.value)) {
      if (predicate(otherEid)) {
        results.push(otherEid);
      }
    }
  }
  return results;
}

// ============================================================
// Raycast / Line of Sight
// ============================================================

/** Проверить линию видимости между двумя точками */
export function hasLineOfSight(
  planckWorld: any,
  x1: number, y1: number,
  x2: number, y2: number,
  callback: any // Planck.js raycast callback
): boolean {
  let hit = false;
  planckWorld.raycast(callback, { x: x1, y: y1 }, { x: x2, y: y2 });
  return !hit;
}
